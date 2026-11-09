import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { isolate, provisionKeys, password } from './helpers.js';
isolate(); await provisionKeys(); process.env.TANUKI_RECIPIENT_ENCRYPTION = '1';
const db = await import('../../server/lib/database.js'), auth = await import('../../server/lib/auth.js'), store = await import('../../server/lib/storage.js');
const { recipient } = await import('../../server/lib/recipient-crypto.js');
const { responseQueue, closeResponseQueue } = await import('../../server/lib/recipient-service.js');
const { createAppServer } = await import('../../server/index.js');
let releaseProvider, providerEntered, providerClosed, providerMode = 'normal';
const provider = createServer(async (req, res) => {
  for await (const _ of req) {} // Deliberately never retain or log the request body.
  res.setHeader('Content-Type', 'text/event-stream');
  if (providerMode === 'truncated') { res.end('data: ' + JSON.stringify({ choices: [{ delta: { content: 'Incomplete story' } }] }) + '\n\n'); return; }
  if (providerMode === 'oversized') { res.end('data: ' + 'x'.repeat(1024 * 1024 + 1)); return; }
  if (providerMode === 'blocked') {
    res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: 'Partial ' } }] }) + '\n\n');
    providerEntered?.();
    await new Promise(resolve => { releaseProvider = resolve; res.once('close', () => { providerClosed?.(); resolve(); }); });
  }
  res.end('data: ' + JSON.stringify({ choices: [{ delta: { content: 'Synthetic AI story.' } }] }) + '\n\ndata: [DONE]\n\n');
});
provider.listen(0, '127.0.0.1'); await once(provider, 'listening');
const server = createAppServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
const identities = {};
for (const [username, role] of [['alice','student'],['bob','student'],['educator','teacher'],['otherteacher','teacher'],['operator','admin']]) {
  db.putUser({ username, password, role, ...(role === 'teacher' ? { managedClassroomIds: username === 'educator' ? ['room'] : ['other'] } : {}) });
  const secret = randomBytes(32).toString('hex'), usable = await recipient.generate(secret);
  identities[username] = { ...usable, key: await recipient.unlock(usable.privateKey, secret), fingerprint: (await recipient.publicKey(usable.publicKey)).getFingerprint(), token: auth.createSessionToken({ username }), role };
}
store.saveConfig({ ...store.getConfig(), apiBaseUrl: `http://127.0.0.1:${provider.address().port}/v1`, classrooms: { room: { name: 'Classroom', members: ['alice'] }, other: { name: 'Other', members: ['bob'] } } });
async function signed(who, action, payload = {}, extra = {}) {
  const i = identities[who], command = { v: 1, username: who, device: i.fingerprint, nonce: randomBytes(32).toString('hex'), time: Date.now(), action, payload, ...extra };
  return { command, signature: await recipient.sign(i.key, JSON.stringify(command)) };
}
async function send(who, body, token = identities[who].token) {
  return fetch(origin + '/api/protected', { method: 'POST', headers: { Cookie: 'tanuki_session=' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
async function call(who, action, payload, extra) { return send(who, await signed(who, action, payload, extra)); }
const refs = (...names) => names.map(username => ({ username, fingerprint: identities[username].fingerprint }));
for (const who of Object.keys(identities)) assert.equal((await call(who, 'enroll', { publicKey: identities[who].publicKey })).status, 200);
after(async () => { releaseProvider?.(); await closeResponseQueue(); for (const s of [server, provider]) { s.closeAllConnections(); await new Promise(r => s.close(r)); } db.closeDatabase(); });

test('Protected responses remain private and noncacheable for authenticated accounts', async () => {
  const r = await call('alice', 'documents'); assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'no-store, private'); assert.equal(r.headers.get('vary'), 'Cookie, Origin');
});
test('Device command replay is rejected even under a valid application session', async () => {
  const body = await signed('alice', 'documents'); assert.equal((await send('alice', body)).status, 200); assert.equal((await send('alice', body)).status, 409);
});
test('Tampered and expired signed commands are rejected', async () => {
  const body = await signed('alice', 'documents'); body.command.action = 'revoke'; assert.equal((await send('alice', body)).status, 403);
  assert.equal((await call('alice', 'documents', {}, { time: Date.now() - 600000 })).status, 400);
});
test('A valid session alone cannot enroll an additional unauthorized key', async () => {
  const body = await signed('bob', 'enroll', { publicKey: identities.bob.publicKey }); body.command.username = 'alice';
  assert.equal((await send('alice', body)).status, 403);
});
let documentId, ciphertext;
test('Student creates private draft whose inner plaintext is unavailable to server-managed keys', async () => {
  documentId = randomUUID(); const text = 'CLIENT_ONLY_' + randomBytes(24).toString('hex');
  ciphertext = await recipient.encrypt([identities.alice.publicKey], { v: 1, purpose: 'tanuki-private-document', id: documentId, owner: 'alice', revision: 1, mode: 'private', recipients: [identities.alice.fingerprint], text }, identities.alice.key);
  const r = await call('alice', 'save', { id: documentId, revision: 1, mode: 'private', recipients: refs('alice'), ciphertext }); assert.equal(r.status, 200);
  const record = db.getRecords('protected-documents').find(d => d.id === documentId);
  assert.equal(record.ciphertext, ciphertext); assert.equal(JSON.stringify(record).includes(text), false);
  const { loadKeyring } = await import('../../server/lib/crypto.js');
  for (const managed of loadKeyring().keys.values()) await assert.rejects(recipient.decrypt(managed.privateKey, ciphertext, {}));
  assert.equal((await recipient.decrypt(identities.alice.key, ciphertext, { id: documentId }, identities.alice.publicKey)).text, text);
});
test('Student, teacher and administrator sessions cannot retrieve private drafts', async () => {
  for (const who of ['bob','educator','operator']) {
    const r = await call(who, 'documents'); assert.equal(r.status, 200); assert.equal((await r.json()).documents.some(d => d.id === documentId), false);
  }
});
test('Cross-classroom and administrator recipient injection is rejected', async () => {
  for (const who of ['otherteacher','operator','bob']) assert.equal((await call('alice', 'save', { id: randomUUID(), revision: 1, mode: 'classroom', recipients: refs('alice', who), ciphertext })).status, 403);
});
test('Private mode cannot silently include an educator recipient', async () => {
  assert.equal((await call('alice', 'save', { id: randomUUID(), revision: 1, mode: 'private', recipients: refs('alice','educator'), ciphertext })).status, 403);
});
test('Concurrent revision updates accept exactly one writer', async () => {
  const payload = { id: documentId, revision: 2, mode: 'private', recipients: refs('alice'), ciphertext };
  const results = await Promise.all([call('alice', 'save', payload), call('alice', 'save', payload)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200,409]);
});
test('Authorized teacher decrypts a classroom submission, then loses API access on reassignment', async () => {
  const id = randomUUID(), text = 'A classroom submission', encrypted = await recipient.encrypt([identities.alice.publicKey, identities.educator.publicKey], { id, text }, identities.alice.key);
  assert.equal((await call('alice', 'save', { id, revision: 1, mode: 'classroom', recipients: refs('alice','educator'), ciphertext: encrypted })).status, 200);
  const docs = (await (await call('educator', 'documents')).json()).documents; assert.ok(docs.some(d => d.id === id));
  assert.equal((await recipient.decrypt(identities.educator.key, encrypted, { id }, identities.alice.publicKey)).text, text);
  store.updateStoredUser('educator', { managedClassroomIds: [] });
  assert.equal((await (await call('educator', 'documents')).json()).documents.some(d => d.id === id), false);
  store.updateStoredUser('educator', { managedClassroomIds: ['room'] });
});
test('AI generation requires explicit plaintext-disclosure consent', async () => {
  assert.equal((await call('alice', 'generate', { prompt: 'A fox', mode: 'private', recipients: refs('alice') })).status, 400);
});
let job;
test('Generation continues when the initiating HTTP response has ended', async () => {
  providerMode = 'blocked'; const entered = new Promise(resolve => { providerEntered = resolve; });
  const r = await call('alice', 'generate', { prompt: 'A fox', discloseToAI: true, mode: 'classroom', recipients: refs('alice','educator') });
  assert.equal(r.status, 200); job = await r.json(); await entered;
  assert.equal(responseQueue().row(job.id).state, 'running');
  releaseProvider(); await responseQueue().workers.get(job.id).done;
  assert.equal(responseQueue().row(job.id).state, 'complete'); providerMode = 'normal';
});
test('Concurrent authenticated reconnects are isolated and decryptable for authorized teacher', async () => {
  const requests = await Promise.all([call('alice','resume',{id:job.id}),call('alice','resume',{id:job.id}),call('educator','resume',{id:job.id}),call('bob','resume',{id:job.id}),call('operator','resume',{id:job.id})]);
  assert.deepEqual(requests.map(r=>r.status),[200,200,200,404,404]);
  const [a,b,t] = await Promise.all(requests.slice(0,3).map(r=>r.json())); assert.deepEqual(a.chunks,b.chunks);
  assert.match((await recipient.decrypt(identities.educator.key,t.chunks[0].ciphertext,{generation:job.id,owner:'alice'})).text,/Synthetic AI story/);
});
test('Explicit cancellation reaches the local provider transport', async () => {
  providerMode = 'blocked'; const entered = new Promise(resolve => { providerEntered = resolve; }), closed = new Promise(resolve => { providerClosed = resolve; });
  const r = await call('alice','generate',{prompt:'A fox',discloseToAI:true,mode:'private',recipients:refs('alice')}); const current = await r.json(); await entered;
  const done = responseQueue().workers.get(current.id).done;
  assert.equal((await call('alice','cancel',{id:current.id})).status,200); await done; await closed;
  assert.equal(responseQueue().row(current.id).state,'cancelled'); providerMode='normal';
});
test('Revoked session cannot reconnect despite possessing the legitimate device key', async () => {
  const old = identities.alice.token; auth.revokeSession(old);
  assert.equal((await call('alice','resume',{id:job.id})).status,401);
  identities.alice.token=auth.createSessionToken({username:'alice'});
});
test('Truncated provider stream is interrupted instead of falsely marked complete', async () => {
  providerMode='truncated'; const response=await call('alice','generate',{prompt:'A fox',discloseToAI:true,mode:'private',recipients:refs('alice')});assert.equal(response.status,200);const job=await response.json();
  await responseQueue().workers.get(job.id)?.done;assert.equal(responseQueue().row(job.id).state,'interrupted');providerMode='normal';
});
test('Oversized provider events terminate generation within parser bounds', async () => {
  providerMode='oversized';const response=await call('alice','generate',{prompt:'A fox',discloseToAI:true,mode:'private',recipients:refs('alice')});assert.equal(response.status,200);const job=await response.json();
  await responseQueue().workers.get(job.id)?.done;assert.equal(responseQueue().row(job.id).state,'interrupted');assert.equal(responseQueue().row(job.id).bytes,0);providerMode='normal';
});
test('Revoked device cannot retrieve data or bootstrap itself again', async () => {
  assert.equal((await call('alice','revoke',{fingerprint:identities.alice.fingerprint})).status,200);
  assert.equal((await call('alice','resume',{id:job.id})).status,403);
  assert.equal((await call('alice','enroll',{publicKey:identities.alice.publicKey})).status,403);
});
test('Deleted account sessions fail before protected device operations', async () => {
  db.removeUser('bob'); assert.equal((await call('bob','documents')).status,401);
});
