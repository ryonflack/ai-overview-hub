import {useEffect,useState} from 'react';
import {AppError} from '../../../packages/core/src/errors';
import {countries,defaultLocation,languages,locationAwareProviders,methodLabels,normalizeLocation,providerMethods,quoteRun,sourceKey} from '../../../packages/core/src/sources';
import {answerEngineProviderIds,providerIds,providerNames,serpApiProviderIds} from '../../../packages/core/src/types';
import type {CollectionMethod,Location,ProviderId,SourceKey} from '../../../packages/core/src/types';

type Selection=Partial<Record<ProviderId,CollectionMethod[]>>;
type Choice='api'|'simulated'|'both';
// Until projects persist through the authenticated API, the portal keeps the draft per browser.
const DRAFT_KEY='aoh.sources.draft';
const PLAN={maxQueries:100,addonUnitPrice:null as number|null,allowedProviders:[...providerIds]};
const initial:{selection:Selection;location:Location;queries:number}={selection:{'google-ai-overview':['simulated'],'google-ai-mode':['simulated'],'bing-copilot':['simulated'],chatgpt:['api'],perplexity:['api']},location:defaultLocation,queries:100};
const loadDraft=()=>{try{const raw=localStorage.getItem(DRAFT_KEY);return raw?{...initial,...JSON.parse(raw)}:initial}catch{return initial}};
const choiceOf=(methods?:CollectionMethod[]):Choice|undefined=>!methods?.length?undefined:methods.length>1?'both':methods[0];
const methodsOf=(choice:Choice):CollectionMethod[]=>choice==='both'?['api','simulated']:[choice];
const money=(cents:number)=>`$${(cents/100).toFixed(2)}`;

