import {SignJWT,createLocalJWKSet,exportJWK,generateKeyPair} from 'jose';
import type {JWTVerifyGetKey} from 'jose';
import {beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {testDB} from './pg';
import type {TestDB} from './pg';

/** Neon Auth stand-in: an Ed25519 key pair whose tokens carry Neon's claims and issuer (the auth URL's origin). */
const AUTH='https://auth.test/neondb/auth';
let sign:(claims:Record<string,unknown>,opts?:{issuer?:string;expires?:string})=>Promise<string>;let jwks:JWTVerifyGetKey;
beforeAll(async()=>{const {publicKey,privateKey}=await generateKeyPair('EdDSA');jwks=createLocalJWKSet({keys:[{...await exportJWK(publicKey),alg:'EdDSA',kid:'k1'}]});
  sign=(claims,opts={})=>new SignJWT(claims).setProtectedHeader({alg:'EdDSA',kid:'k1'}).setIssuer(opts.issuer??'https://auth.test').setIssuedAt().setExpirationTime(opts.expires??'15m').sign(privateKey);
  await testDB()},60_000);

export const portalEnv=(db:TestDB,extra:Record<string,unknown>={})=>({DB:db.binding,QUEUE:{send:async()=>{}},REPORTS:null,DATABASE_NEON_AUTH_BASE_URL:AUTH,NEON_AUTH_JWKS:jwks,...extra});

describe('portal sign-in and accounts',()=>{let db:TestDB;
  const token=(sub='u1',email='owner@acme.test',extra:Record<string,unknown>={})=>sign({sub,email,name:'Ada Owner',emailVerified:true,...extra});
  const call=async(path:string,init:RequestInit&{token?:string|null;account?:string}={})=>{const {default:app}=await import('../apps/api/src/index');const t=init.token===undefined?await token():init.token;
    return app.request(`/api/app${path}`,{...init,headers:{'content-type':'application/json',...(t?{authorization:`Bearer ${t}`}:{}),...(init.account?{'x-account-id':init.account}:{}),...init.headers}},portalEnv(db))};
  beforeEach(async()=>{db=await testDB()});

  it('rejects missing, forged and expired tokens',async()=>{expect((await call('/me',{token:null})).status).toBe(401);
    expect((await call('/me',{token:await sign({sub:'u1',email:'a@b.test'},{issuer:'https://evil.test'})})).status).toBe(401);
    expect((await call('/me',{token:await sign({sub:'u1',email:'a@b.test'},{expires:'-1m'})})).status).toBe(401);
    expect(await db.raw.get('SELECT COUNT(*) n FROM users')).toEqual({n:0})});

  it('creates one account on first sign-in, once, and reports no subscription',async()=>{const [a,b]=await Promise.all([call('/me'),call('/me')]);expect(a.status).toBe(200);expect(b.status).toBe(200);
    const me=await a.json() as {user:{email:string};account:{id:string;role:string;name:string};accounts:unknown[];subscription:unknown;entitled:boolean;plan:{maxQueries:number}};
    expect(me).toMatchObject({user:{email:'owner@acme.test'},account:{role:'owner',name:"Ada Owner's workspace"},subscription:null,entitled:false,plan:{maxQueries:100}});
    expect(await db.raw.get('SELECT COUNT(*) n FROM accounts')).toEqual({n:1});expect(await db.raw.get('SELECT auth_id FROM users')).toEqual({auth_id:'u1'})});

  it('claims a pre-created user by verified email only',async()=>{await db.raw.exec("INSERT INTO users (id,email,created_at) VALUES ('demo_owner_1','me@acme.test','2026-01-01');INSERT INTO accounts (id,name) VALUES ('demo_a','Demo A');INSERT INTO account_users (account_id,user_id,role) VALUES ('demo_a','demo_owner_1','owner')");
    expect((await call('/me',{token:await token('u9','me@acme.test',{emailVerified:false})})).status).toBe(403);
    const me=await (await call('/me',{token:await token('u9','me@acme.test')})).json() as {account:{id:string}};expect(me.account.id).toBe('demo_a');
    expect(await db.raw.get("SELECT auth_id FROM users WHERE id='demo_owner_1'")).toEqual({auth_id:'u9'})});

  it('sends one welcome email when the workspace is created',async()=>{const sent:{to:string;subject:string}[]=[];const realFetch=globalThis.fetch;globalThis.fetch=(async(url:string|URL|Request,init?:RequestInit)=>{if(String(url).includes('resend.com')){sent.push(JSON.parse(String(init!.body)));return new Response('{"id":"em_1"}')}return realFetch(url,init)}) as typeof fetch;
    try{const {default:app}=await import('../apps/api/src/index');const t=await token();const me=()=>app.request('/api/app/me',{headers:{authorization:`Bearer ${t}`}},portalEnv(db,{RESEND_API_KEY:'re_test'}));await Promise.all([me(),me()]);await me()}finally{globalThis.fetch=realFetch}
    expect(sent).toEqual([expect.objectContaining({to:'owner@acme.test',subject:'Welcome to AI Overview Hub'})])});

  it('only lets members act on a workspace',async()=>{await call('/me');expect((await call('/me',{account:'acct_someone_else'})).status).toBe(403)});

  it('saves the project and enforces query rules',async()=>{expect((await call('/queries',{method:'POST',body:JSON.stringify({text:'best crm'})})).status).toBe(409);
    const bad=await call('/project',{method:'PUT',body:JSON.stringify({primaryDomain:'acme.test',selection:{'google-ai-mode':['api']}})});expect(bad.status).toBe(400);
    const saved=await (await call('/project',{method:'PUT',body:JSON.stringify({primaryDomain:'https://www.Acme.test/',alternateDomains:'acme.co.test, acme.test',brands:['Acme'],selection:{chatgpt:['api','simulated'],'google-ai-mode':['simulated']},location:{country:'GB'},frequency:'monthly'})})).json() as {project:{primaryDomain:string;alternateDomains:string[];location:{language:string};nextRunAt:string|null}};
    expect(saved.project).toMatchObject({primaryDomain:'acme.test',alternateDomains:['acme.co.test'],location:{country:'GB',language:'en'}});expect(saved.project.nextRunAt).toBeTruthy();
    expect((await call('/queries',{method:'POST',body:JSON.stringify({text:'  best   crm ',tag:'Comparison'})})).status).toBe(201);
    expect((await call('/queries',{method:'POST',body:JSON.stringify({text:'Best CRM'})})).status).toBe(400);
    const {queries}=await (await call('/queries')).json() as {queries:{id:string;text:string}[]};expect(queries.map(q=>q.text)).toEqual(['best crm']);
    await call(`/queries/${queries[0].id}`,{method:'DELETE'});expect((await (await call('/queries')).json() as {queries:unknown[]}).queries).toEqual([])});

  it('caps queries at the plan limit, including operator overrides',async()=>{await call('/project',{method:'PUT',body:JSON.stringify({primaryDomain:'acme.test',selection:{chatgpt:['api']}})});const {account}=await (await call('/me')).json() as {account:{id:string}};
    await db.raw.run("INSERT INTO account_controls (account_id,max_queries_override,updated_at) VALUES (?,1,'2026-01-01')",account.id);
    expect((await call('/queries',{method:'POST',body:JSON.stringify({text:'one'})})).status).toBe(201);expect((await call('/queries',{method:'POST',body:JSON.stringify({text:'two'})})).status).toBe(400)});
});

describe('portal billing and runs',()=>{let db:TestDB;let stripe:{calls:{method:string;args:unknown[]}[]};
  const gateway=()=>({createCustomer:async(i:unknown)=>{stripe.calls.push({method:'createCustomer',args:[i]});return 'cus_new'},createCheckout:async(i:unknown)=>{stripe.calls.push({method:'createCheckout',args:[i]});return 'https://checkout.stripe.test/s'},createPortal:async(...a:unknown[])=>{stripe.calls.push({method:'createPortal',args:a});return 'https://billing.stripe.test/p'},listInvoices:async()=>[{id:'in_1',date:'2026-10-01T00:00:00.000Z',amount:6999,currency:'usd',status:'paid',url:null}],taxActive:async()=>false});
  const env=(extra:Record<string,unknown>={})=>portalEnv(db,{STRIPE_PRICE_ID:'price_test',STRIPE_GATEWAY:gateway(),USE_MOCK_SERP_PROVIDERS:'true',CRON_SECRET:'cron-secret',...extra});
  const call=async(path:string,init:RequestInit={},extra:Record<string,unknown>={})=>{const {default:app}=await import('../apps/api/src/index');return app.request(path.startsWith('/api')?path:`/api/app${path}`,{...init,headers:{'content-type':'application/json',authorization:`Bearer ${await sign({sub:'u1',email:'owner@acme.test',name:'Ada',emailVerified:true})}`,...init.headers}},env(extra))};
  const subscribe=async(status='active')=>{const {account}=await (await call('/me')).json() as {account:{id:string}};const day=86_400_000;await db.raw.run("INSERT INTO subscriptions (id,account_id,plan_id,stripe_customer_id,stripe_subscription_id,status,period_start,period_end,updated_at) VALUES ('sub_row',?,'starter','cus_x','sub_stripe',?,?,?,?)",account.id,status,new Date(Date.now()-day).toISOString(),new Date(Date.now()+29*day).toISOString(),new Date().toISOString());return account.id};
  const setup=async()=>{await call('/project',{method:'PUT',body:JSON.stringify({primaryDomain:'example.com',brands:['Example'],selection:{chatgpt:['api','simulated'],'google-ai-mode':['simulated']}})});for(const text of ['best crm','crm pricing'])await call('/queries',{method:'POST',body:JSON.stringify({text})})};
  beforeEach(async()=>{db=await testDB();stripe={calls:[]}});

  it('starts Checkout once per workspace and opens the portal afterwards',async()=>{expect((await call('/billing/portal',{method:'POST'})).status).toBe(409);
    const res=await call('/billing/checkout',{method:'POST'});expect(res.status).toBe(200);expect(await res.json()).toMatchObject({url:'https://checkout.stripe.test/s'});
    const checkout=stripe.calls.find(c=>c.method==='createCheckout')!.args[0] as Record<string,unknown>;expect(checkout).toMatchObject({customerId:'cus_new',priceId:'price_test',planId:'starter',automaticTax:false,successUrl:'http://localhost/#/billing?checkout=success'});
    await call('/billing/checkout',{method:'POST'});expect(stripe.calls.filter(c=>c.method==='createCustomer')).toHaveLength(1);
    expect((await call('/billing/portal',{method:'POST'})).status).toBe(200);
    await subscribe();expect((await call('/billing/checkout',{method:'POST'})).status).toBe(409);
    const billing=await (await call('/billing')).json() as {entitled:boolean;invoices:unknown[];usage:{runs:number}};expect(billing).toMatchObject({entitled:true,usage:{runs:0}});expect(billing.invoices).toHaveLength(1)});

  it('needs a subscription, a project and queries to run',async()=>{expect((await call('/runs',{method:'POST'})).status).toBe(402);await subscribe();expect((await call('/runs',{method:'POST'})).status).toBe(409);
    await call('/project',{method:'PUT',body:JSON.stringify({primaryDomain:'example.com',selection:{chatgpt:['api']}})});expect((await call('/runs',{method:'POST'})).status).toBe(400)});

  it('runs every query on every source, records usage and add-ons, and reports metrics',async()=>{const accountId=await subscribe();await setup();
    const started=await call('/runs',{method:'POST',body:JSON.stringify({idempotencyKey:'k1'})});expect(started.status).toBe(201);const {run}=await started.json() as {run:{id:string;checks:number}};expect(run.checks).toBe(6);
    for(let i=0;i<5;i++){const {progress}=await (await call('/runs/advance',{method:'POST'})).json() as {progress:{remaining:number}};if(!progress.remaining)break}
    const {runs}=await (await call('/runs')).json() as {runs:{id:string;status:string;total:number;done:number;queries:number;visibility:number}[]};expect(runs[0]).toMatchObject({id:run.id,status:'COMPLETED',total:6,done:6,queries:2});expect(runs[0].visibility).toBeGreaterThan(0);
    const detail=await (await call(`/runs/${run.id}`)).json() as {run:{results:{status:string;result?:{citations:unknown[]}}[]}};expect(detail.run.results).toHaveLength(6);expect(detail.run.results.every(r=>r.status==='SUCCESS'&&r.result!.citations.length>0)).toBe(true);
    expect(await db.raw.all('SELECT method,addon,COUNT(*) n FROM usage_events WHERE account_id=? GROUP BY method,addon ORDER BY method',accountId)).toEqual([{method:'api',addon:0,n:2},{method:'simulated',addon:0,n:2},{method:'simulated',addon:1,n:2}]);
    expect(await db.raw.get('SELECT last_run_at IS NOT NULL done FROM projects')).toEqual({done:true});
    expect((await call('/runs',{method:'POST',body:JSON.stringify({idempotencyKey:'k1'})})).status).toBe(201);expect(await db.raw.get('SELECT COUNT(*) n FROM runs')).toEqual({n:1});
    expect((await call(`/runs/${run.id}`,{},{})).status).toBe(200)});

  it('caps runs per billing period and blocks paused workspaces',async()=>{const accountId=await subscribe();await setup();await db.raw.run("UPDATE plans SET runs_per_period=1");
    expect((await call('/runs',{method:'POST'})).status).toBe(201);for(let i=0;i<5;i++)await call('/runs/advance',{method:'POST'});
    const second=await call('/runs',{method:'POST'});expect(second.status).toBe(409);expect(((await second.json()) as {error:{message:string}}).error.message).toMatch(/1 runs per billing period/);
    await db.raw.run("INSERT INTO account_controls (account_id,status,updated_at) VALUES (?,'paused','2026-01-01')",accountId);expect((await call('/runs',{method:'POST'})).status).toBe(403)});

  it('caps answer checks per workspace, including operator overrides',async()=>{const accountId=await subscribe();await setup();await db.raw.run("INSERT INTO account_controls (account_id,max_checks_override,updated_at) VALUES (?,5,'2026-01-01')",accountId);
    expect((await (await call('/me')).json() as {plan:{checksPerPeriod:number}}).plan.checksPerPeriod).toBe(5);
    const res=await call('/runs',{method:'POST'});expect(res.status).toBe(409);expect(((await res.json()) as {error:{message:string}}).error.message).toMatch(/needs 6 answer checks.*5 of 5 left/);
    await db.raw.run('UPDATE account_controls SET max_checks_override=6');expect((await call('/runs',{method:'POST'})).status).toBe(201);
    const billing=await (await call('/billing')).json() as {usage:{checks:number}};expect(billing.usage.checks).toBe(6);
    await db.raw.run("UPDATE plans SET runs_per_period=5");for(let i=0;i<5;i++)await call('/runs/advance',{method:'POST'});expect((await call('/runs',{method:'POST'})).status).toBe(409)});

  it('stops paid runs at the platform monthly cap and does not meter mock runs',async()=>{await subscribe();await setup();expect((await call('/runs',{method:'POST'})).status).toBe(201);expect(await db.raw.get('SELECT metered FROM runs')).toEqual({metered:0});
    for(let i=0;i<5;i++)await call('/runs/advance',{method:'POST'});
    await call('/project',{method:'PUT',body:JSON.stringify({primaryDomain:'example.com',selection:{chatgpt:['api']}})});
    const res=await call('/runs',{method:'POST'},{USE_MOCK_SERP_PROVIDERS:'false',OPENAI_API_KEY:'sk-test',PLATFORM_MONTHLY_CHECK_CAP:'1'});expect(res.status).toBe(503);expect(((await res.json()) as {error:{message:string}}).error.message).toMatch(/at capacity/);
    expect(await db.raw.get('SELECT COUNT(*) n FROM runs')).toEqual({n:1})});

  it('emails owners when a run fails completely, and accepts the SERP_API_KEY name',async()=>{await subscribe();await setup();await call('/project',{method:'PUT',body:JSON.stringify({primaryDomain:'example.com',selection:{'google-ai-mode':['simulated']}})});
    const sent:{subject:string}[]=[];const realFetch=globalThis.fetch;globalThis.fetch=(async(url:string|URL|Request,init?:RequestInit)=>{const u=String(url);if(u.includes('resend.com')){sent.push(JSON.parse(String(init!.body)));return new Response('{"id":"em_1"}')}if(u.includes('serpapi.com'))return new Response('{"error":"Invalid API key."}',{status:401});return realFetch(url,init)}) as typeof fetch;
    try{const res=await call('/runs',{method:'POST'},{USE_MOCK_SERP_PROVIDERS:'false',SERP_API_KEY:'serp-test',RESEND_API_KEY:'re_test'});expect(res.status).toBe(201);
      for(let i=0;i<8;i++){await db.raw.run("UPDATE run_queries SET next_attempt_at=NULL");const {progress}=await (await call('/runs/advance',{method:'POST'},{USE_MOCK_SERP_PROVIDERS:'false',SERP_API_KEY:'serp-test',RESEND_API_KEY:'re_test'})).json() as {progress:{remaining:number}};if(!progress.remaining)break}}finally{globalThis.fetch=realFetch}
    expect(await db.raw.get('SELECT status FROM runs')).toEqual({status:'FAILED'});expect(sent.map(m=>m.subject)).toEqual(['Your AI visibility run for Ada\'s workspace couldn’t complete'])});

  it('refuses sources the operator has not configured',async()=>{await subscribe();await setup();const res=await call('/runs',{method:'POST'},{USE_MOCK_SERP_PROVIDERS:'false'});expect(res.status).toBe(409);expect(((await res.json()) as {error:{message:string}}).error.message).toMatch(/unavailable right now/)});

  it('keeps runs going from the protected background worker and emails owners when done',async()=>{await subscribe();await setup();await db.raw.run("UPDATE plans SET runs_per_period=5");
    await call('/runs',{method:'POST'});await db.raw.run("UPDATE run_queries SET status='PENDING',claimed_at=NULL");await db.raw.run("UPDATE runs SET status='QUEUED',completed_at=NULL");await db.raw.exec('DELETE FROM citations;DELETE FROM provider_results;DELETE FROM usage_events');
    expect((await call('/api/internal/worker',{method:'POST',headers:{authorization:'Bearer wrong'}})).status).toBe(401);
    const sent:unknown[]=[];const realFetch=globalThis.fetch;globalThis.fetch=(async(url:string|URL|Request,init?:RequestInit)=>{if(String(url).includes('resend.com')){sent.push(JSON.parse(String(init!.body)));return new Response('{"id":"em_1"}')}return realFetch(url,init)}) as typeof fetch;
    try{const res=await call('/api/internal/worker',{method:'POST',headers:{authorization:'Bearer cron-secret'}},{RESEND_API_KEY:'re_test',APP_URL:'https://app.test'});expect(await res.json()).toMatchObject({processed:6,finished:1,remaining:0})}finally{globalThis.fetch=realFetch}
    expect(sent).toHaveLength(1);expect(sent[0]).toMatchObject({to:['owner@acme.test']});expect(String((sent[0] as {text:string}).text)).toContain('https://app.test/#/reports')});

  it('reclaims abandoned jobs and retries recoverable failures',async()=>{await subscribe();await setup();await call('/runs',{method:'POST'});
    await db.raw.run("UPDATE run_queries SET status='RUNNING',claimed_at='2000-01-01T00:00:00.000Z'");await db.raw.run("UPDATE runs SET status='RUNNING',completed_at=NULL");
    const {processBatch}=await import('../apps/api/src/runs');const r=await processBatch(db.binding,env(),{limit:10});expect(r).toMatchObject({processed:6,remaining:0});
    expect(await db.raw.get('SELECT COUNT(*) n FROM provider_results')).toEqual({n:6});expect(await db.raw.get('SELECT COUNT(DISTINCT provider_result_id) n FROM citations')).toEqual({n:6});expect(await db.raw.get("SELECT COUNT(*) n FROM run_queries WHERE status='SUCCESS'")).toEqual({n:6})});
});
