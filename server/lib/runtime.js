// Node 26.13.1 includes the November security release; SQLite 3.54.0
// includes the CVE-2026-119375 fix. Check before opening any database, including
// source checkouts and the independently deployed generation worker.
export function assertSupportedRuntime(versions = process.versions) {
  const atLeast = (actual, minimum) => {
    const parts = String(actual || '').split('.').map(Number);
    if (parts.length !== 3 || parts.some(n => !Number.isSafeInteger(n) || n < 0)) return false;
    for (let i=0;i<3;i++) { if(parts[i]!==minimum[i]) return parts[i]>minimum[i]; }
    return true;
  };
  if (!String(versions.node).startsWith('26.') || !atLeast(versions.node,[26,13,1]) || !atLeast(versions.sqlite,[3,54,0])) {
    throw new Error('Tanuki requires reviewed Node 26.13.1+ (26.x) with SQLite 3.54.0+. Update the runtime before opening application data.');
  }
}
