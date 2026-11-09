import {webcrypto,hkdfSync,createHash} from 'node:crypto';
import {hashRawSync,Algorithm} from '@node-rs/argon2';
import {gcmsiv} from '@noble/ciphers/aes.js';
const subtle=webcrypto.subtle;
export const nativePrimitives={
  async keypair(kemSeed,signSeed){
    const kemPrivate=await subtle.importKey('raw-seed',kemSeed,'ML-KEM-1024',true,['decapsulateBits']);
    const signPrivate=await subtle.importKey('raw-seed',signSeed,'ML-DSA-87',true,['sign']);
    const kemPublic=new Uint8Array(await subtle.exportKey('raw-public',await subtle.getPublicKey(kemPrivate,['encapsulateBits'])));
    const signPublic=new Uint8Array(await subtle.exportKey('raw-public',await subtle.getPublicKey(signPrivate,['verify'])));
    return {kemPublic,signPublic,kemPrivate,signPrivate};
  },
  async encapsulate(publicKey){const key=await subtle.importKey('raw-public',publicKey,'ML-KEM-1024',false,['encapsulateBits']);const result=await subtle.encapsulateBits('ML-KEM-1024',key);return{cipherText:new Uint8Array(result.ciphertext),sharedSecret:new Uint8Array(result.sharedKey)};},
  async decapsulate(ciphertext,key){return new Uint8Array(await subtle.decapsulateBits('ML-KEM-1024',key.kemPrivate,ciphertext));},
  async sign(message,key){return new Uint8Array(await subtle.sign('ML-DSA-87',key.signPrivate,message));},
  async verify(signature,message,publicKey){const key=await subtle.importKey('raw-public',publicKey,'ML-DSA-87',false,['verify']);return subtle.verify('ML-DSA-87',key,signature,message);},
  derive(secret,salt,info){return new Uint8Array(hkdfSync('sha512',secret,salt,createHash('sha512').update(info).digest(),32));},
  encrypt(key,nonce,aad,plaintext){return gcmsiv(key,nonce,aad).encrypt(plaintext);},
  decrypt(key,nonce,aad,ciphertext){return gcmsiv(key,nonce,aad).decrypt(ciphertext);},
  async password(secret,salt){return hashRawSync(secret,{algorithm:Algorithm.Argon2id,memoryCost:65536,timeCost:3,parallelism:1,outputLen:32,salt:Buffer.from(salt)});},
};
