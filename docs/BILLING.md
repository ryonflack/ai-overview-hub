# Billing

Plans and entitlements are data, not branching price logic. The launch plan is $69.99 per month, up to 100 queries, with monthly/manual runs. Stripe Checkout enables automatic tax and address collection; the Customer Portal manages payment methods and cancellation. Signed, idempotently recorded webhooks—not redirects—activate, renew, mark past-due, or cancel subscriptions. Usage is reserved atomically before enqueueing a run.

## Collection-method add-ons

Usage is counted in **answer checks**: one query on one source (engine + collection method). The plan includes one method per selected engine for every query. Choosing **Both** for ChatGPT or Perplexity adds one extra check per query for that engine, billed at `plans.addon_unit_price` cents per check (`quoteRun` in `packages/core/src/sources.ts`). The price is `NULL` until it is decided; the portal then tells customers add-on rates will be confirmed before renewal. `usage_events` records `method` and an `addon` flag per check, indexed by account and period, ready to report to a Stripe metered price once one is created.

## Webhooks

`POST /api/stripe/webhook` verifies the signature (`STRIPE_WEBHOOK_SECRET`) and applies `customer.subscription.created`, `.updated` and `.deleted` to `subscriptions` (`packages/billing/src/webhooks.ts`). Checkout puts `accountId` and `planId` in subscription metadata; subscriptions without an `accountId` (e.g. created by hand in the Dashboard) are acknowledged and ignored. Each event is recorded once in `stripe_events`, and `subscriptions.stripe_event_at` stops an older, late delivery from overwriting newer state. `canceled_at` is when the subscription ended (churn), not when a cancel-at-period-end was requested. Unrecognised event types return 200 and are recorded as `ignored`.

## Stripe account setup

| | Sandbox (done) | Live (to do) |
|---|---|---|
| Product | `prod_VDHsoqcXIy2nxF`, AI Overview Hub Monthly Subscription, tax code `txcd_10103001` (SaaS), statement descriptor `AIOVERVIEWHUB` | Copy from sandbox |
| Price | `price_1UCrISDWX9gitE6lIpXnp9xS`, $69.99/month, tax exclusive, lookup key `starter_monthly`, metadata `plan_id=starter` | New price ID: set `STRIPE_PRICE_ID` in production |
| Webhook endpoint | `we_1URLhyDWX9gitE6lE0YzMfMP` → `https://api.aioverviewhub.com/api/stripe/webhook`, API version `2026-08-26.dahlia` (matches the `stripe` SDK), the three subscription events | Create the same endpoint in live mode; its signing secret differs |
| Customer Portal | Payment methods, invoices, billing details, cancel at period end with reason; return URL `https://app.aioverviewhub.com/` | Same settings, plus terms and privacy URLs once those pages exist |
| Stripe Tax | Defaults set (SaaS code, exclusive). **Pending: head office address missing**, and no registrations | Head office address and registrations where you must collect tax |

Set per environment with `wrangler secret put STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, and `STRIPE_PRICE_ID` as a variable. Test locally with `stripe listen --forward-to localhost:8787/api/stripe/webhook` (it prints its own signing secret). The webhook endpoint returns errors until the API is deployed at `api.aioverviewhub.com` with these secrets and migration `0005` applied; Stripe retries failed deliveries for three days and then disables the endpoint after repeated failures, so it can be disabled in the Dashboard until the API is live.
