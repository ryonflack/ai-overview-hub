import {useEffect,useState} from 'react';
import type {Me} from '../session';
import {trackOnce} from '../track';
import {Head,money} from './ui';

/** Confirmation pages with stable URLs for analytics: #/welcome after sign-up, #/thank-you when Stripe Checkout returns. */
export function WelcomePage({me}:{me:Me}){
  const first=me.user.name?.trim().split(/\s+/)[0];
  const steps:[string,string,string,string][]=[['Set up your project','Add your website and brand names, then choose which AI answers to check.','#/project','Set up project'],
    ['Add your queries','Add the questions your customers ask, up to '+me.plan.maxQueries+' on your plan.','#/queries','Add queries'],
    ['Choose your plan','Subscribe to run monitoring. Reports are saved after every run.','#/billing','See plan']];
  return <div className="dash portal confirm">
    <Head kicker="WELCOME" title={first?`Welcome, ${first}!`:'Welcome!'}/>
    <div className="panel confirm-hero"><h3>Your workspace is ready</h3><p className="muted">Three steps to see where your brand shows up in AI answers.</p></div>
    <ol className="confirm-steps">{steps.map(([title,text,href,cta],i)=><li className="panel" key={href}><span className="step-no">Step {i+1}</span><h3>{title}</h3><p className="muted">{text}</p><a className={i===0?'button':'button ghost'} href={href}>{cta} →</a></li>)}</ol>
  </div>
}

export function ThankYouPage({me,refresh}:{me:Me;refresh:()=>void}){
  // Checkout returns before Stripe's webhook has activated the plan, so keep refreshing for up to a minute.
  const[waited,setWaited]=useState(0);
  useEffect(()=>{if(me.entitled||waited>=20)return;const t=setTimeout(()=>{refresh();setWaited(w=>w+1)},3000);return()=>clearTimeout(t)},[me.entitled,waited]);// eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{if(!me.entitled||!me.subscriptionId)return;const value=me.plan.monthlyPrice/100;
    trackOnce(`purchase:${me.subscriptionId}`,'purchase',{ecommerce:{transaction_id:me.subscriptionId,value,currency:'USD',items:[{item_id:me.plan.id,item_name:me.plan.name,price:value,quantity:1}]}})},[me.entitled,me.subscriptionId,me.plan]);
  if(!me.entitled)return <div className="dash portal confirm">
    <Head kicker="THANK YOU" title="Confirming your payment…"/>
    <div className="panel confirm-hero">{waited<20?<><h3>Payment received</h3><p className="muted">We’re activating your plan. This usually takes a few seconds.</p></>
      :<><h3>This is taking longer than usual</h3><p className="muted">Your payment went through, but the plan hasn’t activated yet. Check Billing in a minute, or contact support if it still shows no plan.</p><a className="button" href="#/billing">Go to Billing →</a></>}</div>
  </div>;
  const p=me.plan;
  return <div className="dash portal confirm">
    <Head kicker="THANK YOU" title="You’re subscribed"/>
    <div className="panel confirm-hero"><h3>{p.name} is active</h3><p className="muted">Thanks for subscribing. Stripe has emailed your receipt, and monitoring is unlocked for your workspace.</p>
      <dl className="kv"><div><dt>Plan</dt><dd>{p.name}, {money(p.monthlyPrice)}/month</dd></div><div><dt>Queries tracked</dt><dd>Up to {p.maxQueries}</dd></div><div><dt>Each billing period</dt><dd>{p.runsPerPeriod} runs, {p.checksPerPeriod.toLocaleString()} answer checks</dd></div></dl>
      <a className="button" href="#/overview">Run your first check →</a></div>
  </div>
}
