# Dependency security review — 2026-11-10

**Runtime remediation update:** the active runtime has been upgraded to official LTS Node 26.13.0, which embeds SQLite 3.54.0 and the upstream WAL zero-fill fix. App and worker startup reject older Node/SQLite engines. The findings below describe the original scanned runtime; its SQLite finding is fixed in the validated runtime upgrade. The separately announced November security patch remains unpublished and cannot yet be applied.

**Release status: HOLD for the announced Node update.** A clean npm audit is not a clean bill of health for the embedded runtime or build toolchain. Do not publish the current candidates as production-ready.

## Confirmed findings and remediation

| Component | Finding | Exposure and disposition |
| --- | --- | --- |
| Android Gradle 8.13 | CVE-2026-22865, CVE-2026-22816; GHSA-j5m7-59rp-24f5, GHSA-xwqc-3h47-hg64, GHSA-mvvg-497x-hmj8 (high) | Build-host deserialization and repository fallback issues. Updated the workflow and build instructions to 8.14.6, pinned to the upstream SHA-256 `7988ed071b2a07900e2ec715fca15c6ab72bce6db433af301fa7fa7e9407bd24`. Android build and full resolved plugin graph are checked in CI. The October GHSAs have no CVE identifiers in the upstream feed at scan time. |
| Bundled Node 24.22.2 / SQLite 3.53.4 | CVE-2026-119375 (SQLite, medium) | Opening an attacker-controlled database and sibling WAL can disclose uninitialized memory. Node's tagged SQLite source lacks the upstream zero-fill fix in `sqlite3WalReadFrame`. No remote database-upload feature was identified. The data directory is created mode 0700 on POSIX, but this does not repair SQLite and does not validate existing directories or Windows ACLs. **Fixed in the active release path on 2026-11-11** by Node 26.13.0 / SQLite 3.54.0, with the regression suite and cross-platform builds passing. Old bundles remain affected and must be replaced. Do not accept database/WAL files from untrusted sources. |
| Node 24.x and 26.x | Announced high-severity security release, scheduled on/after November 11, 2026 | Details and the replacement version are not yet published at review time. Do not invent a CVE or patched version. Recheck the upstream release, update runtime pins and runtime license URL together, and rebuild/retest every platform before production publication. |
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

## Android transitive findings from the first CI scan

The first resolved Android scan checked 126 package/version entries and correctly failed with 49 advisory matches across 12 coordinates (48 distinct GHSA IDs). These are the build-plugin graph, not evidence that the shipped WebView client exposes each vulnerable function. The raw before report preserves affected ranges and upstream references. No findings were suppressed.

