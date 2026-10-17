import { Hono } from 'hono';
import type { Context } from 'hono';
import type { JWTVerifyGetKey } from 'jose';
import { AppError,ValidationError,errorResponse } from '../../../packages/core/src/errors';
import { normalizeDomain } from '../../../packages/core/src/domain';
import { normalizeLocation,resolveSources } from '../../../packages/core/src/sources';
import { providerIds,providerNames } from '../../../packages/core/src/types';
import type { CollectionMethod,Location,ProviderId } from '../../../packages/core/src/types';
import { neonAuthBaseUrl,verifyNeonToken } from '../../../packages/auth/src/index';
import type { NeonUser } from '../../../packages/auth/src/index';
import { billingGateway } from '../../../packages/billing/src/stripe';
import type { AdminDB } from './admin';

/** Customer portal API, served at /api/app. Every route needs a Neon Auth JWT (Authorization: Bearer) and acts on one account the
 * user belongs to: their only one, or the one named by the x-account-id header. A user's first request creates their account. */
type Row=Record<string,unknown>;
export type PortalEnv={DB:AdminDB;DATABASE_NEON_AUTH_BASE_URL?:string;NEON_AUTH_BASE_URL?:string;/** Tests inject a local key set. */NEON_AUTH_JWKS?:JWTVerifyGetKey}&Record<string,unknown>;
export interface Member { userId:string; email:string; name:string|null }
export interface AccountRef { id:string; name:string; role:string }
type Vars={requestId:string;user:Member;account:AccountRef};
export type PortalContext=Context<{Bindings:PortalEnv;Variables:Vars}>;

export const all=async<T=Row>(db:AdminDB,sql:string,...values:unknown[])=>(await db.prepare(sql).bind(...values).all<T>()).results;
export const one=<T=Row>(db:AdminDB,sql:string,...values:unknown[])=>db.prepare(sql).bind(...values).first<T>();
export const exec=(db:AdminDB,sql:string,...values:unknown[])=>db.prepare(sql).bind(...values).run();
const now=()=>new Date().toISOString();
export const body=async<T>(c:PortalContext)=>{try{return await c.req.json<T>()}catch{throw new ValidationError('Request body must be JSON.')}};
const parseJson=<T>(text:unknown,fallback:T):T=>{try{return text?JSON.parse(String(text)) as T:fallback}catch{return fallback}};

/** Links the Neon Auth identity to a users row: by auth id, else by verified email (claiming a pre-created row), else a new row. */
async function linkUser(db:AdminDB,auth:NeonUser):Promise<Member>{
  const linked=await one<{id:string;name:string|null}>(db,'SELECT id,name FROM users WHERE auth_id=?',auth.id);
  if(linked){await exec(db,'UPDATE users SET email=?,name=COALESCE(?,name),email_verified_at=COALESCE(email_verified_at,?) WHERE id=?',auth.email,auth.name,auth.emailVerified?now():null,linked.id);return{userId:linked.id,email:auth.email,name:auth.name??linked.name}}
  const byEmail=await one<{id:string;auth_id:string|null;name:string|null}>(db,'SELECT id,auth_id,name FROM users WHERE email=?',auth.email);
  if(byEmail){
    // Claiming an existing row (and its memberships) by email is safe only once Neon Auth has verified the address belongs to this user.
    if(byEmail.auth_id||!auth.emailVerified)throw new AppError('AUTHORIZATION_ERROR','Verify your email address to continue.',403);
    await exec(db,'UPDATE users SET auth_id=?,name=COALESCE(?,name),email_verified_at=COALESCE(email_verified_at,?) WHERE id=? AND auth_id IS NULL',auth.id,auth.name,now(),byEmail.id);
    return{userId:byEmail.id,email:auth.email,name:auth.name??byEmail.name};
  }
  const id=`usr_${auth.id}`;
  await exec(db,'INSERT INTO users (id,auth_id,email,name,email_verified_at,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT (id) DO NOTHING',id,auth.id,auth.email,auth.name,auth.emailVerified?now():null,now());
  return{userId:id,email:auth.email,name:auth.name};
}

export const memberships=(db:AdminDB,userId:string)=>all<AccountRef>(db,"SELECT a.id,a.name,au.role FROM account_users au JOIN accounts a ON a.id=au.account_id WHERE au.user_id=? ORDER BY CASE au.role WHEN 'owner' THEN 0 ELSE 1 END,a.created_at",userId);

