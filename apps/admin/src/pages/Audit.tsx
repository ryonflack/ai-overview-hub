import { api } from '../api';
import type { AuditEvent } from '../api';
import { date } from '../format';
import { useLoad } from '../hooks';
import { Notice,Panel } from '../ui';

const labels:Record<string,string>={'admin.login':'Signed in','admin.logout':'Signed out','admin.routing.updated':'Changed source routing','admin.rates.updated':'Changed vendor rates','admin.account.controls_updated':'Changed account controls','admin.job.retried':'Retried a failed job'};
export function Audit({onUnauthorized,go}:{onUnauthorized:()=>void;go:(path:string)=>void}){const {data,error}=useLoad(()=>api<{events:AuditEvent[]}>('/audit?limit=200'),'audit',onUnauthorized);
  return <Panel title="Operator audit log">
    {error&&<Notice tone="critical">{error}</Notice>}
    {data&&(data.events.length?<div className="scroll"><table><thead><tr><th>When</th><th>Operator</th><th>Action</th><th>Account</th><th>Details</th></tr></thead><tbody>{data.events.map(e=>{const {operator,...rest}=e.metadata??{};return <tr key={e.id}><td className="small">{date(e.createdAt)}</td><td>{String(operator??'—')}</td><td>{labels[e.type]??e.type}</td><td>{e.accountId?<button className="link mono" onClick={()=>go(`/accounts/${encodeURIComponent(e.accountId!)}`)}>{e.accountId}</button>:'—'}</td><td>{Object.keys(rest).length?<details><summary>View</summary><pre>{JSON.stringify(rest,null,2)}</pre></details>:'—'}</td></tr>})}</tbody></table></div>:<p className="muted">No operator activity yet.</p>)}
  </Panel>}
