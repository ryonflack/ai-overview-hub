import {useEffect,useState} from 'react';
import {AppError} from '../../../../packages/core/src/errors';
import {countries,defaultLocation,languages,locationAwareProviders,methodLabels,normalizeLocation,providerMethods,quoteRun,sourceKey} from '../../../../packages/core/src/sources';
import {answerEngineProviderIds,providerIds,providerNames,serpApiProviderIds} from '../../../../packages/core/src/types';
import type {CollectionMethod,Location,ProviderId,SourceKey} from '../../../../packages/core/src/types';
import {api,errorText} from '../session';
import type {Me,Project,Query,Selection} from '../session';
import {Head,Loading,Problem,money,navigate,useLoad} from './ui';

type Choice='api'|'simulated'|'both';
const choiceOf=(m?:CollectionMethod[]):Choice|undefined=>!m?.length?undefined:m.length>1?'both':m[0];
const methodsOf=(c:Choice):CollectionMethod[]=>c==='both'?['api','simulated']:[c];
const defaults:Selection={'google-ai-overview':['simulated'],'google-ai-mode':['simulated'],chatgpt:['api'],perplexity:['api']};

/** Project settings: the website and how it is recognised, plus which AI sources answer from where, with a live per-run estimate. */
export function ProjectPage({me}:{me:Me}){
  const loaded=useLoad(()=>Promise.all([api<{project:Project|null}>('/project'),api<{queries:Query[]}>('/queries')]));
  if(loaded.error)return <div className="dash"><Problem error={loaded.error}/></div>;
  if(!loaded.data)return <div className="dash"><Loading/></div>;
  return <ProjectForm me={me} project={loaded.data[0].project} queries={loaded.data[1].queries.length} saved={loaded.reload}/>;
}

