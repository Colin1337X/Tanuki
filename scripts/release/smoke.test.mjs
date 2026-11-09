import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawn} from 'node:child_process';import {once} from 'node:events';import {createServer} from 'node:http';
import {createSetup} from '../../installer/setup.mjs';
test('Packaged runtime provisions a private profile and serves a production login without bootstrap defaults',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'tanuki-release-smoke-')),profile=path.join(root,'profile'),setup=await createSetup({profile});let child;
  const portProbe=createServer();portProbe.listen(0,'127.0.0.1');await once(portProbe,'listening');const port=portProbe.address().port;await new Promise(r=>portProbe.close(r));
  const settings={origin:'https://synthetic.example.org',port,username:'release-admin',password:'synthetic release password 9291',providerUrl:'',providerKey:''};
  try{
    const response=await fetch(setup.origin+'/api/install',{method:'POST',headers:{Authorization:'Bearer '+setup.token,'Content-Type':'application/json',Origin:setup.origin},body:JSON.stringify(settings)});assert.equal(response.status,201,await response.text());
    for(const file of ['config.json','keyring.json','secrets.json','data/tanuki.sqlite'])assert.equal(fs.readFileSync(path.join(profile,file)).includes(Buffer.from(settings.password)),false,file);
    child=spawn(process.execPath,['installer/start.mjs'],{cwd:new URL('../../',import.meta.url),env:{...process.env,TANUKI_PROFILE_DIR:profile,ADMIN_PASSWORD:'must-not-be-inherited',TANUKI_TRUSTED_WORKER:'1'},stdio:['ignore','pipe','pipe'],windowsHide:true});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
    const until=Date.now()+10000;while(!output.includes('Tanuki is listening')&&Date.now()<until&&child.exitCode===null)await new Promise(r=>setTimeout(r,50));assert.match(output,/Tanuki is listening/);
    const login=await fetch(`http://127.0.0.1:${port}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json',Origin:settings.origin},body:JSON.stringify({username:settings.username,password:settings.password})});assert.equal(login.status,200);assert.match(login.headers.get('set-cookie'),/Secure/);assert.match(login.headers.get('cache-control'),/no-store/);
    const bad=await fetch(`http://127.0.0.1:${port}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'admin123'})});assert.equal(bad.status,401);
  }finally{await setup.close();if(child&&child.exitCode===null){const ended=once(child,'exit');child.kill();await ended;}}
});
