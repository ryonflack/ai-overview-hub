-- Operator control panel (admin.aioverviewhub.com): operator auth, runtime source routing, per-account controls, vendor cost rates,
-- and per-call cost and latency on run jobs so cost per resource and provider health can be reported.

-- Operators are separate from customer users; customer `account_users.role='admin'` grants nothing here.
CREATE TABLE operators (id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,name TEXT,totp_secret TEXT NOT NULL,last_totp_step INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
-- One-time email sign-in links. Only SHA-256 hashes of tokens are stored.
CREATE TABLE operator_login_tokens (token_hash TEXT PRIMARY KEY,operator_id TEXT NOT NULL REFERENCES operators(id),expires_at TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,used_at TEXT,created_at TEXT NOT NULL);
CREATE TABLE operator_sessions (token_hash TEXT PRIMARY KEY,operator_id TEXT NOT NULL REFERENCES operators(id),expires_at TEXT NOT NULL,created_at TEXT NOT NULL,revoked_at TEXT);
CREATE INDEX operator_sessions_operator_idx ON operator_sessions(operator_id);

-- Global operator settings as JSON values. `routing` = {simulatedVendors:{chatgpt?,perplexity?},disabledSources:SourceKey[]}; it overrides the env defaults.
CREATE TABLE operator_settings (key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_by TEXT,updated_at TEXT NOT NULL);

-- Per-account overrides. NULL / empty means "inherit".
CREATE TABLE account_controls (account_id TEXT PRIMARY KEY REFERENCES accounts(id),status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused')),simulated_vendors TEXT NOT NULL DEFAULT '{}',disabled_sources TEXT NOT NULL DEFAULT '[]',max_queries_override INTEGER,addon_waived INTEGER NOT NULL DEFAULT 0,notes TEXT,updated_by TEXT,updated_at TEXT NOT NULL);

-- What each vendor charges per successful call, in micro-dollars (1 USD = 1,000,000). Used when a vendor does not report the call's cost itself.
CREATE TABLE vendor_rates (vendor TEXT NOT NULL,provider_id TEXT NOT NULL,method TEXT NOT NULL CHECK(method IN ('api','simulated')),unit_cost_micros INTEGER NOT NULL CHECK(unit_cost_micros>=0),updated_by TEXT,updated_at TEXT NOT NULL,PRIMARY KEY(vendor,provider_id,method));

-- Per-call vendor, cost and latency. cost_basis: 'reported' (vendor returned the cost), 'rate' (vendor_rates), or 'unknown'.
ALTER TABLE run_queries ADD COLUMN vendor TEXT;
ALTER TABLE run_queries ADD COLUMN cost_micros INTEGER;
ALTER TABLE run_queries ADD COLUMN cost_basis TEXT;
ALTER TABLE run_queries ADD COLUMN duration_ms INTEGER;
ALTER TABLE run_queries ADD COLUMN completed_at TEXT;
CREATE INDEX run_queries_completed_idx ON run_queries(completed_at);
CREATE INDEX runs_account_created_idx ON runs(account_id,created_at);

-- Subscription lifecycle timestamps for new-business and churn metrics (written by the Stripe webhook handler).
ALTER TABLE subscriptions ADD COLUMN created_at TEXT;
ALTER TABLE subscriptions ADD COLUMN canceled_at TEXT;
CREATE INDEX audit_events_created_idx ON audit_events(created_at);
