'use client';

import { useState, useEffect, useRef } from 'react';
import ThemeWrapper from '@/components/ThemeWrapper';
import ThemePicker from '@/components/ThemePicker';
import Brand from '@/components/Brand';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [continueUrl, setContinueUrl] = useState<string | null>(null);
  const navigateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (navigateTimer.current) clearTimeout(navigateTimer.current);
    };
  }, []);

  function destinationFor(role: string): string {
    if (role === 'admin') return '/admin';
    if (role === 'teacher') return '/teacher';
    return '/student';
  }

  // Full navigation is required on iOS/iPadOS WebKit: cookies set via a fetch()
  // response are not reliably visible to subsequent fetch() calls in the same
  // page context, but they ARE available after a full page navigation.
  // We use window.location.assign() (not .replace()) and schedule a manual
  // fallback link — on some iPadOS versions location.replace() called inside a
  // fetch continuation is silently dropped, which previously left users stuck
  // on a spinning "Signing in…" button.
  function navigateTo(url: string) {
    // All URLs passed here are same-origin paths, so assign() won't throw;
    // the real iPadOS failure mode is a navigation that's silently dropped,
    // which the timeout below covers by offering a manual link.
    window.location.assign(url);
    // If the navigation did not take effect within 3s, offer a manual link.
    navigateTimer.current = setTimeout(() => setContinueUrl(url), 3000);
  }

  // Redirect already-authenticated users away from the login page.
  // Retry a few times before concluding the user is logged out: on iPadOS the
  // cookie jar can lag a full navigation, and a premature "not authenticated"
  // conclusion here causes the bounce-back-to-/login loop.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (let attempt = 0; attempt < 6; attempt++) {
        try {
          const res = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' });
          if (res.ok) {
            const data = await res.json();
            if (!cancelled && data?.user?.role) navigateTo(destinationFor(data.user.role));
            return;
          }
          if (res.status !== 401) return; // server error — stay on the form
        } catch {
          // transient network failure — keep retrying
        }
        if (attempt < 5) await new Promise((r) => setTimeout(r, 400));
      }
      // After all retries: genuinely not authenticated, stay on the login form.
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setContinueUrl(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        let errorMsg = 'Login failed';
        try {
          const errData = await res.json();
          errorMsg = errData.error || errorMsg;
        } catch { /* ignore JSON parse error */ }
        setError(errorMsg);
        setLoading(false);
        return;
      }
      const data = await res.json();
      navigateTo(destinationFor(data.user.role));
    } catch {
      setError('Login failed — check your connection and try again.');
      setLoading(false);
    }
  }

  return (
    <ThemeWrapper>
      <div className="login-page">
        <header className="login-header"><Brand /><ThemePicker /></header>
        <main className="login-layout" id="main-content">
          <section className="login-story">
            <span className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</span>
            <h1>Small ideas.<br />Extraordinary<br /><em>adventures.</em></h1>
            <p>A story that starts with you. Explore new worlds, follow your curiosity, and find a little joy in every page.</p>
            <div className="book-scene" aria-hidden="true"><div className="book book-one"><span>THE ART OF</span><strong>Wonder</strong><i>✳</i><small>A TANUKI STORY</small></div><div className="book book-two"><span>EVERY DAY, A NEW</span><strong>Adventure</strong><i>◒</i><small>WRITTEN WITH YOU</small></div><span className="scene-star">✦</span></div>
            <div className="login-note"><span>01 / IMAGINE</span><span>02 / CREATE</span><span>03 / EXPLORE</span></div>
          </section>
          <section className="login-form-panel">
            <div className="eyebrow">WELCOME TO TANUKI STORIES</div>
            <h2>Your story awaits.</h2>
            <p className="muted">Sign in to your reading space.</p>
            <form onSubmit={handleSubmit} className="login-form">
              {error && <div role="alert" className="form-error bg-red-500/20">{error}</div>}
              <label htmlFor="username">Username</label>
              <input id="username" type="text" name="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter your username" required />
              <label htmlFor="password">Password</label>
              <input id="password" type="password" name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" required />
              <button type="submit" disabled={loading} className="primary-button">{loading ? 'Signing in...' : 'Sign In'} <span aria-hidden="true">→</span></button>
              {continueUrl && <a href={continueUrl}>Signed in — tap here to continue →</a>}
            </form>
            <p className="login-help">New here? Your teacher or administrator can help you get an account.</p>
            <div className="login-footer"><span className="brand-mark small" aria-hidden="true">t•</span><p>Made for curious minds.<br /><span className="muted">Students, teachers, and the stories between.</span></p></div>
          </section>
        </main>
        <footer className="site-footer">TANUKI STORIES <span>Make room for a little imagination.</span></footer>
      </div>
    </ThemeWrapper>
  );
}
