// Operator-only setup for synthetic WSL fixtures. Never points at an existing deployment.
import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {randomBytes} from 'node:crypto';
import {certificates} from '../../tests/node/worker-fixture.js';
import {recipient} from '../../server/lib/recipient-crypto.js';
if(process.platform!=='linux'||process.getuid()!==0)throw new Error('Fixture provisioning requires the Linux operator identity');
const [bundle,workerUidText,apiUidText]=process.argv.slice(2),workerUid=Number(workerUidText),apiUid=Number(apiUidText);
if(!Number.isSafeInteger(workerUid)||!Number.isSafeInteger(apiUid)||workerUid<=0||apiUid<=0||workerUid===apiUid)throw new Error('Distinct non-root test identities required');
const gid=uid=>{const r=spawnSync('getent',['passwd',String(uid)],{encoding:'utf8'});if(r.status!==0)throw new Error('Provision test identity first');return Number(r.stdout.split(':')[3]);};
const workerGid=gid(workerUid),apiGid=gid(apiUid),root=fs.mkdtempSync('/var/lib/tanuki-worker-validation-');fs.chmodSync(root,0o755);
for(const name of ['app','worker-data','worker-keys','pki','code','bin'])fs.mkdirSync(path.join(root,name),{mode:name==='code'||name==='bin'?0o755:0o700});
fs.cpSync(path.resolve(bundle),path.join(root,'code'),{recursive:true});fs.copyFileSync(process.execPath,path.join(root,'bin/node'));fs.chmodSync(path.join(root,'bin/node'),0o755);
const tls=certificates(path.join(root,'pki'));
const secret=randomBytes(32).toString('hex'),pair=await recipient.generate(secret),key=await recipient.unlock(pair.privateKey,secret);
const workerKey=path.join(root,'worker-keys/processing.asc');fs.writeFileSync(workerKey,key.armor(),{mode:0o600});
fs.copyFileSync(tls.worker.key,path.join(root,'worker-keys/tls.key'));fs.copyFileSync(tls.worker.cert,path.join(root,'worker.crt'));fs.copyFileSync(tls.ca,path.join(root,'ca.crt'));
for(const name of ['client','unapproved'])for(const ext of ['key','cert'])fs.copyFileSync(tls[name][ext],path.join(root,'app',name+'.'+(ext==='cert'?'crt':'key')));
fs.writeFileSync(path.join(root,'app/auth-canary.txt'),'SYNTHETIC_UNRELATED_AUTH_RECORD',{mode:0o600});
const config={root,workerUid,apiUid,workerGid,apiGid,workerFingerprint:key.getFingerprint(),workerPublicKey:pair.publicKey,clientCertFingerprint:tls.client.fingerprint,
  apiKey:path.join(root,'app/client.key'),apiCert:path.join(root,'app/client.crt'),ca:path.join(root,'ca.crt'),workerKey,workerData:path.join(root,'worker-data')};
fs.writeFileSync(path.join(root,'app/config.json'),JSON.stringify(config),{mode:0o600});fs.writeFileSync(path.join(root,'setup.json'),JSON.stringify(config),{mode:0o600});
function ownership(dir,uid,gid){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())ownership(file,uid,gid);else fs.chownSync(file,uid,gid);}fs.chownSync(dir,uid,gid);}
ownership(path.join(root,'app'),apiUid,apiGid);ownership(path.join(root,'worker-data'),workerUid,workerGid);ownership(path.join(root,'worker-keys'),workerUid,workerGid);
fs.writeFileSync(path.join(root,'probe.mjs'),`import fs from 'node:fs';import http from 'node:http';
let authDenied=false,codeWriteDenied=false;try{fs.readFileSync(${JSON.stringify(path.join(root,'app/auth-canary.txt'))});}catch(e){authDenied=['EACCES','ENOENT','EPERM'].includes(e.code);}
try{fs.appendFileSync(${JSON.stringify(path.join(root,'code/worker/index.js'))},'');}catch(e){codeWriteDenied=['EACCES','EROFS','EPERM'].includes(e.code);}
const networkDenied=await new Promise(resolve=>{const r=http.get('http://127.0.0.2:'+process.env.TANUKI_TEST_FORBIDDEN_PORT,{timeout:700},response=>{response.resume();resolve(false);});r.on('error',()=>resolve(true));r.on('timeout',()=>r.destroy());});
const status=fs.readFileSync('/proc/self/status','utf8'),limits=fs.readFileSync('/proc/self/limits','utf8');
console.log(JSON.stringify({event:'isolation_probe',uid:process.getuid(),authDenied,codeWriteDenied,networkDenied,coreDisabled:/^Max core file size\\s+0\\s+/m.test(limits),noNewPrivileges:/^NoNewPrivs:\\s+1$/m.test(status),capabilitiesZero:/^CapEff:\\s+0+$/m.test(status)}));
if(!authDenied||!codeWriteDenied||!networkDenied)process.exitCode=1;`);
console.log(root);
