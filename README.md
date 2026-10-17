# AI Overview Hub

AI Overview Hub is a focused SaaS workspace for monitoring brand citations and mentions in Google AI Overview, Google AI Mode, Bing Copilot, DuckDuckGo Search Assist, Naver AI results, ChatGPT search, and Perplexity. It retains historical provider results, calculates visibility metrics, and produces XLSX and zipped CSV reports.

## Local development

Requires Node.js 22+.

```bash
cp .env.example .env
npm install
npm run dev       # site on :4173
npm run dev:api   # API on :8787 with a local PostgreSQL (PGlite), no database account needed
```

Mock providers are enabled with `USE_MOCK_SERP_PROVIDERS=true`; they are deterministic and require no credentials. Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` before submitting changes.

## Configuration and integrations

All configuration is environment-based; see `.env.example`. Customers choose, per project, which AI sources to monitor, the country and language, and for ChatGPT and Perplexity whether answers come from the official API, a user-simulated session, or both. SerpApi (search engines), the OpenAI and Perplexity APIs, and Oxylabs or DataForSEO (user-simulated answers, chosen by the operator) share a normalized interface but retain raw responses separately; see `docs/PROVIDERS.md`. Stripe Checkout uses subscriptions, automatic tax, billing-address collection, and webhook-authoritative lifecycle changes. Structured console reporting and email are optional adapters. CI dependency installation is wrapped with Aikido Safe Chain, which runs without an Aikido token or API URL. Never put production secrets in `.env` or source control.

## Data and deployment

The site and API are deployed on Vercel and the database is Neon Postgres; Cloudflare only hosts DNS. Each Vercel build applies pending `migrations/` to that environment's database, then builds the site and bundles the API as a Vercel Function (`npm run vercel-build`). Configuration is per-environment Vercel environment variables (Production = live, Preview/staging = test). Run the API locally with `npm run dev:api`, which uses an in-process PostgreSQL. Details are in `docs/DEPLOYMENT.md`.

Current progress, next steps (customer portal) and open decisions are in `docs/STATUS.md`. The operator control panel (`apps/admin`, `npm run dev:admin`, or `VITE_ADMIN_DEMO=true npm run dev:admin` for demo data) is described in `docs/ADMIN.md`. See the `docs/` directory for architecture, providers, billing, security, failures, data ownership, and deployment details. Legal routes and recurring-billing copy are product placeholders and require qualified counsel review before launch.
