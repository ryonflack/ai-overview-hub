#!/usr/bin/env node
// Assembles Vercel's Build Output API directory (.vercel/output) after `npm run build`:
//   static/            the customer web app (dist/)
//   functions/api.func the Hono API (apps/api) bundled into one ES module, run on Node.js
//   config.json        /api/* and /auth/* (sign-in, forwarded to Neon Auth) go to the function; everything else is static/
// Vercel uses .vercel/output as-is when the build command leaves it behind, so routing lives here rather than in vercel.json.
import { cpSync,mkdirSync,rmSync,writeFileSync } from 'node:fs';
import { build } from 'rolldown';

export async function bundleApi(entry,file,external=[]){
  await build({input:entry,platform:'node',logLevel:'warn',external,output:{file,format:'esm',codeSplitting:false,banner:"import { createRequire as __createRequire } from 'node:module';const require=__createRequire(import.meta.url);"}});
}

if(import.meta.url===`file://${process.argv[1]}`){
  const out='.vercel/output';
  rmSync(out,{recursive:true,force:true});
  cpSync('dist',`${out}/static`,{recursive:true});
  const fn=`${out}/functions/api.func`;
  mkdirSync(fn,{recursive:true});
  await bundleApi('apps/api/src/vercel.ts',`${fn}/index.mjs`);
  writeFileSync(`${fn}/.vc-config.json`,JSON.stringify({runtime:'nodejs22.x',handler:'index.mjs',launcherType:'Nodejs',maxDuration:60},null,2));
  // /auth/* (customer sign-in, forwarded to Neon Auth by the API so its cookie is first-party) runs on the same function.
  const routes=[{src:'^/(?:api|auth)(?:/.*)?$',dest:'/api'},{handle:'filesystem'}];
  // Daily: start due monthly runs and pick up any queued checks (the worker also chains itself while work remains).
  writeFileSync(`${out}/config.json`,JSON.stringify({version:3,routes,crons:[{path:'/api/internal/worker',schedule:'15 6 * * *'}]},null,2));
  console.log('Vercel build output written to .vercel/output (static site + api function).');
}
