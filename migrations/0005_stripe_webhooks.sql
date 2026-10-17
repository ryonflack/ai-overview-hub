-- Stripe webhook processing. Each event is logged once in webhook_events (PROCESSED, IGNORED or FAILED; failed events are retried
-- when Stripe redelivers them). subscriptions.stripe_event_at holds the Stripe timestamp of the event that last wrote the row, so an
-- out-of-order delivery never rolls a subscription back to an older state.
ALTER TABLE subscriptions ADD COLUMN stripe_event_at BIGINT;
CREATE INDEX subscriptions_account_idx ON subscriptions(account_id,updated_at);
CREATE INDEX webhook_events_received_idx ON webhook_events(received_at);
