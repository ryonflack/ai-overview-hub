import { AppError } from '../../core/src/errors';

/** Operator authentication primitives (WebCrypto only, so they run on Workers and Node 22). Sign-in is an emailed one-time link plus an authenticator-app code. */
export const LOGIN_TOKEN_TTL_MS=15*60_000;
export const SESSION_TTL_MS=12*60*60_000;
export const MAX_LOGIN_ATTEMPTS=5;
export const SESSION_COOKIE='__Host-admin_session';

const B32='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32Encode(bytes:Uint8Array):string{let bits=0,value=0,out='';for(const b of bytes){value=(value<<8)|b;bits+=8;while(bits>=5){out+=B32[(value>>>(bits-5))&31];bits-=5}}if(bits>0)out+=B32[(value<<(5-bits))&31];return out}
export function base32Decode(text:string):Uint8Array{const clean=text.toUpperCase().replace(/=+$|\s/g,'');let bits=0,value=0;const out:number[]=[];for(const ch of clean){const i=B32.indexOf(ch);if(i<0)throw new AppError('CONFIGURATION_ERROR','Invalid authenticator secret.',500);value=(value<<5)|i;bits+=5;if(bits>=8){out.push((value>>>(bits-8))&255);bits-=8}}return new Uint8Array(out)}
const toHex=(buf:ArrayBuffer)=>[...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
const b64=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes));
const unb64=(text:string)=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));

/** Unguessable URL-safe token (256 bits). Only its hash is stored. */
export const randomToken=()=>b64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export const sha256Hex=async(text:string)=>toHex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)));

/** RFC 6238 TOTP (HMAC-SHA1, 30-second step, 6 digits), compatible with standard authenticator apps. */
export async function totp(secret:Uint8Array,step:number):Promise<string>{const counter=new ArrayBuffer(8);new DataView(counter).setBigUint64(0,BigInt(step));const key=await crypto.subtle.importKey('raw',secret as BufferSource,{name:'HMAC',hash:'SHA-1'},false,['sign']);const mac=new Uint8Array(await crypto.subtle.sign('HMAC',key,counter));const offset=mac[19]&15;const code=((mac[offset]&127)<<24|mac[offset+1]<<16|mac[offset+2]<<8|mac[offset+3])%1_000_000;return code.toString().padStart(6,'0')}
/** Accepts the current step ±1 for clock drift. Returns the matched step, or null. Steps at or before `lastStep` are rejected so a code cannot be replayed. */
export async function verifyTotp(secret:Uint8Array,code:string,lastStep=0,now=Date.now()):Promise<number|null>{if(!/^\d{6}$/.test(code))return null;const current=Math.floor(now/30_000);for(const step of [current-1,current,current+1]){if(step<=lastStep)continue;if(await totp(secret,step)===code)return step}return null}

/** Authenticator secrets are AES-GCM encrypted at rest with ADMIN_TOTP_KEY (base64, 32 bytes) so a database read alone cannot mint codes. Format: base64(iv).base64(ciphertext). */
async function aesKey(keyB64:string|undefined){if(!keyB64)throw new AppError('CONFIGURATION_ERROR','Admin sign-in is not configured.',503);const raw=unb64(keyB64);if(raw.length!==32)throw new AppError('CONFIGURATION_ERROR','Admin sign-in is not configured.',503);return crypto.subtle.importKey('raw',raw as BufferSource,'AES-GCM',false,['encrypt','decrypt'])}
export async function encryptSecret(plain:string,keyB64:string|undefined):Promise<string>{const iv=crypto.getRandomValues(new Uint8Array(12));const data=await crypto.subtle.encrypt({name:'AES-GCM',iv},await aesKey(keyB64),new TextEncoder().encode(plain));return`${b64(iv)}.${b64(new Uint8Array(data))}`}
export async function decryptSecret(sealed:string,keyB64:string|undefined):Promise<string>{const [iv,data]=sealed.split('.');if(!iv||!data)throw new AppError('CONFIGURATION_ERROR','Invalid authenticator secret.',500);const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv) as BufferSource},await aesKey(keyB64),unb64(data) as BufferSource);return new TextDecoder().decode(plain)}

export const sessionCookie=(token:string,maxAgeMs=SESSION_TTL_MS)=>`${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.floor(maxAgeMs/1000)}`;
export const readCookie=(header:string|undefined,name:string)=>header?.split(';').map(p=>p.trim()).find(p=>p.startsWith(`${name}=`))?.slice(name.length+1);