function ProjectForm({me,project,queries,saved}:{me:Me;project:Project|null;queries:number;saved:()=>void}){
  const[domain,setDomain]=useState(project?.primaryDomain??'');const[name,setName]=useState(project?.name??'');
  const[alternates,setAlternates]=useState(project?.alternateDomains.join(', ')??'');const[brands,setBrands]=useState(project?.brands.join(', ')??'');
  const[selection,setSelection]=useState<Selection>(project?.selection??defaults);const[location,setLocation]=useState<Location>(project?.location??defaultLocation);
  const[frequency,setFrequency]=useState<'manual'|'monthly'>(project?.frequency??'monthly');
  const[available,setAvailable]=useState<Partial<Record<SourceKey,boolean>>>({});const[status,setStatus]=useState<'idle'|'saving'|'saved'>('idle');const[error,setError]=useState<string|null>(null);
  useEffect(()=>{const c=new AbortController();fetch('/api/sources',{signal:c.signal}).then(r=>r.ok?r.json():null).then((b:{providers?:{id:ProviderId;methods:{method:CollectionMethod;available:boolean}[]}[]}|null)=>{if(b?.providers)setAvailable(Object.fromEntries(b.providers.flatMap(p=>p.methods.map(m=>[sourceKey(p.id,m.method),m.available]))))}).catch(()=>{});return()=>c.abort()},[]);
  const isAvailable=(id:ProviderId,m:CollectionMethod)=>available[sourceKey(id,m)]!==false;
  const changed=()=>{setStatus('idle');setError(null)};
  const update=(next:Selection)=>{setSelection(next);changed()};
  const toggle=(id:ProviderId)=>update({...selection,[id]:selection[id]?.length?[]:[providerMethods[id].find(m=>isAvailable(id,m))??providerMethods[id][0]]});
  const setLoc=(patch:Partial<Location>)=>{setLocation(l=>({...l,...patch}));changed()};
  const providers=providerIds.filter(id=>selection[id]?.length);
  const quote=(()=>{try{normalizeLocation(location);return{value:quoteRun({providers,methods:selection},Math.max(queries,1),me.plan)}}catch(e){return{error:e instanceof AppError?e.message:'Check your selection.'}}})();
  const save=async(e:React.FormEvent)=>{e.preventDefault();setStatus('saving');setError(null);
    try{await api('/project',{method:'PUT',body:{name,primaryDomain:domain,alternateDomains:alternates,brands,selection:Object.fromEntries(providers.map(id=>[id,selection[id]])),location,frequency}});setStatus('saved');saved();if(!project)navigate('#/queries')}
    catch(err){setError(errorText(err));setStatus('idle')}};
  const country=countries.find(c=>c[0]===location.country);
  return <form className="dash sources" onSubmit={save}>
    <Head kicker={project?'PROJECT SETTINGS':'NEW PROJECT'} title="Project & sources" action={<button disabled={status==='saving'||!domain.trim()||Boolean(quote.error)}>{status==='saved'?'Saved ✓':status==='saving'?'Saving…':project?'Save changes':'Create project'}</button>}/>
    <Problem error={error}/>
    <div className="sources-grid"><div>
      <section className="panel"><div className="panelhead"><h3>Website</h3><span>What we look for in AI answers</span></div><div className="fields">
        <label>Your website<input required value={domain} placeholder="yourbrand.com" maxLength={253} onChange={e=>{setDomain(e.target.value);changed()}}/></label>
        <label>Project name <i>optional</i><input value={name} placeholder={domain||'My brand'} maxLength={80} onChange={e=>{setName(e.target.value);changed()}}/></label>
        <label>Other domains <i>comma separated</i><input value={alternates} placeholder="yourbrand.co.uk, yourbrand.de" maxLength={600} onChange={e=>{setAlternates(e.target.value);changed()}}/></label>
        <label>Brand names <i>comma separated</i><input value={brands} placeholder="Your Brand, YourBrand App" maxLength={600} onChange={e=>{setBrands(e.target.value);changed()}}/></label>
      </div><p className="hint">A <b>citation</b> counts when an answer links to your website or another of your domains. A <b>mention</b> counts when a brand name or domain appears in the answer text.</p></section>
      <section className="panel"><div className="panelhead"><h3>Location</h3><span>Where answers are generated</span></div><div className="fields">
        <label>Country<select value={location.country} onChange={e=>{const c=countries.find(x=>x[0]===e.target.value);setLoc({country:e.target.value,language:c?.[2]})}}>{countries.map(([code,n])=><option key={code} value={code}>{n}</option>)}</select></label>
        <label>Language<select value={location.language??country?.[2]} onChange={e=>setLoc({language:e.target.value})}>{languages.map(([code,n])=><option key={code} value={code}>{n}</option>)}</select></label>
        <label>Region <i>optional</i><input value={location.region??''} maxLength={80} placeholder="e.g. California" onChange={e=>setLoc({region:e.target.value})}/></label>
        <label>City <i>optional</i><input value={location.city??''} maxLength={80} placeholder="e.g. San Francisco" onChange={e=>setLoc({city:e.target.value})}/></label>
      </div><p className="hint">Applied by {locationAwareProviders.map(id=>providerNames[id]).join(', ')}. User-simulated answers are captured from a session in the selected country.</p></section>
      <section className="panel"><div className="panelhead"><h3>Answer engines</h3><span>Choose how each answer is collected</span></div>
        <div className="methods-legend">{(['api','simulated'] as const).map(m=><div key={m}><b>{methodLabels[m].label}</b><span>{methodLabels[m].description}</span></div>)}</div>
        {answerEngineProviderIds.map(id=>{const choice=choiceOf(selection[id]);return <div className={`engine-row ${choice?'on':''}`} key={id}>
          <label className="check"><input type="checkbox" checked={Boolean(choice)} onChange={()=>toggle(id)}/><b>{providerNames[id]}</b></label>
          <div className="segmented" role="radiogroup" aria-label={`${providerNames[id]} collection method`}>{(['api','simulated','both'] as const).map(c=><button type="button" role="radio" aria-checked={choice===c} key={c} disabled={!choice||methodsOf(c).some(m=>!isAvailable(id,m))} className={choice===c?'selected':''} onClick={()=>update({...selection,[id]:methodsOf(c)})}>{c==='both'?'Both':methodLabels[c].label}</button>)}</div>
          {choice==='both'&&<span className="addon-chip">Add-on</span>}{providerMethods[id].some(m=>!isAvailable(id,m))&&<span className="muted">Some options unavailable</span>}
        </div>})}
      </section>
      <section className="panel"><div className="panelhead"><h3>Search engines</h3><span>{methodLabels.simulated.label}</span></div>
        {serpApiProviderIds.map(id=><div className={`engine-row ${selection[id]?.length?'on':''}`} key={id}><label className="check"><input type="checkbox" checked={Boolean(selection[id]?.length)} disabled={!isAvailable(id,'simulated')&&!selection[id]?.length} onChange={()=>toggle(id)}/><b>{providerNames[id]}</b></label>{!isAvailable(id,'simulated')?<span className="muted">Unavailable right now</span>:!locationAwareProviders.includes(id)&&<span className="muted">Default market</span>}</div>)}
      </section>
      <section className="panel"><div className="panelhead"><h3>Schedule</h3></div><div className="fields">
        <label>Run frequency<select value={frequency} onChange={e=>{setFrequency(e.target.value as 'manual'|'monthly');changed()}}><option value="monthly">Monthly, plus runs on demand</option><option value="manual">Only when I run it</option></select></label>
      </div><p className="hint">Your plan includes {me.plan.runsPerPeriod} runs per billing period, scheduled and on-demand combined.</p></section>
    </div>
    <div className="panel quote" aria-live="polite"><div className="panelhead"><h3>Each run</h3></div>
      {quote.value?<><dl><div><dt>Queries</dt><dd>{queries} / {me.plan.maxQueries}</dd></div><div><dt>Sources selected</dt><dd>{quote.value.sources}</dd></div><div><dt>Answer checks</dt><dd>{(queries*quote.value.sources).toLocaleString()}</dd></div><div className={quote.value.addonChecks?'addon':''}><dt>Add-on checks</dt><dd>{(queries*(quote.value.sources-new Set(providers).size)).toLocaleString()}</dd></div></dl>
        <p className="hint">{quote.value.addonChecks?(quote.value.addonUnitPrice===null?'Collecting an engine both ways is billed per extra check. Add-on rates are confirmed before your next renewal.':`Add-on: ${money(quote.value.addonUnitPrice)} per extra check.`):'Every check is included in your plan.'}</p></>
      :<div className="formerror" role="alert">{quote.error}</div>}
    </div></div>
  </form>
}
