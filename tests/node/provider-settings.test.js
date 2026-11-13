import test from 'node:test';
import assert from 'node:assert/strict';
import {validateProvider} from '../../installer/provider-settings.mjs';

test('Explicit loopback OpenAI-compatible providers need no fabricated API key',()=>{
  for(const url of ['http://127.0.0.1:8080/v1','http://[::1]:8080/v1']){
    assert.deepEqual(validateProvider(url,''),{providerUrl:url,providerKey:''});
  }
});
test('Local provider exception does not permit remote HTTP, credential URLs or ambiguous destinations',()=>{
  for(const url of ['http://localhost:8080/v1','http://192.168.1.2:8080/v1','http://0.0.0.0:8080','http://127.0.0.1.evil.test/v1','http://user:secret@127.0.0.1:8080/v1','http://127.0.0.1:0/v1','http://127.0.0.1:8080/v1?key=x','http://127.0.0.1:8080/v1#x','file:///tmp/provider']){
    assert.throws(()=>validateProvider(url,'synthetic'));
  }
});
test('Keyless HTTPS providers are supported and empty configuration is explicit',()=>{
  assert.deepEqual(validateProvider('https://provider.test/v1',''),{providerUrl:'https://provider.test/v1',providerKey:''});
  assert.deepEqual(validateProvider('https://provider.test/v1/','synthetic'),{providerUrl:'https://provider.test/v1',providerKey:'synthetic'});
  assert.throws(()=>validateProvider('',''));
  assert.deepEqual(validateProvider('','',{optional:true}),{providerUrl:'',providerKey:''});
  assert.throws(()=>validateProvider('','orphan-key',{optional:true}));
});

test('Keyless provider requests omit Authorization and provider redirects remain blocked',async()=>{
  const {createServer}=await import('node:http');
  const {default:AIClient}=await import('../../server/lib/ai-client.js');
  let mode='normal',seen,redirectHits=0;
  const target=createServer((req,res)=>{redirectHits++;res.end('{}');});
  await new Promise(r=>target.listen(0,'127.0.0.1',r));
  const provider=createServer((req,res)=>{
    seen=req.headers;req.resume();
    if(mode==='redirect'){res.writeHead(307,{Location:'http://127.0.0.1:'+target.address().port+'/v1/chat/completions'});res.end();return;}
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:'synthetic response'}}]}));
  });
  await new Promise(r=>provider.listen(0,'127.0.0.1',r));
  try{
    const client=new AIClient({apiKey:'',baseURL:'http://127.0.0.1:'+provider.address().port+'/v1'});
    const response=await client.chat.completions.create({messages:[{role:'user',content:'synthetic prompt'}]});
    assert.equal(response.choices[0].message.content,'synthetic response');
    assert.equal(seen.authorization,undefined);
    mode='redirect';await assert.rejects(()=>client.chat.completions.create({messages:[]}));
    assert.equal(redirectHits,0);
  }finally{
    provider.closeAllConnections();target.closeAllConnections();
    await Promise.all([new Promise(r=>provider.close(r)),new Promise(r=>target.close(r))]);
  }
});
