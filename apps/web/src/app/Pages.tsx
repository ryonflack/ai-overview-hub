import {useEffect,useMemo,useState} from 'react';
import {api,auth,errorText} from '../session';
import type {Billing,Me,Query,Run,RunSummary} from '../session';
import {Head,Loading,Problem,formatDate,money,pct,useLoad} from './ui';

const latestFinished=(runs:RunSummary[])=>runs.find(r=>r.status==='COMPLETED'||r.status==='COMPLETED_WITH_ERRORS');

export function QueriesPage({me}:{me:Me}){
  const data=useLoad(async()=>{const [{queries},{runs}]=await Promise.all([api<{queries:Query[]}>('/queries'),api<{runs:RunSummary[]}>('/runs')]);const last=latestFinished(runs);return{queries,run:last?(await api<{run:Run}>(`/runs/${last.id}`)).run:null}});
  const[draft,setDraft]=useState('');const[tag,setTag]=useState('');const[filter,setFilter]=useState('');const[busy,setBusy]=useState(false);const[error,setError]=useState<string|null>(null);
  const rows=useMemo(()=>{if(!data.data)return[];const sources=new Set(data.data.run?.results.map(r=>`${r.provider}:${r.method}`));
    return data.data.queries.map(q=>{const results=data.data!.run?.results.filter(r=>r.query===q.text)??[];const positions=results.flatMap(r=>r.citationPosition?[r.citationPosition]:[]);
      return{...q,checked:results.length>0,visible:results.filter(r=>r.customerCited||r.customerMentioned).length,sources:sources.size,best:positions.length?Math.min(...positions):null}})},[data.data]);
  if(data.error)return <div className="dash"><Problem error={data.error}/></div>;
  if(!data.data)return <div className="dash"><Loading/></div>;
  const shown=rows.filter(r=>`${r.text} ${r.tag??''}`.toLowerCase().includes(filter.trim().toLowerCase()));const tags=[...new Set(rows.map(r=>r.tag).filter(Boolean))] as string[];
  const add=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setError(null);try{await api('/queries',{method:'POST',body:{text:draft,tag}});setDraft('');await data.reload()}catch(err){setError(errorText(err))}finally{setBusy(false)}};
  const remove=async(id:string)=>{setError(null);try{await api(`/queries/${id}`,{method:'DELETE'});await data.reload()}catch(err){setError(errorText(err))}};
  return <div className="dash portal">
    <Head kicker="QUERIES" title="Queries" action={<span className="count">{rows.length} / {me.plan.maxQueries} tracked</span>}/>
    <form className="panel addquery" onSubmit={add}><label>Add a query<input value={draft} maxLength={200} placeholder="A question your customers ask, e.g. best CRM for small teams" onChange={e=>setDraft(e.target.value)}/></label><label>Topic <i>optional</i><input value={tag} list="query-tags" maxLength={40} placeholder="e.g. Comparison" onChange={e=>setTag(e.target.value)}/><datalist id="query-tags">{tags.map(t=><option key={t} value={t}/>)}</datalist></label><button disabled={busy||!draft.trim()}>Add query</button></form>
    <Problem error={error}/>
    <div className="panel table queries"><div className="panelhead"><h3>{data.data.run?`Latest run · ${formatDate(data.data.run.completedAt)}`:'Tracked queries'}</h3><input className="search" type="search" aria-label="Filter queries" placeholder="Filter queries" value={filter} onChange={e=>setFilter(e.target.value)}/></div>
      <div className="tr th"><span>QUERY</span><span>TOPIC</span><span>VISIBLE ON</span><span>BEST POSITION</span><span/></div>
      {shown.map(r=><div className="tr" key={r.id}><span>{r.text}</span><span>{r.tag?<i className="tag">{r.tag}</i>:<span className="muted">—</span>}</span><span className={!r.checked?'muted':r.visible?'good':'bad'}>{r.checked?`${r.visible} of ${r.sources} sources`:'Next run'}</span><span>{r.best??'—'}</span><span><button type="button" className="ghost small" aria-label={`Remove ${r.text}`} onClick={()=>void remove(r.id)}>Remove</button></span></div>)}
      {!shown.length&&<p className="muted empty">{rows.length?'No queries match that filter.':'Add your first query to start tracking.'}</p>}
      <p className="hint">New queries are checked on the next run. Removing a query keeps it in past reports.</p>
    </div>
  </div>
}

