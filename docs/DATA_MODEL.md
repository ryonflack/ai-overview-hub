# Data model

Migration `0001_initial.sql` defines users/accounts, membership, configurable plans and subscriptions, projects/domains/queries, immutable runs and provider results, citations, an idempotent usage ledger, R2 export metadata, scheduled/failed jobs, webhook receipts, and audit events. Every tenant-owned lookup must include `account_id`. Raw provider payloads and generated files are addressed by unguessable R2 object keys; signed URLs expire quickly.

Migration `0003_collection_methods.sql` adds `projects.source_methods` (JSON map of engine → methods) and `projects.location`, `plans.addon_unit_price`, and a `method` column on `run_queries` and `usage_events`, whose uniqueness keys now include it so one query can run through both methods. Because SQLite cannot alter constraints, `run_queries`, `provider_results` and `citations` are rebuilt together and the old tables dropped child-first, so the migration is safe with existing rows while foreign keys are enforced.
