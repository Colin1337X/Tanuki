# Tanuki Stories — adversarial security assessment

Assessment date: 2026-11-07. Final status: **bounded local assessment completed; production readiness not established**.

Current cryptographic follow-up: [PQ stack migration](CRYPTO_STACK.md), including legacy
read compatibility, reference vectors, actual adapter benchmarks and rollout limitations.

Latest follow-up: [Trusted Worker Encryption checkpoint](TRUSTED_WORKER.md), with
682 passing executions, separate-UID WSL verification, PRE-02 remediation, and explicit
deployment and unfinished-work limitations. Both encryption preview flags remain off by default.

Follow-up: [recipient encryption and resumable queue checkpoint](RECIPIENT_ENCRYPTION.md)
records the new feature-flagged implementation, 644 passing executions, incomplete rollout work,
and RT-12 (provider stream truncation). The original counts and evidence below are historical.

Published evidence: [before/after Mermaid attack paths](ATTACK_PATHS.md), [complete finding index](FINDINGS.md), [sanitized raw transcripts](evidence/README.md), and [actual PoC scripts](pocs/README.md).

## Executive result

The initial passing application suite did not establish the security boundaries it appeared to cover. Independent negative tests reproduced eight initial vulnerability groups. Further filesystem and role-boundary testing confirmed two more. Legacy plaintext recovery sources were also confirmed and given a production startup guard plus a verified encrypted-archive workflow.

**Eleven confirmed finding groups have remediations with corresponding local regression evidence.** This means the demonstrated paths are blocked in the final tested build, not that all variants or unknown vulnerabilities are eliminated. No demonstrated exploit in this report remains deliberately enabled for normal production operation. Explicit legacy compatibility and operator configuration still carry the residual conditions described below.

The original 531 application tests and the first twelve adversarial tests were retained. Final execution used isolated WSL2 copies, synthetic accounts, local HTTP provider fixtures and disposable keys. Earlier exploratory Windows tests predated the user's WSL-only restriction; all subsequent testing and final verification ran in WSL.

| Final check | Executed | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|
| Full application suite, including browser and adversarial tests | 557 | 557 | 0 | 0 |
| Separate production-mode HTTPS/restart/restore harness | 15 | 15 | 0 | 0 |
| Separate Linux crash, migration, filesystem and archival harness | 14 | 14 | 0 | 0 |
| **Total test executions in these final runs** | **586** | **586** | **0** | **0** |

The 557 include 70 Chromium cases and 21 independent adversarial cases. The extra harnesses are counted separately because the main suite uses isolated test settings; they actually exercise production startup or Linux process/storage behavior. Syntax checking passed for 54 JavaScript modules.

Loaded-server coverage: **82.91% lines (1,999/2,411), 79.11% branches (731/924), 88.50% functions (200/226)**. Browser `app.js` executed source-character-range union: **54.78% (21,617/39,463)**. These metrics exclude unexecuted/unloaded modules, dependency internals and child-process coverage; browser ranges are not statement or branch coverage. Runtime/archive checks are not added to the application LCOV denominator.

## Scope, methodology and evidence

Targets were the isolated Ubuntu 26.04 WSL2 environment, non-root UID 1000, Node 24.22.2 LTS and Linux x64 dependencies. Source was copied onto the Linux filesystem under `/home/colin/tanuki-redteam.MN9NIh`; production-only dependencies were installed separately using `npm ci --omit=dev --offline`. No real user database, production account, live API key or public attack target was used. Provider, redirect, cache and hostile-browser-origin services listened locally. No destructive stress testing was performed.

The assessor already knew the codebase and cannot honestly claim a blind third-party assessment. Black-box work nevertheless checked externally visible HTTP/browser behavior independently of the old tests. White-box review covered every active route, live session checks, persistence, key handling, outbound clients and static serving. Deterministic races used real asynchronous Argon2 work or a held local provider response, not mocked cryptographic verification. Mutation testing used a fixed seed and 48 bounded ciphertext mutations. Parser tests used one conflicting framing request, not traffic flooding.

