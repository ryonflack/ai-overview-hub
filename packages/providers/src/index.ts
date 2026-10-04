import { providerIds } from '../../core/src/types';
import type { AIVisibilityProvider,NormalizedAIResult,ProviderId,ProviderResult,QueryInput } from '../../core/src/types';
import { OpenAIChatGPTProvider,PerplexityProvider } from './answerEngines';
import { SerpApiProvider } from './serpapi';
import { citationsFrom } from './shared';

export { SerpApiProvider } from './serpapi';
export { OpenAIChatGPTProvider,PerplexityProvider } from './answerEngines';
export interface ProviderCredentials { serpApiKey?:string; perplexityApiKey?:string; perplexityModel?:string; openaiApiKey?:string; openaiModel?:string }

export class MockProvider implements AIVisibilityProvider {
  readonly name:string;
  constructor(readonly id:ProviderId){this.name=id}
  async runQuery(input:QueryInput):Promise<ProviderResult>{const domain=input.query.toLowerCase().includes('crm')?'example.com':'research.example';const raw={text:`Independent sources compare options for ${input.query}. Example is frequently considered.`,references:[{title:'Practical guide',link:`https://${domain}/guide`},{title:'Community discussion',link:'https://reddit.com/r/marketing'}],search_metadata:{id:`mock_${this.id}_${input.query.length}`}};return{raw,normalized:await this.normalizeResult(raw)}}
  async normalizeResult(raw:unknown):Promise<NormalizedAIResult>{const r=raw as {text?:string;references?:unknown;search_metadata?:{id?:string}};const citations=citationsFrom(r.references);return{provider:this.id,answerPresent:Boolean(r.text),answerText:r.text??'',citations,uniqueDomains:[...new Set(citations.map(c=>c.domain))],searchId:r.search_metadata?.id,executedAt:new Date().toISOString(),metadata:{engine:'mock'}}}
}

const live=(id:ProviderId,c:ProviderCredentials):AIVisibilityProvider=>id==='perplexity'?new PerplexityProvider(c.perplexityApiKey??'',c.perplexityModel||undefined):id==='chatgpt'?new OpenAIChatGPTProvider(c.openaiApiKey??'',c.openaiModel||undefined):new SerpApiProvider(id,c.serpApiKey??'');
export const createProviders=(mock:boolean,credentials:ProviderCredentials={})=>Object.fromEntries(providerIds.map(id=>[id,mock?new MockProvider(id):live(id,credentials)])) as Record<ProviderId,AIVisibilityProvider>;
