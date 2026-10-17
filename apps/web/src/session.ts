import { createAuthClient } from '@neondatabase/auth';
import type { CollectionMethod,Location,ProviderId,Run,RunStatus } from '../../../packages/core/src/types';

/** Neon Auth through /auth on this domain (forwarded by the API) so the session cookie is first-party. The client caches the
 * session and its short-lived JWT, refreshing shortly before expiry, so asking for it before each API call is cheap. */
export const auth=createAuthClient(`${location.origin}/auth`);

export type Selection=Partial<Record<ProviderId,CollectionMethod[]>>;
export interface Plan { id:string; name:string; monthlyPrice:number; maxQueries:number; allowedProviders:ProviderId[]; addonUnitPrice:number|null; runsPerPeriod:number }
export interface Subscription { status:string; periodStart:string|null; periodEnd:string|null; cancelAtPeriodEnd:boolean }
export interface AccountRef { id:string; name:string; role:string }
export interface Me { user:{email:string;name:string|null}; account:AccountRef&{notifyRun:boolean;notifyDrop:boolean}; accounts:AccountRef[]; plan:Plan; subscription:Subscription|null; entitled:boolean; paused:boolean }
export interface Project { id:string; name:string; primaryDomain:string; alternateDomains:string[]; brands:string[]; selection:Selection; location:Location; frequency:'manual'|'monthly'; lastRunAt:string|null; nextRunAt:string|null }
export interface Query { id:string; text:string; tag:string|null }
export interface RunSummary { id:string; status:RunStatus; createdAt:string; completedAt:string|null; startedBy:string; queries:number; total:number; done:number; failed:number; visibility:number; citationRate:number; mentionRate:number }
export interface Invoice { id:string; date:string; amount:number; currency:string; status:string; url:string|null }
export interface Billing extends Pick<Me,'plan'|'subscription'|'entitled'|'paused'> { usage:{runs:number;checks:number;addonChecks:number}; invoices:Invoice[]; hasCustomer:boolean }
export type { Run };

export class ApiError extends Error { constructor(message:string,readonly status:number){super(message)} }
const ACCOUNT_KEY='aoh.account';
export const selectedAccount=()=>{try{return localStorage.getItem(ACCOUNT_KEY)}catch{return null}};
export const selectAccount=(id:string)=>{try{localStorage.setItem(ACCOUNT_KEY,id)}catch{/* storage unavailable: the first workspace is used */}};

export async function sessionToken():Promise<string|null>{const {data}=await auth.getSession();return (data?.session as {token?:string}|undefined)?.token??null}

/** Calls the portal API as the signed-in user. Throws ApiError with the API's own message (401 when signed out). */
export async function api<T>(path:string,init:{method?:string;body?:unknown}={}):Promise<T>{
  const token=await sessionToken();if(!token)throw new ApiError('Sign in to continue.',401);
  const account=selectedAccount();
  const response=await fetch(`/api/app${path}`,{method:init.method??'GET',headers:{authorization:`Bearer ${token}`,...(account?{'x-account-id':account}:{}),...(init.body!==undefined?{'content-type':'application/json'}:{})},body:init.body!==undefined?JSON.stringify(init.body):undefined});
  const data=await response.json().catch(()=>({})) as {error?:{message?:string}};
  if(!response.ok){if(response.status===403&&account)selectAccount('');throw new ApiError(data.error?.message??'Something went wrong. Please try again.',response.status)}
  return data as T;
}
export const errorText=(error:unknown)=>error instanceof Error?error.message:'Something went wrong. Please try again.';
