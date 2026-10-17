import type Stripe from 'stripe';
import { AppError } from '../../core/src/errors';

/** Applies Stripe subscription lifecycle events to `subscriptions`. Webhooks, not checkout redirects, are authoritative.
 * Checkout sets `accountId` and `planId` in subscription metadata; subscriptions without an account (e.g. made by hand in the Dashboard) are ignored.
 * Stripe may deliver an event more than once and out of order: events are recorded in `stripe_events`, and an older event never overwrites newer state. */
type Statement={first<T>():Promise<T|null>;run():Promise<unknown>};
export type BillingDB={prepare(sql:string):{bind(...values:unknown[]):Statement}};
export const subscriptionEvents=['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted'] as const;
export type WebhookOutcome='applied'|'ignored'|'duplicate';

const iso=(seconds:number|null|undefined)=>seconds?new Date(seconds*1000).toISOString():null;

export async function applyStripeEvent(db:BillingDB,event:Stripe.Event,now=new Date()):Promise<WebhookOutcome>{
  if(await db.prepare('SELECT id FROM stripe_events WHERE id=?').bind(event.id).first())return 'duplicate';
  const outcome=(subscriptionEvents as readonly string[]).includes(event.type)?await applySubscription(db,event.data.object as Stripe.Subscription,event.created,now):'ignored';
  // Recorded after applying, so a failed write is retried by Stripe; the upsert itself is idempotent.
  await db.prepare('INSERT OR IGNORE INTO stripe_events (id,type,outcome,processed_at) VALUES (?,?,?,?)').bind(event.id,event.type,outcome,now.toISOString()).run();
  return outcome;
}

async function applySubscription(db:BillingDB,sub:Stripe.Subscription,eventCreated:number,now:Date):Promise<WebhookOutcome>{
  const accountId=sub.metadata?.accountId;if(!accountId)return 'ignored';
  const item=sub.items.data[0];
  const planId=sub.metadata.planId??(item?(await db.prepare('SELECT id FROM plans WHERE stripe_price_id=?').bind(item.price.id).first<{id:string}>())?.id:undefined);
  if(!planId)throw new AppError('CONFIGURATION_ERROR',`No plan matches Stripe subscription ${sub.id}.`,500);
  const customerId=typeof sub.customer==='string'?sub.customer:sub.customer.id;
  // canceled_at is when the subscription stopped (churn), not when cancellation was requested for the period end.
  const endedAt=iso(sub.ended_at)??(sub.status==='canceled'?iso(sub.canceled_at):null);
  await db.prepare(`INSERT INTO subscriptions (id,account_id,plan_id,stripe_customer_id,stripe_subscription_id,status,period_start,period_end,created_at,canceled_at,stripe_event_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(stripe_subscription_id) DO UPDATE SET plan_id=excluded.plan_id,stripe_customer_id=excluded.stripe_customer_id,status=excluded.status,period_start=excluded.period_start,period_end=excluded.period_end,created_at=excluded.created_at,canceled_at=excluded.canceled_at,stripe_event_at=excluded.stripe_event_at,updated_at=excluded.updated_at
    WHERE excluded.stripe_event_at>=COALESCE(subscriptions.stripe_event_at,0)`)
    .bind(crypto.randomUUID(),accountId,planId,customerId,sub.id,sub.status,iso(item?.current_period_start),iso(item?.current_period_end),iso(sub.created),endedAt,eventCreated,now.toISOString()).run();
  return 'applied';
}
