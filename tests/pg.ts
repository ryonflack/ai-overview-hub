import type { PGlite,PGliteInterface } from '@electric-sql/pglite';
import { toPostgres } from '../packages/db/src/index';
import { pgliteAdapter,pgliteDB } from '../packages/db/src/pglite';

/** A fresh PostgreSQL database with every migration applied, for one test. Migrations run once per test file; each test gets a clone.
 * `binding` is what the API sees (env.DB); `raw` runs setup and assertion SQL directly, with `?` placeholders as in the app. */
let template:Promise<PGlite>|undefined;
export async function testDB(){
  template??=pgliteDB().then(r=>r.pg);
  const pg:PGliteInterface=await (await template).clone();
  const rows=async<T=Record<string,unknown>>(sql:string,params:unknown[])=>(await pg.query<T>(toPostgres(sql),params.map(v=>v===undefined?null:v))).rows;
  return{binding:pgliteAdapter(pg),raw:{exec:(sql:string)=>pg.exec(sql),run:async(sql:string,...params:unknown[])=>{await rows(sql,params)},get:async<T=Record<string,unknown>>(sql:string,...params:unknown[])=>(await rows<T>(sql,params))[0],all:<T=Record<string,unknown>>(sql:string,...params:unknown[])=>rows<T>(sql,params)}};
}
export type TestDB=Awaited<ReturnType<typeof testDB>>;
