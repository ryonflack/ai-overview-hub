#!/usr/bin/env node
// Applies pending migrations/*.sql to the Neon database, in order, each in its own transaction, recording them in schema_migrations.
// Runs in the Vercel build (npm run vercel-build) using that environment's DATABASE_URL, so a deployment never runs against a schema
// older than its code. An advisory lock stops concurrent builds from racing. Without a database URL it skips locally but fails on Vercel.
import { readFileSync,readdirSync } from 'node:fs';
import { Pool,neonConfig } from '@neondatabase/serverless';

const url=process.env.DATABASE_URL_UNPOOLED||process.env.DATABASE_URL;
if(!url){if(process.env.VERCEL){console.error('migrate: DATABASE_URL is not set for this Vercel environment.');process.exit(1)}console.log('migrate: no DATABASE_URL, skipping.');process.exit(0)}
neonConfig.webSocketConstructor=globalThis.WebSocket;
const pool=new Pool({connectionString:url});
const client=await pool.connect();
try{
  await client.query('SELECT pg_advisory_lock(727274)');
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY,applied_at TEXT NOT NULL)');
  const applied=new Set((await client.query('SELECT name FROM schema_migrations')).rows.map(r=>r.name));
  const pending=readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort().filter(f=>!applied.has(f));
  for(const file of pending){
    await client.query('BEGIN');
    try{await client.query(readFileSync(`migrations/${file}`,'utf8'));await client.query('INSERT INTO schema_migrations (name,applied_at) VALUES ($1,$2)',[file,new Date().toISOString()]);await client.query('COMMIT')}
    catch(error){await client.query('ROLLBACK');throw new Error(`${file}: ${error.message}`,{cause:error})}
    console.log(`migrate: applied ${file}`);
  }
  console.log(pending.length?`migrate: ${pending.length} migration(s) applied.`:'migrate: schema is up to date.');
}catch(error){console.error(`migrate: failed. ${error.message}`);process.exitCode=1}
finally{await client.query('SELECT pg_advisory_unlock(727274)').catch(()=>{});client.release();await pool.end()}
