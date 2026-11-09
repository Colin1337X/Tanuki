import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {X509Certificate} from 'node:crypto';
export function certificates(root){
  const run=args=>{const r=spawnSync('openssl',args,{encoding:'utf8'});if(r.status!==0)throw new Error('Synthetic certificate setup failed: '+r.stderr);};
  const caKey=path.join(root,'ca.key'),ca=path.join(root,'ca.crt');
  run(['req','-x509','-newkey','rsa:2048','-nodes','-keyout',caKey,'-out',ca,'-days','1','-subj','/CN=Tanuki local test CA']);
  const result={ca};
  for(const name of ['worker','client','unapproved']){const key=path.join(root,name+'.key'),cert=path.join(root,name+'.crt'),csr=path.join(root,name+'.csr'),ext=path.join(root,name+'.ext');
    fs.writeFileSync(ext,name==='worker'?'subjectAltName=IP:127.0.0.1,DNS:localhost\nextendedKeyUsage=serverAuth\n':'extendedKeyUsage=clientAuth\n');
    run(['req','-newkey','rsa:2048','-nodes','-keyout',key,'-out',csr,'-subj','/CN='+name]);
    run(['x509','-req','-in',csr,'-CA',ca,'-CAkey',caKey,'-CAcreateserial','-out',cert,'-days','1','-extfile',ext]);result[name]={key,cert,fingerprint:new X509Certificate(fs.readFileSync(cert)).fingerprint256.replaceAll(':','').toLowerCase()};
  }return result;
}
