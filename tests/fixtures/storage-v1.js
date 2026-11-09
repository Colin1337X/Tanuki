// Genuine pre-migration wire-format fixture writer. Never imported by production code.
import {encapsulate,randomBytes,hkdfSync,createHmac} from 'node:crypto';
import {gcmsiv} from '@noble/ciphers/aes.js';
import {loadKeyring} from '../../server/lib/crypto.js';
export {unseal} from '../../server/lib/crypto.js';
export function seal(plaintext,context){
  const ring=loadKeyring(),entry=ring.keys.get(ring.active),{sharedKey,ciphertext}=encapsulate(entry.publicKey),nonce=randomBytes(12),aad=Buffer.from(`tanuki:v1:${ring.active}:${context}`);
  const key=Buffer.from(hkdfSync('sha256',sharedKey,nonce,aad,32)),value={v:1,kid:ring.active,kem:ciphertext.toString('base64'),nonce:nonce.toString('base64'),data:Buffer.from(gcmsiv(key,nonce,aad).encrypt(Buffer.from(plaintext))).toString('base64')};
  const material=entry.privateKey.export({type:'pkcs8',format:'der'}),macKey=Buffer.from(hkdfSync('sha256',material,Buffer.alloc(0),Buffer.from('tanuki-storage-authentication-v1'),32));
  value.mac=createHmac('sha256',macKey).update(JSON.stringify([value.v,value.kid,value.kem,value.nonce,value.data])).digest('hex');key.fill(0);sharedKey.fill(0);macKey.fill(0);material.fill(0);return JSON.stringify(value);
}
