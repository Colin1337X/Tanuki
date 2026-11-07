import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const cases={
 'RT-01':['tests/node/adversarial.test.js','RT-01|Login route alias'],
 'RT-02':['tests/node/adversarial.test.js','RT-02'],
 'RT-03':['tests/node/adversarial.test.js','RT-03'],
 'RT-04':['tests/node/adversarial.test.js','RT-04|Public ML-KEM key|Bounded deterministic ciphertext'],
 'RT-05':['tests/node/adversarial.test.js','RT-05'],
 'RT-06':['tests/node/adversarial.test.js','RT-06'],
 'RT-07':['tests/node/adversarial.test.js','RT-07'],
 'RT-08':['tests/node/adversarial.test.js','RT-08'],
 'RT-09':['scripts/security-runtime.test.js','static asset symlinks'],
 'RT-10':['tests/node/adversarial.test.js','Educator roster mistakes'],
 'RT-11':['scripts/security-runtime.test.js','plaintext legacy|Legacy archival|damaged archive|migrated plaintext password'],
};
const id=process.argv[2];
if(id==='--list'){for(const [key,[file,pattern]]of Object.entries(cases))console.log(`${key}: ${file} (${pattern})`);process.exit(0);}
if(process.platform!=='linux')throw new Error('Run only in the authorized isolated Linux/WSL checkout.');
if(process.argv.length!==3||!cases[id])throw new Error('Usage: node scripts/security/run-poc.mjs RT-01 (through RT-11), or --list. No target URL is accepted.');
// These are the actual self-contained regression/PoC sources, not remote probes.
// Each creates synthetic data and loopback services; no existing app URL is used.
const [file,pattern]=cases[id];
const result=spawnSync(process.execPath,['--test',`--test-name-pattern=${pattern}`,file],{cwd:root,env:process.env,stdio:'inherit'});
if(result.error)throw result.error;
process.exit(result.status??1);
