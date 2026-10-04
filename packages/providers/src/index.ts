import { AppError } from '../../core/src/errors';
import { providerMethods,sourceKey } from '../../core/src/sources';
import { answerEngineProviderIds,providerIds } from '../../core/src/types';
import type { AIVisibilityProvider,AnswerEngineProviderId,CollectionMethod,NormalizedAIResult,ProviderId,ProviderRegistry,ProviderResult,QueryInput,SourceKey } from '../../core/src/types';
import { OpenAIChatGPTProvider,PerplexityProvider } from './answerEngines';
import { SerpApiProvider } from './serpapi';
import { buildResult,citationsFrom } from './shared';
import { DataForSeoChatGPTProvider,OxylabsProvider } from './simulated';

export { SerpApiProvider } from './serpapi';
export { OpenAIChatGPTProvider,PerplexityProvider } from './answerEngines';
export { DataForSeoChatGPTProvider,OxylabsProvider } from './simulated';

export type AnswerEngineVendor = 'oxylabs'|'dataforseo';
/** Vendors able to simulate each answer engine. DataForSEO has no simulated Perplexity product. */
export const simulatedVendorSupport:Record<AnswerEngineProviderId,readonly AnswerEngineVendor[]>={chatgpt:['oxylabs','dataforseo'],perplexity:['oxylabs']};
export interface ProviderConfig { mock?:boolean; serpApiKey?:string; perplexityApiKey?:string; perplexityPreset?:string; openaiApiKey?:string; openaiModel?:string; oxylabsUsername?:string; oxylabsPassword?:string; dataForSeoLogin?:string; dataForSeoPassword?:string; simulatedVendors:Record<AnswerEngineProviderId,AnswerEngineVendor> }

const isVendor=(v:string|undefined):v is AnswerEngineVendor=>v==='oxylabs'||v==='dataforseo';
/** Reads provider credentials and the operator's simulated-vendor routing. SIMULATED_VENDOR sets the default for every engine that supports it;
 * SIMULATED_VENDOR_<ENGINE> pins one engine and must name a vendor that engine supports. */
export function providerConfigFromEnv(bindings:object):ProviderConfig{const env=Object.fromEntries(Object.entries(bindings).filter(([,v])=>typeof v==='string')) as Record<string,string|undefined>;const fallback=env.SIMULATED_VENDOR?.trim().toLowerCase()||'oxylabs';if(!isVendor(fallback))throw new AppError('CONFIGURATION_ERROR',`Unknown SIMULATED_VENDOR: ${fallback}`,500);const simulatedVendors=Object.fromEntries(answerEngineProviderIds.map(id=>{const pinned=env[`SIMULATED_VENDOR_${id.toUpperCase()}`]?.trim().toLowerCase();if(pinned){if(!isVendor(pinned)||!simulatedVendorSupport[id].includes(pinned))throw new AppError('CONFIGURATION_ERROR',`SIMULATED_VENDOR_${id.toUpperCase()} cannot be ${pinned}; supported: ${simulatedVendorSupport[id].join(', ')}`,500);return[id,pinned]}return[id,simulatedVendorSupport[id].includes(fallback)?fallback:simulatedVendorSupport[id][0]]})) as Record<AnswerEngineProviderId,AnswerEngineVendor>;return{mock:env.USE_MOCK_SERP_PROVIDERS==='true',serpApiKey:env.SERPAPI_API_KEY,perplexityApiKey:env.PERPLEXITY_API_KEY,perplexityPreset:env.PERPLEXITY_PRESET,openaiApiKey:env.OPENAI_API_KEY,openaiModel:env.OPENAI_MODEL,oxylabsUsername:env.OXYLABS_USERNAME,oxylabsPassword:env.OXYLABS_PASSWORD,dataForSeoLogin:env.DATAFORSEO_LOGIN,dataForSeoPassword:env.DATAFORSEO_PASSWORD,simulatedVendors}}

export class MockProvider implements AIVisibilityProvider {
  readonly name:string;
  constructor(readonly id:ProviderId,readonly method:CollectionMethod=providerMethods[id][0]){this.name=`${id}:${method}`}
  async runQuery(input:QueryInput):Promise<ProviderResult>{const domain=input.query.toLowerCase().includes('crm')?'example.com':'research.example';const raw={text:`Independent sources compare options for ${input.query}. Example is frequently considered.`,references:[{title:'Practical guide',link:`https://${domain}/guide`},{title:'Community discussion',link:'https://reddit.com/r/marketing'}],search_metadata:{id:`mock_${this.id}_${this.method}_${input.query.length}`},location:input.location};return{raw,normalized:await this.normalizeResult(raw)}}
  async normalizeResult(raw:unknown):Promise<NormalizedAIResult>{const r=raw as {text?:string;references?:unknown;search_metadata?:{id?:string}};return buildResult(this.id,this.method,r.text??'',citationsFrom(r.references),r.search_metadata?.id,{engine:'mock'})}
}

function live(id:ProviderId,method:CollectionMethod,c:ProviderConfig):AIVisibilityProvider{if(id==='perplexity'||id==='chatgpt'){if(method==='api')return id==='perplexity'?new PerplexityProvider(c.perplexityApiKey??'',c.perplexityPreset||undefined):new OpenAIChatGPTProvider(c.openaiApiKey??'',c.openaiModel||undefined);return id==='chatgpt'&&c.simulatedVendors.chatgpt==='dataforseo'?new DataForSeoChatGPTProvider(c.dataForSeoLogin??'',c.dataForSeoPassword??''):new OxylabsProvider(id,c.oxylabsUsername??'',c.oxylabsPassword??'')}return new SerpApiProvider(id,c.serpApiKey??'')}
const allSources=()=>providerIds.flatMap(id=>providerMethods[id].map(method=>({id,method})));
export const createProviders=(config:ProviderConfig):ProviderRegistry=>Object.fromEntries(allSources().map(({id,method})=>[sourceKey(id,method),config.mock?new MockProvider(id,method):live(id,method,config)]));
/** Whether each source has the credentials it needs, so the portal can disable sources the operator has not configured. */
export function sourceAvailability(config:ProviderConfig):Record<SourceKey,boolean>{const has=(...v:(string|undefined)[])=>Boolean(config.mock)||v.every(Boolean);return Object.fromEntries(allSources().map(({id,method})=>{const key=sourceKey(id,method);if(id!=='perplexity'&&id!=='chatgpt')return[key,has(config.serpApiKey)];if(method==='api')return[key,id==='perplexity'?has(config.perplexityApiKey):has(config.openaiApiKey)];return[key,config.simulatedVendors[id]==='dataforseo'?has(config.dataForSeoLogin,config.dataForSeoPassword):has(config.oxylabsUsername,config.oxylabsPassword)]})) as Record<SourceKey,boolean>}
