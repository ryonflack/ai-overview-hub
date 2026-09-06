# Deployment

1. Provision Pages, Worker, D1, R2, Queue, and Turnstile resources; replace placeholder binding IDs.
2. Store SerpApi, Stripe, email, session, Turnstile, Sentry, and Aikido credentials in environment secret stores.
3. Run lint, type checking, tests, build, dependency/secret/Aikido scans, and API authorization tests.
4. Apply versioned D1 migrations, deploy the Worker, then publish `dist/` to Pages.
5. Configure `aioverviewhub.com`, `app.aioverviewhub.com`, and optionally `api.aioverviewhub.com` through environment URLs, Stripe production webhooks/tax/portal, WAF/rate limits, Queue DLQ, R2 lifecycle/backups, Cron, monitoring, and alerts.
6. Verify health, a live subscription, provider sandbox calls, partial failure, signed downloads, email, restore procedure, and counsel-approved policies before traffic.
