import type Stripe from 'stripe';
import { AppError } from '../../core/src/errors';

/** Applies Stripe subscription lifecycle events to `subscriptions`. Webhooks, not checkout redirects, are authoritative.
 * Checkout sets `accountId` and `planId` in subscription metadata; subscriptions without an account (e.g. made by hand in the Dashboard) are ignored.
 * Every event is logged in `webhook_events` (shown on the admin Performance page). Stripe may deliver an event more than once and out
 * of order: a PROCESSED or IGNORED event is not applied again, a FAILED one is retried, and an older event never overwrites newer state. */
type Statement={first<T>():Promise<T|null>;run():Promise<unknown>};
export type BillingDB={prepare(sql:string):{bind(...values:unknown[]):Statement}};
export const subscriptionEvents=['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted'] as const;
export type WebhookOutcome='applied'|'ignored'|'duplicate';

const iso=(seconds:number|null|undefined)=>seconds?new Date(seconds*1000).toISOString():null;
const logEvent=(db:BillingDB,event:Stripe.Event,payloadHash:string,status:'PROCESSED'|'IGNORED'|'FAILED',receivedAt:string,errorCode:string|null)=>db.prepare(`INSERT INTO webhook_events (id,provider,event_type,status,payload_hash,received_at,processed_at,error_code) VALUES (?,'stripe',?,?,?,?,?,?)
  ON CONFLICT(id) DO UPDATE SET status=excluded.status,processed_at=excluded.processed_at,error_code=excluded.error_code`).bind(event.id,event.type,status,payloadHash,receivedAt,status==='FAILED'?null:new Date().toISOString(),errorCode).run();

export async function applyStripeEvent(db:BillingDB,event:Stripe.Event,payloadHash:string,now=new Date()):Promise<WebhookOutcome>{
  const seen=await db.prepare('SELECT status FROM webhook_events WHERE id=?').bind(event.id).first<{status:string}>();
  if(seen&&seen.status!=='FAILED')return 'duplicate';
  const receivedAt=now.toISOString();
  try{const outcome=(subscriptionEvents as readonly string[]).includes(event.type)?await applySubscription(db,event.data.object as Stripe.Subscription,event.created,receivedAt):'ignored';
    await logEvent(db,event,payloadHash,outcome==='applied'?'PROCESSED':'IGNORED',receivedAt,null);return outcome}
  catch(error){await logEvent(db,event,payloadHash,'FAILED',receivedAt,error instanceof AppError?error.code:'INTERNAL_ERROR').catch(()=>{});throw error}
}

async function applySubscription(db:BillingDB,sub:Stripe.Subscription,eventCreated:number,now:string):Promise<WebhookOutcome>{
  const accountId=sub.metadata?.accountId;if(!accountId)return 'ignored';
  const item=sub.items.data[0];
  const planId=sub.metadata.planId??(item?(await db.prepare('SELECT id FROM plans WHERE stripe_price_id=?').bind(item.price.id).first<{id:string}>())?.id:undefined);
  if(!planId)throw new AppError('CONFIGURATION_ERROR',`No plan matches Stripe subscription ${sub.id}.`,500);
  const customerId=typeof sub.customer==='string'?sub.customer:sub.customer.id;
  // canceled_at is when the subscription stopped (churn), not when cancellation was requested for the period end.
  const endedAt=iso(sub.ended_at)??(sub.status==='canceled'?iso(sub.canceled_at):null);
  await db.prepare(`INSERT INTO subscriptions (id,account_id,plan_id,stripe_customer_id,stripe_subscription_id,status,period_start,period_end,created_at,canceled_at,cancel_at_period_end,stripe_event_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(stripe_subscription_id) DO UPDATE SET plan_id=excluded.plan_id,stripe_customer_id=excluded.stripe_customer_id,status=excluded.status,period_start=excluded.period_start,period_end=excluded.period_end,created_at=excluded.created_at,canceled_at=excluded.canceled_at,cancel_at_period_end=excluded.cancel_at_period_end,stripe_event_at=excluded.stripe_event_at,updated_at=excluded.updated_at
    WHERE excluded.stripe_event_at>=COALESCE(subscriptions.stripe_event_at,0)`)
    .bind(crypto.randomUUID(),accountId,planId,customerId,sub.id,sub.status,iso(item?.current_period_start),iso(item?.current_period_end),iso(sub.created),endedAt,sub.cancel_at_period_end||sub.cancel_at?1:0,eventCreated,now).run();
  return 'applied';
}
