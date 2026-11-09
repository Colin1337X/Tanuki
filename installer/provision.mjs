// Single-use child process: accepts secrets on stdin, never argv or an environment file.
import fs from 'node:fs';import path from 'node:path';
import {validateSettings} from './profile.mjs';
const chunks=[];let length=0;for await(const chunk of process.stdin){length+=chunk.length;if(length>16384)throw new Error('Setup request too large');chunks.push(chunk);}
const input=validateSettings(JSON.parse(Buffer.concat(chunks).toString())),root=path.resolve(process.argv[2]);
process.env.NODE_ENV='production';process.env.TANUKI_DATA_DIR=path.join(root,'data');process.env.TANUKI_KEYRING_FILE=path.join(root,'keyring.json');
const{generateKeyring,seal}=await import('../server/lib/crypto.js');fs.writeFileSync(process.env.TANUKI_KEYRING_FILE,JSON.stringify(generateKeyring()),{flag:'wx',mode:0o600});
const db=await import('../server/lib/database.js');
try{db.putUser({username:input.username,password:input.password,role:'admin'});db.database().exec('PRAGMA wal_checkpoint(TRUNCATE)');}finally{db.closeDatabase();}
const config={version:1,origin:input.origin,port:input.port,providerUrl:input.providerUrl,created:new Date().toISOString()};
fs.writeFileSync(path.join(root,'config.json'),JSON.stringify(config,null,2)+'\n',{flag:'wx',mode:0o600});
fs.writeFileSync(path.join(root,'secrets.json'),seal(JSON.stringify({providerUrl:input.providerUrl,providerKey:input.providerKey}),'installation-provider-v1'),{flag:'wx',mode:0o600});
input.password='';input.providerKey='';for(const chunk of chunks)chunk.fill(0);
