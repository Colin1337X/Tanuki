import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
const root=process.cwd(),pkg=JSON.parse(fs.readFileSync('package.json')),platform=process.platform,arch=process.arch;
if(!['linux','win32','darwin'].includes(platform)||!['x64','arm64'].includes(arch)||(platform!=='darwin'&&arch!=='x64'))throw new Error('Unsupported release platform or architecture.');
if(process.versions.node!=='26.13.1')throw new Error('Release builds require the reviewed Node 26.13.1 runtime.');
if(!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(pkg.version))throw new Error('Invalid release version');
if(process.env.GITHUB_REF?.startsWith('refs/tags/')&&process.env.GITHUB_REF!==`refs/tags/v${pkg.version}`)throw new Error('Release tag must match package.json version');
const name=`tanuki-stories-${pkg.version}-${platform==='win32'?'windows':platform==='darwin'?'macos':'linux'}-${arch}`,out=path.resolve('dist',name);if(fs.existsSync(out))throw new Error('Choose a clean build output; existing bundles are never overwritten.');fs.mkdirSync(out,{recursive:true});
for(const dir of ['server','installer','scripts','deploy','docs'])fs.cpSync(dir,path.join(out,dir),{recursive:true,filter:source=>!source.includes(path.sep+'evidence'+path.sep)&&!source.endsWith(path.sep+'evidence')});
fs.mkdirSync(path.join(out,'public'),{recursive:true});for(const file of ['index.html','sw.js'])fs.copyFileSync(path.join('public',file),path.join(out,'public',file));fs.cpSync('public/assets',path.join(out,'public/assets'),{recursive:true});
for(const file of ['package.json','package-lock.json','LICENSE','README.md','install.bat','install.sh'])fs.copyFileSync(file,path.join(out,file));
if(platform!=='win32')fs.chmodSync(path.join(out,'install.sh'),0o755);
const npmCli=process.env.npm_execpath;if(!npmCli||!fs.existsSync(npmCli))throw new Error('Build with npm run release:bundle so the exact npm CLI is available.');
const install=spawnSync(process.execPath,[npmCli,'ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],{cwd:out,encoding:'utf8',windowsHide:true});if(install.status!==0)throw new Error('Production dependency installation failed: '+install.stderr);
fs.mkdirSync(path.join(out,'runtime'));fs.copyFileSync(process.execPath,path.join(out,'runtime',platform==='win32'?'node.exe':'node'));if(platform!=='win32')fs.chmodSync(path.join(out,'runtime/node'),0o755);
const runtimeLicense=path.join(path.dirname(process.execPath),platform==='win32'?'LICENSE':'../share/doc/node/LICENSE');
if(fs.existsSync(runtimeLicense))fs.copyFileSync(runtimeLicense,path.join(out,'runtime/LICENSE'));else{
  const response=await fetch('https://raw.githubusercontent.com/nodejs/node/v26.13.1/LICENSE');if(!response.ok)throw new Error('Node license unavailable');fs.writeFileSync(path.join(out,'runtime/LICENSE'),await response.text());
}
if(platform==='win32'){
  fs.writeFileSync(path.join(out,'Tanuki Setup.cmd'),'@echo off\r\n"%~dp0runtime\\node.exe" "%~dp0installer\\setup.mjs"\r\n');
  fs.writeFileSync(path.join(out,'Start Tanuki Server.cmd'),'@echo off\r\n"%~dp0runtime\\node.exe" "%~dp0installer\\start.mjs"\r\n');
}else for(const[file,script]of[['tanuki-setup','setup'],['tanuki-start','start']]){fs.writeFileSync(path.join(out,file),`#!/bin/sh\nset -eu\nROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec "$ROOT/runtime/node" "$ROOT/installer/${script}.mjs" "$@"\n`,{mode:0o755});}
const files={};function walk(dir){for(const entry of fs.readdirSync(path.join(out,dir),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const file=path.posix.join(dir,entry.name);if(entry.isSymbolicLink())throw new Error('Release symlink rejected: '+file);if(entry.isDirectory())walk(file);else files[file]=createHash('sha256').update(fs.readFileSync(path.join(out,file))).digest('hex');}}walk('');
fs.writeFileSync(path.join(out,'release-manifest.json'),JSON.stringify({format:1,version:pkg.version,node:process.version,platform,arch,commit:process.env.GITHUB_SHA||spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim(),files},null,2)+'\n');
console.log(out);
