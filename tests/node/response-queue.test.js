import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isolate, provisionKeys, password } from './helpers.js';
const dir = isolate(); await provisionKeys();
const { database, putUser, readUser, removeUser, closeDatabase } = await import('../../server/lib/database.js');
const { ResponseQueue, QUEUE_LIMITS } = await import('../../server/lib/response-queue.js');
const { recipient } = await import('../../server/lib/recipient-crypto.js');
const { ChunkAssembler } = await import('../../public/assets/recipient-crypto.js');
putUser({ username: 'alice', password, role: 'student' }); putUser({ username: 'teacher', password, role: 'teacher' });
const secret = randomBytes(32).toString('hex'), pair = await recipient.generate(secret), teacherPair = await recipient.generate(secret);
const key = await recipient.unlock(pair.privateKey, secret), teacherKey = await recipient.unlock(teacherPair.privateKey, secret);
const recipients = [{ username: 'alice', fingerprint: (await recipient.publicKey(pair.publicKey)).getFingerprint(), publicKey: pair.publicKey },
  { username: 'teacher', fingerprint: (await recipient.publicKey(teacherPair.publicKey)).getFingerprint(), publicKey: teacherPair.publicKey }];
let time = Date.now(), queue = new ResponseQueue({ now: () => time });
after(async () => { await queue.close(); closeDatabase(); });
const digest = text => createHash('sha256').update(text).digest('hex');
const defer = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
async function completed(text = 'A synthetic secret fox story.') {
  const job = queue.start({ owner: 'alice', recipients, validate: async () => {}, produce: async function* () { yield text; } });
  await queue.workers.get(job.id).done; return job;
}
test('Generation finishes without any HTTP subscriber and persists only recipient ciphertext', async () => {
  const text = 'SYNTHETIC_PRIVATE_OUTPUT_92713', job = await completed(text);
  const result = queue.read(job.id, 'alice', recipients[0].fingerprint);
  assert.equal(result.state, 'complete'); assert.equal(result.chunks.length, 2);
  const assembler = new ChunkAssembler({ v: 1, purpose: 'tanuki-ai-response', generation: job.id, owner: 'alice', recipients: recipients.map(r => r.fingerprint).sort() },
    (ciphertext, expected) => recipient.decrypt(key, ciphertext, expected));
  for (const chunk of result.chunks) await assembler.accept(chunk);
  assert.equal(assembler.state.text, text);
  for (const file of fs.readdirSync(process.env.TANUKI_DATA_DIR).filter(f => f.startsWith('tanuki.sqlite'))) assert.equal(fs.readFileSync(path.join(process.env.TANUKI_DATA_DIR, file)).includes(Buffer.from(text)), false);
  const terminal = await recipient.decrypt(teacherKey, result.chunks.at(-1).ciphertext, { generation: job.id, kind: 'complete', sequence: 1 });
  assert.equal(terminal.text, '');
});
test('Independent concurrent reconnects receive the same ordered ciphertext', async () => {
  const job = await completed();
  const reads = await Promise.all(Array.from({ length: 8 }, async () => queue.read(job.id, 'alice', recipients[0].fingerprint)));
  for (const result of reads) assert.deepEqual(result, reads[0]);
  const resumed = queue.read(job.id, 'alice', recipients[0].fingerprint, 0);
  assert.deepEqual(resumed.chunks.map(c => c.sequence), [1]);
  assert.throws(() => queue.read(job.id, 'alice', recipients[0].fingerprint, 100), /resume sequence/);
});
test('Acknowledgements are digest-bound and cannot move a device cursor backward', async () => {
  const job = await completed(), { chunks } = queue.read(job.id, 'alice', recipients[0].fingerprint);
  assert.throws(() => queue.acknowledge(job.id, 'alice', recipients[0].fingerprint, 0, 'wrong'), /does not match/);
  queue.acknowledge(job.id, 'alice', recipients[0].fingerprint, 1, digest(chunks[1].ciphertext));
  queue.acknowledge(job.id, 'alice', recipients[0].fingerprint, 0, digest(chunks[0].ciphertext));
  assert.equal(database().prepare('SELECT sequence FROM response_acks WHERE generation=?').get(job.id).sequence, 1);
});
test('Cross-account and unlisted device requests cannot retrieve ciphertext', async () => {
  const job = await completed();
  assert.throws(() => queue.read(job.id, 'alice', recipients[1].fingerprint), /unavailable/);
  assert.throws(() => queue.read(job.id, 'teacher', recipients[0].fingerprint), /unavailable/);
  assert.throws(() => queue.cancel(job.id, 'teacher', recipients[1].fingerprint), /Only the owner/);
});
test('Cancellation aborts the provider and is durably recorded', async () => {
  const entered = defer(); let aborted = false;
  const job = queue.start({ owner: 'alice', recipients, validate: async () => {}, produce: async function* (signal) {
    entered.resolve(); await new Promise(resolve => signal.addEventListener('abort', () => { aborted = true; resolve(); }, { once: true })); signal.throwIfAborted();
  } });
  const done = queue.workers.get(job.id).done; await entered.promise;
  queue.cancel(job.id, 'alice', recipients[0].fingerprint); await done;
  assert.equal(aborted, true); assert.equal(queue.row(job.id).state, 'cancelled'); assert.equal(queue.row(job.id).sequence, 0);
});
test('Authorization changes during provider work prevent persistence', async () => {
  const release = defer(); let authorized = true;
  const job = queue.start({ owner: 'alice', recipients, validate: async () => { if (!authorized) throw new Error('Revoked'); }, produce: async function* () { await release.promise; yield 'Must not persist'; } });
  const done = queue.workers.get(job.id).done; authorized = false; release.resolve(); await done;
  assert.equal(queue.row(job.id).state, 'interrupted'); assert.equal(queue.row(job.id).sequence, 0);
});
test('Provider errors cannot leak exception text into persisted job state', async () => {
  const job = queue.start({ owner: 'alice', recipients, validate: async () => {}, produce: async function* () { throw new Error('SECRET_PROVIDER_CREDENTIAL'); } });
  await queue.workers.get(job.id).done;
  assert.equal(queue.row(job.id).state, 'interrupted'); assert.equal(JSON.stringify(queue.row(job.id)).includes('SECRET_PROVIDER_CREDENTIAL'), false);
});
test('Restart retains partial ciphertext and marks unfinished work interrupted', async () => {
  const job = await completed();
  const saved = queue.read(job.id, 'alice', recipients[0].fingerprint).chunks[0];
  database().prepare('DELETE FROM response_chunks WHERE generation=? AND sequence=1').run(job.id);
  database().prepare("UPDATE response_jobs SET state='running',sequence=1 WHERE id=?").run(job.id);
  await queue.close(); queue = new ResponseQueue({ now: () => time });
  const result = queue.read(job.id, 'alice', recipients[0].fingerprint);
  assert.equal(result.state, 'interrupted'); assert.deepEqual(result.chunks, [saved]);
});
test('Disabled accounts cannot resume using a previously valid device', async () => {
  const job = await completed(), user = readUser('alice'); putUser({ ...user, disabled: true });
  assert.throws(() => queue.read(job.id, 'alice', recipients[0].fingerprint), /Account unavailable/);
  putUser({ ...readUser('alice'), disabled: false });
});
test('Per-user active generation quota rejects racing second work', async () => {
  const release = defer();
  const job = queue.start({ owner: 'alice', recipients, validate: async () => {}, produce: async function* () { await release.promise; } });
  const done = queue.workers.get(job.id).done;
  assert.throws(() => queue.start({ owner: 'alice', recipients, validate: async () => {}, produce: async function* () {} }), /limit reached/);
  release.resolve(); await done;
});
test('Expired generations lose ciphertext, then their bounded tombstones are removed', async () => {
  const job = await completed(); time += QUEUE_LIMITS.retention + 1; queue.cleanup();
  assert.equal(queue.row(job.id).state, 'expired');
  assert.equal(database().prepare('SELECT count(*) n FROM response_chunks WHERE generation=?').get(job.id).n, 0);
  assert.throws(() => queue.read(job.id, 'alice', recipients[0].fingerprint), /unavailable/);
  time += QUEUE_LIMITS.retention; queue.cleanup(); assert.equal(queue.row(job.id), undefined);
});
test('Database writer cannot replace the authenticated recipient set', async () => {
  const job=await completed(),row=queue.row(job.id);
  database().prepare('UPDATE response_jobs SET recipients=? WHERE id=?').run(JSON.stringify([{...recipients[0],username:'teacher'}]),job.id);
  try { assert.throws(()=>queue.read(job.id,'teacher',recipients[0].fingerprint),/integrity|authentication/); }
  finally { database().prepare('UPDATE response_jobs SET recipients=? WHERE id=?').run(row.recipients,job.id); }
});
test('Public recipient key cannot forge a server-origin queue chunk through database writes', async () => {
  const job=await completed(),row=database().prepare('SELECT ciphertext FROM response_chunks WHERE generation=? AND sequence=0').get(job.id);
  const forged=await recipient.encrypt(recipients.map(r=>r.publicKey),{v:1,purpose:'tanuki-ai-response',generation:job.id,owner:'alice',sequence:0,previous:'',recipients:recipients.map(r=>r.fingerprint).sort(),kind:'delta',text:'Forged provider prose'});
  database().prepare('UPDATE response_chunks SET ciphertext=? WHERE generation=? AND sequence=0').run(forged,job.id);
  try { assert.throws(()=>queue.read(job.id,'alice',recipients[0].fingerprint)); }
  finally { database().prepare('UPDATE response_chunks SET ciphertext=? WHERE generation=? AND sequence=0').run(row.ciphertext,job.id); }
});
test('Account deletion cascades response ciphertext and acknowledgement removal', async () => {
  const job = await completed(); removeUser('alice');
  assert.equal(queue.row(job.id), undefined);
  assert.equal(database().prepare('SELECT count(*) n FROM response_chunks WHERE generation=?').get(job.id).n, 0);
  assert.throws(() => queue.read(job.id, 'alice', recipients[0].fingerprint), /Account unavailable/);
});
