import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {createServer} from 'node:http';import {once} from 'node:events';import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {TrustedWorker,LIMITS} from '../../worker/engine.js';
import {recipient} from '../../server/lib/recipient-crypto.js';
process.env.NODE_ENV='test';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'tanuki-worker-unit-'));
async function identity(){const secret=randomBytes(32).toString('hex'),pair=await recipient.generate(secret),key=await recipient.unlock(pair.privateKey,secret);return{...pair,key,fingerprint:key.getFingerprint()};}
const processor=await identity(),student=await identity(),teacher=await identity(),stranger=await identity();
const recipients=[{username:'alice',publicKey:student.publicKey,fingerprint:student.fingerprint},{username:'teacher',publicKey:teacher.publicKey,fingerprint:teacher.fingerprint}];
let mode='normal',seenPrompt='',release;
const provider=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;seenPrompt=JSON.parse(body).messages[1].content;res.setHeader('Content-Type','text/event-stream');
  res.write('data: '+JSON.stringify({choices:[{delta:{content:'Synthetic worker response. '.repeat(50)}}]})+'\n\n');
  if(mode==='hold')await new Promise(resolve=>{release=resolve;res.once('close',resolve);});
  if(mode==='truncate'){res.end();return;}res.end('data: [DONE]\n\n');});provider.listen(0,'127.0.0.1');await once(provider,'listening');
let now=Date.now();const audit=[];let worker=new TrustedWorker({databasePath:path.join(root,'queue.sqlite'),key:processor.key,providerURL:`http://127.0.0.1:${provider.address().port}/v1`,model:'fixture',now:()=>now,audit:event=>audit.push(event)});
after(async()=>{release?.();await worker.close();provider.closeAllConnections();await new Promise(r=>provider.close(r));});
async function request(extra={},inputExtra={}){const id=randomUUID(),input={v:2,purpose:'tanuki-trusted-worker-input',id,owner:'alice',worker:processor.fingerprint,recipients:recipients.map(({username,fingerprint})=>({username,fingerprint})).sort((a,b)=>a.fingerprint.localeCompare(b.fingerprint)),created:now,consent:true,prompt:'PRIVATE_PROMPT_'+randomBytes(20).toString('hex'),...inputExtra};
  return{id,owner:'alice',recipients,devicePublicKey:student.publicKey,encryptedInput:await recipient.encrypt([processor.publicKey],input,student.key),policy:{maturity:2,blockedTopics:['weapons'],readingLevel:'Elementary',lexile:700},...extra};}
