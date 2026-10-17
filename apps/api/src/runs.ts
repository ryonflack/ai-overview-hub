import { AppError,ValidationError } from '../../../packages/core/src/errors';
import { checkSource } from '../../../packages/core/src/execution';
import { methodLabels,resolveSources,sourceKey } from '../../../packages/core/src/sources';
import { providerNames } from '../../../packages/core/src/types';
import type { CollectionMethod,JobState,Location,NormalizedAIResult,ProviderId,Run,RunResult,RunStatus } from '../../../packages/core/src/types';
import { callCost } from '../../../packages/admin/src/metrics';
import type { VendorRate } from '../../../packages/admin/src/metrics';
import { applyRouting,maskAvailability,sourceVendor } from '../../../packages/admin/src/routing';
import { createProviders,providerConfigFromEnv,sourceAvailability } from '../../../packages/providers/src/index';
import { notifyRun } from './notifications';
import { loadAccountControls,loadGlobalRouting } from './admin';
import type { AdminDB } from './admin';
import { all,exec,loadProject,one,periodUsage,planFor,projectQueries } from './app';
import type { ProjectView } from './app';

/** Runs and the job queue. A run is one job per query × source in run_queries. Workers claim jobs with FOR UPDATE SKIP LOCKED, so
 * several can run at once (the portal's polling, the self-chaining internal worker, the daily cron) without doing a job twice.
 * A recoverable provider failure is retried with backoff up to MAX_ATTEMPTS; a claim older than STALE_MS is treated as abandoned. */
export const MAX_ATTEMPTS=3;
const STALE_MS=120_000;
type Env=Record<string,unknown>&{DB:AdminDB};
const iso=(ms=Date.now())=>new Date(ms).toISOString();
const json=<T>(text:unknown,fallback:T):T=>{try{return text?JSON.parse(String(text)) as T:fallback}catch{return fallback}};
const addMonth=(at:string)=>{const d=new Date(at);d.setUTCMonth(d.getUTCMonth()+1);return d.toISOString()};

/** Platform-wide cap on paid provider calls per calendar month (UTC), across all workspaces: PLATFORM_MONTHLY_CHECK_CAP, default 2,000.
 * A queued check reserves one call and each retry adds one, so the cap also bounds retries. Mock-provider runs are not metered. */
export const DEFAULT_PLATFORM_CAP=2000;
export const platformCap=(env:Record<string,unknown>)=>{const raw=String(env.PLATFORM_MONTHLY_CHECK_CAP??'').trim();const n=Number(raw);return raw&&Number.isInteger(n)&&n>=0?n:DEFAULT_PLATFORM_CAP};
const monthStart=()=>{const d=new Date();return new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1)).toISOString()};
export async function platformCalls(db:AdminDB){return (await one<{n:number}>(db,'SELECT COALESCE(SUM(GREATEST(q.attempts,1)),0) n FROM run_queries q JOIN runs r ON r.id=q.run_id WHERE r.metered=1 AND r.created_at>=?',monthStart()))!.n}

/** Multi-row INSERT in chunks, so a 900-job run is a handful of round trips rather than 900. */
async function insertMany(db:AdminDB,table:string,columns:string[],rows:unknown[][],suffix='',chunk=150){for(let i=0;i<rows.length;i+=chunk){const part=rows.slice(i,i+chunk);await exec(db,`INSERT INTO ${table} (${columns.join(',')}) VALUES ${part.map(()=>`(${columns.map(()=>'?').join(',')})`).join(',')} ${suffix}`,...part.flat())}}

async function routingFor(db:AdminDB,env:Env,accountId:string){const controls=await loadAccountControls(db,accountId);const {config,disabled}=applyRouting(providerConfigFromEnv(env),await loadGlobalRouting(db),controls.routing);return{config,disabled,controls,available:maskAvailability(sourceAvailability(config),disabled)}}

