import { useEffect,useRef,useState } from 'react';
import type { ReactNode } from 'react';

/** Small chart kit for the control panel. Colors come from CSS roles (styles.css) so light and dark modes use their own validated steps. */
export function StatTile({label,value,sub,status}:{label:string;value:ReactNode;sub?:ReactNode;status?:Tone}){return <div className="tile"><span className="tile-label">{label}</span><b className="tile-value">{value}</b>{sub!==undefined&&<small className="tile-sub">{status&&<StatusDot tone={status}/>}{sub}</small>}</div>}

export type Tone = 'good'|'warning'|'serious'|'critical'|'neutral';
const icons:Record<Tone,string>={good:'✓',warning:'!',serious:'!',critical:'✕',neutral:'•'};
/** Status always pairs color with an icon and a label, never color alone. */
export function Status({tone,children}:{tone:Tone;children:ReactNode}){return <span className={`status status-${tone}`}><i aria-hidden="true">{icons[tone]}</i>{children}</span>}
function StatusDot({tone}:{tone:Tone}){return <i className={`dot status-${tone}`} aria-hidden="true">{icons[tone]}</i>}

/** Inline magnitude bar for table cells (single hue, so no legend needed). */
export function ShareBar({value,max,label}:{value:number;max:number;label:string}){return <span className="share" title={label}><span style={{width:`${max>0?Math.max(value/max*100,value>0?2:0):0}%`}}/></span>}

interface Bar { key:string; label:string; value:number; tip:string }
const roundedTop=(x:number,y:number,w:number,h:number,r=4)=>{const rr=Math.min(r,h,w/2);return`M${x},${y+h}V${y+rr}Q${x},${y} ${x+rr},${y}H${x+w-rr}Q${x+w},${y} ${x+w},${y+rr}V${y+h}Z`};
/** About four evenly spaced round ticks (1, 2, 2.5 or 5 × 10^n) covering the max. */
const ticks=(max:number,integer=false)=>{if(max<=0)return[0,1];const rough=max/4;const mag=10**Math.floor(Math.log10(rough));const nice=[1,2,2.5,5,10].map(m=>m*mag).find(s=>s>=rough)!;const step=integer?Math.max(1,Math.ceil(nice)):nice;return Array.from({length:Math.ceil(max/step)+1},(_,i)=>+(i*step).toPrecision(12))};
/** Charts draw at their measured pixel width (not a scaled viewBox) so axis text stays 11px at any size. */
function useWidth(){const ref=useRef<HTMLDivElement>(null);const[width,setWidth]=useState(640);useEffect(()=>{const el=ref.current;if(!el)return;const observer=new ResizeObserver(([entry])=>setWidth(Math.max(280,Math.round(entry.contentRect.width))));observer.observe(el);return()=>observer.disconnect()},[]);return[ref,width] as const}

/** Single-series column chart over time with a per-bar hover tooltip and a table fallback. */
export function Columns({title,data,format,empty='No data in this period.'}:{title:string;data:Bar[];format:(v:number)=>string;empty?:string}){const[hover,setHover]=useState<number|null>(null);const[ref,W]=useWidth();if(!data.length)return <figure className="chart"><figcaption>{title}</figcaption><p className="muted empty">{empty}</p></figure>;
  const H=220,L=56,B=24,T=10;const max=Math.max(...data.map(d=>d.value));const scale=ticks(max);const top=scale.at(-1)!;const slot=(W-L)/data.length;const bw=Math.max(Math.min(slot-2,28),1);const y=(v:number)=>T+(H-T-B)*(1-v/top);const labelEvery=Math.ceil(data.length/Math.max(2,Math.floor((W-L)/70)));
  return <figure className="chart"><figcaption>{title}</figcaption><div className="plot" ref={ref}><svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} onMouseLeave={()=>setHover(null)}>
    {scale.map(t=><g key={t}><line className="grid" x1={L} x2={W} y1={y(t)} y2={y(t)}/><text className="axis" x={L-8} y={y(t)} dy="0.32em" textAnchor="end">{format(t)}</text></g>)}
    {data.map((d,i)=>{const x=L+i*slot+(slot-bw)/2;const h=H-B-y(d.value);return <g key={d.key}><rect className="hit" x={L+i*slot} y={T} width={slot} height={H-T-B} onMouseEnter={()=>setHover(i)} onFocus={()=>setHover(i)} tabIndex={0} aria-label={d.tip}/>{h>0&&<path className={`bar${hover===i?' on':''}`} d={roundedTop(x,y(d.value),bw,h)}/>}{i%labelEvery===0&&<text className="axis" x={x+bw/2} y={H-6} textAnchor="middle">{d.label}</text>}</g>})}
    <line className="baseline" x1={L} x2={W} y1={H-B} y2={H-B}/></svg>
    {hover!==null&&<div className="tooltip" style={{left:`${(L+(hover+0.5)*slot)/W*100}%`}}><b>{data[hover].label}</b>{data[hover].tip}</div>}</div>
    <details className="table-view"><summary>Show as table</summary><table><tbody>{data.map(d=><tr key={d.key}><td>{d.label}</td><td className="num">{format(d.value)}</td></tr>)}</tbody></table></details></figure>}

