import {useEffect,useState} from 'react';
import {countryName} from '../../../../packages/core/src/sources';
import {providerNames} from '../../../../packages/core/src/types';
import type {CollectionMethod,Location,ProviderId} from '../../../../packages/core/src/types';
import {ApiError,errorText} from '../session';

export const colors:Record<ProviderId,string>={'google-ai-overview':'#569DDF','google-ai-mode':'#a969e8',chatgpt:'#10a37f',perplexity:'#20808d','bing-copilot':'#34a3c6','duckduckgo-search-assist':'#ec7963','naver-ai-overview':'#38b887'};
export const sourceLabel=(id:ProviderId,method:CollectionMethod)=>id==='chatgpt'||id==='perplexity'?`${providerNames[id]} · ${method==='api'?'API':'Simulated'}`:providerNames[id];
export const placeLabel=(l:Location)=>[l.city,l.region,countryName(l.country)].filter(Boolean).join(', ');
export const formatDate=(iso:string|null|undefined)=>iso?new Date(iso).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—';
export const pct=(n:number)=>`${Math.round(n*10)/10}%`;
export const money=(cents:number,currency='usd')=>(cents/100).toLocaleString('en-US',{style:'currency',currency:currency.toUpperCase()});

export function Head({kicker,title,action}:{kicker:string;title:string;action?:React.ReactNode}){return <div className="dash-head"><div><small>{kicker}</small><h2>{title}</h2></div>{action}</div>}
export function Problem({error}:{error:string|null}){return error?<div className="formerror" role="alert">{error}</div>:null}
export function Loading(){return <p className="muted loading">Loading…</p>}

/** Changes the portal page (#/overview, #/login, …). */
export const navigate=(hash:string)=>{if(location.pathname!=='/'){location.href='/'+hash;return}window.location.hash=hash};
/** Opens a page that has a real path (/welcome, /thank-you) without reloading the app. */
export const goTo=(path:string)=>{history.pushState(null,'',path);dispatchEvent(new PopStateEvent('popstate'))};

/** Loads data for a page; a 401 sends the visitor to sign in. `reload` re-fetches after a change and resolves once it has. `key`
 * re-runs the load when it changes. */
export function useLoad<T>(load:()=>Promise<T>,key:unknown=null){
  const[data,setData]=useState<T|null>(null);const[error,setError]=useState<string|null>(null);const[version,setVersion]=useState(0);
  const[waiters]=useState<(()=>void)[]>(()=>[]);
  useEffect(()=>{let live=true;load().then(d=>{if(live){setData(d);setError(null)}},e=>{if(!live)return;if(e instanceof ApiError&&e.status===401)return navigate('#/login');setError(errorText(e))}).finally(()=>{waiters.splice(0).forEach(w=>w())});return()=>{live=false}},[key,version]);// eslint-disable-line react-hooks/exhaustive-deps
  const reload=()=>new Promise<void>(resolve=>{waiters.push(resolve);setVersion(v=>v+1)});
  return{data,error,reload};
}
