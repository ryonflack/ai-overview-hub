import {useMemo,useState} from 'react';
import {Logo,RANKINGS_HASH} from './brand';
import {MobileBar,useDrawer} from './MobileBar';
import {demoAccounts,demoResult,formatDate,metricsFor,placeLabel,runsFor,sourceLabel,sourcesFor,visibleOn} from './demo';
import type {DemoAccount} from './demo';
import {Billing,Projects,Queries,Reports,Settings} from './Portal';
import {SourcesSettings} from './Sources';
import type {ProviderId} from '../../../packages/core/src/types';

const pages=[['overview','▦ Overview'],['projects','□ Projects'],['sources','◎ AI sources'],['queries','⌕ Queries'],['reports','▤ Reports'],['billing','◇ Billing'],['settings','⚙ Settings']] as const;
export type Page=typeof pages[number][0];
const colors:Record<ProviderId,string>={'google-ai-overview':'#569DDF','google-ai-mode':'#a969e8',chatgpt:'#10a37f',perplexity:'#20808d','bing-copilot':'#34a3c6','duckduckgo-search-assist':'#ec7963','naver-ai-overview':'#38b887'};
const ACCOUNT_KEY='aoh.demo.account';
const initials=(name:string)=>name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
const loadAccount=()=>{try{return demoAccounts.find(a=>a.id===localStorage.getItem(ACCOUNT_KEY))??demoAccounts[0]}catch{return demoAccounts[0]}};

