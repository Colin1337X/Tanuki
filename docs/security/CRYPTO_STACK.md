# Post-quantum cryptography migration

New application encryption uses **AES-256-GCM-SIV + Argon2id + HKDF-SHA-512 + ML-KEM-1024 + ML-DSA-87**. This supersedes the new-write algorithms described in the earlier recipient/worker checkpoints. Existing authenticated formats remain readable for migration; they are not retroactively post-quantum secure.

| Purpose | New-write construction | Implementation |
| --- | --- | --- |
| Account password hashing | Argon2id v19, 64 MiB, 3 passes, 1 lane, unique salt | Native Rust `@node-rs/argon2` |
| Encrypted client backup | Same Argon2id parameters, 32-byte salt, 32-byte derived key, AES-256-GCM-SIV | Rust on Node; hash-wasm in browsers; Noble AES |
| Recipient key establishment | Separate ML-KEM-1024 encapsulation for each recipient | Native OpenSSL on Node; Noble in browsers |
| Recipient wrapping-key derivation | HKDF-SHA-512, 32-byte output, random 32-byte salt, SHA-512 of the domain-separated transcript as info | Native OpenSSL / Noble |
| Response/content and key wrapping | AES-256-GCM-SIV, random 256-bit content key, fresh 96-bit nonces, authenticated context | `@noble/ciphers` |
| Device, document and worker signatures | ML-DSA-87, separate signing key and domain-separated messages | Native OpenSSL on Node; Noble in browsers |
| Server storage v2 | ML-KEM-1024 → HKDF-SHA-512 → AES-256-GCM-SIV, with ML-DSA-87 origin signature | Native OpenSSL + Noble |

Storage also retains a server-secret origin MAC: HMAC-SHA-512 with a separately labeled HKDF-SHA-512 key for v2. Legacy v1 uses its original HKDF/HMAC-SHA-256 only when reading old records. SHA-256 remains for public fingerprints, ciphertext-chain identifiers, session-token hashes and artifact checksums; those are not encryption-key derivation. TLS remains standard TLS 1.3 with its supported cipher suites; this change does not invent a GCM-SIV TLS suite or claim post-quantum transport certificates.

## Wire format and integrity

`public/assets/pq-recipient.js` is a versioned application envelope composed from library primitives. It is **not a standardized OpenPGP profile, HPKE implementation, independently audited protocol or FIPS-validated product**. Its composition still requires independent review before deployment. No cryptographic primitive is implemented from scratch in application code.

Version-2 public keys contain independent ML-KEM and ML-DSA public bytes plus an exact suite identifier. The fingerprint covers their canonical encoding. Private keys derive from independent random 64-byte KEM and 32-byte signature seeds. Backups bind their version, suite, Argon2 parameters, salt, nonce and fingerprint as associated data. Parsers reject unknown fields, unknown suites, noncanonical base64 and incorrect lengths. Argon2 work parameters are fixed and validated before derivation to prevent untrusted backup files from requesting unbounded work.

Every encrypted message has a random 32-byte identifier, sorted unique recipient fingerprints, optional signer identity, recipient encapsulations and encrypted content. Each KEM secret derives a wrapping key over the message ID, suite, signer, full recipient set, target fingerprint, encapsulation, salt and nonce. That key wraps a fresh random content key. The content AEAD binds the full recipient-wrap list and content nonce. Signed messages bind the complete encrypted envelope under the `tanuki-encrypted-message-v2` and `tanuki-device-signature-v2` domains. The recipient validates a supplied signer before decryption; signed content cannot be treated as unsigned. Generation/owner/sequence/previous-hash context remains inside authenticated content and is checked before releasing it to reconstruction.

The worker signs both the inner encrypted response and the outer public frame. The ordinary API verifies the outer signature without recipient private keys. Session revocation, live recipient policy, per-chunk durable acknowledgment, disconnect-independent generation and restart behavior remain as documented in [Trusted Worker Encryption](TRUSTED_WORKER.md).

Nonces and keys come from the platform CSPRNG. Key buffers are wiped where practical, but JavaScript strings, native key objects, browser memory and runtime copies do not provide a provable erasure guarantee. AES-GCM-SIV's misuse resistance is not permission to reuse nonces. The application does not claim secrecy from a compromised browser, plaintext-processing worker/provider, host administrator, or malicious replacement JavaScript.

## Library selection and measured performance

The Node path uses native OpenSSL ML-KEM/ML-DSA/HKDF and native Rust Argon2id. The browser uses pinned `@noble/post-quantum` 0.7.1, `@noble/hashes` 2.4.0, Noble AES-GCM-SIV, and hash-wasm 4.12.0. The reviewed browser modules are vendored with upstream and published hashes; only Noble import paths are rewritten. Argon2 WASM requires CSP `wasm-unsafe-eval`; JavaScript `unsafe-eval` and inline scripts remain prohibited.

