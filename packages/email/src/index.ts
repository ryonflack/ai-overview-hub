/** Transactional email. With RESEND_API_KEY set, messages go through Resend from EMAIL_FROM (a sender on a domain verified in
 * Resend); otherwise they are logged, so local development and unconfigured environments never fail on email. */
export interface EmailMessage { to:string|string[]; subject:string; text:string; html?:string }
export type EmailEnv=Record<string,unknown>&{ RESEND_API_KEY?:unknown; EMAIL_FROM?:unknown };
export const DEFAULT_FROM='AI Overview Hub <notifications@aioverviewhub.com>';
const escape=(s:string)=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]!);

export async function sendEmail(env:EmailEnv,message:EmailMessage,fetcher:typeof fetch=fetch):Promise<{sent:boolean;id?:string}>{
  const key=typeof env.RESEND_API_KEY==='string'?env.RESEND_API_KEY:'';
  if(!key){console.log(JSON.stringify({level:'info',event:'email_not_sent',reason:'RESEND_API_KEY not set',to:message.to,subject:message.subject}));return{sent:false}}
  const html=message.html??`<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#1d2433">${escape(message.text).replace(/\n/g,'<br>')}</div>`;
  const response=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify({from:typeof env.EMAIL_FROM==='string'&&env.EMAIL_FROM?env.EMAIL_FROM:DEFAULT_FROM,to:message.to,subject:message.subject,text:message.text,html}),signal:AbortSignal.timeout(10_000)});
  if(!response.ok){console.error(JSON.stringify({level:'error',event:'email_failed',status:response.status,subject:message.subject}));return{sent:false}}
  return{sent:true,id:((await response.json().catch(()=>({}))) as {id?:string}).id};
}

/** A branded message: heading, paragraphs, an optional key/value summary and a call-to-action button, as HTML plus a plain-text twin. */
export interface Composed { heading:string; paragraphs:string[]; facts?:[string,string][]; cta?:{label:string;url:string}; footer?:string }
export function compose({heading,paragraphs,facts=[],cta,footer='AI Overview Hub · aioverviewhub.com'}:Composed):{text:string;html:string}{
  const text=[heading,'',...paragraphs.flatMap(p=>[p,'']),...facts.map(([k,v])=>`${k}: ${v}`),...(facts.length?['']:[]),...(cta?[`${cta.label}: ${cta.url}`,'']:[]),footer].join('\n');
  const p=(s:string)=>`<p style="margin:0 0 14px">${escape(s)}</p>`;
  const rows=facts.map(([k,v])=>`<tr><td style="padding:6px 0;color:#6b7285">${escape(k)}</td><td style="padding:6px 0;text-align:right;font-weight:600">${escape(v)}</td></tr>`).join('');
  const html=`<div style="background:#f5f5f3;padding:24px 12px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#17203b"><div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e4e3df;border-radius:10px;padding:28px 26px;font-size:15px;line-height:1.55">`
    +`<div style="font-weight:700;font-size:14px;margin-bottom:18px"><span style="display:inline-block;background:#569ddf;color:#fff;border-radius:5px;padding:2px 6px;margin-right:6px">AI</span>Overview Hub</div>`
    +`<h1 style="font-size:20px;margin:0 0 14px">${escape(heading)}</h1>${paragraphs.map(p).join('')}`
    +(rows?`<table style="width:100%;border-collapse:collapse;border-top:1px solid #eee;margin:4px 0 18px">${rows}</table>`:'')
    +(cta?`<p style="margin:20px 0 6px"><a href="${escape(cta.url)}" style="display:inline-block;background:#569ddf;color:#17203b;font-weight:700;text-decoration:none;border-radius:7px;padding:11px 18px">${escape(cta.label)} →</a></p>`:'')
    +`</div><p style="text-align:center;color:#8a90a0;font-size:12px;margin:14px 0 0">${escape(footer)}</p></div>`;
  return{text,html};
}
