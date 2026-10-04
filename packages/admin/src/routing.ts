import { ValidationError } from '../../core/src/errors';
import { providerMethods,sourceKey } from '../../core/src/sources';
import { answerEngineProviderIds,providerIds,serpApiProviderIds } from '../../core/src/types';
import type { AnswerEngineProviderId,CollectionMethod,ProviderId,SourceKey } from '../../core/src/types';
import { simulatedVendorSupport } from '../../providers/src/index';
import type { AnswerEngineVendor,ProviderConfig } from '../../providers/src/index';

/** Operator routing that overrides the env defaults without a redeploy. Stored globally in `operator_settings.routing` and per account in `account_controls`. */
export interface RoutingOverrides { simulatedVendors:Partial<Record<AnswerEngineProviderId,AnswerEngineVendor>>; disabledSources:SourceKey[] }
export const emptyRouting=():RoutingOverrides=>({simulatedVendors:{},disabledSources:[]});
export const allSourceKeys:SourceKey[]=providerIds.flatMap(id=>providerMethods[id].map(method=>sourceKey(id,method)));
/** The upstream service that serves a source under a given config. 'mock' when mock providers are on. */
export type Vendor = 'serpapi'|'openai'|'perplexity'|AnswerEngineVendor|'mock';
export const vendorNames:Record<Vendor,string>={serpapi:'SerpApi',openai:'OpenAI',perplexity:'Perplexity',oxylabs:'Oxylabs',dataforseo:'DataForSEO',mock:'Mock (development)'};
export function sourceVendor(provider:ProviderId,method:CollectionMethod,config:Pick<ProviderConfig,'mock'|'simulatedVendors'>):Vendor{if(config.mock)return'mock';if((serpApiProviderIds as readonly string[]).includes(provider))return'serpapi';const engine=provider as AnswerEngineProviderId;return method==='api'?(engine==='chatgpt'?'openai':'perplexity'):config.simulatedVendors[engine]}

/** Validates untrusted routing input (admin request bodies or stored JSON), rejecting vendors an engine cannot use and unknown sources. */
export function parseRouting(input:unknown):RoutingOverrides{if(!input||typeof input!=='object')return emptyRouting();const raw=input as {simulatedVendors?:unknown;disabledSources?:unknown};const simulatedVendors:RoutingOverrides['simulatedVendors']={};if(raw.simulatedVendors&&typeof raw.simulatedVendors==='object'){for(const [engine,vendor] of Object.entries(raw.simulatedVendors)){if(vendor===null||vendor===undefined||vendor==='')continue;if(!(answerEngineProviderIds as readonly string[]).includes(engine))throw new ValidationError(`Unknown engine: ${engine}`);const id=engine as AnswerEngineProviderId;if(!simulatedVendorSupport[id].includes(vendor as AnswerEngineVendor))throw new ValidationError(`${engine} cannot be simulated by ${String(vendor)}; supported: ${simulatedVendorSupport[id].join(', ')}`);simulatedVendors[id]=vendor as AnswerEngineVendor}}const disabled=Array.isArray(raw.disabledSources)?raw.disabledSources:[];const unknown=disabled.find(s=>!allSourceKeys.includes(s as SourceKey));if(unknown!==undefined)throw new ValidationError(`Unknown source: ${String(unknown)}`);return{simulatedVendors,disabledSources:[...new Set(disabled as SourceKey[])]}}
/** Stored JSON is parsed leniently: a corrupt or outdated row must never take sources offline, so it falls back to no overrides. */
export const readRouting=(json:string|null|undefined):RoutingOverrides=>{try{return json?parseRouting(JSON.parse(json)):emptyRouting()}catch{return emptyRouting()}};

/** Applies global then account overrides to the env config. Later layers win for vendors; disabled sources accumulate. */
export function applyRouting(config:ProviderConfig,...layers:RoutingOverrides[]):{config:ProviderConfig;disabled:Set<SourceKey>}{const simulatedVendors={...config.simulatedVendors};const disabled=new Set<SourceKey>();for(const layer of layers){Object.assign(simulatedVendors,layer.simulatedVendors);layer.disabledSources.forEach(s=>disabled.add(s))}return{config:{...config,simulatedVendors},disabled}}
/** Masks availability so disabled sources read as unavailable to customers. */
export const maskAvailability=(available:Record<SourceKey,boolean>,disabled:Set<SourceKey>)=>Object.fromEntries(Object.entries(available).map(([k,v])=>[k,v&&!disabled.has(k as SourceKey)])) as Record<SourceKey,boolean>;
