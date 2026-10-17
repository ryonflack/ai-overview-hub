import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// /api and /auth go to the local API (`npm run dev:api`) by default. API_PROXY_TARGET points them at a deployed environment instead
// (VERCEL_BYPASS supplies its Deployment Protection bypass), which lets the local site sign in with the real Neon Auth from localhost.
const target=process.env.API_PROXY_TARGET||'http://localhost:8787';
const proxy={target,changeOrigin:true,cookieDomainRewrite:{'*':''},headers:process.env.VERCEL_BYPASS?{'x-vercel-protection-bypass':process.env.VERCEL_BYPASS}:{}};
export default defineConfig({ plugins: [react()], root: 'apps/web', build: { outDir: '../../dist', emptyOutDir: true }, server: { port: 4173, proxy: { '/api': proxy, '/auth': proxy } } });
