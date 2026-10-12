import {useMemo,useState} from 'react';
import {methodLabels,quoteRun} from '../../../packages/core/src/sources';
import {providerIds} from '../../../packages/core/src/types';
import {demoResult,demoRun,formatDate,metricsFor,placeLabel,runsFor,sourcesFor,visibleOn} from './demo';
import type {DemoAccount} from './demo';

// Portal screens run on the demo accounts' example data until the authenticated projects, runs and billing APIs exist.
// Edits stay in this browser, per demo account, so the beta can be explored end to end without signing in.
const SETTINGS_KEY=(a:DemoAccount)=>`aoh.settings.draft.${a.id}`;
const QUERIES_KEY=(a:DemoAccount)=>`aoh.queries.draft.${a.id}`;
const MAX_QUERIES=100;
const pct=(n:number)=>`${Math.round(n*10)/10}%`;

const load=<T,>(key:string,fallback:T):T=>{try{const raw=localStorage.getItem(key);return raw?{...fallback,...JSON.parse(raw)}:fallback}catch{return fallback}};
const store=(key:string,value:unknown)=>{try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}};

function Head({kicker,title,action}:{kicker:string;title:string;action?:React.ReactNode}){return <div className="dash-head"><div><small>{kicker}</small><h2>{title}</h2></div>{action}</div>}

export function Projects({account,open}:{account:DemoAccount;open:(page:'overview'|'sources'|'queries')=>void}){
  const runs=runsFor(account);const capitalized=account.frequency[0].toUpperCase()+account.frequency.slice(1);
  const projects=[{name:account.name,domain:account.domain,queries:account.queries.length,sources:sourcesFor(account).length,location:placeLabel(account.location),frequency:capitalized,last:formatDate(runs[0].date),visibility:metricsFor(account,0).visibility as number|null,active:true},{name:`${account.name} (staging)`,domain:`staging.${account.domain}`,queries:0,sources:sourcesFor(account).length,location:placeLabel(account.location),frequency:'Manual',last:'Not run yet',visibility:null,active:false}];
  return <div className="dash portal">
    <Head kicker="WORKSPACE" title="Projects" action={<button disabled title="Additional projects open up after the beta">New project</button>}/>
    <p className="lede">Each project tracks one website and its queries. During the beta, each workspace includes one active project.</p>
    <div className="project-grid">{projects.map(p=><article className={`panel project ${p.active?'':'idle'}`} key={p.domain}>
      <div className="panelhead"><h3>{p.name}</h3><span className={`status ${p.active?'ok':''}`}>{p.active?'Active':'Draft'}</span></div>
      <b className="project-domain">{p.domain}</b>
      <dl><div><dt>Queries</dt><dd>{p.queries} / {MAX_QUERIES}</dd></div><div><dt>AI sources</dt><dd>{p.sources}</dd></div><div><dt>Location</dt><dd>{p.location}</dd></div><div><dt>Schedule</dt><dd>{p.frequency}</dd></div><div><dt>Last run</dt><dd>{p.last}</dd></div><div><dt>AI Visibility</dt><dd>{p.visibility===null?'—':pct(p.visibility)}</dd></div></dl>
      {p.active&&<div className="project-actions"><button onClick={()=>open('overview')}>Open dashboard</button><button className="ghost" onClick={()=>open('queries')}>Queries</button><button className="ghost" onClick={()=>open('sources')}>AI sources</button></div>}
    </article>)}</div>
  </div>
}

