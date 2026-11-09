# Complete assessment finding index

This is the numbered finding set from the initial assessment and recipient-queue follow-up: **12 groups**, including the subcases below. It is not a promise that the application has no undiscovered vulnerabilities. All listed fixes passed their cited local tests; the [assessment](ASSESSMENT.md) contains full impact, limitations and remediation details. UI defects, hypothetical chains and untested assumptions are not counted as confirmed vulnerabilities.

One additional **pre-release implementation finding, PRE-01**, is recorded below separately
from the twelve baseline/runtime groups. It was found and fixed before the preview was pushed.

| ID | Confirmed vulnerability and subcases | Necessary access or state | Countermeasure | Before evidence | Actual PoC / regression source |
|---|---|---|---|---|---|
| RT-01 | Route alias bypass: generation quota, same-account concurrency; login IP alias regression also covered | Authenticated student for generation; anonymous login surface | Canonicalize paths before both policy and routing | [Original failures](evidence/pre-fix-attacks.txt) | [Adversarial tests](../../tests/node/adversarial.test.js), names `RT-01` and `Login route alias` |
| RT-02 | Deleted/reissued username inherits the previous principal's retained story | Account deletion followed by administrator reissuing the name | Atomic retirement marker; reject reuse with 409 | [200 and synthetic prior-owner story](evidence/pre-fix-attacks.txt) | [Adversarial tests](../../tests/node/adversarial.test.js), `RT-02`; [deletion crash tests](../../scripts/security-runtime.test.js) |
| RT-03 | Password-reset race; disable/re-enable race during real Argon2 verification | Old valid credentials and concurrent lifecycle change | Authentication version and live credential/role/version rechecks | [Non-null stale identities](evidence/pre-fix-attacks.txt) | [Adversarial tests](../../tests/node/adversarial.test.js), `RT-03` |
| RT-04 | SQL role escalation; session owner reassignment; session expiry extension; encryption alone did not establish server origin; migration downgrade boundary | Database write access; public-key-only envelope construction is tested separately | Authenticated profiles/session claims, server-origin HMAC and explicit trusted upgrade | [Metadata attacks](evidence/pre-fix-attacks.txt); public-key/migration strengthening has regression evidence, not a fabricated historical transcript | [Adversarial tests](../../tests/node/adversarial.test.js), `RT-04`, `Public ML-KEM key`, `Bounded deterministic ciphertext`; [runtime migration tests](../../scripts/security-runtime.test.js) |
| RT-05 | Corrupted recording prefix downgrades encrypted playback to unauthenticated raw bytes | Recording-file or backup modification | Authenticated storage-format metadata and strict encrypted-envelope checks | [200 rather than integrity failure](evidence/pre-fix-attacks.txt) | [Adversarial tests](../../tests/node/adversarial.test.js), `RT-05` |
| RT-06 | Long-running generation persists after its session is revoked | Initially valid student session and pending provider response | Recheck live session before later output/persistence | [Successful post-revocation completion](evidence/pre-fix-attacks.txt) | [Adversarial tests](../../tests/node/adversarial.test.js), `RT-06` |
| RT-07 | Administrator-controlled API origin receives operator-held API credential | Application admin plus configured operator API key | Production operator-approved origin set | [Local sink observed credential forwarding](evidence/pre-fix-provider-attacks.txt) | [Adversarial tests](../../tests/node/adversarial.test.js), `RT-07` |
| RT-08 | AI HTTP redirect forwards a private prompt to another origin | Redirecting configured endpoint | Reject outbound redirects | [Local sink observed body forwarding](evidence/pre-fix-provider-attacks.txt) | [Adversarial tests](../../tests/node/adversarial.test.js), `RT-08` |
| RT-09 | Static asset symlink exposes the private keyring outside the public root | Ability to introduce a symlink into deployed assets | Canonical filesystem containment | [200 / returnedKey true](evidence/pre-fix-symlink.txt) | [Linux runtime test](../../scripts/security-runtime.test.js), `static asset symlinks` |
| RT-10 | Classroom roster membership lets a teacher read/write an administrator's profile | Teacher manages a roster mistakenly containing the administrator | Target must have student role as well as managed membership | [Read and write both 200](evidence/pre-fix-roster-role.txt) | [Adversarial tests](../../tests/node/adversarial.test.js), `Educator roster mistakes`; [browser role checks](../../tests/node/browser.test.js) |
| RT-11 | Legacy migration originals retain plaintext passwords/content despite encrypted SQLite storage | Read access to retained source files or backups | Refuse production startup; explicitly create/verify encrypted archives before removing known source files | No dedicated pre-fix attack transcript was captured. The [runtime transcript](evidence/runtime-security.txt) includes source-preservation and archive verification; see [original migration test](../../tests/node/migration.test.js) and assessment evidence description | [Runtime/archive tests](../../scripts/security-runtime.test.js), `plaintext legacy`, `Legacy archival`, `damaged archive`, `migrated plaintext password`; [archive command](../../scripts/archive-legacy.js) |

