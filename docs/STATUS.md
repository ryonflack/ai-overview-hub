# Project status and next steps

_Last updated: 2026-10-18 (portal mostly done; launch planned for late December 2026). This is the hand-off note._

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

### API (`apps/api`, Hono, a Vercel Function on Neon Postgres)
- `GET /api/sources`: source catalog with availability based on configured credentials. It never names vendors, including in error messages.
- `POST /api/quote`: validates a selection and location against the plan and returns checks, included checks and add-on checks.
- Existing: health checks and `POST /api/runs` (enqueues a run).

### Database
- `0002_answer_engines.sql` registers ChatGPT and Perplexity and adds them to the starter plan.
- `0003_collection_methods.sql` adds per-project methods and location, add-on pricing, and `method` on run jobs and usage events. It was tested against existing data with foreign keys enforced.

### Beta labelling and methodology page
- The site is labelled **Beta** everywhere: a banner on the marketing site ("Try it risk-free: no contract, cancel anytime"), a Beta pill on the logo, and a beta strip inside the portal.
- **How our rankings work** (`apps/web/src/Methodology.tsx`, at `/#how-rankings-work`) is linked from the footer, the beta banner and the portal sidebar. It explains the process and metric definitions at a high level and deliberately names no vendors or collection infrastructure. Keep it that way when editing.

### Customer portal (`apps/web`): live (2026-10-17)
- **Sign-in** is Neon Auth (managed Better Auth): create account, sign in, and password reset by emailed code (`apps/web/src/app/Login.tsx`). The browser talks to Neon through `/auth/*` on our own domain, forwarded by the API (`apps/api/src/index.ts`), so the session cookie is first-party and works in Safari. The API verifies Neon's short-lived EdDSA JWTs (`packages/auth`). A user's first request creates their workspace; an existing users row (for example the demo owner) is claimed by email only once Neon has verified that email.
- **Portal pages** (`apps/web/src/app/`, routes `#/overview`, `#/project`, `#/queries`, `#/reports`, `#/billing`, `#/settings`) all use real data from `/api/app/*` (`apps/api/src/app.ts`): project and AI-source setup with a live per-run estimate, queries (capped by plan, with operator overrides), runs with live progress, metrics, coverage, movement and top cited domains, reports with XLSX/CSV downloads built in the browser, billing (Stripe Checkout, Customer Portal, usage, invoices) and settings (name, workspace, notifications). One project per workspace during the beta. Workspace switcher when a user belongs to several.
- **Runs** (`apps/api/src/runs.ts`): one job per query × source in `run_queries`, claimed with `FOR UPDATE SKIP LOCKED` by the portal while it is open, by the self-chaining `/api/internal/worker` (protected by `CRON_SECRET`) and by a daily Vercel Cron that also starts due monthly runs. Recoverable failures retry with backoff (3 attempts); abandoned claims are reclaimed after 2 minutes. Results, citations, vendor cost and usage (with the add-on flag) are recorded. Limits: an active or trialing subscription, `plans.runs_per_period` (default 4), the query cap, paused workspaces, and sources that are unavailable are refused before a run starts.
- **Email** (`packages/email`): Resend when `RESEND_API_KEY` is set (from `EMAIL_FROM`), otherwise logged. Run-complete and visibility-drop (>5 points) emails go to workspace owners.
- **Demo workspace** stays at `#/demo` (fictional accounts in `packages/core/src/demo-accounts.json`; seed with `npm run demo:accounts`, see below), and the marketing preview still uses it.
- **Seeding the demo accounts into the database:** `npm run demo:accounts > demo.sql`, then `psql "$DATABASE_URL" -f demo.sql` (or paste it into the Neon SQL editor). `-- --owner you@yourdomain.com` makes you an owner of every demo account; sign in with that (verified) email to see them. `-- --remove` deletes them all.
- **Verified end to end on the preview deployment** with a real browser: sign-up, project, queries, Stripe Checkout page, webhook-activated plan, a run, reports download, settings and the Stripe billing portal. Checkout's card submission itself is blocked for automated browsers by Stripe's hCaptcha, so that one step was completed through the Stripe API in the test.

### Quality
- 44 automated tests cover providers, routing, locations, quoting, the API endpoints and exports. Lint, typecheck (now including the API app) and the build pass.
- None of this has been run against the real APIs. Adapters follow each vendor's documentation and are tested with sample responses.

