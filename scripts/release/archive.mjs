import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
fs.mkdirSync('dist/artifacts',{recursive:true});
for(const dir of fs.readdirSync('dist').filter(x=>x.startsWith('tanuki-stories-')&&fs.statSync(path.join('dist',x)).isDirectory())){
  const archive=path.resolve('dist/artifacts',dir+(process.platform==='win32'?'.zip':'.tar.gz'));
  const args=process.platform==='win32'?['-a','-cf',archive,'-C','dist',dir]:['-czf',archive,'-C','dist',dir];const result=spawnSync('tar',args,{encoding:'utf8',windowsHide:true});if(result.status!==0)throw new Error(result.stderr||'Archive failed');
}
const files=fs.readdirSync('dist/artifacts').filter(f=>!f.endsWith('.sha256')&&f!=='SHA256SUMS.txt').sort();fs.writeFileSync('dist/artifacts/SHA256SUMS.txt',files.map(file=>createHash('sha256').update(fs.readFileSync(path.join('dist/artifacts',file))).digest('hex')+'  '+file).join('\n')+'\n');console.log(files.join('\n'));
