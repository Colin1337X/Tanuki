export function validateProvider(providerUrl, providerKey, { optional = false } = {}) {
  if (typeof providerUrl !== 'string' || typeof providerKey !== 'string' || providerKey.length > 4096) throw new Error('Invalid provider settings.');
  if (!providerUrl && !providerKey && optional) return { providerUrl: '', providerKey: '' };
  let url;
  try { url = new URL(providerUrl); } catch { throw new Error('Enter a valid provider URL.'); }
  // Literal loopback only: no DNS names, private networks, redirects or TLS bypass.
  const local = url.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(url.hostname);
  if ((!local && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash || url.port === '0') throw new Error('Use HTTPS, or HTTP on 127.0.0.1 / [::1] for a local provider.');
  return { providerUrl: url.href.replace(/\/$/, ''), providerKey };
}
