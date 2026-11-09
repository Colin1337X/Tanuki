import fs from 'node:fs';import path from 'node:path';import { spawnSync } from 'node:child_process';
let count=0;
for(const root of ['server','worker','public/assets','scripts','tests/node'])if(fs.existsSync(root))walk(root);
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else if(/\.m?js$/.test(file)){const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(result.status!==0){console.error(result.stderr);process.exit(1);}count++;}}}
console.log(`Syntax checked ${count} JavaScript modules. No bundler required.`);
