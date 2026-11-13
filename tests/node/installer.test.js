import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {chromium} from 'playwright';
import {createSetup} from '../../installer/setup.mjs';import {validateSettings} from '../../installer/profile.mjs';
import {request as rawRequest} from 'node:http';
import {spawnSync} from 'node:child_process';
const settings={origin:'https://stories.synthetic.example',port:31821,username:'principal',password:' a synthetic passphrase 123 ',providerUrl:'https://provider.synthetic.example/v1',providerKey:'synthetic-install-provider-secret'};
test('Setup supports the same HTTPS domain or IP endpoint for browsers and native clients',()=>{
  for(const origin of ['https://stories.school.test','https://192.168.1.20:8443','https://[2001:db8::20]:8443']){
    assert.equal(validateSettings({...settings,origin}).origin,origin);
  }
  for(const origin of ['https://[::]','https://[::1]','https://school.test:0','https://[2001:db8::20]/admin'])assert.throws(()=>validateSettings({...settings,origin}));
});
async function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'tanuki-installer-'));return createSetup({profile:path.join(root,'profile')});}
async function request(s,body,headers={}){const options={method:'POST',headers:{Authorization:'Bearer '+s.token,'Content-Type':'application/json',Origin:s.origin,...headers}},data=typeof body==='string'?body:JSON.stringify(body);if(headers.Host)return new Promise((resolve,reject)=>{const req=rawRequest(s.origin+'/api/install',options,res=>{res.resume();res.on('end',()=>resolve({status:res.statusCode}));});req.on('error',reject);req.end(data);});return fetch(s.origin+'/api/install',{...options,body:data});}
test('Setup rejects insecure origins, unbounded ports, weak credentials and embedded provider credentials',()=>{
  for(const patch of[{origin:'http://stories.example.org'},{origin:'https://a:b@stories.example.org'},{origin:'https://stories.example.org/path'},{origin:'https://127.0.0.1'},{port:80},{port:65536},{port:3.5},{username:'../admin'},{password:'short'},{providerUrl:'https://key@provider.example/v1'},{providerUrl:''},{surprise:'field'}])assert.throws(()=>validateSettings({...settings,...patch}));
  assert.equal(validateSettings(settings).password,settings.password);
});
test('Setup secrets and install operations require the launch capability',async()=>{const s=await fixture();try{for(const authorization of['','Bearer wrong','Bearer '+'é'.repeat(43),s.token])assert.equal((await request(s,settings,{Authorization:authorization})).status,401);assert.equal(fs.existsSync(s.profile),false);}finally{await s.close();}});
test('Setup rejects cross-origin requests, DNS rebinding Host, wrong methods and non-JSON requests',async()=>{const s=await fixture();try{assert.equal((await request(s,settings,{Origin:'https://untrusted.example'})).status,403);assert.equal((await request(s,settings,{Host:'rebind.example'})).status,403);assert.equal((await request(s,settings,{'Content-Type':'text/plain'})).status,415);assert.equal((await fetch(s.origin+'/api/install',{headers:{Authorization:'Bearer '+s.token}})).status,404);}finally{await s.close();}});
test('Malformed and oversized setup requests do not create a partial profile',async()=>{const s=await fixture();try{for(const body of['{','null','[]',JSON.stringify({huge:'x'.repeat(17000)})])assert.equal((await request(s,body)).status,400);assert.equal(fs.existsSync(s.profile),false);}finally{await s.close();}});
test('Concurrent installation publishes one profile, keeps credentials off disk and refuses reinstall',async()=>{
  const s=await fixture();try{const replies=await Promise.all([request(s,settings),request(s,settings)]);assert.deepEqual(replies.map(r=>r.status).sort(),[201,409]);assert.equal((await request(s,settings)).status,409);
    for(const file of ['config.json','keyring.json','secrets.json','data/tanuki.sqlite']){const content=fs.readFileSync(path.join(s.profile,file));for(const secret of [settings.password,settings.providerKey])assert.equal(content.includes(Buffer.from(secret)),false,file);}
    assert.equal(fs.readFileSync(path.join(s.profile,'data/tanuki.sqlite')).includes(Buffer.from('$argon2id$')),true);if(process.platform!=='win32')assert.equal(fs.statSync(s.profile).mode&0o777,0o700);
  }finally{await s.close();}
});
test('Existing data is preserved even when the profile lacks an installation marker',async()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'tanuki-installer-existing-')),profile=path.join(root,'profile');fs.mkdirSync(profile);fs.writeFileSync(path.join(profile,'sentinel'),'existing private records');const s=await createSetup({profile});try{assert.equal((await request(s,settings)).status,409);assert.equal(fs.readFileSync(path.join(profile,'sentinel'),'utf8'),'existing private records');}finally{await s.close();}});

