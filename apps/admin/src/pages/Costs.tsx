import { useState } from 'react';
import { api } from '../api';
import type { Costs as Data,Range } from '../api';
import { Columns,ShareBar,Status } from '../charts';
import { cents,day,micros,num,pct } from '../format';
import { useLoad } from '../hooks';
import { Notice,Panel,Tabs } from '../ui';

const dimensions=[['source','By resource'],['vendor','By vendor'],['account','By customer']] as const;
type Dimension = typeof dimensions[number][0];
/** Cost per resource: every check (one query on one source) carries the vendor's reported cost or the operator's rate. */
export function Costs({range,onUnauthorized,go}:{range:Range;onUnauthorized:()=>void;go:(path:string)=>void}){const[by,setBy]=useState<Dimension>('source');const {data,error}=useLoad(()=>api<Data>(`/costs?range=${range}&by=${by}`),`${range}:${by}`,onUnauthorized);
  return <>
    <Tabs label="Group cost by" value={by} options={dimensions} onChange={setBy}/>
    {error&&<Notice tone="critical">{error}</Notice>}
    {!data&&!error&&<p className="muted">Loading…</p>}
    {data&&<>
      {data.unpricedCalls>0&&<Notice tone="warning">{num(data.unpricedCalls)} successful checks have no cost because their vendor has no rate set. <button className="link" onClick={()=>go('/sources')}>Set vendor rates →</button></Notice>}
      <Panel title={`Vendor cost · ${micros(data.totalMicros)} total`}><Columns title="Daily vendor cost" data={data.daily.map(d=>({key:d.day,label:day(d.day),value:d.costMicros/1_000_000,tip:`${micros(d.costMicros)} across ${num(d.calls)} checks`}))} format={v=>`$${v.toLocaleString('en-US',{maximumFractionDigits:2})}`}/></Panel>
      <Panel title={dimensions.find(d=>d[0]===by)![1]}>
        {data.lines.length?<div className="scroll"><table><thead><tr><th>{by==='source'?'Source':by==='vendor'?'Vendor':'Customer'}</th><th className="num">Checks</th><th className="num">Failed</th><th className="num">Cost</th><th className="num">Per check</th><th className="num">Per successful answer</th><th className="num">Share</th><th aria-label="Share bar"/></tr></thead><tbody>{data.lines.map(l=><tr key={l.key}>
          <td>{by==='account'?<button className="link" onClick={()=>go(`/accounts/${encodeURIComponent(l.key)}`)}>{l.label}</button>:l.label}{l.unpricedCalls>0&&<> <Status tone="warning">{num(l.unpricedCalls)} unpriced</Status></>}</td>
          <td className="num">{num(l.calls)}</td><td className="num">{l.failures?`${num(l.failures)} (${pct(l.failures/l.calls)})`:'0'}</td><td className="num">{micros(l.costMicros)}</td><td className="num">{micros(l.costPerCheckMicros)}</td><td className="num">{micros(l.costPerSuccessMicros)}</td><td className="num">{pct(l.share)}</td><td className="share-cell"><ShareBar value={l.costMicros} max={data.lines[0].costMicros} label={pct(l.share)}/></td></tr>)}</tbody></table></div>:<p className="muted">No checks ran in this period.</p>}
      </Panel>
      {data.margins&&<Panel title="Margin per customer (lowest first)"><div className="scroll"><table><thead><tr><th>Customer</th><th className="num">Revenue</th><th className="num">Vendor cost</th><th className="num">Margin</th><th className="num">Margin %</th></tr></thead><tbody>{data.margins.map(m=><tr key={m.accountId}><td><button className="link" onClick={()=>go(`/accounts/${encodeURIComponent(m.accountId)}`)}>{m.accountName}</button></td><td className="num">{cents(m.revenueCents)}</td><td className="num">{micros(m.costMicros)}</td><td className="num">{micros(m.marginMicros)}</td><td className="num">{m.marginRate===null?<Status tone="warning">No revenue</Status>:m.marginRate<0?<Status tone="critical">{pct(m.marginRate)}</Status>:pct(m.marginRate)}</td></tr>)}</tbody></table></div><p className="muted small">Revenue is the subscription prorated over the period plus billable add-on checks.</p></Panel>}
    </>}
  </>}
