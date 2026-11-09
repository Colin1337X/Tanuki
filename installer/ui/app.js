let token=location.hash.slice(1);history.replaceState(null,'',location.pathname);let step=0,state;
const $=id=>document.getElementById(id),form=$('setup'),error=$('error');
async function request(route,body){const response=await fetch('/api/'+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});const result=await response.json();if(!response.ok)throw new Error(result.error||'Setup could not continue.');return result;}
function showError(message){error.textContent=message;error.hidden=false;error.scrollIntoView({block:'nearest'});}
function showStep(){document.querySelectorAll('.step').forEach((el,i)=>{el.hidden=i!==step;});document.querySelectorAll('nav li').forEach((el,i)=>{if(i===step)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');});$('back').hidden=step===0;$('step-label').textContent=`0${step+1} / 03`;$('next').textContent=step===2?'Create my workspace ✦':'Continue →';document.querySelector(`[data-step="${step}"] h2`).focus();}
function settings(){return Object.fromEntries(['origin','username','password','providerUrl','providerKey'].map(id=>[id,id==='password'?$(id).value:$(id).value.trim()]).concat([['port',Number($('port').value)]]));}
$('back').addEventListener('click',()=>{step--;error.hidden=true;showStep();});
form.addEventListener('submit',async event=>{
  event.preventDefault();error.hidden=true;const current=document.querySelector(`[data-step="${step}"]`);for(const input of current.querySelectorAll('input'))if(!input.reportValidity())return;
  if(step===0){try{const url=new URL($('origin').value);if(url.protocol!=='https:'||url.pathname!=='/'||url.search||url.hash||url.username||url.password)throw new Error();}catch{return showError('Enter an HTTPS address without a path, credentials or query.');}}
  if(step===1&&$('password').value!==$('confirm').value)return showError('The passwords don’t match yet.');
  if(step<2){step++;if(step===2){$('review-origin').textContent=$('origin').value;$('review-user').textContent=$('username').value;$('review-ai').textContent=$('providerUrl').value||'Set up later';}showStep();return;}
  $('next').disabled=true;$('back').disabled=true;$('next').textContent='Creating your workspace…';
  try{const result=await request('install',settings());form.reset();form.hidden=true;$('success').hidden=false;$('proxy-help').textContent=`Route ${result.origin} to 127.0.0.1:${result.port}. The release guide includes a Caddy configuration.`;$('success').querySelector('h2').focus();token='';}
  catch(e){showError(e.message);$('next').disabled=false;$('back').disabled=false;$('next').textContent='Try again →';}
});
try{state=await request('state');$('loading').hidden=true;if(state.complete){$('success').hidden=false;$('success-copy').textContent='A workspace already exists here. Your stories and keys have been left intact.';$('proxy-help').textContent='Keep your existing HTTPS proxy and follow the upgrade guide.';}else{form.hidden=false;$('profile').textContent=state.profile;}}
catch(e){$('loading').hidden=true;showError(e.message);}