/** First sign-in: one account per user, with a deterministic id so concurrent first requests cannot create two. */
async function ensureAccount(db:AdminDB,user:Member):Promise<AccountRef[]>{
  const existing=await memberships(db,user.userId);if(existing.length)return existing;
  const id=`acct_${user.userId.replace(/^usr_/,'')}`;const name=user.name?`${user.name}'s workspace`:`${user.email.split('@')[1]??'My'} workspace`;
  await exec(db,'INSERT INTO accounts (id,name,created_at) VALUES (?,?,?) ON CONFLICT (id) DO NOTHING',id,name.slice(0,80),now());
  await exec(db,"INSERT INTO account_users (account_id,user_id,role) VALUES (?,?,'owner') ON CONFLICT DO NOTHING",id,user.userId);
  return memberships(db,user.userId);
}

const portal=new Hono<{Bindings:PortalEnv;Variables:Vars}>();
portal.use('*',async(c,next)=>{c.set('requestId',c.req.header('x-request-id')??crypto.randomUUID());c.header('cache-control','no-store');
  const token=/^Bearer\s+(.+)$/i.exec(c.req.header('authorization')??'')?.[1];
  if(!token)throw new AppError('AUTHENTICATION_ERROR','Sign in to continue.',401);
  const baseUrl=neonAuthBaseUrl(c.env);const auth=await verifyNeonToken(token,baseUrl,c.env.NEON_AUTH_JWKS);
  const user=await linkUser(c.env.DB,auth);const accounts=await ensureAccount(c.env.DB,user);
  const wanted=c.req.header('x-account-id');const account=wanted?accounts.find(a=>a.id===wanted):accounts[0];
  if(!account)throw new AppError('AUTHORIZATION_ERROR','You do not have access to this workspace.',403);
  c.set('user',user);c.set('account',account);await next()});
portal.onError((error,c)=>{const status=error instanceof AppError?error.status:500;if(status>=500)console.error(JSON.stringify({level:'error',event:'portal_error',path:c.req.path,message:error.message}));return c.json(errorResponse(error,c.get('requestId')??crypto.randomUUID()),status as 400)});

// --- Plan, subscription and limits ---
export interface PlanLimits { id:string; name:string; monthlyPrice:number; maxQueries:number; allowedProviders:ProviderId[]; addonUnitPrice:number|null; runsPerPeriod:number; checksPerPeriod:number }
export async function planFor(db:AdminDB,accountId:string){
  const sub=await one<{id:string;plan_id:string;status:string;period_start:string|null;period_end:string|null;cancel_at_period_end:number}>(db,"SELECT id,plan_id,status,period_start,period_end,cancel_at_period_end FROM subscriptions WHERE account_id=? AND stripe_subscription_id IS NOT NULL ORDER BY updated_at DESC LIMIT 1",accountId);
  const planId=sub?.plan_id??'starter';
  const p=await one<{id:string;name:string;monthly_price:number;max_queries:number;allowed_providers:string;addon_unit_price:number|null;runs_per_period:number;checks_per_period:number}>(db,'SELECT id,name,monthly_price,max_queries,allowed_providers,addon_unit_price,runs_per_period,checks_per_period FROM plans WHERE id=?',planId);
  if(!p)throw new AppError('CONFIGURATION_ERROR','No plan is configured.',503);
  const controls=await one<{status:string;max_queries_override:number|null;max_checks_override:number|null}>(db,'SELECT status,max_queries_override,max_checks_override FROM account_controls WHERE account_id=?',accountId);
  const plan:PlanLimits={id:p.id,name:p.name,monthlyPrice:p.monthly_price,maxQueries:controls?.max_queries_override??p.max_queries,allowedProviders:parseJson(p.allowed_providers,[] as ProviderId[]),addonUnitPrice:p.addon_unit_price,runsPerPeriod:p.runs_per_period,checksPerPeriod:controls?.max_checks_override??p.checks_per_period};
  const subscription=sub?{status:sub.status,periodStart:sub.period_start,periodEnd:sub.period_end,cancelAtPeriodEnd:Boolean(sub.cancel_at_period_end)}:null;
  return{plan,subscription,subscriptionId:sub?.id??null,entitled:sub?.status==='active'||sub?.status==='trialing',paused:controls?.status==='paused'};
}
/** Runs started and answer checks queued since `periodStart`. A check counts once it is queued, so a run can't start that would overrun the cap. */
export async function periodUsage(db:AdminDB,accountId:string,periodStart:string){const row=await one<{runs:number;checks:number}>(db,'SELECT COUNT(DISTINCT r.id) runs,COUNT(q.id) checks FROM runs r LEFT JOIN run_queries q ON q.run_id=r.id WHERE r.account_id=? AND r.created_at>=?',accountId,periodStart);return{runs:row?.runs??0,checks:row?.checks??0}}