| Affected coordinate | Resolved version | Advisory / CVE |
| --- | --- | --- |
| org.bouncycastle:bcpkix-jdk18on | 1.79 | [GHSA-wg6q-6289-32hp](https://osv.dev/vulnerability/GHSA-wg6q-6289-32hp) · CVE-2026-5588 |
| com.google.guava:guava | 33.3.1-jre | [GHSA-xxph-c9ww-hj94](https://osv.dev/vulnerability/GHSA-xxph-c9ww-hj94) · CVE-2026-102554 |
| org.apache.commons:commons-compress | 1.21 | [GHSA-4265-ccf5-phj5](https://osv.dev/vulnerability/GHSA-4265-ccf5-phj5) · CVE-2024-26308 |
| org.apache.commons:commons-compress | 1.21 | [GHSA-4g9r-vxhx-9pgx](https://osv.dev/vulnerability/GHSA-4g9r-vxhx-9pgx) · CVE-2024-25710 |
| org.bouncycastle:bcprov-jdk18on | 1.79 | [GHSA-574f-3g2m-x479](https://osv.dev/vulnerability/GHSA-574f-3g2m-x479) · CVE-2025-14813 |
| org.bouncycastle:bcprov-jdk18on | 1.79 | [GHSA-9pwp-9qqc-pr26](https://osv.dev/vulnerability/GHSA-9pwp-9qqc-pr26) · CVE-2026-8763 |
| org.bouncycastle:bcprov-jdk18on | 1.79 | [GHSA-c3fc-8qff-9hwx](https://osv.dev/vulnerability/GHSA-c3fc-8qff-9hwx) · CVE-2026-0636 |
| org.bouncycastle:bcprov-jdk18on | 1.79 | [GHSA-p93r-85wp-75v3](https://osv.dev/vulnerability/GHSA-p93r-85wp-75v3) · CVE-2026-5598 |
| org.bouncycastle:bcprov-jdk18on | 1.79 | [GHSA-qp49-qgx5-5m26](https://osv.dev/vulnerability/GHSA-qp49-qgx5-5m26) · CVE-2026-13506 |
| org.bitbucket.b_c:jose4j | 0.9.5 | [GHSA-3677-xxcr-wjqv](https://osv.dev/vulnerability/GHSA-3677-xxcr-wjqv) · CVE-2024-29371 |
| org.jdom:jdom2 | 2.0.6 | [GHSA-2363-cqg2-863c](https://osv.dev/vulnerability/GHSA-2363-cqg2-863c) · CVE-2021-33813 |
| io.netty:netty-codec-http2 | 4.1.110.Final | [GHSA-563q-j3cm-6jxm](https://osv.dev/vulnerability/GHSA-563q-j3cm-6jxm) · CVE-2026-50560 |
| io.netty:netty-codec-http2 | 4.1.110.Final | [GHSA-5x3r-wrvg-rp6q](https://osv.dev/vulnerability/GHSA-5x3r-wrvg-rp6q) · CVE-2026-47244 |
| io.netty:netty-codec-http2 | 4.1.110.Final | [GHSA-93wv-jw9v-4972](https://osv.dev/vulnerability/GHSA-93wv-jw9v-4972) · CVE-2026-56819 |
| io.netty:netty-codec-http2 | 4.1.110.Final | [GHSA-c2gf-v879-257j](https://osv.dev/vulnerability/GHSA-c2gf-v879-257j) · CVE-2026-48043 |
| io.netty:netty-codec-http2 | 4.1.110.Final | [GHSA-c69g-56f8-xwqj](https://osv.dev/vulnerability/GHSA-c69g-56f8-xwqj) · CVE-2026-59900 |
| io.netty:netty-codec-http2 | 4.1.110.Final | [GHSA-f6hv-jmp6-3vwv](https://osv.dev/vulnerability/GHSA-f6hv-jmp6-3vwv) · CVE-2026-42587 |
| io.netty:netty-codec-http2 | 4.1.110.Final | [GHSA-prj3-ccx8-p6x4](https://osv.dev/vulnerability/GHSA-prj3-ccx8-p6x4) · CVE-2025-55163 |
| io.netty:netty-codec-http2 | 4.1.110.Final | [GHSA-w9fj-cfpg-grvv](https://osv.dev/vulnerability/GHSA-w9fj-cfpg-grvv) · CVE-2026-33871 |
| io.netty:netty-handler-proxy | 4.1.110.Final | [GHSA-45q3-82m4-75jr](https://osv.dev/vulnerability/GHSA-45q3-82m4-75jr) · CVE-2026-42578 |
| io.netty:netty-codec-http | 4.1.110.Final | [GHSA-38f8-5428-x5cv](https://osv.dev/vulnerability/GHSA-38f8-5428-x5cv) · CVE-2026-42585 |
| io.netty:netty-codec-http | 4.1.110.Final | [GHSA-4mp9-239f-g9hg](https://osv.dev/vulnerability/GHSA-4mp9-239f-g9hg) · CVE-2026-59898 |
| io.netty:netty-codec-http | 4.1.110.Final | [GHSA-57rv-r2g8-2cj3](https://osv.dev/vulnerability/GHSA-57rv-r2g8-2cj3) · CVE-2026-42584 |
| io.netty:netty-codec-http | 4.1.110.Final | [GHSA-6cqp-g7gg-8hr5](https://osv.dev/vulnerability/GHSA-6cqp-g7gg-8hr5) · CVE-2026-56746 |
| io.netty:netty-codec-http | 4.1.110.Final | [GHSA-6jqx-86gh-f27w](https://osv.dev/vulnerability/GHSA-6jqx-86gh-f27w) · CVE-2026-55831 |
| io.netty:netty-codec-http | 4.1.110.Final | [GHSA-84h7-rjj3-6jx4](https://osv.dev/vulnerability/GHSA-84h7-rjj3-6jx4) · CVE-2025-67735 |
| io.netty:netty-codec-http | 4.1.110.Final | [GHSA-8c42-7qj2-3j46](https://osv.dev/vulnerability/GHSA-8c42-7qj2-3j46) · CVE-2026-59903 |
| io.netty:netty-codec-http | 4.1.110.Final | [GHSA-f6hv-jmp6-3vwv](https://osv.dev/vulnerability/GHSA-f6hv-jmp6-3vwv) · CVE-2026-42587 |
| io.netty:netty-codec-http | 4.1.110.Final | [GHSA-fghv-69vj-qj49](https://osv.dev/vulnerability/GHSA-fghv-69vj-qj49) · CVE-2025-58056 |
| io.netty:netty-codec-http | 4.1.110.Final | [GHSA-gcjf-9mgh-3p7g](https://osv.dev/vulnerability/GHSA-gcjf-9mgh-3p7g) · CVE-2026-59921 |
| io.netty:netty-codec-http | 4.1.110.Final | [GHSA-hvcg-qmg6-jm4c](https://osv.dev/vulnerability/GHSA-hvcg-qmg6-jm4c) · CVE-2026-50020 |
| io.netty:netty-codec-http | 4.1.110.Final | [GHSA-jppx-w49h-x2qq](https://osv.dev/vulnerability/GHSA-jppx-w49h-x2qq) · CVE-2026-56745 |
| io.netty:netty-codec-http | 4.1.110.Final | [GHSA-m4cv-j2px-7723](https://osv.dev/vulnerability/GHSA-m4cv-j2px-7723) · CVE-2026-42580 |
| io.netty:netty-codec-http | 4.1.110.Final | [GHSA-mvh2-crg5-v77c](https://osv.dev/vulnerability/GHSA-mvh2-crg5-v77c) · CVE-2026-55833 |
| io.netty:netty-codec-http | 4.1.110.Final | [GHSA-pwqr-wmgm-9rr8](https://osv.dev/vulnerability/GHSA-pwqr-wmgm-9rr8) · CVE-2026-33870 |
| io.netty:netty-codec-http | 4.1.110.Final | [GHSA-q4f6-jm68-57ww](https://osv.dev/vulnerability/GHSA-q4f6-jm68-57ww) · CVE-2026-59899 |
| io.netty:netty-codec-http | 4.1.110.Final | [GHSA-v8h7-rr48-vmmv](https://osv.dev/vulnerability/GHSA-v8h7-rr48-vmmv) · CVE-2026-41417 |
| io.netty:netty-codec-http | 4.1.110.Final | [GHSA-xxqh-mfjm-7mv9](https://osv.dev/vulnerability/GHSA-xxqh-mfjm-7mv9) · CVE-2026-42581 |
| io.netty:netty-handler | 4.1.110.Final | [GHSA-3qp7-7mw8-wx86](https://osv.dev/vulnerability/GHSA-3qp7-7mw8-wx86) · CVE-2026-44249 |
| io.netty:netty-handler | 4.1.110.Final | [GHSA-4g8c-wm8x-jfhw](https://osv.dev/vulnerability/GHSA-4g8c-wm8x-jfhw) · CVE-2025-24970 |
| io.netty:netty-handler | 4.1.110.Final | [GHSA-c4c3-7fpv-j4q5](https://osv.dev/vulnerability/GHSA-c4c3-7fpv-j4q5) · CVE-2026-75595 |
| io.netty:netty-handler | 4.1.110.Final | [GHSA-c653-97m9-rcg9](https://osv.dev/vulnerability/GHSA-c653-97m9-rcg9) · CVE-2026-50010 |
| io.netty:netty-handler | 4.1.110.Final | [GHSA-fccg-mwvh-qqg4](https://osv.dev/vulnerability/GHSA-fccg-mwvh-qqg4) · CVE-2026-75596 |
| io.netty:netty-handler | 4.1.110.Final | [GHSA-x4gw-5cx5-pgmh](https://osv.dev/vulnerability/GHSA-x4gw-5cx5-pgmh) · CVE-2026-45416 |
| io.netty:netty-codec | 4.1.110.Final | [GHSA-3p8m-j85q-pgmj](https://osv.dev/vulnerability/GHSA-3p8m-j85q-pgmj) · CVE-2025-58057 |
| io.netty:netty-codec | 4.1.110.Final | [GHSA-558v-64gr-wgg4](https://osv.dev/vulnerability/GHSA-558v-64gr-wgg4) · CVE-2026-59901 |
| io.netty:netty-codec | 4.1.110.Final | [GHSA-mj4r-2hfc-f8p6](https://osv.dev/vulnerability/GHSA-mj4r-2hfc-f8p6) · CVE-2026-42583 |
| io.netty:netty-common | 4.1.110.Final | [GHSA-389x-839f-4rhx](https://osv.dev/vulnerability/GHSA-389x-839f-4rhx) · CVE-2025-25193 |
| io.netty:netty-common | 4.1.110.Final | [GHSA-xq3w-v528-46rv](https://osv.dev/vulnerability/GHSA-xq3w-v528-46rv) · CVE-2024-47535 |

Patched build dependency lines: Netty 4.1.140.Final, Bouncy Castle jdk18on 1.86, Guava 33.8.0-jre, Commons Compress 1.28.0, jose4j 0.9.7, and JDOM 2.0.6.1. Exact versions were checked against Maven Central metadata. The CI inventory and audit must validate the actual resolved versions, and APK assembly/lint must pass before accepting these overrides.

The separate WSL cryptographic verification completed **42 tests passed, 0 failed, 0 skipped**, including vendored byte/hash checks and real encryption/decryption. This does not clear runtime or platform advisory blockers.

## Completed remediation verification

On code commit `22db6b405254d8b09ec3b8d4d8702b61033abba2`:

- [Application verification](https://github.com/Colin1337X/Tanuki/actions/runs/42814448430) succeeded: **717 passed, 0 failed, 0 skipped**, followed by runtime crash/recovery, installed-profile, production-only dependency, and worker identity/isolation checks.
- [Android job](https://github.com/Colin1337X/Tanuki/actions/runs/42814448506/job/129824673575) completed successfully in mobile workflow run **42814448506**: resolved dependency audit, URL policy tests, debug and release APK assembly, release lint, and debug APK signature verification.
- The patched Android graph has **128 exact package/version entries and zero known OSV advisory matches**. Before/after inventory and full advisory responses are committed alongside the npm/Rust evidence. This establishes the scanned versions and successful builds, not reachability analysis of every advisory or absence of unknown defects.
- Actionlint and JavaScript syntax checks passed. No npm versions, cryptographic algorithms, or server runtime binaries were changed.

The iOS simulator and server installer matrix run separately. These unchanged-platform runs are not needed to prove the Android dependency resolution, and their status must not be inferred from the successful Android job. **The runtime release hold remains in force even when all CI jobs pass.**

## Validated SQLite runtime remediation — 2026-11-11 (Asia/Seoul)

Code commit `690e7d5e7d0fe84aea8281bc28f950383b226215` moves all CI runtime pins and release bundles to **official LTS Node 26.13.0**, whose actual SQLite engine reports **3.54.0**. The tagged amalgamation contains the upstream WAL zero-fill fix. This resolves CVE-2026-119375 in the active application/worker path without adding a SQLite binding or maintaining a custom Node build. Historical Tauri dependencies remain inactive and unchanged.

Application and worker startup reject older Node or SQLite versions before opening databases. Source-checkout engine requirements match; Linux packages now declare Node 26's `libatomic1` dependency. The isolated worker bundle includes the guard. Existing installations need the new bundle: changing repository pins does not update already-installed runtimes.

- [Application CI](https://github.com/Colin1337X/Tanuki/actions/runs/42826432878): **721 passed, 0 failed, 0 skipped**; the same full count passed in isolated WSL. An additional WSL crash/recovery and installed-profile run passed **15/15**.
- [Release matrix](https://github.com/Colin1337X/Tanuki/actions/runs/42826433079): Windows x64, Linux x64, macOS Intel and macOS Apple Silicon builds and their configured smoke tests all succeeded. Draft publication was correctly skipped for a PR run.
- [Mobile CI](https://github.com/Colin1337X/Tanuki/actions/runs/42826432944): Android and iOS jobs both succeeded.
- [Runtime/source evidence](evidence/runtime-2026-11-11/verification.json) records the source digest, fix presence, test counts and runs.

The remaining Node security issue is different: upstream still only preannounces a high-severity release on/after November 11, affecting 26.x as well as 24.x. The distribution index still lists 26.13.0 as the latest 26.x release at this checkpoint. No public fix or precise issue description is available to apply or independently reproduce. Keep production publication on hold until that release is applied and the same checks pass. Successful SQLite remediation does not resolve the unpublished issue.
