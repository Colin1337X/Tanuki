import test from 'node:test';import assert from 'node:assert/strict';
import {clientAddress} from '../../server/lib/client-address.js';
import {isolate,provisionKeys,password} from './helpers.js';
isolate();await provisionKeys();const db=await import('../../server/lib/database.js'),auth=await import('../../server/lib/auth.js');
test.after(()=>db.closeDatabase());
test('Forwarded addresses from untrusted peers never affect rate-limit identity',()=>{assert.equal(clientAddress('192.0.2.8','198.51.100.5','127.0.0.1'),'192.0.2.8');assert.equal(clientAddress('127.0.0.1','198.51.100.5',''),'127.0.0.1');});
test('Trusted proxy uses the final appended address and normalizes mapped IPv4',()=>{assert.equal(clientAddress('::ffff:127.0.0.1','spoofed, 198.51.100.5','127.0.0.1'),'198.51.100.5');assert.equal(clientAddress('::1','2001:db8::5','::1'),'2001:db8::5');});
test('Malformed or oversized proxy headers fail back to the actual socket peer',()=>{for(const h of ['hostname',undefined,'198.51.100.5:80','x'.repeat(1025)])assert.equal(clientAddress('127.0.0.1',h,'127.0.0.1'),'127.0.0.1');});
test('Real concurrent Argon2 verification is bounded and capacity recovers after completion',async()=>{
  db.putUser({username:'capacity',password,role:'student'});
  const results=await Promise.allSettled(Array.from({length:12},()=>auth.validateCredentials('capacity',password)));
  assert.equal(results.filter(r=>r.status==='fulfilled'&&r.value?.username==='capacity').length,4);
  const rejected=results.filter(r=>r.status==='rejected');assert.equal(rejected.length,8);assert.ok(rejected.every(r=>r.reason.status===429));
  assert.equal((await auth.validateCredentials('capacity',password)).username,'capacity');assert.equal(await auth.validateCredentials('capacity','incorrect'),null);assert.equal((await auth.validateCredentials('capacity',password)).username,'capacity');
});

test('HTTP login rate limits isolate clients only behind an explicitly trusted proxy',async()=>{
  const {createAppServer}=await import('../../server/index.js'),{once}=await import('node:events');const server=createAppServer();server.listen(0,'127.0.0.1');await once(server,'listening');
  const previous=process.env.TANUKI_TRUSTED_PROXY_IPS;process.env.TANUKI_TRUSTED_PROXY_IPS='127.0.0.1';
  const url=`http://127.0.0.1:${server.address().port}/api/auth/login`;
  const request=xff=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Forwarded-For':xff},body:JSON.stringify({username:'capacity',password})});
  try{
    db.database().prepare('INSERT INTO rate_limits VALUES(?,?,?)').run('ip:198.51.100.1',100,Date.now()+60000);
    assert.equal((await request('198.51.100.1')).status,429);
    assert.equal((await request('198.51.100.2')).status,200);
    assert.equal((await request('198.51.100.2, 198.51.100.1')).status,429);
    delete process.env.TANUKI_TRUSTED_PROXY_IPS;
    assert.equal((await request('198.51.100.1')).status,200);
  }finally{if(previous===undefined)delete process.env.TANUKI_TRUSTED_PROXY_IPS;else process.env.TANUKI_TRUSTED_PROXY_IPS=previous;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