portal.get('/me',async c=>{const {user,account}=c.var;const accounts=await memberships(c.env.DB,user.userId);
  const settings=await one<{notify_run:number;notify_drop:number}>(c.env.DB,'SELECT notify_run,notify_drop FROM accounts WHERE id=?',account.id);
  return c.json({success:true,user:{email:user.email,name:user.name},account:{...account,notifyRun:Boolean(settings?.notify_run),notifyDrop:Boolean(settings?.notify_drop)},accounts,...await planFor(c.env.DB,account.id)})});

portal.patch('/account',async c=>{const input=await body<{name?:string;notifyRun?:boolean;notifyDrop?:boolean}>(c);const {account}=c.var;
  if(account.role!=='owner'&&account.role!=='admin')throw new AppError('AUTHORIZATION_ERROR','Only workspace owners can change these settings.',403);
  if(input.name!==undefined){const name=String(input.name).trim();if(!name||name.length>80)throw new ValidationError('Workspace name must be 1–80 characters.');await exec(c.env.DB,'UPDATE accounts SET name=? WHERE id=?',name,account.id)}
  for(const [key,column] of [['notifyRun','notify_run'],['notifyDrop','notify_drop']] as const)if(typeof input[key]==='boolean')await exec(c.env.DB,`UPDATE accounts SET ${column}=? WHERE id=?`,input[key]?1:0,account.id);
  return c.json({success:true})});

// --- Project (one per workspace during the beta) ---
export type Selection=Partial<Record<ProviderId,CollectionMethod[]>>;
export interface ProjectView { id:string; name:string; primaryDomain:string; alternateDomains:string[]; brands:string[]; selection:Selection; location:Location; frequency:'manual'|'monthly'; lastRunAt:string|null; nextRunAt:string|null }
export async function loadProject(db:AdminDB,accountId:string):Promise<ProjectView|null>{
  const p=await one<{id:string;name:string;primary_domain:string;source_methods:string;location:string;frequency:string;brands:string;last_run_at:string|null;next_run_at:string|null}>(db,'SELECT id,name,primary_domain,source_methods,location,frequency,brands,last_run_at,next_run_at FROM projects WHERE account_id=? ORDER BY created_at LIMIT 1',accountId);
  if(!p)return null;
  const domains=await all<{domain:string}>(db,"SELECT domain FROM project_domains WHERE project_id=? AND type='alternate' ORDER BY domain",p.id);
  return{id:p.id,name:p.name,primaryDomain:p.primary_domain,alternateDomains:domains.map(d=>d.domain),brands:parseJson(p.brands,[] as string[]),selection:parseJson(p.source_methods,{} as Selection),location:parseJson(p.location,{country:'US',language:'en'}),frequency:p.frequency==='monthly'?'monthly':'manual',lastRunAt:p.last_run_at,nextRunAt:p.next_run_at};
}
const list=(value:unknown,max:number,label:string)=>{const items=(Array.isArray(value)?value:String(value??'').split(',')).map(v=>String(v).trim()).filter(Boolean);if(items.length>max)throw new ValidationError(`Add up to ${max} ${label}.`);return[...new Set(items)]};
const addMonth=(iso:string)=>{const d=new Date(iso);d.setUTCMonth(d.getUTCMonth()+1);return d.toISOString()};

