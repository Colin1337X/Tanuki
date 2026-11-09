import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { chromium } from 'playwright';
import fs from 'node:fs';
import { isolate, provisionKeys, password } from './helpers.js';
isolate(); await provisionKeys(); process.env.TANUKI_RECIPIENT_ENCRYPTION = '1';
const db = await import('../../server/lib/database.js'), auth = await import('../../server/lib/auth.js'), store = await import('../../server/lib/storage.js');
const { recipient } = await import('../../server/lib/recipient-crypto.js');
const { responseQueue, closeResponseQueue } = await import('../../server/lib/recipient-service.js');
const { createAppServer } = await import('../../server/index.js');
let release;
const provider = createServer(async(req,res) => {
  for await(const _ of req) {}
  res.setHeader('Content-Type','text/event-stream');
  res.write('data: '+JSON.stringify({choices:[{delta:{content:'A synthetic fox. '.repeat(80)}}]})+'\n\n');
  await new Promise(resolve=>{release=resolve;res.once('close',resolve);});
  res.end('data: '+JSON.stringify({choices:[{delta:{content:'The final page.'}}]})+'\n\ndata: [DONE]\n\n');
}); provider.listen(0,'127.0.0.1');await once(provider,'listening');
const server=createAppServer();server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
db.putUser({username:'alice',password,role:'student',onboardingCompleted:true,readingLevel:'Elementary'});
store.saveConfig({...store.getConfig(),apiBaseUrl:`http://127.0.0.1:${provider.address().port}/v1`});
const token=auth.createSessionToken({username:'alice'}), secret=randomBytes(32).toString('hex'), pair=await recipient.generate(secret), key=await recipient.unlock(pair.privateKey,secret), fp=key.getFingerprint();
const command={v:1,username:'alice',device:fp,nonce:randomBytes(32).toString('hex'),time:Date.now(),action:'enroll',payload:{publicKey:pair.publicKey}};
assert.equal((await fetch(origin+'/api/protected',{method:'POST',headers:{Cookie:'tanuki_session='+token,'Content-Type':'application/json'},body:JSON.stringify({command,signature:await recipient.sign(key,JSON.stringify(command))})})).status,200);
const backup={v:1,username:'alice',publicKey:pair.publicKey,privateKey:pair.privateKey}, browser=await chromium.launch({headless:true}), coverage=[];
after(async()=>{fs.mkdirSync('coverage',{recursive:true});fs.writeFileSync('coverage/protected-browser-v8.json',JSON.stringify(coverage));release?.();await closeResponseQueue();await browser.close();for(const s of[server,provider]){s.closeAllConnections();await new Promise(r=>s.close(r));}db.closeDatabase();});
async function visit(theme='studio',width=1280,saved={}) {
  const context=await browser.newContext({viewport:{width,height:900}});
  await context.addCookies([{name:'tanuki_session',value:token,url:origin}]);
  await context.addInitScript(({backup,theme,saved})=>{localStorage.setItem('tanuki_theme',theme);localStorage.setItem('tanuki-vault:alice:device',JSON.stringify(backup));for(const[k,v]of Object.entries(saved))localStorage.setItem(k,v);},{backup,theme,saved});
  const page=await context.newPage();await page.coverage.startJSCoverage({resetOnNavigation:false});const close=context.close.bind(context);context.close=async()=>{coverage.push(...await page.coverage.stopJSCoverage());await close();};await page.goto(origin+'/student');await page.getByRole('button',{name:'Encrypted workspace'}).click();
  await page.getByLabel('Recovery secret',{exact:true}).fill(secret);await page.getByRole('button',{name:'Unlock saved device'}).click();
  await page.getByLabel('Draft or explicitly disclosed AI prompt').waitFor();return{context,page};
}
for(const theme of ['studio','classroom','focus'])test(`${theme}: protected editor is labelled, responsive, and saves client-encrypted text`,async()=>{
  const{context,page}=await visit(theme,375);try{
    const marker='BROWSER_PRIVATE_'+randomBytes(16).toString('hex'),uploads=[];
    page.on('request',r=>{if(r.url().endsWith('/api/protected'))uploads.push(r.postData()||'');});
    await page.getByLabel('Draft or explicitly disclosed AI prompt').fill(marker);await page.getByRole('button',{name:'Save encrypted draft',exact:true}).click();
    await page.getByRole('button',{name:/private · alice/}).last().waitFor();
    const docs=db.getRecords('protected-documents'),stored=docs.at(0);
    assert.equal((await recipient.decrypt(key,stored.ciphertext,{owner:'alice'},pair.publicKey)).text,marker);
    assert.equal(uploads.some(body=>body.includes(marker)),false);
    assert.equal(await page.evaluate(marker=>JSON.stringify(localStorage).includes(marker),marker),false);
    const layout=await page.locator('#modal').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));assert.ok(layout.scroll<=layout.width+2);
    const labels=await page.locator('#modal').evaluate(el=>[...el.querySelectorAll('input,select,textarea')].filter(e=>!e.labels.length&&!e.getAttribute('aria-label')).map(e=>e.id));assert.deepEqual(labels,[]);
  }finally{await context.close();}
});
test('Browser refuses classroom sharing until teacher identity is externally pinned',async()=>{
  const{context,page}=await visit();try{await page.getByLabel('Privacy',{exact:true}).selectOption('classroom');await page.getByLabel('Draft or explicitly disclosed AI prompt').fill('Private classroom draft');const before=db.getRecords('protected-documents').length;await page.getByRole('button',{name:'Save encrypted draft',exact:true}).click();await page.getByText('Verify the teacher fingerprint through a separate trusted channel first.',{exact:true}).waitFor();assert.equal(db.getRecords('protected-documents').length,before);}finally{await context.close();}
});
test('Fresh browser generates its private key locally and saves recovery material before enrollment',async()=>{
  db.putUser({username:'carol',password,role:'student',onboardingCompleted:true,readingLevel:'Elementary'});
  const context=await browser.newContext();await context.addCookies([{name:'tanuki_session',value:auth.createSessionToken({username:'carol'}),url:origin}]);const page=await context.newPage();
  try{const uploads=[];page.on('request',r=>{if(r.url().endsWith('/api/protected'))uploads.push(r.postData()||'');});await page.goto(origin+'/student');await page.getByRole('button',{name:'Encrypted workspace',exact:true}).click();
    const download=page.waitForEvent('download');await page.getByRole('button',{name:'Create device',exact:true}).click();await download;
    const recovery=await page.locator('#vault-new-secret').textContent();assert.match(recovery,/^[a-f0-9]{64}$/);assert.equal(db.getRecords('recipient-devices').some(d=>d.username==='carol'),false);
    assert.equal(await page.evaluate(secret=>JSON.stringify(localStorage).includes(secret),recovery),false);
    await page.getByRole('button',{name:'I saved the recovery secret',exact:true}).click();await page.getByLabel('Draft or explicitly disclosed AI prompt').waitFor();
    assert.equal(db.getRecords('recipient-devices').filter(d=>d.username==='carol').length,1);assert.equal(uploads.some(body=>body.includes(recovery)||body.includes('BEGIN PGP PRIVATE KEY BLOCK')),false);
  }finally{await context.close();}
});
test('Browser closure does not stop provider; a fresh browser resumes from encrypted checkpoint',async()=>{
  let{context,page}=await visit();await page.getByLabel('Draft or explicitly disclosed AI prompt').fill('A synthetic fox.');await page.getByLabel('I authorize sending this text to the server and AI provider.').check();await page.getByRole('button',{name:'Generate encrypted response',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('vault-output')?.textContent.includes('A synthetic fox.'));
  const saved=await page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)])));
  assert.equal(JSON.stringify(saved).includes('A synthetic fox.'),false);
  const job=JSON.parse(saved['tanuki-vault:alice:generation']);await context.close();
  assert.equal(responseQueue().row(job.id).state,'running');const done=responseQueue().workers.get(job.id).done;release();await done;assert.equal(responseQueue().row(job.id).state,'complete');
  ({context,page}=await visit('focus',1280,saved));try{await page.getByRole('button',{name:'Resume last generation',exact:true}).click();await page.waitForFunction(()=>document.getElementById('vault-status')?.textContent.startsWith('complete'));
    assert.equal(await page.locator('#vault-output').textContent(),'A synthetic fox. '.repeat(80)+'The final page.');
    assert.equal(await page.evaluate(()=>JSON.stringify(localStorage).includes('The final page.')),false);
  }finally{await context.close();}
});
