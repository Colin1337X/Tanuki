import test,{after} from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import https from 'node:https';
import {createServer} from 'node:http';import {once} from 'node:events';import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {isolate,provisionKeys,password} from './helpers.js';import {certificates} from './worker-fixture.js';
const root=isolate();await provisionKeys();
const {recipient}=await import('../../server/lib/recipient-crypto.js');
const {createWorkerServer}=await import('../../worker/index.js');
const db=await import('../../server/lib/database.js'),auth=await import('../../server/lib/auth.js'),store=await import('../../server/lib/storage.js');
const {trustedGenerations,closeTrustedGenerations}=await import('../../server/lib/trusted-generations.js');
async function identity(){const secret=randomBytes(32).toString('hex'),pair=await recipient.generate(secret),key=await recipient.unlock(pair.privateKey,secret);return{...pair,key,fingerprint:key.getFingerprint()};}
const processor=await identity(),alice=await identity(),bob=await identity(),teacher=await identity(),outsider=await identity();
const certs=certificates(root),workerData=path.join(root,'worker');fs.mkdirSync(workerData);const processingKey=path.join(root,'processing-key.asc');fs.writeFileSync(processingKey,processor.key.armor(),{mode:0o600});
let hold=false,release,plaintextAtProvider='';
const provider=createServer(async(req,res)=>{let data='';for await(const chunk of req)data+=chunk;plaintextAtProvider=JSON.parse(data).messages[1].content;res.setHeader('Content-Type','text/event-stream');
  if(hold)await new Promise(resolve=>{release=resolve;res.once('close',resolve);});
  res.end('data: '+JSON.stringify({choices:[{delta:{content:'WORKER_PROSE_'+plaintextAtProvider}}]})+'\n\ndata: [DONE]\n\n');});provider.listen(0,'127.0.0.1');await once(provider,'listening');