`npm run crypto:benchmark:pq` compares the actual adapters. In the recorded WSL Node 24.22.2 run, native ML-DSA-87 signing was 0.739 ms versus 6.094 ms for Noble, and native Rust Argon2id was 29.881 ms versus 140.535 ms for WASM at the same parameters. Native KEM encapsulation/decapsulation and signature verification were also faster. These are same-machine measurements, not browser-device measurements or proof of the fastest library among every available implementation. Native WebCrypto PQ APIs are marked experimental by Node; pin and test runtime upgrades. Node/OpenSSL currently provides no selected native AES-GCM-SIV path here, so the existing tested Noble implementation is retained.

The application keeps OpenPGP.js only for old-data reads, old-backup unlock and signatures needed to authorize migration from an existing device. The new worker artifact has only Noble ciphers and native Argon2 runtime dependencies; OpenPGP is absent. New encrypted content rejects legacy or mixed recipients, and new device enrollment requires the PQ suite. There is no automatic downgrade to the old algorithm set.

## Operator migration

1. Keep verified offline backups of the database, recordings, queues and **complete old keyring**, in restricted storage. Stop generation and drain or explicitly interrupt jobs before changing worker identities. Do not migrate a live multi-process deployment.
2. For the previous authenticated database release, run `npm run keys:rotate` with the existing `TANUKI_KEYRING_FILE` configured. This adds a fresh ML-KEM/ML-DSA pair, re-encrypts users/records/key-check transactionally, and retains old keys for archived recordings, retained queue envelopes and backups. New writes with a signing-key-free legacy active key fail with an explicit rotation instruction. A genuine old-keyring/database regression verifies data and password-hash preservation.
3. Databases older than the server-origin authentication migration need the existing trusted offline upgrade first, using the preceding release and a known-good backup. Do not bypass its authentication marker or use an untrusted snapshot to bless authorization data. Fresh imports of legacy JSON use the new keyring and still hash plaintext passwords with Argon2id; original recovery files must be archived through the existing verified procedure.
4. Build and verify a new minimal worker artifact. Provision a new worker processing identity using `scripts/create-worker-identity.mjs`. Its private file is now versioned JSON (the existing `.asc` filename suffix is retained for path compatibility). Install it with the existing separate-UID/0600 controls. Old OpenPGP worker private keys cannot start the new worker. Update the API fingerprint and independently verify the new browser pin; TLS certificates and processing keys are distinct.
5. Keep old client recovery backups. An old device can unlock/read old content and authorize enrollment of a new PQ device. Generate the new device in a separate browser profile, save its backup, then approve its public key using an existing authorized device. Verify new teacher/worker fingerprints independently. Full historical client rewrap and multi-device migration UI remain unfinished; do not destroy old keys or claim that old content has been upgraded.
6. Never roll back to code that cannot read v2 records against the upgraded database. Restore a matching offline database/keyring backup for an actual rollback. Restoring old snapshots can also restore revoked state; it requires an explicit session revocation procedure, not a silent rollback.

The two encryption preview flags remain off by default. This change does not resolve the unfinished encrypted multi-chapter, feedback, publishing and history workflows listed in the worker report.

## Verification

The final isolated WSL run is recorded in [sanitized evidence](evidence/pq-stack/README.md). Existing OpenPGP unit assertions remain as compatibility tests. Existing API, browser, response-queue and worker tests now exercise PQ defaults; version-specific storage assertions were updated to require v2, and legacy migration fixtures now construct the actual v1 format rather than deleting fields from a new-format record.

Actual result: **670 application + 19 production smoke + 14 runtime + 8 OS-isolation = 711 passing executions**, zero failures/cancellations/skips. Loaded application-envelope coverage is 100% lines and 87.60% branches; library internals are excluded. The scope and remaining workflow/deployment risks from the worker assessment still apply.

Additional tests cover native/browser interoperability, multi-recipient decryption, pinned-key substitution, backup parameter injection/tampering, independent AEAD integrity without relying on signatures, signature rejection, duplicate/reordered recipients, downgrade rejection, legacy recovery, genuine keyring rotation, and vendor-byte integrity. Selected NIST FIPS 204 ML-DSA-87 verification vectors (valid and invalid) run against both OpenSSL and Noble. Selected Wycheproof HKDF-SHA-512 vectors run against both implementations. Existing RFC 8452 AES-256-GCM-SIV, ML-KEM and Argon2 tests remain. This is selected-vector coverage, not the entire ACVP or Wycheproof corpus.

Primary references: [NIST ML-DSA vectors](https://github.com/usnistgov/ACVP-Server/tree/master/gen-val/json-files/ML-DSA-sigVer-FIPS204), [Wycheproof HKDF vectors](https://github.com/C2SP/wycheproof/blob/main/testvectors_v1/hkdf_sha512_test.json), [Node WebCrypto](https://nodejs.org/api/webcrypto.html), [Noble post-quantum](https://github.com/paulmillr/noble-post-quantum), [hash-wasm](https://github.com/Daninet/hash-wasm).
