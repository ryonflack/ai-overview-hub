#!/usr/bin/env node
// Creates an admin-panel operator: generates an authenticator secret, encrypts it with ADMIN_TOTP_KEY (same AES-GCM format as
// packages/admin/src/auth.ts) and prints the otpauth URI to scan plus the SQL to apply. Nothing is written anywhere.
//   npm run admin:key                                   -> prints a new ADMIN_TOTP_KEY to store with `wrangler secret put ADMIN_TOTP_KEY`
//   ADMIN_TOTP_KEY=... npm run admin:operator -- you@example.com "Your Name"
//   then: npx wrangler d1 execute ai-overview-hub --remote --command "<printed SQL>"
import { randomUUID, webcrypto as crypto } from 'node:crypto';
const b64 = bytes => Buffer.from(bytes).toString('base64');
if (process.argv[2] === '--generate-key') { console.log(b64(crypto.getRandomValues(new Uint8Array(32)))); process.exit(0); }
const [email, name = ''] = process.argv.slice(2);
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { console.error('Usage: ADMIN_TOTP_KEY=... npm run admin:operator -- <email> [name]'); process.exit(1); }
const key = Buffer.from(process.env.ADMIN_TOTP_KEY ?? '', 'base64');
if (key.length !== 32) { console.error('ADMIN_TOTP_KEY must be base64 for 32 bytes. Generate one with: npm run admin:key'); process.exit(1); }
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
let bits = 0, value = 0, secret = '';
for (const byte of crypto.getRandomValues(new Uint8Array(20))) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { secret += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; } }
if (bits > 0) secret += alphabet[(value << (5 - bits)) & 31];
const iv = crypto.getRandomValues(new Uint8Array(12));
const aes = await crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['encrypt']);
const sealed = `${b64(iv)}.${b64(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, new TextEncoder().encode(secret))))}`;
const sql = s => `'${String(s).replace(/'/g, "''")}'`;
const address = email.trim().toLowerCase();
console.log(`\nAdd this to your authenticator app (or enter the secret manually):\n  otpauth://totp/${encodeURIComponent(`AI Overview Hub Admin:${address}`)}?secret=${secret}&issuer=${encodeURIComponent('AI Overview Hub Admin')}\n  secret: ${secret}\n`);
console.log('Then apply:');
console.log(`INSERT INTO operators (id,email,name,totp_secret) VALUES (${sql(randomUUID())},${sql(address)},${name ? sql(name) : 'NULL'},${sql(sealed)});\n`);
