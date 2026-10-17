-- Stripe webhook processing: each event is recorded once, and subscriptions keep the Stripe timestamp of the event that last
-- wrote them so out-of-order deliveries never roll a subscription back to an older state.
CREATE TABLE stripe_events (id TEXT PRIMARY KEY,type TEXT NOT NULL,outcome TEXT NOT NULL,processed_at TEXT NOT NULL);
ALTER TABLE subscriptions ADD COLUMN stripe_event_at INTEGER;
CREATE INDEX subscriptions_account_idx ON subscriptions(account_id,updated_at);
