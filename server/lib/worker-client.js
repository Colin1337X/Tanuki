import https from 'node:https';
import fs from 'node:fs';
import { recipient } from './recipient-crypto.js';

export class WorkerClient {
  constructor(env=process.env){
    this.url=new URL(env.TANUKI_WORKER_URL);if(this.url.protocol!=='https:'||this.url.username||this.url.password||this.url.pathname!=='/')throw new Error('Worker endpoint requires a dedicated HTTPS origin');
    this.fingerprint=env.TANUKI_WORKER_FINGERPRINT;if(!/^[a-f0-9]{64}$/.test(this.fingerprint||''))throw new Error('Pin the processing worker identity');
    if(process.platform==='linux'){const stat=fs.statSync(env.TANUKI_WORKER_CLIENT_KEY);if(stat.uid!==process.getuid()||(stat.mode&0o077)!==0)throw new Error('Worker client credential requires exclusive API-owner permissions');}
    this.tls={ca:fs.readFileSync(env.TANUKI_WORKER_CA),cert:fs.readFileSync(env.TANUKI_WORKER_CLIENT_CERT),key:fs.readFileSync(env.TANUKI_WORKER_CLIENT_KEY),minVersion:'TLSv1.3',rejectUnauthorized:true};
  }
  request(route,body){return new Promise((resolve,reject)=>{
    const bytes=body===undefined?null:Buffer.from(JSON.stringify(body));
    const request=https.request(new URL(route,this.url),{...this.tls,method:bytes?'POST':'GET',headers:bytes?{'Content-Type':'application/json','Content-Length':bytes.length}:{},timeout:10000},response=>{
      let size=0;const chunks=[];response.on('data',chunk=>{size+=chunk.length;if(size>2*1024*1024)response.destroy(new Error('Worker response limit'));else chunks.push(chunk);});response.on('error',reject);
      response.on('end',()=>{try{if(response.statusCode!==200)throw Object.assign(new Error('Trusted worker unavailable or rejected operation'),{status:response.statusCode});resolve(JSON.parse(Buffer.concat(chunks).toString()));}catch(error){reject(error);}});
    });request.on('error',reject);request.on('timeout',()=>request.destroy(new Error('Worker request timeout')));request.end(bytes);
  });}
  async identity(){const identity=await this.request('/identity');if(identity.v!==2||identity.fingerprint!==this.fingerprint||(await recipient.publicKey(identity.publicKey)).getFingerprint()!==this.fingerprint)throw new Error('Worker identity changed');return identity;}
}
