function loopback(address) {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}
export function allowedMutation(req, canonicalOrigin) {
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  const origin = req.headers.origin;
  if (!origin) return true; // Existing non-browser API clients still authenticate normally.
  if (origin === canonicalOrigin) return true;
  // Direct same-origin access on this listener is useful even when the public
  // HTTPS origin points at a proxy. Do not extend that exception through proxies.
  if (!loopback(req.socket.remoteAddress) || Object.keys(req.headers).some(k => k === 'forwarded' || k.startsWith('x-forwarded-'))) return false;
  try {
    const local = new URL(origin);
    return local.protocol === 'http:' && local.origin === origin &&
      ['localhost', '127.0.0.1', '[::1]'].includes(local.hostname) &&
      local.host === req.headers.host &&
      Number(local.port || 80) === req.socket.localPort;
  } catch { return false; }
}
