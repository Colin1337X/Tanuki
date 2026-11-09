import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { HttpResponse } from './http.js';
import { requestContext,initializeAuth,getCurrentUser } from './lib/auth.js';
import { consumeRateLimit,closeDatabase,DATA_DIR } from './lib/database.js';
import { responseQueue,closeResponseQueue } from './lib/recipient-service.js';
import { trustedWorkerEnabled,trustedGenerations,closeTrustedGenerations } from './lib/trusted-generations.js';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const PUBLIC=path.join(ROOT,'public');
const routes=[];
function collect(dir,prefix='') {for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
  if(entry.isDirectory())collect(path.join(dir,entry.name),prefix+'/'+entry.name);
  else if(entry.name==='route.js') {
    const names=[];const pattern=prefix.replace(/\[([^\]]+)\]/g,(_,name)=>{names.push(name);return '([^/]+)';});
    routes.push({regex:new RegExp('^/api'+pattern+'/?$'),names,file:pathToFileURL(path.join(dir,entry.name)).href});
  }
}}
collect(path.join(ROOT,'server/routes'));
routes.sort((a,b)=>a.names.length-b.names.length);
const generationLocks=new Set();
const writeMethods=new Set(['POST','PATCH','PUT','DELETE']);
function validateBody(value) {
  if(!value||typeof value!=='object'||Array.isArray(value))throw Object.assign(new Error('Expected an object'),{status:400});
  function walk(v,depth=0){if(depth>20)throw Object.assign(new Error('Payload nesting too deep'),{status:400});if(v&&typeof v==='object'){for(const [key,item] of Object.entries(v)){if(['__proto__','constructor','prototype'].includes(key))throw Object.assign(new Error('Invalid field'),{status:400});walk(item,depth+1);}}}
  walk(value);
  for(const name of ['request','title','genre','plot','revisionNote','username','password','content','csv','systemPrompt','query'])if(value[name]!==undefined && typeof value[name]!=='string')throw Object.assign(new Error(`Invalid ${name}`),{status:400});
  if(value.request!==undefined && (value.request.length>4000||!value.request.trim()))throw Object.assign(new Error('Story idea must contain 1–4000 characters'),{status:400});
  if(value.query!==undefined && (!value.query.trim()||value.query.length>4000))throw Object.assign(new Error('Invalid search query'),{status:400});
  if(value.chapterCount!==undefined && (!Number.isInteger(value.chapterCount)||value.chapterCount<1||value.chapterCount>20))throw Object.assign(new Error('Choose between 1 and 20 chapters'),{status:400});
  for(const name of ['contentMaturityLevel','additionalChapters'])if(value[name]!==undefined&&(!Number.isFinite(value[name])||!Number.isInteger(value[name])||value[name]<1||value[name]>(name==='contentMaturityLevel'?6:20)))throw Object.assign(new Error(`Invalid ${name}`),{status:400});
  if(value.plan!==undefined && (!value.plan||typeof value.plan!=='object'||['exposition','risingAction','climax','fallingAction','resolution'].some(k=>typeof value.plan[k]!=='string'||value.plan[k].length>3000)))throw Object.assign(new Error('Invalid story plan'),{status:400});
  return value;
}
export function createAppServer() {
  initializeAuth();
  if(trustedWorkerEnabled()){if(process.env.TANUKI_RECIPIENT_ENCRYPTION!=='1')throw new Error('Trusted worker mode requires recipient encryption');trustedGenerations();}
  else if(process.env.TANUKI_RECIPIENT_ENCRYPTION==='1')responseQueue();
  if(process.env.NODE_ENV==='production'&&['users','stories','config','recordings','knowledge-base'].some(name=>fs.existsSync(path.join(DATA_DIR,name+'.json'))))throw new Error('Archive legacy JSON sources before production startup: npm run data:archive-legacy');
  if(process.env.NODE_ENV==='production' && !process.env.APP_ORIGIN?.startsWith('https://'))throw new Error('Set APP_ORIGIN to the public HTTPS origin');
  const server=createServer(async(req,res)=>{
    let generationKey;
    const headers={
      'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY',
      'Permissions-Policy':'camera=(), geolocation=(), microphone=(self)',
      'Content-Security-Policy':"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; font-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    };
    if(process.env.NODE_ENV==='production')headers['Strict-Transport-Security']='max-age=31536000';
    for(const [key,value] of Object.entries(headers))res.setHeader(key,value);
    try {
      if(!req.url.startsWith('/'))throw Object.assign(new Error('Invalid request target'),{status:400});
      const origin=process.env.APP_ORIGIN || `http://${req.headers.host}`;
      const url=new URL(req.url,origin);
      // Routing and policy checks must use exactly the same canonical path.
      if(url.pathname.startsWith('/api/'))url.pathname=url.pathname.replace(/\/+$/,'');
      if(url.pathname.startsWith('/api/')) {
        res.setHeader('Cache-Control','no-store, private');
        if(writeMethods.has(req.method) && (req.headers.origin && req.headers.origin!==new URL(origin).origin || req.headers['sec-fetch-site']==='cross-site'))throw Object.assign(new Error('Cross-origin request rejected'),{status:403});
        const route=routes.find(r=>r.regex.test(url.pathname));
        if(!route)throw Object.assign(new Error('Not found'),{status:404});
        if(writeMethods.has(req.method) && req.headers['content-type'] && !/^(application\/json|multipart\/form-data)(;|$)/i.test(req.headers['content-type']))throw Object.assign(new Error('Unsupported content type'),{status:415});
        const chunks=[];let size=0;
        const limit=url.pathname.endsWith('/recordings')?6*1024*1024:1024*1024;
        for await(const chunk of req){size+=chunk.length;if(size>limit)throw Object.assign(new Error('Request too large'),{status:413});chunks.push(chunk);}
        const request=new Request(url,{method:req.method,headers:req.headers,...(size?{body:Buffer.concat(chunks)}:{})});
        const originalJson=request.json.bind(request);
        request.json=async()=>{try{return validateBody(await originalJson());}catch(error){if(error.status)throw error;throw Object.assign(new Error('Invalid JSON body'),{status:400});}};
        request.nextUrl=url;
        const params={};const match=route.regex.exec(url.pathname);route.names.forEach((name,i)=>{params[name]=decodeURIComponent(match[i+1]);});
        if(Object.values(params).some(v=>v.includes('/')||v.includes('\\')||v==='..'))throw Object.assign(new Error('Invalid path'),{status:400});
        const mod=await import(route.file);const handler=mod[req.method];
        if(!handler)throw Object.assign(new Error('Method not allowed'),{status:405});
        const response=await requestContext.run(request,async()=>{
          if(url.pathname==='/api/auth/login'&&!consumeRateLimit(`ip:${req.socket.remoteAddress}`,100,15*60*1000))throw Object.assign(new Error('Too many sign-in attempts'),{status:429});
          if(req.method==='POST' && /^\/api\/stories\/(generate|plan|[^/]+\/chapter)$/.test(url.pathname)) {
            if(trustedWorkerEnabled())throw Object.assign(new Error('Use Trusted Worker Encryption in the encrypted workspace; legacy plaintext generation is disabled'),{status:409});
            const user=await getCurrentUser();
            if(!user)throw Object.assign(new Error('Unauthorized'),{status:401});
            generationKey=user.username;
            if(generationLocks.has(generationKey)||generationLocks.size>=4){generationKey=undefined;throw Object.assign(new Error('A story is already being written. Try again shortly.'),{status:429});}
            if(!consumeRateLimit(`generate:${generationKey}`,30,60*60*1000)){generationKey=undefined;throw Object.assign(new Error('Hourly generation limit reached'),{status:429});}
            generationLocks.add(generationKey);
          }
          return handler(request,{params:Promise.resolve(params)});
        });
        for(const [key,value] of response.headers)res.setHeader(key,value);
        res.setHeader('Cache-Control','no-store, private');res.setHeader('Vary','Cookie, Origin');res.statusCode=response.status;
        if(response.body)await pipeline(Readable.fromWeb(response.body),res);else res.end();
      } else {
        if(!['GET','HEAD'].includes(req.method))throw Object.assign(new Error('Method not allowed'),{status:405});
        const pathname=decodeURIComponent(url.pathname);
        const isAsset=/^\/(assets|icons)\//.test(pathname)||['/sw.js','/manifest.json','/favicon.ico'].includes(pathname);
        const isPage=/^\/(|login\/?|student\/?|teacher\/?|admin\/?|student\/reader\/[a-zA-Z0-9-]+\/?)$/.test(pathname);
        if(!isAsset&&!isPage)throw Object.assign(new Error('Not found'),{status:404});
        const file=isAsset?path.resolve(PUBLIC,'.'+pathname):path.join(PUBLIC,'index.html');
        if(!file.startsWith(PUBLIC+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())throw Object.assign(new Error('Not found'),{status:404});
        const resolvedFile=fs.realpathSync(file);
        if(!resolvedFile.startsWith(fs.realpathSync(PUBLIC)+path.sep))throw Object.assign(new Error('Not found'),{status:404});
        const type={'.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8','.ttf':'font/ttf','.png':'image/png','.ico':'image/x-icon','.json':'application/json'}[path.extname(file)]||'application/octet-stream';
        res.setHeader('Content-Type',type);res.setHeader('Cache-Control','no-cache');
        if(req.method==='HEAD')res.end();else await pipeline(fs.createReadStream(resolvedFile),res);
      }
    }catch(error){
      if(!res.headersSent){res.setHeader('Cache-Control','no-store, private');res.setHeader('Vary','Cookie, Origin');res.statusCode=error.status||500;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:error.status?error.message:'An unexpected error occurred. Please try again.'}));}
      else res.destroy();
      if(!error.status && error.code!=='ERR_STREAM_PREMATURE_CLOSE')console.error('Request failed:',error.message);
    }finally{if(generationKey)generationLocks.delete(generationKey);}
  });
  server.requestTimeout=30000;server.headersTimeout=15000;return server;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const server=createAppServer();const port=Number(process.env.PORT||3000);
  server.listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`Tanuki is listening on port ${port}`));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(async()=>{await closeTrustedGenerations();await closeResponseQueue();closeDatabase();process.exit(0);}));
}
