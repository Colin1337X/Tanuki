// Local, disposable keys only. Compare the saved checkpoint module with current code.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import * as pgp from 'openpgp';
import {recipientCrypto} from '../../public/assets/recipient-crypto.js';
const oldSource=process.argv[2]?fs.readFileSync(process.argv[2],'utf8'):execFileSync('git',['show','7f611ad:public/assets/recipient-crypto.js'],{encoding:'utf8'});
const previous=(await import('data:text/javascript;base64,'+Buffer.from(oldSource).toString('base64'))).recipientCrypto(pgp);
const current=recipientCrypto(pgp);
const first=await current.generate('a'.repeat(64)),replacement=await current.generate('b'.repeat(64));
const expected=(await current.publicKey(first.publicKey)).getFingerprint();
assert.notEqual((await previous.publicKey(replacement.publicKey,expected)).getFingerprint(),expected);
console.log('BEFORE: checkpoint accepted substituted public-key bytes despite expected fingerprint.');
await assert.rejects(current.publicKey(replacement.publicKey,expected));
assert.equal((await current.publicKey(first.publicKey,expected)).getFingerprint(),expected);
console.log('AFTER: substitution rejected; the actual pinned public key remains accepted.');
console.log('Two controlled observations; not added to the automated test count. No private keys persisted.');
