# Prioritized remediation and verification backlog

This backlog separates fixes verified locally from release work that remains. It does not treat passing tests as approval to deploy.

## Verified fixes

| IDs | Result | Evidence |
|---|---|---|
| RT-01–RT-08 | Demonstrated paths blocked; original twelve security regressions preserved | Final 557-case WSL suite, pre-fix logs, adversarial tests |
| RT-09 | Static symlink to disposable key returns 404 | WSL runtime harness |
| RT-10 | Misconfigured classroom cannot grant teacher access to administrator profile | Adversarial and browser authorization tests |
| RT-11 | Production refuses known plaintext migration sources; encrypted archival verifies bytes before removal | WSL migration/archive harness |

## P0 — required before upgrading an existing deployment

1. **Take and test an offline backup of data and its matching keyring.** Stop all application processes. Establish a rollback copy outside the active service path. Acceptance: a separate restore can read representative users/stories/recordings with the matching keys.
2. **Run the trusted upgrade once, then archive legacy inputs.** Use `npm run data:upgrade`, followed by `npm run data:archive-legacy`, with the intended data/key paths configured. Acceptance: records/password hashes preserved, old sessions revoked, archive decrypts byte-for-byte, no known legacy JSON remains in the live data directory, normal startup succeeds without `TANUKI_ALLOW_LEGACY_UPGRADE`. Never retain that override in the service environment. These commands have not been run on the user's real Windows data.
3. **Review the complete encrypted-envelope and migration design independently.** Existing ML-KEM/HKDF/AES-GCM-SIV storage now additionally uses native HMAC origin authentication. Acceptance: qualified review of key separation, encoding, authentication ordering, legacy downgrade rules, lifecycle and rotation; published vectors alone are insufficient. No E2EE/FIPS claim.
4. **Validate the actual deployment edge and filesystem policy.** Container build/run remains unverified. Acceptance: private service data/key permissions, immutable assets, actual TLS proxy/cache tests with two accounts, correct WSL/host firewall behavior, no public Node listener, restricted backups and operator-approved egress. Symlink defense is not a sandbox against arbitrary service-account code execution.
5. **Configure outbound trust explicitly.** Set `OPENAI_BASE_URL` to the intended endpoint; add only necessary origins to `AI_ALLOWED_ORIGINS`. Acceptance: intended provider works, unapproved origins and all redirects fail, no credential-bearing cleartext transport outside an intentionally trusted local network. Add deployment egress restrictions/DNS controls; application origin allowlisting is not IP pinning.

## P1 — security and operational work before sensitive/student-data rollout

- **Restore-session revocation:** provide an operationally reviewed restore procedure/command that revokes all restored sessions before exposure. Complete historical snapshots are replayable; database authentication is not monotonic anti-rollback storage.
- **Account lifecycle/retention:** retired usernames are now reserved. Introduce immutable account IDs if name reuse is required, with an explicit data/roster reassignment policy and migration tests. Do not remove tombstones to work around the restriction.
- **Legacy raw audio and historical copies:** decide retention and re-encryption policy for explicitly marked old raw audio, external JSON/CSV/backups and old bootstrap environment files. Production archival only handles known live-directory JSON sources. Secure deletion from SSDs or existing snapshots is not guaranteed.
- **Rate limits and capacity:** test realistic school-size traffic, Argon2 memory pressure, SQLite scale and provider response sizes. Current IP throttling sees the socket address; an entire reverse-proxied school can share one limit. Keep one application process until generation coordination is shared safely.
- **Identity recovery and stronger authentication:** define secure administrator/password recovery, MFA where appropriate, weak legacy credential replacement, incident-driven revocation and audit trails. Do not infer uniform authentication timing for all imported hash parameters.
- **Key custody:** enforce restrictive service-account ACLs/modes on deployed keyrings and backups, test corrupt/lost-key recovery, consider managed key custody. Never log keys or embed them in client assets/images.
- **Dependency maintenance:** run a fresh advisory/provenance review through approved infrastructure, pin/validate deployment Node and container images, monitor native crypto dependencies. The latest local run used cached packages; the prior clean audit is time-bound.
- **Retire obsolete deployment paths:** remove or disable legacy framework installers and desktop instructions through the normal authorized repository process. Current Node runtime excludes them, but human misdeployment remains possible. No tool restriction was circumvented to remove them.

## P2 — broader verification and product risks

- Actual provider failures, output bounds, DNS rebinding/approved-host compromise, streaming disconnect and revocation interleavings beyond the tested cases.
- Browser history/BFCache across shared-device account changes; Firefox/Safari/mobile devices; real microphone flows; full accessibility and screen-reader audit.
- Full security logging/alerting with secrets redacted, abuse response, backup retention and institution-specific privacy/compliance review.
- Content safety and prompt injection controls: model instructions do not guarantee age suitability, factual accuracy or a certified Lexile score.
- Sustained load/soak tests, power-loss simulation, multi-host storage and failure injection beyond controlled SIGKILL.

## Safe continuation commands

Use the isolated Linux copy and runtime; do not point these tests at production accounts:

```sh
export PATH=/home/colin/tanuki-wsl-validation.e8sQlQ/runtime/bin:/usr/bin:/bin
export LD_LIBRARY_PATH=/home/colin/tanuki-wsl-validation.e8sQlQ/browser-libs/root/usr/lib/x86_64-linux-gnu
cd /home/colin/tanuki-redteam.MN9NIh/app
npm run test:coverage
npm run coverage:report
node --test scripts/security-runtime.test.js
npm run build
cd ../production
node --test scripts/production-smoke.test.js
```

The production harness requires a separate `npm ci --omit=dev` installation and OpenSSL. All harness accounts/keys/data are synthetic and disposable. Existing private temporary fixture directories remain for investigation; test services exit at the end of each run.

## Dependency release hold — 2026-11-10

Before production publication, resolve the bundled SQLite CVE-2026-119375 and apply/retest the announced Node November security release. Review [DEPENDENCY_AUDIT.md](DEPENDENCY_AUDIT.md) and require the resolved Android scan plus APK build/lint to pass. Do not reactivate the historical Tauri target with its documented vulnerable graph.

Update 2026-11-11: active SQLite CVE-2026-119375 is fixed by the validated Node 26.13.0 runtime upgrade. Replace old deployed bundles. Keep the announced November Node security release as outstanding; do not carry the already-fixed active SQLite item as an unresolved blocker. Historical Tauri remains inactive.
