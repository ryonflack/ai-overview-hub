# Billing

Plans and entitlements are data, not branching price logic. The launch plan is $69.99 per month, up to 100 queries, with monthly/manual runs. Stripe Checkout enables automatic tax and address collection; the Customer Portal manages payment methods and cancellation. Signed, idempotently recorded webhooks—not redirects—activate, renew, mark past-due, or cancel subscriptions. Usage is reserved atomically before enqueueing a run.

## Collection-method add-ons

Usage is counted in **answer checks**: one query on one source (engine + collection method). The plan includes one method per selected engine for every query. Choosing **Both** for ChatGPT or Perplexity adds one extra check per query for that engine, billed at `plans.addon_unit_price` cents per check (`quoteRun` in `packages/core/src/sources.ts`). The price is `NULL` until it is decided; the portal then tells customers add-on rates will be confirmed before renewal. `usage_events` records `method` and an `addon` flag per check, indexed by account and period, ready to report to a Stripe metered price once one is created.

## Webhooks

`POST /api/stripe/webhook` verifies the signature (`STRIPE_WEBHOOK_SECRET`) and applies `customer.subscription.created`, `.updated` and `.deleted` to `subscriptions` (`packages/billing/src/webhooks.ts`). Checkout puts `accountId` and `planId` in subscription metadata; subscriptions without an `accountId` (e.g. created by hand in the Dashboard) are acknowledged and ignored. Every event is logged in `webhook_events` as `PROCESSED`, `IGNORED` or `FAILED`; the admin Performance page counts failures. A failed event is applied again when Stripe redelivers it, and `subscriptions.stripe_event_at` stops an older, late delivery from overwriting newer state. `canceled_at` is when the subscription ended (churn), not when a cancel-at-period-end was requested.

`GET /api/health/billing` reports whether that deployment's Stripe key is a test or live key and whether the webhook secret and price are set, without revealing any value. Use it after changing environment variables.

## Stripe and Vercel setup

Stripe variables use the same names in every Vercel environment with different values: **Preview** (including staging, `aio-staging.aioverviewhub.com`) uses the Stripe sandbox; **Production** (`www.aioverviewhub.com`) uses the live account.

| | Sandbox → Vercel Preview (done) | Live → Vercel Production (to do at launch) |
|---|---|---|
| `STRIPE_SECRET_KEY` | **Not set yet**: the existing variable is empty. Add the sandbox secret key (`sk_test_…`) for Preview. Webhooks work without it; Checkout and the portal need it | Live secret key (`sk_live_…`) |
| `STRIPE_PRICE_ID` | `price_1UCrISDWX9gitE6lIpXnp9xS`: $69.99/month, tax exclusive, lookup key `starter_monthly`, metadata `plan_id=starter` | Create the same price in live mode |
| `STRIPE_WEBHOOK_SECRET` | Signing secret of `we_1URLhyDWX9gitE6lE0YzMfMP` | Signing secret of the live endpoint |
| Webhook endpoint | `https://aio-staging.aioverviewhub.com/api/stripe/webhook`, with the Vercel automation-bypass query parameter (staging is behind Vercel Authentication); API version `2026-08-26.dahlia` (matches the `stripe` SDK); the three subscription events | `https://www.aioverviewhub.com/api/stripe/webhook`, same version and events, no bypass needed |
| Product | `prod_VDHsoqcXIy2nxF`, tax code `txcd_10103001` (SaaS), statement descriptor `AIOVERVIEWHUB` | Copy from sandbox |
| Customer Portal | Payment methods, invoices, billing details, cancel at period end with reason; returns to `https://aio-staging.aioverviewhub.com/` | Same, returning to `https://www.aioverviewhub.com/`, plus terms and privacy URLs once those pages exist |
| Stripe Tax | SaaS tax code, exclusive. **Pending: head office address**, and no registrations yet | Head office address and registrations where you must collect tax |

Test locally with `npm run dev:api` and `stripe listen --forward-to localhost:8787/api/stripe/webhook` (it prints its own signing secret for `STRIPE_WEBHOOK_SECRET` in `.env`).
