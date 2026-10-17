import Stripe from 'stripe';
import { AppError } from '../../core/src/errors';
import type { Plan } from '../../core/src/types';
export interface BillingGateway { createCheckout(accountId:string,customerId:string,plan:Plan,successUrl:string,cancelUrl:string):Promise<string>; createPortal(customerId:string,returnUrl:string):Promise<string>; verifyWebhook(payload:string,signature:string):Promise<Stripe.Event> }
// Fetch and SubtleCrypto keep the client runtime-neutral (Vercel's Node.js functions, tests, edge runtimes); SubtleCrypto needs the async signature check.
const cryptoProvider=Stripe.createSubtleCryptoProvider();
/** Verifies a webhook with the endpoint's signing secret alone; no API key is involved, so webhooks work before one is configured. */
export async function verifyStripeWebhook(payload:string,signature:string,webhookSecret:string){try{return await Stripe.webhooks.constructEventAsync(payload,signature,webhookSecret,undefined,cryptoProvider)}catch{throw new AppError('BILLING_ERROR','Invalid webhook signature.',400)}}
export class StripeGateway implements BillingGateway { private stripe:Stripe; constructor(secret:string,private webhookSecret:string){this.stripe=new Stripe(secret,{httpClient:Stripe.createFetchHttpClient()})}
  // accountId/planId in subscription metadata let the webhook attach the subscription to the account (packages/billing/src/webhooks.ts).
  async createCheckout(accountId:string,customerId:string,plan:Plan,successUrl:string,cancelUrl:string){const session=await this.stripe.checkout.sessions.create({customer:customerId,client_reference_id:accountId,mode:'subscription',line_items:[{price:plan.stripePriceId,quantity:1}],automatic_tax:{enabled:true},billing_address_collection:'required',customer_update:{address:'auto',name:'auto'},tax_id_collection:{enabled:true},success_url:successUrl,cancel_url:cancelUrl,subscription_data:{metadata:{accountId,planId:plan.id}}});if(!session.url)throw new AppError('BILLING_ERROR','Checkout could not be created.',502);return session.url}
  async createPortal(customerId:string,returnUrl:string){return (await this.stripe.billingPortal.sessions.create({customer:customerId,return_url:returnUrl})).url}
  verifyWebhook(payload:string,signature:string){return verifyStripeWebhook(payload,signature,this.webhookSecret)} }
export class IdempotentWebhookHandler { private handled=new Set<string>(); async handle(event:{id:string;type:string},apply:(type:string)=>Promise<void>){if(this.handled.has(event.id))return false;await apply(event.type);this.handled.add(event.id);return true} }
