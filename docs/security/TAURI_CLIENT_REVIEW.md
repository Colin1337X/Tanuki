# Tauri client migration verification — 2026-11-11

Reviewed implementation: `811fe643bab31101f4646961ac89bc85bf7feaa0`. This is preparation for the first public release. No deployed users or real account data were migrated.

## Architecture and access

The existing Node server remains accessible directly in modern browsers. Windows, macOS, Linux, Android and iOS use the shared Tauri client to select the same HTTPS domain or IPv4/IPv6 origin, optionally including a port. Server accounts, authorization, response-cache controls and independent AI workers remain authoritative. Selecting an endpoint does not grant a role or constitute cryptographic device enrollment.

The bundled launcher has one local-only capability. Hosted pages receive no native permissions, and the command additionally checks the invoking window and its current local origin. Navigation is bound to the selected HTTPS origin; credentials embedded in URLs and alternate schemes/hosts/ports are rejected. Historical shell/model-sidecar, device broadcast and local mutation/sync commands were removed.

Ephemeral webviews are requested where supported. Android does not support that option: workspace selection requests a data clear and polls the real webview cookie store before navigating. Failure keeps the launcher open. This is not a secure-erasure guarantee, nor proof that every OS storage mechanism has been tested. The app currently denies native permissions and downloads; microphone/file workflows remain browser features pending native permission UX and device acceptance.

## Dependency findings and remediation

| Finding | Affected component | Remediation / remaining risk |
|---|---|---|
| RUSTSEC-2024-0429 / GHSA-wrw7-89jp-8q8g | GTK3's GLib 0.18.5 string iterator | Exact upstream two-line mutability fix backported with source hashes and an actual optimized Linux iterator regression. The compatible upstream API cannot be replaced by GLib 0.20 without changing the GTK dependency chain. |
| RUSTSEC-2024-0370 | `proc-macro-error` 1.0.4 | Retained unmaintained **build-time** dependency risk. No published fixed version; not described as remediated. Unknown findings continue to fail the audit. |
| GHSA-r937-wjx7-w2jp / CVE-2026-53914 | Generated Kotlin Gradle plugin 2.2.10 | Resolve Kotlin Gradle plugin components to stable 2.4.21; rebuild successfully and scan the resolved graph. |
| Fifteen Jackson advisory matches | Generated Jackson core/databind 2.15.3 graph | Resolve the compatible Jackson 2.22.4 line and annotations 2.22. Complete identifiers, advisory text and affected ranges are retained in the raw before report. |
| Gradle compatibility / build security | Generated Android toolchain | Pin official Gradle 9.9.1 and SHA-256; preserve prior compatible build dependency overrides. The newer Android plugin requires Gradle 9.5 or later. |

The Android inventory collector now reads resolved component identifiers rather than selecting ambiguous Android artifact variants. Unresolved dependencies still fail. The exact scan changed from **221 entries / 16 advisory matches** to **218 entries / 0 known advisory matches**, without Maven advisory suppressions. A version scan is not an exploitability proof or a complete supply-chain audit.

Evidence: [Android before](evidence/tauri-2026-11-11/android-before.json), [Android after](evidence/tauri-2026-11-11/android-after.json), [raw Rust scan](evidence/tauri-2026-11-11/tauri-audit.json), [explicit Rust dispositions](evidence/tauri-2026-11-11/tauri-audit-review.json), [GLib provenance and maintenance](../../src-tauri/vendor/README.md).

## Verification and limits

- Application/browser suite: **741 passed, 0 failed, 0 skipped** in isolated WSL2; the same suite passes in [GitHub verification](https://github.com/Colin1337X/Tanuki/actions/runs/42992380970). Existing application and security tests were retained. New tests cover domain/IP setup and real Chromium launcher behavior at phone/desktop widths.
- Native Rust URL-policy tests: four test functions cover normalization, malformed/credential-bearing endpoints, exact-origin navigation and launcher-origin impersonation. Linux additionally runs the real GLib regression under release optimization. These are not mocked cryptographic tests.
- [Native client matrix](https://github.com/Colin1337X/Tanuki/actions/runs/42992381041): builds Windows NSIS, Linux DEB, macOS Intel/ARM app/DMG, Android APK/AAB and an unsigned iOS review IPA. Original Java and Objective-C origin-policy regressions remain in the mobile jobs. Consult the linked final job conclusions for platform status.
- [Separate server installer verification](https://github.com/Colin1337X/Tanuki/actions/runs/42992380967) continues to exercise the Node server bundles. Switching client frameworks does not replace server setup or independent generation workers.
- A locally compiled Windows client was opened through native UI automation. Welcome-screen rendering and HTTP rejection were observed, and [the real capture](../screenshots/tauri-windows-validation.png) is documented. This capture does not verify native login, cookie-clear interleavings, encrypted-key recovery or mobile permission behavior.

The builds are unsigned candidates. Public distribution still requires appropriate signing/notarization/provisioning, physical mobile and native session-isolation acceptance, target-host TLS/backup/capacity acceptance, and the remaining runtime/security gates in [the backlog](REMEDIATION_BACKLOG.md). Tests and successful packaging do not establish production readiness. The baseline AI path is not E2EE; existing advanced encryption previews remain outside the packaged baseline.