## Moved to Vercel + Neon (2026-10-17)
- The API now runs as a Vercel Function on the `ai-overview-hub-public` project, next to the site, under `/api` (`apps/api/src/vercel.ts`, bundled by `scripts/build-vercel.mjs`). The Cloudflare Workers setup (`wrangler.toml`, D1, Queues) is gone; it had never been provisioned.
- The database is Neon Postgres. Migrations were ported to PostgreSQL and are applied by every Vercel build (`scripts/migrate.mjs`). `packages/db` keeps the API's `prepare().bind()` interface. Tests and `npm run dev:api` run on an in-process PostgreSQL (PGlite), so they exercise the real dialect.
- Runs use `run_queries` as their job queue (see Customer portal). `queue_messages` (migration `0006`) receives the legacy `POST /api/runs` and admin retry messages and has no consumer yet.
- **Production and Preview share one Neon database** (the integration's variables target both). Previews and staging therefore read and write production data, and every preview build migrates it. Enable Neon's per-preview branching in the integration before real customers arrive.
- Reports are generated in the browser from run data, so no object storage is needed yet.

## Stripe (sandbox configured 2026-10-17)
- Sandbox account set up: product, $69.99/month price (lookup key `starter_monthly`), Customer Portal, and a webhook endpoint pointing at staging. Vercel's Preview environment holds the sandbox values; Production is for live. IDs and the go-live table are in `docs/BILLING.md`.
- `POST /api/stripe/webhook` records subscriptions from Stripe events and logs each one in `webhook_events` (migration `0005_stripe_webhooks.sql`, tests in `tests/billing.test.ts`). Checkout now tags subscriptions with the account and requires a billing address and accepts tax IDs.
- The sandbox account has **Managed Payments** on by default: Stripe (through Link) is the merchant of record and handles sales tax, so Checkout omits its own tax options unless Stripe Tax is active. Confirm this is intended before going live (it changes fees and who sells to the customer).
- Not done: the add-on metered price (`addon_unit_price` undecided) and live mode.

## Launch plan: late December 2026
The customer portal is mostly done: sign-up and sign-in, project and sources, queries, runs with usage caps, reports and exports, billing (Stripe sandbox), settings, lifecycle emails, and the phone layout. It currently lives inside the sales site (`apps/web/src/app/`, routes `#/overview`, `#/billing`, …) with its API in `apps/api`. Before launch:
1. **Move the portal to its own app and Vercel project:** `apps/portal` at `app.aioverviewhub.com`, with the API (`apps/api`), `CRON_SECRET` and the daily cron moving to that project. `apps/web` becomes marketing only, with "Log in" and "Start monitoring" linking to the portal. Add `https://app.aioverviewhub.com` to Neon Auth trusted domains, and point the Stripe webhook and `APP_URL` at the new domain.
2. Then work through Next and the checklist below on launch week.

## Next
1. **Go live with Stripe** (launch day): live product, price, webhook and Production `STRIPE_*` variables; see the checklist below.
2. **Company email** (before launch): Google Workspace on `aioverviewhub.com` with one user and the aliases `support@`, `hello@`, `billing@` and `notifications@`, so these addresses can send and receive. Steps: verify the domain in Cloudflare DNS; turn off Cloudflare Email Routing and add MX `smtp.google.com` (priority 1); change the root SPF to `v=spf1 include:_spf.google.com ~all`; turn on Google DKIM (`google._domainkey`) before sending, since DMARC is `p=quarantine`. Leave Resend's `send.` and `resend._domainkey` records alone. Then set `support@` as reply-to on app emails and the Resend templates (`aioh-*`).
3. **Separate staging data:** turn on Neon's per-preview branching; today staging and production share one database.
4. Later: move OpenAI, Resend, SerpApi, Perplexity and Google Voice to company-owned accounts; Turnstile on sign-up; more than one project per workspace; the add-on metered price.

Done since: Neon Auth trusted domains, Resend (domain verified, `RESEND_API_KEY` set, lifecycle emails), provider keys, usage caps, Google Tag Manager (`GTM-PNVSKJTR` in `apps/web/index.html`).

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
2. **Hosting**: everything is on Vercel with Neon Postgres (Cloudflare is DNS only). The admin Vercel project proxies `/api/admin/*` to `https://www.aioverviewhub.com`.
3. **Controls**: the draft list, plus vendor cost rates and global source kill switches.

### Still to do for the panel
- The run consumer must enforce account controls and write cost/latency per check (details in `docs/ADMIN.md`). Until it exists, metrics show only stored data.
- Handle `JOB_RETRY` queue messages. (`subscriptions.created_at`/`canceled_at` are now written by the Stripe webhook.)
- Vercel request metrics need a log drain (no public query API); the panel links to Vercel Observability for now.

## Before launch: checklist
- Set real credentials: `SERPAPI_API_KEY`, `OPENAI_API_KEY`, `PERPLEXITY_API_KEY`, `OXYLABS_*` and/or `DATAFORSEO_*`, and `SIMULATED_VENDOR`.
- Run each source once against the real APIs. In particular:
  - Confirm Perplexity accepts `preset` together with a `web_search.user_location` override.
  - Confirm `OPENAI_MODEL` (default `gpt-5-mini`) is still a current model.
  - Decide whether ChatGPT API answers should always search (`tool_choice: "required"`).
- Set `plans.addon_unit_price` and create the matching Stripe metered price.
- Allow search engines: remove the site-wide `x-robots-tag` route in `scripts/build-vercel.mjs` (keep the one for `/welcome` and `/thank-you`) and the `robots` meta tag in `apps/web/index.html` (the admin site stays `noindex`).
- **Google Ads:** update the video in the Performance Max campaign with the latest demo before launch. Re-record it first if the portal has changed (`media/demo/record.mjs`; current cut: `media/demo/ai-overview-hub-demo.mp4`).
- Company email addresses (`support@`, `hello@`, `billing@`, `notifications@`) send and receive; see Next, item 2.
- Stripe live mode: follow the table in `docs/BILLING.md` (product, price, webhook endpoint, portal, Tax head office and registrations), then set the live `STRIPE_*` secrets.
- Migrations apply automatically on each Vercel build; confirm `schema_migrations` lists `0001` to `0006` in production.
- Admin panel: set `ADMIN_TOTP_KEY`, `ADMIN_URL`, `ADMIN_ORIGIN`, the `VERCEL_*` read token and project IDs, create the first operator, and enter vendor cost rates.
- Known location limits: Oxylabs supports country only (no region or city). Bing, DuckDuckGo and Naver don't use location at all.