export function SourcesSettings(){
  const[draft]=useState(loadDraft);
  const[selection,setSelection]=useState<Selection>(draft.selection);
  const[location,setLocation]=useState<Location>(draft.location);
  const[queries,setQueries]=useState<number>(draft.queries);
  const[available,setAvailable]=useState<Partial<Record<SourceKey,boolean>>>({});
  const[saved,setSaved]=useState<'idle'|'saved'|'error'>('idle');
  useEffect(()=>{const controller=new AbortController();fetch('/api/sources',{signal:controller.signal}).then(r=>r.ok?r.json():null).then((body:{providers?:{id:ProviderId;methods:{method:CollectionMethod;available:boolean}[]}[]}|null)=>{if(body?.providers)setAvailable(Object.fromEntries(body.providers.flatMap(p=>p.methods.map(m=>[sourceKey(p.id,m.method),m.available]))))}).catch(()=>{});return()=>controller.abort()},[]);
  const isAvailable=(id:ProviderId,method:CollectionMethod)=>available[sourceKey(id,method)]!==false;
  const providers=providerIds.filter(id=>selection[id]?.length);
  const quote=(()=>{try{normalizeLocation(location);return{value:quoteRun({providers,methods:selection},queries,PLAN)}}catch(error){return{error:error instanceof AppError?error.message:'Check your selection.'}}})();
  const update=(next:Selection)=>{setSelection(next);setSaved('idle')};
  const toggle=(id:ProviderId)=>update({...selection,[id]:selection[id]?.length?[]:[providerMethods[id].find(m=>isAvailable(id,m))??providerMethods[id][0]]});
  const choose=(id:ProviderId,choice:Choice)=>update({...selection,[id]:methodsOf(choice)});
  const setLoc=(patch:Partial<Location>)=>{setLocation(l=>({...l,...patch}));setSaved('idle')};
  const save=()=>{if(!quote.value)return;try{localStorage.setItem(DRAFT_KEY,JSON.stringify({selection,location:normalizeLocation(location),queries}));setSaved('saved')}catch{setSaved('error')}};
  const country=countries.find(c=>c[0]===location.country);
  return <div className="dash sources">
    <div className="dash-head"><div><small>PROJECT SETTINGS</small><h2>AI sources</h2></div><button onClick={save} disabled={!quote.value}>{saved==='saved'?'Saved ✓':'Save sources'}</button></div>
    {saved==='error'&&<div className="formerror" role="alert">Your browser blocked saving. Try again or allow site storage.</div>}
    <div className="sources-grid"><div>
      <section className="panel"><div className="panelhead"><h3>Location</h3><span>Where answers are generated</span></div>
        <div className="fields">
          <label>Country<select value={location.country} onChange={e=>{const c=countries.find(x=>x[0]===e.target.value);setLoc({country:e.target.value,language:c?.[2]})}}>{countries.map(([code,name])=><option key={code} value={code}>{name}</option>)}</select></label>
          <label>Language<select value={location.language??country?.[2]} onChange={e=>setLoc({language:e.target.value})}>{languages.map(([code,name])=><option key={code} value={code}>{name}</option>)}</select></label>
          <label>Region <i>optional</i><input value={location.region??''} maxLength={80} placeholder="e.g. California" onChange={e=>setLoc({region:e.target.value})}/></label>
          <label>City <i>optional</i><input value={location.city??''} maxLength={80} placeholder="e.g. San Francisco" onChange={e=>setLoc({city:e.target.value})}/></label>
        </div>
        <p className="hint">Applied by {locationAwareProviders.map(id=>providerNames[id]).join(', ')}. User-simulated responses are captured from a session in the selected country.</p>
      </section>
      <section className="panel"><div className="panelhead"><h3>Answer engines</h3><span>Choose how each answer is collected</span></div>
        <div className="methods-legend">{(['api','simulated'] as const).map(m=><div key={m}><b>{methodLabels[m].label}</b><span>{methodLabels[m].description}</span></div>)}</div>
        {answerEngineProviderIds.map(id=>{const choice=choiceOf(selection[id]);return <div className={`engine-row ${choice?'on':''}`} key={id}>
          <label className="check"><input type="checkbox" checked={Boolean(choice)} onChange={()=>toggle(id)}/><b>{providerNames[id]}</b></label>
          <div className="segmented" role="radiogroup" aria-label={`${providerNames[id]} collection method`}>{(['api','simulated','both'] as const).map(c=>{const disabled=!choice||methodsOf(c).some(m=>!isAvailable(id,m));return <button type="button" role="radio" aria-checked={choice===c} key={c} disabled={disabled} className={choice===c?'selected':''} onClick={()=>choose(id,c)}>{c==='both'?'Both':methodLabels[c].label}</button>})}</div>
          {choice==='both'&&<span className="addon-chip">Add-on</span>}
          {providerMethods[id].some(m=>!isAvailable(id,m))&&<span className="muted">Some options unavailable</span>}
        </div>})}
      </section>
      <section className="panel"><div className="panelhead"><h3>Search engines</h3><span>{methodLabels.simulated.label}</span></div>
        {serpApiProviderIds.map(id=><div className={`engine-row ${selection[id]?.length?'on':''}`} key={id}><label className="check"><input type="checkbox" checked={Boolean(selection[id]?.length)} disabled={!isAvailable(id,'simulated')} onChange={()=>toggle(id)}/><b>{providerNames[id]}</b></label>{!locationAwareProviders.includes(id)&&<span className="muted">Default market</span>}</div>)}
      </section>
    </div>
    <div className="panel quote" aria-live="polite"><div className="panelhead"><h3>Each run</h3></div>
      <label>Queries<input type="number" min={1} max={PLAN.maxQueries} value={queries} onChange={e=>{setQueries(Math.round(Number(e.target.value)));setSaved('idle')}}/></label>
      {quote.value?<><dl>
        <div><dt>Sources selected</dt><dd>{quote.value.sources}</dd></div>
        <div><dt>Answer checks</dt><dd>{quote.value.checks.toLocaleString()}</dd></div>
        <div><dt>Included in plan</dt><dd>{quote.value.includedChecks.toLocaleString()}</dd></div>
        <div className={quote.value.addonChecks?'addon':''}><dt>Add-on checks</dt><dd>{quote.value.addonChecks.toLocaleString()}</dd></div>
      </dl>
      <p className="hint">{quote.value.addonChecks?(quote.value.addonTotal===null?'Collecting an engine both ways is billed per extra check. Add-on rates are confirmed before your next renewal.':`Add-on: ${money(quote.value.addonTotal)} per run (${money(quote.value.addonUnitPrice!)} per extra check).`):'Every check is included in your plan.'}</p></>
      :<div className="formerror" role="alert">{quote.error}</div>}
    </div></div>
  </div>
}
