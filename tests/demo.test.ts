import {execFileSync} from 'node:child_process';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {describe,expect,it} from 'vitest';
import {businessMetrics} from '../packages/admin/src/metrics';
import {demoAccounts,demoRun,metricsFor,runsFor,sourcesFor} from '../apps/web/src/demo';

const migrated=()=>{const db=new DatabaseSync(':memory:');for(const file of readdirSync('migrations').sort())db.exec(readFileSync(`migrations/${file}`,'utf8'));return db};
const seed=(...args:string[])=>execFileSync(process.execPath,['scripts/seed-demo-accounts.mjs',...args],{encoding:'utf8'});
const count=(db:DatabaseSync,sql:string)=>(db.prepare(sql).get() as {n:number}).n;

describe('demo account seed',()=>{
  it('loads every demo account against the real schema and is safe to re-run',()=>{const db=migrated();db.exec('PRAGMA foreign_keys=ON');db.exec(seed());db.exec(seed());
    expect(count(db,"SELECT COUNT(*) n FROM accounts WHERE id LIKE 'demo_%'")).toBe(demoAccounts.length);
    expect(count(db,'SELECT COUNT(*) n FROM project_queries')).toBe(demoAccounts.reduce((n,a)=>n+a.queries.length,0));
    expect(count(db,"SELECT COUNT(*) n FROM account_users WHERE role='owner'")).toBe(demoAccounts.length);
    const project=db.prepare("SELECT source_methods,location FROM projects WHERE id='demo_harbor_project'").get() as {source_methods:string;location:string};
    expect(JSON.parse(project.location)).toEqual({country:'GB',language:'en',city:'London'});expect(JSON.parse(project.source_methods).chatgpt).toEqual(['api'])});
  it('keeps demo subscriptions out of revenue',()=>{const db=migrated();db.exec(seed());const subs=db.prepare("SELECT account_id accountId,plan_id planId,status,6999 monthlyPrice,created_at createdAt,canceled_at canceledAt FROM subscriptions").all() as never[];
    const m=businessMetrics(subs,{from:'2026-01-01T00:00:00Z',to:'2026-12-31T00:00:00Z'});expect(m.mrrCents).toBe(0);expect(m.payingAccounts).toBe(0);expect(m.byStatus.demo).toBe(demoAccounts.length)});
  it('adds an extra owner to every demo account and removes everything cleanly',()=>{const db=migrated();db.exec(seed('--owner','Me@Example.com'));
    expect(count(db,"SELECT COUNT(*) n FROM account_users au JOIN users u ON u.id=au.user_id WHERE u.email='me@example.com'")).toBe(demoAccounts.length);
    db.exec("INSERT INTO accounts (id,name) VALUES ('acct_real','Real customer')");db.exec(seed('--remove'));
    for(const t of ['accounts','users','account_users','projects','project_domains','queries','project_queries','subscriptions','account_controls'])expect(count(db,`SELECT COUNT(*) n FROM ${t}`),t).toBe(t==='accounts'?1:0)});
  it('rejects a malformed owner email',()=>{expect(()=>execFileSync(process.execPath,['scripts/seed-demo-accounts.mjs','--owner','nope'],{stdio:'pipe'})).toThrow()});
});

describe('demo portal data',()=>{
  it('is deterministic and gives each account its own sources and history',()=>{for(const a of demoAccounts){const run=demoRun(a,0);expect(run.results).toHaveLength(a.queries.length*sourcesFor(a).length);expect(demoRun(a,0)).toEqual(run);
    const m=metricsFor(a,0);expect(m.visibility).toBeGreaterThan(0);expect(m.visibility).toBeLessThan(100);expect(runsFor(a).every(r=>r.date>=a.createdAt.slice(0,10))).toBe(true)}
    expect(new Set(demoAccounts.map(a=>a.domain)).size).toBe(demoAccounts.length);expect(demoAccounts.every(a=>a.domain.endsWith('.example')&&a.owner.email.endsWith('.example'))).toBe(true)});
});
