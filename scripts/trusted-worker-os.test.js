import test,{before,after} from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import https from 'node:https';import {once} from 'node:events';import {spawn} from 'node:child_process';import {randomBytes,randomUUID} from 'node:crypto';
import {recipient} from '../server/lib/recipient-crypto.js';import {WorkerClient} from '../server/lib/worker-client.js';import {generateKeyring} from '../server/lib/crypto.js';
const config=JSON.parse(fs.readFileSync(process.env.TANUKI_WORKER_OS_FIXTURE,'utf8')),appDir=path.join(config.root,'app');
assert.equal(process.platform,'linux');assert.equal(process.getuid(),config.apiUid);assert.notEqual(config.apiUid,config.workerUid);
const provider=http.createServer(async(req,res)=>{let body='';for await(const part of req)body+=part;providerCalls++;providerRequests.push(JSON.parse(body));res.setHeader('Content-Type','text/event-stream');
  res.write('data: '+JSON.stringify({choices:[{delta:{content:'WORKER_OUTPUT_SENTINEL '.repeat(60)}}]})+'\n\n');
  if(providerHold)await new Promise(resolve=>{releaseProvider=resolve;res.once('close',resolve);});
  if(!res.destroyed)res.end('data: '+JSON.stringify({choices:[{delta:{content:'Final authorized page.'}}]})+'\n\ndata: [DONE]\n\n');});
