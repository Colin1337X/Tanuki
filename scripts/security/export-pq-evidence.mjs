import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {sanitize,validate} from './export-evidence.mjs';
const input='coverage/pq-stack',output='docs/security/evidence/pq-stack',files=[];
const sha=value=>createHash('sha256').update(value).digest('hex');fs.mkdirSync(output,{recursive:true});
for(const file of ['full-suite.log','production.log','runtime.log','os-isolation.log','build.log','artifact.log','benchmark.log','summary.json']){
  const raw=fs.readFileSync(path.join(input,file)),published=sanitize(raw.toString());validate(published,file);fs.writeFileSync(path.join(output,file),published);files.push({file,rawSha256:sha(raw),publishedSha256:sha(published)});
}
const sourceSha256={};function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const file=path.posix.join(dir,entry.name);if(entry.isDirectory()&&entry.name!=='node_modules')walk(file);else if(/\.(?:m?js|css|html|json|service|sh)$/.test(file))sourceSha256[file]=sha(fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n'));}}
for(const dir of ['server','worker','public','tests/node','tests/fixtures','scripts','deploy'])walk(dir);
for(const file of ['package.json','package-lock.json'])sourceSha256[file]=sha(fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n'));
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify({format:1,assessmentDate:'2026-11-09',previousCheckpoint:'fbbe703',scope:'Isolated WSL synthetic tests only; no real account, provider, private key or target. Source hashes normalize CRLF to LF.',files,sourceSha256},null,2)+'\n');
console.log(`Exported and screened ${files.length} PQ-stack evidence files.`);
