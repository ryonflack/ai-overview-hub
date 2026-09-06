# Architecture

The React/Vite web app is a Cloudflare Pages artifact. A Hono Worker provides HTTP endpoints. D1 stores relational metadata and normalized results; large raw responses and immutable exports use R2. Queue messages identify one query/provider operation, while Cron creates due runs. Unique database keys make run creation, provider results, usage events, and exports idempotent.

Provider, billing, email, object-storage, and error-reporting boundaries keep business logic vendor-neutral. Browser requests only enqueue runs. Workers retry transient operations three times with exponential backoff; exhausted work remains inspectable in `scheduled_jobs`. Successful sibling provider results are retained and produce `COMPLETED_WITH_ERRORS`.
