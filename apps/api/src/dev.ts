import { pgliteDB } from '../../../packages/db/src/pglite';
import app from './index';
import { envFrom } from './vercel';

/** Local development entry (scripts/dev-api.mjs): the same app and bindings as on Vercel, with PGlite in place of Neon. */
export async function startDev(vars:Record<string,string|undefined>,dataDir:string){const {db}=await pgliteDB(dataDir);const env=envFrom(vars,db);return(request:Request)=>app.fetch(request,env)}
