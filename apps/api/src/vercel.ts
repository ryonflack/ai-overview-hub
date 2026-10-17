import { getRequestListener } from '@hono/node-server';
import { waitUntil } from '@vercel/functions';
import { neonDB } from '../../../packages/db/src/index';
import type { SqlDB } from '../../../packages/db/src/index';
import app from './index';
import type { Env } from './index';

/** Vercel Function entry (bundled by scripts/build-vercel.mjs). The bindings the app expects (env.DB, env.QUEUE) are built from process.env:
 * DB is Neon Postgres (DATABASE_URL, from the Vercel Neon integration) and QUEUE writes to the queue_messages table. */
export function envFrom(vars:Record<string,string|undefined>,db:SqlDB):Env{
  return{...vars,DB:db,REPORTS:null,QUEUE:{send:async(message:unknown)=>{const type=(message as {type?:string})?.type??'UNKNOWN';await db.prepare('INSERT INTO queue_messages (id,type,body,created_at) VALUES (?,?,?,?)').bind(crypto.randomUUID(),type,JSON.stringify(message),new Date().toISOString()).run()}}}}

/** Continues queued checks in a separate invocation after the response is sent (Vercel keeps the function alive for waitUntil). */
const kickWorker=(origin:string)=>{const secret=process.env.CRON_SECRET;if(!secret)return;const bypass=process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  waitUntil(fetch(`${origin}/api/internal/worker`,{method:'POST',headers:{authorization:`Bearer ${secret}`,...(bypass?{'x-vercel-protection-bypass':bypass}:{})},signal:AbortSignal.timeout(10_000)}).then(()=>undefined,()=>undefined))};
let env:Env|undefined;
const current=()=>{if(!env){if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is not set.');env={...envFrom(process.env,neonDB(process.env.DATABASE_URL)),KICK_WORKER:kickWorker,WAIT_UNTIL:waitUntil}}return env};
export default getRequestListener(request=>app.fetch(request,current()));
