import {useEffect,useMemo,useState} from 'react';
import {calculateMetrics} from '../../../../packages/core/src/analytics';
import type {RunResult} from '../../../../packages/core/src/types';
import {Logo,RANKINGS_HASH} from '../brand';
import {MobileBar,useDrawer} from '../MobileBar';
import {api,auth,errorText,selectAccount} from '../session';
import type {Me,Project,Run,RunSummary} from '../session';
import {BillingPage,QueriesPage,ReportsPage,SettingsPage} from './Pages';
import {ThankYouPage,WelcomePage} from './Welcome';
import {ProjectPage} from './Setup';
import {Head,Loading,Problem,colors,formatDate,navigate,placeLabel,sourceLabel,useLoad} from './ui';

export const pages=[['overview','▦ Overview'],['project','◎ Project & sources'],['queries','⌕ Queries'],['reports','▤ Reports'],['billing','◇ Billing'],['settings','⚙ Settings']] as const;
/** Confirmation pages reached by URL only (after sign-up and after Checkout); they are not in the sidebar. */
export type Page=typeof pages[number][0]|'welcome'|'thank-you';
const titles:Record<string,string>={welcome:'Welcome','thank-you':'Thank you'};
const initials=(s:string)=>s.split(/[\s@.]+/).filter(Boolean).map(w=>w[0]).join('').slice(0,2).toUpperCase();