export function Queries({account}:{account:DemoAccount}){
  const sources=sourcesFor(account);const runs=runsFor(account);
  const[list,setList]=useState(()=>load(QUERIES_KEY(account),{items:account.queries}).items);
  const[filter,setFilter]=useState('');const[draft,setDraft]=useState('');const[tag,setTag]=useState(account.queries[0]?.tag??'Research');const[error,setError]=useState<string|null>(null);
  const rows=useMemo(()=>list.map(q=>{const results=sources.map(s=>demoResult(account,q.text,s,0));const visible=visibleOn(results);const before=runs.length>1?visibleOn(sources.map(s=>demoResult(account,q.text,s,1))):visible;const positions=results.flatMap(r=>r.citationPosition?[r.citationPosition]:[]);return{...q,visible,cited:results.filter(r=>r.customerCited).length,best:positions.length?Math.min(...positions):null,delta:visible-before}}),[list,account,sources,runs.length]);
  const shown=rows.filter(r=>`${r.text} ${r.tag}`.toLowerCase().includes(filter.trim().toLowerCase()));
  const save=(items:typeof list)=>{setList(items);if(!store(QUERIES_KEY(account),{items}))setError('Your browser blocked saving. Changes will be lost when you leave.')};
  const add=(e:React.FormEvent)=>{e.preventDefault();const text=draft.trim().replace(/\s+/g,' ');setError(null);
    if(!text)return;if(text.length>200)return setError('Keep queries under 200 characters.');if(list.some(q=>q.text.toLowerCase()===text.toLowerCase()))return setError('That query is already tracked.');if(list.length>=MAX_QUERIES)return setError(`Your plan tracks up to ${MAX_QUERIES} queries.`);
    save([...list,{text,tag}]);setDraft('')};
  return <div className="dash portal">
    <Head kicker={account.domain.toUpperCase()} title="Queries" action={<span className="count">{list.length} / {MAX_QUERIES} tracked</span>}/>
    <form className="panel addquery" onSubmit={add}><label>Add a query<input value={draft} maxLength={200} placeholder="Add a question your customers ask" onChange={e=>setDraft(e.target.value)}/></label><label>Topic<select value={tag} onChange={e=>setTag(e.target.value)}>{[...new Set(account.queries.map(q=>q.tag))].map(t=><option key={t}>{t}</option>)}</select></label><button disabled={!draft.trim()}>Add query</button></form>
    {error&&<div className="formerror" role="alert">{error}</div>}
    <div className="panel table queries"><div className="panelhead"><h3>Latest run · {formatDate(runs[0].date)}</h3><input className="search" type="search" aria-label="Filter queries" placeholder="Filter queries" value={filter} onChange={e=>setFilter(e.target.value)}/></div>
      <div className="tr th"><span>QUERY</span><span>TOPIC</span><span>VISIBLE ON</span><span>BEST POSITION</span><span>CHANGE</span><span/></div>
      {shown.map(r=><div className="tr" key={r.text}><span>{r.text}</span><span><i className="tag">{r.tag}</i></span><span className={r.visible?'good':'bad'}>{r.visible} of {sources.length} sources</span><span>{r.best??'—'}</span><span className={r.delta>0?'good':r.delta<0?'loss-text':'muted'}>{r.delta>0?`↑ ${r.delta}`:r.delta<0?`↓ ${-r.delta}`:'—'}</span><span><button type="button" className="ghost small" aria-label={`Remove ${r.text}`} onClick={()=>save(list.filter(q=>q.text!==r.text))}>Remove</button></span></div>)}
      {!shown.length&&<p className="muted empty">{list.length?'No queries match that filter.':'Add your first query to start tracking.'}</p>}
      <p className="hint">New queries are checked on the next run. Results shown are example data.</p>
    </div>
  </div>
}

