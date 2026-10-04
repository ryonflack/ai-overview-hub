# Providers

Each SerpApi engine implements `AIVisibilityProvider`. It runs a query and converts provider-specific answer/reference paths into `NormalizedAIResult`. Google AI Overview follows a returned short-lived page token immediately. Raw payloads remain intact for schema evolution. HTTP 429 and 5xx responses are categorized for bounded retry; malformed responses normalize to an answer-free result rather than exposing internals. Mock adapters exercise the complete local workflow.

## Answer engines (Perplexity and ChatGPT)

SerpApi does not cover standalone answer engines, so these call first-party APIs directly (`packages/providers/src/answerEngines.ts`). `createProviders` wires every provider from `ProviderCredentials`; a provider without a key fails its jobs with a non-retryable `CONFIGURATION_ERROR` while the others continue.

- **Perplexity** (`perplexity`): `POST https://api.perplexity.ai/chat/completions` with `PERPLEXITY_MODEL` (default `sonar`). The answer is `choices[0].message.content`; citations come from `search_results` (title, URL, snippet, in `[n]` order), falling back to the bare `citations` URL list.
- **ChatGPT** (`chatgpt`): OpenAI Responses API (`POST https://api.openai.com/v1/responses`) with the hosted `web_search` tool, `OPENAI_MODEL` (default `gpt-5-mini`), and `store:false`. The answer is the concatenated `output_text`; citations are the inline `url_citation` annotations shown to users, deduplicated by URL. `metadata.webSearchUsed` and `metadata.sourcesConsulted` record whether search ran and how many pages were read.

Both use a 60-second timeout and the same 429/5xx retry rules; 401/403 map to `CONFIGURATION_ERROR`. API answers use the same retrieval stack as the consumer products but are not identical to what a signed-in user sees (no personalization, memory, or account-specific model routing), so treat them as a consistent, repeatable sample rather than a screenshot of the consumer app. Each query costs one model call plus search fees on the respective platform. Migration `0002_answer_engines.sql` registers both providers and adds them to the starter plan.
