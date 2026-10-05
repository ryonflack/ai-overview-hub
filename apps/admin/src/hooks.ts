import { useEffect,useRef,useState } from 'react';
import { ApiError } from './api';

/** Loads data for a page and reloads when `key` changes (e.g. the selected range). Results are tagged with the request they answer, so a
 * stale response never shows under a new key; `reload()` keeps the current data on screen while it refreshes. A 401 bubbles to the shell, which shows sign-in. */
export function useLoad<T>(load:()=>Promise<T>,key:string,onUnauthorized:()=>void){const[tick,setTick]=useState(0);const[state,setState]=useState<{id:string;data:T|null;error:string|null}>({id:'',data:null,error:null});const latest=useRef(load);useEffect(()=>{latest.current=load});const id=`${key}#${tick}`;
  useEffect(()=>{let live=true;latest.current().then(data=>{if(live)setState({id,data,error:null})}).catch((e:unknown)=>{if(!live)return;if(e instanceof ApiError&&e.status===401)onUnauthorized();else setState({id,data:null,error:e instanceof Error?e.message:'Something went wrong.'})});return()=>{live=false}},[id,onUnauthorized]);
  const sameKey=state.id.slice(0,state.id.lastIndexOf('#'))===key;const data=sameKey?state.data:null;const error=state.id===id?state.error:null;
  return{data,error,loading:data===null&&error===null,reload:()=>setTick(t=>t+1)}}
