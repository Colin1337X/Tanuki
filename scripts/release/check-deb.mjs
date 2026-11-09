import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
const archive=path.resolve(process.argv[2]||''),root=fs.mkdtempSync(path.join(os.tmpdir(),'tanuki-deb-acceptance-'));
function run(command,args,cwd){const result=spawnSync(command,args,{cwd,encoding:'utf8'});if(result.status!==0)throw new Error(result.stderr||result.stdout||'Package verification failed');process.stdout.write(result.stdout);}
run('dpkg-deb',['-x',archive,root]);const app=path.join(root,'opt/tanuki'),node=path.join(app,'runtime/node');
run(node,['scripts/release/verify.mjs',app],app);run(node,['--test','scripts/release/smoke.test.mjs'],app);