export function ReportsPage(){
  const runs=useLoad(()=>api<{runs:RunSummary[]}>('/runs'));const[busy,setBusy]=useState<string|null>(null);const[error,setError]=useState<string|null>(null);
  if(runs.error)return <div className="dash"><Problem error={runs.error}/></div>;
  if(!runs.data)return <div className="dash"><Loading/></div>;
  const list=runs.data.runs;
  const download=async(r:RunSummary,kind:'xlsx'|'csv')=>{setBusy(`${r.id}:${kind}`);setError(null);
    try{const [{run},{createWorkbook,createCsvZip}]=await Promise.all([api<{run:Run}>(`/runs/${r.id}`),import('../../../../packages/reporting/src/export')]);const bytes=kind==='xlsx'?createWorkbook(run):await createCsvZip(run);
      const blob=new Blob([bytes as BlobPart],{type:kind==='xlsx'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'application/zip'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`ai-visibility-${r.createdAt.slice(0,10)}.${kind==='xlsx'?'xlsx':'zip'}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
    catch(err){setError(errorText(err))}finally{setBusy(null)}};
  return <div className="dash portal">
    <Head kicker="HISTORY" title="Reports"/>
    <p className="lede">A report is saved after every run. Download it as an Excel workbook or a ZIP of CSV files, one per AI source.</p>
    <Problem error={error}/>
    <div className="panel table reports"><div className="tr th"><span>RUN</span><span>QUERIES</span><span>AI VISIBILITY</span><span>CITATION RATE</span><span>MENTION RATE</span><span>DOWNLOAD</span></div>
      {list.map((r,i)=>{const prev=list.slice(i+1).find(x=>x.status==='COMPLETED'||x.status==='COMPLETED_WITH_ERRORS');const ready=r.status==='COMPLETED'||r.status==='COMPLETED_WITH_ERRORS';const d=prev&&ready?Math.round((r.visibility-prev.visibility)*10)/10:null;
        return <div className="tr" key={r.id}><span><b>{formatDate(r.createdAt)}</b><small className="muted block">{r.startedBy==='schedule'?'Scheduled':'On demand'} · {ready?`${r.total-r.failed} of ${r.total} checks`:r.status==='FAILED'?'Failed':`In progress · ${r.done} of ${r.total}`}</small></span><span>{r.queries}</span><span>{ready?<>{pct(r.visibility)} {d!==null&&<small className={d>=0?'good':'loss-text'}>{d>=0?'↑':'↓'} {Math.abs(d)}</small>}</>:'—'}</span><span>{ready?pct(r.citationRate):'—'}</span><span>{ready?pct(r.mentionRate):'—'}</span><span className="downloads">{ready?(['xlsx','csv'] as const).map(k=><button key={k} className="ghost small" disabled={busy!==null} onClick={()=>void download(r,k)}>{busy===`${r.id}:${k}`?'Preparing…':k.toUpperCase()}</button>):<span className="muted">—</span>}</span></div>})}
      {!list.length&&<p className="muted empty">No runs yet. Run monitoring from the Overview page.</p>}
    </div>
  </div>
}

const statusLabel:Record<string,string>={active:'Active',trialing:'Trial',past_due:'Payment failed',canceled:'Canceled',unpaid:'Unpaid',incomplete:'Awaiting payment',incomplete_expired:'Expired'};
export function BillingPage({me,refresh}:{me:Me;refresh:()=>void}){
  const billing=useLoad(()=>api<Billing>('/billing'));const[busy,setBusy]=useState(false);const[error,setError]=useState<string|null>(null);
  const returning=location.hash.includes('checkout=success');
  // After Checkout, the subscription arrives by webhook a few seconds later: poll until it does.
  useEffect(()=>{if(!returning||me.entitled)return;let n=0;const t=setInterval(()=>{n++;void billing.reload();refresh();if(n>=10)clearInterval(t)},3000);return()=>clearInterval(t)},[returning,me.entitled]);// eslint-disable-line react-hooks/exhaustive-deps
  const go=async(path:'/billing/checkout'|'/billing/portal')=>{setBusy(true);setError(null);try{const {url}=await api<{url:string}>(path,{method:'POST'});location.href=url}catch(err){setError(errorText(err));setBusy(false)}};
  if(billing.error)return <div className="dash"><Problem error={billing.error}/></div>;
  if(!billing.data)return <div className="dash"><Loading/></div>;
  const b=billing.data;const sub=b.subscription;const owner=me.account.role==='owner'||me.account.role==='admin';
  return <div className="dash portal">
    <Head kicker="ACCOUNT" title="Billing"/>
    {returning&&!b.entitled&&<div className="formnotice" role="status">Payment received. Activating your plan… this takes a few seconds.</div>}
    <Problem error={error}/>
    <div className="twocol">
      <section className="panel plan"><div className="panelhead"><h3>{b.plan.name}</h3>{sub&&<span className={`status ${b.entitled?'ok':''}`}>{statusLabel[sub.status]??sub.status}</span>}</div>
        <b className="planprice">{money(b.plan.monthlyPrice)}<small>/ month, plus applicable tax</small></b>
        <ul><li>Up to {b.plan.maxQueries} monitored queries</li><li>{b.plan.allowedProviders.length} AI search sources, including ChatGPT and Perplexity</li><li>{b.plan.runsPerPeriod} runs per billing period, with reports and XLSX/CSV exports</li></ul>
        {!owner?<p className="hint">Only workspace owners can manage billing.</p>:b.entitled||(sub&&sub.status!=='canceled'&&sub.status!=='incomplete_expired')?<button disabled={busy} onClick={()=>void go('/billing/portal')}>{busy?'Opening…':'Manage payment & cancel'}</button>:<button disabled={busy} onClick={()=>void go('/billing/checkout')}>{busy?'Opening checkout…':'Subscribe'} <b>→</b></button>}
        <p className="hint">No contract. Cancel anytime from the billing portal and you won’t be charged again. Payments are handled securely by Stripe.</p>
      </section>
      <section className="panel"><div className="panelhead"><h3>This billing period</h3><span>{sub?.periodEnd?(sub.cancelAtPeriodEnd?`Ends ${formatDate(sub.periodEnd)}`:`Renews ${formatDate(sub.periodEnd)}`):'No active plan'}</span></div>
        <div className="meter" role="meter" aria-label="Runs used" aria-valuemin={0} aria-valuemax={b.plan.runsPerPeriod} aria-valuenow={b.usage.runs}><i style={{width:`${Math.min(100,b.usage.runs/b.plan.runsPerPeriod*100)}%`}}/></div>
        <dl className="kv"><div><dt>Runs used</dt><dd>{b.usage.runs} / {b.plan.runsPerPeriod}</dd></div><div><dt>Answer checks</dt><dd>{b.usage.checks.toLocaleString()}</dd></div><div><dt>Add-on checks</dt><dd>{b.usage.addonChecks.toLocaleString()}</dd></div></dl>
        {sub?.cancelAtPeriodEnd&&<p className="hint">Your plan is set to cancel. You can resume it from the billing portal before {formatDate(sub.periodEnd)}.</p>}
      </section>
    </div>
    <div className="panel table invoices"><div className="panelhead"><h3>Invoices</h3></div><div className="tr th"><span>DATE</span><span>AMOUNT</span><span>STATUS</span><span/></div>
      {b.invoices.map(i=><div className="tr" key={i.id}><span>{formatDate(i.date)}</span><span>{money(i.amount,i.currency)}</span><span className={i.status==='paid'?'good':''}>{i.status[0].toUpperCase()+i.status.slice(1)}</span><span>{i.url&&<a href={i.url} target="_blank" rel="noreferrer">View →</a>}</span></div>)}
      {!b.invoices.length&&<p className="muted empty">No invoices yet.</p>}
    </div>
  </div>
}

export function SettingsPage({me,refresh}:{me:Me;refresh:()=>void}){
  const[name,setName]=useState(me.user.name??'');const[workspace,setWorkspace]=useState(me.account.name);const[notifyRun,setNotifyRun]=useState(me.account.notifyRun);const[notifyDrop,setNotifyDrop]=useState(me.account.notifyDrop);
  const[status,setStatus]=useState<'idle'|'saving'|'saved'>('idle');const[error,setError]=useState<string|null>(null);const owner=me.account.role==='owner'||me.account.role==='admin';
  const save=async(e:React.FormEvent)=>{e.preventDefault();setStatus('saving');setError(null);
    try{if(name.trim()&&name.trim()!==me.user.name){const {error:err}=await auth.updateUser({name:name.trim()});if(err)throw new Error(err.message)}
      if(owner)await api('/account',{method:'PATCH',body:{name:workspace,notifyRun,notifyDrop}});setStatus('saved');refresh()}
    catch(err){setError(errorText(err));setStatus('idle')}};
  const touch=()=>setStatus('idle');
  return <form className="dash portal sources" onSubmit={save}>
    <Head kicker="ACCOUNT" title="Settings" action={<button disabled={status==='saving'}>{status==='saved'?'Saved ✓':status==='saving'?'Saving…':'Save settings'}</button>}/>
    <Problem error={error}/>
    <section className="panel"><div className="panelhead"><h3>Profile</h3></div><div className="fields">
      <label>Name<input value={name} maxLength={80} autoComplete="name" onChange={e=>{setName(e.target.value);touch()}}/></label>
      <label>Email<input value={me.user.email} disabled/></label>
    </div><p className="hint">To change your password, sign out and use “Forgot password?”.</p></section>
    <section className="panel"><div className="panelhead"><h3>Workspace</h3></div><div className="fields">
      <label>Workspace name<input value={workspace} maxLength={80} disabled={!owner} onChange={e=>{setWorkspace(e.target.value);touch()}}/></label>
    </div></section>
    <section className="panel"><div className="panelhead"><h3>Email notifications</h3><span>Sent to workspace owners</span></div>
      <label className="check toggle"><input type="checkbox" checked={notifyRun} disabled={!owner} onChange={e=>{setNotifyRun(e.target.checked);touch()}}/>When a run finishes</label>
      <label className="check toggle"><input type="checkbox" checked={notifyDrop} disabled={!owner} onChange={e=>{setNotifyDrop(e.target.checked);touch()}}/>When AI visibility drops more than 5 points</label>
    </section>
  </form>
}
