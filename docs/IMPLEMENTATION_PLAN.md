# Implementation plan

1. Establish a TypeScript workspace, versioned D1-compatible schema, typed configuration, and shared error/security primitives.
2. Implement independent SerpApi adapters, deterministic development providers, result normalization, bounded retry, idempotent run orchestration, quota accounting, and analytics.
3. Implement Stripe-authoritative subscription services, object-storage report generation, email/telemetry abstractions, queue handlers, health checks, and admin operations.
4. Deliver a responsive product site and application workspace covering project setup, query import, provider selection, runs, analytics, history, reports, billing, and settings.
5. Validate the critical domain, provider, failure, billing, upload, entitlement, and cross-account behaviors with automated tests; document deployment and launch controls.

The MVP targets Cloudflare Workers, D1, Queues, R2, Cron Triggers, and Turnstile. Local development uses deterministic in-process adapters without credentials. External services stay behind interfaces so local operation and future replacement remain practical.
