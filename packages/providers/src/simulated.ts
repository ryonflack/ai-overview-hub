import { AppError } from '../../core/src/errors';
import { countryName } from '../../core/src/sources';
import { providerNames } from '../../core/src/types';
import type { AIVisibilityProvider,AnswerEngineProviderId,NormalizedAIResult,ProviderResult,QueryInput } from '../../core/src/types';
import { basicAuth,buildResult,citationsFrom,fetchProviderJson,first,get,requireCredential,textFrom } from './shared';

// User-simulated collection: a vendor drives a real logged-out session on the consumer product from the requested country and
// parses what the page shows. Vendors are operator-selected per engine and never named to customers. Sessions take up to ~2 minutes.
const SIMULATED_TIMEOUT_MS=180_000;
const CUSTOMER_NAME=(id:AnswerEngineProviderId)=>`${providerNames[id]} (user-simulated)`;

/** Oxylabs Web Scraper API, realtime integration (the connection stays open until the job finishes). Supports ChatGPT and Perplexity. */
export class OxylabsProvider implements AIVisibilityProvider {
  readonly method='simulated' as const;
  readonly name:string;
  constructor(readonly id:AnswerEngineProviderId,private username:string,private password:string,private fetcher:typeof fetch=fetch){this.name=CUSTOMER_NAME(id)}
  async runQuery(input:QueryInput):Promise<ProviderResult>{requireCredential(this.name,this.username,this.password);const raw=await fetchProviderJson(this.name,this.fetcher,'https://realtime.oxylabs.io/v1/queries',{method:'POST',headers:{authorization:basicAuth(this.username,this.password),'content-type':'application/json'},body:JSON.stringify({source:this.id,prompt:input.query,parse:true,...(this.id==='chatgpt'?{search:true}:{}),...(input.location?{geo_location:countryName(input.location.country)}:{})})},SIMULATED_TIMEOUT_MS);const status=Number(get(raw,['results','0','status_code'])??200);if(status>=400)throw new AppError('PROVIDER_ERROR',`${this.name} could not be captured.`,502,true);return{raw,normalized:await this.normalizeResult(raw)}}
  async normalizeResult(raw:unknown):Promise<NormalizedAIResult>{const content=get(raw,['results','0','content'])??raw;const meta={vendor:'oxylabs',parseStatus:get(content,['parse_status_code'])};if(this.id==='chatgpt'){const citations=citationsFrom(first(content,[['citations'],['links']]));return buildResult(this.id,this.method,textFrom(first(content,[['markdown_text'],['response_text']])),citations,get(raw,['results','0','job_id']),{...meta,model:get(content,['llm_model']),searchQueries:get(content,['search_queries'])})}const sources=first(content,[['additional_results','sources_results'],['top_sources']]);return buildResult(this.id,this.method,textFrom(first(content,[['answer_results_md'],['answer_results']])),citationsFrom(sources),get(raw,['results','0','job_id']),{...meta,model:get(content,['model']),relatedQueries:get(content,['related_queries'])})}
}

/** DataForSEO LLM Scraper, live mode. ChatGPT only: DataForSEO's Perplexity product wraps the developer API, so it is not a simulated source. */
export class DataForSeoChatGPTProvider implements AIVisibilityProvider {
  readonly id='chatgpt' as const;
  readonly method='simulated' as const;
  readonly name=CUSTOMER_NAME('chatgpt');
  constructor(private login:string,private password:string,private fetcher:typeof fetch=fetch){}
  async runQuery(input:QueryInput):Promise<ProviderResult>{requireCredential(this.name,this.login,this.password);const location=input.location??{country:'US',language:'en'};const raw=await fetchProviderJson(this.name,this.fetcher,'https://api.dataforseo.com/v3/ai_optimization/chat_gpt/llm_scraper/live/advanced',{method:'POST',headers:{authorization:basicAuth(this.login,this.password),'content-type':'application/json'},body:JSON.stringify([{keyword:input.query.slice(0,2000),location_name:countryName(location.country),language_code:location.language??'en',force_web_search:true}])},SIMULATED_TIMEOUT_MS);
    // DataForSEO reports failures in-band: 20000 is success, 401xx/402xx are account problems, 5xxxx are transient.
    const status=Number(get(raw,['tasks','0','status_code'])??get(raw,['status_code'])??0);if(status!==20000){const top=Number(get(raw,['status_code'])??0);if(top>=40100&&top<40300)throw new AppError('CONFIGURATION_ERROR',`${this.name} rejected the configured credentials.`,502);throw new AppError('PROVIDER_ERROR',`${this.name} could not be captured.`,502,status>=50000||status===0)}return{raw,normalized:await this.normalizeResult(raw)}}
  async normalizeResult(raw:unknown):Promise<NormalizedAIResult>{const result=get(raw,['tasks','0','result','0'])??raw;const items=get(result,['items']);const itemSources=Array.isArray(items)?items.flatMap(i=>{const s=get(i,['sources']);return Array.isArray(s)?s:[]}):[];const sources=get(result,['sources']);const answer=textFrom(get(result,['markdown']))||(Array.isArray(items)?items.map(i=>textFrom(get(i,['markdown']))).filter(Boolean).join('\n'):'');return buildResult(this.id,this.method,answer,citationsFrom(Array.isArray(sources)&&sources.length?sources:itemSources),get(raw,['tasks','0','id']),{vendor:'dataforseo',model:get(result,['model']),cost:get(raw,['tasks','0','cost'])})}
}