portal.get('/project',async c=>c.json({success:true,project:await loadProject(c.env.DB,c.var.account.id)}));
portal.put('/project',async c=>{const input=await body<{name?:string;primaryDomain?:string;alternateDomains?:unknown;brands?:unknown;selection?:Selection;location?:Partial<Location>;frequency?:string}>(c);const db=c.env.DB;const {account}=c.var;
  const primaryDomain=normalizeDomain(String(input.primaryDomain??''));
  const alternateDomains=list(input.alternateDomains,10,'alternate domains').map(normalizeDomain).filter(d=>d!==primaryDomain);
  const brands=list(input.brands,10,'brand names');if(brands.some(b=>b.length>60))throw new ValidationError('Brand names must be 60 characters or fewer.');
  const name=String(input.name??'').trim()||primaryDomain;if(name.length>80)throw new ValidationError('Project name must be 80 characters or fewer.');
  const raw=input.selection??{};const selection=Object.fromEntries(providerIds.filter(id=>Array.isArray(raw[id])&&raw[id]!.length).map(id=>[id,[...new Set(raw[id])]])) as Selection;
  const providers=Object.keys(selection) as ProviderId[];resolveSources({providers,methods:selection});
  const {plan}=await planFor(db,account.id);const blocked=providers.find(p=>!plan.allowedProviders.includes(p));if(blocked)throw new ValidationError(`${providerNames[blocked]} is not included in your plan.`);
  const location=normalizeLocation(input.location);const frequency=input.frequency==='monthly'?'monthly':'manual';
  const existing=await loadProject(db,account.id);const id=existing?.id??`prj_${crypto.randomUUID()}`;
  const nextRunAt=frequency==='monthly'?(existing?.nextRunAt??addMonth(existing?.lastRunAt??now())):null;
  if(existing)await exec(db,'UPDATE projects SET name=?,primary_domain=?,providers=?,source_methods=?,location=?,frequency=?,brands=?,next_run_at=? WHERE id=?',name,primaryDomain,JSON.stringify(providers),JSON.stringify(selection),JSON.stringify(location),frequency,JSON.stringify(brands),nextRunAt,id);
  else await exec(db,'INSERT INTO projects (id,account_id,name,primary_domain,providers,source_methods,location,frequency,brands,next_run_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',id,account.id,name,primaryDomain,JSON.stringify(providers),JSON.stringify(selection),JSON.stringify(location),frequency,JSON.stringify(brands),nextRunAt,now());
  await exec(db,'DELETE FROM project_domains WHERE project_id=?',id);
  for(const [domain,type] of [[primaryDomain,'primary'],...alternateDomains.map(d=>[d,'alternate'])])await exec(db,'INSERT INTO project_domains (id,project_id,domain,type) VALUES (?,?,?,?)',crypto.randomUUID(),id,domain,type);
  return c.json({success:true,project:await loadProject(db,account.id)})});

// --- Queries ---
export const projectQueries=(db:AdminDB,projectId:string)=>all<{id:string;text:string;tag:string|null}>(db,'SELECT q.id,q.text,q.tag FROM project_queries pq JOIN queries q ON q.id=pq.query_id WHERE pq.project_id=? AND pq.active=1 ORDER BY q.created_at,q.id',projectId);
const requireProject=async(c:PortalContext)=>{const project=await loadProject(c.env.DB,c.var.account.id);if(!project)throw new AppError('VALIDATION_ERROR','Set up your project first.',409);return project};

portal.get('/queries',async c=>{const project=await loadProject(c.env.DB,c.var.account.id);return c.json({success:true,queries:project?await projectQueries(c.env.DB,project.id):[]})});
portal.post('/queries',async c=>{const input=await body<{text?:string;tag?:string}>(c);const db=c.env.DB;const project=await requireProject(c);
  const text=String(input.text??'').trim().replace(/\s+/g,' ');const tag=String(input.tag??'').trim().slice(0,40)||null;
  if(!text)throw new ValidationError('Enter a query.');if(text.length>200)throw new ValidationError('Keep queries under 200 characters.');
  const current=await projectQueries(db,project.id);if(current.some(q=>q.text.toLowerCase()===text.toLowerCase()))throw new ValidationError('That query is already tracked.');
  const {plan}=await planFor(db,c.var.account.id);if(current.length>=plan.maxQueries)throw new ValidationError(`Your plan tracks up to ${plan.maxQueries} queries.`);
  const id=`qry_${crypto.randomUUID()}`;await exec(db,'INSERT INTO queries (id,account_id,text,tag,created_at) VALUES (?,?,?,?,?)',id,c.var.account.id,text,tag,now());
  await exec(db,'INSERT INTO project_queries (project_id,query_id,active) VALUES (?,?,1)',project.id,id);
  return c.json({success:true,query:{id,text,tag}},201)});
portal.delete('/queries/:id',async c=>{const project=await requireProject(c);await exec(c.env.DB,'UPDATE project_queries SET active=0 WHERE project_id=? AND query_id=?',project.id,c.req.param('id'));return c.json({success:true})});

// --- Billing (Stripe Checkout and Customer Portal; the webhook is the source of truth for the subscription) ---
const origin=(c:PortalContext)=>new URL(c.req.url).origin;
async function stripeCustomer(c:PortalContext){const db=c.env.DB;const {account,user}=c.var;
  const row=await one<{stripe_customer_id:string|null}>(db,'SELECT stripe_customer_id FROM accounts WHERE id=?',account.id);if(row?.stripe_customer_id)return row.stripe_customer_id;
  const id=await billingGateway(c.env).createCustomer({accountId:account.id,email:user.email,name:account.name});
  await exec(db,'UPDATE accounts SET stripe_customer_id=? WHERE id=? AND stripe_customer_id IS NULL',id,account.id);
  return (await one<{stripe_customer_id:string}>(db,'SELECT stripe_customer_id FROM accounts WHERE id=?',account.id))!.stripe_customer_id}
