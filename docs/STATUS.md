# Project status and next steps

_Last updated: 2026-10-04 (admin panel added). This is the hand-off note._

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

## Admin control panel (for the operator): first version built
See `docs/ADMIN.md` for pages, cost model, security and setup.
- **`apps/admin`**: a separate Vite app, deployed as its own Vercel project (root directory `apps/admin`) on `admin.aioverviewhub.com`. Pages: Overview, Costs (cost per resource, vendor and customer), Revenue, Performance (provider health, job queue, webhooks, Vercel deployments), Data sources (vendor switching, source kill switches, cost rates), Accounts (with per-account controls) and Audit log.
- **`/api/admin/*`** on the existing API (`apps/api/src/admin.ts`). Every change is written to `audit_events`.
- **Operator sign-in**: a separate `operators` table, an emailed one-time link plus an authenticator-app code, and 12-hour `__Host-` session cookies.
- **Runtime routing**: the env vendor settings stay the defaults; operators can override them globally or per account without a redeploy, and `/api/sources` already honours the global setting.
- **Cost tracking**: migration `0004_admin.sql` adds per-check vendor, cost, latency and completion time, plus `vendor_rates` for vendors that don't report cost.
- 23 tests (`tests/admin.test.ts`) run the admin API against the real migrations in SQLite.

### Decisions taken (change if needed)
1. **Login**: email link plus authenticator code, as proposed. No email adapter exists yet, so links are logged (`EMAIL_PROVIDER=console`) until one is wired up.
2. **Hosting**: the API stays on Cloudflare Workers. The admin Vercel project proxies `/api/admin/*` to `https://api.aioverviewhub.com`.
3. **Controls**: the draft list, plus vendor cost rates and global source kill switches.

### Still to do for the panel
- The run consumer must enforce account controls and write cost/latency per check (details in `docs/ADMIN.md`). Until it exists, metrics show only stored data.
- Handle `JOB_RETRY` queue messages; set `subscriptions.created_at`/`canceled_at` from Stripe webhooks.
- Vercel request metrics need a log drain (no public query API); the panel links to Vercel Observability for now.

## Before launch: checklist
- Set real credentials: `SERPAPI_API_KEY`, `OPENAI_API_KEY`, `PERPLEXITY_API_KEY`, `OXYLABS_*` and/or `DATAFORSEO_*`, and `SIMULATED_VENDOR`.
- Run each source once against the real APIs. In particular:
  - Confirm Perplexity accepts `preset` together with a `web_search.user_location` override.
  - Confirm `OPENAI_MODEL` (default `gpt-5-mini`) is still a current model.
  - Decide whether ChatGPT API answers should always search (`tool_choice: "required"`).
- Set `plans.addon_unit_price` and create the matching Stripe metered price.
- Apply migrations `0002`, `0003` and `0004`.
- Admin panel: set `ADMIN_TOTP_KEY`, `ADMIN_URL`, `ADMIN_ORIGIN`, the `VERCEL_*` read token and project IDs, create the first operator, and enter vendor cost rates.
- Known location limits: Oxylabs supports country only (no region or city). Bing, DuckDuckGo and Naver don't use location at all.
