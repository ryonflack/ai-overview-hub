export const providerIds = ['google-ai-overview','google-ai-mode','bing-copilot','duckduckgo-search-assist','naver-ai-overview'] as const;
export type ProviderId = typeof providerIds[number];
export type JobState = 'PENDING'|'RUNNING'|'RETRY'|'SUCCESS'|'FAILED';
export type RunStatus = 'QUEUED'|'RUNNING'|'COMPLETED'|'COMPLETED_WITH_ERRORS'|'FAILED';
export interface QueryInput { query:string; locale?:string; requestId:string }
export interface Citation { title?:string; url:string; domain:string; position:number; abstract?:string }
export interface NormalizedAIResult { provider:ProviderId; answerPresent:boolean; answerText:string; citations:Citation[]; uniqueDomains:string[]; searchId?:string; executedAt:string; metadata:Record<string,unknown> }
export interface ProviderResult { raw:unknown; normalized:NormalizedAIResult }
export interface AIVisibilityProvider { readonly id:ProviderId; readonly name:string; runQuery(input:QueryInput):Promise<ProviderResult>; normalizeResult(raw:unknown):Promise<NormalizedAIResult> }
export interface Project { id:string; accountId:string; name:string; primaryDomain:string; alternateDomains:string[]; providers:ProviderId[]; frequency:'manual'|'monthly'|'biweekly'|'weekly'; createdAt:string }
export interface RunResult { queryId:string; query:string; provider:ProviderId; status:JobState; result?:NormalizedAIResult; customerCited:boolean; customerMentioned:boolean; citationPosition?:number; error?:{code:string;message:string;attempts:number} }
export interface Run { id:string; accountId:string; projectId:string; status:RunStatus; results:RunResult[]; createdAt:string; completedAt?:string; requestId:string }
export interface Plan { id:string; name:string; stripePriceId:string; monthlyPrice:number; maxQueries:number; allowedProviders:ProviderId[]; runFrequency:Project['frequency'][]; active:boolean }
