import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import './verify-vendor.mjs';
import './inventory.mjs';
const run=spawnSync(process.execPath,['scripts/security/audit-inventory.mjs','coverage/tauri-inventory.json','coverage/tauri-audit.json'],{stdio:'inherit'});
if(run.error||run.status===null||run.status>1)throw Error('Tauri dependency audit did not complete');
const raw=JSON.parse(fs.readFileSync('coverage/tauri-audit.json','utf8'));
if(!['findings','no-known-advisories'].includes(raw.status))throw Error('Incomplete dependency evidence');
const reviewed=raw.findings.map(f=>{
  if(f.name==='glib'&&f.version==='0.18.5'&&['RUSTSEC-2024-0429','GHSA-wrw7-89jp-8q8g'].includes(f.id))return {...f,disposition:'upstream two-line fix backported; source integrity verified; optimized Linux regression required'};
  if(f.name==='proc-macro-error'&&f.version==='1.0.4'&&f.id==='RUSTSEC-2024-0370')return {...f,disposition:'unmaintained build-time macro dependency; retained maintenance risk, not a runtime vulnerability fix'};
  return {...f,disposition:'unresolved'};
});
fs.writeFileSync('coverage/tauri-audit-review.json',JSON.stringify({reviewedAt:new Date().toISOString(),findings:reviewed},null,2)+'\n');
if(reviewed.some(f=>f.disposition==='unresolved'))throw Error('Unreviewed dependency finding blocks release');
console.log('Advisory review complete. Raw findings retained; unmaintained macro dependency remains a documented risk.');
