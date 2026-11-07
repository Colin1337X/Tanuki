export class HttpResponse extends Response {
  static json(data, options={}) {
    const headers=new Headers(options.headers);headers.set('Content-Type','application/json; charset=utf-8');
    return new HttpResponse(JSON.stringify(data),{...options,headers});
  }
  cookies={set:(name,value,options={})=>{
    let cookie=`${name}=${encodeURIComponent(value)}; Path=${options.path||'/'}; SameSite=Lax`;
    if(options.httpOnly)cookie+='; HttpOnly';
    if(options.secure)cookie+='; Secure';
    if(options.maxAge!==undefined)cookie+=`; Max-Age=${options.maxAge}`;
    this.headers.append('Set-Cookie',cookie);
  }};
}