test('Provider rotation authenticates the new destination and credential together and preserves them on invalid updates',async()=>{
  const s=await fixture();try{
    assert.equal((await request(s,settings)).status,201);
    const next={providerUrl:'https://replacement.synthetic.example/v1',providerKey:'synthetic-rotated-key'},env={...process.env,TANUKI_PROFILE_DIR:s.profile,TANUKI_KEYRING_FILE:path.join(s.profile,'keyring.json')};
    const update=input=>spawnSync(process.execPath,['installer/provider.mjs'],{env,input:JSON.stringify(input),encoding:'utf8',timeout:15000});
    const result=update(next);assert.equal(result.status,0,result.stderr);assert.equal((result.stdout+result.stderr).includes(next.providerKey),false);
    const file=path.join(s.profile,'secrets.json');let sealed=fs.readFileSync(file,'utf8');assert.equal(sealed.includes(next.providerKey),false);
    const opened=spawnSync(process.execPath,['--input-type=module','-e',"import fs from 'node:fs';import {unseal} from './server/lib/crypto.js';process.stdout.write(unseal(fs.readFileSync(process.argv[1],'utf8'),'installation-provider-v1'));",file],{env,encoding:'utf8',timeout:15000});
    assert.equal(opened.status,0,opened.stderr);assert.deepEqual(JSON.parse(opened.stdout),next);
    for(const patch of[{providerUrl:'http://insecure.synthetic.example'},{providerUrl:'https://user:secret@provider.synthetic.example'},{providerUrl:''}]){assert.notEqual(update({...next,...patch}).status,0);assert.equal(fs.readFileSync(file,'utf8'),sealed);}
    const keyless={...next,providerKey:''};assert.equal(update(keyless).status,0);sealed=fs.readFileSync(file,'utf8');
    const keylessRead=spawnSync(process.execPath,['--input-type=module','-e',"import fs from 'node:fs';import {unseal} from './server/lib/crypto.js';process.stdout.write(unseal(fs.readFileSync(process.argv[1],'utf8'),'installation-provider-v1'));",file],{env,encoding:'utf8'});assert.equal(keylessRead.status,0);assert.deepEqual(JSON.parse(keylessRead.stdout),keyless);
    fs.writeFileSync(file+'.new','interrupted update');assert.notEqual(update({...next,providerKey:'another-synthetic-key'}).status,0);assert.equal(fs.readFileSync(file,'utf8'),sealed);assert.equal(fs.readFileSync(file+'.new','utf8'),'interrupted update');
  }finally{await s.close();}
});
test('Setup frontend is local-only, no-store, framed out and serves no arbitrary files',async()=>{const s=await fixture();try{const response=await fetch(s.origin);assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await fetch(s.origin+'/keyring.json')).status,404);assert.equal((await fetch(s.origin+'/../package.json')).status,404);assert.equal((await fetch(s.origin+'/api/state',{headers:{Authorization:'Bearer '+s.token}})).status,200);}finally{await s.close();}});
test('Desktop graphical installer completes provisioning without retaining credentials in browser storage',async()=>{
  const s=await fixture(),browser=await chromium.launch({headless:true});try{
    const page=await browser.newPage({viewport:{width:1240,height:940}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(s.origin+'/#'+s.token);await page.getByLabel('Your public web address').fill(settings.origin);
    fs.mkdirSync('coverage',{recursive:true});await page.screenshot({path:'coverage/installer-desktop.png',fullPage:true});assert.equal(new URL(page.url()).hash,'');
    await page.getByRole('button',{name:/Continue/}).click();await page.getByLabel('Administrator username').fill(settings.username);await page.getByLabel('Password',{exact:true}).fill(settings.password);await page.getByLabel('Repeat password').fill(settings.password);await page.getByRole('button',{name:/Continue/}).click();
    await page.getByRole('button',{name:/Create my workspace/}).click();await page.getByRole('heading',{name:'Welcome home.'}).waitFor();assert.equal(fs.existsSync(path.join(s.profile,'installed')),true);assert.deepEqual(await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length})),{local:0,session:0});assert.deepEqual(errors,[]);await page.screenshot({path:'coverage/installer-complete.png',fullPage:true});
  }finally{await browser.close();await s.close();}
});
test('Mobile graphical installer preserves labels, keyboard focus and layout',async()=>{const s=await fixture(),browser=await chromium.launch({headless:true});try{const page=await browser.newPage({viewport:{width:375,height:812}});await page.goto(s.origin+'/#'+s.token);await page.getByLabel('Your public web address').waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(await page.locator('input').evaluateAll(inputs=>inputs.filter(i=>!i.labels.length).map(i=>i.id)),[]);await page.getByLabel('Your public web address').fill(settings.origin);await page.getByRole('button',{name:/Continue/}).click();assert.equal(await page.evaluate(()=>document.activeElement.tagName),'H2');await page.screenshot({path:'coverage/installer-mobile.png',fullPage:true});}finally{await browser.close();await s.close();}});
