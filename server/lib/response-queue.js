import { createHash, randomUUID } from 'node:crypto';
import { database, transaction, readUser } from './database.js';
import { recipient } from './recipient-crypto.js';
import { seal, unseal } from './crypto.js';

const hash = text => createHash('sha256').update(text).digest('hex');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const activeStates = new Set(['queued', 'running']);
export const QUEUE_LIMITS = Object.freeze({ retention: 24 * 60 * 60 * 1000, jobsPerUser: 30,
  bytesPerJob: 8 * 1024 * 1024, bytesTotal: 256 * 1024 * 1024, chunkBytes: 8192, chunks: 512, workers: 4 });

// Exactly one queue owner per application process. Production deployment is single-process.
// Provider execution is intentionally not a Request/Response body or a subscriber callback.
export class ResponseQueue {
  constructor({ now = Date.now } = {}) {
    this.now = now; this.workers = new Map(); this.closed = false; this.instance = randomUUID();
    database().exec(`CREATE TABLE IF NOT EXISTS response_jobs (
      id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      state TEXT NOT NULL CHECK(state IN ('queued','running','complete','interrupted','cancelled','expired')),
      created INTEGER NOT NULL, expires INTEGER NOT NULL, sequence INTEGER NOT NULL DEFAULT 0,
      bytes INTEGER NOT NULL DEFAULT 0, previous TEXT NOT NULL DEFAULT '', recipients TEXT NOT NULL, proof TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS response_jobs_owner ON response_jobs(owner,expires);
      CREATE TABLE IF NOT EXISTS response_chunks (
        generation TEXT NOT NULL REFERENCES response_jobs(id) ON DELETE CASCADE,
        sequence INTEGER NOT NULL, ciphertext TEXT NOT NULL, PRIMARY KEY(generation,sequence));
      CREATE TABLE IF NOT EXISTS response_acks (
        generation TEXT NOT NULL REFERENCES response_jobs(id) ON DELETE CASCADE,
        device TEXT NOT NULL, sequence INTEGER NOT NULL, PRIMARY KEY(generation,device));
      CREATE TABLE IF NOT EXISTS response_runtime (id INTEGER PRIMARY KEY CHECK(id=1), pid INTEGER NOT NULL, instance TEXT NOT NULL);`);
    transaction(() => {
      const existing = database().prepare('SELECT * FROM response_runtime WHERE id=1').get();
      if (existing) {
        let alive = true; try { process.kill(existing.pid, 0); } catch (error) { if (error.code === 'ESRCH') alive = false; }
        if (alive) throw new Error('An encrypted queue worker already owns this database');
      }
      database().prepare('INSERT OR REPLACE INTO response_runtime VALUES(1,?,?)').run(process.pid, this.instance);
    });
    // A provider's token stream cannot safely be replayed after process loss. Preserve partial ciphertext.
    database().prepare("UPDATE response_jobs SET state='interrupted' WHERE state IN ('queued','running')").run();
    this.cleanup();
    this.timer = setInterval(() => this.cleanup(), 30_000); this.timer.unref();
  }
  row(id) {
    const row = database().prepare('SELECT * FROM response_jobs WHERE id=?').get(id);
    if (!row) return undefined;
    const expected = JSON.stringify({ id: row.id, owner: row.owner, created: row.created, expires: row.expires, recipients: JSON.parse(row.recipients) });
    if (unseal(row.proof, `response-job:${id}`).toString() !== expected) throw new Error('Response job metadata integrity check failed');
    return row;
  }
  authorize(id, actor, device) {
    const user = readUser(actor);
    if (!user || user.disabled) fail(401, 'Account unavailable');
    const row = this.row(id);
    if (!row || row.expires <= this.now()) fail(404, 'Generation unavailable');
    const recipients = JSON.parse(row.recipients);
    if (!recipients.some(r => r.username === actor && r.fingerprint === device)) fail(404, 'Generation unavailable');
    return row;
  }
  start({ owner, recipients, produce, validate }) {
    if (this.closed) fail(503, 'Generation service unavailable');
    if (this.workers.size >= QUEUE_LIMITS.workers) fail(429, 'Generation capacity reached');
    if (!Array.isArray(recipients) || recipients.length < 1 || recipients.length > 16 ||
        !recipients.some(r => r.username === owner) || new Set(recipients.map(r => r.fingerprint)).size !== recipients.length) fail(400, 'Invalid recipients');
    // Only public material is stored. The provider prompt remains in worker memory, never in this queue.
    const id = randomUUID(), created = this.now(), expires = created + QUEUE_LIMITS.retention;
    transaction(() => {
      const user = readUser(owner); if (!user || user.disabled) fail(401, 'Account unavailable');
      const count = database().prepare('SELECT count(*) n FROM response_jobs WHERE owner=? AND expires>?').get(owner, created).n;
      if (count >= QUEUE_LIMITS.jobsPerUser || database().prepare("SELECT 1 FROM response_jobs WHERE owner=? AND state IN ('queued','running')").get(owner)) fail(429, 'Generation limit reached');
      if (database().prepare('SELECT count(*) n, coalesce(sum(bytes),0) bytes FROM response_jobs').get().n >= 10000) fail(429, 'Queue capacity reached');
      const proof = seal(JSON.stringify({ id, owner, created, expires, recipients }), `response-job:${id}`);
      database().prepare('INSERT INTO response_jobs(id,owner,state,created,expires,recipients,proof) VALUES(?,?,?,?,?,?,?)')
        .run(id, owner, 'queued', created, expires, JSON.stringify(recipients), proof);
    });
    const controller = new AbortController();
    const worker = { controller, done: null }; this.workers.set(id, worker);
    worker.done = this.run(id, produce, validate, controller).finally(() => this.workers.delete(id));
    return { id, owner, expires, recipients: recipients.map(r => ({ username: r.username, fingerprint: r.fingerprint })), state: 'queued' };
  }
  async run(id, produce, validate, controller) {
    try {
      controller.signal.throwIfAborted(); await validate();
      database().prepare("UPDATE response_jobs SET state='running' WHERE id=? AND state='queued'").run(id);
      let pending = '', lastWrite = this.now();
      for await (const delta of produce(controller.signal)) {
        controller.signal.throwIfAborted();
        if (typeof delta !== 'string' || Buffer.byteLength(delta) > 1024 * 1024) throw new Error('Invalid provider delta');
        pending += delta;
        // Bound crypto overhead without relying on a browser to drain the provider response.
        while (Buffer.byteLength(pending) >= QUEUE_LIMITS.chunkBytes) {
          let end = Math.min(pending.length, 2048);
          if (/^[\uDC00-\uDFFF]$/.test(pending[end] || '')) end--;
          await this.append(id, pending.slice(0, end), 'delta', validate, controller.signal); pending = pending.slice(end);
        }
        // Persist each provider delivery for useful low-latency resumability.
        if (pending && (Buffer.byteLength(pending) >= 1024 || this.now() - lastWrite >= 100)) {
          await this.append(id, pending, 'delta', validate, controller.signal); pending = ''; lastWrite = this.now();
        }
      }
      if (pending) await this.append(id, pending, 'delta', validate, controller.signal);
      await this.append(id, '', 'complete', validate, controller.signal);
    } catch {
      // Never include provider exceptions (possibly prompts/credentials) in logs or persistent state.
      controller.abort();
      database().prepare("UPDATE response_jobs SET state='interrupted' WHERE id=? AND state IN ('queued','running')").run(id);
    }
  }
  async append(id, text, kind, validate, signal) {
    signal.throwIfAborted(); await validate();
    const row = this.row(id);
    if (!row || !activeStates.has(row.state) || row.expires <= this.now()) throw new Error('Generation stopped');
    const recipients = JSON.parse(row.recipients);
    const context = { v: 1, purpose: 'tanuki-ai-response', generation: id, owner: row.owner,
      recipients: recipients.map(r => r.fingerprint).sort(), sequence: row.sequence, previous: row.previous, kind, text };
    const ciphertext = await recipient.encrypt(recipients.map(r => r.publicKey), context);
    // Public-key encryption authenticates the ciphertext but not its sender. Keep the existing
    // server-origin authenticated envelope outside recipient ciphertext to reject DB-only forgeries.
    const stored = seal(ciphertext, `response-chunk:${id}:${row.sequence}`);
    signal.throwIfAborted(); await validate();
    transaction(() => {
      const current = this.row(id);
      if (!current || !activeStates.has(current.state) || current.sequence !== row.sequence || current.expires <= this.now()) throw new Error('Generation stopped');
      const bytes = Buffer.byteLength(stored);
      const total = database().prepare('SELECT coalesce(sum(bytes),0) n FROM response_jobs').get().n;
      if (row.sequence >= QUEUE_LIMITS.chunks || row.bytes + bytes > QUEUE_LIMITS.bytesPerJob || total + bytes > QUEUE_LIMITS.bytesTotal) throw new Error('Storage quota reached');
      database().prepare('INSERT INTO response_chunks VALUES(?,?,?)').run(id, row.sequence, stored);
      database().prepare('UPDATE response_jobs SET sequence=sequence+1,bytes=bytes+?,previous=?,state=? WHERE id=?')
        .run(bytes, hash(ciphertext), kind === 'complete' ? 'complete' : 'running', id);
    });
  }
  read(id, actor, device, after = -1) {
    const row = this.authorize(id, actor, device);
    if (!Number.isSafeInteger(after) || after < -1 || after >= row.sequence && after !== -1) fail(400, 'Invalid resume sequence');
    const chunks = database().prepare('SELECT sequence,ciphertext FROM response_chunks WHERE generation=? AND sequence>? ORDER BY sequence LIMIT 16').all(id, after)
      .map(chunk => ({ sequence: chunk.sequence, ciphertext: unseal(chunk.ciphertext, `response-chunk:${id}:${chunk.sequence}`).toString() }));
    return { id, owner: row.owner, state: row.state, count: row.sequence, expires: row.expires,
      recipients: JSON.parse(row.recipients).map(r => r.fingerprint).sort(), chunks };
  }
  list(actor, device) {
    return database().prepare('SELECT id FROM response_jobs WHERE expires>? ORDER BY created DESC').all(this.now()).map(({ id }) => this.row(id))
      .map(({ id, owner, state, expires, recipients }) => ({ id, owner, state, expires, recipients }))
      .map(row => ({ ...row, recipients: JSON.parse(row.recipients).map(({ username, fingerprint }) => ({ username, fingerprint })) }))
      .filter(row => row.recipients.some(r => r.username === actor && r.fingerprint === device)).slice(0, 100);
  }
  acknowledge(id, actor, device, sequence, digest) {
    this.authorize(id, actor, device);
    if (!Number.isSafeInteger(sequence) || sequence < 0) fail(400, 'Invalid acknowledgement');
    const chunk = database().prepare('SELECT ciphertext FROM response_chunks WHERE generation=? AND sequence=?').get(id, sequence);
    if (!chunk || hash(unseal(chunk.ciphertext, `response-chunk:${id}:${sequence}`).toString()) !== digest) fail(409, 'Acknowledgement does not match stored ciphertext');
    database().prepare('INSERT INTO response_acks VALUES(?,?,?) ON CONFLICT(generation,device) DO UPDATE SET sequence=max(sequence,excluded.sequence)').run(id, device, sequence);
    return { acknowledged: sequence };
  }
  cancel(id, actor, device) {
    const row = this.authorize(id, actor, device);
    if (row.owner !== actor) fail(403, 'Only the owner can cancel generation');
    database().prepare("UPDATE response_jobs SET state='cancelled' WHERE id=? AND state IN ('queued','running')").run(id);
    this.workers.get(id)?.controller.abort();
    return { state: this.row(id).state };
  }
  cleanup() {
    for (const [id, worker] of this.workers) {
      const row = this.row(id), user = row && readUser(row.owner);
      if (!row || row.expires <= this.now() || !user || user.disabled) worker.controller.abort();
    }
    // Retain the terminal expiry state for one extra day, but delete encrypted content immediately.
    transaction(() => {
      database().prepare('DELETE FROM response_chunks WHERE generation IN (SELECT id FROM response_jobs WHERE expires<=?)').run(this.now());
      database().prepare('DELETE FROM response_acks WHERE generation IN (SELECT id FROM response_jobs WHERE expires<=?)').run(this.now());
      database().prepare("UPDATE response_jobs SET state='expired',bytes=0 WHERE expires<=?").run(this.now());
      database().prepare('DELETE FROM response_jobs WHERE expires<=?').run(this.now() - QUEUE_LIMITS.retention);
    });
  }
  async close() {
    this.closed = true; clearInterval(this.timer);
    for (const worker of this.workers.values()) worker.controller.abort();
    await Promise.all([...this.workers.values()].map(w => w.done));
    database().prepare('DELETE FROM response_runtime WHERE instance=?').run(this.instance);
  }
}
