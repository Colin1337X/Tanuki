import fs from 'node:fs';
import path from 'node:path';
const input=process.argv[2],output=process.argv[3]||'coverage/dependency-audit.json';
if(!input)throw Error('Usage: node scripts/security/audit-inventory.mjs inventory.json [report.json]');
const inventory=JSON.parse(fs.readFileSync(input,'utf8').replace(/^\uFEFF/,''));
if(!Array.isArray(inventory)||!inventory.length||inventory.some(p=>!p.name||!p.version||!p.ecosystem))throw Error('A nonempty exact-version inventory is required');
const report={scannedAt:new Date().toISOString(),source:'https://api.osv.dev',status:'incomplete',inventory,findings:[],details:{}};
fs.mkdirSync(path.dirname(output),{recursive:true});
async function json(url,body){const r=await fetch(url,{...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error(`Advisory service HTTP ${r.status}`);return r.json();}
try{
  for(let start=0;start<inventory.length;start+=100){const slice=inventory.slice(start,start+100);const {results}=await json('https://api.osv.dev/v1/querybatch',{queries:slice.map(p=>({package:{name:p.name,ecosystem:p.ecosystem},version:p.version}))});if(!Array.isArray(results)||results.length!==slice.length)throw Error('Incomplete advisory response');for(let i=0;i<slice.length;i++){if(results[i].next_page_token)throw Error('Paginated advisory response requires manual review');for(const v of results[i].vulns||[])report.findings.push({...slice[i],id:v.id});}}
  for(const id of new Set(report.findings.map(f=>f.id)))report.details[id]=await json('https://api.osv.dev/v1/vulns/'+encodeURIComponent(id));
  report.findings=report.findings.filter(f=>!report.details[f.id].withdrawn);
  report.status=report.findings.length?'findings':'no-known-advisories';
  console.log(`${inventory.length} package/version entries checked; ${report.findings.length} advisory matches. Aliases may refer to the same defect.`);
  for(const f of report.findings)console.log(`${f.name}@${f.version}: ${f.id} ${report.details[f.id].summary||''}`);
  if(report.findings.length)process.exitCode=1;
}catch(e){report.error=e.message;process.exitCode=2;console.error('Dependency audit incomplete: '+e.message);}
finally{fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');}