/** Two-series grouped columns (e.g. new vs churned) with legend, hover tooltips, and a table view. Series colors are categorical slots 1 and 2. */
export function PairedColumns({title,labels,series}:{title:string;labels:string[];series:[{name:string;values:number[]},{name:string;values:number[]}]}){const[hover,setHover]=useState<number|null>(null);const[ref,W]=useWidth();const H=220,L=40,B=24,T=10;const max=Math.max(1,...series.flatMap(s=>s.values));const scale=ticks(max,true);const top=scale.at(-1)!;const slot=(W-L)/labels.length;const bw=Math.max(Math.min((slot-8)/2,18),2);const every=Math.ceil(labels.length/Math.max(2,Math.floor((W-L)/44)));const y=(v:number)=>T+(H-T-B)*(1-v/top);
  return <figure className="chart"><figcaption>{title}<span className="legend">{series.map((s,i)=><span key={s.name}><i className={`swatch s${i+1}`}/>{s.name}</span>)}</span></figcaption><div className="plot" ref={ref}><svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} onMouseLeave={()=>setHover(null)}>
    {scale.map(t=><g key={t}><line className="grid" x1={L} x2={W} y1={y(t)} y2={y(t)}/><text className="axis" x={L-8} y={y(t)} dy="0.32em" textAnchor="end">{t}</text></g>)}
    {labels.map((label,i)=>{const x0=L+i*slot+(slot-bw*2-2)/2;return <g key={label}><rect className="hit" x={L+i*slot} y={T} width={slot} height={H-T-B} onMouseEnter={()=>setHover(i)} onFocus={()=>setHover(i)} tabIndex={0} aria-label={`${label}: ${series.map(s=>`${s.values[i]} ${s.name.toLowerCase()}`).join(', ')}`}/>{series.map((s,si)=>{const h=H-B-y(s.values[i]);return h>0?<path key={s.name} className={`bar s${si+1}${hover===i?' on':''}`} d={roundedTop(x0+si*(bw+2),y(s.values[i]),bw,h)}/>:null})}{i%every===0&&<text className="axis" x={L+(i+0.5)*slot} y={H-6} textAnchor="middle">{label}</text>}</g>})}
    <line className="baseline" x1={L} x2={W} y1={H-B} y2={H-B}/></svg>
    {hover!==null&&<div className="tooltip" style={{left:`${(L+(hover+0.5)*slot)/W*100}%`}}><b>{labels[hover]}</b>{series.map(s=><span key={s.name}>{s.name}: {s.values[hover]}</span>)}</div>}</div>
    <details className="table-view"><summary>Show as table</summary><table><thead><tr><th>Month</th>{series.map(s=><th key={s.name} className="num">{s.name}</th>)}</tr></thead><tbody>{labels.map((l,i)=><tr key={l}><td>{l}</td>{series.map(s=><td key={s.name} className="num">{s.values[i]}</td>)}</tr>)}</tbody></table></details></figure>}
