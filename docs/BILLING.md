# Billing

Plans and entitlements are data, not branching price logic. The launch plan is $69.99 per month, up to 100 queries, with monthly/manual runs. Stripe Checkout enables automatic tax and address collection; the Customer Portal manages payment methods and cancellation. Signed, idempotently recorded webhooks—not redirects—activate, renew, mark past-due, or cancel subscriptions. Usage is reserved atomically before enqueueing a run.

## Collection-method add-ons

Usage is counted in **answer checks**: one query on one source (engine + collection method). The plan includes one method per selected engine for every query. Choosing **Both** for ChatGPT or Perplexity adds one extra check per query for that engine, billed at `plans.addon_unit_price` cents per check (`quoteRun` in `packages/core/src/sources.ts`). The price is `NULL` until it is decided; the portal then tells customers add-on rates will be confirmed before renewal. `usage_events` records `method` and an `addon` flag per check, indexed by account and period, ready to report to a Stripe metered price once one is created.
