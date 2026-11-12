import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { assertSupportedRuntime } from '../../server/lib/runtime.js';
test('Executing runtime uses the patched SQLite engine for real queries',()=>{
  assertSupportedRuntime();
  const db=new DatabaseSync(':memory:');
  try { const version=db.prepare('SELECT sqlite_version() AS version').get().version; assert.equal(version,process.versions.sqlite); assertSupportedRuntime({...process.versions,sqlite:version}); }
  finally { db.close(); }
});
test('Runtime guard rejects the vulnerable SQLite engine even in a new Node build',()=>{
  for(const sqlite of ['3.53.4','3.53.99',undefined,'malformed'])assert.throws(()=>assertSupportedRuntime({node:'26.13.1',sqlite}),/SQLite 3.54.0/);
});
test('Runtime guard rejects older and unreviewed major Node runtimes',()=>{
  for(const node of ['24.22.2','25.5.0','26.12.1','26.13.0','27.0.0',undefined])assert.throws(()=>assertSupportedRuntime({node,sqlite:'3.54.0'}),/Node 26.13.1/);
});
test('Runtime guard permits patched maintenance updates within the reviewed major',()=>{
  assert.doesNotThrow(()=>assertSupportedRuntime({node:'26.13.1',sqlite:'3.54.0'}));
  assert.doesNotThrow(()=>assertSupportedRuntime({node:'26.14.1',sqlite:'3.54.1'}));
});
