import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const root='public/assets/vendor/pq',seen=new Set(),manifest={};fs.mkdirSync(root,{recursive:true});
function copy(packageName,file){
  const folder=packageName.split('/').at(-1),target=folder+'/'+file,id=packageName+'/'+file;if(seen.has(id))return;seen.add(id);
  const source=fs.readFileSync(path.join('node_modules',packageName,file),'utf8');
  const result=source.replace(/(from\s+|import\s*)(['"])([^'"]+)\2/g,(whole,prefix,quote,specifier)=>{
    if(specifier.startsWith('@noble/')){const parts=specifier.split('/'),dep=parts.slice(0,2).join('/'),name=parts.slice(2).join('/');copy(dep,name);return prefix+quote+'../'+parts[1]+'/'+name+quote;}
    if(specifier.startsWith('./'))copy(packageName,path.posix.join(path.posix.dirname(file),specifier));return whole;
  });
  fs.mkdirSync(path.dirname(path.join(root,target)),{recursive:true});fs.writeFileSync(path.join(root,target),result);
  manifest[target]={source:id,sourceSha256:createHash('sha256').update(source).digest('hex'),publishedSha256:createHash('sha256').update(result).digest('hex')};
}
for(const[pkg,file]of [['@noble/post-quantum','ml-kem.js'],['@noble/post-quantum','ml-dsa.js'],['@noble/ciphers','aes.js'],['@noble/hashes','hkdf.js'],['@noble/hashes','sha2.js']])copy(pkg,file);
for(const pkg of ['@noble/post-quantum','@noble/ciphers','@noble/hashes','@noble/curves','hash-wasm'])fs.copyFileSync(path.join('node_modules',pkg,'LICENSE'),path.join(root,pkg.split('/').at(-1)+'-LICENSE'));
const wasm=fs.readFileSync('node_modules/hash-wasm/dist/index.esm.js');fs.writeFileSync(path.join(root,'argon2.mjs'),wasm);manifest['argon2.mjs']={source:'hash-wasm/dist/index.esm.js',sourceSha256:createHash('sha256').update(wasm).digest('hex'),publishedSha256:createHash('sha256').update(wasm).digest('hex')};
fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log('Vendored '+Object.keys(manifest).length+' pinned crypto modules; only import paths rewritten.');