The original evidence remains in `coverage/security/` (generated, ignored by Git). Reviewed, sanitized copies are now [tracked in Git](evidence/README.md), with raw/sanitized checksums and an explicit provenance manifest:

- `pre-fix-attacks.txt`: original ten secure-behavior assertions failed, with observable responses; includes prior-owner story retrieval after username reuse.
- `pre-fix-provider-attacks.txt`: two additional failures; synthetic API credential and private-prompt forwarding were observed at local sinks.
- `pre-fix-symlink.txt`: disposable key returned through a public asset symlink, status 200.
- `pre-fix-roster-role.txt`: teacher read and write of an administrator profile both returned 200 under a misconfigured roster.
- `full-suite.txt`, `runtime-security.txt`, `production-smoke.txt`, `build.txt`: final results.
- `lcov.info`, `summary.json`, `report.html`: measured application coverage.
- `dependencies.json`, `production-install.txt`, `source-manifest.sha256`: installed dependencies and hashes of the final tested source. The manifest covers code/tests/assets, not secrets or data.

Reproduction is implemented in `tests/node/adversarial.test.js`, the five appended security cases in `tests/node/browser.test.js`, `scripts/security-runtime.test.js`, and `scripts/production-smoke.test.js`. Failed pre-fix logs are retained. No original assertion was weakened to make a vulnerability disappear. One new listener-test assertion incorrectly inspected the `ss` peer-address column; it was corrected to assert the exact local bind address. That was a harness defect, not an application exposure.

## Threat model

Assets: account identities and credentials; live/revoked sessions; student stories, recordings and preferences; classroom membership; privileged settings; provider credentials; private encryption keys; SQLite, WAL files, backups and migration inputs; compute/provider budget.

Trust boundaries: browser → TLS proxy → Node HTTP parser; route → live session/role; student → owned records; teacher → managed student roster; encrypted payload → plaintext SQLite indexes/metadata; application → configured provider/search endpoints; service identity → filesystem/keyring; development → production; historical backup → current authorization state.

Attacker capabilities considered: anonymous visitor; authenticated or compromised student; educator; administrator with application settings access but no operator secrets; insider able to modify an asset tree; database-only reader; database-only writer; operator with full server/key access. Database theft and server compromise are different threats. A full server compromise defeats this server-side confidentiality boundary.

## Confirmed findings

Severity is qualitative and contextual. A numerical CVSS score is supplied only where the network impact is sufficiently well bounded; other scores are not fabricated without deployment-specific privilege and scope assumptions.

### RT-01 — Route aliases bypassed generation quotas and concurrency controls — Medium

- **Component/invariant:** `server/index.js`; a route and its resource controls must use the same path identity.
- **Prerequisite:** authenticated student; no administrator privileges.
- **Reproduction:** exhaust the persisted generation counter for a synthetic user, request canonical `/api/stories/generate`, then its trailing-slash alias. Separately issue three bounded concurrent alias requests to the local provider.
- **Observed:** canonical request returned 429; alias returned 200 and reached the provider. All three concurrent alias requests succeeded. The router allowed trailing slashes while policy regexes did not.
- **Expected/impact:** aliases share quotas and one in-flight request per account. Bypass exposed provider spend and application availability. Illustrative CVSS 3.1 **6.5**, `AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:N/A:H`; actual capacity impact depends on deployment limits.
- **Fix:** canonicalize API trailing slashes once before routing and policy checks.
- **Regression/status:** quota, concurrency and login-IP alias tests pass in the final WSL suite. No destructive load used.

### RT-02 — Username reuse transferred historical private records — High

