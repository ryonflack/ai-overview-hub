#!/usr/bin/env node
// Local API on http://localhost:8787 (the admin dev server proxies /api/admin here). Uses an in-process PostgreSQL (PGlite) stored in
// .data/pglite with every migration applied, so no database account is needed. Reads .env if present. Restart after code changes.
import { existsSync,mkdirSync } from 'node:fs';
import { serve } from '@hono/node-server';
import { bundleApi } from './build-vercel.mjs';

if(existsSync('.env'))process.loadEnvFile('.env');
mkdirSync('.data',{recursive:true});
const file=`${process.cwd()}/.data/dev-api.mjs`;
await bundleApi('apps/api/src/dev.ts',file,['@electric-sql/pglite']);
const {startDev}=await import(file);
const fetch=await startDev(process.env,'.data/pglite');
serve({fetch,port:8787},()=>console.log('API listening on http://localhost:8787 (PGlite database in .data/pglite)'));
