import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { sanitize, validate } from './export-evidence.mjs';
const input='coverage/recipient', output='docs/security/evidence/recipient';
const files=['full-suite.log','production.log','runtime.log','summary.json','stream-completion-poc.log','queue-origin-before.log','queue-origin-after.log','build.log'];
const sha=value=>createHash('sha256').update(value).digest('hex');
fs.mkdirSync(output,{recursive:true});const records=[];
for(const file of files){const raw=fs.readFileSync(path.join(input,file)),text=sanitize(raw.toString());validate(text,file);fs.writeFileSync(path.join(output,file),text);records.push({file,rawSha256:sha(raw),publishedSha256:sha(text)});}
const sources={};
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.posix.join(dir,entry.name);if(entry.isDirectory())walk(file);else if(/\.(?:m?js|css|html)$/.test(file))sources[file]=sha(fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n'));}}
for(const dir of ['server','public','tests/node'])walk(dir);
for(const file of ['package.json','package-lock.json','scripts/production-smoke.test.js'])sources[file]=sha(fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n'));
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify({format:1,baseCommit:'d4dac6e',scope:'Isolated WSL synthetic fixtures only. Source hashes normalize CRLF to LF; logs are sanitized without changing outcomes.',files:records,sourceSha256:sources},null,2)+'\n');
console.log(`Exported ${records.length} recipient-encryption evidence files.`);
