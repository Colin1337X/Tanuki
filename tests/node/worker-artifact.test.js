import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'tanuki-worker-artifact-'));
function run(script,...args){return spawnSync(process.execPath,[script,...args],{encoding:'utf8',env:{...process.env,npm_config_offline:'true'},timeout:30000});}
const a=path.join(root,'a'),b=path.join(root,'b');
test('Worker artifacts reproduce identical source/dependency hashes without application auth/storage modules',()=>{
  for(const dir of[a,b]){const result=run('scripts/build-worker.mjs',dir);assert.equal(result.status,0,result.stderr);assert.equal(run('scripts/verify-worker.mjs',dir).status,0);}
  const first=JSON.parse(fs.readFileSync(path.join(a,'artifact-manifest.json'))),second=JSON.parse(fs.readFileSync(path.join(b,'artifact-manifest.json')));assert.deepEqual(first,second);
  assert.equal(Object.keys(first.files).some(name=>/server\/lib\/(auth|database|storage)\.js$/.test(name)),false);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(a,'package.json'))).dependencies).sort(),['@noble/ciphers','@node-rs/argon2']);
});
test('Worker artifact verification rejects modified deployed source',()=>{
  fs.appendFileSync(path.join(a,'worker/engine.js'),'\n// synthetic unauthorized change\n');const result=run('scripts/verify-worker.mjs',a);assert.notEqual(result.status,0);assert.match(result.stderr,/integrity mismatch/);
});
test('Worker artifact verification rejects extra unreviewed files',()=>{
  fs.writeFileSync(path.join(b,'injected.js'),'throw new Error("synthetic fixture");');const result=run('scripts/verify-worker.mjs',b);assert.notEqual(result.status,0);assert.match(result.stderr,/integrity mismatch/);
});
