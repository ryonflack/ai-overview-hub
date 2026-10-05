import { api } from '../api';
import type { Overview as Data,Range } from '../api';
import { ShareBar,StatTile,Status } from '../charts';
import { cents,micros,num,pct } from '../format';
import { useLoad } from '../hooks';
import { Notice,Panel } from '../ui';

export function Overview({range,onUnauthorized,go}:{range:Range;onUnauthorized:()=>void;go:(path:string)=>void}){const {data,error}=useLoad(()=>api<Data>(`/overview?range=${range}`),range,onUnauthorized);if(error)return <Notice tone="critical">{error}</Notice>;if(!data)return <p className="muted">Loading…</p>;const b=data.business;const h=data.health;const failedRuns=(h.runs.FAILED??0)+(h.runs.COMPLETED_WITH_ERRORS??0);const webhookFailures=h.webhooks.FAILED??0;const maxCost=Math.max(0,...data.topSources.map(s=>s.costMicros));
  return <>
    <div className="tiles">
      <StatTile label="MRR" value={cents(b.mrrCents)} sub={`${num(b.payingAccounts)} paying accounts`}/>
      <StatTile label="Revenue in period" value={cents(data.revenueCents)} sub={`incl. ${cents(b.addonRevenueCents)} add-ons`}/>
      <StatTile label="Vendor cost in period" value={micros(data.costMicros)} sub={`${num(data.checks)} checks`}/>
      <StatTile label="Gross margin" value={pct(data.grossMarginRate)} status={data.grossMarginRate===null?undefined:data.grossMarginRate<0.5?'warning':'good'} sub={data.grossMarginRate===null?'no revenue yet':'revenue less vendor cost'}/>
    </div>
    <div className="grid2">
      <Panel title="Needs attention">
        <ul className="checks">
          <li>{h.degradedSources.length?<Status tone="critical">{h.degradedSources.length} source{h.degradedSources.length>1?'s':''} above 10% errors</Status>:<Status tone="good">All sources under 10% errors</Status>}{h.degradedSources.map(s=><small key={s.key}>{s.label}: {pct(s.errorRate)}</small>)}</li>
          <li>{h.failedJobs?<Status tone="serious">{h.failedJobs} failed job{h.failedJobs>1?'s':''} waiting for retry</Status>:<Status tone="good">No failed jobs</Status>}</li>
          <li>{failedRuns?<Status tone="warning">{failedRuns} run{failedRuns>1?'s':''} with errors this period</Status>:<Status tone="good">No runs with errors</Status>}</li>
          <li>{webhookFailures?<Status tone="critical">{webhookFailures} Stripe webhook{webhookFailures>1?'s':''} failed</Status>:<Status tone="good">Stripe webhooks healthy</Status>}</li>
          <li>{b.pastDue?<Status tone="warning">{b.pastDue} past-due subscription{b.pastDue>1?'s':''} ({cents(b.mrrAtRiskCents)} MRR at risk)</Status>:<Status tone="good">No past-due subscriptions</Status>}</li>
        </ul>
        <button className="link" onClick={()=>go('/performance')}>Open performance →</button>
      </Panel>
      <Panel title="Highest-cost resources">
        {data.topSources.length?<div className="scroll"><table><thead><tr><th>Source</th><th className="num">Checks</th><th className="num">Cost</th><th className="num">Per check</th><th aria-label="Share"/></tr></thead><tbody>{data.topSources.map(s=><tr key={s.key}><td>{s.label}</td><td className="num">{num(s.calls)}</td><td className="num">{micros(s.costMicros)}</td><td className="num">{micros(s.costPerCheckMicros)}</td><td className="share-cell"><ShareBar value={s.costMicros} max={maxCost} label={pct(s.share)}/></td></tr>)}</tbody></table></div>:<p className="muted">No checks ran in this period.</p>}
        <button className="link" onClick={()=>go('/costs')}>Open cost breakdown →</button>
      </Panel>
    </div>
  </>}
