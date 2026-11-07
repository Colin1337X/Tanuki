import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { seal, unseal, loadKeyring } from './crypto.js';
import { hashPassword } from './passwords.js';
export const DATA_DIR = path.resolve(process.env.TANUKI_DATA_DIR || 'data');
let db;
export function database() {
  if (db) return db;
  loadKeyring();
  fs.mkdirSync(DATA_DIR,{recursive:true,mode:0o700});
  const connection = new DatabaseSync(path.join(DATA_DIR,'tanuki.sqlite'));
  connection.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('student','teacher','admin')), profile TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS records (collection TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(collection,id));
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE, credential_hash TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires);
    CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires INTEGER NOT NULL);`);
  db=connection;
  const existingRows=connection.prepare('SELECT (SELECT count(*) FROM users)+(SELECT count(*) FROM records) AS n').get().n;
  try {
    if(existingRows && !connection.prepare("SELECT 1 FROM metadata WHERE key='server-origin-auth-v3'").get() && process.env.TANUKI_ALLOW_LEGACY_UPGRADE!=='1')throw new Error('Existing database requires trusted offline upgrade: set TANUKI_ALLOW_LEGACY_UPGRADE=1 for the upgrade command only');
    transaction(() => {
      if (!db.prepare("SELECT 1 FROM metadata WHERE key='migration-v1'").get()) {
        for (const collection of ['config','stories','users','recordings','knowledge-base']) {
          const file=path.join(DATA_DIR,`${collection}.json`);
          if (!fs.existsSync(file)) continue;
          const value=JSON.parse(fs.readFileSync(file,'utf8')); // fail closed; never reset damaged data
          if (collection==='config') putRecord('config','global',value);
          else {
            if (!Array.isArray(value)) throw new Error(`Invalid legacy ${collection} data`);
            const seen=new Set();
            for (const item of value) {
              const identifier=collection==='users'?item.username:item.id;
              if(seen.has(identifier))throw new Error(`Duplicate ${collection} identifier`);seen.add(identifier);
              if (collection==='users') {if(typeof item.username!=='string'||typeof item.password!=='string')throw new Error('Invalid legacy user');putUser({...item,password:item.password.startsWith('$argon2id$')?item.password:hashPassword(item.password)});}
              else { if (!item.id) throw new Error(`Missing ${collection} record id`); putRecord(collection,item.id,item); }
            }
          }
        }
        db.prepare("INSERT INTO metadata VALUES ('migration-v1', ?)").run(new Date().toISOString());
      }
      const upgrading=!db.prepare("SELECT 1 FROM metadata WHERE key='server-origin-auth-v3'").get();
      if(upgrading) {
        for(const row of db.prepare('SELECT collection,id,payload FROM records').all()) {
          const context=`${row.collection}:${row.id}`;
          const value=JSON.parse(unseal(row.payload,context,{allowLegacy:true}).toString());
          putRecord(row.collection,row.id,value);
        }
      }
      if (upgrading || !db.prepare("SELECT 1 FROM metadata WHERE key='auth-integrity-v2'").get()) {
        // Authenticate existing credential/role metadata without changing passwords.
        // This upgrade requires a trusted, offline backup of the pre-upgrade database.
        for(const row of db.prepare('SELECT * FROM users').all()) {
          const profile=JSON.parse(unseal(row.profile,`users:${row.username}`,{allowLegacy:upgrading}).toString());
          if(profile._credentials&&(profile._credentials.role!==row.role||profile._credentials.password!==row.password_hash))throw new Error('User credential integrity check failed');
          profile.authVersion ||= randomUUID();
          profile._credentials={role:row.role,password:row.password_hash};
          db.prepare('UPDATE users SET profile=? WHERE username=?').run(seal(JSON.stringify(profile),`users:${row.username}`),row.username);
        }
        // Old sessions have no authenticated metadata. Require a fresh login.
        db.prepare('DELETE FROM sessions').run();
        db.prepare("INSERT OR REPLACE INTO metadata VALUES ('auth-integrity-v2','1')").run();
      }
      if(upgrading || !db.prepare("SELECT 1 FROM metadata WHERE key='audio-format-v2'").get()) {
        for(const row of db.prepare("SELECT id,payload FROM records WHERE collection='recordings'").all()) {
          const record=JSON.parse(unseal(row.payload,`recordings:${row.id}`).toString());
          if(record.storageFormat && !upgrading)continue;
          const safe=typeof record.storyId==='string'&&typeof record.filename==='string'&&![record.storyId,record.filename].some(value=>/[\\/]/.test(value)||value==='..');
          const file=safe?path.join(DATA_DIR,'recordings',record.storyId,record.filename):null;
          const encrypted=!file||!fs.existsSync(file)||fs.readFileSync(file).subarray(0,8).toString()==='TANUKI1:';
          let legacyEnvelope=false;if(file&&fs.existsSync(file)&&encrypted){try{legacyEnvelope=!JSON.parse(fs.readFileSync(file,'utf8').slice(8)).mac;}catch{}}
          record.storageFormat=encrypted?(legacyEnvelope?'encrypted-v1-legacy':'encrypted-v1'):'legacy-raw';
          putRecord('recordings',row.id,record);
        }
        db.prepare("INSERT OR REPLACE INTO metadata VALUES ('audio-format-v2','1')").run();
      }
      const check=db.prepare("SELECT value FROM metadata WHERE key='key-check'").get();
      if (check) {unseal(check.value,'key-check',{allowLegacy:upgrading});if(upgrading)db.prepare("UPDATE metadata SET value=? WHERE key='key-check'").run(seal('tanuki','key-check'));}
      else db.prepare("INSERT INTO metadata VALUES ('key-check', ?)").run(seal('tanuki','key-check'));
      if(upgrading)db.prepare("INSERT INTO metadata VALUES ('server-origin-auth-v3','1')").run();
    });
  } catch(error) { connection.close();db=undefined;throw error; }
  return db;
}
export function transaction(fn) {
  const connection=database();
  if (connection.isTransaction) return fn();
  connection.exec('BEGIN IMMEDIATE');
  try {const result=fn();connection.exec('COMMIT');return result;}
  catch(error){connection.exec('ROLLBACK');throw error;}
}
export function getRecords(collection) {
  return database().prepare('SELECT id,payload FROM records WHERE collection=? ORDER BY rowid DESC').all(collection).map(row=>JSON.parse(unseal(row.payload,`${collection}:${row.id}`).toString()));
}
export function putRecord(collection,id,value) {
  database().prepare('INSERT INTO records(collection,id,payload) VALUES(?,?,?) ON CONFLICT(collection,id) DO UPDATE SET payload=excluded.payload').run(collection,id,seal(JSON.stringify(value),`${collection}:${id}`));
}
export function removeRecord(collection,id) { return database().prepare('DELETE FROM records WHERE collection=? AND id=?').run(collection,id).changes>0; }
function decodeUser(row) {
  if(!row)return null;
  const {_credentials,...profile}=JSON.parse(unseal(row.profile,`users:${row.username}`).toString());
  if(!_credentials||_credentials.role!==row.role||_credentials.password!==row.password_hash)throw new Error('User credential integrity check failed');
  return {...profile,username:row.username,password:row.password_hash,role:row.role};
}
export function readUsers() {return database().prepare('SELECT * FROM users ORDER BY username').all().map(decodeUser);}
export function readUser(username) {return decodeUser(database().prepare('SELECT * FROM users WHERE username=?').get(username));}
export function putUser(user) {
  const {username,password,role,...profile}=user;
  const encoded = password.startsWith('$argon2id$') ? password : hashPassword(password);
  const previous=database().prepare('SELECT * FROM users WHERE username=?').get(username);
  if(!previous && database().prepare('SELECT 1 FROM metadata WHERE key=?').get('retired-user:'+username))throw Object.assign(new Error('This username is retired and cannot be reused'),{status:409});
  const oldProfile=previous?JSON.parse(unseal(previous.profile,`users:${username}`).toString()):null;
  // Never let a profile update bless tampered credential metadata.
  if(previous && oldProfile._credentials && (oldProfile._credentials.role!==previous.role||oldProfile._credentials.password!==previous.password_hash))throw new Error('User credential integrity check failed');
  const changed=!previous||previous.password_hash!==encoded||previous.role!==role||Boolean(oldProfile?.disabled)!==Boolean(profile.disabled);
  profile.authVersion=changed?randomUUID():oldProfile.authVersion||randomUUID();
  profile._credentials={role,password:encoded};
  if(previous && changed)database().prepare('DELETE FROM sessions WHERE username=?').run(username);
  database().prepare('INSERT INTO users VALUES(?,?,?,?) ON CONFLICT(username) DO UPDATE SET password_hash=excluded.password_hash,role=excluded.role,profile=excluded.profile').run(username,encoded,role,seal(JSON.stringify(profile),`users:${username}`));
}
export function removeUser(username) {return transaction(()=>{const record=readUser(username);if(record?.role==='admin')throw Object.assign(new Error('Administrator deletion is not supported'),{status:403});if(!record)return false;database().prepare('INSERT OR IGNORE INTO metadata VALUES(?,?)').run('retired-user:'+username,'1');return database().prepare('DELETE FROM users WHERE username=?').run(username).changes>0;});}
export function consumeRateLimit(key,limit,windowMs) {
  return transaction(()=>{
    const now=Date.now();database().prepare('DELETE FROM rate_limits WHERE expires<=?').run(now);
    const row=database().prepare('SELECT * FROM rate_limits WHERE key=?').get(key);
    if(row && row.attempts>=limit) return false;
    database().prepare('INSERT INTO rate_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1').run(key,now+windowMs);
    return true;
  });
}
export function closeDatabase(){if(db){db.close();db=undefined;}}
