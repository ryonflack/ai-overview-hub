import React,{ useCallback,useEffect,useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { api,ApiError,DEMO } from './api';
import type { Range } from './api';
import { Notice } from './ui';
import { AccountPage,Accounts } from './pages/Accounts';
import { Audit } from './pages/Audit';
import { Costs } from './pages/Costs';
import { DataSources } from './pages/DataSources';
import { Overview } from './pages/Overview';
import { Performance } from './pages/Performance';
import { Revenue } from './pages/Revenue';

const pages=[['/','Overview'],['/costs','Costs'],['/revenue','Revenue'],['/performance','Performance'],['/sources','Data sources'],['/accounts','Accounts'],['/audit','Audit log']] as const;
const ranges:[Range,string][]=[['7d','7 days'],['30d','30 days'],['90d','90 days'],['12m','12 months']];
type Operator = { email:string; name:string|null };

function usePath(){const[path,setPath]=useState(location.pathname);useEffect(()=>{const pop=()=>setPath(location.pathname);addEventListener('popstate',pop);return()=>removeEventListener('popstate',pop)},[]);const go=useCallback((to:string)=>{history.pushState(null,'',to);setPath(to);scrollTo(0,0)},[]);return[path,go] as const}

function SignIn({onSignedIn}:{onSignedIn:(o:Operator)=>void}){const token=new URLSearchParams(location.hash.slice(1)).get('token');const[email,setEmail]=useState('');const[code,setCode]=useState('');const[sent,setSent]=useState(false);const[busy,setBusy]=useState(false);const[error,setError]=useState<string|null>(null);
  const start=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setError(null);try{await api('/auth/start',{method:'POST',body:{email}});setSent(true)}catch(err){setError(err instanceof ApiError?err.message:'Could not send the sign-in link.')}finally{setBusy(false)}};
  const verify=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setError(null);try{const res=await api<{operator:Operator}>('/auth/verify',{method:'POST',body:{token,code}});history.replaceState(null,'','/');onSignedIn(res.operator)}catch(err){setError(err instanceof ApiError?err.message:'Sign-in failed.')}finally{setBusy(false)}};
  return <div className="signin"><form onSubmit={token?verify:start}><div className="logo"><span>AI</span> Overview Hub <em>Admin</em></div>
    {token?<><h1>Enter your authenticator code</h1><p className="muted">Open your authenticator app and enter the 6-digit code for AI Overview Hub Admin.</p><input autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} placeholder="123456" aria-label="Authenticator code" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))}/><button disabled={busy||code.length!==6}>{busy?'Checking…':'Sign in'}</button></>
    :sent?<><h1>Check your email</h1><p className="muted">If {email} belongs to an operator, a sign-in link is on its way. It expires in 15 minutes.</p><button type="button" className="ghost" onClick={()=>setSent(false)}>Use a different email</button></>
    :<><h1>Operator sign-in</h1><p className="muted">We'll email you a one-time link, then ask for your authenticator code.</p><input autoFocus type="email" autoComplete="email" placeholder="you@aioverviewhub.com" aria-label="Email" required value={email} onChange={e=>setEmail(e.target.value)}/><button disabled={busy}>{busy?'Sending…':'Email me a sign-in link'}</button></>}
    {error&&<Notice tone="critical">{error}</Notice>}
  </form></div>}

function App(){const[path,go]=usePath();const[operator,setOperator]=useState<Operator|null|undefined>(()=>location.hash.includes('token=')?null:undefined);const[range,setRange]=useState<Range>(()=>{try{return (localStorage.getItem('admin.range') as Range)||'30d'}catch{return'30d'}});const[menu,setMenu]=useState(false);
  useEffect(()=>{if(location.hash.includes('token='))return;api<{operator:Operator}>('/auth/session').then(r=>setOperator(r.operator)).catch(()=>setOperator(null))},[]);
  const onUnauthorized=useCallback(()=>setOperator(null),[]);
  const pickRange=(r:Range)=>{setRange(r);try{localStorage.setItem('admin.range',r)}catch{/* storage unavailable */}};
  const signOut=async()=>{try{await api('/auth/logout',{method:'POST',body:{}})}finally{setOperator(null);go('/')}};
  if(operator===undefined)return <p className="muted center">Loading…</p>;
  if(!operator)return <SignIn onSignedIn={o=>{setOperator(o);go('/')}}/>;
  const account=/^\/accounts\/(.+)$/.exec(path);const current=account?'/accounts':pages.find(([p])=>p===path)?.[0]??'/';const title=account?'Account':pages.find(([p])=>p===current)![1];const ranged=!['/sources','/audit'].includes(current);const nav=(to:string)=>{setMenu(false);go(to)};
  return <div className="shell">
    <aside className={menu?'open':''}><div className="logo"><span>AI</span> Overview Hub <em>Admin</em></div><nav>{pages.map(([p,label])=><a key={p} href={p} aria-current={current===p?'page':undefined} onClick={e=>{e.preventDefault();nav(p)}}>{label}</a>)}</nav><div className="who"><small className="muted">{operator.email}</small><button className="ghost" onClick={signOut}>Sign out</button></div></aside>
    <main>
      <header className="bar"><button className="ghost menu" aria-label="Menu" aria-expanded={menu} onClick={()=>setMenu(m=>!m)}>☰</button><h1>{title}</h1>{DEMO&&<span className="pill demo">Demo data</span>}{ranged&&<select aria-label="Period" value={range} onChange={e=>pickRange(e.target.value as Range)}>{ranges.map(([r,l])=><option key={r} value={r}>Last {l}</option>)}</select>}</header>
      <div className="content">
        {account?<AccountPage id={decodeURIComponent(account[1])} range={range} onUnauthorized={onUnauthorized} go={go}/>
        :current==='/costs'?<Costs range={range} onUnauthorized={onUnauthorized} go={go}/>
        :current==='/revenue'?<Revenue range={range} onUnauthorized={onUnauthorized} go={go}/>
        :current==='/performance'?<Performance range={range} onUnauthorized={onUnauthorized}/>
        :current==='/sources'?<DataSources onUnauthorized={onUnauthorized}/>
        :current==='/accounts'?<Accounts range={range} onUnauthorized={onUnauthorized} go={go}/>
        :current==='/audit'?<Audit onUnauthorized={onUnauthorized} go={go}/>
        :<Overview range={range} onUnauthorized={onUnauthorized} go={go}/>}
      </div>
    </main>
  </div>}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
