import { AppError } from '../../core/src/errors';
import { providerNames } from '../../core/src/types';
import type { AIVisibilityProvider,AnswerEngineProviderId,NormalizedAIResult,ProviderResult,QueryInput } from '../../core/src/types';
import { citationsFrom,fetchProviderJson,get,textFrom } from './shared';

// Answer engines are queried through their first-party APIs, which reflect the same retrieval stack as the consumer
// products but are not byte-for-byte identical to what a signed-in user sees. Answers routinely take 10-40s.
const ANSWER_ENGINE_TIMEOUT_MS=60_000;
const requireKey=(name:string,key:string)=>{if(!key)throw new AppError('CONFIGURATION_ERROR',`${name} is not configured.`,503)};
const messageParts=(items:Record<string,unknown>[])=>items.filter(i=>i?.type==='message').flatMap(i=>Array.isArray(i.content)?i.content as Record<string,unknown>[]:[]).filter(p=>p?.type==='output_text');
const outputText=(items:Record<string,unknown>[])=>messageParts(items).map(p=>typeof p.text==='string'?p.text:'').filter(Boolean).join('\n');
const urlCitations=(items:Record<string,unknown>[])=>messageParts(items).flatMap(p=>Array.isArray(p.annotations)?p.annotations as Record<string,unknown>[]:[]).filter(a=>a?.type==='url_citation');
const result=(provider:AnswerEngineProviderId,answer:string,citations:ReturnType<typeof citationsFrom>,searchId:unknown,metadata:Record<string,unknown>):NormalizedAIResult=>({provider,answerPresent:Boolean(answer.trim()),answerText:answer,citations,uniqueDomains:[...new Set(citations.map(c=>c.domain))],searchId:typeof searchId==='string'&&searchId?searchId:undefined,executedAt:new Date().toISOString(),metadata});

/** Perplexity Agent API (successor to Sonar chat completions, retired 2026-09-27). Presets bundle Perplexity's model and search budget;
 * numbered `search_results` map to the `[n]` markers in the answer. Legacy Sonar payloads still normalize for stored raw results. */
export class PerplexityProvider implements AIVisibilityProvider {
  readonly id='perplexity' as const;
  readonly name=providerNames.perplexity;
  constructor(private apiKey:string,private preset='fast',private fetcher:typeof fetch=fetch){}
  async runQuery(input:QueryInput):Promise<ProviderResult>{requireKey(this.name,this.apiKey);const raw=await fetchProviderJson(this.name,this.fetcher,'https://api.perplexity.ai/v1/agent',{method:'POST',headers:{authorization:`Bearer ${this.apiKey}`,'content-type':'application/json','X-Request-ID':input.requestId},body:JSON.stringify({preset:this.preset,input:input.query})},ANSWER_ENGINE_TIMEOUT_MS);return{raw,normalized:await this.normalizeResult(raw)}}
  async normalizeResult(raw:unknown):Promise<NormalizedAIResult>{const output=get(raw,['output']);const items=Array.isArray(output)?output as Record<string,unknown>[]:[];const answer=items.length?outputText(items):textFrom(get(raw,['choices','0','message','content']));const agentResults=items.filter(i=>i?.type==='search_results').flatMap(i=>Array.isArray(i.results)?i.results:[]);const legacyResults=get(raw,['search_results']);const sources=agentResults.length?agentResults:Array.isArray(legacyResults)&&legacyResults.length?legacyResults:items.length?urlCitations(items):get(raw,['citations']);return result(this.id,answer,citationsFrom(sources),get(raw,['id']),{engine:'perplexity_agent',preset:this.preset,model:get(raw,['model']),cost:get(raw,['usage','cost','total_cost'])})}
}

/** OpenAI Responses API with the hosted web_search tool, the retrieval path behind ChatGPT search. Citations are the inline url_citation annotations shown to users. */
export class OpenAIChatGPTProvider implements AIVisibilityProvider {
  readonly id='chatgpt' as const;
  readonly name=providerNames.chatgpt;
  constructor(private apiKey:string,private model='gpt-5-mini',private fetcher:typeof fetch=fetch){}
  async runQuery(input:QueryInput):Promise<ProviderResult>{requireKey(this.name,this.apiKey);const raw=await fetchProviderJson(this.name,this.fetcher,'https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:`Bearer ${this.apiKey}`,'content-type':'application/json','X-Client-Request-Id':input.requestId},body:JSON.stringify({model:this.model,input:input.query,tools:[{type:'web_search'}],include:['web_search_call.action.sources'],store:false})},ANSWER_ENGINE_TIMEOUT_MS);return{raw,normalized:await this.normalizeResult(raw)}}
  async normalizeResult(raw:unknown):Promise<NormalizedAIResult>{const output=get(raw,['output']);const items=Array.isArray(output)?output as Record<string,unknown>[]:[];const answer=outputText(items);const annotations=urlCitations(items);const sourcesConsulted=items.filter(i=>i?.type==='web_search_call').reduce((n,i)=>{const sources=get(i,['action','sources']);return n+(Array.isArray(sources)?sources.length:0)},0);return result(this.id,answer,citationsFrom(annotations),get(raw,['id']),{engine:'openai_responses',model:get(raw,['model'])??this.model,webSearchUsed:items.some(i=>i?.type==='web_search_call'),sourcesConsulted})}
}
