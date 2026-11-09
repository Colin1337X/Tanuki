import test,{after} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {argon2Sync,createPrivateKey,createPublicKey,encapsulate,decapsulate,randomBytes} from 'node:crypto';
import {gcmsiv} from '@noble/ciphers/aes.js';import {isolate,provisionKeys} from './helpers.js';
isolate();await provisionKeys();
const {seal,unseal,loadKeyring,reloadKeyring,generateKeyring}=await import('../../server/lib/crypto.js');
const {hashPassword,verifyPassword,validCredentials}=await import('../../server/lib/passwords.js');
const hex=s=>Buffer.from(s,'hex');const key=hex('01'+'00'.repeat(31));const nonce=hex('03'+'00'.repeat(11));
// RFC 8452 Appendix C.2, first four AES-256-GCM-SIV reference cases.
const vectors=[['','07f5f4169bbf55a8400cd47ea6fd400f'],['0100000000000000','c2ef328e5c71c83b843122130f7364b761e0b97427e3df28'],['010000000000000000000000','9aab2aeb3faa0a34aea8e2b18ca50da9ae6559e48fd10f6e5c9ca17e'],['01000000000000000000000000000000','85a01b63025ba19b7fd3ddfc033b3e76c9eac6fa700942702e90862383c6c366']];
for(const [i,[plain,result]] of vectors.entries()){
 test(`RFC8452 C.2 vector ${i+1}: exact ciphertext and authentication tag`,()=>assert.equal(Buffer.from(gcmsiv(key,nonce).encrypt(hex(plain))).toString('hex'),result));
 test(`RFC8452 C.2 vector ${i+1}: authenticated decryption`,()=>assert.equal(Buffer.from(gcmsiv(key,nonce).decrypt(hex(result))).toString('hex'),plain));
 test(`RFC8452 C.2 vector ${i+1}: modified tag rejected`,()=>{const changed=hex(result);changed[changed.length-1]^=1;assert.throws(()=>gcmsiv(key,nonce).decrypt(changed));});
}
function der(tag,data){const n=data.length;return Buffer.concat([Buffer.from([tag,...(n<128?[n]:n<256?[129,n]:[130,n>>8,n&255])]),data]);}
const kemVectors=JSON.parse(fs.readFileSync(new URL('../fixtures/ml-kem-1024.json',import.meta.url)));
for(const [i,v] of kemVectors.entries())test(`NIST ACVP/OpenSSL ML-KEM-1024 decapsulation vector ${i+1}`,()=>{const encoded=der(0x30,Buffer.concat([hex('020100300b0609608648016503040403'),der(4,der(4,hex(v.EncodedPrivateKey)))]));const privateKey=createPrivateKey({key:encoded,type:'pkcs8',format:'der'});assert.equal(decapsulate(privateKey,hex(v.Input)).toString('hex'),v.Output.toLowerCase());});
for(const length of [0,1,15,16,17,31,32,33,255,4096,65536])test(`Encrypted envelope preserves ${length} binary bytes`,()=>{const plaintext=Buffer.alloc(length,0xab);const encrypted=seal(plaintext,'fixture');assert.deepEqual(unseal(encrypted,'fixture'),plaintext);assert.equal(JSON.parse(encrypted).v,2);});
for(const field of ['data','kem','nonce'])test(`Envelope rejects bit-flipped ${field}`,()=>{const value=JSON.parse(seal('private story','story:alice'));const changed=Buffer.from(value[field],'base64');changed[Math.floor(changed.length/2)]^=1;value[field]=changed.toString('base64');assert.throws(()=>unseal(JSON.stringify(value),'story:alice'));});
for(const context of ['story:bob','users:alice','story:alice\0','', 'story:ALICE'])test(`Envelope prevents record substitution into ${JSON.stringify(context)}`,()=>assert.throws(()=>unseal(seal('secret','story:alice'),context)));
for(const field of ['v','kid','kem','nonce','data'])test(`Envelope rejects missing ${field}`,()=>{const value=JSON.parse(seal('secret','test'));delete value[field];assert.throws(()=>unseal(JSON.stringify(value),'test'));});
for(const invalid of ['', '{}','null','[]','{','{"v":2}'])test(`Malformed envelope ${JSON.stringify(invalid)} fails closed`,()=>assert.throws(()=>unseal(invalid,'test')));
test('Repeated encryption uses distinct nonces and KEM ciphertexts',()=>{const a=JSON.parse(seal('same','test'));const b=JSON.parse(seal('same','test'));assert.notEqual(a.nonce,b.nonce);assert.notEqual(a.kem,b.kem);assert.notEqual(a.data,b.data);});
test('Unknown key ID cannot silently decrypt',()=>{const value=JSON.parse(seal('secret','test'));value.kid='missing';assert.throws(()=>unseal(JSON.stringify(value),'test'),/missing/);});
test('ML-KEM native round-trip produces 32-byte shared secret and 1568-byte ciphertext',()=>{const ring=loadKeyring();const pair=ring.keys.get(ring.active);const value=encapsulate(pair.publicKey);assert.equal(value.sharedKey.length,32);assert.equal(value.ciphertext.length,1568);assert.deepEqual(decapsulate(pair.privateKey,value.ciphertext),value.sharedKey);});
test('ML-KEM implicit rejection does not yield legitimate shared secret',()=>{const ring=loadKeyring();const pair=ring.keys.get(ring.active);const value=encapsulate(pair.publicKey);value.ciphertext[0]^=1;assert.notDeepEqual(decapsulate(pair.privateKey,value.ciphertext),value.sharedKey);});
test('Keyring rejects mismatched native public/private keys',()=>{const file=process.env.TANUKI_KEYRING_FILE;const original=fs.readFileSync(file);const a=generateKeyring(),b=generateKeyring();a.keys[a.active].publicKey=b.keys[b.active].publicKey;fs.writeFileSync(file,JSON.stringify(a));try{assert.throws(reloadKeyring,/Mismatched/);}finally{fs.writeFileSync(file,original);reloadKeyring();}});
const encoded=hashPassword('a meaningful test password');
test('Passwords use Argon2id v19, 64 MiB, three passes, one lane',()=>assert.match(encoded,/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/));
test('Argon2id PHC output agrees with independent native OpenSSL implementation',()=>{const parts=encoded.split('$');const salt=Buffer.from(parts[4],'base64');const expected=argon2Sync('argon2id',{message:'a meaningful test password',nonce:salt,parallelism:1,tagLength:32,memory:65536,passes:3});assert.deepEqual(Buffer.from(parts[5],'base64'),expected);});
test('Argon2id unique salt for each password hash',()=>assert.notEqual(hashPassword('a meaningful test password'),encoded));
test('Argon2id correct password verifies',async()=>assert.equal(await verifyPassword(encoded,'a meaningful test password'),true));
for(const password of ['wrong','A meaningful test password','a meaningful test password ','','\0','🙂'])test(`Argon2id rejects incorrect ${JSON.stringify(password)} password`,async()=>assert.equal(await verifyPassword(encoded,password),false));
for(const password of ['한글 암호와 공백 123','pass\0word is preserved','e\u0301 and é differ'])test(`Argon2id preserves exact UTF-8 password ${JSON.stringify(password)}`,async()=>{const result=hashPassword(password);assert.equal(await verifyPassword(result,password),true);assert.equal(await verifyPassword(result,password+'x'),false);});
for(const value of ['','bad hash','$argon2id$','scrypt:123'])test(`Malformed password hash ${JSON.stringify(value)} is rejected`,async()=>assert.equal(await verifyPassword(value,'password'),false));
for(const username of ['', '../alice','alice bob','__proto__','<script>','a'.repeat(65)])test(`Account validation rejects username ${JSON.stringify(username)}`,()=>assert.equal(validCredentials(username,'sufficiently long password'),false));
for(const password of ['', 'short', 'x'.repeat(11),'x'.repeat(1025),null,123])test(`Account validation rejects password shape ${typeof password}:${String(password).length}`,()=>assert.equal(validCredentials('alice',password),false));
test('Maximum allowed credentials are accepted',()=>assert.equal(validCredentials('a'.repeat(64),'x'.repeat(1024)),true));
test('Hashing non-string input is rejected',()=>assert.throws(()=>hashPassword({password:'test'})));
