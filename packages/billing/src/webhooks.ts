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
/** A customer-visible change worth an email, worked out from the stored state before and after the event. */
export interface SubscriptionChange { accountId:string; planId:string; kind:'started'|'payment_failed'|'recovered'|'cancel_scheduled'|'ended'; periodEnd:string|null }
const entitled=(status:string|null|undefined)=>status==='active'||status==='trialing';

const iso=(seconds:number|null|undefined)=>seconds?new Date(seconds*1000).toISOString():null;
const logEvent=(db:BillingDB,event:Stripe.Event,payloadHash:string,status:'PROCESSED'|'IGNORED'|'FAILED',receivedAt:string,errorCode:string|null)=>db.prepare(`INSERT INTO webhook_events (id,provider,event_type,status,payload_hash,received_at,processed_at,error_code) VALUES (?,'stripe',?,?,?,?,?,?)
  ON CONFLICT(id) DO UPDATE SET status=excluded.status,processed_at=excluded.processed_at,error_code=excluded.error_code`).bind(event.id,event.type,status,payloadHash,receivedAt,status==='FAILED'?null:new Date().toISOString(),errorCode).run();

export async function applyStripeEvent(db:BillingDB,event:Stripe.Event,payloadHash:string,now=new Date(),onChange?:(change:SubscriptionChange)=>Promise<void>):Promise<WebhookOutcome>{
  const seen=await db.prepare('SELECT status FROM webhook_events WHERE id=?').bind(event.id).first<{status:string}>();
  if(seen&&seen.status!=='FAILED')return 'duplicate';
  const receivedAt=now.toISOString();
  try{const {outcome,change}=(subscriptionEvents as readonly string[]).includes(event.type)?await applySubscription(db,event.data.object as Stripe.Subscription,event.created,receivedAt):{outcome:'ignored' as const,change:null};
    await logEvent(db,event,payloadHash,outcome==='applied'?'PROCESSED':'IGNORED',receivedAt,null);
    // The event is recorded first, so a redelivery is a duplicate and the email goes out once; a failed send never fails the webhook.
    if(change&&onChange)await onChange(change).catch(error=>console.error(JSON.stringify({level:'error',event:'subscription_email_failed',kind:change.kind,message:String(error)})));
    return outcome}
  catch(error){await logEvent(db,event,payloadHash,'FAILED',receivedAt,error instanceof AppError?error.code:'INTERNAL_ERROR').catch(()=>{});throw error}
}

async function applySubscription(db:BillingDB,sub:Stripe.Subscription,eventCreated:number,now:string):Promise<{outcome:WebhookOutcome;change:SubscriptionChange|null}>{
  const accountId=sub.metadata?.accountId;if(!accountId)return{outcome:'ignored',change:null};
  const item=sub.items.data[0];
  const planId=sub.metadata.planId??(item?(await db.prepare('SELECT id FROM plans WHERE stripe_price_id=?').bind(item.price.id).first<{id:string}>())?.id:undefined);
  if(!planId)throw new AppError('CONFIGURATION_ERROR',`No plan matches Stripe subscription ${sub.id}.`,500);
  const customerId=typeof sub.customer==='string'?sub.customer:sub.customer.id;
  // canceled_at is when the subscription stopped (churn), not when cancellation was requested for the period end.
  const endedAt=iso(sub.ended_at)??(sub.status==='canceled'?iso(sub.canceled_at):null);
  const before=await db.prepare('SELECT status,cancel_at_period_end FROM subscriptions WHERE stripe_subscription_id=?').bind(sub.id).first<{status:string;cancel_at_period_end:number}>();
  const cancelScheduled=Boolean(sub.cancel_at_period_end||sub.cancel_at);
  const stored=await db.prepare(`INSERT INTO subscriptions (id,account_id,plan_id,stripe_customer_id,stripe_subscription_id,status,period_start,period_end,created_at,canceled_at,cancel_at_period_end,stripe_event_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(stripe_subscription_id) DO UPDATE SET plan_id=excluded.plan_id,stripe_customer_id=excluded.stripe_customer_id,status=excluded.status,period_start=excluded.period_start,period_end=excluded.period_end,created_at=excluded.created_at,canceled_at=excluded.canceled_at,cancel_at_period_end=excluded.cancel_at_period_end,stripe_event_at=excluded.stripe_event_at,updated_at=excluded.updated_at
    WHERE excluded.stripe_event_at>=COALESCE(subscriptions.stripe_event_at,0) RETURNING status`)
    .bind(crypto.randomUUID(),accountId,planId,customerId,sub.id,sub.status,iso(item?.current_period_start),iso(item?.current_period_end),iso(sub.created),endedAt,cancelScheduled?1:0,eventCreated,now).first<{status:string}>();
  // An older event that arrived late changes nothing, so it sends nothing.
  if(!stored)return{outcome:'applied',change:null};
  const was=before?.status;const periodEnd=iso(item?.current_period_end);const base={accountId,planId,periodEnd};
  const kind:SubscriptionChange['kind']|null=sub.status==='canceled'||sub.status==='incomplete_expired'?(was&&was!=='canceled'&&was!=='incomplete_expired'&&was!=='incomplete'?'ended':null)
    :(sub.status==='past_due'||sub.status==='unpaid')?(was!=='past_due'&&was!=='unpaid'?'payment_failed':null)
    :entitled(sub.status)&&!entitled(was)?(was==='past_due'||was==='unpaid'?'recovered':'started')
    :entitled(sub.status)&&cancelScheduled&&!before?.cancel_at_period_end?'cancel_scheduled':null;
  return{outcome:'applied',change:kind?{...base,kind}:null};
}
