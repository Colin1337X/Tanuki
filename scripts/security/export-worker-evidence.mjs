import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {sanitize,validate} from './export-evidence.mjs';
const input='coverage/trusted-worker',output='docs/security/evidence/trusted-worker';
const names=['full-suite.log','production.log','runtime.log','os-isolation.log','build.log','artifact.log','summary.json','recipient-pin-poc.log'];
const sha=value=>createHash('sha256').update(value).digest('hex');
fs.mkdirSync(output,{recursive:true});const files=[];
for(const file of names){const raw=fs.readFileSync(path.join(input,file)),published=sanitize(raw.toString());validate(published,file);fs.writeFileSync(path.join(output,file),published);files.push({file,rawSha256:sha(raw),publishedSha256:sha(published)});}
const sourceSha256={};
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const file=path.posix.join(dir,entry.name);if(entry.isDirectory()&&entry.name!=='node_modules')walk(file);else if(/\.(?:m?js|css|html|json|service|sh)$/.test(file))sourceSha256[file]=sha(fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n'));}}
for(const dir of ['server','worker','public','tests/node','scripts','deploy'])walk(dir);
for(const file of ['package.json','package-lock.json'])sourceSha256[file]=sha(fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n'));
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify({format:1,assessmentDate:'2026-11-09',previousCheckpoint:'7f611ad',scope:'Synthetic isolated WSL fixtures. Source hashes normalize CRLF to LF. Separate-UID worker uses root-provisioned disposable systemd unit; no production keys or targets.',files,sourceSha256},null,2)+'\n');
console.log(`Exported and screened ${files.length} trusted-worker evidence files.`);
