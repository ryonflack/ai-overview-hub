export const serpApiProviderIds = ['google-ai-overview','google-ai-mode','bing-copilot','duckduckgo-search-assist','naver-ai-overview'] as const;
export const answerEngineProviderIds = ['perplexity','chatgpt'] as const;
export const providerIds = [...serpApiProviderIds,...answerEngineProviderIds] as const;
export type SerpApiProviderId = typeof serpApiProviderIds[number];
export type AnswerEngineProviderId = typeof answerEngineProviderIds[number];
export type ProviderId = typeof providerIds[number];
export const providerNames:Record<ProviderId,string>={'google-ai-overview':'Google AI Overview','google-ai-mode':'Google AI Mode','bing-copilot':'Bing Copilot','duckduckgo-search-assist':'DuckDuckGo','naver-ai-overview':'Naver','perplexity':'Perplexity','chatgpt':'ChatGPT'};
/** How an answer is collected. `api`: the engine's first-party developer API. `simulated`: a real user session on the consumer product, collected by a backend vendor. */
export const collectionMethods = ['api','simulated'] as const;
export type CollectionMethod = typeof collectionMethods[number];
/** Operator-controlled vendors behind `simulated` collection. Never exposed to customers. */
export type SimulatedVendor = 'serpapi'|'oxylabs'|'dataforseo';
/** A source is one engine collected one way; it is the unit of work and of usage. */
export type SourceKey = `${ProviderId}:${CollectionMethod}`;
export interface Location { country:string; region?:string; city?:string; language?:string }
export type JobState = 'PENDING'|'RUNNING'|'RETRY'|'SUCCESS'|'FAILED';
export type RunStatus = 'QUEUED'|'RUNNING'|'COMPLETED'|'COMPLETED_WITH_ERRORS'|'FAILED';
export interface QueryInput { query:string; location?:Location; requestId:string }
export interface Citation { title?:string; url:string; domain:string; position:number; abstract?:string }
export interface NormalizedAIResult { provider:ProviderId; method:CollectionMethod; answerPresent:boolean; answerText:string; citations:Citation[]; uniqueDomains:string[]; searchId?:string; executedAt:string; metadata:Record<string,unknown> }
export interface ProviderResult { raw:unknown; normalized:NormalizedAIResult }
export interface AIVisibilityProvider { readonly id:ProviderId; readonly method:CollectionMethod; readonly name:string; runQuery(input:QueryInput):Promise<ProviderResult>; normalizeResult(raw:unknown):Promise<NormalizedAIResult> }
export type ProviderRegistry = Partial<Record<SourceKey,AIVisibilityProvider>>;
export interface Project { id:string; accountId:string; name:string; primaryDomain:string; alternateDomains:string[]; providers:ProviderId[]; /** Collection methods per engine; engines left out use their default method. */ methods?:Partial<Record<ProviderId,CollectionMethod[]>>; location?:Location; frequency:'manual'|'monthly'|'biweekly'|'weekly'; createdAt:string }
export interface RunResult { queryId:string; query:string; provider:ProviderId; method:CollectionMethod; status:JobState; result?:NormalizedAIResult; customerCited:boolean; customerMentioned:boolean; citationPosition?:number; error?:{code:string;message:string;attempts:number} }
export interface Run { id:string; accountId:string; projectId:string; status:RunStatus; results:RunResult[]; createdAt:string; completedAt?:string; requestId:string }
export interface Plan { id:string; name:string; stripePriceId:string; monthlyPrice:number; maxQueries:number; allowedProviders:ProviderId[]; runFrequency:Project['frequency'][]; /** Price per additional collection method per query, in cents; null until pricing is set. */ addonUnitPrice:number|null; active:boolean }
