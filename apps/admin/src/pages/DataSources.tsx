import { useState } from 'react';
import { api,ApiError } from '../api';
import type { Rate,Sources } from '../api';
import { Status } from '../charts';
import type { Tone } from '../charts';
import { date } from '../format';
import { useLoad } from '../hooks';
import { Notice,Panel } from '../ui';
import type { RoutingOverrides } from '../../../../packages/admin/src/routing';

/** Switch which vendor serves each source and take sources offline, without a redeploy. Global settings apply to every account unless an account overrides them. */
export function DataSources({onUnauthorized}:{onUnauthorized:()=>void}){const sources=useLoad(()=>api<Sources>('/sources'),'sources',onUnauthorized);const[edit,setEdit]=useState<RoutingOverrides|null>(null);const[saving,setSaving]=useState(false);const[message,setMessage]=useState<{tone:Tone;text:string}|null>(null);
  // The draft only exists once the operator edits something; until then the saved routing is shown.
  const s=sources.data;const draft=edit??s?.routing??null;const dirty=Boolean(s&&edit&&JSON.stringify(edit)!==JSON.stringify(s.routing));const setDraft=(change:(d:RoutingOverrides)=>RoutingOverrides)=>setEdit(prev=>{const base=prev??s?.routing;return base?change(base):prev});
  const setVendor=(engine:string,vendor:string,envVendor:string)=>setDraft(d=>{const simulatedVendors={...d.simulatedVendors} as Record<string,string>;if(vendor===envVendor)delete simulatedVendors[engine];else simulatedVendors[engine]=vendor;return{...d,simulatedVendors} as RoutingOverrides});
  const toggle=(key:string,on:boolean)=>setDraft(d=>({...d,disabledSources:on?d.disabledSources.filter(k=>k!==key):[...d.disabledSources,key as RoutingOverrides['disabledSources'][number]]}));
  const save=async()=>{if(!draft||!s)return;const changes=s.sources.flatMap(row=>{const off=draft.disabledSources.includes(row.key as never);const vendor=row.vendorOptions.length?(draft.simulatedVendors as Record<string,string>)[row.provider]??row.envVendor:row.vendor;return[...(off!==row.disabled?[`${row.label}: ${off?'turn OFF for all customers':'turn on'}`]:[]),...(vendor!==row.vendor?[`${row.label}: switch to ${row.vendorOptions.find(v=>v.vendor===vendor)?.name??vendor}`]:[])]});if(!window.confirm(`Apply these changes to every customer?\n\n${changes.join('\n')}`))return;setSaving(true);setMessage(null);try{await api('/sources/routing',{method:'PUT',body:draft});setMessage({tone:'good',text:'Routing saved. The customer portal reflects it immediately.'});setEdit(null);sources.reload()}catch(e){setMessage({tone:'critical',text:e instanceof ApiError?e.message:'Could not save routing.'})}finally{setSaving(false)}};
  return <>
    {message&&<Notice tone={message.tone}>{message.text}</Notice>}
    {sources.error&&<Notice tone="critical">{sources.error}</Notice>}
    {s?.configError&&<Notice tone="critical">Provider configuration is invalid: {s.configError}</Notice>}
    {s?.mock&&<Notice tone="warning">Mock providers are on (USE_MOCK_SERP_PROVIDERS=true). No vendor is being called.</Notice>}
    {s&&draft&&<Panel title="Sources and vendors" actions={<div className="row">{dirty&&<button className="ghost" onClick={()=>setEdit(null)}>Discard</button>}<button disabled={!dirty||saving} onClick={save}>{saving?'Saving…':'Save changes'}</button></div>}>
      <div className="scroll"><table><thead><tr><th>Source</th><th>Customers see it</th><th>Vendor</th><th>Credentials</th></tr></thead><tbody>{s.sources.map(row=>{const off=draft.disabledSources.includes(row.key as never);const vendor=row.vendorOptions.length?(draft.simulatedVendors as Record<string,string>)[row.provider]??row.envVendor:row.vendor;const option=row.vendorOptions.find(v=>v.vendor===vendor);const configured=option?option.configured:row.credentialsConfigured;return <tr key={row.key}>
        <td>{row.label}</td>
        <td><label className="switch"><input type="checkbox" checked={!off} onChange={e=>toggle(row.key,e.target.checked)}/><span>{off?'Off':'On'}</span></label>{!off&&!configured&&<small className="muted"> unavailable until credentials are set</small>}</td>
        <td>{row.vendorOptions.length?<select aria-label={`Vendor for ${row.label}`} value={vendor} onChange={e=>setVendor(row.provider,e.target.value,row.envVendor)}>{row.vendorOptions.map(v=><option key={v.vendor} value={v.vendor}>{v.name}{v.vendor===row.envVendor?' (env default)':''}{v.configured?'':' (no credentials)'}</option>)}</select>:row.vendorName}</td>
        <td>{configured?<Status tone="good">Configured</Status>:<Status tone="critical">Missing</Status>}</td>
</tr>})}</tbody></table></div>
      <p className="muted small">Customers never see vendor names. Turning a source off marks it unavailable in the portal. Credentials stay in the API's secret store; this page only routes between vendors that are already configured.</p>
    </Panel>}
    <Rates onUnauthorized={onUnauthorized}/>
  </>}