- **Component/invariant:** `database.removeUser`/`putUser`, username-based story ownership. A new principal must not inherit a deleted principal's records.
- **Prerequisite:** ordinary administrator deletion and later creation of the same username; the new account holder need not be maliciously privileged.
- **Reproduction:** create a synthetic owner/story, delete the owner, recreate its username with a different password, authenticate the replacement and request the retained story.
- **Observed:** recreation returned 200 and the replacement retrieved the prior owner's synthetic story with 200.
- **Expected/impact:** identity reuse must not transfer confidential records, editing authority or historical roster associations.
- **Fix:** account deletion atomically reserves the username with a retirement marker; creation/import cannot reuse it. Historical records are preserved rather than erased to hide the issue.
- **Regression/status:** reuse returns 409; retained story remains intact; committed/crashed deletion behavior is covered. This is a deliberate product constraint until immutable account identifiers and an explicit retention model replace username ownership.

### RT-03 — Credential verification accepted stale lifecycle state — High

- **Component/invariant:** `auth.validateCredentials` and session minting. An authentication attempt must remain valid at completion, not just before Argon2 begins.
- **Prerequisite:** old valid credentials plus a password reset or disable/re-enable transition during native asynchronous verification.
- **Reproduction:** start real Argon2 verification, change the password or disable/re-enable the same synthetic account before awaiting it.
- **Observed:** verification returned an authenticated identity despite the intervening revocation event. This was a deterministic internal lifecycle test; a timing-sensitive external HTTP takeover was not separately claimed.
- **Expected/impact:** return no identity after a relevant change. The login route otherwise uses that identity to mint a new session against current credentials, undermining reset/revocation intent.
- **Fix:** encrypted per-account authentication version, credential/role/version recheck after verification, and version check at session minting. Credential, role and enabled-state changes rotate the version and revoke sessions.
- **Regression/status:** both stale-verification cases now return null; original session revocation tests remain passing.

### RT-04 — Database metadata could forge authorization — High

- **Component/invariant:** plaintext role/password metadata, session owner/expiry, migration trust and encrypted-envelope origin. Database-only modification must not become authenticated administrative authority.
- **Prerequisite:** write access to a copied SQLite database, without the server keyring; initial tests used existing student sessions.
- **Reproduction:** change a student's SQL role to admin; reassign a session row using the victim's visible credential hash; extend its expiry. Also test removing the upgrade marker and constructing a ciphertext using only the ML-KEM public key.
- **Observed:** the pre-fix role change authorized the admin endpoint; session reassignment and extended expiry were accepted. Code review identified that public-key encryption alone cannot prove the sender was the server.
- **Expected/impact:** fail closed on altered security metadata. Otherwise a database writer can obtain live privileged access and decrypted content, exceeding ordinary database-only confidentiality assumptions.
- **Fix:** bind credential/role metadata inside authenticated encrypted profiles; store authenticated session claims bound to the token hash, owner, version and expiry; authenticate persisted envelopes using standard HMAC-SHA256 with a domain-separated HKDF key derived from server-held private key material. Public-key holders cannot manufacture the server tag. New legacy-format acceptance is confined to a trusted offline upgrade; normal startup rejects a missing upgrade marker on a populated database. Upgrade revokes legacy sessions.
- **Regression/status:** all original metadata attacks, public-key-only forgery and 48 deterministic mutations are rejected; marker-removal test and trusted migration preservation pass.
- **Limit:** the application envelope remains application-specific and is not independently audited or a standardized authenticated KEM protocol. No custom cipher primitive was introduced. Database deletion, full historical rollback, key theft and an operator leaving the trusted-upgrade override enabled remain outside this integrity guarantee. Keep that override out of service configuration.

### RT-05 — Recording corruption triggered a raw-audio downgrade — Medium

- **Component/invariant:** recording storage/playback. Encrypted content must not become unauthenticated legacy content after corruption.
- **Prerequisite:** modification/corruption of an encrypted audio file or its backup; ordinary students have no arbitrary-file-write endpoint.
- **Reproduction:** upload a synthetic recording, alter its encrypted magic prefix and play it back.
- **Observed:** playback returned 200 and served corrupted envelope bytes as raw audio because the magic prefix alone selected the format.
- **Expected/impact:** integrity failure, not unauthenticated bytes. The demonstrated impact is an integrity bypass, not plaintext recovery from broken encryption.
- **Fix:** format is recorded in authenticated metadata. Newly encrypted recordings and upgraded encrypted records reject a damaged prefix. Trusted migration explicitly marks genuinely old raw files and legacy envelopes.
- **Regression/status:** altered header returns 500 without plaintext; upload/playback/tamper tests pass. Genuine legacy raw audio remains a documented exception requiring a future re-encryption/retention decision.

