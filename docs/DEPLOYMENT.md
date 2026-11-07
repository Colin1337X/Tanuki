# Deployment and recovery

## First deployment

1. Install a supported, patched Node release >=24.8.0. Pin and validate your deployment image; the supplied `node:24-bookworm-slim` tag moves with upstream patches.
2. Create a **fresh** production data directory. Do not promote the development database with its example accounts.
3. Run `npm ci --omit=dev`, then `npm run keys:create -- /secure/tanuki/keyring.json`. Keep keys separate from the database. Grant only the service identity access; on Windows configure filesystem ACLs explicitly (POSIX mode flags are not Windows ACL enforcement).
4. Copy `.env.local.example` to `.env.local`. Set `APP_ORIGIN` to the exact public HTTPS origin, `TANUKI_KEYRING_FILE`, `TANUKI_DATA_DIR`, and a unique `ADMIN_USERNAME`/`ADMIN_PASSWORD` (12+ characters). Set `NODE_ENV=production` in the service environment. Production fails closed without an administrator, keyring, or HTTPS origin.
5. Configure an OpenAI-compatible provider through `OPENAI_BASE_URL` and `OPENAI_API_KEY`. Production administrator URL overrides must match that origin (or the default OpenAI origin), or an operator-approved comma-separated `AI_ALLOWED_ORIGINS` entry. Redirects are rejected. Production story generation fails when no provider is configured. Existing configurations with `localModelId` must be changed to an HTTP endpoint.
6. Start `npm start` under a process supervisor. Place a TLS reverse proxy in front of the loopback listener. For a container, use `docker compose up --build -d`; place the keyring at `.secrets/production-keyring.json` and make it readable by container UID 1000. Compose persists data in its named volume and mounts the key read-only.
7. Check login, logout, one story, one streamed chapter, and recording playback through the actual HTTPS hostname. Back up and restore on a separate staging instance before admitting real users.

Do not cache `/api/` or authentication responses at a CDN or proxy. Preserve `Cache-Control: no-store, private`, `Vary`, `Set-Cookie`, Origin and Fetch Metadata headers. Disable proxy buffering on chapter streams. Set proxy body limits >=6 MiB for recordings and align timeouts with generation (up to 120 seconds). Never publicly expose the unencrypted Node listener.

Bootstrap credentials are used only to create missing accounts. Changing the environment password does **not** reset an existing account. After first startup remove the bootstrap password from environment storage. Password reset/self-service recovery is not yet a product workflow; provision and maintain a controlled administrator recovery procedure before launch.

## Migration

Stop the old application first. Back up its entire `data/` directory and create a separate migration copy. Put the existing `config.json`, `users.json`, `stories.json`, `recordings.json`, `knowledge-base.json`, and recording subdirectories in `TANUKI_DATA_DIR`. The first new startup imports JSON in one transaction and hashes plaintext passwords with Argon2id. Malformed JSON, duplicate identifiers or invalid collection shapes fail instead of resetting data. Successful migration is marked and is not repeated on subsequent starts.

Verify accounts, roles, ownership, stories, plans, chapters and recordings against the backup. The importer initially preserves source JSON for recovery. Production startup now refuses to serve while these known plaintext sources remain. With all app processes stopped, use `npm run data:archive-legacy`: it verifies an authenticated encrypted archive byte-for-byte before removing each source. Protect retained external backups separately. Existing SQLite databases from before the security hardening first require `npm run data:upgrade` against a verified backup; this performs a trusted offline upgrade and revokes legacy sessions. Do not put `TANUKI_ALLOW_LEGACY_UPGRADE` in the service environment. Existing raw audio recordings remain compatible but are not automatically encrypted. New recordings are encrypted. Users retaining weak legacy passwords need a password reset before launch.

## Backup, rotation and restore

Stop the app before filesystem backups; copy the complete data directory (including SQLite WAL/SHM if present and recordings) and back up the keyring separately. An online backup must use SQLite's backup mechanism, not a live copy of only `tanuki.sqlite`. A database without its matching private keys is unrecoverable.

For rotation: stop **all** app processes; take a verified backup; set `TANUKI_KEYRING_FILE` and `TANUKI_DATA_DIR`; run `npm run keys:rotate`; back up the updated keyring; restart. The command atomically installs a new keyring retaining the old keys, then transactionally re-encrypts database payloads. If re-encryption fails, its transaction rolls back and the expanded keyring can still decrypt the old database. Old recordings/backups require old keys, so **do not prune them**. The read-only container mount means rotation should run offline against the writable host keyring and the corresponding mounted data volume.

Restore into an isolated directory with the matching keyring, configure the service to use those paths, and verify representative accounts and records before switching traffic. Restoring a snapshot can restore previously valid sessions; revoke restored sessions as part of your recovery policy.

## Deployment limits

Run one Node application process per deployment. SQLite write integrity is tested across processes; generation locks and global in-flight limits are process-local and do not coordinate multiple workers. Synchronous SQLite, record decryption and administrative password hashing block the event loop. Benchmark realistic data volumes and Argon2 login concurrency on the actual host. The IP login quota currently uses the socket address; clients behind one proxy share that quota. Configure edge throttling and capacity accordingly; forwarded-IP headers are not blindly trusted.

Docker configuration was checked automatically. A subsequent isolated WSL run exercised a local TLS proxy, non-root production process, restart, key rotation and backup/restore; see [the WSL report](WSL_TEST_REPORT.md). No live Docker daemon, actual deployment edge, production-scale disaster recovery drill or sustained production load test was exercised.

The [adversarial assessment](security/ASSESSMENT.md) supersedes older security conclusions; follow its [release backlog](security/REMEDIATION_BACKLOG.md). Historical usernames are now reserved after deletion. The Windows development instance was not migrated during the isolated WSL assessment.
