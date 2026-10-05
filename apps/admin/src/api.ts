import type { AccountMargin,BusinessMetrics,CostDimension,CostLine,Period } from '../../../packages/admin/src/metrics';
import type { RoutingOverrides } from '../../../packages/admin/src/routing';
import type { ProjectHealth } from '../../../packages/admin/src/vercel';

/** Client for /api/admin. In production the admin Vercel project rewrites /api/admin/* to the API, so requests are same-origin and carry the session cookie. */
export const DEMO=import.meta.env.VITE_ADMIN_DEMO==='true';
export class ApiError extends Error { constructor(public status:number,public code:string,message:string,public requestId?:string){super(message)} }
export async function api<T>(path:string,init:{method?:string;body?:unknown}={}):Promise<T>{if(DEMO)return (await import('./demo')).demoResponse(path,init) as T;const res=await fetch(`/api/admin${path}`,{method:init.method??'GET',credentials:'same-origin',headers:init.method&&init.method!=='GET'?{'content-type':'application/json'}:undefined,body:init.body===undefined?undefined:JSON.stringify(init.body)});const data=await res.json().catch(()=>({})) as {success?:boolean;error?:{code:string;message:string;requestId?:string}};if(!res.ok||data.success===false)throw new ApiError(res.status,data.error?.code??'INTERNAL_ERROR',data.error?.message??`Request failed (${res.status}).`,data.error?.requestId);return data as T}

export type Range = '7d'|'30d'|'90d'|'12m';
export interface Overview { period:Period; business:BusinessMetrics; revenueCents:number; costMicros:number; checks:number; grossMarginRate:number|null; topSources:CostLine[]; health:{runs:Record<string,number>;jobs:Record<string,number>;failedJobs:number;webhooks:Record<string,number>;degradedSources:{key:string;label:string;errorRate:number}[]} }
export interface Costs { period:Period; by:CostDimension; lines:CostLine[]; daily:{day:string;costMicros:number;calls:number}[]; totalMicros:number; unpricedCalls:number; margins?:AccountMargin[] }
export type Business = BusinessMetrics&{ period:Period; revenueCents:number; costMicros:number; trend:{month:string;new:number;churned:number}[]; margins:AccountMargin[] };
export interface SourceHealth extends CostLine { errorRate:number|null; p50Ms:number|null; p95Ms:number|null; errors:{code:string;count:number}[] }
export interface FailedJob { id:string; accountId:string; projectId:string; jobType:string; attempts:number; errorCode:string|null; requestId:string; updatedAt:string }
export interface Operations { period:Period; sources:SourceHealth[]; jobs:Record<string,number>; failedJobs:FailedJob[]; runs:Record<string,number>; webhooks:Record<string,number> }
export interface SourceRow { key:string; provider:string; method:string; label:string; vendor:string; vendorName:string; envVendor:string; vendorOptions:{vendor:string;name:string;configured:boolean}[]; credentialsConfigured:boolean; disabled:boolean; live:boolean }
export interface Sources { routing:RoutingOverrides; mock?:boolean; configError?:string; sources:SourceRow[] }
export interface Rate { vendor:string; vendorName:string; provider:string; method:string; label:string; reportsCost:boolean; unitCostMicros:number|null; updatedAt:string|null }
export interface AccountRow { id:string; name:string; createdAt:string; subscriptionStatus:string|null; planId:string|null; monthlyPrice:number|null; status:'active'|'paused'; addonWaived:boolean; maxQueriesOverride:number|null; lastRunAt:string|null; checks:number; failures:number; costMicros:number; revenueCents:number; marginRate:number|null }
export interface AccountControls { paused:boolean; routing:RoutingOverrides; maxQueriesOverride:number|null; addonWaived:boolean }
export interface AccountDetail { account:{id:string;name:string;createdAt:string}; controls:AccountControls; subscriptions:{id:string;planName:string;status:string;monthlyPrice:number;periodEnd:string|null;createdAt:string|null;canceledAt:string|null}[]; projects:{id:string;name:string;primaryDomain:string;frequency:string;lastRunAt:string|null}[]; runs:{id:string;status:string;createdAt:string;checks:number;failures:number;costMicros:number}[]; members:{email:string;role:string}[]; costs:CostLine[] }
export interface AuditEvent { id:string; accountId:string|null; type:string; requestId:string; metadata:Record<string,unknown>|null; createdAt:string }
export type Vercel = { period:Period; projects:ProjectHealth[] };