The source paths above are the real scripts used in the assessment, evolved in place into regression tests. The discovery cases assert the **secure** outcome: they failed before remediation and pass after it. Historical logs refer to line numbers at their capture time; use test names to find cases in the current source. No separate arbitrary-target exploit toolkit was used or is implied.

## Other verified controls, not additional discovered vulnerabilities

### RT-12 — provider stream truncation accepted as successful completion

The original SSE parser returned normally on EOF without an upstream `[DONE]` sentinel.
A truncated provider stream could therefore be treated as a completed chapter. No malicious
external target was tested: a controlled loopback provider reproduced this with one synthetic
delta followed by EOF. The parser now rejects missing completion and bounds pending events;
the encrypted worker records interruption rather than a false completion.

Evidence: [before/after observations](evidence/recipient/stream-completion-poc.log).
Actual PoC: [stream-completion-poc.mjs](../../scripts/security/stream-completion-poc.mjs).
Regression: [protected API tests](../../tests/node/protected-api.test.js), `Truncated provider
stream` and `Oversized provider events`. This is an output-integrity finding, not evidence of
credential exfiltration or a cryptographic break.

Authentication error bodies, direct student privilege-field injection, cross-account reads, a shared-cache fixture, malformed HTTP framing, sensitive/legacy endpoint exposure, stored hostile markup, browser cross-origin reads, SQLite rollback, key mismatch and corruption were checked. A passing check does not prove the attack class impossible. The [full transcript](evidence/full-suite.txt) shows actual cases and outcomes.

## Architectural limitations and residual risks

### PRE-01 — queue metadata substitution and public-key ciphertext forgery

During implementation, the new queue initially stored recipient metadata and OpenPGP ciphertext
without server-origin authentication. A database writer could change recipient metadata or
replace chunks with newly encrypted, context-correct fake output using only public keys.
Encryption integrity alone does not authenticate the sender. The fix authenticates immutable
job metadata and wraps each recipient ciphertext in the existing server-origin authenticated
storage envelope. The server still cannot decrypt the inner ciphertext using its own keys.

Both independent assertions failed before remediation:
[before log](evidence/recipient/queue-origin-before.log). Both now pass, including restart checks:
[after log](evidence/recipient/queue-origin-after.log). Actual regression/PoC source:
[response-queue.test.js](../../tests/node/response-queue.test.js), `Database writer cannot replace`
and `Public recipient key cannot forge`. A database writer can still delete data or deny service;
complete historical rollback needs separate external monotonic state and remains unverified.

For the original server-encrypted paths, server compromise still defeats storage confidentiality.
The new, disabled-by-default [recipient-encryption preview](RECIPIENT_ENCRYPTION.md) has a distinct
client-key boundary and an unfinished rollout. Other residual risks include old complete snapshots
restoring old sessions, explicit legacy raw-audio compatibility, no independent audit of the complete
envelope, operator-approved endpoint/DNS risks, unverified Docker/real deployment edge, incomplete
browser/device/accessibility and sustained-load coverage, inactive historical framework installers,
and operator responsibility for external backups and bootstrap files.

## PRE-02 — Pinned label did not authenticate public-key bytes (preview checkpoint)

At checkpoint `7f611ad`, the recipient public-key parser validated a key but did not
compare its actual fingerprint to the expected pin. A malicious API could retain a
trusted fingerprint label while substituting different public-key bytes. Depending on
the use, this could direct future encryption to an attacker or substitute a signature
verification key. This finding concerns the unreleased recipient preview, not a claim
of exploitation of a historical live installation.

The shared parser now compares the actual key fingerprint. The browser applies this
check when using recipient, document-author and worker public keys. Unit tests reject
substitution while accepting the genuine key; a Chromium regression substitutes worker
public bytes behind the same label and verifies generation is rejected. The controlled
[PoC](../../scripts/security/recipient-pin-poc.mjs) reproduces checkpoint acceptance and
current rejection using disposable generated keys. See [observations](evidence/trusted-worker/recipient-pin-poc.log).

The new worker also signs response chunks independently of the ordinary API, extending
PRE-01's protection beyond the database-writer threat model. The complete findings
inventory remains RT-01 through RT-12 plus PRE-01 and PRE-02; test counts are not finding counts.

[Trusted-worker before/after diagram and remaining risks](TRUSTED_WORKER.md) · [Before/after Mermaid diagrams](ATTACK_PATHS.md) · [Full assessment](ASSESSMENT.md) · [Prioritized backlog](REMEDIATION_BACKLOG.md)
