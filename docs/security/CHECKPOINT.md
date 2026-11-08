# Adversarial assessment checkpoint

Latest continuation: [recipient encryption / durable queue checkpoint](RECIPIENT_ENCRYPTION.md).
The historical assessment notes below predate that preview and its separate client-key boundary.

Status: IN PROGRESS. No security conclusion yet.

## Scope and methodology

Authorized targets: fresh synthetic accounts/databases/keys, local loopback application and fixtures, isolated WSL copies. No production accounts, external attack targets, destructive load or secret exfiltration. Existing source familiarity means the assessor is not a literally blind third party; black-box probes will assert observable HTTP/browser effects independently of the old suite.

## Stage A: threat model

Assets: account credentials and roles; sessions; student stories, recordings and preferences; classroom membership and settings; AI-provider credentials; encryption keys; database, backups, migration originals; compute/provider budget.

Boundaries: browser ↔ TLS proxy ↔ HTTP service; routes ↔ live session/role state; teacher ↔ managed roster; user ↔ owned objects; SQLite plaintext metadata ↔ encrypted payloads; server ↔ configured AI/search services; Linux service identity ↔ disk/keyring; development ↔ production; backup ↔ live credential/revocation state.

Attacker classes: anonymous network client; student or compromised student; educator/compromised educator; privileged administrator/insider; database-only reader; database-only writer; server-account compromise. Server-operator key access is distinct from database-only access. The application is server-side encrypted storage, not E2EE.

Prioritized hypotheses (not findings until reproduced): route aliases bypass exact-path resource controls; username deletion/reuse transfers records or roster privileges; credential verification races mint sessions against changed accounts; database metadata changes bypass encrypted-profile integrity; provider redirects leak authorization; unsafe recovery or migration preserves stale security state.

## Completed

- Read full authorized assessment request.
- Inventoried current routes, authentication, database and crypto implementation.
- Located prior successful WSL production verification (531 suite +14 production checks); will rerun after assessment fixes and extend crash/exposure checks.

## Remaining

1. Capture fresh pre-fix exploit evidence and black-box browser/HTTP probes.
2. Implement minimal fixes and independent regression cases.
3. WSL production, crash, recovery, permissions/network checks.
4. Full suite/coverage and critical browser paths; dependency/crypto review.
5. Comprehensive findings report and prioritized residual backlog.

## Resume

Workspace: E:\proj\tanuki. WSL distribution: Ubuntu-26.04. Previous isolated runtime: /home/colin/tanuki-wsl-validation.e8sQlQ/runtime/bin/node (24.22.2). Do not reuse Windows development data or login to real accounts. Evidence directory: coverage/security (ignored by Git). New tests will live in tests/node/adversarial.test.js and scripts/security-runtime.test.js.

## Stage B/D checkpoint — confirmed pre-fix observations

Independent adversarial tests executed: 10; secure-behavior assertions passed 0, failed 10. This is deliberate pre-remediation evidence, not a completed assessment. Log: coverage/security/pre-fix-attacks.txt.

- RT-01: canonical quota returned 429 but trailing-slash generation returned 200; three concurrent alias requests all succeeded instead of one.
- RT-02: deleted username recreation returned 200 and the replacement account retrieved a retained prior-owner story (HTTP 200, synthetic content logged).
- RT-03: native asynchronous password verification returned authenticated identities after password reset and disable/re-enable transitions.
- RT-04: plaintext database role mutation authorized an admin endpoint; session-row reassignment and expiry extension were also accepted without key access.
- RT-05: mutating the encrypted recording prefix caused playback to treat corrupted ciphertext as legacy raw bytes (200).
- RT-06: generation completed and persisted after the initiating session was revoked during the local provider wait.

Next: remediate these boundaries, retain all secure assertions, add migration/recovery and abuse-chain tests, and rerun. No real account or production data touched.

## Stage E checkpoint — WSL verification and additional confirmed defects

