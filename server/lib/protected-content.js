import { createHash } from 'node:crypto';
import { database, transaction, getRecords, putRecord, readUser, consumeRateLimit } from './database.js';
import { recipient } from './recipient-crypto.js';
import { isTeacherOfStudent } from './storage.js';
import { getCurrentUser, assertCurrentUser } from './auth.js';

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
export const fingerprint = async key => (await recipient.publicKey(key)).getFingerprint();
export function devices(username) { return getRecords('recipient-devices').filter(d => d.username === username); }
export function device(username, id) { return devices(username).find(d => d.fingerprint === id && !d.revoked); }
export function enabled() { return process.env.TANUKI_RECIPIENT_ENCRYPTION === '1'; }
export async function requireFeature() {
  if (!enabled()) fail(404, 'Feature not enabled');
  const user = await getCurrentUser(); if (!user) fail(401, 'Unauthorized');
  return user;
}
function activeUser(name) { const user = readUser(name); return user && !user.disabled ? user : null; }
export function permittedRecipient(owner, name, mode) {
  if (!activeUser(owner) || !activeUser(name)) return false;
  if (owner === name) return true;
  return mode === 'classroom' && readUser(owner).role === 'student' && readUser(name).role === 'teacher' && isTeacherOfStudent(name, owner);
}
export function recipientsFor(owner, requested, mode) {
  if (!['private', 'classroom'].includes(mode) || !Array.isArray(requested) || !requested.length || requested.length > 16) fail(400, 'Invalid recipient policy');
  const recipients = requested.map(r => {
    const d = device(r.username, r.fingerprint);
    if (!d || !permittedRecipient(owner, r.username, mode)) fail(403, 'Recipient is not authorized');
    return { username: d.username, fingerprint: d.fingerprint, publicKey: d.publicKey };
  });
  if (!recipients.some(d => d.username === owner) || new Set(recipients.map(d => d.fingerprint)).size !== recipients.length) fail(400, 'Invalid recipient set');
  if (mode === 'classroom' && !recipients.some(d => d.username !== owner)) fail(400, 'A verified designated teacher is required');
  return recipients;
}
export async function verifyCommand(request) {
  const user = await requireFeature(); const body = await request.json();
  const { command, signature } = body;
  if (!command || command.v !== 1 || command.username !== user.username || typeof command.action !== 'string' ||
      !/^[a-f0-9]{64}$/.test(command.device || '') || !/^[a-f0-9]{64}$/.test(command.nonce || '') ||
      !Number.isSafeInteger(command.time) || Math.abs(Date.now() - command.time) > 300000 || !command.payload || typeof command.payload !== 'object') fail(400, 'Invalid device command');
  if (!consumeRateLimit('device-command:' + user.username, 600, 60000)) fail(429, 'Device request limit reached');
  let signer = device(user.username, command.device);
  if (!signer && command.action === 'enroll' && devices(user.username).length === 0) {
    if (await fingerprint(command.payload.publicKey) !== command.device) fail(403, 'Device identity mismatch');
    signer = { publicKey: command.payload.publicKey };
  }
  if (!signer) fail(403, 'Authorized device required');
  try { await recipient.verify(signer.publicKey, JSON.stringify(command), signature); }
  catch { fail(403, 'Invalid device signature'); }
  await assertCurrentUser(user);
  if (command.action !== 'enroll' && !device(user.username, command.device)) fail(403, 'Device revoked');
  database().exec('CREATE TABLE IF NOT EXISTS device_nonces (nonce TEXT PRIMARY KEY, expires INTEGER NOT NULL)');
  transaction(() => {
    database().prepare('DELETE FROM device_nonces WHERE expires<?').run(Date.now());
    const id = createHash('sha256').update(user.username + ':' + command.nonce).digest('hex');
    if (database().prepare('SELECT 1 FROM device_nonces WHERE nonce=?').get(id)) fail(409, 'Replayed device command');
    database().prepare('INSERT INTO device_nonces VALUES(?,?)').run(id, Date.now() + 600000);
  });
  return { user, command, signature };
}
export async function enroll(user, command, signature) {
  const publicKey = command.payload.publicKey, id = await fingerprint(publicKey);
  await assertCurrentUser(user);
  return transaction(() => {
    const previous = devices(user.username);
    if (previous.length >= 16) fail(409, 'Device limit reached');
    if (previous.length && !device(user.username, command.device)) fail(403, 'Existing device authorization required');
    if (!previous.length && command.device !== id) fail(403, 'First device must prove possession');
    if (previous.some(d => d.fingerprint === id)) fail(409, 'Device already enrolled');
    // A globally unique key cannot be silently relabeled as another account.
    if (getRecords('recipient-devices').some(d => d.fingerprint === id)) fail(409, 'Device key already registered');
    putRecord('recipient-devices', id, { username: user.username, fingerprint: id, publicKey, revoked: false, enrolled: Date.now(), authorization: { command, signature } });
    return { fingerprint: id };
  });
}
export function revokeDevice(user, command) {
  const d = device(user.username, command.payload.fingerprint);
  if (!d) fail(404, 'Device unavailable');
  // Preserve a tombstone: deleting the last device must not re-enable first-device bootstrap.
  putRecord('recipient-devices', d.fingerprint, { ...d, revoked: true, revokedAt: Date.now(), revokedBy: command.device });
  return { revoked: true };
}
export function listRecipientKeys(user) {
  const all = getRecords('recipient-devices');
  return all.filter(d => !d.revoked && (d.username === user.username || permittedRecipient(user.username, d.username, 'classroom') || permittedRecipient(d.username, user.username, 'classroom')));
}
export function listDocuments(user, currentDevice) {
  return getRecords('protected-documents').filter(d => d.recipients.some(r => r.username === user.username && r.fingerprint === currentDevice) && permittedRecipient(d.owner, user.username, d.mode));
}
export function saveDocument(user, command) {
  const p = command.payload;
  if (typeof p.id !== 'string' || !/^[a-f0-9-]{36}$/.test(p.id) || !Number.isSafeInteger(p.revision) || p.revision < 1 ||
      typeof p.ciphertext !== 'string' || p.ciphertext.length > 512000 || !p.ciphertext.startsWith('-----BEGIN PGP MESSAGE-----')) fail(400, 'Invalid protected document');
  const recipients = recipientsFor(user.username, p.recipients, p.mode).map(({ username, fingerprint }) => ({ username, fingerprint }));
  if (!recipients.some(r => r.fingerprint === command.device && r.username === user.username)) fail(400, 'Writing device must be a recipient');
  return transaction(() => {
    const all = getRecords('protected-documents'), existing = all.find(d => d.id === p.id);
    if (existing && existing.owner !== user.username) fail(404, 'Document unavailable');
    if (p.revision !== (existing?.revision || 0) + 1) fail(409, 'Document revision conflict');
    if (!existing && all.filter(d => d.owner === user.username).length >= 100) fail(429, 'Protected document quota reached');
    const doc = { id: p.id, owner: user.username, revision: p.revision, mode: p.mode, recipients,
      ciphertext: p.ciphertext, signer: command.device, updated: Date.now() };
    putRecord('protected-documents', p.id, doc);
    // No historical plaintext or keys; changes retain authenticated, bounded recipient audit metadata.
    putRecord('recipient-audit', p.id, { id: p.id, events: [...(getRecords('recipient-audit').find(a => a.id === p.id)?.events || []).slice(-99),
      { revision: p.revision, mode: p.mode, recipients, signer: command.device, time: doc.updated }] });
    return { id: p.id, revision: p.revision };
  });
}
