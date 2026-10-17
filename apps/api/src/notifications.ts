import { compose,sendEmail } from '../../../packages/email/src/index';
import type { SubscriptionChange } from '../../../packages/billing/src/webhooks';
import type { AdminDB } from './admin';
import { all,one } from './app';
import type { RunSummary } from './runs';

/** Customer lifecycle emails, sent through Resend (packages/email): welcome on sign-up, subscription started, payment failed,
 * payment recovered, cancellation scheduled, subscription ended, and run finished or failed. Account and billing emails always go to the workspace's
 * owners and admins; run emails follow the workspace's notification settings. A failed send is logged and never fails the caller. */
type Env=Record<string,unknown>;
const appUrl=(env:Env)=>String(env.APP_URL||'https://www.aioverviewhub.com').replace(/\/+$/,'');
const date=(iso:string|null|undefined)=>iso?new Date(iso).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric',timeZone:'UTC'}):null;
const money=(cents:number)=>`$${(cents/100).toFixed(2)}`;

export const recipients=async(db:AdminDB,accountId:string)=>(await all<{email:string}>(db,"SELECT u.email FROM account_users au JOIN users u ON u.id=au.user_id WHERE au.account_id=? AND au.role IN ('owner','admin')",accountId)).map(u=>u.email);

/** Runs `task` after the response when the platform allows it (Vercel waitUntil), otherwise before returning. Errors are logged. */
export async function deliver(env:Env,event:string,task:()=>Promise<unknown>){
  const p=task().catch(error=>console.error(JSON.stringify({level:'error',event:`${event}_email_failed`,message:String(error)})));
  const later=env.WAIT_UNTIL as ((p:Promise<unknown>)=>void)|undefined;if(later)later(p);else await p;
}

export async function sendWelcome(env:Env,user:{email:string;name:string|null}){
  const first=user.name?.trim().split(/\s+/)[0];
  await sendEmail(env,{to:user.email,subject:'Welcome to AI Overview Hub',...compose({heading:`Welcome${first?`, ${first}`:''}!`,
    paragraphs:['Your workspace is ready. Here’s how to see where your brand shows up in AI answers:','1. Add your website and brand names, and choose the AI sources to check.','2. Add the questions your customers ask.','3. Choose a plan and run monitoring. Reports are saved after every run.'],
    cta:{label:'Set up your project',url:`${appUrl(env)}/#/project`}})});
}

export async function notifySubscription(db:AdminDB,env:Env,change:SubscriptionChange){
  const to=await recipients(db,change.accountId);if(!to.length)return;
  const plan=await one<{name:string;monthly_price:number;runs_per_period:number;checks_per_period:number;max_queries:number}>(db,'SELECT name,monthly_price,runs_per_period,checks_per_period,max_queries FROM plans WHERE id=?',change.planId);
  const planName=plan?.name??'your plan';const billing=`${appUrl(env)}/#/billing`;const until=date(change.periodEnd);
  const message=change.kind==='started'?{subject:`You’re subscribed to ${planName}`,heading:'Your subscription is active',
      paragraphs:[`Thanks for subscribing to ${planName}. Monitoring is unlocked for your workspace.`,'Stripe emails your receipt separately.'],
      facts:plan?[['Plan',`${plan.name}, ${money(plan.monthly_price)}/month`],['Queries tracked',`Up to ${plan.max_queries}`],['Each billing period',`${plan.runs_per_period} runs, ${plan.checks_per_period.toLocaleString('en-US')} answer checks`]] as [string,string][]:[],
      cta:{label:'Run monitoring',url:`${appUrl(env)}/#/overview`}}
    :change.kind==='payment_failed'?{subject:'Your payment didn’t go through',heading:'We couldn’t take your payment',
      paragraphs:[`The latest payment for ${planName} failed. Stripe will retry it automatically, but monitoring is paused until it succeeds.`,'Update your payment method to keep your scheduled runs going.'],
      cta:{label:'Update payment method',url:billing}}
    :change.kind==='recovered'?{subject:'Payment received: monitoring is back on',heading:'You’re all set',
      paragraphs:[`Your payment for ${planName} went through, so monitoring and scheduled runs are active again.`],
      cta:{label:'Open your workspace',url:`${appUrl(env)}/#/overview`}}
    :change.kind==='cancel_scheduled'?{subject:'Your subscription is set to cancel',heading:'Your subscription will end',
      paragraphs:[`${planName} will end${until?` on ${until}`:' at the end of this billing period'}. You can keep running monitoring until then, and you won’t be charged again.`,'Changed your mind? You can resume from Billing at any time before then.'],
      cta:{label:'Manage subscription',url:billing}}
    :{subject:'Your subscription has ended',heading:'Your subscription has ended',
      paragraphs:[`${planName} has ended and scheduled monitoring has stopped. Your project, queries and past reports are kept.`,'Subscribe again whenever you’re ready to pick up where you left off.'],
      cta:{label:'See plans',url:billing}};
  await sendEmail(env,{to,subject:message.subject,...compose(message)});
}

/** The run-finished email ("your report is ready"), a visibility-drop alert, or a failed-run notice, per the workspace's settings. */
export async function notifyRun(db:AdminDB,env:Env,accountId:string,runId:string,summaries:RunSummary[]){
  const account=await one<{name:string;notify_run:number;notify_drop:number}>(db,'SELECT name,notify_run,notify_drop FROM accounts WHERE id=?',accountId);if(!account)return;
  const run=summaries.find(r=>r.id===runId);if(!run)return;
  const to=await recipients(db,accountId);if(!to.length)return;
  const reports=`${appUrl(env)}/#/reports`;
  if(run.status==='FAILED'){if(!account.notify_run)return;
    return void await sendEmail(env,{to,subject:`Your AI visibility run for ${account.name} couldn’t complete`,...compose({heading:'Your run couldn’t complete',paragraphs:['None of the answer checks in your latest run succeeded, so no report was produced. This is usually temporary.','Try running monitoring again in a little while. If it keeps failing, reply to this email and we’ll look into it.'],cta:{label:'Open your workspace',url:`${appUrl(env)}/#/overview`}})});}
  const completed=summaries.filter(r=>r.status==='COMPLETED'||r.status==='COMPLETED_WITH_ERRORS');
  if(completed[0]?.id!==runId)return;const previous=completed[1];
  const drop=previous?Math.round((previous.visibility-run.visibility)*10)/10:0;const dropped=drop>5;
  if(!account.notify_run&&!(account.notify_drop&&dropped))return;
  const pct=(n:number)=>`${n}%`;
  await sendEmail(env,{to,subject:dropped?`AI visibility dropped ${drop} points for ${account.name}`:`Your AI visibility report is ready: ${pct(run.visibility)}`,...compose({
    heading:dropped?`AI visibility dropped ${drop} points`:'Your report is ready',
    paragraphs:[`Your latest AI visibility run for ${account.name} has finished and the results have been compiled into a report.`],
    facts:[['AI visibility',`${pct(run.visibility)}${previous?` (was ${pct(previous.visibility)})`:''}`],['Citation rate',pct(run.citationRate)],['Mention rate',pct(run.mentionRate)],['Checks',`${run.done-run.failed} of ${run.total} succeeded`]],
    cta:{label:'View the full report',url:reports},footer:'You can change these emails in Settings · AI Overview Hub'})});
}
