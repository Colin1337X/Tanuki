// Offline profile maintenance. Secrets arrive via hidden prompt or bounded stdin,
// never command-line arguments. Run with the bundled runtime as the profile owner.
import fs from 'node:fs';import path from 'node:path';import {createHash,randomUUID} from 'node:crypto';
import readline from 'node:readline/promises';import {Writable} from 'node:stream';
import {defaultProfile,restrictDirectory} from './profile.mjs';import {lockProfile} from './profile-lock.mjs';
const [command,...args]=process.argv.slice(2),profile=defaultProfile();
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function list(root,relative=''){
  const result=[];for(const entry of fs.readdirSync(path.join(root,relative))){if(!relative&&['.tanuki-lock','.tanuki-lock.recovery','backup-manifest.json'].includes(entry))continue;const name=path.posix.join(relative,entry),file=path.join(root,name),stat=fs.lstatSync(file);if(stat.isSymbolicLink()||(!stat.isDirectory()&&!stat.isFile()))throw new Error('Profile contains a symlink or special file.');if(stat.isDirectory())result.push(...list(root,name));else result.push(name);}return result.sort();
}
function copy(source,target){for(const name of list(source)){const file=path.join(target,name);fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});fs.copyFileSync(path.join(source,name),file,fs.constants.COPYFILE_EXCL);fs.chmodSync(file,0o600);}}
function freshTarget(value,source){if(!value)throw new Error('Specify a new destination directory.');const target=path.resolve(value),parent=fs.realpathSync(path.dirname(target));const parentStat=fs.statSync(parent);if(process.platform!=='win32'&&(parentStat.mode&0o022))throw new Error('Destination parent must not be writable by other users.');const resolved=path.join(parent,path.basename(target)),actualSource=fs.realpathSync(source);if(resolved===actualSource||resolved.startsWith(actualSource+path.sep))throw new Error('Destination must be outside the source profile.');if(fs.existsSync(resolved))throw new Error('Destination already exists; it will not be overwritten.');return resolved;}
async function validate(root,{revoke=false}={}){
  if(!fs.existsSync(path.join(root,'installed')))throw new Error('Not a completed installation profile.');
  if(['users','stories','config','recordings','knowledge-base'].some(name=>fs.existsSync(path.join(root,'data',name+'.json'))))throw new Error('Archive legacy plaintext sources before profile maintenance.');
  const config=JSON.parse(fs.readFileSync(path.join(root,'config.json'),'utf8'));if(config.version!==1||new URL(config.origin).protocol!=='https:')throw new Error('Invalid profile configuration.');
  process.env.NODE_ENV='production';process.env.TANUKI_DATA_DIR=path.join(root,'data');process.env.TANUKI_KEYRING_FILE=path.join(root,'keyring.json');
  delete process.env.TANUKI_ALLOW_LEGACY_UPGRADE;delete process.env.ADMIN_USERNAME;delete process.env.ADMIN_PASSWORD;
  const db=await import('../server/lib/database.js'),crypto=await import('../server/lib/crypto.js');
  try{
    crypto.unseal(fs.readFileSync(path.join(root,'secrets.json'),'utf8'),'installation-provider-v1');
    const connection=db.database();if(connection.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||connection.prepare('PRAGMA foreign_key_check').all().length)throw new Error('Database integrity check failed.');
    const users=db.readUsers();if(!users.some(u=>u.role==='admin'))throw new Error('Profile has no administrator.');
    for(const {collection}of connection.prepare('SELECT DISTINCT collection FROM records').all())db.getRecords(collection);
    if(revoke)db.transaction(()=>connection.prepare('DELETE FROM sessions').run());
    return db;
  }catch(e){db.closeDatabase();throw e;}
}
async function passwordInput(){
  if(process.stdin.isTTY){let hidden=false;const output=new Writable({write(chunk,encoding,done){if(!hidden)process.stdout.write(chunk);done();}});const rl=readline.createInterface({input:process.stdin,output,terminal:true});try{process.stdout.write('New administrator password (hidden): ');hidden=true;const password=await rl.question('');process.stdout.write('\nRepeat password (hidden): ');const repeat=await rl.question('');process.stdout.write('\n');if(password!==repeat)throw new Error('Passwords do not match.');return password;}finally{rl.close();}}
  const chunks=[];let size=0;for await(const b of process.stdin){size+=b.length;if(size>8192)throw new Error('Password input too large.');chunks.push(b);}const input=JSON.parse(Buffer.concat(chunks).toString());for(const b of chunks)b.fill(0);return input.password;
}
let release,db,staging;
try{
  if(!['backup','restore','reset-admin','revoke-sessions','verify'].includes(command))throw new Error('Usage: maintain.mjs backup NEW_DIR | restore BACKUP NEW_PROFILE | reset-admin USERNAME | revoke-sessions | verify');
  if(command==='restore'){
    if(args.length!==2)throw new Error('Restore needs a backup and a new profile destination.');
    const source=fs.realpathSync(args[0]);release=lockProfile(source);const target=freshTarget(args[1],source);
    const manifest=JSON.parse(fs.readFileSync(path.join(source,'backup-manifest.json'),'utf8'));
    const files=list(source);if(manifest.version!==1||!manifest.files||JSON.stringify(Object.keys(manifest.files).sort())!==JSON.stringify(files))throw new Error('Backup file inventory mismatch.');
    for(const name of files)if(hash(fs.readFileSync(path.join(source,name)))!==manifest.files[name])throw new Error('Backup integrity mismatch.');
    staging=target+'.partial-'+randomUUID();fs.mkdirSync(staging,{mode:0o700});restrictDirectory(staging);copy(source,staging);
    db=await validate(staging,{revoke:true});db.database().exec('PRAGMA wal_checkpoint(TRUNCATE)');db.closeDatabase();db=null;
    // An atomic directory publication leaves the backup untouched and no partial profile live.
    if(fs.existsSync(target))throw new Error('Destination appeared during restore.');fs.renameSync(staging,target);staging=null;
    console.log('Profile restored and authenticated. All restored sessions were revoked.');
  }else{
    release=lockProfile(profile);
    if(command==='backup'){
      if(args.length!==1)throw new Error('Backup needs one new destination.');const target=freshTarget(args[0],profile);
      db=await validate(profile);db.database().exec('PRAGMA wal_checkpoint(TRUNCATE)');db.closeDatabase();db=null;
      staging=target+'.partial-'+randomUUID();fs.mkdirSync(staging,{mode:0o700});restrictDirectory(staging);copy(profile,staging);
      const files=Object.fromEntries(list(staging).map(name=>[name,hash(fs.readFileSync(path.join(staging,name)))]));
      fs.writeFileSync(path.join(staging,'backup-manifest.json'),JSON.stringify({version:1,created:new Date().toISOString(),files},null,2)+'\n',{flag:'wx',mode:0o600});
      if(fs.existsSync(target))throw new Error('Destination appeared during backup.');fs.renameSync(staging,target);staging=null;
      console.log('Offline backup completed. It contains recovery keys; protect it as a secret.');
    }else{
      if(args.length!==(command==='reset-admin'?1:0))throw new Error('Unexpected command arguments.');
      const password=command==='reset-admin'?await passwordInput():null;
      if(command==='reset-admin'&&(typeof password!=='string'||password.length<16||password.length>1024))throw new Error('Use an administrator password of 16–1024 characters.');
      db=await validate(profile);
      if(command==='reset-admin'){
        const user=db.readUser(args[0]);if(!user||user.role!=='admin')throw new Error('Recovery only resets an existing administrator; it cannot promote another account.');
        db.transaction(()=>{db.putUser({...user,password,disabled:false});db.database().prepare('DELETE FROM sessions').run();});
        console.log('Administrator password reset. All sessions revoked.');
      }else if(command==='revoke-sessions'){db.transaction(()=>db.database().prepare('DELETE FROM sessions').run());console.log('All sessions revoked.');}
      else console.log('Profile database and encrypted record integrity verified.');
      db.database().exec('PRAGMA wal_checkpoint(TRUNCATE)');db.closeDatabase();db=null;
    }
  }
}catch(error){console.error(error instanceof SyntaxError?'Invalid JSON input or profile metadata.':error.message);process.exitCode=1;}
finally{db?.closeDatabase();release?.();if(staging)console.error('An unpublished partial directory remains for operator review.');}
