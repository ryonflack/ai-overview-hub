import { neon,types } from '@neondatabase/serverless';

/** PostgreSQL behind the D1-style interface the API was written against: prepare(sql).bind(...values).first() / .all() / .run().
 * SQL keeps `?` placeholders; toPostgres numbers them. Result aliases are camelCase (`created_at createdAt`); Postgres folds unquoted
 * identifiers to lower case, so toPostgres quotes every camelCase identifier. That is safe because the schema itself is all snake_case. */
type Row=Record<string,unknown>;
type Statement={first<T=Row>():Promise<T|null>;all<T=Row>():Promise<{results:T[]}>;run():Promise<{meta:{changes:number}}>};
export type SqlDB={prepare(sql:string):Statement&{bind(...values:unknown[]):Statement}};
export type Executor=(text:string,params:unknown[])=>Promise<{rows:Row[];rowCount:number|null}>;

export function toPostgres(sql:string){let out='';let n=0;
  for(let i=0;i<sql.length;i++){const ch=sql[i];
    if(ch==="'"||ch==='"'){const end=sql.indexOf(ch,i+1);const stop=end===-1?sql.length:end+1;out+=sql.slice(i,stop);i=stop-1;continue}
    if(ch==='?'){out+=`$${++n}`;continue}
    const word=/^[A-Za-z_][A-Za-z0-9_]*/.exec(sql.slice(i));
    if(word&&!/[A-Za-z0-9_$]/.test(sql[i-1]??'')){out+=/^[a-z][a-z0-9]*[A-Z]/.test(word[0])?`"${word[0]}"`:word[0];i+=word[0].length-1;continue}
    out+=ch}
  return out}

// node:sqlite and D1 return integers; Postgres returns undefined for absent bind values and bigint/numeric as strings.
const param=(v:unknown)=>v===undefined?null:typeof v==='boolean'?Number(v):v;
export function sqlDB(execute:Executor):SqlDB{
  const statement=(sql:string,values:unknown[]=[]):Statement=>{const text=toPostgres(sql);const params=values.map(param);
    return{first:async<T>()=>((await execute(text,params)).rows[0]??null) as T|null,all:async<T>()=>({results:(await execute(text,params)).rows as T[]}),run:async()=>({meta:{changes:(await execute(text,params)).rowCount??0}})}};
  return{prepare:sql=>({...statement(sql),bind:(...values:unknown[])=>statement(sql,values)})}}

/** COUNT(*) is bigint and SUM(bigint) is numeric; both arrive as strings unless parsed. Values here stay well inside 2^53. */
export const NUMERIC_OIDS={int8:20,numeric:1700} as const;
const toNumber=(v:string)=>Number(v);

/** Neon over HTTP: one round trip per statement, no connection to manage, suited to short-lived functions. */
export function neonDB(url:string):SqlDB{
  const sql=neon(url,{fullResults:true,types:{getTypeParser:(id,format)=>id===NUMERIC_OIDS.int8||id===NUMERIC_OIDS.numeric?toNumber:types.getTypeParser(id,format)}});
  return sqlDB(async(text,params)=>{const r=await sql.query(text,params);return{rows:r.rows as Row[],rowCount:r.rowCount}})}