/** Starts a run for the workspace's project after checking subscription, pause, plan limits and source availability. Idempotent per key. */
export async function createRun(db:AdminDB,env:Env,accountId:string,opts:{startedBy:'manual'|'schedule';idempotencyKey?:string;requestId?:string}){
  const {plan,subscription,entitled,paused}=await planFor(db,accountId);
  if(paused)throw new AppError('AUTHORIZATION_ERROR','Runs are paused for this workspace. Contact support.',403);
  if(!entitled)throw new AppError('BILLING_ERROR',subscription?.status==='past_due'?'Update your payment method to run monitoring.':'Subscribe to start monitoring.',402);
  const project=await loadProject(db,accountId);if(!project)throw new AppError('VALIDATION_ERROR','Set up your project first.',409);
  const queries=await projectQueries(db,project.id);if(!queries.length)throw new ValidationError('Add at least one query before running.');
  if(queries.length>plan.maxQueries)throw new ValidationError(`Your plan allows up to ${plan.maxQueries} queries. Remove some to run.`);
  const sources=resolveSources({providers:Object.keys(project.selection) as ProviderId[],methods:project.selection});
  const {available,config}=await routingFor(db,env,accountId);const off=sources.find(s=>!available[sourceKey(s.provider,s.method)]);
  if(off)throw new AppError('VALIDATION_ERROR',`${providerNames[off.provider]} (${methodLabels[off.method].label}) is unavailable right now. Turn it off under AI sources to run.`,409);
  const active=await one(db,"SELECT id FROM runs WHERE project_id=? AND status IN ('QUEUED','RUNNING')",project.id);if(active)throw new AppError('VALIDATION_ERROR','A run is already in progress.',409);
  const periodStart=subscription?.periodStart??iso(Date.now()-30*86_400_000);
  const used=await periodUsage(db,accountId,periodStart);
  if(used.runs>=plan.runsPerPeriod)throw new AppError('QUOTA_EXCEEDED',`Your plan includes ${plan.runsPerPeriod} runs per billing period${subscription?.periodEnd?`; the next period starts ${subscription.periodEnd.slice(0,10)}`:''}.`,409);
  const checks=queries.length*sources.length;
  if(used.checks+checks>plan.checksPerPeriod)throw new AppError('QUOTA_EXCEEDED',`This run needs ${checks.toLocaleString('en-US')} answer checks, but your workspace has ${Math.max(0,plan.checksPerPeriod-used.checks).toLocaleString('en-US')} of ${plan.checksPerPeriod.toLocaleString('en-US')} left this billing period. Remove some queries or sources, or contact support to raise your limit.`,409);
  const metered=!config.mock;
  if(metered){const cap=platformCap(env);const calls=await platformCalls(db);if(calls+checks>cap){console.error(JSON.stringify({level:'error',event:'platform_cap_reached',accountId,calls,checks,cap}));throw new AppError('QUOTA_EXCEEDED','Monitoring is at capacity right now. Please try again later or contact support.',503)}}
  const id=`run_${crypto.randomUUID()}`;const key=opts.idempotencyKey?.slice(0,120)||id;const requestId=opts.requestId??crypto.randomUUID();
  const created=await one<{id:string}>(db,"INSERT INTO runs (id,account_id,project_id,status,idempotency_key,request_id,created_at,started_by,metered) VALUES (?,?,?,'QUEUED',?,?,?,?,?) ON CONFLICT (idempotency_key) DO NOTHING RETURNING id",id,accountId,project.id,key,requestId,iso(),opts.startedBy,metered?1:0);
  if(!created){const existing=await one<{id:string;account_id:string}>(db,'SELECT id,account_id FROM runs WHERE idempotency_key=?',key);if(!existing||existing.account_id!==accountId)throw new ValidationError('Duplicate request.');return{id:existing.id,checks:0,duplicate:true}}
  const location=JSON.stringify(project.location);
  await insertMany(db,'run_queries',['id','run_id','query_id','query_text','provider_id','method','location','status','attempts'],queries.flatMap(q=>sources.map(s=>[`rq_${crypto.randomUUID()}`,id,q.id,q.text,s.provider,s.method,location,'PENDING',0])));
  return{id,checks,duplicate:false};
}

interface Job { id:string; run_id:string; query_id:string; query_text:string; provider_id:ProviderId; method:CollectionMethod; location:string|null; attempts:number }
interface RunContext { accountId:string; metered:boolean; requestId:string; project:ProjectView; monitored:string[]; subscription:{id:string;periodStart:string;periodEnd:string}|null; providers:ReturnType<typeof createProviders>; config:ReturnType<typeof providerConfigFromEnv>; disabled:Set<string> }

async function contextFor(db:AdminDB,env:Env,runId:string):Promise<RunContext|null>{
  const run=await one<{account_id:string;request_id:string;metered:number}>(db,'SELECT account_id,request_id,metered FROM runs WHERE id=?',runId);if(!run)return null;
  const project=await loadProject(db,run.account_id);if(!project)return null;
  const {subscriptionId,subscription}=await planFor(db,run.account_id);const {config,disabled}=await routingFor(db,env,run.account_id);
  return{accountId:run.account_id,metered:Boolean(run.metered),requestId:run.request_id,project,monitored:[project.primaryDomain,...project.alternateDomains],subscription:subscriptionId?{id:subscriptionId,periodStart:subscription?.periodStart??iso(),periodEnd:subscription?.periodEnd??iso()}:null,providers:createProviders(config),config,disabled};
}

