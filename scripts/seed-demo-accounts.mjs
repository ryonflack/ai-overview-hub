#!/usr/bin/env node
// Prints SQL that loads the fictional demo customers (packages/core/src/demo-accounts.json) into the database, so they show up in
// the admin panel and are ready for the customer portal once sign-in exists. Nothing is written anywhere; apply the output yourself.
//   npm run demo:accounts                                   -> SQL to add the demo accounts (safe to re-run)
//   npm run demo:accounts -- --owner you@example.com        -> also make that email an owner of every demo account
//   npm run demo:accounts -- --remove                       -> SQL to delete every demo account and everything under it
//   then: npm run demo:accounts > demo.sql && npx wrangler d1 execute ai-overview-hub --remote --file demo.sql
// Demo subscriptions use status 'demo', which the admin revenue metrics do not count as paying.
import { readFileSync } from 'node:fs';
const { accounts } = JSON.parse(readFileSync(new URL('../packages/core/src/demo-accounts.json', import.meta.url), 'utf8'));
const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); return i === -1 ? undefined : args[i + 1] ?? ''; };
const sql = v => v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
const row = (table, values) => `INSERT OR IGNORE INTO ${table} (${Object.keys(values).join(',')}) VALUES (${Object.values(values).map(sql).join(',')});`;
const out = [];

if (args.includes('--remove')) {
  const ids = `(SELECT id FROM accounts WHERE id LIKE 'demo\\_%' ESCAPE '\\')`;
  out.push(
    `DELETE FROM project_queries WHERE project_id IN (SELECT id FROM projects WHERE account_id IN ${ids});`,
    `DELETE FROM project_domains WHERE project_id IN (SELECT id FROM projects WHERE account_id IN ${ids});`,
    `DELETE FROM projects WHERE account_id IN ${ids};`,
    `DELETE FROM queries WHERE account_id IN ${ids};`,
    `DELETE FROM subscriptions WHERE account_id IN ${ids};`,
    `DELETE FROM account_controls WHERE account_id IN ${ids};`,
    `DELETE FROM account_users WHERE account_id IN ${ids};`,
    `DELETE FROM users WHERE id LIKE 'demo\\_%' ESCAPE '\\' AND id NOT IN (SELECT user_id FROM account_users);`,
    `DELETE FROM accounts WHERE id IN ${ids};`,
  );
} else {
  const owner = flag('--owner')?.trim().toLowerCase();
  if (owner !== undefined && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(owner)) { console.error('Usage: npm run demo:accounts -- [--owner <email>] [--remove]'); process.exit(1); }
  const now = new Date().toISOString();
  if (owner) out.push(`INSERT OR IGNORE INTO users (id,email,email_verified_at,created_at) VALUES ('demo_owner_' || lower(hex(randomblob(8))),${sql(owner)},${sql(now)},${sql(now)});`);
  for (const a of accounts) {
    const project = `${a.id}_project`;
    const providers = Object.keys(a.methods);
    out.push(
      `-- ${a.name}`,
      row('accounts', { id: a.id, name: a.name, created_at: a.createdAt }),
      row('users', { id: `${a.id}_owner`, email: a.owner.email, email_verified_at: a.createdAt, created_at: a.createdAt }),
      `INSERT OR IGNORE INTO account_users (account_id,user_id,role) SELECT ${sql(a.id)},id,'owner' FROM users WHERE email=${sql(a.owner.email)};`,
      ...(owner ? [`INSERT OR IGNORE INTO account_users (account_id,user_id,role) SELECT ${sql(a.id)},id,'owner' FROM users WHERE email=${sql(owner)};`] : []),
      row('subscriptions', { id: `${a.id}_sub`, account_id: a.id, plan_id: 'starter', stripe_customer_id: 'demo', stripe_subscription_id: null, status: 'demo', period_start: null, period_end: null, updated_at: a.createdAt, created_at: a.createdAt }),
      row('account_controls', { account_id: a.id, status: 'active', addon_waived: 1, notes: 'Demo account (fictional data). Remove with: npm run demo:accounts -- --remove', updated_by: 'demo-seed', updated_at: a.createdAt }),
      row('projects', { id: project, account_id: a.id, name: a.name, primary_domain: a.domain, providers: JSON.stringify(providers), frequency: a.frequency, created_at: a.createdAt, source_methods: JSON.stringify(a.methods), location: JSON.stringify(a.location) }),
      row('project_domains', { id: `${project}_d0`, project_id: project, domain: a.domain, type: 'primary' }),
      ...a.alternateDomains.map((domain, i) => row('project_domains', { id: `${project}_d${i + 1}`, project_id: project, domain, type: 'alternate' })),
      ...a.queries.flatMap(([text], i) => {
        const id = `${a.id}_q${String(i + 1).padStart(2, '0')}`;
        return [row('queries', { id, account_id: a.id, text, created_at: a.createdAt }), row('project_queries', { project_id: project, query_id: id, active: 1 })];
      }),
    );
  }
}
console.log(out.join('\n'));
