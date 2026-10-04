import { useState } from 'react';
import { api,ApiError } from '../api';
import type { Operations,Range,Vercel } from '../api';
import { Status,StatTile } from '../charts';
import type { Tone } from '../charts';
import { date,ms,num,pct } from '../format';
import { useLoad } from '../hooks';
import { Notice,Panel } from '../ui';

const errorTone=(rate:number|null):Tone=>rate===null?'neutral':rate>0.1?'critical':rate>0.02?'warning':'good';
const deployTone=(state:string):Tone=>state==='READY'?'good':state==='ERROR'?'critical':state==='CANCELED'?'neutral':'warning';
/** Control-panel view of service health: provider error rates and latency, the job queue, runs, Stripe webhooks, and Vercel deployments. */
export function Performance({range,onUnauthorized}:{range:Range;onUnauthorized:()=>void}){const ops=useLoad(()=>api<Operations>(`/operations?range=${range}`),range,onUnauthorized);const vercel=useLoad(()=>api<Vercel>(`/vercel?range=${range}`),range,onUnauthorized);const[retrying,setRetrying]=useState<string|null>(null);const[message,setMessage]=useState<{tone:Tone;text:string}|null>(null);
  const retry=async(id:string)=>{setRetrying(id);try{await api(`/jobs/${encodeURIComponent(id)}/retry`,{method:'POST',body:{}});setMessage({tone:'good',text:'Job re-queued.'});ops.reload()}catch(e){setMessage({tone:'critical',text:e instanceof ApiError?e.message:'Retry failed.'})}finally{setRetrying(null)}};
  const o=ops.data;const runs=o?Object.values(o.runs).reduce((a,b)=>a+b,0):0;const checks=o?o.sources.reduce((a,s)=>a+s.calls,0):0;const failures=o?o.sources.reduce((a,s)=>a+s.failures,0):0;
  return <>
    {message&&<Notice tone={message.tone}>{message.text}</Notice>}
    {ops.error&&<Notice tone="critical">{ops.error}</Notice>}
    {o&&<>
      <div className="tiles">
        <StatTile label="Runs" value={num(runs)} sub={`${num(o.runs.COMPLETED_WITH_ERRORS??0)} partial · ${num(o.runs.FAILED??0)} failed`} status={(o.runs.FAILED??0)>0?'warning':undefined}/>
        <StatTile label="Check error rate" value={pct(checks?failures/checks:null)} status={errorTone(checks?failures/checks:null)} sub={`${num(failures)} of ${num(checks)} checks`}/>
        <StatTile label="Job queue" value={num((o.jobs.PENDING??0)+(o.jobs.RETRY??0)+(o.jobs.RUNNING??0))} sub={`${num(o.jobs.FAILED??0)} failed`} status={(o.jobs.FAILED??0)>0?'serious':'good'}/>
        <StatTile label="Stripe webhooks" value={num(Object.values(o.webhooks).reduce((a,b)=>a+b,0))} sub={`${num(o.webhooks.FAILED??0)} failed`} status={(o.webhooks.FAILED??0)>0?'critical':'good'}/>
      </div>
      <Panel title="Provider health">{o.sources.length?<div className="scroll"><table><thead><tr><th>Source</th><th className="num">Checks</th><th>Error rate</th><th className="num">p50</th><th className="num">p95</th><th>Top errors</th></tr></thead><tbody>{o.sources.map(s=><tr key={s.key}><td>{s.label}</td><td className="num">{num(s.calls)}</td><td><Status tone={errorTone(s.errorRate)}>{pct(s.errorRate)}</Status></td><td className="num">{ms(s.p50Ms)}</td><td className="num">{ms(s.p95Ms)}</td><td className="small">{s.errors.slice(0,3).map(e=>`${e.code} ×${e.count}`).join(', ')||'—'}</td></tr>)}</tbody></table></div>:<p className="muted">No checks ran in this period.</p>}</Panel>
      <Panel title="Failed jobs">{o.failedJobs.length?<div className="scroll"><table><thead><tr><th>Job</th><th>Account</th><th>Error</th><th className="num">Attempts</th><th>Last attempt</th><th>Request ID</th><th/></tr></thead><tbody>{o.failedJobs.map(j=><tr key={j.id}><td>{j.jobType}</td><td className="mono">{j.accountId}</td><td>{j.errorCode??'—'}</td><td className="num">{j.attempts}</td><td>{date(j.updatedAt)}</td><td className="mono small">{j.requestId}</td><td><button className="small-btn" disabled={retrying===j.id} onClick={()=>retry(j.id)}>{retrying===j.id?'Retrying…':'Retry'}</button></td></tr>)}</tbody></table></div>:<p className="muted">No failed jobs.</p>}</Panel>
    </>}
    <Panel title="Vercel deployments">
      {vercel.error&&<Notice tone="warning">{vercel.error}</Notice>}
      {vercel.data?.projects.map(p=><div key={p.projectId} className="vercel-project">
        <div className="tiles">
          <StatTile label={p.name} value={<Status tone={p.lastProduction?'good':'warning'}>{p.lastProduction?'Production ready':'No ready production deploy'}</Status>} sub={p.lastProduction?`${date(p.lastProduction.createdAt)}${p.lastProduction.commit?` · ${p.lastProduction.commit}`:''}`:'in this period'}/>
          <StatTile label="Deploy success" value={pct(p.successRate)} status={p.successRate===null?undefined:p.successRate<0.9?'warning':'good'} sub={`${num(p.failed)} failed of ${num(p.total)}`}/>
          <StatTile label="Build time p50" value={ms(p.buildP50Ms)} sub={`p95 ${ms(p.buildP95Ms)}`}/>
        </div>
        <div className="scroll"><table><thead><tr><th>State</th><th>Target</th><th>Branch</th><th>Commit</th><th>Created</th><th className="num">Build</th></tr></thead><tbody>{p.deployments.slice(0,8).map(d=><tr key={d.id}><td><Status tone={deployTone(d.state)}>{d.state.toLowerCase()}</Status></td><td>{d.target??'preview'}</td><td className="mono small">{d.branch??'—'}</td><td className="small" title={d.message}>{d.commit?<><span className="mono">{d.commit}</span> {d.message}</>:'—'}</td><td>{date(d.createdAt)}</td><td className="num">{ms(d.buildMs)}</td></tr>)}</tbody></table></div>
        <a className="link" href={p.dashboardUrl} target="_blank" rel="noreferrer">Requests, errors and latency in Vercel Observability ↗</a>
      </div>)}
      <p className="muted small">Deployments come from the Vercel REST API. Vercel has no documented API for querying request metrics, so traffic, error and latency charts link out to Vercel Observability. A log drain into this API would bring them in here.</p>
    </Panel>
  </>}
