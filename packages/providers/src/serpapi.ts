import { AppError, ProviderTimeoutError } from '../../core/src/errors';
import { normalizeDomain } from '../../core/src/domain';
import type { AIVisibilityProvider,Citation,NormalizedAIResult,ProviderId,ProviderResult,QueryInput } from '../../core/src/types';

type PathConfig={answerPaths:string[][];citationPaths:string[][];engine:string};
const configs:Record<ProviderId,PathConfig>={
  'google-ai-overview':{engine:'google',answerPaths:[['ai_overview','text'],['ai_overview','markdown']],citationPaths:[['ai_overview','references'],['ai_overview','sources']]},
  'google-ai-mode':{engine:'google_ai_mode',answerPaths:[['text'],['markdown'],['ai_response','text']],citationPaths:[['references'],['sources']]},
  'bing-copilot':{engine:'bing_copilot',answerPaths:[['answer'],['text'],['copilot_answer']],citationPaths:[['references'],['sources']]},
  'duckduckgo-search-assist':{engine:'duckduckgo',answerPaths:[['answer'],['expanded_answer'],['ai_answer']],citationPaths:[['sources'],['references']]},
  'naver-ai-overview':{engine:'naver',answerPaths:[['ai_briefing','answer'],['ai_overview','text']],citationPaths:[['ai_briefing','sources'],['ai_overview','references']]}
};
const get=(source:unknown,path:string[]):unknown=>path.reduce<unknown>((v,k)=>v&&typeof v==='object'?(v as Record<string,unknown>)[k]:undefined,source);
const first=(raw:unknown,paths:string[][])=>paths.map(p=>get(raw,p)).find(v=>v!==undefined);
const textFrom=(v:unknown):string=>typeof v==='string'?v:Array.isArray(v)?v.map(textFrom).filter(Boolean).join('\n'):v&&typeof v==='object'?textFrom((v as Record<string,unknown>).text??(v as Record<string,unknown>).snippet??''):'';
const citationsFrom=(v:unknown):Citation[]=>Array.isArray(v)?v.flatMap((item,index)=>{if(typeof item==='string')item={link:item};if(!item||typeof item!=='object')return[];const r=item as Record<string,unknown>;const url=String(r.link??r.url??r.source??'');if(!url)return[];try{return[{url,title:String(r.title??'')||undefined,abstract:String(r.snippet??r.abstract??'')||undefined,domain:normalizeDomain(url),position:index+1}]}catch{return[]}}):[];

export class SerpApiProvider implements AIVisibilityProvider {
  readonly name:string;
  constructor(readonly id:ProviderId,private apiKey:string,private fetcher:typeof fetch=fetch){this.name=id.split('-').map(w=>w[0].toUpperCase()+w.slice(1)).join(' ')}
  async runQuery(input:QueryInput):Promise<ProviderResult>{const params=new URLSearchParams({engine:configs[this.id].engine,q:input.query,api_key:this.apiKey});let response:Response;try{response=await this.fetcher(`https://serpapi.com/search.json?${params}`,{signal:AbortSignal.timeout(25_000),headers:{'X-Request-ID':input.requestId}})}catch(error){if(error instanceof DOMException||error instanceof Error)throw new ProviderTimeoutError(this.name);throw error}if(response.status===429)throw new AppError('PROVIDER_RATE_LIMIT',`${this.name} is temporarily rate limited.`,429,true);if(!response.ok)throw new AppError('PROVIDER_ERROR',`${this.name} returned an unavailable response.`,502,response.status>=500);const raw=await response.json();if(this.id==='google-ai-overview'){const token=get(raw,['ai_overview','page_token']);if(typeof token==='string'){const follow=await this.fetcher(`https://serpapi.com/search.json?${new URLSearchParams({engine:'google_ai_overview',page_token:token,api_key:this.apiKey})}`);if(follow.ok){const overview=await follow.json();return{raw:{search:raw,overview},normalized:await this.normalizeResult(overview)}}}}return{raw,normalized:await this.normalizeResult(raw)}}
  async normalizeResult(raw:unknown):Promise<NormalizedAIResult>{const source=get(raw,['overview'])??raw;const answer=textFrom(first(source,configs[this.id].answerPaths));const citations=citationsFrom(first(source,configs[this.id].citationPaths));return{provider:this.id,answerPresent:Boolean(answer),answerText:answer,citations,uniqueDomains:[...new Set(citations.map(c=>c.domain))],searchId:String(get(source,['search_metadata','id'])??'')||undefined,executedAt:new Date().toISOString(),metadata:{engine:configs[this.id].engine}}}
}

export class MockProvider extends SerpApiProvider { constructor(id:ProviderId){super(id,'mock')} override async runQuery(input:QueryInput):Promise<ProviderResult>{const domain=input.query.toLowerCase().includes('crm')?'example.com':'research.example';const raw={answer:`Independent sources compare options for ${input.query}. Example is frequently considered.`,references:[{title:'Practical guide',link:`https://${domain}/guide`},{title:'Community discussion',link:'https://reddit.com/r/marketing'}],search_metadata:{id:`mock_${this.id}_${input.query.length}`}};return{raw,normalized:await this.normalizeResult(raw)}} }
export const createProviders=(mock:boolean,key='')=>Object.fromEntries((Object.keys(configs) as ProviderId[]).map(id=>[id,mock?new MockProvider(id):new SerpApiProvider(id,key)])) as unknown as Record<ProviderId,AIVisibilityProvider>;
