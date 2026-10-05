import { methodLabels } from '../../core/src/sources';
import { providerNames } from '../../core/src/types';
import type { CollectionMethod,ProviderId } from '../../core/src/types';
import { vendorNames } from './routing';
import type { Vendor } from './routing';

/** Money conventions: revenue is in cents (as Stripe and `plans` store it); vendor cost is in micro-dollars because single calls cost fractions of a cent. */
export const MICROS_PER_CENT=10_000;
export type CostBasis = 'reported'|'rate'|'unknown';
export interface VendorRate { vendor:string; provider:ProviderId; method:CollectionMethod; unitCostMicros:number }
const dollars=(v:unknown)=>{const n=typeof v==='string'?Number(v):v;return typeof n==='number'&&Number.isFinite(n)&&n>=0?n:undefined};
/** Cost of one successful provider call: the vendor-reported cost when the response carries one (Perplexity, DataForSEO), else the operator's rate for that vendor and source. */
export function callCost(metadata:Record<string,unknown>|undefined,vendor:string,provider:ProviderId,method:CollectionMethod,rates:VendorRate[]):{costMicros:number|null;basis:CostBasis}{const reported=dollars(metadata?.cost);if(reported!==undefined)return{costMicros:Math.round(reported*1_000_000),basis:'reported'};const rate=rates.find(r=>r.vendor===vendor&&r.provider===provider&&r.method===method);return rate?{costMicros:rate.unitCostMicros,basis:'rate'}:{costMicros:null,basis:'unknown'}}

/** One grouped row of provider calls, as `GET /api/admin/costs` reads it from `run_queries`. */
export interface CallGroup { accountId:string; accountName:string; provider:ProviderId; method:CollectionMethod; vendor:string|null; status:string; calls:number; costMicros:number; unpricedCalls:number }
export type CostDimension = 'source'|'vendor'|'account';
export interface CostLine { key:string; label:string; calls:number; successes:number; failures:number; costMicros:number; costPerCheckMicros:number|null; costPerSuccessMicros:number|null; unpricedCalls:number; share:number }
const keyOf=(g:CallGroup,by:CostDimension)=>by==='account'?g.accountId:by==='vendor'?g.vendor??'unknown':`${g.provider}:${g.method}`;
const labelOf=(g:CallGroup,by:CostDimension)=>by==='account'?g.accountName:by==='vendor'?vendorNames[g.vendor as Vendor]??g.vendor??'Unknown':`${providerNames[g.provider]??g.provider} · ${methodLabels[g.method]?.label??g.method}`;
/** Rolls call groups up by source (engine + method), vendor or customer account, sorted by spend. Failed calls count as checks but are normally free. */
export function costBreakdown(groups:CallGroup[],by:CostDimension):CostLine[]{const lines=new Map<string,Omit<CostLine,'costPerCheckMicros'|'costPerSuccessMicros'|'share'>>();for(const g of groups){const key=keyOf(g,by);const line=lines.get(key)??{key,label:labelOf(g,by),calls:0,successes:0,failures:0,costMicros:0,unpricedCalls:0};line.calls+=g.calls;if(g.status==='SUCCESS')line.successes+=g.calls;else if(g.status==='FAILED')line.failures+=g.calls;line.costMicros+=g.costMicros;line.unpricedCalls+=g.unpricedCalls;lines.set(key,line)}const total=[...lines.values()].reduce((n,l)=>n+l.costMicros,0);return[...lines.values()].map(l=>({...l,costPerCheckMicros:l.calls?Math.round(l.costMicros/l.calls):null,costPerSuccessMicros:l.successes?Math.round(l.costMicros/l.successes):null,share:total?l.costMicros/total:0})).sort((a,b)=>b.costMicros-a.costMicros||b.calls-a.calls)}

