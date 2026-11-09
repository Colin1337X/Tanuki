import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {randomBytes,webcrypto,hkdfSync,createHash} from 'node:crypto';
import {hkdf} from '@noble/hashes/hkdf.js';import {sha512} from '@noble/hashes/sha2.js';
import {ml_dsa87} from '@noble/post-quantum/ml-dsa.js';
import {nativePrimitives} from '../../server/lib/pq-primitives.js';
import {browserPrimitives} from '../../public/assets/pq-primitives.js';
import {postQuantumRecipient,SUITE} from '../../public/assets/pq-recipient.js';
import {recipient} from '../../server/lib/recipient-crypto.js';
import {recipientCrypto} from '../../public/assets/recipient-crypto.js';import * as pgp from 'openpgp';
import {isolate,provisionKeys} from './helpers.js';
isolate();await provisionKeys();
const {seal,unseal}=await import('../../server/lib/crypto.js');
const {seal:legacySeal}=await import('../fixtures/storage-v1.js');
const browser=postQuantumRecipient(browserPrimitives,recipientCrypto(pgp)),secret=randomBytes(32).toString('hex');
const pair=await recipient.generate(secret),key=await recipient.unlock(pair.privateKey,secret),browserKey=await browser.unlock(pair.privateKey,secret);
const other=await browser.generate(secret),otherKey=await recipient.unlock(other.privateKey,secret),context={generation:'synthetic',owner:'alice',sequence:0,previous:''},value={...context,text:'Confidential synthetic test'};
const encrypted=await recipient.encrypt([pair.publicKey,other.publicKey],value,key);
test('New recipient identities use independent ML-KEM-1024 and ML-DSA-87 keys',()=>{const p=JSON.parse(pair.publicKey);assert.equal(p.suite,SUITE);assert.equal(Buffer.from(p.kem,'base64').length,1568);assert.equal(Buffer.from(p.sign,'base64').length,2592);assert.notEqual(p.kem,p.sign);});
test('Native and browser implementations interoperate in both directions for multi-recipient signed content',async()=>{
  for(const [box,k]of[[recipient,key],[browser,browserKey]]){const cipher=await box.encrypt([pair.publicKey,other.publicKey],value,k);assert.deepEqual(await recipient.decrypt(otherKey,cipher,context,pair.publicKey),value);assert.deepEqual(await browser.decrypt(browserKey,cipher,context,pair.publicKey),value);}
});
test('Browser-generated encrypted backup unlocks natively with identical public identity',async()=>{assert.equal(otherKey.toPublic().armor(),other.publicKey);const backup=JSON.parse(other.privateKey);assert.deepEqual([backup.kdf,backup.memory,backup.passes,backup.parallelism],['Argon2id',65536,3,1]);await assert.rejects(recipient.unlock(other.privateKey,'0'.repeat(64)));});
test('Backup parameter injection is rejected before expensive key derivation',async()=>{for(const patch of[{memory:2**30},{passes:0},{parallelism:64},{suite:'downgrade'},{v:1}])await assert.rejects(recipient.unlock(JSON.stringify({...JSON.parse(pair.privateKey),...patch}),secret));});
test('Backup ciphertext, salt, nonce and fingerprint substitution fail closed',async()=>{for(const field of['data','salt','nonce','fingerprint']){const obj=JSON.parse(pair.privateKey);obj[field]=(obj[field][0]==='A'?'B':'A')+obj[field].slice(1);await assert.rejects(recipient.unlock(JSON.stringify(obj),secret));}});
test('PQ public-key pin compares actual bytes; private seeds cannot be enrolled as public keys',async()=>{await assert.rejects(recipient.publicKey(other.publicKey,key.getFingerprint()),/fingerprint/);await assert.rejects(recipient.publicKey(key.armor()));});
test('PQ signatures reject another signer, message mutation and truncated signature',async()=>{const s=await recipient.sign(key,'message');await recipient.verify(pair.publicKey,'message',s);await assert.rejects(recipient.verify(other.publicKey,'message',s));await assert.rejects(recipient.verify(pair.publicKey,'changed',s));const bad=JSON.parse(s);bad.signature=bad.signature.slice(0,-4);await assert.rejects(recipient.verify(pair.publicKey,'message',JSON.stringify(bad)));});
test('PQ signed envelopes reject metadata, wrapped key and content tampering',async()=>{for(const field of['id','nonce','data','suite','signer']){const obj=JSON.parse(encrypted);obj[field]=(obj[field][0]==='A'?'B':'A')+obj[field].slice(1);await assert.rejects(recipient.decrypt(key,JSON.stringify(obj),context,pair.publicKey));}const obj=JSON.parse(encrypted),original=obj.recipients[0].wrapped;obj.recipients[0].wrapped=(original[0]==='A'?'B':'A')+original.slice(1);assert.notEqual(obj.recipients[0].wrapped,original);await assert.rejects(recipient.decrypt(key,JSON.stringify(obj),context,pair.publicKey));});
test('Unsigned envelopes cannot bypass expected sender verification',async()=>{const cipher=await recipient.encrypt([pair.publicKey],value);await assert.rejects(recipient.decrypt(key,cipher,context,pair.publicKey));});
test('Unsigned envelope AEAD independently binds KEM, recipient set and payload without relying on a signature',async()=>{
  const cipher=await recipient.encrypt([pair.publicKey,other.publicKey],value);
  for(const field of['kem','salt','nonce','wrapped']){const obj=JSON.parse(cipher),entry=obj.recipients.find(r=>r.fp===key.getFingerprint());entry[field]=(entry[field][0]==='A'?'B':'A')+entry[field].slice(1);await assert.rejects(recipient.decrypt(key,JSON.stringify(obj),context));}
  const obj=JSON.parse(cipher);obj.recipients=obj.recipients.filter(r=>r.fp===key.getFingerprint());await assert.rejects(recipient.decrypt(key,JSON.stringify(obj),context));
});
test('PQ envelopes reject reordered and duplicate recipients, unknown fields and noncanonical base64',async()=>{for(const change of[obj=>obj.recipients.reverse(),obj=>obj.recipients.push(obj.recipients[0]),obj=>obj.extra=true,obj=>obj.nonce+='\n']){const obj=JSON.parse(encrypted);change(obj);await assert.rejects(recipient.decrypt(key,JSON.stringify(obj),context,pair.publicKey));}});
test('Public-only keys and wrong context cannot decrypt or release response text',async()=>{await assert.rejects(recipient.decrypt(await recipient.publicKey(pair.publicKey),encrypted,context,pair.publicKey));await assert.rejects(recipient.decrypt(key,encrypted,{...context,owner:'bob'},pair.publicKey),/context mismatch/);});
test('New encryption refuses legacy or mixed recipients without silently falling back',async()=>{const legacy=recipientCrypto(pgp),p=await legacy.generate(secret);await assert.rejects(recipient.encrypt([p.publicKey],value));await assert.rejects(recipient.encrypt([p.publicKey,pair.publicKey],value));const k=await legacy.unlock(p.privateKey,secret),old=await legacy.encrypt([p.publicKey],value,k);const recovered=await recipient.unlock(p.privateKey,secret);assert.deepEqual(await recipient.decrypt(recovered,old,context,p.publicKey),value);});
test('Storage v2 signs with ML-DSA-87 and retains authenticated v1 read compatibility',()=>{const legacy=legacySeal('old data','context');assert.equal(unseal(legacy,'context').toString(),'old data');const current=seal('new data','context'),obj=JSON.parse(current);assert.equal(obj.v,2);assert.equal(Buffer.from(obj.sig,'base64').length,4627);assert.equal(unseal(current,'context').toString(),'new data');delete obj.sig;assert.throws(()=>unseal(JSON.stringify(obj),'context',{allowLegacy:true}));});
test('Changing storage v2 version cannot select the legacy derivation or omit authentication',()=>{const obj=JSON.parse(seal('secret','context'));obj.v=1;assert.throws(()=>unseal(JSON.stringify(obj),'context'));delete obj.mac;assert.throws(()=>unseal(JSON.stringify(obj),'context',{allowLegacy:true}));});
test('HKDF-SHA-512 primitive agrees between browser and native with a long bound context',()=>{const ikm=randomBytes(32),salt=randomBytes(32),info=randomBytes(6000);assert.deepEqual(Buffer.from(browserPrimitives.derive(ikm,salt,info)),Buffer.from(nativePrimitives.derive(ikm,salt,info)));});
for(const v of JSON.parse(fs.readFileSync('tests/fixtures/hkdf-sha512.json')).tests)test(`Wycheproof HKDF-SHA-512 tcId ${v.tcId} derives exact reference bytes`,()=>{
  const h=x=>Buffer.from(x,'hex');assert.equal(Buffer.from(hkdfSync('sha512',h(v.ikm),h(v.salt),h(v.info),v.size)).toString('hex'),v.okm);
  assert.equal(Buffer.from(hkdf(sha512,h(v.ikm),h(v.salt),h(v.info),v.size)).toString('hex'),v.okm);
});
test('Vendored browser crypto bytes match their recorded upstream inputs and rewritten output',()=>{
  const manifest=JSON.parse(fs.readFileSync('public/assets/vendor/pq/manifest.json')),hash=b=>createHash('sha256').update(b).digest('hex');
  assert.equal(Object.keys(manifest).length,19);for(const[file,entry]of Object.entries(manifest)){assert.equal(hash(fs.readFileSync('node_modules/'+entry.source)),entry.sourceSha256,file);assert.equal(hash(fs.readFileSync('public/assets/vendor/pq/'+file)),entry.publishedSha256,file);}
});
const vectors=JSON.parse(fs.readFileSync('tests/fixtures/ml-dsa-87.json'));
for(const v of vectors.tests)test(`NIST FIPS204 ML-DSA-87 external sigVer tcId ${v.tcId}: ${v.reason}`,async()=>{
  const hex=x=>Buffer.from(x,'hex'),pk=hex(v.pk),signature=hex(v.signature),message=hex(v.message),context=hex(v.context);
  const imported=await webcrypto.subtle.importKey('raw-public',pk,'ML-DSA-87',false,['verify']);
  assert.equal(await webcrypto.subtle.verify({name:'ML-DSA-87',context},imported,signature,message),v.testPassed);
  assert.equal(ml_dsa87.verify(signature,message,pk,{context}),v.testPassed);
});
