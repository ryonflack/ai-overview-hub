import { useEffect,useState } from 'react';
import { api,ApiError } from '../api';
import type { AccountDetail,AccountRow,Range,Sources } from '../api';
import { Status } from '../charts';
import type { Tone } from '../charts';
import { cents,date,micros,num,pct } from '../format';
import { useLoad } from '../hooks';
import { Notice,Panel } from '../ui';

const subTone=(s:string|null):Tone=>s==='active'||s==='trialing'?'good':s==='past_due'?'warning':s?'critical':'neutral';
export function Accounts({range,onUnauthorized,go}:{range:Range;onUnauthorized:()=>void;go:(path:string)=>void}){const[q,setQ]=useState('');const[query,setQuery]=useState('');useEffect(()=>{const t=setTimeout(()=>setQuery(q),250);return()=>clearTimeout(t)},[q]);const {data,error}=useLoad(()=>api<{accounts:AccountRow[]}>(`/accounts?range=${range}&q=${encodeURIComponent(query)}`),`${range}:${query}`,onUnauthorized);
  return <Panel title="Customer accounts" actions={<input type="search" placeholder="Search name or ID" aria-label="Search accounts" value={q} onChange={e=>setQ(e.target.value)}/>}>
    {error&&<Notice tone="critical">{error}</Notice>}
    {data&&(data.accounts.length?<div className="scroll"><table><thead><tr><th>Account</th><th>Subscription</th><th>Access</th><th className="num">Checks</th><th className="num">Revenue</th><th className="num">Vendor cost</th><th className="num">Margin</th><th>Last run</th></tr></thead><tbody>{data.accounts.map(a=><tr key={a.id}>
      <td><button className="link" onClick={()=>go(`/accounts/${encodeURIComponent(a.id)}`)}>{a.name}</button><small className="muted mono block">{a.id}</small></td>
      <td><Status tone={subTone(a.subscriptionStatus)}>{a.subscriptionStatus?.replace('_',' ')??'none'}</Status>{a.planId&&<small className="muted block">{a.planId} · {cents(a.monthlyPrice)}/mo</small>}</td>
      <td>{a.status==='paused'?<Status tone="serious">Paused</Status>:<Status tone="good">Active</Status>}{a.addonWaived&&<small className="muted block">add-ons waived</small>}</td>
      <td className="num">{num(a.checks)}{a.failures?<small className="muted block">{num(a.failures)} failed</small>:null}</td><td className="num">{cents(a.revenueCents)}</td><td className="num">{micros(a.costMicros)}</td><td className="num">{a.marginRate===null?'—':a.marginRate<0?<Status tone="critical">{pct(a.marginRate)}</Status>:pct(a.marginRate)}</td><td>{date(a.lastRunAt)}</td></tr>)}</tbody></table></div>:<p className="muted">No accounts match.</p>)}
  </Panel>}

export function AccountPage({id,range,onUnauthorized,go}:{id:string;range:Range;onUnauthorized:()=>void;go:(path:string)=>void}){const detail=useLoad(()=>api<AccountDetail>(`/accounts/${encodeURIComponent(id)}?range=${range}`),`${id}:${range}`,onUnauthorized);const d=detail.data;
  if(detail.error)return <><button className="link" onClick={()=>go('/accounts')}>← Accounts</button><Notice tone="critical">{detail.error}</Notice></>;if(!d)return <p className="muted">Loading…</p>;
  return <>
    <button className="link" onClick={()=>go('/accounts')}>← Accounts</button>
    <h2 className="page-sub">{d.account.name} <small className="muted mono">{d.account.id}</small></h2>
    <div className="grid2">
      <Controls id={id} initial={d.controls} onSaved={detail.reload} onUnauthorized={onUnauthorized}/>
      <Panel title="Subscription and team">
        <table><tbody>{d.subscriptions.map(s=><tr key={s.id}><td>{s.planName}</td><td><Status tone={subTone(s.status)}>{s.status.replace('_',' ')}</Status></td><td className="num">{cents(s.monthlyPrice)}/mo</td><td className="small">{s.canceledAt?`canceled ${date(s.canceledAt)}`:s.periodEnd?`renews ${date(s.periodEnd)}`:''}</td></tr>)}{!d.subscriptions.length&&<tr><td className="muted">No subscription.</td></tr>}</tbody></table>
        <ul className="plain">{d.members.map(m=><li key={m.email}>{m.email} <small className="muted">{m.role}</small></li>)}</ul>
      </Panel>
    </div>
    <Panel title="Cost by resource">{d.costs.length?<table><thead><tr><th>Source</th><th className="num">Checks</th><th className="num">Failed</th><th className="num">Cost</th><th className="num">Per check</th></tr></thead><tbody>{d.costs.map(c=><tr key={c.key}><td>{c.label}</td><td className="num">{num(c.calls)}</td><td className="num">{num(c.failures)}</td><td className="num">{micros(c.costMicros)}</td><td className="num">{micros(c.costPerCheckMicros)}</td></tr>)}</tbody></table>:<p className="muted">No checks in this period.</p>}</Panel>
    <div className="grid2">
      <Panel title="Projects">{d.projects.length?<table><tbody>{d.projects.map(p=><tr key={p.id}><td>{p.name}<small className="muted block">{p.primaryDomain}</small></td><td>{p.frequency}</td><td className="small">last run {date(p.lastRunAt)}</td></tr>)}</tbody></table>:<p className="muted">No projects.</p>}</Panel>
      <Panel title="Recent runs">{d.runs.length?<table><thead><tr><th>Started</th><th>Status</th><th className="num">Checks</th><th className="num">Cost</th></tr></thead><tbody>{d.runs.map(r=><tr key={r.id}><td>{date(r.createdAt)}</td><td><Status tone={r.status==='COMPLETED'?'good':r.status==='FAILED'?'critical':r.status==='COMPLETED_WITH_ERRORS'?'warning':'neutral'}>{r.status.toLowerCase().replace(/_/g,' ')}</Status></td><td className="num">{num(r.checks)}{r.failures?` (${num(r.failures)} failed)`:''}</td><td className="num">{micros(r.costMicros)}</td></tr>)}</tbody></table>:<p className="muted">No runs yet.</p>}</Panel>
    </div>
  </>}

