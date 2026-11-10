import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomBytes } from 'node:crypto';
import { database, transaction, readUser, putUser } from './database.js';
import { seal,unseal } from './crypto.js';
import { hashPassword, verifyPassword, validCredentials } from './passwords.js';
export const requestContext = new AsyncLocalStorage();
export const COOKIE_NAME = 'tanuki_session';
const digest = token => createHash('sha256').update(token).digest('hex');
let initialized=false;
let dummyHash;
let activeVerifications=0;
const MAX_PASSWORD_VERIFICATIONS=4;
export function initializeAuth() {
  if(initialized)return;
  transaction(()=>{
    const prod=process.env.NODE_ENV==='production';
    const names=(process.env.ADMIN_USERNAME || (prod?'':'admin')).split(',').filter(Boolean);
    const passwords=(process.env.ADMIN_PASSWORD || (prod?'':'admin123')).split(',');
    for(let i=0;i<names.length;i++) {
      const username=names[i].trim();
      if(readUser(username))continue;
      const password=passwords[i];
      if(prod && !validCredentials(username,password))throw new Error('Each bootstrap admin needs an explicit username and a password of at least 12 characters.');
      putUser({username,password,role:'admin'});
    }
    if(!prod && !readUser('student'))putUser({username:'student',password:'student123',role:'student'});
    if(prod && !database().prepare("SELECT 1 FROM users WHERE role='admin'").get())throw new Error('No administrator configured. Set ADMIN_USERNAME and ADMIN_PASSWORD for first startup.');
  });
  initialized=true;
}
export async function validateCredentials(username,password) {
  if(activeVerifications>=MAX_PASSWORD_VERIFICATIONS)throw Object.assign(new Error('Sign-in is busy. Try again shortly.'),{status:429});
  activeVerifications++;
  try {
  initializeAuth();
  const user=readUser(username);
  dummyHash ||= hashPassword(randomBytes(32).toString('hex'));
  const valid=await verifyPassword(user?.password || dummyHash,password);
  const current=readUser(username);
  if(!valid||!user||!current||current.disabled||current.password!==user.password||current.role!==user.role||current.authVersion!==user.authVersion)return null;
  const identity={username:current.username,role:current.role};
  Object.defineProperty(identity,'authVersion',{value:current.authVersion});
  return identity;
  } finally { activeVerifications--; }
}
export function createSessionToken(user) {
  const record=readUser(user.username);
  if(!record||record.disabled||(user.authVersion&&user.authVersion!==record.authVersion))throw Object.assign(new Error('Invalid credentials'),{status:401});
  const token=randomBytes(32).toString('base64url');
  database().prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());
  const expires=Date.now()+8*60*60*1000;const tokenHash=digest(token);
  const proof=seal(JSON.stringify({username:record.username,credential:digest(record.password),authVersion:record.authVersion,expires}),`session:${tokenHash}`);
  database().prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(tokenHash,user.username,proof,expires);
  return token;
}
export function parseSessionToken(token) {
  if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))return null;
  return parseSessionHash(digest(token));
}
// Internal worker coordinator only. A stored digest is never accepted as an HTTP credential.
export function parseSessionHash(tokenHash) {
  if(typeof tokenHash!=='string'||!/^[a-f0-9]{64}$/.test(tokenHash))return null;
  try {
    const session=database().prepare('SELECT * FROM sessions WHERE token_hash=? AND expires>?').get(tokenHash,Date.now());
    if(!session)return null;
    const proof=JSON.parse(unseal(session.credential_hash,`session:${tokenHash}`).toString());
    if(proof.username!==session.username||proof.expires!==session.expires)return null;
    const record=readUser(session.username);
    if(!record||record.disabled||proof.credential!==digest(record.password)||proof.authVersion!==record.authVersion)return null;
    return {username:record.username,role:record.role};
  } catch {return null;}
}
export async function assertCurrentUser(expected) {
  const current=await getCurrentUser();
  if(!current||current.username!==expected.username||current.role!==expected.role)throw Object.assign(new Error('Session is no longer valid'),{status:401});
}
export function sessionCookie(request) {return (request.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE_NAME+'='))?.slice(COOKIE_NAME.length+1);}
export async function getCurrentUser(){const request=requestContext.getStore();return request?parseSessionToken(sessionCookie(request)):null;}
export function revokeSession(token){if(token)database().prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token));}
