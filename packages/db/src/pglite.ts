import { readFileSync,readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import type { PGliteInterface } from '@electric-sql/pglite';
import { NUMERIC_OIDS,sqlDB } from './index';

/** In-process PostgreSQL (WASM) with every migration applied, for tests and local development. Not bundled into the deployed API. */
const parsers={[NUMERIC_OIDS.int8]:Number,[NUMERIC_OIDS.numeric]:Number};
// Parsers go on each query rather than the constructor so clones (used by the tests) behave the same.
export const pgliteAdapter=(pg:PGliteInterface)=>sqlDB(async(text,params)=>{const r=await pg.query<Record<string,unknown>>(text,params,{parsers});return{rows:r.rows,rowCount:r.affectedRows??r.rows.length}});

export async function migrate(pg:PGliteInterface){
  await pg.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY,applied_at TEXT NOT NULL)');
  const applied=new Set((await pg.query<{name:string}>('SELECT name FROM schema_migrations')).rows.map(r=>r.name));
  for(const file of readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort())if(!applied.has(file))await pg.transaction(async tx=>{await tx.exec(readFileSync(`migrations/${file}`,'utf8'));await tx.query('INSERT INTO schema_migrations (name,applied_at) VALUES ($1,$2)',[file,new Date().toISOString()])});
}

export async function pgliteDB(dataDir?:string){const pg=new PGlite(dataDir);await migrate(pg);return{pg,db:pgliteAdapter(pg)}}
