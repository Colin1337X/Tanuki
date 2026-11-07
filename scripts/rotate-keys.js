import fs from 'node:fs';
import { generateKeyring,reloadKeyring,seal,unseal } from '../server/lib/crypto.js';
import { database,transaction,closeDatabase } from '../server/lib/database.js';
export function rotateKeys(file){
 if(!file)throw new Error('Set TANUKI_KEYRING_FILE before rotating keys');
 const db=database(); // Check old keyring before modifying anything.
 const previous=JSON.parse(fs.readFileSync(file,'utf8'));const next=generateKeyring();
 const updated={version:1,active:next.active,keys:{...previous.keys,...next.keys}};
 const temporary=file+'.new';
 fs.writeFileSync(temporary,JSON.stringify(updated,null,2),{flag:'wx',mode:0o600});fs.renameSync(temporary,file);reloadKeyring();
 transaction(()=>{
  for(const row of db.prepare('SELECT * FROM records').all()){const context=`${row.collection}:${row.id}`;db.prepare('UPDATE records SET payload=? WHERE collection=? AND id=?').run(seal(unseal(row.payload,context),context),row.collection,row.id);}
  for(const row of db.prepare('SELECT username,profile FROM users').all()){const context=`users:${row.username}`;db.prepare('UPDATE users SET profile=? WHERE username=?').run(seal(unseal(row.profile,context),context),row.username);}
  db.prepare("UPDATE metadata SET value=? WHERE key='key-check'").run(seal('tanuki','key-check'));
 });
 return updated.active;
}
if(process.argv[1]?.endsWith('rotate-keys.js')){rotateKeys(process.env.TANUKI_KEYRING_FILE);closeDatabase();console.log('Key rotated and database re-encrypted. Old keys retained for recordings and backups. Back up the updated keyring.');}
