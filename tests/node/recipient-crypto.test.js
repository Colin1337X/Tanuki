import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { recipient } from '../../server/lib/recipient-crypto.js';
import { ChunkAssembler } from '../../public/assets/recipient-crypto.js';
import * as pgp from 'openpgp';
import fs from 'node:fs';

const secret = randomBytes(32).toString('hex');
const alice = await recipient.generate(secret), teacher = await recipient.generate(secret), stranger = await recipient.generate(secret);
const aliceKey = await recipient.unlock(alice.privateKey, secret), teacherKey = await recipient.unlock(teacher.privateKey, secret), strangerKey = await recipient.unlock(stranger.privateKey, secret);
const context = { v: 1, purpose: 'test', owner: 'alice', generation: 'fixture', recipients: ['alice', 'teacher'] };
const value = { ...context, sequence: 0, previous: '', text: 'Private synthetic story' };
const encrypted = await recipient.encrypt([alice.publicKey, teacher.publicKey], value, aliceKey);
test('Authorized student and teacher decrypt signed recipient ciphertext', async () => {
  for (const key of [aliceKey, teacherKey]) assert.deepEqual(await recipient.decrypt(key, encrypted, context, alice.publicKey), value);
});
test('Unrelated device cannot decrypt a classroom response', async () => {
  await assert.rejects(recipient.decrypt(strangerKey, encrypted, context, alice.publicKey));
});
test('Substituted public bytes cannot inherit a previously pinned fingerprint label',async()=>{
  const pinned=(await recipient.publicKey(alice.publicKey)).getFingerprint();
  await assert.rejects(recipient.publicKey(stranger.publicKey,pinned),/fingerprint mismatch/);
  assert.equal((await recipient.publicKey(alice.publicKey,pinned)).getFingerprint(),pinned);
});
test('Public keys cannot be used as private decryption keys', async () => {
  await assert.rejects(recipient.decrypt(await recipient.publicKey(alice.publicKey), encrypted, context, alice.publicKey));
});
test('Account password or incorrect recovery secret cannot unlock device backup', async () => {
  await assert.rejects(recipient.unlock(alice.privateKey, 'account password'));
  await assert.rejects(recipient.unlock(alice.privateKey, randomBytes(32).toString('hex')));
});
test('Context substitution fails after valid cryptographic decryption', async () => {
  for (const [field, replacement] of Object.entries({ owner: 'bob', generation: 'other', v: 0, recipients: ['alice', 'attacker'] }))
    await assert.rejects(recipient.decrypt(aliceKey, encrypted, { ...context, [field]: replacement }, alice.publicKey), /context mismatch/);
});
test('Wrong sender and unsigned ciphertext fail signature verification', async () => {
  await assert.rejects(recipient.decrypt(aliceKey, encrypted, context, stranger.publicKey));
  await assert.rejects(recipient.decrypt(aliceKey, await recipient.encrypt([alice.publicKey], value), context, alice.publicKey));
});
test('Malformed ciphertext and corrupted encrypted backup fail closed', async () => {
  await assert.rejects(recipient.decrypt(aliceKey, encrypted.slice(0, encrypted.length / 2), context, alice.publicKey));
  await assert.rejects(recipient.unlock(alice.privateKey.slice(0, 300), secret));
});
test('Ciphertext bit corruption fails AEAD verification without releasing text', async () => {
  const message = await pgp.readMessage({ armoredMessage: encrypted });
  const container = message.packets.find(p => p.constructor.tag === pgp.enums.packet.symEncryptedIntegrityProtectedData);
  container.encrypted[container.encrypted.length - 1] ^= 1;
  await assert.rejects(recipient.decrypt(aliceKey, message.armor(), context, alice.publicKey));
});
test('Recipient packets require AES-256-GCM authenticated encryption and fresh salts', async () => {
  const message = await pgp.readMessage({ armoredMessage: encrypted });
  const container = message.packets.find(p => p.constructor.tag === pgp.enums.packet.symEncryptedIntegrityProtectedData);
  assert.equal(container.version, 2); assert.equal(container.cipherAlgorithm, pgp.enums.symmetric.aes256); assert.equal(container.aeadAlgorithm, pgp.enums.aead.gcm);
  const second = await pgp.readMessage({ armoredMessage: await recipient.encrypt([alice.publicKey], value) });
  assert.notDeepEqual(container.salt, second.packets.find(p => p.constructor.tag === pgp.enums.packet.symEncryptedIntegrityProtectedData).salt);
});
test('Legacy non-AEAD messages are rejected instead of silently downgraded', async () => {
  const legacy = await pgp.generateKey({ type: 'ecc', curve: 'curve25519', userIDs: [{ name: 'Legacy fixture' }], config: { aeadProtect: false, v6Keys: false } });
  const key = await pgp.readPrivateKey({ armoredKey: legacy.privateKey });
  const ciphertext = await pgp.encrypt({ message: await pgp.createMessage({ text: JSON.stringify(value) }), encryptionKeys: await pgp.readKey({ armoredKey: legacy.publicKey }), config: { aeadProtect: false } });
  await assert.rejects(recipient.decrypt(key, ciphertext, context), /AEAD envelope required/);
  await assert.rejects(recipient.publicKey(legacy.publicKey), /Version 6/);
});
test('Browser library is byte-identical to the pinned installed distribution', () => {
  assert.deepEqual(fs.readFileSync('public/assets/vendor/openpgp.min.mjs'), fs.readFileSync('node_modules/openpgp/dist/openpgp.min.mjs'));
  assert.ok(fs.readFileSync('public/assets/vendor/OpenPGP-LICENSE', 'utf8').includes('GNU LESSER GENERAL PUBLIC LICENSE'));
});
test('Recipient encryption is randomized for identical content', async () => {
  const second = await recipient.encrypt([alice.publicKey, teacher.publicKey], value, aliceKey);
  assert.notEqual(encrypted, second);
  assert.equal((await recipient.decrypt(aliceKey, second, context, alice.publicKey)).text, value.text);
});
test('Assembler rejects gaps, conflicting duplicates and cross-generation deliveries', async () => {
  const assembler = new ChunkAssembler(context, (ciphertext, expected) => recipient.decrypt(aliceKey, ciphertext, expected, alice.publicKey));
  await assert.rejects(assembler.accept({ sequence: 1, ciphertext: encrypted }), /Missing/);
  assert.equal(assembler.state.next, 0);
  assert.equal(await assembler.accept({ sequence: 0, ciphertext: encrypted }), true);
  assert.equal(await assembler.accept({ sequence: 0, ciphertext: encrypted }), false);
  await assert.rejects(assembler.accept({ sequence: 0, ciphertext: encrypted + '\n' }), /Conflicting/);
  const other = new ChunkAssembler({ ...context, generation: 'other' }, (ciphertext, expected) => recipient.decrypt(aliceKey, ciphertext, expected, alice.publicKey));
  await assert.rejects(other.accept({ sequence: 0, ciphertext: encrypted }), /context mismatch/);
  assert.equal(assembler.state.text, value.text);
});
