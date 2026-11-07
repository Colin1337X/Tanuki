const ts = require('typescript');
const fs = require('fs');
const path = require('path');
function convert(file, out) {
 let s = fs.readFileSync(file,'utf8');
 s = ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 s=s.replace(/from ['"]next\/server['"]/g, `from '${path.relative(path.dirname(out),'server/http.js').replaceAll('\\','/')}'`).replaceAll('NextResponse','HttpResponse');
 s=s.replace(/(['"])@\/lib\/([^'"]+)\1/g,(_,q,name)=>q+path.relative(path.dirname(out),'server/lib/'+name+'.js').replaceAll('\\','/')+q);
 s=s.replace(/(from\s+|import\()(['"])(\.\.?\/[^'"]+)\2/g,(_,prefix,q,p)=>prefix+q+(p.endsWith('.js')?p:p+'.js')+q);
 s=s.replace(/from ['"](http.js)['"]/g,"from './http.js'");
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,s);
}
for(const n of ['storage','reading-levels','safety','openai','web-search']) convert('src/lib/'+n+'.ts','server/lib/'+n+'.js');
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(e.name==='route.ts') convert(p,p.replace('src\\app\\api','server\\routes').replace('route.ts','route.js'));}}
walk('src/app/api');
fs.copyFileSync('src/app/studio.css','public/assets/app.css');
fs.copyFileSync('src/app/fonts/Fredoka.ttf','public/assets/Fredoka.ttf');
fs.copyFileSync('src/app/fonts/Fredoka-OFL.txt','public/assets/Fredoka-OFL.txt');
