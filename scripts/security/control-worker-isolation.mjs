import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
if(process.getuid?.()!==0)throw new Error('Fixture controller requires Linux operator identity');
const root=path.resolve(process.argv[2]);if(!/^\/var\/lib\/tanuki-worker-validation-[A-Za-z0-9]+$/.test(root))throw new Error('Unexpected fixture directory');
const config=JSON.parse(fs.readFileSync(path.join(root,'setup.json'))),ready=JSON.parse(fs.readFileSync(path.join(root,'app/ready.json')));
for(const key of ['workerPort','providerPort','forbiddenPort'])if(!Number.isInteger(ready[key])||ready[key]<1024||ready[key]>65535)throw new Error('Invalid fixture port');
const unit=path.basename(root)+'.service',unitFile='/run/systemd/system/'+unit;
const command=(...args)=>{const result=spawnSync('systemctl',args,{encoding:'utf8'});if(result.status!==0)throw new Error('Fixture service command failed: '+result.stderr);return result.stdout;};
const environment={NODE_ENV:'production',TANUKI_WORKER_UID:config.workerUid,TANUKI_API_UID:config.apiUid,TANUKI_WORKER_DATA_DIR:config.workerData,TANUKI_WORKER_KEY_FILE:config.workerKey,
  TANUKI_WORKER_TLS_KEY:path.join(root,'worker-keys/tls.key'),TANUKI_WORKER_TLS_CERT:path.join(root,'worker.crt'),TANUKI_WORKER_TLS_CA:config.ca,TANUKI_WORKER_API_CERT_SHA256:config.clientCertFingerprint,
  TANUKI_WORKER_PROVIDER_URL:`http://127.0.0.1:${ready.providerPort}/v1`,TANUKI_WORKER_ALLOW_HTTP_LOOPBACK:1,TANUKI_WORKER_PROVIDER_KEY:'SYNTHETIC_PROVIDER_KEY',TANUKI_WORKER_PORT:ready.workerPort,TANUKI_TEST_FORBIDDEN_PORT:ready.forbiddenPort};
fs.writeFileSync(unitFile,`[Unit]\nDescription=Disposable Tanuki worker verification\n[Service]\nType=simple\nUser=${config.workerUid}\nGroup=${config.workerGid}\nWorkingDirectory=${root}/code\n${Object.entries(environment).map(([k,v])=>'Environment="'+k+'='+v+'"').join('\n')}\nExecStartPre=${root}/bin/node ${root}/code/verify-worker.mjs ${root}/code\nExecStartPre=${root}/bin/node ${root}/probe.mjs\nExecStart=${root}/bin/node --max-old-space-size=128 ${root}/code/worker/index.js\nProtectSystem=strict\nProtectHome=yes\nPrivateTmp=yes\nPrivateDevices=yes\nNoNewPrivileges=yes\nCapabilityBoundingSet=\nRestrictAddressFamilies=AF_UNIX AF_INET AF_INET6\nInaccessiblePaths=${root}/app -/mnt -/run/WSL\nReadWritePaths=${root}/worker-data\nReadOnlyPaths=${root}/code ${root}/worker-keys\nLimitCORE=0\nLimitNOFILE=256\nMemoryMax=256M\nTasksMax=32\nCPUQuota=100%\nIPAddressDeny=any\nIPAddressAllow=127.0.0.1/32\nRestart=on-failure\nRestartSec=1\nStandardOutput=append:${root}/app/worker-audit.log\nStandardError=append:${root}/app/worker-audit.log\n`);
command('daemon-reload');
let last=0;const deadline=Date.now()+120000;
try{command('start',unit);while(Date.now()<deadline){if(fs.existsSync(path.join(root,'app/finished')))break;
  const file=path.join(root,'app/control.json');if(fs.existsSync(file)){const request=JSON.parse(fs.readFileSync(file));if(Number.isSafeInteger(request.sequence)&&request.sequence>last){last=request.sequence;let result;
    if(request.operation==='crash-worker'){command('kill','--kill-whom=main','--signal=SIGKILL',unit);result={crashRequested:true};}
    else if(request.operation==='scan-persistence'){const files=fs.readdirSync(config.workerData);result={plaintextFound:files.some(name=>fs.readFileSync(path.join(config.workerData,name)).includes(Buffer.from('WORKER_OUTPUT_SENTINEL')))};}
    else if(request.operation==='properties'){result={properties:command('show',unit,'-p','User','-p','MemoryMax','-p','TasksMax','-p','CPUQuotaPerSecUSec','-p','LimitCORE','-p','NoNewPrivileges','-p','IPAddressDeny','-p','IPAddressAllow')};}
    else throw new Error('Unsupported fixture control operation');
    fs.writeFileSync(path.join(root,'app/control-result.json'),JSON.stringify({sequence:last,...result}));
  }}await new Promise(r=>setTimeout(r,50));}
}finally{command('stop',unit);console.log(JSON.stringify({fixture:root,unit,stopped:true}));}