/** Claims up to `limit` due jobs (optionally one workspace's), runs them in parallel, records each outcome, then finalizes finished runs. */
export async function processBatch(db:AdminDB,env:Env,opts:{accountId?:string;limit?:number}={}){
  const now=iso();
  await exec(db,"UPDATE run_queries SET status='RETRY',claimed_at=NULL WHERE status='RUNNING' AND claimed_at<?",iso(Date.now()-STALE_MS));
  const scope=opts.accountId?' AND r.account_id=?':'';
  const jobs=await all<Job>(db,`UPDATE run_queries SET status='RUNNING',claimed_at=?,attempts=attempts+1 WHERE id IN (SELECT rq.id FROM run_queries rq JOIN runs r ON r.id=rq.run_id WHERE rq.status IN ('PENDING','RETRY') AND (rq.next_attempt_at IS NULL OR rq.next_attempt_at<=?)${scope} ORDER BY r.created_at,rq.id LIMIT ? FOR UPDATE OF rq SKIP LOCKED) RETURNING id,run_id,query_id,query_text,provider_id,method,location,attempts`,now,now,...(opts.accountId?[opts.accountId]:[]),opts.limit??10);
  // Retries are the only calls not reserved when a run starts; once the platform cap is passed they fail instead of calling out.
  const overCap=jobs.some(j=>j.attempts>1)&&await platformCalls(db)>platformCap(env);
  const contexts=new Map<string,Promise<RunContext|null>>();const rates=jobs.length?await all<VendorRate>(db,'SELECT vendor,provider_id provider,method,unit_cost_micros unitCostMicros FROM vendor_rates'):[];
  await Promise.all(jobs.map(async job=>{
    if(!contexts.has(job.run_id))contexts.set(job.run_id,contextFor(db,env,job.run_id).then(async ctx=>{await exec(db,"UPDATE runs SET status='RUNNING' WHERE id=? AND status='QUEUED'",job.run_id);return ctx}));
    const ctx=await contexts.get(job.run_id);
    if(!ctx)return exec(db,"UPDATE run_queries SET status='FAILED',error_code='CONFIGURATION_ERROR',error_message='The project no longer exists.',completed_at=?,claimed_at=NULL WHERE id=?",iso(),job.id);
    if(overCap&&ctx.metered&&job.attempts>1)return exec(db,"UPDATE run_queries SET status='FAILED',error_code='QUOTA_EXCEEDED',error_message='The monthly provider limit was reached before this check could be retried.',completed_at=?,claimed_at=NULL WHERE id=?",iso(),job.id);
    const key=sourceKey(job.provider_id,job.method);
    const result=await checkSource(ctx.disabled.has(key)?undefined:ctx.providers[key],{query:job.query_text,queryId:job.query_id,providerId:job.provider_id,method:job.method,location:json<Location>(job.location,ctx.project.location),requestId:ctx.requestId,monitored:ctx.monitored,brands:ctx.project.brands},false);
    await recordResult(db,ctx,job,result,rates);
  }));
  const finished=await finalizeRuns(db,env);
  const remaining=(await one<{n:number}>(db,`SELECT COUNT(*) n FROM run_queries rq JOIN runs r ON r.id=rq.run_id WHERE rq.status IN ('PENDING','RETRY','RUNNING')${scope}`,...(opts.accountId?[opts.accountId]:[])))!.n;
  return{processed:jobs.length,finished,remaining};
}

