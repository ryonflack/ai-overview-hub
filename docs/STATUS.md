# Project status and next steps

_Last updated: 2026-10-04. Work is paused here; this is the hand-off note._

## Done to date

### AI sources: ChatGPT and Perplexity alongside the SerpApi engines
- Seven engines: Google AI Overview, Google AI Mode, Bing Copilot, DuckDuckGo, Naver (all via SerpApi), plus **ChatGPT** and **Perplexity**. They appear on the marketing site as standard launch sources, not as "new".
- ChatGPT and Perplexity can each be collected two ways, chosen by the customer:
  - **Direct API**: OpenAI Responses API with `web_search`, and the Perplexity Agent API (`/v1/agent`). Perplexity retired its Sonar chat-completions API on 2026-09-27, so the code already uses the Agent API.
  - **User-simulated response**: a real logged-out session on the consumer product, captured by **Oxylabs** (ChatGPT and Perplexity) or **DataForSEO** (ChatGPT only).
  - **Both**: every query runs through both methods, billed as an add-on.
- **Vendor routing is operator-only.** `SIMULATED_VENDOR` and `SIMULATED_VENDOR_<ENGINE>` choose Oxylabs or DataForSEO, and customers never see vendor names. DataForSEO can't simulate Perplexity (its Perplexity product wraps the API), so that combination is rejected at startup.
- **Per-project location**: country, language, and optional region and city, passed to each upstream in the form it supports. See the table in `docs/PROVIDERS.md`.
- **Results, metrics and exports keep the method.** `sourceCoverage` and the export `Method` column let customers compare API answers with simulated ones.

### Billing model (logic only)
- A **check** is one query on one source (engine + method). The plan includes one method per engine. Each extra method is an add-on check priced by `plans.addon_unit_price`, which is `NULL` until a price is decided.
- `usage_events` records `method` and an `addon` flag, ready to report to a Stripe metered price. No Stripe metered price is wired up yet.

### API (`apps/api`, Hono, set up for Cloudflare Workers)
- `GET /api/sources`: source catalog with availability based on configured credentials. It never names vendors, including in error messages.
- `POST /api/quote`: validates a selection and location against the plan and returns checks, included checks and add-on checks.
- Existing: health checks and `POST /api/runs` (enqueues a run).

### Database
- `0002_answer_engines.sql` registers ChatGPT and Perplexity and adds them to the starter plan.
- `0003_collection_methods.sql` adds per-project methods and location, add-on pricing, and `method` on run jobs and usage events. It was tested against existing data with foreign keys enforced.

### Customer portal (`apps/web`): screens only, not functional yet
- The overview dashboard and the **AI sources** page exist: choose engines, Direct API / User-simulated / Both, location, and see a live per-run quote. Mobile has its own navigation.
- **Not done yet:** there's no customer login, and settings save only in the browser (`localStorage`), not to the server. The other menu items (Projects, Queries, Reports, Billing, Settings) are placeholders.

### Quality
- 44 automated tests cover providers, routing, locations, quoting, the API endpoints and exports. Lint, typecheck (now including the API app) and the build pass.
- None of this has been run against the real APIs. Adapters follow each vendor's documentation and are tested with sample responses.

## Next: customer portal (make it real)
1. **Customer login.** Email-verified accounts, secure session cookies, Turnstile on sign-up and login (see `docs/SECURITY.md`).
2. **Projects API, scoped to each account.** Create and edit projects, domains and queries. Save AI-source selections and location to `projects.source_methods` / `projects.location`, replacing the browser-only save.
3. **Run execution.** A queue consumer that loads the project, calls `executeRun` with `createProviders(providerConfigFromEnv(env))`, stores `run_queries` / `provider_results` / `citations`, and writes `usage_events` with `method` and `addon`.
4. **Reports, history and billing pages** connected to real data, using Stripe Checkout and the Customer Portal.

## Next: admin control panel (for the operator)
Nothing has been built yet. Proposed approach:
- **A separate app, `apps/admin`, in this repo,** deployed as its own Vercel project (root directory `apps/admin`) on its own domain, e.g. `admin.aioverviewhub.com`. No admin code ships to customers.
- **Admin-only routes** under `/api/admin/*`, with every change written to `audit_events`.
- **Separate admin login:** an operator users table (not the customer `account_users.admin` role), email login link plus an authenticator-app code. Optionally, Vercel password protection on the admin domain as a second layer.
- **Controls for individual customers (draft list):**
  - Turn individual sources and methods on or off for an account.
  - Override the simulated vendor (Oxylabs or DataForSEO) for an account.
  - Change query limits and add-on pricing, or waive add-on charges.
  - View usage and run history.
  - Re-run failed checks.
  - Pause or reactivate an account.

### Open decisions (needed before building the admin panel)
1. **The final list of controls** in the admin panel. Is the draft above right, and what's missing?
2. **Admin login method:** email link plus authenticator code, or something else such as Google sign-in?
3. **Hosting:** keep the API on Cloudflare Workers (as `docs/DEPLOYMENT.md` assumes), or move the backend to Vercel too. Decide before the admin panel is built on it.

## Before launch: checklist
- Set real credentials: `SERPAPI_API_KEY`, `OPENAI_API_KEY`, `PERPLEXITY_API_KEY`, `OXYLABS_*` and/or `DATAFORSEO_*`, and `SIMULATED_VENDOR`.
- Run each source once against the real APIs. In particular:
  - Confirm Perplexity accepts `preset` together with a `web_search.user_location` override.
  - Confirm `OPENAI_MODEL` (default `gpt-5-mini`) is still a current model.
  - Decide whether ChatGPT API answers should always search (`tool_choice: "required"`).
- Set `plans.addon_unit_price` and create the matching Stripe metered price.
- Apply migrations `0002` and `0003`.
- Known location limits: Oxylabs supports country only (no region or city). Bing, DuckDuckGo and Naver don't use location at all.
