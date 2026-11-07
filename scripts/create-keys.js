import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { generateKeyring } from '../server/lib/crypto.js';
const file = process.argv[2];
if (!file) throw new Error('Usage: npm run keys:create -- /secure/path/keyring.json');
mkdirSync(path.dirname(path.resolve(file)), {recursive:true,mode:0o700});
writeFileSync(file, JSON.stringify(generateKeyring(),null,2), {flag:'wx',mode:0o600});
console.log('Created keyring. Back it up separately from the database and restrict access to the service account.');
