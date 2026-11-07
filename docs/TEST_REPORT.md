# Verification report — 2026-11-07

## Actual run

On Windows x64 with Node.js 25.5.0:

| Check | Actual result |
|---|---|
| Complete Node test runner suite (`npm run test:coverage`) | **531 passed, 0 failed, 0 skipped, 0 cancelled** |
| Real Chromium browser cases (included above) | 65 passed |
| Additional HTTP generation/recording workflow cases (included above) | 26 passed |
| JavaScript syntax/build check | 49 modules passed |
| `npm audit --omit=dev` | 0 reported vulnerabilities at the time of execution |
| Loaded server line coverage | **81.19%** — 1,878 / 2,313 |
| Loaded server branch coverage | **77.88%** — 648 / 832 |
| Loaded server function coverage | **87.84%** — 195 / 222 |
| Browser `app.js` executed source-character ranges | **51.33%** — 20,257 / 39,463 |

Artifacts: `coverage/full-suite.txt`, `coverage/lcov.info`, `coverage/report.html`, `coverage/summary.json`, `coverage/browser-v8.json`, `coverage/screenshots/`, and `coverage/crypto-benchmark.json`. Coverage is generated locally and ignored by Git; this report is versionable source documentation. Browser coverage is a union of V8 execution ranges across contexts; it is not interchangeable with server line, statement or branch coverage. Server coverage excludes unloaded modules, dependency internals and execution inside migration child processes. No coverage threshold or test count is used to claim production readiness.

The 531 cases arose from distinct threat boundaries, protocol inputs, reference vectors, persistence behavior and browser/theme/viewport combinations. Parameterized malformed-input and role matrices each assert rejection and/or isolation. They are not repeated assertions solely to reach a target. All retained tests ran; none were skipped or converted to mock-only checks.

## What was verified

- Authentication, native Argon2id parameters and independent cross-verification; random salts; invalid credentials and malformed tokens; cookie security attributes; per-account session expiry, logout/replay, deletion, disabling, re-enabling, password and role changes.
- Student/account ownership across reads and writes, teacher roster isolation, administrator boundaries, role escalation attempts, alternating and concurrent account requests, no-store/private/Vary headers, and absence of cache validators on authenticated responses.
- JSON/body/content-type/path/prototype/depth limits; cross-origin mutations; login and generation quotas; concurrent account creation and generation; real cross-process SQLite append races and rollback integrity.
- AES-256-GCM-SIV RFC vectors, ML-KEM-1024 ACVP-derived vectors, real encapsulation/decapsulation, implicit rejection, corrupted ciphertext, authenticated context binding, key mismatch/missing keys, rotation and old-key recovery.
- Atomic, idempotent legacy migration with legitimate records and plaintext passwords preserved through hashing; malformed/duplicate legacy data aborts safely; persisted data survives reopen; source originals remain unchanged.
- Generation integration sends Lexile and content restrictions, persists provider output, handles failure, validates plans, parses fragmented Unicode SSE, completes chapters once, rejects replay and extends stories. Local HTTP provider fixtures supply deterministic prose; these tests exercise application integration, not live AI quality.
- Recording upload/playback uses real encryption, enforces ownership, checks chapter numbers, size and MIME labels, and rejects tampering/path traversal. Knowledge document create/read/delete is persisted.
- Studio, claymorphic Classroom and Focus at 375/768/1440 pixels across login, student, reader and admin screens; Jua loading; no page overflow; mobile navigation; keyboard login/dialog focus; named form controls and unique IDs; selected reading-text contrast; Lexile keyboard interaction and persistence; fresh-browser account themes; library filtering; chapter navigation; text sizing; stored-XSS escaping; editing; logout; teacher navigation.
- Production refuses missing administrator/weak bootstrap/HTTP origin/missing keys. Docker configuration declares a non-root user, persistent data, read-only keys and excluded secrets. These are configuration checks, not a container runtime validation.

## Problems found and fixed

Initial iterations exposed an incorrectly exercised POST-only endpoint in the test harness, theme setup overwriting persisted storage in browser tests, and a test using a nonexistent storage accessor; the harness was corrected without loosening the behavior assertions. Application regressions found and fixed included hidden mobile Preferences/library links, mobile login overflow, escaping modal keyboard focus, duplicate field IDs, fresh-browser theme restoration, first-classroom-only safety restrictions, malformed search inputs, loosely parsed recording chapter/MIME values, recording metadata traversal, ignored malformed chapter requests and silent demo-plan substitution on provider failure. The full suite was rerun after fixes.

## Important gaps

External web search, all administrator editor combinations, browser generation/recording device flows, legacy embedded-model rejection, AI endpoint streaming edge cases and every provider failure mode are not exhaustively covered. Frontend coverage is approximately half its source ranges. Tests do not certify model safety, Lexile accuracy, GDPR/COPPA/FERPA compliance, FIPS status, full WCAG conformance, all browsers, sustained load, TLS termination, CDN behavior, Docker execution or disaster recovery. See `SECURITY.md` and `DEPLOYMENT.md` for operational limits and plaintext migration handling.

## Measured cryptographic performance

On this host: Argon2id at 64 MiB/t=3/p=1 averaged approximately 31.823 ms with native Rust versus 175.994 ms through Node/OpenSSL. Native ML-KEM-1024 encapsulation/decapsulation averaged 0.026/0.032 ms; Noble AES-256-GCM-SIV on a 64 KiB payload averaged 0.861 ms. These are local microbenchmarks, not throughput guarantees or a survey of every cryptographic library. Production hardware and concurrent memory pressure must be measured separately.