export interface SubscriptionRow { accountId:string; planId:string; status:string; monthlyPrice:number; createdAt:string|null; canceledAt:string|null }
export interface Period { from:string; to:string }
/** Subscriptions that bill: Stripe's `active` and `trialing`. `past_due` still counts toward MRR but is reported separately as at risk. */
const billing=new Set(['active','trialing','past_due']);
const inPeriod=(at:string|null,p:Period)=>Boolean(at&&at>=p.from&&at<p.to);
export interface BusinessMetrics { mrrCents:number; arrCents:number; mrrAtRiskCents:number; payingAccounts:number; pastDue:number; newSubscriptions:number; churned:number; churnRate:number|null; arpaCents:number|null; addonRevenueCents:number; byPlan:{planId:string;accounts:number;mrrCents:number}[]; byStatus:Record<string,number> }
export function businessMetrics(subs:SubscriptionRow[],period:Period,addonRevenueCents=0):BusinessMetrics{const paying=subs.filter(s=>billing.has(s.status));const mrrCents=paying.reduce((n,s)=>n+s.monthlyPrice,0);const pastDue=paying.filter(s=>s.status==='past_due');const churned=subs.filter(s=>inPeriod(s.canceledAt,period)).length;const atStart=subs.filter(s=>(!s.createdAt||s.createdAt<period.from)&&(!s.canceledAt||s.canceledAt>=period.from)).length;const plans=new Map<string,{planId:string;accounts:number;mrrCents:number}>();for(const s of paying){const p=plans.get(s.planId)??{planId:s.planId,accounts:0,mrrCents:0};p.accounts++;p.mrrCents+=s.monthlyPrice;plans.set(s.planId,p)}const byStatus:Record<string,number>={};for(const s of subs)byStatus[s.status]=(byStatus[s.status]??0)+1;const accounts=new Set(paying.map(s=>s.accountId)).size;return{mrrCents,arrCents:mrrCents*12,mrrAtRiskCents:pastDue.reduce((n,s)=>n+s.monthlyPrice,0),payingAccounts:accounts,pastDue:pastDue.length,newSubscriptions:subs.filter(s=>inPeriod(s.createdAt,period)).length,churned,churnRate:atStart?churned/atStart:null,arpaCents:accounts?Math.round(mrrCents/accounts):null,addonRevenueCents,byPlan:[...plans.values()].sort((a,b)=>b.mrrCents-a.mrrCents),byStatus}}

/** Subscription revenue attributable to a period: MRR prorated by the period's length in 30.44-day months. */
export const periodRevenueCents=(monthlyCents:number,period:Period)=>Math.round(monthlyCents*(Date.parse(period.to)-Date.parse(period.from))/(30.44*86_400_000));
export interface AccountMargin { accountId:string; accountName:string; revenueCents:number; costMicros:number; marginMicros:number; marginRate:number|null }
/** Gross margin per account: period revenue (prorated subscription + add-ons) less vendor cost. Accounts with cost but no revenue (trials, comps) show negative margin. */
export function accountMargins(revenue:{accountId:string;accountName:string;revenueCents:number}[],costs:CostLine[]):AccountMargin[]{const byId=new Map(revenue.map(r=>[r.accountId,{...r,costMicros:0}]));for(const c of costs){const r=byId.get(c.key)??{accountId:c.key,accountName:c.label,revenueCents:0,costMicros:0};r.costMicros+=c.costMicros;byId.set(c.key,r)}return[...byId.values()].map(r=>{const revenueMicros=r.revenueCents*MICROS_PER_CENT;const marginMicros=revenueMicros-r.costMicros;return{...r,marginMicros,marginRate:revenueMicros?marginMicros/revenueMicros:null}}).sort((a,b)=>a.marginMicros-b.marginMicros)}

/** Nearest-rank percentile; null for an empty sample. */
export function percentile(values:number[],p:number):number|null{if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.max(0,Math.ceil(p/100*sorted.length)-1))]}
/** Parses `?range=7d|30d|90d|12m` (default 30d) into an ISO period ending now. */
export function parseRange(range:string|undefined,now=new Date()):Period&{range:string}{const match=/^(\d{1,3})([dm])$/.exec(range??'');const n=match?Math.min(Number(match[1]),match[2]==='m'?24:730):30;const unit=match?.[2]??'d';const from=new Date(now);if(unit==='m')from.setUTCMonth(from.getUTCMonth()-n);else from.setUTCDate(from.getUTCDate()-n);return{from:from.toISOString(),to:now.toISOString(),range:`${n}${unit}`}}