/** The signed-in customer portal. Loads the user's workspace (/me) and routes between pages by URL hash (#/overview, …). */
export default function Portal({page}:{page:Page}){
  const me=useLoad(()=>api<Me>('/me'));
  const menu=useDrawer(page);
  if(me.error)return <div className="authpage"><Problem error={me.error}/><button onClick={()=>void me.reload()}>Try again</button></div>;
  if(!me.data)return <div className="authpage"><Loading/></div>;
  const m=me.data;
  const signOut=async()=>{await auth.signOut();selectAccount('');navigate('')};
  return <div className="app">
    <MobileBar {...menu} title={pages.find(([id])=>id===page)?.[1].slice(2)??titles[page]??''}/>
    <aside id="portal-nav" className={menu.open?'open':''} onClick={e=>{if((e.target as HTMLElement).closest('a'))menu.setOpen(false)}}><Logo/>
      {m.accounts.length>1?<label className="workspace switcher"><span>WORKSPACE</span><select value={m.account.id} onChange={e=>{selectAccount(e.target.value);void me.reload()}}>{m.accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>:<div className="workspace">{m.account.name.toUpperCase()}</div>}
      {pages.map(([id,label])=><a key={id} href={`#/${id}`} className={page===id?'active':'navlink'}>{label}</a>)}
      <a className="sidelink" href={RANKINGS_HASH}>ⓘ How rankings work</a>
      <div className="user">{initials(m.user.name??m.user.email)} <span>{m.user.name??m.user.email}<small>{m.user.email}</small></span></div>
      <button className="ghost small signout" onClick={()=>void signOut()}>Sign out</button>
    </aside>
    <div className="portal-main">
      {m.paused?<div className="betastrip" role="note"><span>Monitoring is paused for this workspace. Contact support to resume.</span></div>
        :!m.entitled&&page!=='billing'&&page!=='welcome'&&page!=='thank-you'?<div className="betastrip" role="note"><span className="beta-pill">Beta</span><span>{m.subscription?.status==='past_due'?'Your last payment failed. Update your payment method to keep monitoring.':'Choose a plan to start monitoring.'}</span><a href="#/billing">{m.subscription?.status==='past_due'?'Update payment →':'See plan →'}</a></div>:null}
      {page==='welcome'?<WelcomePage me={m}/>:page==='thank-you'?<ThankYouPage me={m} refresh={me.reload}/>:page==='project'?<ProjectPage me={m}/>:page==='queries'?<QueriesPage me={m}/>:page==='reports'?<ReportsPage/>:page==='billing'?<BillingPage me={m} refresh={me.reload}/>:page==='settings'?<SettingsPage me={m} refresh={me.reload}/>:<Overview me={m}/>}
    </div>
  </div>
}

const finished=(r:RunSummary)=>r.status==='COMPLETED'||r.status==='COMPLETED_WITH_ERRORS';
const visibleQueries=(results:RunResult[])=>new Set(results.filter(r=>r.customerCited||r.customerMentioned).map(r=>r.query));

function Overview({me}:{me:Me}){
  const project=useLoad(()=>api<{project:Project|null}>('/project'));
  const runs=useLoad(()=>api<{runs:RunSummary[]}>('/runs'));
  const done=(runs.data?.runs??[]).filter(finished);const active=(runs.data?.runs??[]).find(r=>r.status==='QUEUED'||r.status==='RUNNING');
  const details=useLoad(async()=>Promise.all(done.slice(0,2).map(r=>api<{run:Run}>(`/runs/${r.id}`).then(d=>d.run))),done[0]?.id);
  const[starting,setStarting]=useState(false);const[error,setError]=useState<string|null>(null);
  // While a run is in progress, keep it moving (each call processes a batch of checks) and refresh progress.
  useEffect(()=>{if(!active)return;let stop=false;const tick=async()=>{while(!stop){try{const {progress}=await api<{progress:{remaining:number}}>('/runs/advance',{method:'POST'});await runs.reload();if(!progress.remaining)break}catch{await new Promise(r=>setTimeout(r,5000))}await new Promise(r=>setTimeout(r,1500))}};void tick();return()=>{stop=true}},[active?.id]);// eslint-disable-line react-hooks/exhaustive-deps
  const start=async()=>{setStarting(true);setError(null);try{await api('/runs',{method:'POST',body:{idempotencyKey:crypto.randomUUID()}});await runs.reload()}catch(e){setError(errorText(e))}finally{setStarting(false)}};
  const data=useMemo(()=>{const [latest,previous]=details.data??[];if(!latest)return null;const m=calculateMetrics(latest.results);const p=previous?calculateMetrics(previous.results):null;
    const sources=[...new Map(latest.results.map(r=>[`${r.provider}:${r.method}`,r])).values()];
    const now=visibleQueries(latest.results);const before=previous?visibleQueries(previous.results):null;const queries=[...new Set(latest.results.map(r=>r.query))];
    return{latest,m,p,sources,movement:before?{gained:queries.filter(q=>now.has(q)&&!before.has(q)).length,lost:queries.filter(q=>!now.has(q)&&before.has(q)).length}:null,
      competitors:m.competitors.filter(([d])=>d!==project.data?.project?.primaryDomain).slice(0,5),rows:latest.results.filter(r=>r.status==='SUCCESS').slice(0,8)}},[details.data,project.data]);
  if(project.error||runs.error)return <div className="dash"><Problem error={project.error??runs.error}/></div>;
  if(!project.data||!runs.data)return <div className="dash"><Loading/></div>;
  const p=project.data.project;
  if(!p)return <div className="dash"><Head kicker="WELCOME" title="Set up your project"/><div className="panel empty-state"><h3>Tell us which website to monitor</h3><p className="muted">Add your domain, choose the AI sources and location, then add the questions your customers ask.</p><a className="button" href="#/project">Set up project →</a></div></div>;
  const delta=(n:number,b?:number)=>b===undefined?'First run':`${n>=b?'↑':'↓'} ${Math.abs(Math.round((n-b)*10)/10)} pts`;
  return <div className="dash">
    <Head kicker="PROJECT OVERVIEW" title={p.primaryDomain} action={<button onClick={()=>void start()} disabled={starting||Boolean(active)||!me.entitled||me.paused} title={!me.entitled?'Choose a plan to run monitoring':undefined}>{active?'Running…':starting?'Starting…':'Run monitoring'} <b>→</b></button>}/>
    <Problem error={error}/>
    {active?<div className="notice"><b>●</b><span><strong>Run in progress · {active.done} of {active.total} checks</strong><small>{active.queries} queries · {placeLabel(p.location)} · started {formatDate(active.createdAt)}. You can leave this page; the run continues and we’ll email you when it’s done.</small></span><div className="meter small" role="meter" aria-valuemin={0} aria-valuemax={active.total} aria-valuenow={active.done}><i style={{width:`${active.total?active.done/active.total*100:0}%`}}/></div></div>
      :data?<div className="notice"><b>●</b><span><strong>Latest run complete</strong><small>{new Set(data.latest.results.map(r=>r.query)).size} queries across {data.sources.length} sources · {placeLabel(p.location)} · {formatDate(data.latest.completedAt)}</small></span><a href="#/reports">View report →</a></div>
      :<div className="notice"><b>●</b><span><strong>No runs yet</strong><small>{me.entitled?'Add queries, then run monitoring to see where your brand appears.':'Choose a plan, add queries, then run monitoring.'}</small></span><a href={me.entitled?'#/queries':'#/billing'}>{me.entitled?'Add queries →':'See plan →'}</a></div>}
    {data&&<>
      <div className="metricgrid"><Metric label="AI Visibility" n={data.m.visibility} delta={delta(data.m.visibility,data.p?.visibility)}/><Metric label="Citation Rate" n={data.m.citationRate} delta={delta(data.m.citationRate,data.p?.citationRate)}/><Metric label="Mention Rate" n={data.m.mentionRate} delta={delta(data.m.mentionRate,data.p?.mentionRate)}/></div>
      <div className="panel coverage"><div className="panelhead"><h3>Coverage by source</h3><span>Latest run</span></div>{data.sources.map(s=>{const n=data.m.sourceCoverage[`${s.provider}:${s.method}`]??0;return <div className="bar" key={`${s.provider}:${s.method}`}><label>{sourceLabel(s.provider,s.method)}</label><i><b style={{width:`${n}%`,background:colors[s.provider]}}/></i><strong>{Math.round(n)}%</strong></div>})}</div>
      <div className="twocol">
        <div className="panel"><div className="panelhead"><h3>Visibility movement</h3><span>vs previous run</span></div>{data.movement?<div className="movement"><div className="gain">↗<b>{data.movement.gained}</b><span>Queries gained</span></div><div className="loss">↘<b>{data.movement.lost}</b><span>Queries lost</span></div></div>:<p className="muted">Movement appears after the second run.</p>}</div>
        <div className="panel"><div className="panelhead"><h3>Top cited domains</h3><span>Competitors and sources</span></div>{data.competitors.length?data.competitors.map(([d,n],i)=><div className="competitor" key={d}><i>{i+1}</i><span>{d}</span><b>{n} citations</b></div>):<p className="muted">No other domains were cited.</p>}</div>
      </div>
      <div className="panel table"><div className="panelhead"><h3>Query-level results</h3><a href="#/queries">View all queries →</a></div><div className="tr th"><span>QUERY</span><span>SOURCE</span><span>CITATION</span><span>MENTION</span><span>POSITION</span></div>
        {data.rows.map(r=><div className="tr" key={`${r.query}:${r.provider}:${r.method}`}><span>{r.query}</span><span><i className="dot" style={{background:colors[r.provider]}}/>{sourceLabel(r.provider,r.method)}</span><span className={r.customerCited?'good':'bad'}>{r.customerCited?'Cited':'Not cited'}</span><span className={r.customerMentioned?'good':'bad'}>{r.customerMentioned?'Mentioned':'Not mentioned'}</span><span>{r.citationPosition??'—'}</span></div>)}
      </div>
    </>}
  </div>
}
function Metric({label,n,delta}:{label:string;n:number;delta:string}){return <div className="metric"><span>{label}</span><b>{Math.round(n)}%</b><small>{delta}{delta!=='First run'&&<i> since previous run</i>}</small></div>}