async function recordResult(db:AdminDB,ctx:RunContext,job:Job,r:RunResult,rates:VendorRate[]){
  const done=iso();
  if(r.status==='FAILED'&&r.error?.recoverable&&job.attempts<MAX_ATTEMPTS)return exec(db,"UPDATE run_queries SET status='RETRY',error_code=?,error_message=?,next_attempt_at=?,claimed_at=NULL WHERE id=?",r.error.code,r.error.message,iso(Date.now()+5_000*2**(job.attempts-1)),job.id);
  const vendor=sourceVendor(job.provider_id,job.method,ctx.config);
  if(r.status!=='SUCCESS'||!r.result)return exec(db,"UPDATE run_queries SET status='FAILED',error_code=?,error_message=?,vendor=?,duration_ms=?,completed_at=?,claimed_at=NULL WHERE id=?",r.error?.code??'PROVIDER_ERROR',r.error?.message??'Provider request failed.',vendor,r.durationMs??null,done,job.id);
  const cost=callCost(r.result.metadata,vendor,job.provider_id,job.method,rates);
  // A reclaimed job may already have a stored result from an attempt that died before finishing: replace it and its citations.
  const {id:resultId}=(await one<{id:string}>(db,'INSERT INTO provider_results (id,run_query_id,answer_present,answer_text,cited,mentioned,citation_position,search_id,normalized_json,executed_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT (run_query_id) DO UPDATE SET answer_present=excluded.answer_present,answer_text=excluded.answer_text,cited=excluded.cited,mentioned=excluded.mentioned,citation_position=excluded.citation_position,search_id=excluded.search_id,normalized_json=excluded.normalized_json,executed_at=excluded.executed_at RETURNING id',`pr_${crypto.randomUUID()}`,job.id,r.result.answerPresent?1:0,r.result.answerText,r.customerCited?1:0,r.customerMentioned?1:0,r.citationPosition??null,r.result.searchId??null,JSON.stringify(r.result),r.result.executedAt))!;
  await exec(db,'DELETE FROM citations WHERE provider_result_id=?',resultId);
  if(r.result.citations.length)await insertMany(db,'citations',['id','provider_result_id','url','domain','title','position'],r.result.citations.slice(0,50).map(c=>[`cit_${crypto.randomUUID()}`,resultId,c.url.slice(0,2000),c.domain,c.title?.slice(0,500)??null,c.position]));
  await exec(db,"UPDATE run_queries SET status='SUCCESS',error_code=NULL,error_message=NULL,vendor=?,cost_micros=?,cost_basis=?,duration_ms=?,completed_at=?,claimed_at=NULL WHERE id=?",vendor,cost.costMicros,cost.basis,r.durationMs??null,done,job.id);
  // The plan includes one method per engine; a second method on the same engine is an add-on check.
  const addon=(ctx.project.selection[job.provider_id]??[]).indexOf(job.method)>0;
  if(ctx.subscription)await exec(db,'INSERT INTO usage_events (id,account_id,subscription_id,run_id,query_id,provider,method,addon,units,period_start,period_end,created_at) VALUES (?,?,?,?,?,?,?,?,1,?,?,?) ON CONFLICT DO NOTHING',`use_${crypto.randomUUID()}`,ctx.accountId,ctx.subscription.id,job.run_id,job.query_id,job.provider_id,job.method,addon?1:0,ctx.subscription.periodStart,ctx.subscription.periodEnd,done);
}

/** Completes runs with no jobs left, once each (the status guard makes only one worker send the notification). */
export async function finalizeRuns(db:AdminDB,env:Env){
  const ready=await all<{id:string;account_id:string;project_id:string;total:number;ok:number}>(db,"SELECT r.id,r.account_id,r.project_id,COUNT(q.id) total,SUM(CASE WHEN q.status='SUCCESS' THEN 1 ELSE 0 END) ok FROM runs r JOIN run_queries q ON q.run_id=r.id WHERE r.status IN ('QUEUED','RUNNING') GROUP BY r.id,r.account_id,r.project_id HAVING SUM(CASE WHEN q.status IN ('PENDING','RETRY','RUNNING') THEN 1 ELSE 0 END)=0");
  let finished=0;
  for(const run of ready){const status:RunStatus=run.ok===run.total?'COMPLETED':run.ok?'COMPLETED_WITH_ERRORS':'FAILED';const at=iso();
    const changed=await exec(db,"UPDATE runs SET status=?,completed_at=? WHERE id=? AND status IN ('QUEUED','RUNNING')",status,at,run.id);if(!changed.meta?.changes)continue;finished++;
    await exec(db,"UPDATE projects SET last_run_at=?,next_run_at=CASE WHEN frequency='monthly' THEN ? ELSE next_run_at END WHERE id=?",at,addMonth(at),run.project_id);
    await notifyRun(db,env,run.account_id,run.id,await runSummaries(db,run.account_id,5)).catch(error=>console.error(JSON.stringify({level:'error',event:'run_notification_failed',runId:run.id,message:String(error)})));
  }
  return finished;
}

