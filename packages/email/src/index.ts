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
