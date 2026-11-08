# Recipient encryption and resumable AI queue — checkpoint 1

Status: **implemented preview, disabled by default; the full E2EE rollout is unfinished**.
Use `TANUKI_RECIPIENT_ENCRYPTION=1` only in an isolated evaluation deployment.
The flag exposes the **Encrypted workspace** button and `/api/protected` operations.
It does not migrate existing stories or change their privacy classification.

## Implemented boundary

Locally authored private drafts are signed and encrypted in the browser before upload.
SQLite stores an additional legacy server-encrypted outer record, but opening that outer
record yields recipient ciphertext, not the private draft. No client private key or recovery
secret is sent to the server. Account authentication remains Argon2id and existing live sessions.

Classroom drafts can include a selected assigned teacher device, after the student pins its
fingerprint obtained through a separate authenticated channel. The teacher must likewise verify
the author device before opening a signed submission. Administration does not grant a decryption
recipient. The server enforces account, assignment and device authorization separately from
cryptographic access. Changed teacher keys require fresh verification. Previously downloaded
ciphertext and plaintext cannot be recalled.

AI generation is different: **both the backend and configured provider see plaintext**.
The user must check the disclosure consent control before sending a prompt. Private drafts are
not automatically forwarded. The worker encrypts provider output before SQLite writes. This is
recipient encryption of persisted AI output, **not E2EE of the AI processing stage**. The feature
uses the existing operator-approved provider client, safety settings and reading/Lexile profile.
Local-model adapters are rejected on this preview path because their cancellation/streaming
semantics have not been verified.

## Cryptographic construction and custody

- OpenPGP.js **6.3.2**, pinned in the lockfile, implements RFC 9580 v6 Ed25519 signing identities,
  X25519 encryption subkeys, independently random content/session keys, per-recipient public-key
  encrypted session-key packets, and v2 SEIPD **AES-256-GCM** authenticated encryption.
- The library supplies nonce/salt derivation and packet binding; the application does not invent
  a KEM exchange. Each response chunk is a fresh encryption operation with fresh key material.
  Generation ID, owner, recipient fingerprints, sequence, prior ciphertext digest, chunk kind
  and text are authenticated together inside the encrypted payload.
- Non-AEAD legacy messages and v4 recipient keys are refused on the new path. Locally authored
  documents also require author signatures. AI chunks rely on authenticated HTTPS delivery from
  the server that already produced their plaintext; they are not represented as student-signed.
- Native Web Crypto / Node cryptographic implementations are used where OpenPGP.js supports
  them. There is **no evidence establishing this as the fastest possible library**; protocol
  reviewability and cross-platform correctness were prioritized over an unsupported speed claim.
- Existing native ML-KEM-1024, HKDF-SHA256, AES-256-GCM-SIV and server-origin authentication
  remain intact for server-owned data. This preview does **not** claim post-quantum recipient
  encryption, forward secrecy, or an independently audited application protocol. A reviewed
  interoperable PQ/hybrid recipient construction remains a separate evaluation task.
- Device backups contain encrypted OpenPGP secret-key packets. A browser-generated 256-bit random
  recovery secret unlocks them. Encrypted backups may be stored locally and downloaded; the
  recovery secret is displayed once and is not persisted by the app. Password reset cannot
  derive it. No institutional or operator escrow is created.

