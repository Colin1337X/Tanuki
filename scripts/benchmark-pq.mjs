import {performance} from 'node:perf_hooks';import {randomBytes} from 'node:crypto';
import {nativePrimitives} from '../server/lib/pq-primitives.js';import {browserPrimitives} from '../public/assets/pq-primitives.js';
const seed=randomBytes(64),signSeed=randomBytes(32),message=randomBytes(2048),results=[];
async function measure(name,n,fn){for(let i=0;i<3;i++)await fn();const start=performance.now();for(let i=0;i<n;i++)await fn();results.push({name,iterations:n,msPerOperation:+((performance.now()-start)/n).toFixed(3)});}
for(const[name,p]of[['Native OpenSSL / Rust',nativePrimitives],['Browser Noble / WASM',browserPrimitives]]){
  const key=await p.keypair(seed,signSeed),enc=await p.encapsulate(key.kemPublic),sig=await p.sign(message,key);
  await measure(name+' ML-KEM-1024 encapsulate',100,()=>p.encapsulate(key.kemPublic));
  await measure(name+' ML-KEM-1024 decapsulate',100,()=>p.decapsulate(enc.cipherText,key));
  await measure(name+' ML-DSA-87 sign',100,()=>p.sign(message,key));
  await measure(name+' ML-DSA-87 verify',100,()=>p.verify(sig,message,key.signPublic));
  await measure(name+' Argon2id 64 MiB t=3 p=1',3,()=>p.password('synthetic benchmark secret',seed.subarray(0,32)));
}
console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,scope:'Same-machine primitive comparison in Node; browser engine/device performance and all available third-party implementations are not measured.',results},null,2));
