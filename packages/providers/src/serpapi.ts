import { countryName } from '../../core/src/sources';
import { providerNames } from '../../core/src/types';
import type { AIVisibilityProvider,Location,NormalizedAIResult,ProviderResult,QueryInput,SerpApiProviderId } from '../../core/src/types';
import { citationsFrom,fetchProviderJson,first,get,textFrom } from './shared';

type PathConfig={answerPaths:string[][];citationPaths:string[][];engine:string};
// Google engines take gl/hl and an optional canonical location; SerpApi spells the United Kingdom `uk`.
const googleLocation=(l:Location)=>({gl:l.country==='GB'?'uk':l.country.toLowerCase(),...(l.language?{hl:l.language}:{}),...(l.city||l.region?{location:[l.city,l.region,countryName(l.country)].filter(Boolean).join(',')}:{})});
const locationParams:Partial<Record<SerpApiProviderId,(l:Location)=>Record<string,string>>>={'google-ai-overview':googleLocation,'google-ai-mode':googleLocation};
const configs:Record<SerpApiProviderId,PathConfig>={
  'google-ai-overview':{engine:'google',answerPaths:[['ai_overview','text'],['ai_overview','markdown']],citationPaths:[['ai_overview','references'],['ai_overview','sources']]},
  'google-ai-mode':{engine:'google_ai_mode',answerPaths:[['text'],['markdown'],['ai_response','text']],citationPaths:[['references'],['sources']]},
  'bing-copilot':{engine:'bing_copilot',answerPaths:[['answer'],['text'],['copilot_answer']],citationPaths:[['references'],['sources']]},
  'duckduckgo-search-assist':{engine:'duckduckgo',answerPaths:[['answer'],['expanded_answer'],['ai_answer']],citationPaths:[['sources'],['references']]},
  'naver-ai-overview':{engine:'naver',answerPaths:[['ai_briefing','answer'],['ai_overview','text']],citationPaths:[['ai_briefing','sources'],['ai_overview','references']]}
};

export class SerpApiProvider implements AIVisibilityProvider {
  readonly name:string;
  readonly method='simulated' as const;
  constructor(readonly id:SerpApiProviderId,private apiKey:string,private fetcher:typeof fetch=fetch){this.name=providerNames[id]}
  async runQuery(input:QueryInput):Promise<ProviderResult>{const params=new URLSearchParams({engine:configs[this.id].engine,q:input.query,...(input.location?locationParams[this.id]?.(input.location):{}),api_key:this.apiKey});const raw=await fetchProviderJson(this.name,this.fetcher,`https://serpapi.com/search.json?${params}`,{headers:{'X-Request-ID':input.requestId}});if(this.id==='google-ai-overview'){const token=get(raw,['ai_overview','page_token']);if(typeof token==='string'){const follow=await this.fetcher(`https://serpapi.com/search.json?${new URLSearchParams({engine:'google_ai_overview',page_token:token,api_key:this.apiKey})}`);if(follow.ok){const overview=await follow.json();return{raw:{search:raw,overview},normalized:await this.normalizeResult(overview)}}}}return{raw,normalized:await this.normalizeResult(raw)}}
  async normalizeResult(raw:unknown):Promise<NormalizedAIResult>{const source=get(raw,['overview'])??raw;const answer=textFrom(first(source,configs[this.id].answerPaths));const citations=citationsFrom(first(source,configs[this.id].citationPaths));return{provider:this.id,method:this.method,answerPresent:Boolean(answer),answerText:answer,citations,uniqueDomains:[...new Set(citations.map(c=>c.domain))],searchId:String(get(source,['search_metadata','id'])??'')||undefined,executedAt:new Date().toISOString(),metadata:{engine:configs[this.id].engine,vendor:'serpapi'}}}
}