let forbiddenHits=0;const forbidden=http.createServer((req,res)=>{forbiddenHits++;res.end('not approved');});
let child,appPort,workerClient,origin,releaseProvider,providerHold=false,providerCalls=0,providerRequests=[],appLog='',controlSequence=0;
const password=randomBytes(24).toString('hex'),identities={},tokens={};
async function port(server,host='127.0.0.1'){server.listen(0,host);await once(server,'listening');return server.address().port;}
async function freePort(){const server=http.createServer();const number=await port(server);await new Promise(r=>server.close(r));return number;}
async function until(fn,attempts=500){for(let i=0;i<attempts;i++){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,20));}throw new Error('Isolated worker fixture timed out');}
async function startApp(){appLog='';child=spawn(process.execPath,['server/index.js'],{env:{PATH:process.env.PATH,NODE_ENV:'production',PORT:String(appPort),HOST:'127.0.0.1',APP_ORIGIN:'https://synthetic.local',TANUKI_DATA_DIR:path.join(appDir,'data'),TANUKI_KEYRING_FILE:path.join(appDir,'keyring.json'),TANUKI_TRUSTED_WORKER:'1',TANUKI_RECIPIENT_ENCRYPTION:'1',TANUKI_WORKER_URL:workerClient.url.origin,TANUKI_WORKER_FINGERPRINT:config.workerFingerprint,TANUKI_WORKER_CA:config.ca,TANUKI_WORKER_CLIENT_CERT:config.apiCert,TANUKI_WORKER_CLIENT_KEY:config.apiKey},stdio:['ignore','pipe','pipe']});child.stdout.on('data',c=>appLog+=c);child.stderr.on('data',c=>appLog+=c);await until(()=>{if(child.exitCode!==null)throw new Error('Synthetic API failed: '+appLog);return appLog.includes('Tanuki is listening');});}
async function stopApp(signal='SIGTERM'){if(child?.exitCode===null&&child.signalCode===null){const exited=once(child,'exit');child.kill(signal);await exited;}}
async function command(name,action,payload={}){const i=identities[name],command={v:1,username:name,device:i.fingerprint,time:Date.now(),nonce:randomBytes(32).toString('hex'),action,payload};return{command,signature:await recipient.sign(i.key,JSON.stringify(command))};}
async function call(name,action,payload={}){return fetch(origin+'/api/protected',{method:'POST',headers:{Cookie:'tanuki_session='+tokens[name],'Content-Type':'application/json'},body:JSON.stringify(await command(name,action,payload))});}
async function input(names=['alice']){const id=randomUUID(),recipients=names.map(username=>({username,fingerprint:identities[username].fingerprint}));return{id,worker:config.workerFingerprint,mode:names.length>1?'classroom':'private',recipients,encryptedInput:await recipient.encrypt([config.workerPublicKey],{v:2,purpose:'tanuki-trusted-worker-input',id,owner:'alice',worker:config.workerFingerprint,recipients:[...recipients].sort((a,b)=>a.fingerprint.localeCompare(b.fingerprint)),created:Date.now(),consent:true,prompt:'WORKER_OUTPUT_SENTINEL prompt '+randomBytes(8).toString('hex')},identities.alice.key)};}
async function read(id){const r=await call('alice','resume',{id});assert.equal(r.status,200,await r.clone().text());return r.json();}
async function completed(id){return until(async()=>{const r=await read(id);return!['queued','running'].includes(r.state)&&r;});}
async function control(operation){const sequence=++controlSequence;fs.writeFileSync(path.join(appDir,'control.json'),JSON.stringify({sequence,operation}));return until(()=>{try{const result=JSON.parse(fs.readFileSync(path.join(appDir,'control-result.json')));return result.sequence===sequence&&result;}catch{return false;}});}
before(async()=>{
  const providerPort=await port(provider),forbiddenPort=await port(forbidden,'127.0.0.2'),workerPort=await freePort();appPort=await freePort();origin=`http://127.0.0.1:${appPort}`;
  workerClient=new WorkerClient({TANUKI_WORKER_URL:`https://127.0.0.1:${workerPort}`,TANUKI_WORKER_FINGERPRINT:config.workerFingerprint,TANUKI_WORKER_CA:config.ca,TANUKI_WORKER_CLIENT_CERT:config.apiCert,TANUKI_WORKER_CLIENT_KEY:config.apiKey});
  fs.writeFileSync(path.join(appDir,'ready.json'),JSON.stringify({providerPort,forbiddenPort,workerPort}));
  await until(async()=>{try{return(await workerClient.identity()).fingerprint===config.workerFingerprint;}catch{return false;}},1000);
  Object.assign(process.env,{NODE_ENV:'production',TANUKI_DATA_DIR:path.join(appDir,'data'),TANUKI_KEYRING_FILE:path.join(appDir,'keyring.json')});
  fs.writeFileSync(process.env.TANUKI_KEYRING_FILE,JSON.stringify(generateKeyring()),{mode:0o600});
  const db=await import('../server/lib/database.js'),store=await import('../server/lib/storage.js'),auth=await import('../server/lib/auth.js');
  db.putUser({username:'principal',password,role:'admin'});
  for(const[name,role]of[['alice','student'],['bob','student'],['teacher','teacher']]){db.putUser({username:name,password,role,readingLevel:'Elementary',lexileTarget:750,managedClassroomIds:role==='teacher'?['room']:[]});const secret=randomBytes(32).toString('hex'),pair=await recipient.generate(secret),key=await recipient.unlock(pair.privateKey,secret);identities[name]={...pair,key,fingerprint:key.getFingerprint()};tokens[name]=auth.createSessionToken({username:name});}
  store.saveConfig({...store.getConfig(),classrooms:{room:{name:'Room',members:['alice']}}});db.closeDatabase();
  await startApp();for(const name of Object.keys(identities))assert.equal((await call(name,'enroll',{publicKey:identities[name].publicKey})).status,200);
});
after(async()=>{releaseProvider?.();await stopApp();for(const server of[provider,forbidden]){server.closeAllConnections();await new Promise(r=>server.close(r));}fs.writeFileSync(path.join(appDir,'app-last.log'),appLog);fs.writeFileSync(path.join(appDir,'finished'),'done');});
test('Dedicated worker runs under a different UID with no API-record or immutable-code write access',()=>{
  const events=fs.readFileSync(path.join(appDir,'worker-audit.log'),'utf8').split('\n').flatMap(line=>{try{return[JSON.parse(line)];}catch{return[];}}),probe=events.find(e=>e.event==='isolation_probe');
  assert.ok(probe);assert.equal(probe.uid,config.workerUid);for(const key of['authDenied','codeWriteDenied','networkDenied','coreDisabled','noNewPrivileges','capabilitiesZero'])assert.equal(probe[key],true,key);assert.equal(forbiddenHits,0);
});
test('Ordinary API identity cannot read worker processing keys or spool files',()=>{
  for(const file of[config.workerKey,path.join(config.workerData,'queue.sqlite')])assert.throws(()=>fs.readFileSync(file),{code:'EACCES'});
});
test('Systemd enforces worker memory, process, CPU and core-dump limits',async()=>{
  const result=await control('properties');assert.match(result.properties,/MemoryMax=268435456/);assert.match(result.properties,/TasksMax=32/);assert.match(result.properties,/LimitCORE=0/);assert.match(result.properties,/NoNewPrivileges=yes/);assert.match(result.properties,/CPUQuotaPerSecUSec=1s/);
});
test('Worker rejects missing client certificate and exposes no plaintext/private-key RPC',async()=>{
  const result=await new Promise(resolve=>{const req=https.get(new URL('/identity',workerClient.url),{ca:fs.readFileSync(config.ca)},r=>{r.resume();resolve(r.statusCode);});req.on('error',()=>resolve('rejected'));});assert.equal(result,'rejected');
  await assert.rejects(workerClient.request('/private-key',{id:randomUUID()}),error=>error.status===404);
});
test('Separate worker produces client-decryptable classroom output without plaintext in the API transport',async()=>{
  const payload=await input(['alice','teacher']);assert.equal(JSON.stringify(payload).includes('WORKER_OUTPUT_SENTINEL'),false);const r=await call('alice','worker-generate',payload);assert.equal(r.status,200,await r.clone().text());const result=await completed(payload.id);assert.equal(result.state,'complete');
  const value=await recipient.decrypt(identities.teacher.key,result.chunks[0].ciphertext,{v:2,generation:payload.id,worker:config.workerFingerprint},config.workerPublicKey);assert.match(value.text,/WORKER_OUTPUT_SENTINEL/);
  assert.equal((await call('bob','resume',{id:payload.id})).status,404);assert.equal(JSON.stringify(result).includes('WORKER_OUTPUT_SENTINEL'),false);assert.match(providerRequests.at(-1).messages[0].content,/750L/);
});
test('SIGKILL of the ordinary API leaves generation in the independent worker and reconnect resumes',async()=>{
  providerHold=true;const payload=await input();assert.equal((await call('alice','worker-generate',payload)).status,200);await until(async()=>(await read(payload.id)).count>=1);const calls=providerCalls;
  await stopApp('SIGKILL');assert.equal((await workerClient.request('/read',{id:payload.id})).state,'running');await startApp();releaseProvider();const result=await completed(payload.id);assert.equal(result.state,'complete');assert.equal(providerCalls,calls);providerHold=false;releaseProvider=undefined;
});
test('Worker SIGKILL preserves partial response and reports interruption without restarting provider',async()=>{
  providerHold=true;const payload=await input();assert.equal((await call('alice','worker-generate',payload)).status,200);await until(async()=>(await read(payload.id)).count>=1);const calls=providerCalls;
  await control('crash-worker');const result=await completed(payload.id);assert.equal(result.state,'interrupted');assert.ok(result.chunks.length>=1);assert.equal(providerCalls,calls);
  for(const chunk of result.chunks)assert.notEqual((await recipient.decrypt(identities.alice.key,chunk.ciphertext,{generation:payload.id},config.workerPublicKey)).kind,'complete');providerHold=false;releaseProvider=undefined;
});
test('Worker/API persistent files and operational logs contain no synthetic plaintext generation marker',async()=>{
  assert.equal((await control('scan-persistence')).plaintextFound,false);
  for(const name of fs.readdirSync(path.join(appDir,'data')))assert.equal(fs.readFileSync(path.join(appDir,'data',name)).includes(Buffer.from('WORKER_OUTPUT_SENTINEL')),false);
  assert.equal(fs.readFileSync(path.join(appDir,'worker-audit.log'),'utf8').includes('WORKER_OUTPUT_SENTINEL'),false);assert.equal(appLog.includes('WORKER_OUTPUT_SENTINEL'),false);
});
