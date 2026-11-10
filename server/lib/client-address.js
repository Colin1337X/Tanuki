import {isIP} from 'node:net';
const normalize=ip=>ip?.startsWith('::ffff:')?ip.slice(7):ip;
export function clientAddress(peer,forwarded,trusted=process.env.TANUKI_TRUSTED_PROXY_IPS||''){
  const address=normalize(peer)||'unknown';
  const allowed=trusted.split(',').map(s=>normalize(s.trim())).filter(s=>isIP(s));
  if(!allowed.includes(address)||typeof forwarded!=='string'||forwarded.length>1024)return address;
  // Trust only the address appended by the immediate trusted proxy, never the
  // leftmost (potentially attacker-supplied) element of an arbitrary chain.
  const last=normalize(forwarded.split(',').at(-1).trim());return isIP(last)?last:address;
}