const service=await createWorkerServer({data:workerData,keyFile:processingKey,tlsKey:certs.worker.key,tlsCert:certs.worker.cert,tlsCA:certs.ca,clientFingerprint:certs.client.fingerprint,providerURL:`http://127.0.0.1:${provider.address().port}/v1`,model:'fixture'});
service.server.listen(0,'127.0.0.1');await once(service.server,'listening');
Object.assign(process.env,{TANUKI_TRUSTED_WORKER:'1',TANUKI_RECIPIENT_ENCRYPTION:'1',TANUKI_WORKER_URL:`https://127.0.0.1:${service.server.address().port}`,TANUKI_WORKER_FINGERPRINT:processor.fingerprint,TANUKI_WORKER_CA:certs.ca,TANUKI_WORKER_CLIENT_CERT:certs.client.cert,TANUKI_WORKER_CLIENT_KEY:certs.client.key});
const {createAppServer}=await import('../../server/index.js');let app=createAppServer();app.listen(0,'127.0.0.1');await once(app,'listening');let origin=`http://127.0.0.1:${app.address().port}`;
for(const[name,role]of[['alice','student'],['bob','student'],['teacher','teacher'],['outsider','teacher']])db.putUser({username:name,password,role,readingLevel:'Elementary',lexileTarget:650,managedClassroomIds:name==='teacher'?['classroom']:[]});
store.saveConfig({...store.getConfig(),classrooms:{classroom:{name:'Class',members:['alice']}}});
const identities={alice,bob,teacher,outsider},tokens=Object.fromEntries(Object.keys(identities).map(name=>[name,auth.createSessionToken({username:name})]));
async function command(name,action,payload={}){const identity=identities[name],command={v:1,username:name,device:identity.fingerprint,time:Date.now(),nonce:randomBytes(32).toString('hex'),action,payload};return{command,signature:await recipient.sign(identity.key,JSON.stringify(command))};}
async function call(name,action,payload={}){return fetch(origin+'/api/protected',{method:'POST',headers:{Cookie:'tanuki_session='+tokens[name],'Content-Type':'application/json'},body:JSON.stringify(await command(name,action,payload))});}
for(const name of Object.keys(identities))assert.equal((await call(name,'enroll',{publicKey:identities[name].publicKey})).status,200);
after(async()=>{release?.();await closeTrustedGenerations();app.closeAllConnections();await new Promise(r=>app.close(r));await service.close();provider.closeAllConnections();await new Promise(r=>provider.close(r));db.closeDatabase();});
async function input(names=['alice'],text='PRIVATE_INPUT_'+randomBytes(16).toString('hex')){const id=randomUUID(),recipients=names.map(username=>({username,fingerprint:identities[username].fingerprint})),encryptedInput=await recipient.encrypt([processor.publicKey],{v:2,purpose:'tanuki-trusted-worker-input',id,owner:'alice',worker:processor.fingerprint,recipients:[...recipients].sort((a,b)=>a.fingerprint.localeCompare(b.fingerprint)),created:Date.now(),consent:true,prompt:text},alice.key);return{id,worker:processor.fingerprint,recipients,encryptedInput,mode:names.length>1?'classroom':'private'};}
async function until(fn){for(let i=0;i<500;i++){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,10));}throw new Error('Trusted fixture timed out');}
async function finish(id){return until(()=>{const job=trustedGenerations().get(id);return!['queued','running'].includes(job.state)&&job;});}
test('mTLS rejects missing and unapproved application client certificates',async()=>{
  const raw=options=>new Promise(resolve=>{const r=https.get(process.env.TANUKI_WORKER_URL+'/identity',{ca:fs.readFileSync(certs.ca),...options},res=>{res.resume();resolve(res.statusCode);});r.on('error',()=>resolve('TLS rejected'));});
  assert.equal(await raw({}),'TLS rejected');assert.equal(await raw({cert:fs.readFileSync(certs.unapproved.cert),key:fs.readFileSync(certs.unapproved.key)}),403);
});
test('Ordinary API receives encrypted input and returns worker-signed recipient ciphertext',async()=>{
  const text='NOT_FOR_ORDINARY_API_'+randomBytes(12).toString('hex'),payload=await input(['alice','teacher'],text),body=await command('alice','worker-generate',payload);
  assert.equal(JSON.stringify(body).includes(text),false);const r=await call('alice','worker-generate',payload);assert.equal(r.status,200,await r.clone().text());await finish(payload.id);
  assert.equal(plaintextAtProvider,text);const response=await call('alice','resume',{id:payload.id}),result=await response.json();assert.equal(result.state,'complete');assert.equal(response.headers.get('cache-control'),'no-store, private');
  const decoded=await recipient.decrypt(teacher.key,result.chunks[0].ciphertext,{v:2,generation:payload.id,owner:'alice',worker:processor.fingerprint},processor.publicKey);assert.equal(decoded.text,'WORKER_PROSE_'+text);
  await assert.rejects(recipient.decrypt(processor.key,result.chunks[0].ciphertext,{},processor.publicKey));
  for(const file of fs.readdirSync(process.env.TANUKI_DATA_DIR))assert.equal(fs.readFileSync(path.join(process.env.TANUKI_DATA_DIR,file)).includes(Buffer.from(text)),false);
  for(const file of fs.readdirSync(workerData))assert.equal(fs.readFileSync(path.join(workerData,file)).includes(Buffer.from(text)),false);
});
test('Trusted mode refuses legacy and in-process plaintext generation paths',async()=>{
  assert.equal((await call('alice','generate',{prompt:'must not forward',discloseToAI:true,recipients:[{username:'alice',fingerprint:alice.fingerprint}],mode:'private'})).status,409);
  const response=await fetch(origin+'/api/stories/generate',{method:'POST',headers:{Cookie:'tanuki_session='+tokens.alice,'Content-Type':'application/json'},body:JSON.stringify({request:'must not forward'})});assert.equal(response.status,409);
});
test('Wrong class and cross-student recipients cannot be authorized by the API',async()=>{
  for(const name of ['bob','outsider'])assert.equal((await call('alice','worker-generate',await input(['alice',name]))).status,403);
});
test('Session revocation while provider is active prevents both API and worker chunk persistence',async()=>{
  hold=true;const payload=await input();assert.equal((await call('alice','worker-generate',payload)).status,200);await until(()=>release);
  auth.revokeSession(tokens.alice);release();const job=await finish(payload.id);assert.equal(job.state,'interrupted');assert.equal(job.next,0);await until(()=>service.worker.row(payload.id).state!=='running');assert.equal(service.worker.row(payload.id).next,0);
  tokens.alice=auth.createSessionToken({username:'alice'});hold=false;release=undefined;
});
test('Teacher reassignment revokes pending distribution before durable encrypted output',async()=>{
  hold=true;const payload=await input(['alice','teacher']);assert.equal((await call('alice','worker-generate',payload)).status,200);await until(()=>release);store.updateStoredUser('teacher',{managedClassroomIds:[]});release();
  assert.equal((await finish(payload.id)).next,0);assert.equal((await call('teacher','resume',{id:payload.id})).status,404);store.updateStoredUser('teacher',{managedClassroomIds:['classroom']});hold=false;release=undefined;
});
test('Application coordinator restart recovers an active independent worker without resending input',async()=>{
  hold=true;const payload=await input();assert.equal((await call('alice','worker-generate',payload)).status,200);await until(()=>release);
  await closeTrustedGenerations();app.closeAllConnections();await new Promise(r=>app.close(r));assert.equal(service.worker.row(payload.id).state,'running');
  app=createAppServer();app.listen(0,'127.0.0.1');await once(app,'listening');origin=`http://127.0.0.1:${app.address().port}`;release();assert.equal((await finish(payload.id)).state,'complete');hold=false;release=undefined;
});
test('Ordinary API cannot forge a worker signature with its public processing identity',async()=>{
  const payload=await input();assert.equal((await call('alice','worker-generate',payload)).status,200);await finish(payload.id);
  const forgedCipher=await recipient.encrypt([alice.publicKey],{v:2,purpose:'tanuki-trusted-worker-response',generation:payload.id,text:'forged'},bob.key);
  const frame={v:2,id:payload.id,owner:'alice',worker:processor.fingerprint,sequence:0,previous:'',kind:'delta',ciphertext:forgedCipher};
  await assert.rejects(trustedGenerations().commit(payload.id,{frame,signature:await recipient.sign(bob.key,JSON.stringify(frame))}),/signature verification/);
  await assert.rejects(recipient.decrypt(alice.key,forgedCipher,{generation:payload.id},processor.publicKey));
});
test('SQLite API write failure does not authorize a new worker durable chunk',async()=>{
  hold=true;const payload=await input();assert.equal((await call('alice','worker-generate',payload)).status,200);await until(()=>release);
  db.database().exec("CREATE TRIGGER reject_trusted_chunk BEFORE INSERT ON trusted_chunks BEGIN SELECT RAISE(ABORT,'synthetic write failure'); END;");release();const job=await finish(payload.id);
  assert.equal(job.state,'interrupted');assert.equal(job.next,0);await until(()=>service.worker.row(payload.id).state!=='running');assert.equal(service.worker.row(payload.id).next,0);db.database().exec('DROP TRIGGER reject_trusted_chunk');hold=false;release=undefined;
});
