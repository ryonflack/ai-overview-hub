# Deployment

Everything runs on **Vercel**. **Cloudflare only hosts DNS** for `aioverviewhub.com`; no Cloudflare compute, storage or queues are used.

| Piece | Where |
|---|---|
| Customer site + API | Vercel project `ai-overview-hub-public` (repository root). Production: `www.aioverviewhub.com` (`main`). Staging: `aio-staging.aioverviewhub.com` (`staging` branch, Preview environment) |
| Operator panel | Vercel project for `apps/admin`, on `admin.aioverviewhub.com`; it proxies `/api/admin/*` to `https://www.aioverviewhub.com` |
| Database | Neon Postgres, attached through the Vercel Neon integration (`DATABASE_URL`, `DATABASE_URL_UNPOOLED`) |
| Payments | Stripe: sandbox for Preview/staging, live account for Production (see `docs/BILLING.md`) |

## How a deployment is built

`vercel.json` runs `npm run vercel-build`:

1. `scripts/migrate.mjs` applies pending `migrations/*.sql` to that environment's Neon database, each in a transaction, recorded in `schema_migrations`, under an advisory lock. It fails the build if `DATABASE_URL` is missing, so code never ships ahead of its schema. Migrations must be forward-compatible: the previous deployment keeps serving until the new one is promoted.
2. `npm run build` type-checks and builds the customer site into `dist/`.
3. `scripts/build-vercel.mjs` writes Vercel's Build Output (`.vercel/output`): `dist/` as static files, and the Hono API (`apps/api/src/vercel.ts`) bundled into a single Node.js 22 function. `/api` and `/api/*` go to the function; everything else is served from the static files.

## Environment variables

Set in the Vercel project under Settings → Environment Variables, with the **same names** in each environment and different values per environment. Production holds live values; Preview (which includes staging) holds test/sandbox values. Mark secrets as Sensitive. `.env.example` lists every variable.

## Customer sign-in (Neon Auth)

The browser signs in through `/auth/*` on the site's own domain; the API forwards those requests to Neon Auth (`DATABASE_NEON_AUTH_BASE_URL`) so the session cookie is first-party. Each site address must be listed in the **Neon Console → Auth → Configuration → Domains** (localhost is allowed by default), otherwise sign-in fails with "Invalid origin". `/api/health/auth` reports whether the API can reach Neon Auth's signing keys.

## Background work

Runs are processed by the portal while it is open, by `/api/internal/worker` (it continues itself in the background while checks remain) and by a daily Vercel Cron (`15 6 * * *`, defined in `scripts/build-vercel.mjs`) that also starts due monthly runs. The worker requires `CRON_SECRET` (set for Production and Preview); Vercel Cron sends it automatically.

## Deployment Protection and webhooks

Preview deployments, including `aio-staging.aioverviewhub.com`, sit behind Vercel Authentication. Callers that can't log in, such as Stripe's webhooks, use the project's **Protection Bypass for Automation** secret as the `x-vercel-protection-bypass` query parameter on their URL. That secret is configured in Vercel and Stripe only, never in this repository.

## DNS (Cloudflare)

Add each domain to its Vercel project and create the DNS record Vercel asks for in Cloudflare. Keep records **DNS-only** (grey cloud): Vercel issues and renews the certificates. Proxying through Cloudflare in front of Vercel breaks certificate renewal and causes TLS errors (Cloudflare error 525).

## Local development

`npm run dev` (site, :4173), `npm run dev:api` (API, :8787, with an in-process PostgreSQL in `.data/pglite`, no account needed), `npm run dev:admin` (panel, :4174, proxies to :8787).

## Before launch

Verify health (`/api/health`, `/api/health/database`, `/api/health/billing`), a live subscription end to end, provider calls, partial failures, report downloads, email, a database restore (Neon branching / point-in-time restore), and counsel-approved policies before sending traffic.
