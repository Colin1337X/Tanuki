import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes, createHash } from 'node:crypto';
import { recipient } from '../../server/lib/recipient-crypto.js';
import { generateKeyring } from '../../server/lib/crypto.js';

function fixture() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'tanuki-recipient-restart-'));
  const data=path.join(root,'data'),keys=path.join(root,'keys.json');fs.mkdirSync(data,{mode:0o700});
  fs.writeFileSync(keys,JSON.stringify(generateKeyring()),{mode:0o600});
  return {root,data,keys,env:{...process.env,NODE_ENV:'test',TANUKI_DATA_DIR:data,TANUKI_KEYRING_FILE:keys}};
}
const queueURL=new URL('../../server/lib/response-queue.js',import.meta.url).href;
const dbURL=new URL('../../server/lib/database.js',import.meta.url).href;
async function client() {const secret=randomBytes(32).toString('hex'),pair=await recipient.generate(secret);return {...pair,key:await recipient.unlock(pair.privateKey,secret),fingerprint:(await recipient.publicKey(pair.publicKey)).getFingerprint()};}
test('SIGKILL leaves committed ciphertext recoverable and provider state interrupted after process restart',async()=>{
  const f=fixture(),owner=await client();
  const script=`import {ResponseQueue} from ${JSON.stringify(queueURL)};import {putUser} from ${JSON.stringify(dbURL)};import {randomBytes,createHash} from 'node:crypto';
    putUser({username:'alice',password:'synthetic fixture password',role:'student'});const queue=new ResponseQueue();
    const text=randomBytes(900).toString('hex');const job=queue.start({owner:'alice',recipients:${JSON.stringify([{username:'alice',fingerprint:owner.fingerprint,publicKey:owner.publicKey}])},validate:async()=>{},produce:async function*(){yield text;await new Promise(()=>{});}});
    const timer=setInterval(()=>{if(queue.row(job.id).sequence===1){clearInterval(timer);console.log(JSON.stringify({id:job.id,digest:createHash('sha256').update(text).digest('hex')}));}},10);setInterval(()=>{},1000);`;
  const child=spawn(process.execPath,['--input-type=module','-e',script],{env:f.env,stdio:['ignore','pipe','pipe']});let output='',errors='';child.stderr.on('data',c=>errors+=c);
  const ready=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('Restart fixture timed out'));},10000);child.stdout.on('data',chunk=>{output+=chunk;if(output.includes('\n')){clearTimeout(timer);resolve(JSON.parse(output.trim()));}});child.on('exit',()=>{if(!output){clearTimeout(timer);reject(new Error(errors));}});});
  const exited=once(child,'exit');child.kill('SIGKILL');await exited;
  const recovery=spawnSync(process.execPath,['--input-type=module','-e',`import {ResponseQueue} from ${JSON.stringify(queueURL)};import {closeDatabase} from ${JSON.stringify(dbURL)};const q=new ResponseQueue();console.log(JSON.stringify(q.read(${JSON.stringify(ready.id)},'alice',${JSON.stringify(owner.fingerprint)})));await q.close();closeDatabase();`],{env:f.env,encoding:'utf8',timeout:10000});
  assert.equal(recovery.status,0,recovery.stderr);const result=JSON.parse(recovery.stdout);assert.equal(result.state,'interrupted');assert.equal(result.chunks.length,1);
  const value=await recipient.decrypt(owner.key,result.chunks[0].ciphertext,{generation:ready.id,owner:'alice',sequence:0,previous:''});
  assert.equal(createHash('sha256').update(value.text).digest('hex'),ready.digest);
});

test('Isolated server copy with database, backup, source, configuration and every server key cannot decrypt client-protected text',async()=>{
  const f=fixture(),owner=await client(),teacher=await client(),text=randomBytes(32).toString('hex');
  const ciphertext=await recipient.encrypt([owner.publicKey,teacher.publicKey],{purpose:'compromise-acceptance',text},owner.key);
  const seed=spawnSync(process.execPath,['--input-type=module','-e',`import * as db from ${JSON.stringify(dbURL)};db.putUser({username:'alice',password:'synthetic fixture password',role:'student'});db.putRecord('protected-documents','acceptance',${JSON.stringify({ciphertext,publicKeys:[owner.publicKey,teacher.publicKey]})});db.database().exec('PRAGMA wal_checkpoint(TRUNCATE)');db.closeDatabase();`],{env:f.env,encoding:'utf8',timeout:10000});assert.equal(seed.status,0,seed.stderr);
  const copy=path.join(f.root,'compromised-server');fs.mkdirSync(copy,{mode:0o700});
  for(const name of ['server','public'])fs.cpSync(name,path.join(copy,name),{recursive:true});
  for(const name of ['package.json','package-lock.json'])fs.copyFileSync(name,path.join(copy,name));
  fs.cpSync(f.data,path.join(copy,'data'),{recursive:true});fs.cpSync(f.data,path.join(copy,'backups'),{recursive:true});
  fs.copyFileSync(f.keys,path.join(copy,'keys.json'));fs.writeFileSync(path.join(copy,'config.json'),JSON.stringify({NODE_ENV:'test',TANUKI_KEYRING_FILE:'keys.json',TANUKI_DATA_DIR:'data'}));
  // Identical installed library bytes; no client key files or client environment enter the copy.
  fs.symlinkSync(path.resolve('node_modules'),path.join(copy,'node_modules'),'dir');
  const attack=`import {getRecords,closeDatabase} from './server/lib/database.js';import {loadKeyring} from './server/lib/crypto.js';import {recipient} from './server/lib/recipient-crypto.js';
    const doc=getRecords('protected-documents')[0];let recovered=false,attempts=0;
    for(const key of [...loadKeyring().keys.values()].map(k=>k.privateKey).concat(await Promise.all(doc.publicKeys.map(k=>recipient.publicKey(k))))){attempts++;try{await recipient.decrypt(key,doc.ciphertext,{purpose:'compromise-acceptance'});recovered=true;}catch{}}
    console.log(JSON.stringify({outerStorageDecrypted:true,attempts,recovered}));closeDatabase();`;
  const result=spawnSync(process.execPath,['--input-type=module','-e',attack],{cwd:copy,env:{PATH:process.env.PATH,NODE_ENV:'test',TANUKI_DATA_DIR:path.join(copy,'data'),TANUKI_KEYRING_FILE:path.join(copy,'keys.json')},encoding:'utf8',timeout:10000});
  assert.equal(result.status,0,result.stderr);const observed=JSON.parse(result.stdout);assert.equal(observed.outerStorageDecrypted,true);assert.ok(observed.attempts>=3);assert.equal(observed.recovered,false);
  assert.equal((await recipient.decrypt(teacher.key,ciphertext,{purpose:'compromise-acceptance'},owner.publicKey)).text,text);
  for(const file of ['data/tanuki.sqlite','backups/tanuki.sqlite','keys.json','config.json'])assert.equal(fs.readFileSync(path.join(copy,file)).includes(Buffer.from(text)),false);
});
