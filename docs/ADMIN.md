# Admin control panel

The operator control panel lives in `apps/admin` and is deployed as its own Vercel project on `admin.aioverviewhub.com`. No admin code ships in the customer app. Its API is `/api/admin/*` on the existing Hono API (`apps/api/src/admin.ts`), with shared logic in `packages/admin`.

## Pages

| Page | What it shows or changes |
|---|---|
| **Overview** | MRR, revenue and vendor cost for the period, gross margin, the five costliest resources, and a "needs attention" list (sources above 10% errors, failed jobs, runs with errors, failed Stripe webhooks, past-due subscriptions). |
| **Costs** | Cost per resource. Group by source (engine + collection method), vendor, or customer. Shows checks, failures, total cost, cost per check, cost per successful answer, share of spend, and a daily cost chart. The customer view adds margin per customer. |
| **Revenue** | MRR, ARR, ARPA, new subscriptions, churn, MRR at risk (past due), add-on revenue, gross margin, a 12-month new-vs-canceled chart, plan mix, and margin per customer (lowest first). |
| **Performance** | Per-source error rate, p50/p95 latency and top error codes, runs, the job queue (with **Retry** on failed jobs), Stripe webhook health, and Vercel deployment health (success rate, build time, latest production deploy). |
| **Data sources** | Switch which vendor serves each source (ChatGPT simulated: Oxylabs or DataForSEO) and turn sources on or off for all customers, without a redeploy. Set vendor cost rates. |
| **Accounts** | Every customer with subscription, access, checks, revenue, cost and margin. Account detail adds controls: pause, per-account vendor and source overrides, query-limit override, add-on waiver, and an audit note. |
| **Audit log** | Every operator sign-in and change, with before/after values. |

All metrics take a period (7 days, 30 days, 90 days, 12 months).

## How costs are calculated

Each check (one query on one source) records its `vendor`, `cost_micros`, `cost_basis`, `duration_ms` and `completed_at` on `run_queries` (migration `0004_admin.sql`). Money is stored as integers: revenue in cents, vendor cost in micro-dollars, because a single call often costs a fraction of a cent.

`callCost` (`packages/admin/src/metrics.ts`) prices a successful call in this order:
1. **Reported**: the cost the vendor returns with the call (Perplexity `usage.cost.total_cost` and DataForSEO `tasks[0].cost`, both already kept in `metadata.cost`).
2. **Rate**: the operator's per-call rate for that vendor and source from `vendor_rates`, set on the Data sources page.
3. **Unknown**: neither is available. The check still counts but shows as "unpriced" until a rate is set.

Margin per customer is the subscription prorated over the period, plus billable add-on checks, minus vendor cost.

## Data sources and routing

The env vars (`SIMULATED_VENDOR`, `SIMULATED_VENDOR_<ENGINE>`) stay the defaults. Operator routing is layered on top: global settings in `operator_settings.routing`, then per-account settings in `account_controls`. Vendors an engine can't use are rejected (DataForSEO can't simulate Perplexity), and switching to a vendor without credentials is refused. A corrupt stored value falls back to the env defaults, so it can't take sources offline. Turning a source off makes `/api/sources` report it unavailable, so the portal disables it. Customers still never see vendor names.

## Sign-in and security

- Operators (`operators` table) are separate from customer users; a customer `admin` role grants nothing here.
- Sign-in is an emailed one-time link (15 minutes, 3 per 15 minutes, 5 code attempts) plus an authenticator-app code (RFC 6238, ±1 step, no replay). The link carries its token in the URL fragment, so it never reaches servers or `Referer` headers.
- Only SHA-256 hashes of link and session tokens are stored. Authenticator secrets are AES-GCM encrypted with `ADMIN_TOTP_KEY`.
- Sessions use a `__Host-` cookie (`HttpOnly; Secure; SameSite=Strict`) and last 12 hours. Changes must be JSON from `ADMIN_ORIGIN`.
- `/api/admin/auth/start` responds the same whether or not the email is an operator.
- The admin site sends `noindex`, `X-Frame-Options: DENY`, a strict CSP and HSTS (`apps/admin/vercel.json`). Vercel password protection or Trusted IPs on the admin project can add a second layer.

## Setup

1. Apply migration `0004_admin.sql`: `npx wrangler d1 migrations apply ai-overview-hub --remote`.
2. Generate the encryption key with `npm run admin:key`, then store it with `npx wrangler secret put ADMIN_TOTP_KEY`.
3. Set `ADMIN_URL` and `ADMIN_ORIGIN` to `https://admin.aioverviewhub.com` on the API.
4. Create an operator: `ADMIN_TOTP_KEY=… npm run admin:operator -- you@example.com "Your Name"`. Scan the printed `otpauth://` URI with an authenticator app, then run the printed `INSERT` with `npx wrangler d1 execute ai-overview-hub --remote --command "…"`.
5. For Vercel health, create a read-only Vercel token and set `VERCEL_API_TOKEN`, `VERCEL_TEAM_ID`, `VERCEL_TEAM_SLUG` and `VERCEL_PROJECT_IDS` (comma-separated) as API secrets.
6. Create the Vercel project: import this repository again, set **Root Directory** to `apps/admin`, and keep the settings from `apps/admin/vercel.json`. Add the `admin.aioverviewhub.com` domain and its DNS record in Cloudflare (DNS-only until the certificate is issued). The project rewrites `/api/admin/*` to `https://api.aioverviewhub.com`, so requests stay same-origin. Update that destination if the API lives elsewhere.

**Email delivery:** there is no email adapter in the codebase yet. Sign-in only works with `EMAIL_PROVIDER=console`, which writes the link to the API logs (`npx wrangler tail`). That's fine for local work and a single operator, but wire a real email provider before adding other operators, since anyone with log access gets the first factor.

## Local development

```bash
npm run dev:admin                              # http://localhost:4174, proxies /api/admin to wrangler dev on :8787
VITE_ADMIN_DEMO=true npm run dev:admin         # fictional data, no API needed
```

Demo mode is a build-time flag. Production builds without it contain no demo data.

## Still to build

- **Run consumer integration.** When the queue consumer is built (see `STATUS.md`), it must: skip paused accounts and apply `loadAccountControls` routing on top of `loadGlobalRouting` (both in `apps/api/src/admin.ts`); honour `maxQueriesOverride` and `addonWaived`; and write `vendor` (`sourceVendor`), `cost_micros`/`cost_basis` (`callCost`), `duration_ms` (`RunResult.durationMs`) and `completed_at` on each `run_queries` row. Until then cost and performance pages show only what's already stored.
- **Job retry consumer.** **Retry** re-queues a `JOB_RETRY` message; the consumer has to handle it.
- **Subscription timestamps.** The Stripe webhook handler should set `subscriptions.created_at` and `canceled_at`, which the new-business and churn metrics read.
- **Request-level Vercel metrics.** Vercel documents no API for querying traffic, error or latency metrics, so the panel shows deployment health and links to Vercel Observability. A Vercel log drain into the API would bring request metrics in.
- **Email adapter** for sign-in links (see above).
