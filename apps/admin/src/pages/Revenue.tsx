import { api } from '../api';
import type { Business,Range } from '../api';
import { PairedColumns,StatTile,Status } from '../charts';
import { cents,micros,num,pct } from '../format';
import { useLoad } from '../hooks';
import { Notice,Panel } from '../ui';

const month=(m:string)=>new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-US',{month:'short',timeZone:'UTC'});
/** Revenue and business metrics from webhook-synced subscriptions (Stripe stays the source of truth). */
export function Revenue({range,onUnauthorized,go}:{range:Range;onUnauthorized:()=>void;go:(path:string)=>void}){const {data:b,error}=useLoad(()=>api<Business>(`/business?range=${range}`),range,onUnauthorized);if(error)return <Notice tone="critical">{error}</Notice>;if(!b)return <p className="muted">Loading…</p>;const margin=b.revenueCents?(b.revenueCents*10_000-b.costMicros)/(b.revenueCents*10_000):null;
  return <>
    <div className="tiles">
      <StatTile label="MRR" value={cents(b.mrrCents)} sub={`${cents(b.arrCents)} ARR`}/>
      <StatTile label="Paying accounts" value={num(b.payingAccounts)} sub={`ARPA ${cents(b.arpaCents)}`}/>
      <StatTile label="New subscriptions" value={num(b.newSubscriptions)} sub="in period"/>
      <StatTile label="Churn" value={pct(b.churnRate)} status={b.churnRate!==null&&b.churnRate>0.05?'warning':undefined} sub={`${num(b.churned)} canceled in period`}/>
      <StatTile label="MRR at risk" value={cents(b.mrrAtRiskCents)} status={b.pastDue?'warning':'good'} sub={`${num(b.pastDue)} past due`}/>
      <StatTile label="Add-on revenue" value={cents(b.addonRevenueCents)} sub="billable add-on checks"/>
      <StatTile label="Revenue in period" value={cents(b.revenueCents)} sub={`${micros(b.costMicros)} vendor cost`}/>
      <StatTile label="Gross margin" value={pct(margin)} status={margin===null?undefined:margin<0.5?'warning':'good'} sub="revenue less vendor cost"/>
    </div>
    <div className="grid2">
      <Panel title="Subscriptions, last 12 months"><PairedColumns title="New vs canceled subscriptions per month" labels={b.trend.map(t=>month(t.month))} series={[{name:'New',values:b.trend.map(t=>t.new)},{name:'Canceled',values:b.trend.map(t=>t.churned)}]}/></Panel>
      <Panel title="Plans and subscription status">
        <table><thead><tr><th>Plan</th><th className="num">Accounts</th><th className="num">MRR</th></tr></thead><tbody>{b.byPlan.length?b.byPlan.map(p=><tr key={p.planId}><td>{p.planId}</td><td className="num">{num(p.accounts)}</td><td className="num">{cents(p.mrrCents)}</td></tr>):<tr><td colSpan={3} className="muted">No paying subscriptions yet.</td></tr>}</tbody></table>
        <div className="pills">{Object.entries(b.byStatus).map(([status,n])=><span key={status} className="pill">{status.replace('_',' ')} <b>{n}</b></span>)}</div>
      </Panel>
    </div>
    <Panel title="Margin per customer (lowest first)">{b.margins.length?<div className="scroll"><table><thead><tr><th>Customer</th><th className="num">Revenue</th><th className="num">Vendor cost</th><th className="num">Margin</th><th className="num">Margin %</th></tr></thead><tbody>{b.margins.slice(0,25).map(m=><tr key={m.accountId}><td><button className="link" onClick={()=>go(`/accounts/${encodeURIComponent(m.accountId)}`)}>{m.accountName}</button></td><td className="num">{cents(m.revenueCents)}</td><td className="num">{micros(m.costMicros)}</td><td className="num">{micros(m.marginMicros)}</td><td className="num">{m.marginRate===null?<Status tone="warning">No revenue</Status>:m.marginRate<0?<Status tone="critical">{pct(m.marginRate)}</Status>:pct(m.marginRate)}</td></tr>)}</tbody></table></div>:<p className="muted">No revenue or cost in this period.</p>}</Panel>
  </>}
