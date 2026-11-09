// Versioned application envelope composed from library-provided primitives.
// This is not OpenPGP or an independently audited standardized wire protocol.
export const SUITE='ML-KEM-1024/ML-DSA-87/HKDF-SHA-512/AES-256-GCM-SIV';
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const bytes=value=>encoder.encode(value),json=value=>JSON.stringify(value);
const random=n=>crypto.getRandomValues(new Uint8Array(n));
const b64=value=>{let result='';for(let i=0;i<value.length;i+=8192)result+=String.fromCharCode(...value.subarray(i,i+8192));return btoa(result);};
const decode=(value,length,max=2*1024*1024)=>{
  if(typeof value!=='string'||value.length>max||value.length%4!==0||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))throw new Error('Invalid canonical encoding');
  const result=Uint8Array.from(atob(value),c=>c.charCodeAt(0));
  if(b64(result)!==value||(length!==undefined&&result.length!==length))throw new Error('Invalid cryptographic length');return result;
};
const parse=(text,max)=>{if(typeof text!=='string'||text.length>max)throw new Error('Invalid envelope size');const value=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid envelope');return value;};
const exact=(value,names)=>{if(Object.keys(value).sort().join(',')!==names.split(',').sort().join(','))throw new Error('Invalid envelope fields');};
const suite=value=>{if(value.v!==2||value.suite!==SUITE)throw new Error('Unsupported cryptographic suite');};
const publicText=(kem,sign)=>json({v:2,suite:SUITE,kem:b64(kem),sign:b64(sign)});
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');
const sigInput=text=>bytes(json(['tanuki-device-signature-v2',SUITE,text]));
const context=(id,signer,fps)=>['tanuki-recipient-envelope-v2',SUITE,id,signer,fps];
const wrapContext=(base,entry)=>bytes(json([...base,'wrap',entry.fp,entry.kem,entry.salt,entry.nonce]));
const payloadContext=(base,entries,nonce)=>bytes(json([...base,'payload',entries.map(r=>[r.fp,r.kem,r.salt,r.nonce,r.wrapped]),nonce]));
const privateKeys=new WeakMap();
// Storage admission is structural only; authenticated decryption remains mandatory.
export function isPostQuantumEnvelope(text){
  try{const v=parse(text,512000);exact(v,'v,suite,id,signer,recipients,nonce,data,signature');suite(v);decode(v.id,32);decode(v.nonce,12);if(decode(v.data).length<16||!Array.isArray(v.recipients)||!v.recipients.length||v.recipients.length>16)return false;
    for(const r of v.recipients){exact(r,'fp,kem,salt,nonce,wrapped');if(!/^[a-f0-9]{64}$/.test(r.fp))return false;decode(r.kem,1568);decode(r.salt,32);decode(r.nonce,12);decode(r.wrapped,48);}return typeof v.signature==='string'&&/^[a-f0-9]{64}$/.test(v.signer);
  }catch{return false;}
}

export function postQuantumRecipient(primitives,legacy){
  async function makePublic(text){
    const value=parse(text,16000);exact(value,'v,suite,kem,sign');suite(value);
    const kem=decode(value.kem,1568),sign=decode(value.sign,2592),canonical=publicText(kem,sign),fingerprint=await digest(canonical);
    return Object.freeze({suite:SUITE,kem,sign,getFingerprint:()=>fingerprint,isPrivate:()=>false,toPublic(){return this;},armor:()=>canonical});
  }
  async function publicKey(text,expected){
    if(typeof text==='string'&&text.startsWith('-----BEGIN PGP')){if(!legacy)throw new Error('Legacy keys are not supported here');return legacy.publicKey(text,expected);}
    const key=await makePublic(text);if(expected!==undefined&&key.getFingerprint()!==expected)throw new Error('Pinned public-key fingerprint mismatch');return key;
  }
  async function privateKey(value){
    exact(value,'v,suite,kemSeed,signSeed');suite(value);const kemSeed=decode(value.kemSeed,64),signSeed=decode(value.signSeed,32);
    const material=await primitives.keypair(kemSeed,signSeed),pub=await makePublic(publicText(material.kemPublic,material.signPublic));
    const key=Object.freeze({...pub,isPrivate:()=>true,toPublic:()=>pub,armor:()=>json(value)});privateKeys.set(key,material);kemSeed.fill(0);signSeed.fill(0);return key;
  }
  async function sign(key,text){
    if(key.suite!==SUITE){if(!legacy)throw new Error('Post-quantum signing key required');return legacy.sign(key,text);}
    const material=privateKeys.get(key);if(!material)throw new Error('Private signing key required');
    return json({v:2,suite:SUITE,signer:key.getFingerprint(),signature:b64(await primitives.sign(sigInput(text),material))});
  }
  async function verify(armored,text,signature){
    const key=await publicKey(armored);if(key.suite!==SUITE)return legacy.verify(armored,text,signature);
    const value=parse(signature,16000);exact(value,'v,suite,signer,signature');suite(value);
    if(value.signer!==key.getFingerprint()||!await primitives.verify(decode(value.signature,4627),sigInput(text),key.sign))throw new Error('Signature verification failed');
  }
  async function encrypt(recipients,value,signingKey){
    if(!Array.isArray(recipients)||!recipients.length||recipients.length>16)throw new Error('Invalid recipients');
    const keys=await Promise.all(recipients.map(text=>publicKey(text)));
    if(keys.some(key=>key.suite!==SUITE)||(signingKey&&signingKey.suite!==SUITE))throw new Error('Enroll post-quantum devices before creating new encrypted content');
    keys.sort((a,b)=>a.getFingerprint().localeCompare(b.getFingerprint()));const fps=keys.map(key=>key.getFingerprint());
    if(new Set(fps).size!==fps.length)throw new Error('Duplicate recipient');
    const id=b64(random(32)),signer=signingKey?.getFingerprint()??null,base=context(id,signer,fps),contentKey=random(32),entries=[];
    try{
      for(const key of keys){
        const {cipherText,sharedSecret}=await primitives.encapsulate(key.kem),entry={fp:key.getFingerprint(),kem:b64(cipherText),salt:b64(random(32)),nonce:b64(random(12))};
        const aad=wrapContext(base,entry),wrapKey=primitives.derive(sharedSecret,decode(entry.salt,32),aad);
        try{entry.wrapped=b64(primitives.encrypt(wrapKey,decode(entry.nonce,12),aad,contentKey));entries.push(entry);}finally{wrapKey.fill(0);sharedSecret.fill(0);}
      }
      const nonce=b64(random(12)),aad=payloadContext(base,entries,nonce),data=b64(primitives.encrypt(contentKey,decode(nonce,12),aad,bytes(json(value))));
      const result={v:2,suite:SUITE,id,signer,recipients:entries,nonce,data};
      result.signature=signingKey?await sign(signingKey,json(['tanuki-encrypted-message-v2',result])):null;return json(result);
    }finally{contentKey.fill(0);}
  }
  async function decrypt(key,ciphertext,expected,signer){
    if(typeof ciphertext==='string'&&ciphertext.startsWith('-----BEGIN PGP')){if(!legacy)throw new Error('Legacy ciphertext is not supported here');return legacy.decrypt(key,ciphertext,expected,signer);}
    const value=parse(ciphertext,2*1024*1024);exact(value,'v,suite,id,signer,recipients,nonce,data,signature');suite(value);decode(value.id,32);
    if(!Array.isArray(value.recipients)||!value.recipients.length||value.recipients.length>16)throw new Error('Invalid recipients');
    const fps=value.recipients.map(entry=>{
      exact(entry,'fp,kem,salt,nonce,wrapped');if(!/^[a-f0-9]{64}$/.test(entry.fp))throw new Error('Invalid fingerprint');
      decode(entry.kem,1568);decode(entry.salt,32);decode(entry.nonce,12);decode(entry.wrapped,48);return entry.fp;
    });
    if(new Set(fps).size!==fps.length||json(fps)!==json([...fps].sort()))throw new Error('Invalid recipient ordering');
    if(value.signer!==null&&!/^[a-f0-9]{64}$/.test(value.signer))throw new Error('Invalid signer');
    if(signer){const pub=await publicKey(signer);if(pub.suite!==SUITE||pub.getFingerprint()!==value.signer)throw new Error('Signature identity mismatch');const{signature,...unsigned}=value;await verify(signer,json(['tanuki-encrypted-message-v2',unsigned]),signature);}
    else if(value.signer!==null||value.signature!==null)throw new Error('A verified signer is required');
    const entry=value.recipients.find(item=>item.fp===key.getFingerprint()),material=privateKeys.get(key);
    if(!entry||!material)throw new Error('Authorized private decryption key required');
    const base=context(value.id,value.signer,fps),aad=wrapContext(base,entry),secret=await primitives.decapsulate(decode(entry.kem,1568),material),wrapKey=primitives.derive(secret,decode(entry.salt,32),aad);
    let contentKey,plain;
    try{
      contentKey=primitives.decrypt(wrapKey,decode(entry.nonce,12),aad,decode(entry.wrapped,48));
      plain=primitives.decrypt(contentKey,decode(value.nonce,12),payloadContext(base,value.recipients,value.nonce),decode(value.data));
      const result=JSON.parse(decoder.decode(plain));for(const[name,wanted]of Object.entries(expected))if(json(result[name])!==json(wanted))throw new Error('Encrypted context mismatch');return result;
    }finally{secret.fill(0);wrapKey.fill(0);contentKey?.fill(0);plain?.fill(0);}
  }
  return {publicKey,sign,verify,encrypt,decrypt,
    async generate(secret){
      if(typeof secret!=='string'||!/^[a-f0-9]{64}$/.test(secret))throw new Error('A random 256-bit recovery secret is required');
      const material={v:2,suite:SUITE,kemSeed:b64(random(64)),signSeed:b64(random(32))},key=await privateKey(material),salt=random(32),nonce=random(12);
      const header={v:2,suite:SUITE,kdf:'Argon2id',memory:65536,passes:3,parallelism:1,salt:b64(salt),nonce:b64(nonce),fingerprint:key.getFingerprint()};
      const derived=await primitives.password(secret,salt),plain=bytes(json(material));
      try{return{publicKey:key.toPublic().armor(),privateKey:json({...header,data:b64(primitives.encrypt(derived,nonce,bytes(json(['tanuki-device-backup-v2',header])),plain))})};}
      finally{derived.fill(0);plain.fill(0);}
    },
    async unlock(armored,secret){
      if(typeof armored==='string'&&armored.startsWith('-----BEGIN PGP')){if(!legacy)throw new Error('Legacy backups are not supported here');return legacy.unlock(armored,secret);}
      if(typeof secret!=='string'||!/^[a-f0-9]{64}$/.test(secret))throw new Error('Invalid recovery secret');
      const value=parse(armored,16000);exact(value,'v,suite,kdf,memory,passes,parallelism,salt,nonce,fingerprint,data');suite(value);
      if(value.kdf!=='Argon2id'||value.memory!==65536||value.passes!==3||value.parallelism!==1)throw new Error('Unsupported bounded Argon2id parameters');
      const{data,...header}=value,salt=decode(value.salt,32),nonce=decode(value.nonce,12),encrypted=decode(data),derived=await primitives.password(secret,salt);let plain;
      try{plain=primitives.decrypt(derived,nonce,bytes(json(['tanuki-device-backup-v2',header])),encrypted);const key=await privateKey(JSON.parse(decoder.decode(plain)));if(key.getFingerprint()!==value.fingerprint)throw new Error('Backup identity mismatch');return key;}
      finally{derived.fill(0);plain?.fill(0);}
    },
    async readProcessingKey(armored){return privateKey(parse(armored,16000));},
  };
}
