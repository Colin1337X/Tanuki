import { createHash } from 'node:crypto';
import { database, transaction, getRecords, putRecord, removeRecord, readUser, consumeRateLimit } from './database.js';
import { seal, unseal } from './crypto.js';
import { recipient } from './recipient-crypto.js';
import { WorkerClient } from './worker-client.js';
import { parseSessionHash } from './auth.js';
import { device, recipientsFor, permittedRecipient } from './protected-content.js';
import { getEffectiveMaturitySettings, getConfig } from './storage.js';

const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const running=state=>state==='queued'||state==='running';
export const trustedWorkerEnabled=()=>process.env.TANUKI_TRUSTED_WORKER==='1';
let service;
export function trustedGenerations(){return service ||= new TrustedGenerations();}
export async function closeTrustedGenerations(){if(service){await service.close();service=undefined;}}

export class TrustedGenerations {
  constructor(client=new WorkerClient()) {
    this.client=client;this.polling=new Map();this.closed=false;
    database().exec(`CREATE TABLE IF NOT EXISTS trusted_chunks(generation TEXT NOT NULL,sequence INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(generation,sequence));
      CREATE TABLE IF NOT EXISTS trusted_acks(generation TEXT NOT NULL,device TEXT NOT NULL,sequence INTEGER NOT NULL,PRIMARY KEY(generation,device));`);
    this.cleanup();for(const job of this.jobs())if(running(job.state))this.launch(job.id);
    this.timer=setInterval(()=>this.cleanup(),30000);this.timer.unref();
  }
  jobs(){return getRecords('trusted-generations');}
  get(id){return this.jobs().find(j=>j.id===id);}
  validate(job){
    const user=parseSessionHash(job.sessionHash);
    if(!user||user.username!==job.owner||!device(job.owner,job.device)||job.expires<=Date.now())fail(401,'Generation authorization revoked');
    recipientsFor(job.owner,job.recipients,job.mode);
  }
  authorize(id,user,fp){const job=this.get(id);if(!job||job.expires<=Date.now()||!device(user.username,fp)||!job.recipients.some(r=>r.username===user.username&&r.fingerprint===fp)||!permittedRecipient(job.owner,user.username,job.mode))fail(404,'Generation unavailable');return job;}
  async start(user,command,sessionToken) {
    const p=command.payload;if(!/^[a-f0-9-]{36}$/.test(p.id||'')||typeof p.encryptedInput!=='string'||p.encryptedInput.length>100000||p.prompt!==undefined)fail(400,'A client-encrypted worker input is required');
    const identity=await this.client.identity();if(p.worker!==identity.fingerprint)fail(409,'Worker identity changed');
    const recipients=recipientsFor(user.username,p.recipients,p.mode);
    if(!recipients.some(r=>r.fingerprint===command.device&&r.username===user.username))fail(403,'Generating device must receive the response');
    const author=device(user.username,command.device),profile=readUser(user.username),safety=getEffectiveMaturitySettings(user.username);
    const job={v:2,id:p.id,owner:user.username,device:command.device,mode:p.mode,recipients:recipients.map(({username,fingerprint})=>({username,fingerprint})),
      worker:identity.fingerprint,workerPublicKey:identity.publicKey,sessionHash:hash(sessionToken),created:Date.now(),expires:Date.now()+86400000,state:'queued',next:0,previous:'',bytes:0};
    transaction(()=>{this.validate(job);const all=this.jobs();if(this.get(job.id))fail(409,'Generation already exists');if(all.length>=1000||all.filter(j=>j.owner===job.owner).length>=30||all.some(j=>j.owner===job.owner&&running(j.state))||!consumeRateLimit('trusted-generation:'+job.owner,30,3600000))fail(429,'Generation quota reached');putRecord('trusted-generations',job.id,job);});
    try {
      const manifest=await this.client.request('/jobs',{id:job.id,owner:job.owner,recipients,devicePublicKey:author.publicKey,encryptedInput:p.encryptedInput,
        policy:{maturity:safety.contentMaturityLevel,blockedTopics:safety.blockedTopics,readingLevel:profile.readingLevel||'Elementary',lexile:profile.lexileTarget??600,instructions:getConfig().systemPrompt||''}});
      if(manifest.id!==job.id||manifest.owner!==job.owner||manifest.worker!==job.worker)throw new Error('Worker manifest mismatch');
      this.validate(job);job.state='running';putRecord('trusted-generations',job.id,job);this.launch(job.id);return this.summary(job);
    } catch(error){job.state='interrupted';putRecord('trusted-generations',job.id,job);await this.client.request('/cancel',{id:job.id}).catch(()=>{});throw error;}
  }
  summary(job){const {sessionHash,device,bytes,previous,...visible}=job;return visible;}
  list(user,fp){return this.jobs().filter(j=>{try{this.authorize(j.id,user,fp);return true;}catch{return false;}}).map(j=>this.summary(j));}
  read(id,user,fp,after=-1){const job=this.authorize(id,user,fp);if(!Number.isSafeInteger(after)||after< -1||after>=job.next&&after!==-1)fail(400,'Invalid resume sequence');
    const chunks=database().prepare('SELECT sequence,payload FROM trusted_chunks WHERE generation=? AND sequence>? ORDER BY sequence LIMIT 16').all(id,after).map(r=>{const value=JSON.parse(unseal(r.payload,`trusted-chunk:${id}:${r.sequence}`).toString());return{sequence:r.sequence,ciphertext:value.frame.ciphertext};});
    return{...this.summary(job),count:job.next,chunks};}
  acknowledge(id,user,fp,sequence,digest){this.authorize(id,user,fp);if(!Number.isSafeInteger(sequence)||sequence<0)fail(400,'Invalid acknowledgement');const row=database().prepare('SELECT payload FROM trusted_chunks WHERE generation=? AND sequence=?').get(id,sequence);
    if(!row||hash(JSON.parse(unseal(row.payload,`trusted-chunk:${id}:${sequence}`).toString()).frame.ciphertext)!==digest)fail(409,'Acknowledgement mismatch');
    database().prepare('INSERT INTO trusted_acks VALUES(?,?,?) ON CONFLICT(generation,device) DO UPDATE SET sequence=max(sequence,excluded.sequence)').run(id,fp,sequence);return{acknowledged:sequence};}
  async cancel(id,user,fp){const job=this.authorize(id,user,fp);if(job.owner!==user.username)fail(403,'Only the owner can cancel');if(running(job.state)){job.state='cancelled';putRecord('trusted-generations',id,job);}await this.client.request('/cancel',{id}).catch(()=>{});return{state:job.state};}
  launch(id){if(this.polling.has(id)||this.closed)return;const done=this.poll(id).finally(()=>this.polling.delete(id));this.polling.set(id,done);}
  async poll(id){
    while(!this.closed){const job=this.get(id);if(!job||!running(job.state))return;
      try{
        this.validate(job);await this.client.request('/renew',{id});
        // Include the last committed sequence to recover a crash between local commit and worker ACK.
        const response=await this.client.request('/read',{id,after:Math.max(-1,job.next-2)});
        if(response.manifest.id!==id||response.manifest.owner!==job.owner||response.manifest.worker!==job.worker)throw new Error('Worker context mismatch');
        for(const chunk of response.chunks){await this.commit(id,chunk);await this.client.request('/accept',{id,sequence:chunk.frame.sequence,digest:hash(chunk.frame.ciphertext)});}
        const current=this.get(id);if(current&&running(current.state)&&!running(response.state)&&current.next===response.count){current.state='interrupted';putRecord('trusted-generations',id,current);}
      }catch(error){
        const current=this.get(id);if(!current)return;
        let revoked=false;try{this.validate(current);}catch{revoked=true;}
        if(revoked||[400,404,409,429].includes(error.status)||error.code==='ERR_SQLITE_ERROR'){try{if(running(current.state)){current.state='interrupted';putRecord('trusted-generations',id,current);}}finally{await this.client.request('/cancel',{id}).catch(()=>{});}return;}
        // Transport loss may recover while the worker lease remains valid; never replay /jobs.
      }
      await new Promise(resolve=>setTimeout(resolve,250));
    }
  }
  async commit(id,chunk){
    const job=this.get(id),{frame,signature}=chunk;if(!job)fail(404,'Generation unavailable');
    if(!frame||frame.v!==2||frame.id!==id||frame.owner!==job.owner||frame.worker!==job.worker||!Number.isSafeInteger(frame.sequence)||!['delta','complete'].includes(frame.kind)||typeof frame.ciphertext!=='string'||frame.ciphertext.length>100000)fail(400,'Invalid worker frame');
    try{await recipient.verify(job.workerPublicKey,JSON.stringify(frame),signature);}catch{fail(400,'Worker signature verification failed');}
    transaction(()=>{
      const current=this.get(id);this.validate(current);
      if(frame.sequence<current.next){const old=database().prepare('SELECT payload FROM trusted_chunks WHERE generation=? AND sequence=?').get(id,frame.sequence);if(!old||JSON.parse(unseal(old.payload,`trusted-chunk:${id}:${frame.sequence}`).toString()).frame.ciphertext!==frame.ciphertext)fail(409,'Conflicting worker replay');return;}
      if(!running(current.state)||frame.sequence!==current.next||frame.previous!==current.previous)fail(409,'Missing or reordered worker frame');
      const payload=seal(JSON.stringify(chunk),`trusted-chunk:${id}:${frame.sequence}`),bytes=Buffer.byteLength(payload);
      if(current.next>=512||current.bytes+bytes>8*1024*1024||this.jobs().reduce((sum,j)=>sum+j.bytes,0)+bytes>256*1024*1024)fail(429,'Encrypted queue quota reached');
      database().prepare('INSERT INTO trusted_chunks VALUES(?,?,?)').run(id,frame.sequence,payload);
      current.next++;current.previous=hash(frame.ciphertext);current.bytes+=bytes;if(frame.kind==='complete')current.state='complete';putRecord('trusted-generations',id,current);
    });
  }
  cleanup(){for(const job of this.jobs())if(job.expires<=Date.now()||!readUser(job.owner)){transaction(()=>{database().prepare('DELETE FROM trusted_chunks WHERE generation=?').run(job.id);database().prepare('DELETE FROM trusted_acks WHERE generation=?').run(job.id);removeRecord('trusted-generations',job.id);});this.client.request('/cancel',{id:job.id}).catch(()=>{});}}
  async close(){this.closed=true;clearInterval(this.timer);await Promise.all([...this.polling.values()]);}
}
