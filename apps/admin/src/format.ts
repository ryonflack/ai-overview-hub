/** Revenue arrives in cents and vendor cost in micro-dollars (see packages/admin/src/metrics.ts). */
const usd=(dollars:number,digits=2)=>dollars.toLocaleString('en-US',{style:'currency',currency:'USD',minimumFractionDigits:digits,maximumFractionDigits:digits});
export const cents=(v:number|null|undefined)=>v===null||v===undefined?'—':usd(v/100,Math.abs(v)>=100_000?0:2);
/** Amounts under 10 cents keep four decimals so per-call costs like $0.0149 and $0.0035 stay distinguishable. */
export const micros=(v:number|null|undefined)=>v===null||v===undefined?'—':Math.abs(v)<100_000&&v!==0?usd(v/1_000_000,4):usd(v/1_000_000,Math.abs(v)>=1_000_000_000?0:2);
export const pct=(v:number|null|undefined,digits=1)=>v===null||v===undefined?'—':`${(v*100).toFixed(digits)}%`;
export const num=(v:number|null|undefined)=>v===null||v===undefined?'—':v.toLocaleString('en-US');
export const ms=(v:number|null|undefined)=>v===null||v===undefined?'—':v>=60_000?`${(v/60_000).toFixed(1)} min`:v>=1000?`${(v/1000).toFixed(1)} s`:`${Math.round(v)} ms`;
export const date=(v:string|number|null|undefined)=>v===null||v===undefined||v===''?'—':new Date(v).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
export const day=(v:string)=>new Date(`${v}T00:00:00Z`).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
