# Dependency security review — 2026-11-10

**Release status: HOLD.** A clean npm audit is not a clean bill of health for the embedded runtime or build toolchain. Do not publish the current candidates as production-ready.

## Confirmed findings and remediation

| Component | Finding | Exposure and disposition |
| --- | --- | --- |
| Android Gradle 8.13 | CVE-2026-22865, CVE-2026-22816; GHSA-j5m7-59rp-24f5, GHSA-xwqc-3h47-hg64, GHSA-mvvg-497x-hmj8 (high) | Build-host deserialization and repository fallback issues. Updated the workflow and build instructions to 8.14.6, pinned to the upstream SHA-256 `7988ed071b2a07900e2ec715fca15c6ab72bce6db433af301fa7fa7e9407bd24`. Android build and full resolved plugin graph are checked in CI. The October GHSAs have no CVE identifiers in the upstream feed at scan time. |
| Bundled Node 24.22.2 / SQLite 3.53.4 | CVE-2026-119375 (SQLite, medium) | Opening an attacker-controlled database and sibling WAL can disclose uninitialized memory. Node's tagged SQLite source lacks the upstream zero-fill fix in `sqlite3WalReadFrame`. No remote database-upload feature was identified. The data directory is created mode 0700 on POSIX, but this does not repair SQLite and does not validate existing directories or Windows ACLs. **Unresolved runtime blocker**: use a supported Node build containing the fix, then rerun migration, rollback, concurrency and release smoke tests. Do not accept database/WAL files from untrusted sources. |
| Node 24.x | Announced high-severity security release, scheduled on/after November 11, 2026 | Details and the replacement version are not yet published at review time. Do not invent a CVE or patched version. Recheck the upstream release, update runtime pins and runtime license URL together, and rebuild/retest every platform before production publication. |
| Windows development PATH Node 25.5.0 | EOL runtime, predating current security releases | Observed directly with `process.versions`; it is not the bundled release runtime. Use the reviewed isolated Node runtime for development/verification. No machine-wide installation was changed. |
| Inactive Tauri: libsqlite3-sys 0.28.0 through rusqlite 0.31.0 | RUSTSEC-2026-0459 / CVE-2026-119375 | Bundled SQLite affected. Tauri is excluded from the current server/mobile release paths. Do not reactivate this target until upgraded to a patched dependency graph and tested. |
| Inactive Tauri: glib 0.18.5 | RUSTSEC-2024-0429 / GHSA-wrw7-89jp-8q8g | Unsound iterator implementation; fixed upstream in 0.20+. Resolves through the historical GTK/Tauri graph. Not shipped by current workflows; reactivation requires a compatible GTK/Tauri upgrade. |
| Inactive Tauri: proc-macro-error 1.0.4 | RUSTSEC-2024-0370 | Unmaintained package notice, not a newly assigned CVE. Historical build-only graph; retain as a reactivation blocker. |

## Actual scan coverage

- `npm audit --json` completed for both committed lockfiles: **0 known advisories** for the application (22 dependency entries) and isolated worker (15 entries), including optional platform binaries and development dependencies.
- OSV queried **569 package/version entries**, including both npm graphs, a fresh 529-package crates.io resolution of the inactive Tauri manifest, Gradle before/after, and Android Gradle Plugin 8.13.2. Four OSV matches represent **three distinct Rust advisories**, because glib was returned under both GHSA and RustSec identifiers. No npm matches. These are version-database results, not exploitability proofs.
- The historical Tauri target had no committed Cargo.lock. Its resolution was generated in a temporary directory without compiling or running the target. The evidence lockfile is a scan snapshot, not a release lockfile.
- **OSV did not report the Gradle findings**, despite upstream advisories confirming the affected ranges. Manual upstream review was necessary. Do not treat OSV's empty Gradle result as evidence of safety.
- Browser cryptographic libraries are vendored from the locked npm packages. Existing byte/hash comparison regressions check these copies; no browser dependencies were updated by this review.
- The six GitHub Action repositories used by the workflows were checked for published repository security advisories. `actions/download-artifact` reports CVE-2024-42471 affecting 4.0.0–4.1.2; the pinned v6 action is outside that range. The other queried repositories returned no published advisories. This is not an audit of every Action's own dependency graph or its hosted runtime.
- Native iOS and Android application source has no declared third-party runtime package dependency. OS-provided WebKit/WebView, TLS, SDK/JDK, runner images, installer compiler, system libraries, and native binary internals require platform/vendor patching and are not fully covered by npm/OSV package scans. Android's resolved build-plugin and runtime graph is now inventoried and scanned in its actual CI build.

## Prevention

Verification now fails on any npm advisory in either lockfile. Dependabot covers npm, GitHub Actions, and the Android Gradle project. The Android workflow emits exact resolved Maven coordinates, scans OSV, saves evidence even on failure, and fails on findings or unavailable/incomplete scan data. Inline Gradle distribution pins still require manual upstream review: Dependabot's Gradle support does not replace that review.

Raw public-package scan evidence is in [evidence/dependencies-2026-11-10](evidence/dependencies-2026-11-10). No accounts, prompts, keys or credentials were submitted to advisory services. Direct Node-to-OSV access timed out on this host; the completed local scan used the host's PowerShell HTTP transport instead. CI uses the checked-in Node scanner.

## Sources

- [Gradle maintainer advisories](https://github.com/gradle/gradle/security/advisories), including [October SSL fallback](https://github.com/gradle/gradle/security/advisories/GHSA-j5m7-59rp-24f5), [client/daemon deserialization](https://github.com/gradle/gradle/security/advisories/GHSA-xwqc-3h47-hg64), and [worker/daemon authentication](https://github.com/gradle/gradle/security/advisories/GHSA-mvvg-497x-hmj8).
- [SQLite advisory](https://rustsec.org/advisories/RUSTSEC-2026-0459.html), [upstream fix](https://github.com/sqlite/sqlite/commit/e5bf119821f25be1d7f10ef0a2edbe175289166e), [Node 24.22.2 SQLite source](https://github.com/nodejs/node/blob/v24.22.2/deps/sqlite/sqlite3.c).
- [Node November security preannouncement](https://github.com/nodejs/nodejs.org/blob/main/apps/site/pages/en/blog/vulnerability/november-2026-security-releases.md), [Node 24.22.2 release](https://nodejs.org/en/blog/release/v24.22.2).
- [glib advisory](https://rustsec.org/advisories/RUSTSEC-2024-0429.html), [proc-macro-error notice](https://rustsec.org/advisories/RUSTSEC-2024-0370.html), [download-artifact advisory](https://github.com/actions/download-artifact/security/advisories/GHSA-cxww-7g56-2vh6).
