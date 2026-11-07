import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {generateKeyring} from '../../server/lib/crypto.js';
import {hashPassword} from '../../server/lib/passwords.js';
const databaseUrl=new URL('../../server/lib/database.js',import.meta.url).href;
const authUrl=new URL('../../server/lib/auth.js',import.meta.url).href;
const serverUrl=new URL('../../server/index.js',import.meta.url).href;
function fixture(files={},env={}) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tanuki-migrate-'));
  const data=path.join(dir,'data');fs.mkdirSync(data);
  const key=path.join(dir,'keys.json');fs.writeFileSync(key,JSON.stringify(generateKeyring()));
  for(const [name,value] of Object.entries(files))fs.writeFileSync(path.join(data,name),typeof value==='string'?value:JSON.stringify(value));
  return {dir,data,key,env:{...process.env,NODE_ENV:'test',ADMIN_USERNAME:'',ADMIN_PASSWORD:'',APP_ORIGIN:'',TANUKI_DATA_DIR:data,TANUKI_KEYRING_FILE:key,...env}};
}
function run(f,code) {return spawnSync(process.execPath,['--input-type=module','-e',`import * as db from ${JSON.stringify(databaseUrl)};${code}`],{env:f.env,encoding:'utf8',windowsHide:true});}
const user={username:'legacy',password:'legacy plaintext password',role:'student',readingLevel:'Elementary',preferences:{theme:'classroom'},onboardingCompleted:true};
test('Migration preserves users, settings, stories, recordings and references',()=>{
  const f=fixture({'users.json':[user],'stories.json':[{id:'story',username:'legacy',story:'Legitimate old story',createdAt:'2025-01-01'}],'config.json':{systemPrompt:'Existing custom instructions'},'recordings.json':[{id:'recording',storyId:'story',filename:'file.webm'}],'knowledge-base.json':[{id:'doc',content:'Trusted reference'}]});
  const r=run(f,"console.log(JSON.stringify({users:db.readUsers(),stories:db.getRecords('stories'),config:db.getRecords('config'),recordings:db.getRecords('recordings'),docs:db.getRecords('knowledge-base')}));db.closeDatabase();");
  assert.equal(r.status,0,r.stderr);const value=JSON.parse(r.stdout);
  assert.equal(value.users[0].readingLevel,'Elementary');assert.equal(value.users[0].preferences.theme,'classroom');assert.match(value.users[0].password,/^\$argon2id\$/);
  assert.equal(value.stories[0].story,'Legitimate old story');assert.equal(value.config[0].systemPrompt,'Existing custom instructions');assert.equal(value.recordings[0].id,'recording');assert.equal(value.docs[0].id,'doc');
});
test('Migrated plaintext password still verifies',()=>{
  const f=fixture({'users.json':[user]});const r=run(f,`import {verifyPassword} from ${JSON.stringify(new URL('../../server/lib/passwords.js',import.meta.url).href)};console.log(await verifyPassword(db.readUser('legacy').password,'legacy plaintext password'));db.closeDatabase();`);
  assert.equal(r.status,0,r.stderr);assert.equal(r.stdout.trim(),'true');
});
test('Migration preserves original files for recovery',()=>{const f=fixture({'users.json':[user]});const before=fs.readFileSync(path.join(f.data,'users.json'));assert.equal(run(f,'db.database();db.closeDatabase();').status,0);assert.deepEqual(fs.readFileSync(path.join(f.data,'users.json')),before);});
test('Migration does not reimport stale source data',()=>{const f=fixture({'users.json':[user]});assert.equal(run(f,"db.database();db.putUser({...db.readUser('legacy'),readingLevel:'College'});db.closeDatabase();").status,0);const r=run(f,"console.log(db.readUser('legacy').readingLevel);db.closeDatabase();");assert.equal(r.stdout.trim(),'College');});
test('Existing Argon2id hashes are not double hashed',()=>{const encoded=hashPassword('already migrated password');const f=fixture({'users.json':[{...user,password:encoded}]});const r=run(f,"console.log(db.readUser('legacy').password);db.closeDatabase();");assert.equal(r.stdout.trim(),encoded);});
for(const name of ['users','stories','config','recordings','knowledge-base'])test(`Corrupt legacy ${name} aborts without resetting source`,()=>{const f=fixture({[name+'.json']:'{invalid'});assert.notEqual(run(f,'db.database();').status,0);assert.equal(fs.readFileSync(path.join(f.data,name+'.json'),'utf8'),'{invalid');});
for(const name of ['users','stories','recordings','knowledge-base'])test(`Non-array legacy ${name} is refused`,()=>{const f=fixture({[name+'.json']:{bad:'shape'}});assert.notEqual(run(f,'db.database();').status,0);});
test('Duplicate legacy usernames cannot overwrite roles',()=>{const f=fixture({'users.json':[user,{...user,role:'admin'}]});const r=run(f,'db.database();');assert.notEqual(r.status,0);assert.match(r.stderr,/Duplicate/);});
test('Partial migration rolls back and can be retried after repair',()=>{const f=fixture({'users.json':[user],'stories.json':[{id:'story',story:'preserve'}],'recordings.json':'bad'});assert.notEqual(run(f,'db.database();').status,0);fs.writeFileSync(path.join(f.data,'recordings.json'),'[]');const r=run(f,"console.log(db.getRecords('stories').length,db.readUsers().length);db.closeDatabase();");assert.equal(r.status,0,r.stderr);assert.equal(r.stdout.trim(),'1 1');});
test('Wrong keyring cannot open the database',()=>{const f=fixture();assert.equal(run(f,'db.database();db.closeDatabase();').status,0);fs.writeFileSync(f.key,JSON.stringify(generateKeyring()));assert.notEqual(run(f,'db.database();').status,0);});
test('Missing configured keyring is never auto-generated',()=>{const f=fixture();f.env.TANUKI_KEYRING_FILE=path.join(f.dir,'absent.json');assert.notEqual(run(f,'db.database();').status,0);assert.equal(fs.existsSync(f.env.TANUKI_KEYRING_FILE),false);});
test('Production cannot start without an administrator',()=>{const f=fixture({}, {NODE_ENV:'production',APP_ORIGIN:'https://stories.example.com'});const r=run(f,`import {initializeAuth} from ${JSON.stringify(authUrl)};initializeAuth();`);assert.notEqual(r.status,0);assert.match(r.stderr,/administrator/);});
for(const password of ['','short','admin123'])test(`Production rejects bootstrap password ${JSON.stringify(password)}`,()=>{const f=fixture({}, {NODE_ENV:'production',ADMIN_USERNAME:'principal',ADMIN_PASSWORD:password});assert.notEqual(run(f,`import {initializeAuth} from ${JSON.stringify(authUrl)};initializeAuth();`).status,0);});
test('Production only bootstraps explicitly configured admins',()=>{const f=fixture({}, {NODE_ENV:'production',ADMIN_USERNAME:'principal',ADMIN_PASSWORD:'a valid bootstrap secret'});const r=run(f,`import {initializeAuth} from ${JSON.stringify(authUrl)};initializeAuth();console.log(JSON.stringify(db.readUsers().map(u=>({username:u.username,role:u.role}))));db.closeDatabase();`);assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout),[{username:'principal',role:'admin'}]);});
test('Production requires an HTTPS public origin',()=>{const f=fixture({}, {NODE_ENV:'production',ADMIN_USERNAME:'principal',ADMIN_PASSWORD:'a valid bootstrap secret',APP_ORIGIN:'http://example.com'});const r=run(f,`import {createAppServer} from ${JSON.stringify(serverUrl)};createAppServer();`);assert.notEqual(r.status,0);assert.match(r.stderr,/HTTPS/);});
test('Production cookies have Secure, HttpOnly and no plaintext credentials',()=>{const f=fixture({}, {NODE_ENV:'production',ADMIN_USERNAME:'principal',ADMIN_PASSWORD:'a valid bootstrap secret',APP_ORIGIN:'https://stories.example.com'});const r=run(f,`import {createAppServer} from ${JSON.stringify(serverUrl)};const s=createAppServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const res=await fetch('http://127.0.0.1:'+s.address().port+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'principal',password:'a valid bootstrap secret'})});console.log(res.headers.get('set-cookie'));s.closeAllConnections();await new Promise(r=>s.close(r));db.closeDatabase();`);assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/; Secure/);assert.match(r.stdout,/HttpOnly/);assert.doesNotMatch(r.stdout,/a valid bootstrap/);});
test('Container runs as non-root',()=>assert.match(fs.readFileSync('Dockerfile','utf8'),/^USER node$/m));
test('Deployment persists SQLite data',()=>assert.match(fs.readFileSync('docker-compose.minimal.yml','utf8'),/tanuki-data:\/app\/data/));
test('Deployment mounts keys read-only',()=>assert.match(fs.readFileSync('docker-compose.minimal.yml','utf8'),/keyring\.json:ro/));
test('Docker build context excludes secrets',()=>{const ignore=fs.readFileSync('.dockerignore','utf8');assert.match(ignore,/^\.secrets$/m);assert.match(ignore,/^data$/m);assert.match(ignore,/^\.env\*$/m);});
test('Runtime has only the two cryptographic dependencies',()=>{const pkg=JSON.parse(fs.readFileSync('package.json'));assert.deepEqual(Object.keys(pkg.dependencies).sort(),['@noble/ciphers','@node-rs/argon2']);assert.match(pkg.scripts.start,/server\/index.js/);});