References: [RFC 9580](https://www.rfc-editor.org/rfc/rfc9580.html),
[OpenPGP.js source](https://github.com/openpgpjs/openpgpjs/tree/v6.3.2),
[library security documentation](https://github.com/openpgpjs/openpgpjs#security-audit).
Upstream audit history does not constitute an audit of this application or this integration.
The vendored browser module is byte-compared with the installed pinned package in tests.

## Device and recipient authorization

The first device proves possession by signing an enrollment command under an authenticated
account session. This is account-based bootstrap, not independent certification of a real-world
identity. An already authorized device must sign subsequent enrollment. Every protected command
binds version, username, device fingerprint, action, payload, timestamp and one-use nonce.
Five-minute freshness and persisted replay protection apply; live session and device checks
apply on reconnect. Revoke leaves a tombstone, so revoking the last device does not reopen
bootstrap. Restoring the same device backup is possible while that device remains authorized;
losing every authorized key currently has no account-recovery escape hatch.

The browser selects its own current key and individually pinned teacher keys; it does not
blindly encrypt to every key in a server directory. Multi-device enrollment is implemented, but
automatic historical content/key synchronization is not. Newly enrolled keys need an authorized
client to redistribute content; that workflow is unfinished. Independent fingerprint checking
is essential: copying a fingerprint from this same server is not verification.

## Durable queue contract

`generate` commits a job and starts work outside any response-body/subscriber lifecycle.
Closing a tab or HTTP connection leaves the provider running. A completed job does not create a
legacy server-decryptable story copy. The prompt is held only in worker memory. Chunk persistence
and sequence/hash advancement are one SQLite transaction. Completion is an encrypted terminal
chunk committed with the durable `complete` state.

The original server-origin authenticated storage envelope additionally protects each recipient
ciphertext and the immutable job/recipient metadata. It opens only to recipient ciphertext; it
does not give the server a client decryption key. Pre-release regression **PRE-01** demonstrated
that omitting this outer authentication allowed a database writer to substitute recipient
metadata and inject public-key-encrypted fake output. Both tests failed before the fix and now
pass; those transcripts are retained. This prevents database-only forgery, not a malicious AI
worker that already sees plaintext or a full server compromise.

`resume` returns up to 16 ordered ciphertext chunks after an explicit sequence cursor.
`ack` records a per-device monotonically increasing acknowledgement bound to the ciphertext
digest. The browser advances only after AEAD/context checks and encrypted local checkpoint
persistence. Repeated identical chunks are ignored; gaps, conflicting duplicates, reordered
chunks, wrong owners/generations and missing terminal completion fail closed. Resume never
assumes that a server acknowledgement means a new browser possesses the local plaintext prefix.

`cancel` is an explicit owner command and aborts the provider transport. Worker failures and
authorization changes yield `interrupted`, with no raw provider error persisted or logged.
After process death, committed ciphertext survives and unfinished jobs become `interrupted`.
Generation is **not automatically replayed**: generic providers cannot resume their token
streams safely after losing the worker. The user can recover the partial response and explicitly
start a new generation. A live PID ownership guard rejects a second queue owner on the same host;
shared multi-host databases and multiple PID namespaces are unsupported.

Limits: four workers, one active job per owner, 30 retained jobs per owner per day, 512 chunks
and 8 MiB ciphertext per job, 256 MiB total ciphertext and 10,000 job rows. Provider events and
deltas are bounded. Response retention is 24 hours; cleanup runs every 30 seconds and at startup,
deletes expired ciphertext/acknowledgements, then removes expiry tombstones after a further day.
Reads reject expiration immediately. Account deletion cascades jobs, chunks and acknowledgements.
No service-wide capacity or multi-host load guarantee has been established.

SQLite, temporary files and application logs receive no plaintext generation chunks on this
path. This does not prevent an operator from enabling OS core dumps, swap capture or provider
request logging. Deployment must disable core dumps (`LimitCORE=0` / equivalent), protect or
disable swap, and review proxy/APM/provider logging. JavaScript strings cannot be reliably wiped.
Encrypted browser checkpoints and backups require a separate user/device retention policy.

## Verification at this checkpoint

| Run | Pass | Fail | Skip |
|---|---:|---:|---:|
| Complete application suite, including original 557 and 54 new cases | 611 | 0 | 0 |
| Production-like HTTPS/non-root/production-only dependency harness | 19 | 0 | 0 |
| Existing runtime-security harness | 14 | 0 | 0 |
| Total test executions | **644** | **0** | **0** |

The original 586 reported successful executions are retained. The dependency allowlist test
was updated explicitly from two to three cryptographic libraries because RFC 9580 support is a
real runtime dependency; its dependency-minimization assertion remains. No failing tests were
deleted or skipped. Two additional before/after RT-12 probe observations are not counted above.

Server coverage: **84.81% lines, 80.05% branches, 90.82% functions** of loaded modules.
Chromium executed-source-character ranges: main app **51.77%**, protected workspace **69.19%**,
recipient wrapper **73.54%**. These browser figures are not statement or branch coverage.
Child-process crash/compromise execution and third-party crypto internals are not represented
by the server coverage percentage. Existing RFC AES-GCM-SIV / ML-KEM vector checks are preserved;
new OpenPGP checks include algorithm/packet inspection, real signatures, wrong keys, corrupted
ciphertext, downgrade rejection and a byte-identical browser distribution. A dedicated imported
RFC 9580 interoperability/vector corpus remains outstanding.

The mandatory compromise fixture copies the application server/public source, configuration,
database, backup and every server-managed key into a separate directory and child process.
Installed dependency bytes are reused through a symlink and are not modified by the fixture. That process successfully opens
the outer server storage but cannot decrypt the inner content using its server keys or public
recipient keys. A separate legitimate teacher key decrypts it. This is a concrete key-custody
negative test, **not a proof against arbitrary cryptanalysis or malicious delivered JavaScript**.

Actual browser closure/reconnect, concurrent HTTP reconnects, SIGKILL recovery, disabled/deleted
accounts, revoked sessions/devices, ciphertext tampering, partial recovery, cancellation and
cache headers are covered. The HTTPS harness runs the feature enabled, with a synthetic local
provider. Docker execution, real providers, mobile Safari/Firefox and production infrastructure
remain unverified. [Sanitized transcripts and source hashes](evidence/recipient/manifest.json).

## Full-rollout blockers and next stages

1. **Existing reader integration and migration:** the old reader/chapter APIs remain unchanged
   except provider parser/cancellation improvements. They are still server-decryptable and their
   HTTP delivery lifetime is coupled to generation. The new durable path is the flagged workspace,
   not a completed replacement for every legacy generation flow. Keep legacy privacy labels.
2. **Teacher workflows:** encrypted document reading and AI-response access work; encrypted
   feedback/evaluation, historical rewrapping after reassignment and complete classroom policy
   administration are unfinished. Do not enable this preview as a replacement for required
   classroom oversight.
3. **Privacy transitions:** explicit public publishing, private-to-classroom revision editing,
   cross-device synchronization and UI key rotation/re-encryption are not complete. Server-side
   revision CAS and bounded recipient audit metadata provide foundations, not finished workflows.
4. **Migration staging:** inventory stories, recordings, profiles and their legacy key dependencies;
   take a stopped DB/keyring backup; implement client-authorized import with authenticated source
   digests and verified new recipients before any retirement. Preserve original data for rollback
   in a restricted offline archive with an explicit deletion deadline. No real data has been
   migrated or deleted. Old backups remain server-decryptable; no historical confidentiality claim.
5. **Protocol review:** review enrollment bootstrap, fingerprint UX, identity continuity, rollback
   detection, authenticated revision/recipient history and retention. The current backend can
   withhold or replay old valid encrypted documents; client monotonic revision pinning/key
   transparency is not implemented. It cannot decrypt them solely with server-managed keys.
6. **Deployment review:** single-host/process ownership, filesystem permissions, backups, browser
   storage/OS dumps and real edge caches require operational review. A malicious server-delivered
   app update, browser extension, compromised endpoint or authorized recipient can obtain plaintext.
   Browser-only encryption cannot eliminate that trust boundary.

Passing these tests does not establish production readiness. Keep the feature disabled for
sensitive/student-data rollout until the outstanding workflows and independent review are done.
