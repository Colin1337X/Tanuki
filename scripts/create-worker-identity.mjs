import fs from 'node:fs';import path from 'node:path';import {randomBytes} from 'node:crypto';import {recipient} from '../server/lib/recipient-crypto.js';
if(!process.argv[2])throw new Error('Usage: node scripts/create-worker-identity.mjs /secure/new-worker-identity');
const prefix=path.resolve(process.argv[2]),privateFile=prefix+'.private.asc',publicFile=prefix+'.public.asc';
if(fs.existsSync(privateFile)||fs.existsSync(publicFile))throw new Error('Refusing to replace an existing processing identity');
fs.mkdirSync(path.dirname(prefix),{recursive:true,mode:0o700});const secret=randomBytes(32).toString('hex'),generated=await recipient.generate(secret),key=await recipient.unlock(generated.privateKey,secret);
fs.writeFileSync(privateFile,key.armor(),{flag:'wx',mode:0o600});fs.writeFileSync(publicFile,generated.publicKey,{flag:'wx',mode:0o644});
console.log(JSON.stringify({fingerprint:key.getFingerprint(),publicFile,notice:'Restrict the processing private key to the dedicated worker identity. Publish and independently verify the public fingerprint.'}));
