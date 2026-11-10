import { assertSupportedRuntime } from '../server/lib/runtime.js';
assertSupportedRuntime();
// Trusted plaintext boundary. No imports of application authentication/storage or recipient secrets.
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import {postQuantumRecipient} from '../public/assets/pq-recipient.js';
import {nativePrimitives} from '../server/lib/pq-primitives.js';
import AIClient from '../server/lib/ai-client.js';
import { workerSystemPrompt } from '../server/lib/generation-policy.js';

const box=postQuantumRecipient(nativePrimitives), hash=value=>createHash('sha256').update(value).digest('hex');
const failure=(status,message)=>{throw Object.assign(new Error(message),{status});};
export const LIMITS=Object.freeze({workers:4,jobs:1000,bytes:256*1024*1024,jobBytes:8*1024*1024,chunks:512,retention:86400000,lease:15000});

export class TrustedWorker {
  constructor({databasePath,key,providerURL,apiKey,model,now=Date.now,audit=()=>{}}) {
    this.key=key;this.publicKey=key.toPublic().armor();this.fingerprint=key.getFingerprint();this.now=now;this.audit=audit;
    this.providerURL=providerURL;this.apiKey=apiKey;this.model=model;this.active=new Map();this.pending=new Map();this.closed=false;
    this.db=new DatabaseSync(databasePath);this.db.exec(`PRAGMA journal_mode=WAL;PRAGMA synchronous=FULL;PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,owner TEXT NOT NULL,manifest TEXT NOT NULL,state TEXT NOT NULL,created INTEGER NOT NULL,expires INTEGER NOT NULL,lease INTEGER NOT NULL,next INTEGER NOT NULL DEFAULT 0,bytes INTEGER NOT NULL DEFAULT 0,previous TEXT NOT NULL DEFAULT '');
      CREATE TABLE IF NOT EXISTS chunks(job TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,sequence INTEGER NOT NULL,frame TEXT NOT NULL,PRIMARY KEY(job,sequence));
      CREATE TABLE IF NOT EXISTS runtime(id INTEGER PRIMARY KEY CHECK(id=1),pid INTEGER NOT NULL);`);
    this.transaction(()=>{const owner=this.db.prepare('SELECT pid FROM runtime WHERE id=1').get();if(owner){let alive=true;try{process.kill(owner.pid,0);}catch(error){if(error.code==='ESRCH')alive=false;}if(alive)throw new Error('Another worker owns this queue');}this.db.prepare('INSERT OR REPLACE INTO runtime VALUES(1,?)').run(process.pid);});
    this.db.prepare("UPDATE jobs SET state='interrupted' WHERE state='running'").run();
    this.cleanup();this.timer=setInterval(()=>this.cleanup(),1000);this.timer.unref();
  }
  transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.db.exec('COMMIT');return result;}catch(error){this.db.exec('ROLLBACK');throw error;}}
  row(id){return this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id);}
  async start(request) {
    if(this.closed)failure(503,'Worker stopping');
    if(this.active.size>=LIMITS.workers||this.db.prepare('SELECT count(*) n FROM jobs').get().n>=LIMITS.jobs)failure(429,'Worker capacity reached');
    const {id,owner,recipients,devicePublicKey,encryptedInput,policy}=request;
    if(!/^[a-f0-9-]{36}$/.test(id||'')||typeof owner!=='string'||owner.length>64||!Array.isArray(recipients)||!recipients.length||recipients.length>16||typeof encryptedInput!=='string'||encryptedInput.length>100000)failure(400,'Invalid worker job');
    if(this.row(id))failure(409,'Generation identifier already used');
    const device=await box.publicKey(devicePublicKey);
    for(const r of recipients){if(typeof r.username!=='string'||r.username.length>64||(await box.publicKey(r.publicKey)).getFingerprint()!==r.fingerprint)failure(400,'Invalid recipient identity');}
    if(new Set(recipients.map(r=>r.fingerprint)).size!==recipients.length||!recipients.some(r=>r.username===owner&&r.fingerprint===device.getFingerprint()))failure(403,'Owner device recipient required');
    const expectedRecipients=recipients.map(({username,fingerprint})=>({username,fingerprint})).sort((a,b)=>a.fingerprint.localeCompare(b.fingerprint));
    const input=await box.decrypt(this.key,encryptedInput,{v:2,purpose:'tanuki-trusted-worker-input',id,owner,worker:this.fingerprint,recipients:expectedRecipients},devicePublicKey);
    if(input.consent!==true||typeof input.prompt!=='string'||!input.prompt.trim()||input.prompt.length>4000||!Number.isSafeInteger(input.created)||Math.abs(this.now()-input.created)>300000)failure(400,'Invalid or expired encrypted input');
    if(!policy||!Number.isInteger(policy.maturity)||policy.maturity<1||policy.maturity>6||!Array.isArray(policy.blockedTopics)||policy.blockedTopics.length>100||policy.blockedTopics.some(t=>typeof t!=='string'||t.length>100)||typeof policy.readingLevel!=='string'||policy.readingLevel.length>100||!Number.isInteger(policy.lexile)||policy.lexile<0||policy.lexile>1800||policy.instructions!==undefined&&(typeof policy.instructions!=='string'||policy.instructions.length>12000))failure(400,'Invalid reading policy');
    const manifest={v:2,id,owner,recipients:expectedRecipients,worker:this.fingerprint,workerPublicKey:this.publicKey};
    this.transaction(()=>{
      if(this.active.size>=LIMITS.workers||this.db.prepare('SELECT count(*) n FROM jobs').get().n>=LIMITS.jobs||this.db.prepare("SELECT 1 FROM jobs WHERE owner=? AND state='running'").get(owner))failure(429,'Worker capacity reached');
      this.db.prepare('INSERT INTO jobs(id,owner,manifest,state,created,expires,lease) VALUES(?,?,?,?,?,?,?)').run(id,owner,JSON.stringify(manifest),'running',this.now(),this.now()+LIMITS.retention,this.now()+LIMITS.lease);
    });
    const controller=new AbortController(),work={controller,done:null};this.active.set(id,work);
    work.done=this.run(manifest,recipients,input.prompt,policy,controller).finally(()=>this.active.delete(id));
    this.audit({event:'generation_started',id});return manifest;
  }
  async run(manifest,recipients,prompt,policy,controller) {
    try {
      // Provider credentials and origin are worker-owned configuration, never RPC arguments.
      const client=new AIClient({apiKey:this.apiKey,baseURL:this.providerURL});
      const rules=workerSystemPrompt(policy);
      const stream=await client.chat.completions.create({model:this.model,messages:[{role:'system',content:rules},{role:'user',content:prompt}],stream:true,max_tokens:1200},{signal:controller.signal});
      let pending='',lastWrite=this.now();
      for await(const event of stream){controller.signal.throwIfAborted();const delta=event.choices?.[0]?.delta?.content??'';if(typeof delta!=='string'||Buffer.byteLength(delta)>1024*1024)throw new Error('Invalid provider event');pending+=delta;
        while(Buffer.byteLength(pending)>8192){let end=2048;if(/^[\uDC00-\uDFFF]$/.test(pending[end]||''))end--;await this.append(manifest,recipients,pending.slice(0,end),'delta',controller.signal);pending=pending.slice(end);}
        if(pending&&(Buffer.byteLength(pending)>=1024||this.now()-lastWrite>=100)){await this.append(manifest,recipients,pending,'delta',controller.signal);pending='';lastWrite=this.now();}
      }
      if(pending)await this.append(manifest,recipients,pending,'delta',controller.signal);
      await this.append(manifest,recipients,'','complete',controller.signal);
    }catch{
      controller.abort();try{this.db.prepare("UPDATE jobs SET state='interrupted' WHERE id=? AND state='running'").run(manifest.id);}catch{this.failed=true;}
      this.audit({event:'generation_interrupted',id:manifest.id});
    }
  }
  async append(manifest,recipients,text,kind,signal){
    const row=this.row(manifest.id);signal.throwIfAborted();if(!row||row.state!=='running'||row.lease<=this.now())throw new Error('Worker authorization lease expired');
    const ciphertext=await box.encrypt(recipients.map(r=>r.publicKey),{v:2,purpose:'tanuki-trusted-worker-response',generation:manifest.id,owner:manifest.owner,recipients:manifest.recipients.map(r=>r.fingerprint).sort(),worker:manifest.worker,sequence:row.next,previous:row.previous,kind,text},this.key);
    const frame={v:2,id:manifest.id,owner:manifest.owner,worker:manifest.worker,sequence:row.next,previous:row.previous,kind,ciphertext};
    const signature=await box.sign(this.key,JSON.stringify(frame));signal.throwIfAborted();
    // The API commits only after a live authorization check. No new worker chunk is durable
    // until that commit is acknowledged. A short lease alone is not an immediate revocation check.
    await new Promise((resolve,reject)=>{
      const abort=()=>{this.pending.delete(manifest.id);reject(new Error('Worker authorization revoked'));};
      signal.addEventListener('abort',abort,{once:true});
      this.pending.set(manifest.id,{frame,signature,commit:()=>{try{this.transaction(()=>{const current=this.row(manifest.id);if(!current||current.state!=='running'||current.next!==row.next||current.lease<=this.now())throw new Error('Worker authorization revoked');
      const stored=JSON.stringify({frame,signature}),bytes=Buffer.byteLength(stored),total=this.db.prepare('SELECT coalesce(sum(bytes),0) n FROM jobs').get().n;
      if(current.next>=LIMITS.chunks||current.bytes+bytes>LIMITS.jobBytes||total+bytes>LIMITS.bytes)throw new Error('Worker quota reached');
      this.db.prepare('INSERT INTO chunks VALUES(?,?,?)').run(manifest.id,row.next,stored);
      this.db.prepare('UPDATE jobs SET next=next+1,previous=?,bytes=bytes+?,state=? WHERE id=?').run(hash(ciphertext),bytes,kind==='complete'?'complete':'running',manifest.id);
      });this.pending.delete(manifest.id);signal.removeEventListener('abort',abort);resolve();}catch(error){this.pending.delete(manifest.id);signal.removeEventListener('abort',abort);reject(error);throw error;}}});
    });
    if(kind==='complete')this.audit({event:'generation_complete',id:manifest.id});
  }
  read(id,after=-1){if(this.failed)failure(503,'Worker storage unavailable');const row=this.row(id);if(!row||row.expires<=this.now())failure(404,'Generation unavailable');if(!Number.isSafeInteger(after)||after< -1||after>row.next)failure(400,'Invalid sequence');
    const chunks=this.db.prepare('SELECT frame FROM chunks WHERE job=? AND sequence>? ORDER BY sequence LIMIT 16').all(id,after).map(r=>JSON.parse(r.frame)),pending=this.pending.get(id);
    if(pending&&pending.frame.sequence>after&&chunks.length<16)chunks.push({frame:pending.frame,signature:pending.signature});
    return {manifest:JSON.parse(row.manifest),state:row.state,count:row.next+(pending?1:0),expires:row.expires,chunks};}
  accept(id,sequence,digest){const pending=this.pending.get(id);if(pending&&pending.frame.sequence===sequence){if(hash(pending.frame.ciphertext)!==digest)failure(409,'Worker acknowledgement mismatch');pending.commit();return{accepted:true};}
    const stored=this.db.prepare('SELECT frame FROM chunks WHERE job=? AND sequence=?').get(id,sequence);if(!stored||hash(JSON.parse(stored.frame).frame.ciphertext)!==digest)failure(409,'Worker acknowledgement mismatch');return{accepted:true};}
  renew(id){const row=this.row(id);if(!row||row.state!=='running')return{renewed:false};if(row.lease<=this.now()){this.cancel(id,'interrupted');return{renewed:false};}this.db.prepare('UPDATE jobs SET lease=? WHERE id=?').run(this.now()+LIMITS.lease,id);return{renewed:true};}
  cancel(id,state='cancelled'){const changed=this.db.prepare("UPDATE jobs SET state=? WHERE id=? AND state='running'").run(state,id).changes;this.active.get(id)?.controller.abort();if(changed)this.audit({event:'generation_'+state,id});return{state:this.row(id)?.state??'unavailable'};}
  cleanup(){for(const[id,work]of this.active){const row=this.row(id);if(!row||row.lease<=this.now()||row.expires<=this.now()){this.cancel(id,'interrupted');work.controller.abort();}}this.db.prepare('DELETE FROM jobs WHERE expires<=?').run(this.now());}
  async close(){this.closed=true;clearInterval(this.timer);for(const[id]of this.active)this.cancel(id,'interrupted');await Promise.all([...this.active.values()].map(w=>w.done));this.db.prepare('DELETE FROM runtime WHERE pid=?').run(process.pid);this.db.close();}
}