// --- Reading runs ---
export interface RunSummary { id:string; status:RunStatus; createdAt:string; completedAt:string|null; startedBy:string; queries:number; total:number; done:number; failed:number; visibility:number; citationRate:number; mentionRate:number }
const pct=(n:number,d:number)=>d?Math.round(n/d*1000)/10:0;
export async function runSummaries(db:AdminDB,accountId:string,limit=24):Promise<RunSummary[]>{
  const rows=await all<{id:string;status:RunStatus;createdAt:string;completedAt:string|null;startedBy:string;queries:number;total:number;done:number;failed:number;answered:number;visible:number;cited:number;mentioned:number}>(db,"SELECT r.id,r.status,r.created_at createdAt,r.completed_at completedAt,r.started_by startedBy,COUNT(DISTINCT q.query_id) queries,COUNT(q.id) total,SUM(CASE WHEN q.status IN ('SUCCESS','FAILED') THEN 1 ELSE 0 END) done,SUM(CASE WHEN q.status='FAILED' THEN 1 ELSE 0 END) failed,SUM(CASE WHEN p.answer_present=1 THEN 1 ELSE 0 END) answered,SUM(CASE WHEN p.answer_present=1 AND (p.cited=1 OR p.mentioned=1) THEN 1 ELSE 0 END) visible,SUM(CASE WHEN p.answer_present=1 AND p.cited=1 THEN 1 ELSE 0 END) cited,SUM(CASE WHEN p.answer_present=1 AND p.mentioned=1 THEN 1 ELSE 0 END) mentioned FROM runs r LEFT JOIN run_queries q ON q.run_id=r.id LEFT JOIN provider_results p ON p.run_query_id=q.id WHERE r.account_id=? GROUP BY r.id,r.status,r.created_at,r.completed_at,r.started_by ORDER BY r.created_at DESC LIMIT ?",accountId,limit);
  return rows.map(({answered,visible,cited,mentioned,...r})=>({...r,done:r.done??0,failed:r.failed??0,visibility:pct(visible??0,answered??0),citationRate:pct(cited??0,answered??0),mentionRate:pct(mentioned??0,answered??0)}));
}

/** A run in the shared Run shape, so the portal reuses calculateMetrics and the XLSX/CSV exporters. */
export async function loadRun(db:AdminDB,accountId:string,runId:string):Promise<Run|null>{
  const run=await one<{id:string;project_id:string;status:RunStatus;created_at:string;completed_at:string|null;request_id:string}>(db,'SELECT id,project_id,status,created_at,completed_at,request_id FROM runs WHERE id=? AND account_id=?',runId,accountId);if(!run)return null;
  const rows=await all<{query_id:string;query_text:string;provider_id:ProviderId;method:CollectionMethod;status:JobState;attempts:number;error_code:string|null;error_message:string|null;duration_ms:number|null;normalized_json:string|null;cited:number|null;mentioned:number|null;citation_position:number|null}>(db,'SELECT q.query_id,q.query_text,q.provider_id,q.method,q.status,q.attempts,q.error_code,q.error_message,q.duration_ms,p.normalized_json,p.cited,p.mentioned,p.citation_position FROM run_queries q LEFT JOIN provider_results p ON p.run_query_id=q.id WHERE q.run_id=? ORDER BY q.query_text,q.provider_id,q.method',runId);
  const results:RunResult[]=rows.map(r=>({queryId:r.query_id,query:r.query_text,provider:r.provider_id,method:r.method,status:r.status,result:json<NormalizedAIResult|undefined>(r.normalized_json,undefined),customerCited:r.cited===1,customerMentioned:r.mentioned===1,citationPosition:r.citation_position??undefined,durationMs:r.duration_ms??undefined,...(r.status==='FAILED'?{error:{code:r.error_code??'PROVIDER_ERROR',message:r.error_message??'Provider request failed.',attempts:r.attempts}}:{})}));
  return{id:run.id,accountId,projectId:run.project_id,status:run.status,results,createdAt:run.created_at,completedAt:run.completed_at??undefined,requestId:run.request_id};
}

/** Monthly projects whose next run is due get a scheduled run. Failures (no subscription, quota) push the date a month on. */
export async function scheduleDueRuns(db:AdminDB,env:Env){
  const due=await all<{id:string;account_id:string;next_run_at:string}>(db,"SELECT id,account_id,next_run_at FROM projects WHERE frequency='monthly' AND next_run_at IS NOT NULL AND next_run_at<=?",iso());
  let started=0;
  for(const p of due){try{const run=await createRun(db,env,p.account_id,{startedBy:'schedule',idempotencyKey:`schedule:${p.id}:${p.next_run_at}`});if(!run.duplicate)started++}
    catch(error){console.log(JSON.stringify({level:'info',event:'scheduled_run_skipped',projectId:p.id,reason:error instanceof Error?error.message:String(error)}));if(!(error instanceof AppError&&error.message==='A run is already in progress.'))await exec(db,'UPDATE projects SET next_run_at=? WHERE id=?',addMonth(p.next_run_at),p.id)}}
  return started;
}
