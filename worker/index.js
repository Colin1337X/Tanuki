import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
import {postQuantumRecipient} from '../public/assets/pq-recipient.js';
import {nativePrimitives} from '../server/lib/pq-primitives.js';
import { TrustedWorker } from './engine.js';

const cleanFingerprint=value=>String(value||'').replace(/:/g,'').toLowerCase();
export function deploymentConfig(env=process.env) {
  if(process.platform!=='linux'||process.getuid()===0)throw new Error('Worker requires a dedicated non-root Linux identity');
  const uid=Number(env.TANUKI_WORKER_UID),apiUid=Number(env.TANUKI_API_UID);
  if(!Number.isSafeInteger(uid)||!Number.isSafeInteger(apiUid)||uid!==process.getuid()||uid===apiUid)throw new Error('Worker and API identities must be explicit and distinct');
  for(const name of ['TANUKI_DATA_DIR','TANUKI_KEYRING_FILE','ADMIN_PASSWORD','ADMIN_USERNAME','OPENAI_API_KEY','TANUKI_WORKER_CLIENT_KEY'])if(env[name])throw new Error('Application secrets must not enter worker environment');
  const limits=fs.readFileSync('/proc/self/limits','utf8');
  if(!/^Max core file size\s+0\s+0\s+/m.test(limits))throw new Error('Disable worker core dumps before startup');
  const data=path.resolve(env.TANUKI_WORKER_DATA_DIR||'');
  if(!env.TANUKI_WORKER_DATA_DIR||!fs.existsSync(data))throw new Error('Provision the worker data directory');
  for(const file of [data,env.TANUKI_WORKER_KEY_FILE,env.TANUKI_WORKER_TLS_KEY]) {
    const stat=fs.statSync(file);if(stat.uid!==uid||(stat.mode&0o077)!==0)throw new Error('Worker private paths require exclusive owner permissions');
  }
  const provider=new URL(env.TANUKI_WORKER_PROVIDER_URL||'https://api.openai.com/v1');
  if(provider.username||provider.password||provider.hash||(provider.protocol!=='https:'&&!(env.TANUKI_WORKER_ALLOW_HTTP_LOOPBACK==='1'&&provider.protocol==='http:'&&['127.0.0.1','[::1]'].includes(provider.hostname))))throw new Error('Worker provider requires approved HTTPS');
  const clientFingerprint=cleanFingerprint(env.TANUKI_WORKER_API_CERT_SHA256);
  if(!/^[a-f0-9]{64}$/.test(clientFingerprint))throw new Error('Pin the API client certificate fingerprint');
  return {data,providerURL:provider.href,clientFingerprint,keyFile:env.TANUKI_WORKER_KEY_FILE,
    tlsKey:env.TANUKI_WORKER_TLS_KEY,tlsCert:env.TANUKI_WORKER_TLS_CERT,tlsCA:env.TANUKI_WORKER_TLS_CA,
    port:Number(env.TANUKI_WORKER_PORT||3101),apiKey:env.TANUKI_WORKER_PROVIDER_KEY,model:env.TANUKI_WORKER_MODEL||'gpt-4o-mini'};
}
export async function createWorkerServer(config) {
  const key=await postQuantumRecipient(nativePrimitives).readProcessingKey(fs.readFileSync(config.keyFile,'utf8'));
  // An operator-owned immutable origin; jobs cannot specify endpoints or credentials.
  process.env.OPENAI_BASE_URL=config.providerURL;delete process.env.AI_ALLOWED_ORIGINS;
  const worker=new TrustedWorker({databasePath:path.join(config.data,'queue.sqlite'),key,providerURL:config.providerURL,apiKey:config.apiKey,model:config.model,
    audit:event=>process.stdout.write(JSON.stringify(event)+'\n')});
  const server=https.createServer({key:fs.readFileSync(config.tlsKey),cert:fs.readFileSync(config.tlsCert),ca:fs.readFileSync(config.tlsCA),requestCert:true,rejectUnauthorized:true,minVersion:'TLSv1.3'},async(req,res)=>{
    res.setHeader('Cache-Control','no-store, private');res.setHeader('Content-Type','application/json');
    try {
      if(!req.socket.authorized||cleanFingerprint(req.socket.getPeerCertificate().fingerprint256)!==config.clientFingerprint)throw Object.assign(new Error('Unauthorized service'),{status:403});
      const url=new URL(req.url,'https://worker.invalid');
      if(req.method==='GET'&&url.pathname==='/identity'){res.end(JSON.stringify({v:2,publicKey:worker.publicKey,fingerprint:worker.fingerprint}));return;}
      if(req.method!=='POST'||req.headers['content-type']!=='application/json')throw Object.assign(new Error('Unsupported worker operation'),{status:405});
      let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>256000)throw Object.assign(new Error('Worker request too large'),{status:413});chunks.push(chunk);}
      const body=JSON.parse(Buffer.concat(chunks).toString());let result;
      if(url.pathname==='/jobs')result=await worker.start(body);
      else {if(!/^[a-f0-9-]{36}$/.test(body.id||''))throw Object.assign(new Error('Invalid generation'),{status:400});
        if(url.pathname==='/read')result=worker.read(body.id,body.after??-1);
        else if(url.pathname==='/renew')result=worker.renew(body.id);
        else if(url.pathname==='/accept')result=worker.accept(body.id,body.sequence,body.digest);
        else if(url.pathname==='/cancel')result=worker.cancel(body.id);
        else throw Object.assign(new Error('Unknown worker operation'),{status:404});}
      res.end(JSON.stringify(result));
    }catch(error){res.statusCode=error.status||400;res.end(JSON.stringify({error:error.status?error.message:'Worker rejected request'}));}
  });
  server.requestTimeout=10000;server.headersTimeout=5000;server.maxConnections=32;
  return {server,worker,async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await worker.close();}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {const config=deploymentConfig(),service=await createWorkerServer(config);
    service.server.listen(config.port,'127.0.0.1',()=>console.log(JSON.stringify({event:'worker_ready',port:service.server.address().port,fingerprint:service.worker.fingerprint})));
    for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await service.close();process.exit(0);});
  }catch{console.error('Trusted worker startup failed; verify identity, permissions, resource limits and configuration.');process.exitCode=1;}
}
