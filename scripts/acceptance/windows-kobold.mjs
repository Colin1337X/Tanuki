import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createSetup} from '../../installer/setup.mjs';
import {restrictDirectory} from '../../installer/profile.mjs';

assert.equal(process.platform,'win32','Run this acceptance on Windows');
const installed=process.env.TANUKI_WINDOWS_INSTALL_DIR;
assert.ok(installed && path.isAbsolute(installed),'Set TANUKI_WINDOWS_INSTALL_DIR to the disposable installed application directory');
const root=fs.mkdtempSync(installed+'/validation-'),profile=path.join(root,'profile');
restrictDirectory(root);
const password=randomBytes(24).toString('base64url');
let child,proxy,browser,setup,logs='',cookie,alice,bob,story;
const checks=[];
function passed(name){checks.push(name);console.log('PASS '+name);}
async function listen(server){server.listen(0,'127.0.0.1');await once(server,'listening');return server.address().port;}
const probe=http.createServer(),port=await listen(probe);await new Promise(r=>probe.close(r));
const cert=path.join(root,'tls.crt'),key=path.join(root,'tls.key');
const tls=spawnSync(process.env.TANUKI_TEST_OPENSSL || 'C:/Program Files/Git/usr/bin/openssl.exe',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=tanuki.test','-addext','subjectAltName=DNS:tanuki.test'],{encoding:'utf8',windowsHide:true});
assert.equal(tls.status,0,tls.stderr);
proxy=https.createServer({key:fs.readFileSync(key),cert:fs.readFileSync(cert)},(req,res)=>{
 const upstream=http.request({hostname:'127.0.0.1',port,path:req.url,method:req.method,headers:{...req.headers,'x-forwarded-proto':'https'}},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});
 upstream.on('error',()=>{res.writeHead(502);res.end();});req.pipe(upstream);
});
const tlsPort=await listen(proxy),origin='https://tanuki.test:'+tlsPort;
function request(route,{body,cookie,method=body===undefined?'GET':'POST'}={}){
 return new Promise((resolve,reject)=>{
 const req=https.request({hostname:'127.0.0.1',port:tlsPort,servername:'tanuki.test',ca:fs.readFileSync(cert),path:route,method,headers:{Host:'tanuki.test:'+tlsPort,Origin:origin,...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},timeout:150000},res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>{let json;try{json=JSON.parse(text);}catch{}resolve({status:res.statusCode,headers:res.headers,json,text});});});
 req.on('error',reject);req.on('timeout',()=>req.destroy(new Error('Request timeout')));req.end(body?JSON.stringify(body):undefined);
 });
}
async function start(){
 logs='';child=spawn(installed+'/runtime/node.exe',['installer/start.mjs'],{cwd:installed,env:{...process.env,TANUKI_PROFILE_DIR:profile},stdio:['ignore','pipe','pipe'],windowsHide:true});
 child.stdout.on('data',c=>logs+=c);child.stderr.on('data',c=>logs+=c);
 for(let i=0;i<200&&!logs.includes('Tanuki is listening');i++){if(child.exitCode!==null)throw new Error(logs);await new Promise(r=>setTimeout(r,50));}
 assert.match(logs,/Tanuki is listening/);
}
async function stop(){if(child&&child.exitCode===null){const exit=once(child,'exit');child.kill();await exit;}}
async function login(username){const r=await request('/api/auth/login',{body:{username,password}});assert.equal(r.status,200,r.text);return r.headers['set-cookie'][0].split(';')[0];}
try{
 setup=await createSetup({profile});
 const r=await fetch(setup.origin+'/api/install',{method:'POST',headers:{Authorization:'Bearer '+setup.token,'Content-Type':'application/json',Origin:setup.origin},body:JSON.stringify({origin,port,username:'win-principal',password,providerUrl:'http://127.0.0.1:8080/v1',providerKey:''})});
 assert.equal(r.status,201,await r.text());await setup.close();setup=null;passed('Windows profile provisioning accepts local keyless KoboldCpp');
 await start();passed('Installed Node 26.13.1 launches production server');
 const loginResult=await request('/api/auth/login',{body:{username:'win-principal',password}});
 assert.equal(loginResult.status,200);assert.match(loginResult.headers['set-cookie'][0],/Secure/);assert.match(loginResult.headers['set-cookie'][0],/HttpOnly/);assert.match(loginResult.headers['cache-control'],/no-store/);
 cookie=loginResult.headers['set-cookie'][0].split(';')[0];passed('HTTPS login has secure cookies and private cache control');
 for(const username of ['win-reader','win-other']){const r=await request('/api/admin/students',{cookie,body:{username,password}});assert.ok([200,201].includes(r.status),r.text);}
 alice=await login('win-reader');bob=await login('win-other');passed('Administrator creates isolated synthetic student accounts');
 assert.equal((await request('/api/student/onboarding',{cookie:alice,body:{readingLevel:'Elementary',lexileTarget:650,preferences:{theme:'classroom'}}})).status,200);
 const preferences=await request('/api/student/onboarding',{cookie:alice});assert.equal(preferences.json.lexileTarget,650);assert.equal(preferences.json.preferences.theme,'classroom');passed('Lexile and Classroom preferences persist');
 const generated=await request('/api/stories/generate',{cookie:alice,body:{request:'Write exactly three short sentences about a friendly fox finding a blue pebble. No title. No preamble.',chapterCount:1}});
 assert.equal(generated.status,200,generated.text);assert.equal(generated.json.username,'win-reader');assert.ok(generated.json.story.length>20);story=generated.json;
 passed('Actual KoboldCpp generation returns and persists owned story text');
 const isolated=await request('/api/stories/'+story.id,{cookie:bob});assert.ok([403,404].includes(isolated.status));passed('Second student cannot retrieve generated story');
 browser=await chromium.launch({headless:true,args:['--host-resolver-rules=MAP tanuki.test 127.0.0.1','--no-proxy-server']});
 // Self-signed certificate acceptance is restricted to this disposable browser context.
 // Node HTTPS checks above use this fixture's exact CA; the system trust store is untouched.
 const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/login');await page.getByLabel('Username',{exact:true}).fill('win-reader');await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:/Sign in/}).click();await page.getByLabel('Your story idea',{exact:true}).waitFor({timeout:15000});
 assert.equal(await page.evaluate(()=>document.fonts.check('16px Jua')),true);
 await page.screenshot({path:'coverage/windows-kobold-classroom.png',fullPage:true});assert.deepEqual(errors,[]);passed('Real Windows Chromium login renders Classroom with Jua without script errors');
 await stop();await start();
 const recovered=await request('/api/stories/'+story.id,{cookie:alice});assert.equal(recovered.status,200);assert.equal(recovered.json.story,story.story);passed('Forced Windows restart preserves session and generated story');
 const logout=await request('/api/auth/logout',{cookie:alice,body:{}});assert.equal(logout.status,200);assert.equal((await request('/api/auth/me',{cookie:alice})).status,401);passed('Logged-out session cannot be replayed');
 for(const file of ['config.json','keyring.json','secrets.json','data/tanuki.sqlite'])assert.equal(fs.readFileSync(path.join(profile,file)).includes(Buffer.from(password)),false);
 passed('Synthetic password absent from persisted configuration and SQLite');
 fs.writeFileSync('coverage/windows-kobold-result.json',JSON.stringify({checks,profile,node:process.version,provider:'http://127.0.0.1:8080/v1',storyCharacters:story.story.length,systemTrustChanged:false},null,2));
}finally{
 if(browser)await browser.close();if(setup)await setup.close();await stop();proxy.closeAllConnections();await new Promise(r=>proxy.close(r));
 console.log(JSON.stringify({passed:checks.length,profile}));
}
