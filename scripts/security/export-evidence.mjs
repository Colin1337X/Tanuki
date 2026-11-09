import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const input=path.join(root,'coverage/security');
const output=path.join(root,'docs/security/evidence');
const files=['pre-fix-attacks.txt','pre-fix-provider-attacks.txt','pre-fix-symlink.txt','pre-fix-roster-role.txt','post-fix-attacks.txt','full-suite.txt','production-smoke.txt','runtime-security.txt','build.txt','summary.json'];
const sha=data=>createHash('sha256').update(data).digest('hex');
export function sanitize(text){
 return text.replace(/\r\n/g,'\n').replace(/[ \t]+$/gm,'')
  .replace(/\x1b\[[0-9;]*m/g,'')
  .replace(/(?:file:\/\/\/)?[A-Za-z]:[\\/]proj[\\/]tanuki/gi,'<WORKSPACE>')
  .replace(/(?:file:\/\/)?\/home\/[^/\s]+\/tanuki-(?:redteam|wsl-validation)\.[^/\s]+\/app/g,'<WSL_WORKSPACE>')
  .replace(/\/home\/[^/\s]+\/tanuki-(?:redteam|wsl-validation)\.[^/\s]+/g,'<ISOLATED_WSL_RUN>')
  .replace(/\/home\/[^/\s]+\/tanuki-encrypted-queue(?:-production)?/g,'<ISOLATED_WSL_RUN>')
  .replace(/\/home\/[^/\s]+\/tanuki-worker-artifact-[A-Za-z0-9_.-]+/g,'<WORKER_ARTIFACT>')
  .replace(/\/var\/lib\/tanuki-worker-validation-[A-Za-z0-9_.-]+/g,'<ISOLATED_WORKER_FIXTURE>')
  .replace(/\/tmp\/tanuki-[A-Za-z0-9_.-]+/g,'<DISPOSABLE_FIXTURE>')
  .replace(/\(node:\d+\)/g,'(node:<PID>)')
  .replace(/Bearer\s+synthetic-operator-api-key/g,'Bearer <SYNTHETIC_API_KEY_REDACTED>')
  .replace(/tanuki_session=[A-Za-z0-9_-]{20,}/g,'tanuki_session=<SESSION_REDACTED>');
}
export function validate(text,name){
 const forbidden=[/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/,/\b(?:sk-proj-|ghp_)[A-Za-z0-9_-]{16,}/,/tanuki_session=[A-Za-z0-9_-]{43}/,/\$argon2id\$v=\d+\$m=\d+,t=\d+,p=\d+\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+/,/[A-Za-z]:[\\/]Users[\\/]/,/\/home\/(?!<)[^/\s]+\//,/Bearer\s+(?!<)[A-Za-z0-9_-]{12,}/];
 for(const pattern of forbidden)if(pattern.test(text))throw new Error('Manual review required; possible sensitive material in '+name);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 fs.mkdirSync(output,{recursive:true});const records=[];
 for(const file of files){const raw=fs.readFileSync(path.join(input,file));const sanitized=sanitize(raw.toString('utf8'));validate(sanitized,file);fs.writeFileSync(path.join(output,file),sanitized);records.push({file,source:`coverage/security/${file}`,rawSha256:sha(raw),sanitizedSha256:sha(sanitized),rawBytes:raw.length,sanitizedBytes:Buffer.byteLength(sanitized)});}
 fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify({format:1,assessmentDate:'2026-11-07',finalVerifiedApplicationCommit:'b47dabc795dbfd59a3e3aa96bb8088903d2e36f0',note:'Raw source checksums identify locally retained logs. Published logs preserve outcomes and assertions but redact machine paths, process identifiers and synthetic credential representations. Tests were not rerun to generate these historical transcripts.',files:records},null,2)+'\n');
 console.log(`Exported and screened ${records.length} sanitized evidence artifacts.`);
}
