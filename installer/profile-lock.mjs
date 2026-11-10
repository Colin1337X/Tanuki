import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';
function recoverDeadOwner(file){
  // Serialize stale-lock removal so two restarting processes cannot unlink a
  // newly acquired lock. PID reuse fails closed; shared-host profiles are unsupported.
  const recovery=file+'.recovery';let fd;
  try{fd=fs.openSync(recovery,'wx',0o600);}catch{return false;}
  try{
    const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink())return false;
    const owner=JSON.parse(fs.readFileSync(file,'utf8'));if(!Number.isSafeInteger(owner.pid)||owner.pid<1)return false;
    try{process.kill(owner.pid,0);return false;}catch(e){if(e.code!=='ESRCH')return false;}
    fs.unlinkSync(file);return true;
  }catch{return false;}finally{fs.closeSync(fd);fs.unlinkSync(recovery);}
}
export function lockProfile(profile) {
  const file=path.join(profile,'.tanuki-lock'),token=randomUUID();
  const stat=fs.lstatSync(profile);if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('Profile must be a real directory.');
  let fd;try{fd=fs.openSync(file,'wx',0o600);}catch(e){
    if(e.code!=='EEXIST')throw e;
    if(recoverDeadOwner(file)){try{fd=fs.openSync(file,'wx',0o600);}catch{}}
    if(fd===undefined)throw new Error('Profile is in use or has an ambiguous stale lock. Stop Tanuki before maintenance; see the recovery guide.');
  }
  try{fs.writeFileSync(fd,JSON.stringify({pid:process.pid,token}));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  let released=false;
  const release=()=>{if(released)return;released=true;try{if(JSON.parse(fs.readFileSync(file,'utf8')).token===token)fs.unlinkSync(file);}catch{}};
  process.once('exit',release);return ()=>{release();process.removeListener('exit',release);};
}
