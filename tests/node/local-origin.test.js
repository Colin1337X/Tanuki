import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {request as httpRequest} from 'node:http';
import {isolate,provisionKeys,password} from './helpers.js';
import {allowedMutation} from '../../server/lib/request-origin.js';
isolate();await provisionKeys();
process.env.APP_ORIGIN='https://stories.school.test';
const db=await import('../../server/lib/database.js');
const {createAppServer}=await import('../../server/index.js');
const server=createAppServer();server.listen(0,'0.0.0.0');await once(server,'listening');
const port=server.address().port;
after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));db.closeDatabase();});
function post(host,origin,extra={}){
 return new Promise((resolve,reject)=>{
  const req=httpRequest({hostname:'127.0.0.1',port,path:'/api/auth/login',method:'POST',headers:{Host:host,Origin:origin,'Content-Type':'application/json',...extra}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});
  req.on('error',reject);req.end(JSON.stringify({username:'nobody',password}));
 });
}
test('All-interface listener accepts direct same-origin localhost and IPv4 loopback mutations',async()=>{
 assert.equal(server.address().address,'0.0.0.0');
 for(const host of ['localhost:'+port,'127.0.0.1:'+port])assert.equal(await post(host,'http://'+host),401,'Request reaches authentication rather than failing CSRF');
});
test('Local-origin exception still rejects wrong ports, cross-host and cross-site requests',async()=>{
 const host='localhost:'+port;
 for(const origin of ['http://localhost:'+(port+1),'http://localhost.evil.test:'+port,'null','http://127.0.0.1:'+port,'http://0.0.0.0:'+port])assert.equal(await post(host,origin),403);
 assert.equal(await post(host,'http://'+host,{'Sec-Fetch-Site':'cross-site'}),403);
});
test('Proxy headers cannot turn a remote request into local-origin permission',async()=>{
 const host='localhost:'+port;
 for(const headers of [{'X-Forwarded-For':'127.0.0.1'},{'X-Forwarded-Host':host},{Forwarded:'for=127.0.0.1'}])assert.equal(await post(host,'http://'+host,headers),403);
});
test('Canonical public origin remains usable behind a proxy',async()=>{
 assert.equal(await post('stories.school.test','https://stories.school.test',{'X-Forwarded-Proto':'https'}),401);
});
test('IPv6 local origin requires a local socket and exact destination port',()=>{
 const req={headers:{host:'[::1]:3000',origin:'http://[::1]:3000'},socket:{remoteAddress:'::1',localPort:3000}};
 assert.equal(allowedMutation(req,'https://stories.school.test'),true);
 assert.equal(allowedMutation({...req,socket:{remoteAddress:'192.0.2.10',localPort:3000}},'https://stories.school.test'),false);
});

test('Production browser can sign in on loopback without weakening Secure cookies',async()=>{
 const {chromium}=await import('playwright');
 const store=await import('../../server/lib/storage.js');
 store.addStoredUser({username:'local-reader',password,role:'student',onboardingCompleted:true});
 process.env.NODE_ENV='production';
 const browser=await chromium.launch({headless:true});
 try{
  for(const host of ['127.0.0.1','localhost']){
   const context=await browser.newContext(),page=await context.newPage();
   await page.goto('http://'+host+':'+port+'/login');
   await page.getByLabel('Username',{exact:true}).fill('local-reader');
   await page.getByLabel('Password',{exact:true}).fill(password);
   await page.getByRole('button',{name:/Sign in/}).click();
   await page.getByLabel('Your story idea',{exact:true}).waitFor();
   const me=await page.evaluate(async()=>{const r=await fetch('/api/auth/me');return {status:r.status,json:await r.json()};});
   assert.equal(me.status,200);assert.equal(me.json.user.username,'local-reader');
   const session=(await context.cookies()).find(c=>c.name==='tanuki_session');
   assert.equal(session.secure,true);assert.equal(session.httpOnly,true);
   await context.close();
  }
 }finally{await browser.close();process.env.NODE_ENV='test';}
});
