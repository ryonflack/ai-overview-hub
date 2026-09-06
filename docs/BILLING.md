# Billing

Plans and entitlements are data, not branching price logic. The launch plan is $69.99 per month, up to 100 queries, with monthly/manual runs. Stripe Checkout enables automatic tax and address collection; the Customer Portal manages payment methods and cancellation. Signed, idempotently recorded webhooks—not redirects—activate, renew, mark past-due, or cancel subscriptions. Usage is reserved atomically before enqueueing a run.