### RT-06 — Revoked in-flight generation still committed — Medium

- **Component/invariant:** long-running generation and recording operations; a revoked session must not authorize later persistence.
- **Prerequisite:** a pending provider request followed by logout/revocation or account suspension.
- **Reproduction:** hold a local synthetic provider response, revoke the initiating session, then complete the response.
- **Observed:** the pre-fix request returned success and saved a new story after revocation.
- **Expected/impact:** reject post-revocation completion. Continued writes can violate deletion/suspension policies and consume resources.
- **Fix:** revalidate the initiating session before story persistence, plan delivery, recording persistence, chapter output and chapter persistence.
- **Regression/status:** the demonstrated generation race now returns 401 and stores no story. Previously delivered bytes cannot be recalled; an upstream call already sent is not globally cancelled and may still consume provider resources. The per-delta checks are not a claim that every possible microtask/revocation interleaving has been exhaustively proven.

### RT-07 — Application admin could exfiltrate the operator API credential — High

- **Component/invariant:** administrator `apiBaseUrl` and `AIClient`; application settings access must not implicitly authorize disclosure of operator-held credentials.
- **Prerequisite:** compromised/malicious application administrator; a server-configured API key.
- **Reproduction:** set the configured provider URL to a second local synthetic service and generate a story with a synthetic operator key.
- **Observed:** the local sink received `Authorization: Bearer synthetic-operator-api-key`, and generation returned 200.
- **Expected/impact:** operator-approved destinations only; otherwise provider credentials and private prompts can leave the intended trust boundary.
- **Fix:** in production, destination origins must match `OPENAI_BASE_URL` (or the default OpenAI origin) or explicit `AI_ALLOWED_ORIGINS`. UI settings alone cannot expand that set.
- **Regression/status:** disallowed destination receives no request/credential; operation fails. The allowlist is an origin control, not DNS pinning or an egress firewall. Operator-approved hostile endpoints and compromised DNS remain risks.

### RT-08 — Provider redirect forwarded a private prompt — Medium

- **Component/invariant:** native outbound fetch; destination approval must hold throughout the request.
- **Prerequisite:** a redirecting or compromised configured endpoint.
- **Reproduction:** local configured endpoint returns 307 to a different local sink while a synthetic private prompt is posted.
- **Observed:** the destination received the private request body. No claim is made that Fetch forwarded Authorization across different origins; the confirmed asset was the prompt.
- **Expected/impact:** private payloads must not follow an unapproved redirect.
- **Fix:** outbound AI fetch uses `redirect: 'error'`.
- **Regression/status:** sink receives no prompt; redirect is rejected. Configure the final provider endpoint explicitly.

### RT-09 — Public asset symlink exposed a private key — High

- **Component/invariant:** static file serving; lexical path containment is not filesystem containment.
- **Prerequisite:** ability to introduce a symlink in the served asset tree. There is no demonstrated ordinary-student upload path into that tree.
- **Reproduction:** inside the isolated WSL app copy, create an asset symlink to the disposable test keyring, then request that asset anonymously.
- **Observed:** HTTP 200 and `returnedKey:true`; raw key material was not printed in evidence.
- **Expected/impact:** 404 outside the canonical public root. Key theft defeats storage confidentiality and permits forgery; this is a serious deployment-artifact/limited-filesystem-writer boundary.
- **Fix:** resolve the canonical filesystem path and reject anything outside the canonical public root before serving it.
- **Regression/status:** WSL symlink test now returns 404 and no key. Arbitrary malicious concurrent filesystem mutation/TOCTOU schedules were not exhaustively tested; keep deployed code/assets immutable to untrusted actors. A full service-account compromise is not contained by this check.

