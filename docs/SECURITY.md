# Security boundaries

## Implemented and exercised

- Argon2id passwords: 64 MiB, three iterations, parallelism one, random salt, 32-byte output. Native `@node-rs/argon2` was substantially faster than Node/OpenSSL at these same parameters on the tested host; this is not a universal fastest-library claim. Re-run the benchmark on production hardware.
- Native OpenSSL ML-KEM-1024 encapsulation derives per-record AES keys through HKDF-SHA256. Noble AES-256-GCM-SIV protects payloads with random 96-bit nonces and authenticated record context/key IDs. Ciphertext corruption and context substitution fail closed. This custom envelope format has not received an independent cryptographic design audit. It is storage encryption, not a replacement for TLS or forward secrecy.
- SQLite uses foreign keys, WAL, bound parameters and immediate write transactions. Password hashes, usernames, role, session metadata and database structure are visible in the database; user profile/story/config payloads and new audio bodies are encrypted.
- Session tokens are random, opaque, HttpOnly, SameSite=Lax, Secure in production, expire after eight hours and are stored as hashes. Each authenticated request checks the live account. Logout, account deletion, disabling, password changes and role changes invalidate sessions. Re-enabling an account does not revive old sessions. Already returned bytes cannot be recalled. Long-running story/recording paths recheck the session before later output/persistence; upstream requests are not globally cancelled on revocation.
- APIs force private/no-store responses without validators. Shared URL requests with alternating and concurrent account cookies are tested. The old service worker is retired; an old browser may need a network reload to receive its replacement. A misconfigured external intermediary can disregard headers, so infrastructure cache policy still needs staging verification.
- Server-side role and ownership checks, teacher roster boundaries, cross-origin mutation protection, payload/type/size limits, unsafe-key rejection, login/generation limits, and a restrictive CSP cover tested attack paths.

## Reference verification

AES-256-GCM-SIV tests include RFC 8452 section C.2 vectors. ML-KEM tests use ten OpenSSL 3.5.4 ML-KEM-1024 decapsulation vectors derived from NIST ACVP, including implicit rejection, plus real round trips and corruption cases. The original attributed OpenSSL test-vector file is retained in `tests/fixtures/ml-kem-openssl.txt`; it is Apache-2.0 licensed. Password tests independently cross-check native Argon2 implementations with the same inputs and PHC parameters. Cryptography is never mocked.

References: RFC 8452 (https://www.rfc-editor.org/rfc/rfc8452.html), OpenSSL test vectors (https://github.com/openssl/openssl/blob/openssl-3.5.4/test/recipes/30-test_evp_data/evppkey_mlkem.txt), NIST ACVP (https://github.com/usnistgov/ACVP-Server).

## Remaining risks and work before launch

- An independent security review, threat model, penetration test, operational monitoring, patch policy and backup/restore exercise remain necessary. No FIPS validation is claimed. Node's SQLite and some crypto APIs carry experimental stability warnings in the tested runtime.
- Migration initially preserves source files, but production startup now refuses known plaintext legacy JSON until the verified encrypted archival command completes. External historical copies remain an operator responsibility; legacy raw audio is not re-encrypted automatically. Keyring loss, service compromise, malware with service-account permissions, or combined database/key theft defeat storage protection. JavaScript cannot guarantee clearing every sensitive memory copy.
- No MFA, self-service password reset, breached-password screening, comprehensive security audit log, hardware-backed key custody, per-school tenancy, or legal/privacy compliance certification is provided. Decide requirements for student data before deployment.
- Content controls are model instructions, not a guaranteed moderation boundary. Prompt injection, factual accuracy, age suitability, provider retention, and certified Lexile measurement are not proven by tests. AI requests and nonfiction search queries can leave the server for the configured provider and DuckDuckGo/custom search endpoint. Establish consent, retention and provider policies before using student data.
- Upload checks constrain format labels and size; they do not decode/validate every media container or scan for malware. Treat files as untrusted even after authenticated encryption.
- Browser verification covers Chromium at three widths, selected keyboard/label/contrast behaviors, and the main workflows. It is not a complete WCAG audit, screen-reader assessment, or Safari/Firefox/mobile-device certification.
- HTTP provider fixtures test integration behavior, not the availability or behavior of a live model. An isolated WSL test exercised real local TLS termination and backup/restore; the actual deployment edge, container runtime and sustained production load remain untested (see WSL_TEST_REPORT.md). Single-process generation coordination and SQLite scalability are explicit deployment limits.

See the subsequent [adversarial assessment](security/ASSESSMENT.md) for metadata authentication, envelope origin authentication, offline upgrade requirements, symlink containment and the final WSL results. This storage system is not E2EE.
