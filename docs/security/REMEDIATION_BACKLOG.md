# First-public-release verification backlog

Tanuki has not been released to public users. This checklist concerns a fresh installation; historical migration procedures are only relevant if an operator elects to import development data. Passing tests does not establish production readiness.

## Fixed and covered by regression tests

| Area | Change and evidence |
|---|---|
| RT-01–RT-08 | Original twelve security regressions preserved; original findings and sanitized reproduction evidence remain in this directory. |
| RT-09–RT-11 | Static symlink disclosure, classroom privilege confusion and plaintext migration startup paths blocked by existing runtime/browser tests. |
| Runtime dependencies | Node 26.13.0 supplies SQLite 3.54.0, fixing the previously identified active SQLite advisory. Runtime guards reject older bundles. See DEPENDENCY_AUDIT.md and evidence/runtime-2026-11-11. |
| Android build dependencies | Reviewed overrides and Gradle update remove the previously detected advisory matches; scan and APK build/lint remain CI gates. Historical Tauri is inactive. |
| Offline recovery | Installed-profile backup/restore validates encrypted records, rejects corrupt inventories, preserves data and revokes restored sessions. Existing-admin recovery uses Argon2id and revokes all sessions. See tests/node/maintenance.test.js and ../OPERATIONS.md. |
| Exclusive profile access | Server, provider configuration and maintenance share a lock. Dead-owner recovery is tested with SIGKILL; ambiguous ownership fails closed. |
| Authentication capacity | Four concurrent password verifications maximum. Excess requests fail with 429; real Argon2 tests verify recovery of capacity. |
| Reverse-proxy identity | Forwarded addresses are accepted only from explicitly trusted IPs and use the rightmost address. Real HTTP tests verify independent quotas and spoof resistance. |
| Container configuration | Pinned Node image matches the supported runtime; read-only filesystem, non-root identity, dropped capabilities and bounded memory/processes. Actual container acceptance is now a required CI step. |

## Remaining first-release gates

1. **Upstream runtime update:** the announced November 11 Node security release was not yet published at the last check. Apply the official patched runtime, update all bundle/container pins and rerun platform acceptance when available. The already-fixed SQLite issue is not an outstanding blocker.
2. **Distribution identity:** Windows signing and Apple signing/notarization require actual developer credentials. Existing outputs are unsigned candidates. iOS device distribution also requires provisioning. Do not publish unsigned candidates as fully verified signed installers or ask users to bypass platform protections.
3. **Target-host acceptance:** validate the chosen public domain, TLS/reverse proxy, firewall, service identity, file ACLs, actual backup storage and restore drill. Local/CI synthetic tests cannot establish these properties for an unspecified host. Configure only the approved AI provider and deployment egress; origin allowlisting is not DNS/IP pinning.
4. **Independent cryptographic review:** review envelope encoding, key ownership/separation, authenticated ordering, downgrade rules and rotation. Reference vectors and application tests are necessary evidence but not an independent audit. The packaged baseline disables recipient/worker preview flags and processes AI plaintext in the backend/provider; do not label it E2EE.
5. **Realistic acceptance:** load/soak tests at expected school size, physical mobile devices, accessibility/screen readers, microphone workflows, and privacy/content-safety requirements for the intended audience. Bounded login work does not prove throughput or age suitability.

## Operational limitations to retain

- One application process per installed profile on one host. Multi-host/shared-filesystem coordination is unsupported.
- Backups contain private keys and require separate trusted custody. Whole-snapshot rollback is not prevented by database authentication; the restore command revokes sessions before publication.
- Retired usernames remain reserved. Do not remove tombstones to reuse a name without an explicit immutable-ID migration and reassignment policy.
- Local recovery assumes a trusted profile owner. Compromise of the service identity or backup/key custody exceeds the application authorization boundary.
- Define retention, incident response and secret-redacted monitoring before admitting student data.
- Unfinished encrypted multi-chapter/feedback/history preview workflows are not enabled by baseline packaging.

## Optional development-data import

Fresh installations do not need a legacy migration. If preserving old legitimate development data, take an offline copy and use the documented trusted upgrade/archive commands. Verify password hashes and records, session revocation and encrypted archive contents before normal production startup. Never retain TANUKI_ALLOW_LEGACY_UPGRADE in a service environment. No real user data was migrated in this assessment.

## Verification

Use isolated profiles, test databases, mock provider services and disposable keys. Run `npm run test:coverage`, `npm run coverage:report`, `node --test scripts/security-runtime.test.js`, and `node --test scripts/release/smoke.test.mjs` under the pinned runtime. The verification workflow additionally tests a production-only dependency install, the read-only container, and separate-UID worker isolation. Consult the latest recorded run rather than treating historical pass counts as current evidence.