Current full WSL verification before the final roster correction: 556 passed, 0 failed/skipped; production HTTPS harness 14 passed; runtime/crash/migration harness 11 passed. Server coverage 82.85% lines / 79.11% branches; browser source-character ranges 52.14%. These counts will be superseded by the final rerun.

RT-07 confirmed operator API credential forwarding through an administrator endpoint override; RT-08 confirmed private prompt forwarding through a 307 redirect. Both are blocked by operator-approved origins and redirect rejection. Logs: pre-fix-provider-attacks.txt and post-fix-attacks.txt.

RT-09 confirmed a static asset symlink could return the disposable private key (200 / returnedKey:true). Canonical filesystem boundary checks now reject it; WSL runtime retest passed.

RT-10 confirmed a teacher could read/write an administrator profile when that administrator was mistakenly included in a managed classroom (role/membership mismatch). The role check is now explicit on both reads and writes; final regression rerun pending.

Origin authentication: ML-KEM encryption alone does not authenticate who encrypted a payload. The existing at-rest envelope now carries a standard HMAC-SHA256 tag with a domain-separated HKDF key derived from server-held private key material. Public-key-only forgery and bounded mutation tests pass. This is not a claim of independently audited envelope security. Existing databases require explicit trusted offline upgrade; normal startup cannot use a removed migration marker to bless altered metadata. Legacy sessions are revoked during upgrade.

Remaining tasks: final WSL complete suite and production listener checks; write final findings and backlog; document offline upgrade, retained plaintext migration-copy risk, custom-envelope audit requirement, and deployment infrastructure limits. Do not declare production readiness.

## Final checkpoint — completed bounded assessment

Final verified runs (isolated WSL2, Node 24.22.2):

- Application suite: 557 executed, 557 passed, 0 failed/skipped (original 531 retained, 21 adversarial cases, five added browser cases; browser total 70).
- Production-mode HTTPS/restart/restore/listener harness: 15 executed/passed, 0 failed/skipped.
- Linux crash/migration/filesystem/archive harness: 14 executed/passed, 0 failed/skipped.
- Total across these final runs: 586 passed. Syntax check: 54 modules.
- Coverage: server lines 82.91%, branches 79.11%, functions 88.50%; browser executed source ranges 54.78%. Child-process harness coverage is not merged into these figures.

Eleven confirmed finding groups and their remediations are documented in ASSESSMENT.md. Final test/evidence/source hashes are in coverage/security. RT-11 adds a production startup guard and a verified encrypted archive workflow for known legacy plaintext JSON. A damaged archive preserves the original source. Exact recovery is tested.

Assessment artifacts: ASSESSMENT.md and REMEDIATION_BACKLOG.md. Final active services created by the harnesses were closed. Existing real Windows data/server were not migrated or restarted. No production-readiness claim. Highest-priority next work is the independent envelope review, a backed-up offline upgrade/archival decision for real data, actual edge/container validation, and the operational controls in the backlog.

The earlier IN PROGRESS headings are historical checkpoint entries, superseded by this final entry. Resume commands and environment paths are in REMEDIATION_BACKLOG.md.

## Evidence-publication follow-up

Added Git-rendered Mermaid before/after diagrams, a complete RT-01–RT-11 index, sanitized historical raw runner transcripts, a SHA-256 provenance manifest, and links to the actual PoC/regression sources. The selector accepts finding IDs only and invokes synthetic local tests; it has no remote-target argument.

Verification: ten published artifact checksums/byte sizes and sanitizer fixtures passed; 62 local documentation links resolved; both diagram definitions cover all eleven findings (structural check, not a visual-render assertion). All eleven selectors ran in isolated WSL: 22 targeted cases passed, zero failed/skipped. Application runtime code was unchanged by this publication; the final 586-case assessment result above remains the historical full verification.

PR #51 was already merged when this follow-up was prepared, so publication uses a new branch/PR based on current main. The original ignored logs remain untouched. No blanket force-add of coverage, keys, data or environment files occurred.
