import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
const output=path.resolve(process.argv[2]||'dist/trusted-worker');
if(fs.existsSync(output))throw new Error('Choose a new output directory; existing artifacts are never overwritten');
fs.mkdirSync(output,{recursive:true});
for(const file of ['worker/index.js','worker/engine.js','server/lib/runtime.js','server/lib/pq-primitives.js','server/lib/ai-client.js','server/lib/generation-policy.js','public/assets/pq-recipient.js']){fs.mkdirSync(path.dirname(path.join(output,file)),{recursive:true});fs.copyFileSync(file,path.join(output,file));}
for(const file of ['package.json','package-lock.json'])fs.copyFileSync(path.join('worker',file),path.join(output,file));
fs.copyFileSync('scripts/verify-worker.mjs',path.join(output,'verify-worker.mjs'));
const installed=spawnSync(process.platform==='win32'?'npm.cmd':'npm',['ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],{cwd:output,encoding:'utf8',shell:false});
if(installed.status!==0)throw new Error('Worker dependency installation failed: '+installed.stderr);
const files={};function walk(dir){for(const entry of fs.readdirSync(path.join(output,dir),{withFileTypes:true})){const file=path.posix.join(dir,entry.name);if(entry.isDirectory())walk(file);else files[file]=createHash('sha256').update(fs.readFileSync(path.join(output,file))).digest('hex');}}walk('');
fs.writeFileSync(path.join(output,'artifact-manifest.json'),JSON.stringify({format:1,node:process.version,files},null,2)+'\n');
console.log(JSON.stringify({artifact:output,files:Object.keys(files).length,node:process.version}));
