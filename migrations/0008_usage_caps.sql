-- Usage caps. Each workspace has a cap on answer checks per billing period (the plan's, or an operator override), and the platform
-- has a monthly cap on paid provider calls across all workspaces (PLATFORM_MONTHLY_CHECK_CAP). Runs created with mock providers are
-- not metered, so Preview/staging traffic on a shared database never uses up production's allowance.
ALTER TABLE plans ADD COLUMN checks_per_period INTEGER NOT NULL DEFAULT 500;
ALTER TABLE account_controls ADD COLUMN max_checks_override INTEGER;
ALTER TABLE runs ADD COLUMN metered INTEGER NOT NULL DEFAULT 1;
CREATE INDEX runs_created_idx ON runs(created_at);
-- Every run before this migration was a test run on mock providers (no provider keys were configured anywhere).
UPDATE runs SET metered=0;
