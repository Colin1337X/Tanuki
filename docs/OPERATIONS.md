# Installed-server recovery

These commands apply to the profile created by the Tanuki Server installer. Run them as the profile owner, from the installed application directory, using its bundled runtime. The raw Docker data-directory deployment has a different layout; do not point these commands at that directory.

Stop the server before maintenance. The launcher, provider configuration and maintenance commands share an exclusive profile lock. One process on one host per profile is supported. Do not share a profile over a network filesystem.

## Select the profile

Windows PowerShell:

```powershell
$env:TANUKI_PROFILE_DIR = 'E:\TanukiData\profile'
& .\runtime\node.exe .\installer\maintain.mjs verify
```

Linux/macOS:

```sh
export TANUKI_PROFILE_DIR="$HOME/.local/share/tanuki-stories"
./runtime/node installer/maintain.mjs verify
```

Use the actual profile path chosen during installation. The default macOS profile is `$HOME/Library/Application Support/Tanuki Stories/profile`. Verification checks SQLite integrity, foreign keys, authenticated user/record contents and the provider envelope with the matching keyring.

## Back up and restore

Create a private parent directory on a trusted backup volume first. On POSIX it must not be writable by group or other users. Each destination must be new, outside the source profile, and must not contain symlinks. Example commands below use POSIX paths; on Windows substitute `runtime\node.exe` and absolute Windows paths.

```sh
./runtime/node installer/maintain.mjs backup /private-backups/tanuki-2026-11-11
./runtime/node installer/maintain.mjs restore /private-backups/tanuki-2026-11-11 /private-data/tanuki-restored
```

Backup checkpoints SQLite and copies the profile with a SHA-256 file inventory. Restore verifies the inventory and encrypted records, revokes **all restored sessions**, then publishes a new profile directory. It never overwrites an existing profile. Select the new profile with `TANUKI_PROFILE_DIR`, run `verify`, start behind the intended HTTPS proxy, and check representative records before opening access. Users must log in again. The original profile is unchanged; do not expose both copies simultaneously.

**Backups contain the private keyring and provider credentials.** Store them with restricted access and independently protected offline custody. Checksums detect accidental damage; they do not authenticate a backup against someone who can replace the entire backup and its keys. Keep the backup separate from the live disk, test restores periodically, and define retention. Filesystem snapshots and SSD secure deletion are outside this command's guarantees.

Failed operations can leave a private `.partial-<id>` directory. Inspect the reported path and remove only that incomplete directory after confirming no operation is using it. It is never published as the destination profile.

## Administrator recovery and revocation

```sh
./runtime/node installer/maintain.mjs reset-admin existing-admin
./runtime/node installer/maintain.mjs revoke-sessions
```

Password recovery prompts twice without displaying the password. It accepts 16–1024 characters, hashes with Argon2id, and revokes every session. It only resets an existing administrator; it cannot promote a student or create an administrator. An authorized automation may provide bounded JSON on stdin (`{"password":"..."}`), but must not put passwords in command arguments, shell history or log output. This is local recovery by the profile owner, not a public password-reset endpoint.

## Interrupted processes and locks

A lock whose recorded PID is definitively absent is recovered automatically. Live PIDs, permission errors and malformed locks fail closed. PID reuse or a crash during recovery can require manual intervention: stop the service, verify there are no Tanuki server/provider/maintenance processes using that exact profile, inspect `.tanuki-lock` and `.tanuki-lock.recovery`, then remove only those stale lock files. Never delete an active lock to force a second process to start.

## Proxy and capacity configuration

The installed launcher listens on loopback and trusts forwarded client addresses only from `127.0.0.1` and `::1`. The immediate proxy must append or replace `X-Forwarded-For` with the observed client address. The application uses the final valid IP, ignoring headers from untrusted peers. For the raw server, `TANUKI_TRUSTED_PROXY_IPS` is an explicit comma-separated list of IPs, with no wildcard or CIDR support. Restrict network access to the backend as well.

At most four password verifications run concurrently; excess attempts receive HTTP 429. This bounds Argon2 memory pressure, but is not a school-size load guarantee. Measure realistic usage and provider latency before rollout. Do not add application processes against the same profile to bypass the bound.
