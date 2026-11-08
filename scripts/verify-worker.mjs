import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const root=path.resolve(process.argv[2]||'.'),manifest=JSON.parse(fs.readFileSync(path.join(root,'artifact-manifest.json'),'utf8'));
if(manifest.format!==1||!manifest.files)throw new Error('Unsupported worker artifact manifest');
const found=new Set();function walk(dir){for(const entry of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){const file=path.posix.join(dir,entry.name);if(entry.isSymbolicLink())throw new Error('Worker artifact symlink rejected');if(entry.isDirectory())walk(file);else if(file!=='artifact-manifest.json'){found.add(file);if(createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')!==manifest.files[file])throw new Error('Worker artifact integrity mismatch: '+file);}}}walk('');
if(Object.keys(manifest.files).some(file=>!found.has(file)))throw new Error('Worker artifact file missing');
console.log(JSON.stringify({event:'worker_artifact_verified',files:found.size,node:process.version}));