/** Per-account overrides: pause, vendor routing, sources, query limit, add-on waiver. Empty fields inherit the global settings. */
function Controls({id,initial,onSaved,onUnauthorized}:{id:string;initial:AccountDetail['controls'];onSaved:()=>void;onUnauthorized:()=>void}){const sources=useLoad(()=>api<Sources>('/sources'),'sources',onUnauthorized);const[paused,setPaused]=useState(initial.paused);const[vendors,setVendors]=useState<Record<string,string>>(initial.routing.simulatedVendors as Record<string,string>);const[disabled,setDisabled]=useState<string[]>(initial.routing.disabledSources);const[limit,setLimit]=useState(initial.maxQueriesOverride===null?'':String(initial.maxQueriesOverride));const[waived,setWaived]=useState(initial.addonWaived);const[notes,setNotes]=useState('');const[saving,setSaving]=useState(false);const[message,setMessage]=useState<{tone:Tone;text:string}|null>(null);
  const switchable=(sources.data?.sources??[]).filter(s=>s.vendorOptions.length);
  const save=async()=>{if(limit.trim()&&!/^\d+$/.test(limit.trim())){setMessage({tone:'critical',text:'Query limit must be a whole number.'});return}if(paused&&!initial.paused&&!window.confirm('Pause this account? Its scheduled and manual runs will stop until you reactivate it.'))return;setSaving(true);setMessage(null);try{await api(`/accounts/${encodeURIComponent(id)}/controls`,{method:'PUT',body:{status:paused?'paused':'active',simulatedVendors:vendors,disabledSources:disabled,maxQueriesOverride:limit.trim()?Number(limit):null,addonWaived:waived,notes:notes||undefined}});setMessage({tone:'good',text:'Account controls saved.'});setNotes('');onSaved()}catch(e){setMessage({tone:'critical',text:e instanceof ApiError?e.message:'Could not save controls.'})}finally{setSaving(false)}};
  return <Panel title="Account controls" actions={<button disabled={saving} onClick={save}>{saving?'Saving…':'Save'}</button>}>
    {message&&<Notice tone={message.tone}>{message.text}</Notice>}
    <div className="form">
      <label className="switch"><input type="checkbox" checked={!paused} onChange={e=>setPaused(!e.target.checked)}/><span>{paused?'Paused: runs are blocked':'Active'}</span></label>
      <label className="switch"><input type="checkbox" checked={waived} onChange={e=>setWaived(e.target.checked)}/><span>Waive add-on charges</span></label>
      <label>Query limit override<input inputMode="numeric" placeholder="plan default" value={limit} onChange={e=>setLimit(e.target.value)}/></label>
      {switchable.map(s=><label key={s.key}>{s.label} vendor<select value={vendors[s.provider]??''} onChange={e=>setVendors(v=>{const next={...v};if(e.target.value)next[s.provider]=e.target.value;else delete next[s.provider];return next})}><option value="">Global setting ({s.vendorName})</option>{s.vendorOptions.map(o=><option key={o.vendor} value={o.vendor}>{o.name}{o.configured?'':' (no credentials)'}</option>)}</select></label>)}
      <fieldset><legend>Sources turned off for this account</legend>{(sources.data?.sources??[]).map(s=><label key={s.key} className="check"><input type="checkbox" checked={disabled.includes(s.key)} onChange={e=>setDisabled(d=>e.target.checked?[...d,s.key]:d.filter(k=>k!==s.key))}/>{s.label}</label>)}</fieldset>
      <label>Note for the audit log<input placeholder="Why this change? (optional)" value={notes} onChange={e=>setNotes(e.target.value)} maxLength={2000}/></label>
    </div>
  </Panel>}
