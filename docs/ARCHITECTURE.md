# Architecture

The React/Vite customer site is served as static files on Vercel. A Hono API (`apps/api`) runs as a Vercel Function (Node.js 22) on the same domain under `/api`. Neon Postgres stores relational metadata and normalized results, accessed through `packages/db` (Neon's HTTP driver behind a small `prepare().bind().first()/all()/run()` interface). Background work is queued in the `queue_messages` table; Cron creates due runs. Unique database keys make run creation, provider results, usage events, exports and Stripe webhook processing idempotent. Large raw responses and exports will need object storage (Vercel Blob is the natural fit); that adapter is not built yet.

Provider, billing, email, object-storage, and error-reporting boundaries keep business logic vendor-neutral. Browser requests only enqueue runs. Workers retry transient operations three times with exponential backoff; exhausted work remains inspectable in `scheduled_jobs`. Successful sibling provider results are retained and produce `COMPLETED_WITH_ERRORS`.

See `docs/DEPLOYMENT.md` for how this is built and hosted.
