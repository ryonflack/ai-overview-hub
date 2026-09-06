# Deployment

## Vercel web deployment with Cloudflare DNS

The repository-level `vercel.json` configures Vercel to run the Vite build from
the repository root and serve the generated `dist/` directory. Use Node.js 22,
which is also enforced by `package.json`.

After the first successful Vercel deployment, add the production domain to the
Vercel project and create the DNS record Vercel requests in Cloudflare. Keep the
record DNS-only until Vercel has issued and verified its certificate; Cloudflare
proxying can be enabled afterward if desired. DNS management does not require a
Cloudflare Pages deployment.

Set browser-exposed deployment values (for example, the API base URL) in Vercel.
Keep Worker, D1, R2, Queue, Stripe, and provider secrets in Cloudflare or the
service that consumes them rather than copying them into the static web build.

## Cloudflare application deployment

1. Provision Pages, Worker, D1, R2, Queue, and Turnstile resources; replace placeholder binding IDs.
2. Store SerpApi, Stripe, email, session, Turnstile, Sentry, and Aikido credentials in environment secret stores.
3. Run lint, type checking, tests, build, dependency/secret/Aikido scans, and API authorization tests.
4. Apply versioned D1 migrations, deploy the Worker, then publish `dist/` to Pages.
5. Configure `aioverviewhub.com`, `app.aioverviewhub.com`, and optionally `api.aioverviewhub.com` through environment URLs, Stripe production webhooks/tax/portal, WAF/rate limits, Queue DLQ, R2 lifecycle/backups, Cron, monitoring, and alerts.
6. Verify health, a live subscription, provider sandbox calls, partial failure, signed downloads, email, restore procedure, and counsel-approved policies before traffic.
