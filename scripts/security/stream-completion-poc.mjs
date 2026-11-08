// Local synthetic fixture only: no target URL, credentials, or external provider.
import { createServer } from 'node:http';
import { once } from 'node:events';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import CurrentClient from '../../server/lib/ai-client.js';
if(process.platform!=='linux')throw new Error('Run this reproduction in the isolated WSL environment');
const baseline=fs.readFileSync(process.argv[2],'utf8');
const BaselineClient=(await import('data:text/javascript;base64,'+Buffer.from(baseline).toString('base64'))).default;
const provider=createServer((req,res)=>{req.resume();res.setHeader('Content-Type','text/event-stream');res.end('data: {"choices":[{"delta":{"content":"synthetic partial response"}}]}\n\n');});
provider.listen(0,'127.0.0.1');await once(provider,'listening');
try{
  for(const [label,Client,expected]of[['before',BaselineClient,true],['after',CurrentClient,false]]){
    let acceptedAsComplete=false,deltas=0;
    try{const stream=await new Client({baseURL:`http://127.0.0.1:${provider.address().port}/v1`}).chat.completions.create({stream:true,messages:[]});for await(const _ of stream)deltas++;acceptedAsComplete=true;}catch{}
    console.log(JSON.stringify({finding:'RT-12',version:label,fixture:'loopback SSE without completion sentinel',deltas,acceptedAsComplete}));
    assert.equal(acceptedAsComplete,expected);assert.equal(deltas,1);
  }
}finally{provider.closeAllConnections();await new Promise(resolve=>provider.close(resolve));}
