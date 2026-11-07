'use client';

import { useEffect, useState } from 'react';
import { isTauri, getLocalConfig } from '@/lib/tauri';
import OobeWizard from '@/components/OobeWizard';
import ThemeWrapper from '@/components/ThemeWrapper';
import Brand from '@/components/Brand';

export default function Home() {
  // On the local (Tauri) build, first run shows the OOBE wizard; the auth
  // redirect is deferred until setup completes. In a plain browser (or after
  // OOBE), we redirect immediately.
  const [oobeDone, setOobeDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isTauri()) {
        try {
          const raw = await getLocalConfig();
          const cfg = raw ? JSON.parse(raw) : {};
          if (!cfg.oobeCompleted) return; // show OOBE; do not redirect yet
        } catch {
          // Malformed config — fall through and let OOBE handle it.
          return;
        }
      }
      if (!cancelled) setOobeDone(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!oobeDone) return;
    // Check auth status via API and redirect accordingly.
    // Use a full navigation (window.location) so iPadOS WebKit attaches the
    // freshly-set session cookie to subsequent requests.
    fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user?.role === 'admin') window.location.assign('/admin');
        else if (data?.user?.role === 'teacher') window.location.assign('/teacher');
        else if (data?.user?.role === 'student') window.location.assign('/student');
        else window.location.assign('/login');
      })
      .catch(() => {
        window.location.assign('/login');
      });
  }, [oobeDone]);

  return (
    <ThemeWrapper><div className="min-h-screen flex items-center justify-center">
      <div className="text-center" role="status">
        <div className="mb-6"><Brand /></div>
        <p className="muted">Opening your next chapter…</p>
      </div>
      <OobeWizard onComplete={() => setOobeDone(true)} />
    </div></ThemeWrapper>
  );
}
