import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {spawnSync} from 'node:child_process';
export function defaultProfile(){return path.resolve(process.env.TANUKI_PROFILE_DIR||(process.platform==='win32'?path.join(process.env.LOCALAPPDATA||os.homedir(),'Tanuki Stories','profile'):process.platform==='darwin'?path.join(os.homedir(),'Library/Application Support/Tanuki Stories/profile'):path.join(os.homedir(),'.local/share/tanuki-stories')));}
export function validateSettings(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Enter your installation settings.');
  const allowed=['origin','port','username','password','providerUrl','providerKey'];if(Object.keys(input).some(k=>!allowed.includes(k)))throw new Error('Unexpected installation setting.');
  if(typeof input.origin!=='string')throw new Error('Enter a public HTTPS address.');
  let url;try{url=new URL(input.origin);}catch{throw new Error('Enter a valid public HTTPS address.');}
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/'||!url.hostname.includes('.')||/^(localhost|127\.|0\.|\[)/i.test(url.hostname))throw new Error('Use a public HTTPS origin without a path, credentials or query.');
  if(!Number.isInteger(input.port)||input.port<1024||input.port>65535)throw new Error('Choose a local port between 1024 and 65535.');
  if(typeof input.username!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/.test(input.username))throw new Error('Use 1–64 letters, digits, dots, dashes or underscores for the administrator.');
  if(typeof input.password!=='string'||input.password.length<16||input.password.length>1024)throw new Error('Use an administrator password of at least 16 characters.');
  if(typeof input.providerUrl!=='string'||typeof input.providerKey!=='string'||input.providerKey.length>4096)throw new Error('Invalid provider settings.');
  let providerUrl='';if(input.providerUrl){let p;try{p=new URL(input.providerUrl);}catch{throw new Error('Enter a valid provider URL.');}if(p.protocol!=='https:'||p.username||p.password||p.search||p.hash)throw new Error('The provider must use HTTPS without embedded credentials.');providerUrl=p.href.replace(/\/$/,'');}
  if(!!providerUrl!==!!input.providerKey)throw new Error('Provide both the provider address and key, or leave both empty.');
  return {origin:url.origin,port:input.port,username:input.username,password:input.password,providerUrl,providerKey:input.providerKey};
}
export function restrictDirectory(dir){
  fs.chmodSync(dir,0o700);
  if(process.platform==='win32'){
    const systemDirectory=path.join(process.env.SystemRoot||'C:\\Windows','System32');
    const identity=spawnSync(path.join(systemDirectory,'whoami.exe'),['/user','/fo','csv','/nh'],{encoding:'utf8',windowsHide:true});
    const sid=identity.stdout?.match(/S-1-5-(?:\d+-)*\d+/)?.[0];if(identity.status!==0||!sid)throw new Error('Cannot determine the local account identity.');
    const secured=spawnSync(path.join(systemDirectory,'icacls.exe'),[dir,'/inheritance:r','/grant:r',`*${sid}:(OI)(CI)F`,'*S-1-5-18:(OI)(CI)F'],{encoding:'utf8',windowsHide:true});
    if(secured.status!==0)throw new Error('Cannot protect the installation data directory.');
  }
}
