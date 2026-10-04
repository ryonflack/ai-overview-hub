import type { ReactNode } from 'react';
import type { Tone } from './charts';
export function Panel({title,actions,children}:{title:string;actions?:ReactNode;children:ReactNode}){return <section className="panel"><header><h2>{title}</h2>{actions}</header>{children}</section>}
export function Notice({tone,children}:{tone:Tone;children:ReactNode}){return <div className={`notice notice-${tone}`} role={tone==='critical'?'alert':'status'}>{children}</div>}
export function Tabs<T extends string>({value,options,onChange,label}:{value:T;options:readonly (readonly [T,string])[];onChange:(v:T)=>void;label:string}){return <div className="tabs" role="tablist" aria-label={label}>{options.map(([id,text])=><button key={id} role="tab" aria-selected={value===id} className={value===id?'on':''} onClick={()=>onChange(id)}>{text}</button>)}</div>}
