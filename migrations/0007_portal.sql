-- Customer portal: Neon Auth users, Stripe customers, project settings, query topics, and the run job queue.
-- users.auth_id is the Neon Auth user id (the JWT `sub`). A user's first API call links or creates their users row (an existing row
-- is claimed by email only once Neon Auth has verified the email) and, with no membership yet, creates their account as owner.
ALTER TABLE users ADD COLUMN auth_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN name TEXT;
ALTER TABLE accounts ADD COLUMN stripe_customer_id TEXT UNIQUE;
ALTER TABLE accounts ADD COLUMN notify_run INTEGER NOT NULL DEFAULT 1;
ALTER TABLE accounts ADD COLUMN notify_drop INTEGER NOT NULL DEFAULT 1;
CREATE INDEX account_users_user_idx ON account_users(user_id);

-- Brand names count as mentions alongside the monitored domains.
ALTER TABLE projects ADD COLUMN brands TEXT NOT NULL DEFAULT '[]';
ALTER TABLE queries ADD COLUMN tag TEXT;

-- Cancel-at-period-end is shown in the portal ("Cancels on …"), written by the Stripe webhook.
ALTER TABLE subscriptions ADD COLUMN cancel_at_period_end INTEGER NOT NULL DEFAULT 0;
-- Runs a subscription period allows (manual + scheduled). Enforced when a run starts.
ALTER TABLE plans ADD COLUMN runs_per_period INTEGER NOT NULL DEFAULT 4;

-- run_queries is the job queue: workers claim PENDING/RETRY rows with FOR UPDATE SKIP LOCKED; a RUNNING row whose claim is
-- older than the worker's time limit is treated as abandoned and claimed again.
ALTER TABLE run_queries ADD COLUMN query_text TEXT;
ALTER TABLE run_queries ADD COLUMN claimed_at TEXT;
ALTER TABLE run_queries ADD COLUMN next_attempt_at TEXT;
CREATE INDEX run_queries_queue_idx ON run_queries(status,next_attempt_at);
CREATE INDEX run_queries_run_idx ON run_queries(run_id);
ALTER TABLE runs ADD COLUMN started_by TEXT NOT NULL DEFAULT 'manual';
CREATE INDEX runs_project_created_idx ON runs(project_id,created_at);
