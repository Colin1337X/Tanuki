import { lockProfile } from './profile-lock.mjs';
import fs from 'node:fs';import path from 'node:path';import readline from 'node:readline/promises';import {Writable} from 'node:stream';import {defaultProfile} from './profile.mjs';
const profile=defaultProfile();if(!fs.existsSync(path.join(profile,'installed')))throw new Error('Complete setup first. Stop the server before changing its provider.');
lockProfile(profile);
let input;
if(process.stdin.isTTY){let muted=false;const output=new Writable({write(chunk,encoding,done){if(!muted)process.stdout.write(chunk);done();}}),rl=readline.createInterface({input:process.stdin,output,terminal:true});try{const providerUrl=await rl.question('Approved HTTPS provider URL: ');process.stdout.write('Provider key (hidden): ');muted=true;const providerKey=await rl.question('');process.stdout.write('\n');input={providerUrl,providerKey};}finally{rl.close();}}
else{const chunks=[];let length=0;for await(const chunk of process.stdin){length+=chunk.length;if(length>16384)throw new Error('Input too large');chunks.push(chunk);}input=JSON.parse(Buffer.concat(chunks).toString());for(const chunk of chunks)chunk.fill(0);}
const url=new URL(input.providerUrl);if(url.protocol!=='https:'||url.username||url.password||url.hash||url.search||typeof input.providerKey!=='string'||!input.providerKey||input.providerKey.length>4096)throw new Error('An approved HTTPS URL and bounded provider key are required.');
process.env.TANUKI_KEYRING_FILE=path.join(profile,'keyring.json');const{seal}=await import('../server/lib/crypto.js');
// Bind the destination and its credential in one authenticated, atomic replacement.
// A crash must never pair a new credential with the previous provider origin.
const temporary=path.join(profile,'secrets.json.new'),sealed=seal(JSON.stringify({providerUrl:url.href.replace(/\/$/,''),providerKey:input.providerKey}),'installation-provider-v1');
fs.writeFileSync(temporary,sealed,{flag:'wx',mode:0o600});fs.renameSync(temporary,path.join(profile,'secrets.json'));
console.log('Provider configuration encrypted. Restart Tanuki to apply it.');
