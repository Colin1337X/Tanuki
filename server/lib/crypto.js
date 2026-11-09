import { createHmac, timingSafeEqual, createPrivateKey, createPublicKey, generateKeyPairSync, encapsulate, decapsulate, randomBytes, hkdfSync, sign, verify } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { gcmsiv } from '@noble/ciphers/aes.js';
let keyring;
export function generateKeyring() {
  const { publicKey, privateKey } = generateKeyPairSync('ml-kem-1024');
  const signing = generateKeyPairSync('ml-dsa-87');
  const id = randomBytes(8).toString('hex');
  return { version: 1, active: id, keys: { [id]: {
    publicKey: publicKey.export({type:'spki',format:'pem'}),
    privateKey: privateKey.export({type:'pkcs8',format:'pem'}),
    signingPublicKey: signing.publicKey.export({type:'spki',format:'pem'}),
    signingPrivateKey: signing.privateKey.export({type:'pkcs8',format:'pem'}),
  } } };
}
export function loadKeyring() {
  if (keyring) return keyring;
  const file = process.env.TANUKI_KEYRING_FILE || path.resolve('.secrets/development-keyring.json');
  if (!existsSync(file)) {
    if (process.env.NODE_ENV === 'production' || process.env.TANUKI_KEYRING_FILE) throw new Error('Encryption keyring is missing. Run npm run keys:create -- /secure/path/keyring.json and set TANUKI_KEYRING_FILE.');
    mkdirSync(path.dirname(file), { recursive:true, mode:0o700 });
    writeFileSync(file, JSON.stringify(generateKeyring()), { mode:0o600, flag:'wx' });
  }
  const raw = JSON.parse(readFileSync(file,'utf8'));
  if (raw.version !== 1 || !raw.keys?.[raw.active]) throw new Error('Invalid encryption keyring');
  const keys = new Map();
  for (const [id,key] of Object.entries(raw.keys)) {
    const privateKey = createPrivateKey(key.privateKey);
    const publicKey = createPublicKey(key.publicKey);
    if (publicKey.asymmetricKeyType !== 'ml-kem-1024' || privateKey.asymmetricKeyType !== 'ml-kem-1024') throw new Error('ML-KEM-1024 keys required');
    if (!publicKey.export({type:'spki',format:'der'}).equals(createPublicKey(privateKey).export({type:'spki',format:'der'}))) throw new Error('Mismatched key pair');
    let signingPrivateKey,signingPublicKey;
    if(key.signingPrivateKey||key.signingPublicKey){
      signingPrivateKey=createPrivateKey(key.signingPrivateKey);signingPublicKey=createPublicKey(key.signingPublicKey);
      if(signingPrivateKey.asymmetricKeyType!=='ml-dsa-87'||signingPublicKey.asymmetricKeyType!=='ml-dsa-87'||!signingPublicKey.export({type:'spki',format:'der'}).equals(createPublicKey(signingPrivateKey).export({type:'spki',format:'der'})))throw new Error('Mismatched ML-DSA-87 signing key pair');
    }
    keys.set(id,{privateKey,publicKey,signingPrivateKey,signingPublicKey});
  }
  keyring = {active:raw.active,keys}; return keyring;
}
const b64 = value => Buffer.from(value).toString('base64');
const bytes = value => Buffer.from(value,'base64');
function derive(secret, nonce, aad, version=2) { return Buffer.from(hkdfSync(version===1?'sha256':'sha512',secret,nonce,aad,32)); }
// ML-KEM encryption alone does not authenticate the sender: public-key holders
// can encrypt. Retain a server-secret origin MAC alongside the v2 ML-DSA signature,
// using HMAC-SHA512 for v2 and HMAC-SHA256 only for legacy v1 reads, with
// a domain-separated HKDF key derived from server-held private key material.
function envelopeMac(value, entry) {
  const material=entry.privateKey.export({type:'pkcs8',format:'der'});
  const key=Buffer.from(hkdfSync(value.v===1?'sha256':'sha512',material,Buffer.alloc(0),Buffer.from(`tanuki-storage-authentication-v${value.v}`),value.v===1?32:64));
  try{return createHmac(value.v===1?'sha256':'sha512',key).update(JSON.stringify([value.v,value.kid,value.kem,value.nonce,value.data])).digest();}
  finally{key.fill(0);material.fill(0);}
}
export function seal(plaintext, context) {
  const ring = loadKeyring();
  const entry=ring.keys.get(ring.active);if(!entry.signingPrivateKey)throw new Error('Rotate the legacy keyring before new writes: ML-DSA-87 signing key required');
  const {sharedKey,ciphertext:kem} = encapsulate(ring.keys.get(ring.active).publicKey);
  const nonce = randomBytes(12);
  const aad = Buffer.from(`tanuki:v2:${ring.active}:${context}`);
  const key = derive(sharedKey,nonce,aad);
  try { const value={v:2,kid:ring.active,kem:b64(kem),nonce:b64(nonce),data:b64(gcmsiv(key,nonce,aad).encrypt(Buffer.from(plaintext)))};value.mac=envelopeMac(value,entry).toString('hex');value.sig=b64(sign(null,signatureInput(value,context),entry.signingPrivateKey));return JSON.stringify(value); }
  finally { key.fill(0);sharedKey.fill(0); }
}
export function unseal(envelope, context, {allowLegacy=false}={}) {
  const value = JSON.parse(envelope);
  if (!value||![1,2].includes(value.v) || typeof value.kid !== 'string' || typeof value.kem !== 'string' || typeof value.nonce !== 'string' || typeof value.data !== 'string') throw new Error('Invalid encrypted record');
  const entry = loadKeyring().keys.get(value.kid);
  if (!entry) throw new Error('Required decryption key is missing; restore the correct keyring');
  if(value.v===2&&(!entry.signingPublicKey||typeof value.sig!=='string'||bytes(value.sig).length!==4627||!verify(null,signatureInput(value,context),entry.signingPublicKey,bytes(value.sig))))throw new Error('Encrypted record signature authentication failed');
  if(value.mac===undefined&&allowLegacy&&value.v===1) { /* trusted offline upgrade only */ }
  else if(typeof value.mac!=='string'||!(value.v===1?/^[a-f0-9]{64}$/:/^[a-f0-9]{128}$/).test(value.mac)||!timingSafeEqual(Buffer.from(value.mac,'hex'),envelopeMac(value,entry)))throw new Error('Encrypted record origin authentication failed');
  const nonce = bytes(value.nonce); const kem = bytes(value.kem);
  if (nonce.length !== 12 || kem.length !== 1568) throw new Error('Invalid encryption parameters');
  const aad = Buffer.from(`tanuki:v${value.v}:${value.kid}:${context}`);
  const secret = decapsulate(entry.privateKey,kem); const key=derive(secret,nonce,aad,value.v);
  try { return Buffer.from(gcmsiv(key,nonce,aad).decrypt(bytes(value.data))); }
  finally {key.fill(0);secret.fill(0);}
}

export function reloadKeyring(){keyring=undefined;return loadKeyring();}
function signatureInput(value,context){return Buffer.from(JSON.stringify(['tanuki-storage-signature-v2','ML-KEM-1024/ML-DSA-87/HKDF-SHA-512/AES-256-GCM-SIV',context,value.v,value.kid,value.kem,value.nonce,value.data,value.mac]));}
