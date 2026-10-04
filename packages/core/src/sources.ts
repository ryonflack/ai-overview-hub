import { ValidationError } from './errors';
import { collectionMethods,providerIds,providerNames } from './types';
import type { CollectionMethod,Location,Plan,Project,ProviderId,SourceKey } from './types';

export const sourceKey=(provider:ProviderId,method:CollectionMethod):SourceKey=>`${provider}:${method}`;
export const methodLabels:Record<CollectionMethod,{label:string;description:string}>={
  api:{label:'Direct API',description:"Answers from the engine's official developer API: fast, consistent, and repeatable."},
  simulated:{label:'User-simulated response',description:'Answers captured from a real session on the consumer product, as a logged-out user in the selected location sees them.'}
};
/** Methods each engine supports, default first. SerpApi-backed engines are only available as captured result pages. */
export const providerMethods:Record<ProviderId,readonly CollectionMethod[]>={'google-ai-overview':['simulated'],'google-ai-mode':['simulated'],'bing-copilot':['simulated'],'duckduckgo-search-assist':['simulated'],'naver-ai-overview':['simulated'],perplexity:['api','simulated'],chatgpt:['api','simulated']};
/** Engines that apply the project location. The others answer from their default market. */
export const locationAwareProviders:readonly ProviderId[]=['google-ai-overview','google-ai-mode','perplexity','chatgpt'];

export const countries=[['US','United States','en'],['GB','United Kingdom','en'],['CA','Canada','en'],['AU','Australia','en'],['IE','Ireland','en'],['NZ','New Zealand','en'],['IN','India','en'],['SG','Singapore','en'],['DE','Germany','de'],['AT','Austria','de'],['CH','Switzerland','de'],['FR','France','fr'],['BE','Belgium','fr'],['ES','Spain','es'],['MX','Mexico','es'],['AR','Argentina','es'],['IT','Italy','it'],['NL','Netherlands','nl'],['SE','Sweden','sv'],['DK','Denmark','da'],['NO','Norway','nb'],['PL','Poland','pl'],['BR','Brazil','pt'],['PT','Portugal','pt'],['JP','Japan','ja'],['KR','South Korea','ko']] as const;
export const languages=[['en','English'],['de','German'],['fr','French'],['es','Spanish'],['it','Italian'],['nl','Dutch'],['sv','Swedish'],['da','Danish'],['nb','Norwegian'],['pl','Polish'],['pt','Portuguese'],['ja','Japanese'],['ko','Korean']] as const;
export const defaultLocation:Location={country:'US',language:'en'};
const country=(code:string)=>countries.find(c=>c[0]===code.toUpperCase());
export const countryName=(code:string)=>country(code)?.[1]??code;
/** Fills in the country's primary language and validates codes so every provider receives the same normalized location. */
export function normalizeLocation(input:Partial<Location>|undefined):Location{const value={...defaultLocation,...Object.fromEntries(Object.entries(input??{}).filter(([,v])=>typeof v==='string'&&v.trim()).map(([k,v])=>[k,(v as string).trim()]))};const match=country(value.country);if(!match)throw new ValidationError(`Unsupported country: ${value.country}`);const language=(input?.language||match[2]).toLowerCase();if(!languages.some(l=>l[0]===language))throw new ValidationError(`Unsupported language: ${language}`);return{country:match[0],language,...(value.region?{region:value.region.slice(0,80)}:{}),...(value.city?{city:value.city.slice(0,80)}:{})}}

export interface SourceSelection { provider:ProviderId; method:CollectionMethod }
/** Expands a project's engines and per-engine methods into the sources a run executes, rejecting unknown or unsupported combinations. */
export function resolveSources(project:Pick<Project,'providers'|'methods'>):SourceSelection[]{if(!project.providers.length)throw new ValidationError('Select at least one AI source.');const seen=new Set<SourceKey>();return project.providers.flatMap(provider=>{if(!providerIds.includes(provider))throw new ValidationError(`Unknown AI source: ${provider}`);const supported=providerMethods[provider];const methods=project.methods?.[provider]?.length?project.methods[provider]!:[supported[0]];return methods.flatMap(method=>{if(!collectionMethods.includes(method)||!supported.includes(method))throw new ValidationError(`${providerNames[provider]} does not support ${methodLabels[method]?.label??method}.`);const key=sourceKey(provider,method);if(seen.has(key))return[];seen.add(key);return[{provider,method}]})})}

export interface RunQuote { queries:number; sources:number; checks:number; includedChecks:number; addonChecks:number; addonUnitPrice:number|null; addonTotal:number|null }
/** The plan includes one collection method per engine for every query; each extra method on an engine is billed per query as an add-on. */
export function quoteRun(project:Pick<Project,'providers'|'methods'>,queryCount:number,plan:Pick<Plan,'maxQueries'|'addonUnitPrice'|'allowedProviders'>):RunQuote{if(!Number.isInteger(queryCount)||queryCount<1)throw new ValidationError('Add at least one query.');if(queryCount>plan.maxQueries)throw new ValidationError(`Your plan allows up to ${plan.maxQueries} queries.`);const sources=resolveSources(project);const blocked=sources.find(s=>!plan.allowedProviders.includes(s.provider));if(blocked)throw new ValidationError(`${providerNames[blocked.provider]} is not included in your plan.`);const engines=new Set(sources.map(s=>s.provider)).size;const checks=queryCount*sources.length;const includedChecks=queryCount*engines;const addonChecks=checks-includedChecks;return{queries:queryCount,sources:sources.length,checks,includedChecks,addonChecks,addonUnitPrice:plan.addonUnitPrice,addonTotal:plan.addonUnitPrice===null?null:addonChecks*plan.addonUnitPrice}}