export function Reports({account}:{account:DemoAccount}){
  const runs=useMemo(()=>runsFor(account).map(r=>{const m=metricsFor(account,r.index);return{...r,visibility:m.visibility,citation:m.citationRate,mention:m.mentionRate}}),[account]);
  const[busy,setBusy]=useState<string|null>(null);const[error,setError]=useState<string|null>(null);
  const download=async(runId:string,index:number,date:string,kind:'xlsx'|'csv')=>{setBusy(`${runId}:${kind}`);setError(null);
    try{const{createWorkbook,createCsvZip}=await import('../../../packages/reporting/src/export');const run=demoRun(account,index);const bytes=kind==='xlsx'?createWorkbook(run):await createCsvZip(run);
      const blob=new Blob([bytes as BlobPart],{type:kind==='xlsx'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'application/zip'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${account.domain.split('.')[0]}-${date}.${kind==='xlsx'?'xlsx':'zip'}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
    catch{setError('The export could not be created. Try again.')}finally{setBusy(null)}};
  return <div className="dash portal">
    <Head kicker={account.domain.toUpperCase()} title="Reports"/>
    <p className="lede">A report is saved after every run. Download it as an Excel workbook or a ZIP of CSV files, one per AI source.</p>
    {error&&<div className="formerror" role="alert">{error}</div>}
    <div className="panel table reports"><div className="tr th"><span>RUN</span><span>QUERIES</span><span>AI VISIBILITY</span><span>CITATION RATE</span><span>MENTION RATE</span><span>DOWNLOAD</span></div>
      {runs.map((r,i)=>{const prev=runs[i+1];const d=prev?Math.round((r.visibility-prev.visibility)*10)/10:null;return <div className="tr" key={r.id}><span><b>{formatDate(r.date)}</b><small className="muted block">{sourcesFor(account).length} sources · {placeLabel(account.location)}</small></span><span>{account.queries.length}</span><span>{pct(r.visibility)} {d!==null&&<small className={d>=0?'good':'loss-text'}>{d>=0?'↑':'↓'} {Math.abs(d)}</small>}</span><span>{pct(r.citation)}</span><span>{pct(r.mention)}</span><span className="downloads">{(['xlsx','csv'] as const).map(k=><button key={k} className="ghost small" disabled={busy!==null} onClick={()=>download(r.id,r.index,r.date,k)}>{busy===`${r.id}:${k}`?'Preparing…':k.toUpperCase()}</button>)}</span></div>})}
      <p className="hint">Example reports contain sample answers for this demo account.</p>
    </div>
  </div>
}

export function Billing({account}:{account:DemoAccount}){
  const quote=quoteRun({providers:providerIds.filter(id=>account.methods[id]?.length),methods:account.methods},account.queries.length,{maxQueries:MAX_QUERIES,addonUnitPrice:null,allowedProviders:[...providerIds]});
  const used=quote.checks;const included=quote.includedChecks;const invoices=runsFor(account).map(r=>formatDate(r.date));
  return <div className="dash portal">
    <Head kicker="ACCOUNT" title="Billing"/>
    <div className="twocol">
      <section className="panel plan"><div className="panelhead"><h3>Your plan</h3><span className="beta-pill">Beta</span></div><b className="planprice">$69.99<small>/ month</small></b><ul><li>Up to {MAX_QUERIES} monitored queries</li><li>Seven AI search sources</li><li>Monthly reports, XLSX and CSV exports</li></ul><p className="hint">No contract. Cancel anytime and you won’t be charged again.</p></section>
      <section className="panel"><div className="panelhead"><h3>This billing period</h3><span>Renews {formatDate('2026-10-04')}</span></div>
        <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={included} aria-valuenow={Math.min(used,included)} aria-label="Answer checks used"><i style={{width:`${Math.min(100,used/included*100)}%`}}/></div>
        <dl className="kv"><div><dt>Answer checks used</dt><dd>{included.toLocaleString()} / {included.toLocaleString()}</dd></div><div><dt>Add-on checks</dt><dd>{quote.addonChecks.toLocaleString()}</dd></div><div><dt>Payment method</dt><dd>Visa ending 4242</dd></div></dl>
        <button disabled title="Opens our secure billing portal once accounts go live">Manage payment &amp; cancel</button>
      </section>
    </div>
    <div className="panel table invoices"><div className="panelhead"><h3>Invoices</h3></div><div className="tr th"><span>DATE</span><span>DESCRIPTION</span><span>AMOUNT</span><span>STATUS</span></div>
      {invoices.map(d=><div className="tr" key={d}><span>{d}</span><span>Monthly plan</span><span>$69.99</span><span className="good">Paid</span></div>)}
      <p className="hint">Amounts exclude applicable tax. Example data.</p>
    </div>
  </div>
}

const settingsFor=(a:DemoAccount)=>({name:a.owner.name,email:a.owner.email,brands:a.brands.join(', '),domains:a.alternateDomains.join(', '),frequency:a.frequency,notifyRun:true,notifyDrop:true,digest:false});
type SettingsDraft=ReturnType<typeof settingsFor>;
export function Settings({account}:{account:DemoAccount}){
  const[s,setS]=useState(()=>load(SETTINGS_KEY(account),settingsFor(account)));const[saved,setSaved]=useState<'idle'|'saved'|'error'>('idle');
  const set=(patch:Partial<SettingsDraft>)=>{setS(v=>({...v,...patch}));setSaved('idle')};
  const save=(e:React.FormEvent)=>{e.preventDefault();setSaved(store(SETTINGS_KEY(account),s)?'saved':'error')};
  return <form className="dash portal sources" onSubmit={save}>
    <Head kicker="ACCOUNT" title="Settings" action={<button>{saved==='saved'?'Saved ✓':'Save settings'}</button>}/>
    {saved==='error'&&<div className="formerror" role="alert">Your browser blocked saving. Try again or allow site storage.</div>}
    <section className="panel"><div className="panelhead"><h3>Profile</h3></div><div className="fields">
      <label>Name<input value={s.name} maxLength={80} autoComplete="name" onChange={e=>set({name:e.target.value})}/></label>
      <label>Email<input type="email" value={s.email} maxLength={120} autoComplete="email" onChange={e=>set({email:e.target.value})}/></label>
    </div></section>
    <section className="panel"><div className="panelhead"><h3>Brand detection</h3><span>How we recognise you in answers</span></div><div className="fields">
      <label>Brand names <i>comma separated</i><input value={s.brands} maxLength={300} onChange={e=>set({brands:e.target.value})}/></label>
      <label>Alternate domains <i>comma separated</i><input value={s.domains} maxLength={300} placeholder="e.g. yourbrand.co.uk" onChange={e=>set({domains:e.target.value})}/></label>
    </div><p className="hint">A mention counts when any brand name appears in the answer text. A citation counts when the answer links to {account.domain} or an alternate domain.</p></section>
    <section className="panel"><div className="panelhead"><h3>Schedule</h3></div><div className="fields">
      <label>Run frequency<select value={s.frequency} onChange={e=>set({frequency:e.target.value})}><option value="monthly">Monthly</option><option value="manual">Manual only</option></select></label>
    </div><p className="hint">Weekly and biweekly runs are planned after the beta.</p></section>
    <section className="panel"><div className="panelhead"><h3>Email notifications</h3></div>
      {([['notifyRun','When a run finishes'],['notifyDrop','When visibility drops more than 5 points'],['digest','Monthly summary for my team']] as const).map(([k,label])=><label className="check toggle" key={k}><input type="checkbox" checked={s[k]} onChange={e=>set({[k]:e.target.checked})}/>{label}</label>)}
    </section>
    <p className="hint">Collection methods and location are set per project under <b>AI sources</b>. {methodLabels.simulated.label} and {methodLabels.api.label} answers are reported separately.</p>
  </form>
}