/** Per-call vendor prices used to cost checks when a vendor doesn't report cost itself. Entered in dollars, stored in micro-dollars. */
function Rates({onUnauthorized}:{onUnauthorized:()=>void}){const rates=useLoad(()=>api<{rates:Rate[]}>('/rates'),'rates',onUnauthorized);const[edits,setEdits]=useState<Record<string,string>>({});const[saving,setSaving]=useState(false);const[message,setMessage]=useState<{tone:Tone;text:string}|null>(null);const id=(r:Rate)=>`${r.vendor}|${r.provider}|${r.method}`;
  const save=async()=>{const changed=(rates.data?.rates??[]).filter(r=>edits[id(r)]!==undefined);const invalid=changed.find(r=>edits[id(r)].trim()!==''&&!(Number(edits[id(r)])>=0));if(invalid){setMessage({tone:'critical',text:`Enter a dollar amount for ${invalid.label} (${invalid.vendorName}).`});return}setSaving(true);setMessage(null);try{await api('/rates',{method:'PUT',body:{rates:changed.map(r=>({vendor:r.vendor,provider:r.provider,method:r.method,unitCostMicros:edits[id(r)].trim()===''?null:Math.round(Number(edits[id(r)])*1_000_000)}))}});setEdits({});setMessage({tone:'good',text:'Rates saved. They apply to checks recorded from now on.'});rates.reload()}catch(e){setMessage({tone:'critical',text:e instanceof ApiError?e.message:'Could not save rates.'})}finally{setSaving(false)}};
  return <Panel title="Vendor cost rates" actions={<button disabled={!Object.keys(edits).length||saving} onClick={save}>{saving?'Saving…':'Save rates'}</button>}>
    {message&&<Notice tone={message.tone}>{message.text}</Notice>}
    {rates.error&&<Notice tone="critical">{rates.error}</Notice>}
    {rates.data&&<div className="scroll"><table><thead><tr><th>Source</th><th>Vendor</th><th>Cost per successful call (USD)</th><th>Updated</th></tr></thead><tbody>{rates.data.rates.map(r=><tr key={id(r)}><td>{r.label}</td><td>{r.vendorName}</td><td><input className="money" inputMode="decimal" aria-label={`Cost per call for ${r.label} via ${r.vendorName}`} placeholder={r.reportsCost?'reported per call':'not set'} value={edits[id(r)]??(r.unitCostMicros===null?'':String(r.unitCostMicros/1_000_000))} onChange={e=>setEdits(x=>({...x,[id(r)]:e.target.value}))}/>{r.reportsCost&&<small className="muted"> vendor reports cost; rate is a fallback</small>}</td><td className="small">{date(r.updatedAt)}</td></tr>)}</tbody></table></div>}
    <p className="muted small">Leave blank to clear a rate. Checks without a reported cost or a rate show as "unpriced" in the cost breakdown.</p>
  </Panel>}
