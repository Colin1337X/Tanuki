export default class AIClient {
  constructor({apiKey,baseURL}) {
    const endpoint=new URL((baseURL||process.env.OPENAI_BASE_URL||'https://api.openai.com/v1').replace(/\/$/,'')+'/chat/completions');
    if(!['http:','https:'].includes(endpoint.protocol)||endpoint.username||endpoint.password)throw new Error('Invalid AI endpoint');
    if(process.env.NODE_ENV==='production') {
      const configured=[process.env.OPENAI_BASE_URL||'https://api.openai.com/v1',...(process.env.AI_ALLOWED_ORIGINS||'').split(',').filter(Boolean)];
      const allowed=new Set(configured.map(value=>new URL(value).origin));
      if(!allowed.has(endpoint.origin))throw new Error('AI endpoint origin is not allowed by the server operator');
    }
    this.chat={completions:{create:async(body,{signal}={})=>{
      const timeout=AbortSignal.timeout(120000);
      const response=await fetch(endpoint,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',...(apiKey&&apiKey!=='no-key'?{'Authorization':`Bearer ${apiKey}`}:{})},body:JSON.stringify(body),signal:signal?AbortSignal.any([signal,timeout]):timeout});
      if(!response.ok)throw new Error(`AI provider returned ${response.status}`);
      if(!body.stream)return response.json();
      return parseStream(response.body);
    }}};
  }
}
async function* parseStream(body){
  const reader=body.getReader();const decoder=new TextDecoder();let pending='';
  try{while(true){const {done,value}=await reader.read();pending+=decoder.decode(value,{stream:!done});if(pending.length>1024*1024)throw new Error('AI provider event exceeded limit');const lines=pending.split('\n');pending=lines.pop();for(const line of lines){if(!line.startsWith('data:'))continue;const data=line.slice(5).trim();if(data==='[DONE]')return;if(data)yield JSON.parse(data);}if(done)throw new Error('AI provider stream ended before completion');}}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
