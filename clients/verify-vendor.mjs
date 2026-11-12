import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=new URL('../src-tauri/vendor/glib/',import.meta.url);
const manifest=JSON.parse(fs.readFileSync(new URL('../src-tauri/vendor/glib-integrity.json',import.meta.url),'utf8'));
const files=fs.readdirSync(root,{recursive:true,withFileTypes:true}).filter(x=>x.isFile()).map(x=>path.relative(fs.realpathSync(root),path.join(x.parentPath,x.name)).replaceAll('\\','/')).sort();
if(JSON.stringify(files)!==JSON.stringify(Object.keys(manifest.files).sort()))throw Error('Vendored GLib file inventory changed; review the source/backport.');
for(const name of files){const bytes=fs.readFileSync(new URL(name,root),'utf8').replaceAll('\r\n','\n');if(createHash('sha256').update(bytes).digest('hex')!==manifest.files[name])throw Error(`Vendored GLib integrity mismatch: ${name}`);}
const source=fs.readFileSync(new URL('src/variant_iter.rs',root),'utf8');
if(!source.includes('let mut p: *mut libc::c_char')||!source.includes('&mut p,'))throw Error('GLib iterator backport is missing');
const cargo=fs.readFileSync(new URL('../src-tauri/Cargo.toml',import.meta.url),'utf8');
if(!cargo.includes('glib = { path = "vendor/glib" }'))throw Error('GLib backport is not selected');
const lock=fs.readFileSync(new URL('../src-tauri/Cargo.lock',import.meta.url),'utf8');
const glib=lock.split('[[package]]').find(p=>/name = "glib"/.test(p));
if(!glib||!glib.includes('version = "0.18.5"')||glib.includes('source ='))throw Error('Cargo lockfile does not select the reviewed local GLib');
console.log('Verified vendored GLib source inventory and upstream iterator backport.');
