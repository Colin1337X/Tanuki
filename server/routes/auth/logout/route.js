import { HttpResponse } from '../../../http.js';
import { COOKIE_NAME,revokeSession,sessionCookie } from '../../../lib/auth.js';
export async function POST(req){revokeSession(sessionCookie(req));const res=HttpResponse.json({ok:true});res.cookies.set(COOKIE_NAME,'',{maxAge:0,path:'/',httpOnly:true,secure:process.env.NODE_ENV==='production'});return res;}
