import { HttpResponse } from '../../../http.js';
import { validateCredentials, createSessionToken, COOKIE_NAME } from '../../../lib/auth.js';
import { consumeRateLimit } from '../../../lib/database.js';
import { createHash } from 'node:crypto';
export async function POST(req) {
  const {username,password}=await req.json();
  if(typeof username!=='string'||typeof password!=='string'||username.length>64||password.length>1024)return HttpResponse.json({error:'Invalid credentials'},{status:400});
  const key=createHash('sha256').update(username).digest('hex');
  if(!consumeRateLimit(`login:${key}`,10,15*60*1000))return HttpResponse.json({error:'Too many attempts. Try again in 15 minutes.'},{status:429,headers:{'Retry-After':'900'}});
  const user=await validateCredentials(username,password);
  if(!user)return HttpResponse.json({error:'Invalid credentials'},{status:401});
  const res=HttpResponse.json({user});
  res.cookies.set(COOKIE_NAME,createSessionToken(user),{httpOnly:true,secure:process.env.NODE_ENV==='production',maxAge:28800,path:'/'});
  return res;
}
