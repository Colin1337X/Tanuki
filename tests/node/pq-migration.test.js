import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {isolate,provisionKeys,password} from './helpers.js';
isolate();await provisionKeys();
const db=await import('../../server/lib/database.js'),crypt=await import('../../server/lib/crypto.js');
const legacy=await import('../fixtures/storage-v1.js');const {rotateKeys}=await import('../../scripts/rotate-keys.js');
test('A real legacy keyring and database rotate to the new suite without losing data or password hashes',()=>{
  db.putUser({username:'legacy',password,role:'student'});db.putRecord('stories','legacy-story',{owner:'legacy',text:'Legitimate retained story'});
  const hash=db.readUser('legacy').password,oldCipher=legacy.seal('archived response','archive');
  const sql=db.database();for(const row of sql.prepare('SELECT * FROM records').all()){const ctx=row.collection+':'+row.id;sql.prepare('UPDATE records SET payload=? WHERE collection=? AND id=?').run(legacy.seal(crypt.unseal(row.payload,ctx),ctx),row.collection,row.id);}
  for(const row of sql.prepare('SELECT username,profile FROM users').all()){const ctx='users:'+row.username;sql.prepare('UPDATE users SET profile=? WHERE username=?').run(legacy.seal(crypt.unseal(row.profile,ctx),ctx),row.username);}
  sql.prepare("UPDATE metadata SET value=? WHERE key='key-check'").run(legacy.seal('tanuki','key-check'));db.closeDatabase();
  const file=process.env.TANUKI_KEYRING_FILE,ring=JSON.parse(fs.readFileSync(file)),old=ring.active;for(const entry of Object.values(ring.keys)){delete entry.signingPrivateKey;delete entry.signingPublicKey;}fs.writeFileSync(file,JSON.stringify(ring));crypt.reloadKeyring();
  assert.equal(db.readUser('legacy').password,hash);assert.throws(()=>crypt.seal('new write','test'),/Rotate the legacy keyring/);
  const next=rotateKeys(file);assert.notEqual(next,old);assert.equal(db.readUser('legacy').password,hash);assert.equal(db.getRecords('stories')[0].text,'Legitimate retained story');
  assert.equal(JSON.parse(db.database().prepare("SELECT payload FROM records WHERE id='legacy-story'").get().payload).v,2);assert.equal(crypt.unseal(oldCipher,'archive').toString(),'archived response');assert.ok(JSON.parse(fs.readFileSync(file)).keys[old]);db.closeDatabase();
});
