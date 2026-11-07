# WSL production-like validation — 2026-11-07

## Environment and isolation

Ubuntu 26.04 on WSL2, Linux x86_64, kernel 6.6.87.2-microsoft-standard-WSL2, non-root UID 1000. Node **24.22.2 LTS** was downloaded from the official Node distribution and its archive checked against the official SHA-256 manifest. Dependencies were installed natively on the Linux filesystem, not reused from Windows.

Run directory: `/home/colin/tanuki-wsl-validation.e8sQlQ`. A test checkout and a separate production-only checkout were used. The production installation used `npm ci --omit=dev`; Playwright was absent there. Fresh data, random bootstrap credentials, private keys and a one-day test TLS certificate were created under a mode-0700 temporary directory. The existing Windows development database, keys and server were not used or modified.

## Results

| Check | Result |
|---|---|
| Complete automated suite on Linux, including Chromium | **531 passed, 0 failed, 0 skipped** |
| Separate production-mode HTTPS/process/recovery checks | **14 passed, 0 failed, 0 skipped** |
| Native Linux build/syntax validation before adding the new smoke script | 49 modules passed |
| Production dependency audit | 0 reported vulnerabilities |
| Loaded server line / branch / function coverage | 81.19% / 77.88% / 87.84% |
| Browser source-character-range coverage | 54.05% |

The main suite isolates its fixtures with test settings. The additional 14 checks actually launch a child server with `NODE_ENV=production`, an explicit HTTPS origin, fresh ML-KEM keys, no development dependencies and no development accounts. Counts are reported separately to avoid implying that all 531 cases run in production mode.

The first attempts exposed environment prerequisites: the browser download had not yet finished, then Chromium lacked NSPR, NSS and ALSA libraries. The libraries were downloaded using refreshed Ubuntu package metadata and extracted into the test directory; no global OS package installation was performed. After setup, the entire suite passed without changing application code or weakening assertions. Initial failed logs were superseded by the final complete-run log.

## Production-mode checks

The reproducible harness is `scripts/production-smoke.test.js`. It uses a real TLS-terminating Node HTTPS reverse proxy forwarding to the loopback application. Requests verify the private test certificate explicitly; certificate validation is not disabled and the certificate is not installed in the system trust store.

Verified: non-root execution, key permissions, production-only dependencies, HSTS/CSP, no default development accounts, Secure/HttpOnly/SameSite cookies, creation of two accounts, Lexile/Classroom preference persistence, generated story ownership, cross-origin rejection, private/no-store/Vary response headers, graceful SIGTERM and restart, durable sessions and data, offline backup, offline key rotation, matching-key restoration, immediate disabled-account access loss and logout replay rejection after restart. All test app and proxy processes shut down after the run.

A deterministic local HTTP provider supplied prose for the production generation check. Native Argon2id, ML-KEM and AES-GCM-SIV were real throughout. No live AI account, model-quality guarantee or external provider availability is implied.

## Small concurrent-request measurement

200 authenticated story-list reads were sent through HTTPS in ten batches of 20, alternating two account cookies. All responses had the correct account's records and non-cacheable headers.

- Elapsed: **218 ms**
- p50: **11 ms**
- p95: **48 ms**
- Maximum: **52 ms**

This is a short warm local exercise on a tiny dataset, not a capacity benchmark, sustained soak test, internet latency measurement or deployment SLO.

Linux microbenchmarks: Argon2id native Rust 34.913 ms versus Node/OpenSSL 100.246 ms at 64 MiB/t=3/p=1; ML-KEM-1024 encapsulation 0.030 ms and decapsulation 0.032 ms; Noble AES-256-GCM-SIV on 64 KiB 0.869 ms. These measurements support the current implementation choice on this host, not a universal fastest-library claim.

## Reproduce the production harness

In a separate Linux checkout with Node >=24.8.0 and OpenSSL installed:

```sh
npm ci --omit=dev
node --test scripts/production-smoke.test.js
```

The harness chooses ephemeral loopback ports, creates its own temporary data and keys, and leaves its private temporary artifact directory available for inspection. It does not deploy a persistent service. Do not confuse its test certificate or generated credentials with production provisioning.

For the full suite, install development dependencies and Chromium with its required Linux libraries, then run `npm run test:coverage` and `npm run coverage:report`.

## Artifacts and remaining limits

Windows workspace artifacts: `coverage/wsl/full-suite.txt`, `production-smoke.txt`, `report.html`, `summary.json`, `lcov.info`, `crypto-benchmark.json` and `npm-audit.txt`. Raw Linux browser V8 data remains in the isolated app checkout. These generated artifacts are ignored by Git; this document and the harness are source files.

Docker Desktop is not integrated into this WSL distribution, so **no Docker image/container run was performed**. The HTTPS proxy was the test harness, not Nginx/Caddy, a CDN or the actual deployment edge. Public certificates, actual reverse-proxy policy, browser behavior over the production hostname, sustained load, real microphones, external AI providers, power-loss recovery and a production-scale recovery drill remain untested. The isolated backup/restore exercise does not replace a deploy-specific recovery plan. Existing security limits in `SECURITY.md` still apply. These results do not establish production readiness.
