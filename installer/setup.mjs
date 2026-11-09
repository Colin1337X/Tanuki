import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createServer} from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';import {spawn,execFile} from 'node:child_process';
import {defaultProfile,validateSettings,restrictDirectory} from './profile.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),ui=path.join(root,'ui');
export async function createSetup({profile=defaultProfile(),lifetime=15*60*1000}={}){
  profile=path.resolve(profile);const token=randomBytes(32).toString('base64url');let busy=false,complete=fs.existsSync(profile),expired=false,origin;
  const server=createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    const send=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
    try{
      if(req.headers.host!==new URL(origin).host||req.headers.origin&&req.headers.origin!==origin||req.headers['sec-fetch-site']==='cross-site')return send(403,{error:'Open setup from its local launch link.'});
      if(req.url.startsWith('/api/')){
        const supplied=String(req.headers.authorization||'').replace(/^Bearer /,'');
        if(expired||!String(req.headers.authorization||'').startsWith('Bearer ')||!/^[A-Za-z0-9_-]{43}$/.test(supplied)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(token)))return send(401,{error:'Setup link expired. Restart the installer.'});
        if(req.url==='/api/state'&&req.method==='GET')return send(200,{profile,complete,platform:process.platform});
        if(req.url!=='/api/install'||req.method!=='POST')return send(404,{error:'Not found'});
        if(complete||fs.existsSync(profile))return send(409,{error:'A profile already exists. Your data has been left intact. Use the upgrade guide.'});
        if(busy)return send(409,{error:'Installation is already running.'});
        if(req.headers['content-type']!=='application/json')return send(415,{error:'JSON required'});
        busy=true;let staging;
        try{
          const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>16384)throw new Error('Setup request too large.');chunks.push(chunk);}
          const settings=validateSettings(JSON.parse(Buffer.concat(chunks).toString()));for(const chunk of chunks)chunk.fill(0);
          fs.mkdirSync(path.dirname(profile),{recursive:true});staging=fs.mkdtempSync(path.join(path.dirname(profile),'.tanuki-setup-'));restrictDirectory(staging);
          await new Promise((resolve,reject)=>{
            const env={PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,TMP:process.env.TMP,HOME:process.env.HOME};
            const child=spawn(process.execPath,[path.join(root,'provision.mjs'),staging],{cwd:path.join(root,'..'),env,stdio:['pipe','ignore','ignore'],windowsHide:true});
            const timer=setTimeout(()=>{child.kill();reject(new Error('Secure provisioning timed out.'));},30000);
            child.on('error',()=>{clearTimeout(timer);reject(new Error('Could not start secure provisioning.'));});child.on('exit',code=>{clearTimeout(timer);code===0?resolve():reject(new Error('Secure provisioning failed. No installation was published.'));});
            child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(settings));
          });
          settings.password='';settings.providerKey='';
          // Reserve the final name atomically; never overwrite a profile created concurrently.
          fs.mkdirSync(profile,{mode:0o700});restrictDirectory(profile);
          try{for(const file of fs.readdirSync(staging))fs.renameSync(path.join(staging,file),path.join(profile,file));fs.writeFileSync(path.join(profile,'installed'),new Date().toISOString(),{flag:'wx',mode:0o600});}
          catch{throw new Error('Installation could not finish. Preserve the profile for recovery; setup will not overwrite it.');}
          complete=true;return send(201,{complete:true,origin:settings.origin,port:settings.port,providerConfigured:!!settings.providerUrl});
        }finally{busy=false;if(staging){const resolved=path.resolve(staging),parent=path.resolve(path.dirname(profile));if(path.dirname(resolved)!==parent||!path.basename(resolved).startsWith('.tanuki-setup-'))throw new Error('Unsafe staging cleanup path');fs.rmSync(resolved,{recursive:true,force:true});}}
      }
      if(req.method!=='GET'&&req.method!=='HEAD')return send(405,{error:'Method not allowed'});
      const files={'/':['index.html','text/html'],'/style.css':['style.css','text/css'],'/app.js':['app.js','text/javascript'],'/forest.svg':['forest.svg','image/svg+xml'],'/jua.ttf':['../../public/assets/Jua-Regular.ttf','font/ttf']};
      const entry=files[req.url];if(!entry)return send(404,{error:'Not found'});res.setHeader('Content-Type',entry[1]);res.end(req.method==='HEAD'?undefined:fs.readFileSync(path.resolve(ui,entry[0])));
    }catch(error){if(!res.headersSent)send(400,{error:error instanceof SyntaxError?'Invalid setup request.':error.message});else res.destroy();}
  });
  server.requestTimeout=35000;server.headersTimeout=5000;server.maxConnections=8;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});origin=`http://127.0.0.1:${server.address().port}`;
  const timer=setTimeout(()=>{expired=true;server.close();},lifetime);timer.unref();
  return{server,origin,token,profile,async close(){clearTimeout(timer);server.closeAllConnections();await new Promise(r=>server.close(r));}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const setup=await createSetup(),url=setup.origin+'/#'+setup.token;
  if(process.argv.includes('--no-open'))console.log('Open this private, temporary setup link: '+url);
  else{const command=process.platform==='win32'?'rundll32.exe':process.platform==='darwin'?'open':'xdg-open',args=process.platform==='win32'?['url.dll,FileProtocolHandler',url]:[url];execFile(command,args,{windowsHide:true},error=>{if(error)console.log('Open this private, temporary setup link: '+url);});console.log('Tanuki setup is open in your browser. This local setup session expires in 15 minutes.');}
}
