import fs from 'node:fs';
const lock=fs.readFileSync(new URL('../src-tauri/Cargo.lock',import.meta.url),'utf8');
const inventory=lock.split('[[package]]').slice(1).filter(p=>/source = "registry/.test(p)).map(p=>({name:p.match(/name = "([^"]+)"/)[1],version:p.match(/version = "([^"]+)"/)[1],ecosystem:'crates.io'}));
fs.mkdirSync('coverage',{recursive:true});
fs.writeFileSync('coverage/tauri-inventory.json',JSON.stringify(inventory,null,2)+'\n');
