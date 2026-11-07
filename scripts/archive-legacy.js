import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {database,DATA_DIR,closeDatabase} from '../server/lib/database.js';
import {seal,unseal} from '../server/lib/crypto.js';
function syncDirectory(directory){if(process.platform==='win32')return;const fd=fs.openSync(directory,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
export function archiveLegacySources(){
  database(); // Import/upgrade must have committed successfully first.
  const archived=[];const archive=path.join(DATA_DIR,'legacy-archive');
  for(const name of ['users','stories','config','recordings','knowledge-base']){
    const source=path.join(DATA_DIR,name+'.json');if(!fs.existsSync(source))continue;
    const bytes=fs.readFileSync(source);const context='legacy-source:'+name+'.json';
    fs.mkdirSync(archive,{recursive:true,mode:0o700});
    const destination=path.join(archive,name+'.json.enc');
    if(!fs.existsSync(destination))fs.writeFileSync(destination,seal(bytes,context),{flag:'wx',mode:0o600});
    const recovered=unseal(fs.readFileSync(destination,'utf8'),context);
    if(!recovered.equals(bytes))throw new Error('Existing encrypted archive differs; source preserved: '+name);
    // Flush the verified backup before removing only this known plaintext source.
    const fd=fs.openSync(destination,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    syncDirectory(archive);syncDirectory(DATA_DIR);
    fs.unlinkSync(source);syncDirectory(DATA_DIR);archived.push(name);
  }
  return archived;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{console.log('Archived legacy sources: '+archiveLegacySources().join(', '));}finally{closeDatabase();}}
