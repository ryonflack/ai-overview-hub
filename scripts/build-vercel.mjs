#!/usr/bin/env node
// Assembles Vercel's Build Output API directory (.vercel/output) after `npm run build`:
//   static/            the customer web app (dist/)
//   functions/api.func the Hono API (apps/api) bundled into one ES module, run on Node.js
//   config.json        /api and /api/* go to the function; /auth/* is proxied to Neon Auth; everything else is static/
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
  writeFileSync(`${fn}/.vc-config.json`,JSON.stringify({runtime:'nodejs22.x',handler:'index.mjs',launcherType:'Nodejs',maxDuration:30},null,2));
  // Customer sign-in goes through our own domain so Neon Auth's session cookie is first-party (third-party cookies are blocked by Safari).
  const authBase=(process.env.DATABASE_NEON_AUTH_BASE_URL||process.env.NEON_AUTH_BASE_URL||'').replace(/\/+$/,'');
  if(!authBase)console.warn('build-vercel: no Neon Auth URL (DATABASE_NEON_AUTH_BASE_URL); customer sign-in will be unavailable.');
  const routes=[...(authBase?[{src:'^/auth/(.*)$',dest:`${authBase}/$1`}]:[]),{src:'^/api(?:/.*)?$',dest:'/api'},{handle:'filesystem'}];
  writeFileSync(`${out}/config.json`,JSON.stringify({version:3,routes},null,2));
  console.log('Vercel build output written to .vercel/output (static site + api function).');
}