const requireOwner=(c:PortalContext)=>{if(c.var.account.role!=='owner'&&c.var.account.role!=='admin')throw new AppError('AUTHORIZATION_ERROR','Only workspace owners can manage billing.',403)};

portal.get('/billing',async c=>{const db=c.env.DB;const {account}=c.var;const billing=await planFor(db,account.id);
  const periodStart=billing.subscription?.periodStart??new Date(Date.now()-30*86_400_000).toISOString();
  const usage=await periodUsage(db,account.id,periodStart);
  const checks=await one<{addon:number}>(db,'SELECT COALESCE(SUM(CASE WHEN addon=1 THEN units ELSE 0 END),0) addon FROM usage_events WHERE account_id=? AND created_at>=?',account.id,periodStart);
  const customer=await one<{stripe_customer_id:string|null}>(db,'SELECT stripe_customer_id FROM accounts WHERE id=?',account.id);
  let invoices:unknown[]=[];if(customer?.stripe_customer_id){try{invoices=await billingGateway(c.env).listInvoices(customer.stripe_customer_id)}catch{invoices=[]}}
  return c.json({success:true,...billing,usage:{...usage,addonChecks:checks?.addon??0},invoices,hasCustomer:Boolean(customer?.stripe_customer_id)})});

portal.post('/billing/checkout',async c=>{requireOwner(c);const db=c.env.DB;const {plan,entitled}=await planFor(db,c.var.account.id);
  if(entitled)throw new AppError('VALIDATION_ERROR','This workspace already has an active subscription. Use Manage billing to change it.',409);
  const priceId=String(c.env.STRIPE_PRICE_ID||'');if(!priceId)throw new AppError('CONFIGURATION_ERROR','Billing is not configured.',503);
  const gateway=billingGateway(c.env);const customerId=await stripeCustomer(c);const automaticTax=await gateway.taxActive().catch(()=>false);
  const url=await gateway.createCheckout({accountId:c.var.account.id,customerId,priceId,planId:plan.id,successUrl:`${origin(c)}/#/billing?checkout=success`,cancelUrl:`${origin(c)}/#/billing`,automaticTax});
  return c.json({success:true,url})});

portal.post('/billing/portal',async c=>{requireOwner(c);const customer=await one<{stripe_customer_id:string|null}>(c.env.DB,'SELECT stripe_customer_id FROM accounts WHERE id=?',c.var.account.id);
  if(!customer?.stripe_customer_id)throw new AppError('VALIDATION_ERROR','There is no billing account yet. Subscribe first.',409);
  return c.json({success:true,url:await billingGateway(c.env).createPortal(customer.stripe_customer_id,`${origin(c)}/#/billing`)})});

// --- Runs ---
portal.get('/runs',async c=>{const {runSummaries}=await import('./runs');return c.json({success:true,runs:await runSummaries(c.env.DB,c.var.account.id)})});
portal.get('/runs/:id',async c=>{const {loadRun}=await import('./runs');const run=await loadRun(c.env.DB,c.var.account.id,c.req.param('id'));if(!run)throw new AppError('VALIDATION_ERROR','Run not found.',404);return c.json({success:true,run})});
portal.post('/runs',async c=>{const {createRun,processBatch}=await import('./runs');const input=await c.req.json<{idempotencyKey?:string}>().catch(()=>({} as {idempotencyKey?:string}));
  const run=await createRun(c.env.DB,c.env,c.var.account.id,{startedBy:'manual',idempotencyKey:input.idempotencyKey,requestId:c.var.requestId});
  // Start immediately; the portal keeps the run moving by calling /advance while it is open, and the internal worker continues it in the background.
  const progress=await processBatch(c.env.DB,c.env,{accountId:c.var.account.id,limit:10});const kick=c.env.KICK_WORKER as ((origin:string)=>void)|undefined;kick?.(origin(c));
  return c.json({success:true,run:{id:run.id,checks:run.checks},progress},201)});
portal.post('/runs/advance',async c=>{const {processBatch}=await import('./runs');return c.json({success:true,progress:await processBatch(c.env.DB,c.env,{accountId:c.var.account.id,limit:10})})});

export default portal;