### RT-10 — Classroom membership overrode the target account's role — Medium

- **Component/invariant:** student settings read/write; a teacher may manage students, not an administrator merely listed in a classroom.
- **Prerequisite:** a malformed/legacy/administrator-created roster containing an admin account, plus its assigned teacher.
- **Reproduction:** include the synthetic admin in a managed classroom, then read and update its settings as the teacher.
- **Observed:** both operations returned 200. The demonstrated write affected profile/reading settings, not the admin password or role.
- **Expected/impact:** deny non-student targets even when roster membership matches; prevents profile disclosure and unauthorized privileged-account state changes.
- **Fix:** explicit target role check on both GET and POST for educator requests.
- **Regression/status:** both return 403; normal teacher-managed student tests remain passing.

### RT-11 — Retained migration JSON contained plaintext passwords — High, conditional on file/backup access

- **Component/invariant:** legacy migration originals and production startup; runtime password hashing must not conceal a plaintext recovery copy.
- **Prerequisite:** access to retained migration files/backups. This is not an anonymous HTTP download in the tested configuration.
- **Reproduction/observed:** migrate a synthetic `users.json`; the SQLite hash verifies correctly and no plaintext password appears in SQLite, but the original JSON still contains the password byte-for-byte. Earlier documentation explicitly warned of this; it was not eliminated by Argon2id alone.
- **Expected/impact:** active production must not retain known plaintext migration sources. Exposed originals defeat password hashing and can disclose content/settings.
- **Fix:** production refuses startup while known legacy JSON source files remain. `data:archive-legacy` creates mode-0600 authenticated encrypted archives, decrypts/verifies exact bytes, flushes them before unlinking only the known source, and preserves the source if verification fails. Linux directory entries are flushed as well. The general importer still preserves originals until this explicit verified archival step, preserving original migration tests and recovery semantics.
- **Regression/status:** production startup refusal, exact recovery, absence of plaintext in archives and safe failure on damaged archives all pass in WSL.
- **Limit:** unrelated copies, old external backups, bootstrap environment files, exported CSV and administrator handling cannot be erased or guaranteed by this application. Archive retention/key custody and removal of bootstrap secrets remain operator responsibilities. No universal claim that a password never existed in plaintext is made.

## Cryptographic and E2EE conclusions

**This application does not implement end-to-end encryption.** The server owns decryption keys and processes plaintext for generation and rendering. A server operator with the keyring can decrypt private content; the isolated test explicitly demonstrated this. A database-only copy with an unrelated keyring could not decrypt the synthetic story. Database metadata still exposes usernames, roles, password hashes, session/index structure and approximate record sizes.

Argon2id uses native `@node-rs/argon2` at 64 MiB/t=3/p=1 with random salts and 32-byte output. Tests independently cross-check native OpenSSL output and verify exact Unicode/password semantics. New API/CSV credentials are hashed. Imported weak or unusual legacy credentials are not automatically upgraded into strong user-selected passwords, and timing equivalence for every legacy PHC parameter set was not statistically established.

ML-KEM-1024 uses Node/OpenSSL; AES-256-GCM-SIV uses Noble. The unchanged suite includes RFC 8452 section C.2 AES vectors and ten OpenSSL/NIST ACVP-derived ML-KEM decapsulation vectors, plus real round trips and tamper/rejection cases. Random KEM secrets and nonces feed domain-separated HKDF-derived AEAD keys. The additional server-origin HMAC fixes the distinction between public-key confidentiality and sender authentication. Keys, envelopes, wrong contexts, altered ciphertext, rotation and old-key retention were exercised without crypto mocks.

Algorithm correctness does not prove the whole envelope, its upgrade policy, filesystem custody or compromise recovery secure. Independent cryptographic review of the complete format/key lifecycle remains a release requirement. No FIPS certification, forward secrecy against retained-key compromise or hardware-backed key protection is claimed. JavaScript cannot promise erasure of every plaintext/key memory copy.

