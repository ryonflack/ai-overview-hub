-- Job queue for Vercel (replaces the Cloudflare Queue binding). The API inserts messages; a consumer claims them in order with
-- SELECT ... FOR UPDATE SKIP LOCKED and sets processed_at. No consumer exists yet (see docs/STATUS.md).
CREATE TABLE queue_messages (id TEXT PRIMARY KEY,type TEXT NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL,processed_at TEXT);
CREATE INDEX queue_messages_pending_idx ON queue_messages(created_at) WHERE processed_at IS NULL;
