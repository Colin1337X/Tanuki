import {ml_kem1024} from './vendor/pq/post-quantum/ml-kem.js';
import {ml_dsa87} from './vendor/pq/post-quantum/ml-dsa.js';
import {gcmsiv} from './vendor/pq/ciphers/aes.js';
import {hkdf} from './vendor/pq/hashes/hkdf.js';
import {sha512} from './vendor/pq/hashes/sha2.js';
import {argon2id} from './vendor/pq/argon2.mjs';

// Browser fallback for algorithms not widely available through WebCrypto.
// No JavaScript implementation of the cryptographic primitives is maintained here.
export const browserPrimitives={
  async keypair(kemSeed,signSeed){
    const kem=ml_kem1024.keygen(kemSeed),sig=ml_dsa87.keygen(signSeed);
    return {kemPublic:kem.publicKey,signPublic:sig.publicKey,kemPrivate:kem.secretKey,signPrivate:sig.secretKey};
  },
  async encapsulate(publicKey){return ml_kem1024.encapsulate(publicKey);},
  async decapsulate(ciphertext,key){return ml_kem1024.decapsulate(ciphertext,key.kemPrivate);},
  async sign(message,key){return ml_dsa87.sign(message,key.signPrivate);},
  async verify(signature,message,publicKey){return ml_dsa87.verify(signature,message,publicKey);},
  derive(secret,salt,info){return hkdf(sha512,secret,salt,sha512(info),32);},
  encrypt(key,nonce,aad,plaintext){return gcmsiv(key,nonce,aad).encrypt(plaintext);},
  decrypt(key,nonce,aad,ciphertext){return gcmsiv(key,nonce,aad).decrypt(ciphertext);},
  async password(secret,salt){return argon2id({password:secret,salt,parallelism:1,iterations:3,memorySize:65536,hashLength:32,outputType:'binary'});},
};