Primary references consulted: [RFC 8452](https://www.rfc-editor.org/rfc/rfc8452.html), [Node crypto documentation](https://nodejs.org/api/crypto.html), [Noble maintainer documentation](https://github.com/paulmillr/noble-ciphers/blob/main/README.md), and [Noble releases](https://github.com/paulmillr/noble-ciphers/releases). Maintainer audit information is not treated as certification of this exact application or binary set.

## Production, persistence and browser verification

The production harness used a real local TLS proxy and explicit trust in its disposable certificate; certificate verification was not disabled and the CA was not globally installed. Application and proxy processes were non-root and shut down after testing. The app's Linux listener was observed at `127.0.0.1:<ephemeral-port>`, not a wildcard address. WSL/Windows host firewall, portproxy and future deployment exposure were not certified by that observation.

The harness verifies Secure/HttpOnly/SameSite cookies, HSTS/CSP, no default development accounts, fresh key provisioning, real HTTP account creation, private response headers, concurrent account switching, restart persistence, offline key rotation, backup restoration, suspension and logout replay rejection. A shared-cache fixture never reused authenticated responses between accounts. This tests the application and a deliberately standards-respecting fixture, not an arbitrary CDN that ignores headers.

SQLite SIGKILL tests killed a process while a write or account-deletion transaction was open. Committed data survived, partial changes rolled back, and integrity checks passed. Committed retirement survived restart. Corrupt database/key cases failed closed. These tests do not simulate physical power loss, storage-controller faults, filesystem snapshots or every lock-contention schedule. Original two-process append tests still pass.

Chromium verifies login, three themes/layouts, Lexile persistence, deletion while a browser is open, restricted educator access, direct privileged API attempts, hostile stored markup viewed by an admin, and cross-origin credentialed reads. Already displayed private content cannot be recalled from a user's screen. No full screen-reader/WCAG audit, Safari/Firefox/device matrix, microphone-device certification or general proof of XSS absence is claimed.

## Supply chain and configuration

Installed versions: `@node-rs/argon2` 2.2.2, `@noble/ciphers` 2.4.0, with Playwright development-only. Offline clean installation verified the lockfile/cache package-integrity path and native Linux binding availability. The earlier WSL audit reported zero known vulnerabilities; this final local-only assessment did **not** contact a registry for fresh advisories or perform independent native-binary/source reproducibility verification. Zero reported advisories is not evidence of zero vulnerabilities.

Historical Next/React/Tauri source and installers remain inactive in the checkout. Active scripts, API/static routing and Docker build use the Node application; tests found no public route exposing old source/configuration. Old installers remain a confusing deployment hazard and should be formally retired. Their removal was not retried around an earlier tool restriction.

Docker Desktop integration was unavailable in this WSL distribution. No image/container runtime, actual Nginx/Caddy configuration, public certificate, internet-facing edge cache, production provider or sustained load test was performed. Code/data copying excluded the real `.env`, keys and database. Disposable fixture keys/artifacts remain in private test directories for inspection; they are not production keys.

## Deployment blockers and residual backlog

See [REMEDIATION_BACKLOG.md](REMEDIATION_BACKLOG.md) for priority and acceptance criteria. Before deployment: trusted offline migration with a verified backup, encrypted archival of known plaintext sources, removal of the upgrade override from service configuration, explicit outbound-origin configuration, independent envelope review, real infrastructure/cache/egress validation and restore drills are required.

Session metadata integrity does not provide anti-rollback storage: restoring an old complete database/key snapshot can restore then-valid sessions and authorization state. Restore procedures must revoke restored sessions before admitting traffic. A fully compromised server or approved provider can read plaintext. Multi-process generation coordination, shared-proxy login quotas, operational monitoring, MFA/account recovery, legacy raw-audio encryption, dependency advisory monitoring and sensitive backup handling remain material work.

The existing Windows development instance and its data were not upgraded or restarted under the WSL-only authorization. These changes are verified in the isolated WSL target; they are not a claim that any existing running instance has been remediated in place.