async function until(fn){for(let i=0;i<500;i++){const value=fn();if(value)return value;await new Promise(r=>setTimeout(r,5));}throw new Error('Worker fixture did not reach expected state');}
async function drain(id){const frames=[];while(true){const response=worker.read(id,frames.length-1);for(const chunk of response.chunks){await recipient.verify(processor.publicKey,JSON.stringify(chunk.frame),chunk.signature);worker.accept(id,chunk.frame.sequence,createHash('sha256').update(chunk.frame.ciphertext).digest('hex'));frames.push(chunk);}if(!worker.active.has(id))return frames;await new Promise(r=>setTimeout(r,5));}}
test('Trusted worker decrypts input only in memory; no output is durable before API authorization',async()=>{
  const req=await request();await worker.start(req);const pending=await until(()=>worker.pending.get(req.id));
  assert.match(seenPrompt,/^PRIVATE_PROMPT_/);assert.equal(worker.db.prepare('SELECT count(*) n FROM chunks WHERE job=?').get(req.id).n,0);
  await recipient.verify(processor.publicKey,JSON.stringify(pending.frame),pending.signature);
  const frames=await drain(req.id);assert.equal(worker.row(req.id).state,'complete');assert.equal(frames.length,2);
  assert.match((await recipient.decrypt(student.key,frames[0].frame.ciphertext,{v:2,generation:req.id,worker:processor.fingerprint},processor.publicKey)).text,/Synthetic worker/);
  for(const file of fs.readdirSync(root))assert.equal(fs.readFileSync(path.join(root,file)).includes(Buffer.from(seenPrompt)),false);
  assert.equal(JSON.stringify(audit).includes(seenPrompt),false);
});
test('Student and assigned teacher decrypt output; processing worker and stranger cannot',async()=>{
  const req=await request();await worker.start(req);const [chunk]=await drain(req.id);
  for(const key of [student.key,teacher.key])assert.match((await recipient.decrypt(key,chunk.frame.ciphertext,{generation:req.id},processor.publicKey)).text,/Synthetic/);
  for(const key of [processor.key,stranger.key])await assert.rejects(recipient.decrypt(key,chunk.frame.ciphertext,{generation:req.id},processor.publicKey));
});
test('Substituting a recipient key outside the signed encrypted input fails',async()=>{
  const req=await request();req.recipients=[recipients[0],{username:'teacher',publicKey:stranger.publicKey,fingerprint:stranger.fingerprint}];await assert.rejects(worker.start(req),/context mismatch/);assert.equal(worker.row(req.id),undefined);
});
test('Cross-account and generation substitution fails before provider access',async()=>{
  for(const change of [{owner:'bob'},{id:randomUUID()}]){const req=await request();Object.assign(req,change);await assert.rejects(worker.start(req));assert.equal(worker.row(req.id),undefined);}
});
test('Unsigned, wrong-signer, stale and non-consenting encrypted inputs fail closed',async()=>{
  const wrong=await request();wrong.devicePublicKey=stranger.publicKey;await assert.rejects(worker.start(wrong));
  for(const extra of [{created:now-300001},{consent:false}]){const req=await request({},extra);await assert.rejects(worker.start(req));assert.equal(worker.row(req.id),undefined);}
});
test('Generation identifiers cannot be replayed after a valid completed operation',async()=>{
  const req=await request();await worker.start(req);await drain(req.id);await assert.rejects(worker.start(req),/already used/);
});
test('Explicit revocation before commit discards pending output and aborts provider',async()=>{
  mode='hold';const req=await request();await worker.start(req);await until(()=>worker.pending.has(req.id));const done=worker.active.get(req.id).done;
  worker.cancel(req.id);await done;assert.equal(worker.row(req.id).state,'cancelled');assert.equal(worker.row(req.id).next,0);assert.equal(worker.pending.has(req.id),false);release?.();mode='normal';
});
test('Expired authorization lease cannot persist pending output',async()=>{
  const req=await request();await worker.start(req);await until(()=>worker.pending.has(req.id));const done=worker.active.get(req.id).done;
  now+=LIMITS.lease+1;worker.cleanup();await done;assert.equal(worker.row(req.id).state,'interrupted');assert.equal(worker.row(req.id).next,0);
});
test('Wrong chunk acknowledgements and altered worker signatures are rejected',async()=>{
  const req=await request();await worker.start(req);const pending=await until(()=>worker.pending.get(req.id));assert.throws(()=>worker.accept(req.id,0,'wrong'),/mismatch/);
  await assert.rejects(recipient.verify(processor.publicKey,JSON.stringify({...pending.frame,owner:'bob'}),pending.signature));await drain(req.id);
});
test('Truncated upstream output is interrupted without a fabricated terminal chunk',async()=>{
  mode='truncate';const req=await request();await worker.start(req);const frames=await drain(req.id);assert.equal(worker.row(req.id).state,'interrupted');assert.ok(frames.every(c=>c.frame.kind!=='complete'));mode='normal';
});
test('Worker restart preserves committed encrypted chunks and terminates unfinished generation',async()=>{
  mode='hold';const req=await request();await worker.start(req);const pending=await until(()=>worker.pending.get(req.id));worker.accept(req.id,0,createHash('sha256').update(pending.frame.ciphertext).digest('hex'));await worker.close();
  worker=new TrustedWorker({databasePath:path.join(root,'queue.sqlite'),key:processor.key,providerURL:`http://127.0.0.1:${provider.address().port}/v1`,model:'fixture',now:()=>now});
  const restored=worker.read(req.id);assert.equal(restored.state,'interrupted');assert.equal(restored.chunks.length,1);assert.equal(restored.chunks[0].frame.ciphertext,pending.frame.ciphertext);release?.();mode='normal';
});
test('SQLite write failure never acknowledges or fabricates a committed chunk',async()=>{
  const req=await request();await worker.start(req);const pending=await until(()=>worker.pending.get(req.id)),done=worker.active.get(req.id).done;
  worker.db.exec("CREATE TRIGGER reject_worker_chunk BEFORE INSERT ON chunks BEGIN SELECT RAISE(ABORT,'synthetic write failure'); END;");
  assert.throws(()=>worker.accept(req.id,0,createHash('sha256').update(pending.frame.ciphertext).digest('hex')),/synthetic write failure/);await done;
  assert.equal(worker.row(req.id).next,0);assert.equal(worker.row(req.id).state,'interrupted');worker.db.exec('DROP TRIGGER reject_worker_chunk');
});
