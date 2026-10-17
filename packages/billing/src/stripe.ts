import Stripe from 'stripe';
import { AppError } from '../../core/src/errors';
export interface Invoice { id:string; date:string; amount:number; currency:string; status:string; url:string|null }
export interface CheckoutRequest { accountId:string; customerId:string; priceId:string; planId:string; successUrl:string; cancelUrl:string; automaticTax:boolean }
export interface BillingGateway { createCustomer(input:{accountId:string;email:string;name:string}):Promise<string>; createCheckout(input:CheckoutRequest):Promise<string>; createPortal(customerId:string,returnUrl:string):Promise<string>; listInvoices(customerId:string):Promise<Invoice[]>; taxActive():Promise<boolean> }
// Fetch and SubtleCrypto keep the client runtime-neutral (Vercel's Node.js functions, tests, edge runtimes); SubtleCrypto needs the async signature check.
const cryptoProvider=Stripe.createSubtleCryptoProvider();
/** Verifies a webhook with the endpoint's signing secret alone; no API key is involved, so webhooks work before one is configured. */
export async function verifyStripeWebhook(payload:string,signature:string,webhookSecret:string){try{return await Stripe.webhooks.constructEventAsync(payload,signature,webhookSecret,undefined,cryptoProvider)}catch{throw new AppError('BILLING_ERROR','Invalid webhook signature.',400)}}
/** The Stripe secret key (sk_test_/sk_live_). Vercel holds it as STRIPE_API_SECRET; STRIPE_SECRET_KEY is accepted too. */
export const stripeSecretKey=(env:Record<string,unknown>)=>String(env.STRIPE_API_SECRET||env.STRIPE_SECRET_KEY||'');

let taxCache:{at:number;active:boolean}|undefined;
export class StripeGateway implements BillingGateway { private stripe:Stripe; constructor(secret:string){this.stripe=new Stripe(secret,{httpClient:Stripe.createFetchHttpClient()})}
  async createCustomer({accountId,email,name}:{accountId:string;email:string;name:string}){return (await this.stripe.customers.create({email,name,metadata:{accountId}},{idempotencyKey:`customer:${accountId}`})).id}
  // accountId/planId in subscription metadata let the webhook attach the subscription to the account (packages/billing/src/webhooks.ts).
  async createCheckout({accountId,customerId,priceId,planId,successUrl,cancelUrl,automaticTax}:CheckoutRequest){// Tax options are sent only when Stripe Tax is active. With Managed Payments (Stripe as merchant of record, on by default for this
    // account) Stripe handles tax itself and rejects automatic_tax:false, tax_id_collection and customer_update, so they are left out.
    const tax=automaticTax?{automatic_tax:{enabled:true},customer_update:{address:'auto' as const,name:'auto' as const}}:{};
    const session=await this.stripe.checkout.sessions.create({customer:customerId,client_reference_id:accountId,mode:'subscription',line_items:[{price:priceId,quantity:1}],...tax,billing_address_collection:'required',allow_promotion_codes:true,success_url:successUrl,cancel_url:cancelUrl,subscription_data:{metadata:{accountId,planId}}});if(!session.url)throw new AppError('BILLING_ERROR','Checkout could not be created.',502);return session.url}
  async createPortal(customerId:string,returnUrl:string){return (await this.stripe.billingPortal.sessions.create({customer:customerId,return_url:returnUrl})).url}
  async listInvoices(customerId:string){return (await this.stripe.invoices.list({customer:customerId,limit:12})).data.map(i=>({id:i.id??'',date:new Date(i.created*1000).toISOString(),amount:i.total,currency:i.currency,status:i.status??'draft',url:i.hosted_invoice_url??null}))}
  /** Automatic tax needs Stripe Tax to be active (head office address set); until then Checkout runs without it rather than failing. */
  async taxActive(){if(taxCache&&Date.now()-taxCache.at<10*60_000)return taxCache.active;const active=(await this.stripe.tax.settings.retrieve()).status==='active';taxCache={at:Date.now(),active};return active}
}
/** Tests inject a fake through env.STRIPE_GATEWAY. */
export function billingGateway(env:Record<string,unknown>):BillingGateway{if(env.STRIPE_GATEWAY)return env.STRIPE_GATEWAY as BillingGateway;const key=stripeSecretKey(env);if(!key)throw new AppError('CONFIGURATION_ERROR','Billing is not configured.',503);return new StripeGateway(key)}
export class IdempotentWebhookHandler { private handled=new Set<string>(); async handle(event:{id:string;type:string},apply:(type:string)=>Promise<void>){if(this.handled.has(event.id))return false;await apply(event.type);this.handled.add(event.id);return true} }