export function Dashboard({compact=false}:{compact?:boolean}){
  const[page,setPage]=useState<Page>('overview');const[account,setAccount]=useState<DemoAccount>(()=>compact?demoAccounts[0]:loadAccount());
  const menu=useDrawer(`${page}:${account.id}`);
  const go=(id:Page)=>{setPage(id);if(!compact)scrollTo(0,0)};
  const switchTo=(id:string)=>{const next=demoAccounts.find(a=>a.id===id);if(!next)return;setAccount(next);setPage('overview');try{localStorage.setItem(ACCOUNT_KEY,id)}catch{/* storage unavailable */}};
  return <div className={`app ${compact?'compact':''}`}>
    {!compact&&<MobileBar {...menu} title={pages.find(([id])=>id===page)?.[1].slice(2)??''}/>}
    <aside id={compact?undefined:'portal-nav'} className={menu.open?'open':''}><Logo/>
      {compact?<div className="workspace">{account.name.toUpperCase()} <b>⌄</b></div>:<label className="workspace switcher"><span>DEMO ACCOUNT</span><select value={account.id} onChange={e=>switchTo(e.target.value)} aria-label="Switch demo account">{demoAccounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}
      {pages.map(([id,label])=>{const live=!compact;return <div className={page===id?'active':live?'navlink':''} key={id} role={live?'button':undefined} tabIndex={live?0:undefined} onClick={live?()=>go(id):undefined} onKeyDown={live?e=>{if(e.key==='Enter'||e.key===' ')go(id)}:undefined}>{label}</div>})}
      {!compact&&<a className="sidelink" href={RANKINGS_HASH}>ⓘ How rankings work</a>}
      <div className="user">{initials(account.owner.name)} <span>{account.owner.name}<small>{account.owner.email}</small></span></div>
    </aside>
    <div className="portal-main">
      {!compact&&<div className="betastrip" role="note"><span className="beta-pill">Beta</span><span>You’re viewing <b>{account.name}</b>, a demo account with example data.</span><a href={RANKINGS_HASH}>How rankings work</a></div>}
      {page==='sources'?<SourcesSettings key={account.id} account={account}/>:page==='projects'?<Projects key={account.id} account={account} open={go}/>:page==='queries'?<Queries key={account.id} account={account}/>:page==='reports'?<Reports key={account.id} account={account}/>:page==='billing'?<Billing key={account.id} account={account}/>:page==='settings'?<Settings key={account.id} account={account}/>:<Overview account={account} compact={compact} go={go}/>}
    </div>
  </div>
}

function Overview({account,compact,go}:{account:DemoAccount;compact:boolean;go:(p:Page)=>void}){
  const data=useMemo(()=>{
    const runs=runsFor(account);const latest=metricsFor(account,0);const previous=runs.length>1?metricsFor(account,1):null;const sources=sourcesFor(account);
    const rows=account.queries.map(q=>({q,now:sources.map(s=>demoResult(account,q.text,s,0)),before:previous?sources.map(s=>demoResult(account,q.text,s,1)):null}));
    const movement=rows.reduce((m,r)=>{if(!r.before)return m;const a=visibleOn(r.now)>0,b=visibleOn(r.before)>0;return{gained:m.gained+(a&&!b?1:0),lost:m.lost+(!a&&b?1:0)}},{gained:0,lost:0});
    const sample=rows.slice(0,6).map((r,i)=>{const res=r.now[i%r.now.length];return{query:r.q.text,source:sourceLabel([res.provider,res.method]),provider:res.provider,cited:res.customerCited,mentioned:res.customerMentioned,position:res.citationPosition}});
    return{runs,latest,previous,sources,movement,sample,competitors:latest.competitors.filter(([d])=>d!==account.domain).slice(0,3)};
  },[account]);
  const delta=(now:number,before?:number)=>before===undefined?'First run':`${now>=before?'↑':'↓'} ${Math.abs(Math.round((now-before)*10)/10)} pts`;
  const{latest,previous}=data;
  return <div className="dash">
    <div className="dash-head"><div><small>PROJECT OVERVIEW</small><h2>{account.domain}</h2></div><button>Run monitoring <b>→</b></button></div>
    <div className="notice"><b>●</b><span><strong>Latest run complete</strong><small>{account.queries.length} queries checked across {data.sources.length} sources · {placeLabel(account.location)} · {formatDate(data.runs[0].date)}</small></span><a onClick={compact?undefined:()=>go('reports')}>View report →</a></div>
    <div className="metricgrid"><Metric label="AI Visibility" n={latest.visibility} delta={delta(latest.visibility,previous?.visibility)}/><Metric label="Citation Rate" n={latest.citationRate} delta={delta(latest.citationRate,previous?.citationRate)}/><Metric label="Mention Rate" n={latest.mentionRate} delta={delta(latest.mentionRate,previous?.mentionRate)}/></div>
    <div className="panel coverage"><div className="panelhead"><h3>Provider coverage</h3><span>Latest run</span></div>{data.sources.map(s=>{const n=latest.sourceCoverage[`${s[0]}:${s[1]}`]??0;return <div className="bar" key={s.join(':')}><label>{sourceLabel(s)}</label><i><b style={{width:`${n}%`,background:colors[s[0]]}}/></i><strong>{Math.round(n)}%</strong></div>})}</div>
    <div className="twocol">
      <div className="panel"><div className="panelhead"><h3>Visibility movement</h3><span>vs previous run</span></div>{previous?<div className="movement"><div className="gain">↗<b>{data.movement.gained}</b><span>Queries gained</span></div><div className="loss">↘<b>{data.movement.lost}</b><span>Queries lost</span></div></div>:<p className="muted">Movement appears after the second run.</p>}</div>
      <div className="panel"><div className="panelhead"><h3>Top competitors</h3><span>Most cited</span></div>{data.competitors.map(([d,n],i)=><div className="competitor" key={d}><i>{i+1}</i><span>{d}</span><b>{n} citations</b></div>)}</div>
    </div>
    <div className="panel table"><div className="panelhead"><h3>Query-level results</h3><a onClick={compact?undefined:()=>go('queries')}>View all queries →</a></div><div className="tr th"><span>QUERY</span><span>SOURCE</span><span>CITATION</span><span>MENTION</span><span>POSITION</span></div>
      {data.sample.map(r=><div className="tr" key={r.query}><span>{r.query}</span><span><i className="dot" style={{background:colors[r.provider]}}/>{r.source}</span><span className={r.cited?'good':'bad'}>{r.cited?'Cited':'Not cited'}</span><span className={r.mentioned?'good':'bad'}>{r.mentioned?'Mentioned':'Not mentioned'}</span><span>{r.position??'—'}</span></div>)}
    </div>
  </div>
}
function Metric({label,n,delta}:{label:string;n:number;delta:string}){return <div className="metric"><span>{label} ⓘ</span><b>{Math.round(n)}%</b><small>{delta}{delta!=='First run'&&<i> since previous run</i>}</small></div>}
