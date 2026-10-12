import data from '../../../packages/core/src/demo-accounts.json';
import {calculateMetrics} from '../../../packages/core/src/analytics';
import {countryName} from '../../../packages/core/src/sources';
import {providerIds,providerNames} from '../../../packages/core/src/types';
import type {CollectionMethod,Location,ProviderId,Run,RunResult} from '../../../packages/core/src/types';

// Fictional demo customers. The same accounts are seeded into the database by scripts/seed-demo-accounts.mjs,
// so the portal switcher and the admin panel show the same companies.
export interface DemoAccount { id:string; name:string; industry:string; domain:string; alternateDomains:string[]; brands:string[]; owner:{name:string;email:string}; location:Location; frequency:string; createdAt:string; strength:number; methods:Partial<Record<ProviderId,CollectionMethod[]>>; competitors:string[]; queries:{text:string;tag:string}[] }
export type Source=[ProviderId,CollectionMethod];

export const demoAccounts:DemoAccount[]=data.accounts.map(a=>({...a,methods:a.methods as DemoAccount['methods'],queries:a.queries.map(([text,tag])=>({text,tag}))}));
/** Latest first. Each account's history runs monthly back from the latest run. */
export const runDates=['2026-09-04','2026-08-04','2026-07-04'];
export const formatDate=(iso:string)=>new Date(`${iso.slice(0,10)}T12:00:00Z`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
export const runsFor=(a:DemoAccount)=>runDates.filter(d=>d>=a.createdAt.slice(0,10)).map((date,index)=>({id:`${a.id}_${date.slice(0,7)}`,date,index}));
export const sourcesFor=(a:DemoAccount):Source[]=>providerIds.flatMap(id=>(a.methods[id]??[]).map(m=>[id,m] as Source));
export const sourceLabel=([id,method]:Source)=>id==='chatgpt'||id==='perplexity'?`${providerNames[id]} · ${method==='api'?'API':'Simulated'}`:providerNames[id];
export const placeLabel=(l:Location)=>[l.city,l.region,countryName(l.country)].filter(Boolean).join(', ');

// Deterministic so each account looks the same on every visit.
const seeded=(s:string)=>{let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return(h>>>0)/4294967296};
export function demoResult(a:DemoAccount,query:string,[provider,method]:Source,runIndex:number):RunResult{
  const key=`${a.id}|${query}|${provider}|${method}`;const strength=a.strength*(1-.14*runIndex);
  const answerPresent=seeded(`${key}|answer|${runIndex}`)>.12;const r=seeded(`${key}|cite`)+.06*runIndex*seeded(`${key}|drift|${runIndex}`);
  const cited=answerPresent&&r<strength;const mentioned=answerPresent&&(cited||r<strength*1.35);
  const domains=a.competitors.filter((_,i)=>seeded(`${key}|${i}`)>.45).slice(0,4);const position=cited?1+Math.floor(seeded(`${key}|pos|${runIndex}`)*3):undefined;
  const list=cited?[...domains.slice(0,position!-1),a.domain,...domains.slice(position!-1)]:domains;
  return{queryId:query,query,provider,method,status:'SUCCESS',customerCited:cited,customerMentioned:mentioned,citationPosition:position,
    result:answerPresent?{provider,method,answerPresent,answerText:`Example ${providerNames[provider]} answer for “${query}”.`,citations:list.map((domain,i)=>({url:`https://${domain}/`,domain,position:i+1,title:domain})),uniqueDomains:list,executedAt:`${runDates[runIndex]}T14:00:00Z`,metadata:{}}:undefined}
}
export function demoRun(a:DemoAccount,runIndex:number,queries=a.queries.map(q=>q.text)):Run{
  const id=`${a.id}_${runDates[runIndex].slice(0,7)}`;
  return{id,accountId:a.id,projectId:`${a.id}_project`,status:'COMPLETED',requestId:id,createdAt:`${runDates[runIndex]}T14:00:00Z`,completedAt:`${runDates[runIndex]}T14:42:00Z`,results:queries.flatMap(q=>sourcesFor(a).map(s=>demoResult(a,q,s,runIndex)))}
}
export const visibleOn=(rows:RunResult[])=>rows.filter(r=>r.customerCited||r.customerMentioned).length;
export const metricsFor=(a:DemoAccount,runIndex:number)=>calculateMetrics(demoRun(a,runIndex).results);
