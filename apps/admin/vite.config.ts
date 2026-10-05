import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// Operator control panel. Deployed as its own Vercel project (root directory apps/admin) on admin.aioverviewhub.com.
// Locally, /api/admin is proxied to the Worker (`wrangler dev`, port 8787) so the session cookie stays same-origin.
export default defineConfig({ plugins: [react()], root: __dirname, build: { outDir: 'dist', emptyOutDir: true }, server: { port: 4174, proxy: { '/api/admin': 'http://localhost:8787' } } });
