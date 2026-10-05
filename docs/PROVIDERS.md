# Providers

Each SerpApi engine implements `AIVisibilityProvider`. It runs a query and converts provider-specific answer/reference paths into `NormalizedAIResult`. Google AI Overview follows a returned short-lived page token immediately. Raw payloads remain intact for schema evolution. HTTP 429 and 5xx responses are categorized for bounded retry; malformed responses normalize to an answer-free result rather than exposing internals. Mock adapters exercise the complete local workflow.

## Sources and collection methods

A **source** is one engine collected one way (`SourceKey` = `provider:method`); it is the unit of work, usage, and reporting. Customers pick sources per project in the portal's **AI sources** page:

| Engine | Direct API (`api`) | User-simulated response (`simulated`) |
|---|---|---|
| Google AI Overview, Google AI Mode, Bing Copilot, DuckDuckGo, Naver | — | SerpApi |
| ChatGPT | OpenAI Responses API + `web_search` | Oxylabs **or** DataForSEO (operator choice) |
| Perplexity | Perplexity Agent API | Oxylabs |

- **Direct API** answers come from the engine's developer API: fast, consistent and within the engine's terms, but without the consumer app's UI, personalization or model routing.
- **User-simulated responses** come from a real logged-out session on the consumer product in the project's country, so they match what a visitor sees. Vendors carry the scraping risk; captures can break without notice and take up to ~2 minutes.
- Choosing **Both** for an engine runs every query through both methods. Results stay separate (`RunResult.method`, `sourceCoverage` in analytics, a `Method` column in exports) so customers can compare them.

`packages/core/src/sources.ts` holds the catalog (`providerMethods`), validation (`resolveSources`), locations (`normalizeLocation`), and pricing (`quoteRun`). `packages/providers/src/index.ts` builds the provider registry from `providerConfigFromEnv`. A source without credentials fails only its own jobs with `CONFIGURATION_ERROR`, and `/api/sources` reports it unavailable so the portal disables it.

### Operator routing (never exposed to customers)

`SIMULATED_VENDOR` (`oxylabs` default, or `dataforseo`) applies to every engine that supports it; engines that don't fall back to Oxylabs. `SIMULATED_VENDOR_CHATGPT` / `SIMULATED_VENDOR_PERPLEXITY` pin one engine and fail fast at startup if the vendor can't serve it (DataForSEO has no simulated Perplexity product; its Perplexity endpoint wraps the developer API). Switching vendors needs only an environment change, and stored results keep `metadata.vendor` for auditing.

### Location

Projects store a country (ISO code), language, and optional region and city (`normalizeLocation` fills the country's main language). Each adapter applies what its upstream supports:

| Source | Location handling |
|---|---|
| Google AI Overview / AI Mode (SerpApi) | `gl` (`GB` → `uk`), `hl`, and `location` when a city or region is set |
| ChatGPT API | `web_search.user_location` (`approximate`: country, region, city) |
| Perplexity API | `web_search.user_location` (country, region, city) |
| Oxylabs (ChatGPT, Perplexity) | `geo_location` = country name; region and city are not supported |
| DataForSEO (ChatGPT) | `location_name` = country name, `language_code` |
| Bing Copilot, DuckDuckGo, Naver | not applied; they answer from their default market |

## Adapter reference

- **Perplexity API** (`perplexity:api`): Agent API (`POST https://api.perplexity.ai/v1/agent`) with `PERPLEXITY_PRESET` (default `fast`, the documented successor to the `sonar`/`sonar-pro` models; Sonar chat completions support ended 2026-09-27). The answer is the message `output_text`; citations come from the `search_results` output item, whose numbered results map to the `[n]` markers in the answer. `metadata.cost` stores the per-call cost Perplexity reports. Legacy Sonar payloads still normalize. Perplexity does not document combining a `preset` with a `tools` override, so confirm location behaviour with a live key before launch.
- **ChatGPT API** (`chatgpt:api`): OpenAI Responses API (`POST https://api.openai.com/v1/responses`) with the hosted `web_search` tool, `OPENAI_MODEL` (default `gpt-5-mini`; confirm against OpenAI's current model list), and `store:false`. Citations are the inline `url_citation` annotations, deduplicated by URL. `metadata.webSearchUsed` and `metadata.sourcesConsulted` record whether search ran and how many pages were read. The model decides whether to search; set `tool_choice: "required"` if every answer must be grounded.
- **Oxylabs** (`chatgpt:simulated`, `perplexity:simulated`): Web Scraper API realtime integration (`POST https://realtime.oxylabs.io/v1/queries`, basic auth, `parse:true`, `search:true` for ChatGPT). ChatGPT reads `markdown_text`/`response_text` and `citations`; Perplexity reads `answer_results_md` and `additional_results.sources_results` (falling back to `top_sources`). A non-2xx `results[0].status_code` is a retryable capture failure. Push-pull with `callback_url` is the higher-throughput option if realtime connections become a bottleneck.
- **DataForSEO** (`chatgpt:simulated`): LLM Scraper live advanced (`POST https://api.dataforseo.com/v3/ai_optimization/chat_gpt/llm_scraper/live/advanced`, basic auth, `force_web_search:true`). Reads `result[0].markdown` and `sources` (falling back to item-level sources). Errors arrive in-band: `20000` is success, `401xx`/`402xx` map to `CONFIGURATION_ERROR`, `5xxxx` are retryable.

Direct API calls use a 60-second timeout and simulated captures 180 seconds; all share the 429/5xx retry rules, and 401/403 map to `CONFIGURATION_ERROR`. Migration `0002_answer_engines.sql` registers both engines; `0003_collection_methods.sql` adds methods, locations and add-on pricing.
