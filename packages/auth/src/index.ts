import { createRemoteJWKSet,jwtVerify } from 'jose';
import type { JWTVerifyGetKey } from 'jose';
import { AppError } from '../../core/src/errors';

/** Customer sign-in is Neon Auth (managed Better Auth). The browser signs in through /auth on our own domain (proxied to Neon,
 * see scripts/build-vercel.mjs) so its session cookie is first-party, and sends the short-lived JWT from that session as a Bearer
 * token. Here the API checks the token against Neon Auth's public keys. Issuer is the auth URL's origin (Neon's documented contract). */
export interface NeonUser { id:string; email:string; name:string|null; emailVerified:boolean }

/** The Vercel Neon integration prefixes its variables with DATABASE_; plain NEON_AUTH_BASE_URL is accepted for other setups. */
export const neonAuthBaseUrl=(env:Record<string,unknown>)=>String(env.DATABASE_NEON_AUTH_BASE_URL||env.NEON_AUTH_BASE_URL||'').replace(/\/+$/,'');

const remote=new Map<string,JWTVerifyGetKey>();
const keysFor=(baseUrl:string)=>{let keys=remote.get(baseUrl);if(!keys){keys=createRemoteJWKSet(new URL(`${baseUrl}/.well-known/jwks.json`));remote.set(baseUrl,keys)}return keys};

export async function verifyNeonToken(token:string,baseUrl:string,keys:JWTVerifyGetKey=keysFor(baseUrl)):Promise<NeonUser>{
  if(!baseUrl)throw new AppError('CONFIGURATION_ERROR','Sign-in is not configured.',503);
  let payload;
  try{({payload}=await jwtVerify(token,keys,{issuer:new URL(baseUrl).origin,algorithms:['EdDSA']}))}catch{throw new AppError('AUTHENTICATION_ERROR','Your session has expired. Sign in again.',401)}
  const email=typeof payload.email==='string'?payload.email.trim().toLowerCase():'';
  if(!payload.sub||!email)throw new AppError('AUTHENTICATION_ERROR','Your session has expired. Sign in again.',401);
  return{id:payload.sub,email,name:typeof payload.name==='string'&&payload.name.trim()?payload.name.trim():null,emailVerified:payload.emailVerified===true};
}
