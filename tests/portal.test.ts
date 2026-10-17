import {SignJWT,createLocalJWKSet,exportJWK,generateKeyPair} from 'jose';
import type {JWTVerifyGetKey} from 'jose';
import {beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {testDB} from './pg';
import type {TestDB} from './pg';

/** Neon Auth stand-in: an Ed25519 key pair whose tokens carry Neon's claims and issuer (the auth URL's origin). */
const AUTH='https://auth.test/neondb/auth';
let sign:(claims:Record<string,unknown>,opts?:{issuer?:string;expires?:string})=>Promise<string>;let jwks:JWTVerifyGetKey;
beforeAll(async()=>{const {publicKey,privateKey}=await generateKeyPair('EdDSA');jwks=createLocalJWKSet({keys:[{...await exportJWK(publicKey),alg:'EdDSA',kid:'k1'}]});
  sign=(claims,opts={})=>new SignJWT(claims).setProtectedHeader({alg:'EdDSA',kid:'k1'}).setIssuer(opts.issuer??'https://auth.test').setIssuedAt().setExpirationTime(opts.expires??'15m').sign(privateKey);
  await testDB()},60_000);

export const portalEnv=(db:TestDB,extra:Record<string,unknown>={})=>({DB:db.binding,QUEUE:{send:async()=>{}},REPORTS:null,DATABASE_NEON_AUTH_BASE_URL:AUTH,NEON_AUTH_JWKS:jwks,...extra});

describe('portal sign-in and accounts',()=>{let db:TestDB;
  const token=(sub='u1',email='owner@acme.test',extra:Record<string,unknown>={})=>sign({sub,email,name:'Ada Owner',emailVerified:true,...extra});
  const call=async(path:string,init:RequestInit&{token?:string|null;account?:string}={})=>{const {default:app}=await import('../apps/api/src/index');const t=init.token===undefined?await token():init.token;
    return app.request(`/api/app${path}`,{...init,headers:{'content-type':'application/json',...(t?{authorization:`Bearer ${t}`}:{}),...(init.account?{'x-account-id':init.account}:{}),...init.headers}},portalEnv(db))};
  beforeEach(async()=>{db=await testDB()});

  it('rejects missing, forged and expired tokens',async()=>{expect((await call('/me',{token:null})).status).toBe(401);
    expect((await call('/me',{token:await sign({sub:'u1',email:'a@b.test'},{issuer:'https://evil.test'})})).status).toBe(401);
    expect((await call('/me',{token:await sign({sub:'u1',email:'a@b.test'},{expires:'-1m'})})).status).toBe(401);
    expect(await db.raw.get('SELECT COUNT(*) n FROM users')).toEqual({n:0})});

  it('creates one account on first sign-in, once, and reports no subscription',async()=>{const [a,b]=await Promise.all([call('/me'),call('/me')]);expect(a.status).toBe(200);expect(b.status).toBe(200);
    const me=await a.json() as {user:{email:string};account:{id:string;role:string;name:string};accounts:unknown[];subscription:unknown;entitled:boolean;plan:{maxQueries:number}};
    expect(me).toMatchObject({user:{email:'owner@acme.test'},account:{role:'owner',name:"Ada Owner's workspace"},subscription:null,entitled:false,plan:{maxQueries:100}});
    expect(await db.raw.get('SELECT COUNT(*) n FROM accounts')).toEqual({n:1});expect(await db.raw.get('SELECT auth_id FROM users')).toEqual({auth_id:'u1'})});

  it('claims a pre-created user by verified email only',async()=>{await db.raw.exec("INSERT INTO users (id,email,created_at) VALUES ('demo_owner_1','me@acme.test','2026-01-01');INSERT INTO accounts (id,name) VALUES ('demo_a','Demo A');INSERT INTO account_users (account_id,user_id,role) VALUES ('demo_a','demo_owner_1','owner')");
    expect((await call('/me',{token:await token('u9','me@acme.test',{emailVerified:false})})).status).toBe(403);
    const me=await (await call('/me',{token:await token('u9','me@acme.test')})).json() as {account:{id:string}};expect(me.account.id).toBe('demo_a');
    expect(await db.raw.get("SELECT auth_id FROM users WHERE id='demo_owner_1'")).toEqual({auth_id:'u9'})});

  it('only lets members act on a workspace',async()=>{await call('/me');expect((await call('/me',{account:'acct_someone_else'})).status).toBe(403)});

  it('saves the project and enforces query rules',async()=>{expect((await call('/queries',{method:'POST',body:JSON.stringify({text:'best crm'})})).status).toBe(409);
    const bad=await call('/project',{method:'PUT',body:JSON.stringify({primaryDomain:'acme.test',selection:{'google-ai-mode':['api']}})});expect(bad.status).toBe(400);
    const saved=await (await call('/project',{method:'PUT',body:JSON.stringify({primaryDomain:'https://www.Acme.test/',alternateDomains:'acme.co.test, acme.test',brands:['Acme'],selection:{chatgpt:['api','simulated'],'google-ai-mode':['simulated']},location:{country:'GB'},frequency:'monthly'})})).json() as {project:{primaryDomain:string;alternateDomains:string[];location:{language:string};nextRunAt:string|null}};
    expect(saved.project).toMatchObject({primaryDomain:'acme.test',alternateDomains:['acme.co.test'],location:{country:'GB',language:'en'}});expect(saved.project.nextRunAt).toBeTruthy();
    expect((await call('/queries',{method:'POST',body:JSON.stringify({text:'  best   crm ',tag:'Comparison'})})).status).toBe(201);
    expect((await call('/queries',{method:'POST',body:JSON.stringify({text:'Best CRM'})})).status).toBe(400);
    const {queries}=await (await call('/queries')).json() as {queries:{id:string;text:string}[]};expect(queries.map(q=>q.text)).toEqual(['best crm']);
    await call(`/queries/${queries[0].id}`,{method:'DELETE'});expect((await (await call('/queries')).json() as {queries:unknown[]}).queries).toEqual([])});

  it('caps queries at the plan limit, including operator overrides',async()=>{await call('/project',{method:'PUT',body:JSON.stringify({primaryDomain:'acme.test',selection:{chatgpt:['api']}})});const {account}=await (await call('/me')).json() as {account:{id:string}};
    await db.raw.run("INSERT INTO account_controls (account_id,max_queries_override,updated_at) VALUES (?,1,'2026-01-01')",account.id);
    expect((await call('/queries',{method:'POST',body:JSON.stringify({text:'one'})})).status).toBe(201);expect((await call('/queries',{method:'POST',body:JSON.stringify({text:'two'})})).status).toBe(400)});
});
