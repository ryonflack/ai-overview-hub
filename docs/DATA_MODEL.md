# Data model

Migration `0001_initial.sql` defines users/accounts, membership, configurable plans and subscriptions, projects/domains/queries, immutable runs and provider results, citations, an idempotent usage ledger, R2 export metadata, scheduled/failed jobs, webhook receipts, and audit events. Every tenant-owned lookup must include `account_id`. Raw provider payloads and generated files are addressed by unguessable R2 object keys; signed URLs expire quickly.
