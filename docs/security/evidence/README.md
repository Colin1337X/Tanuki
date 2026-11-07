# Sanitized raw assessment evidence

These are Git-tracked copies of the original local test-run transcripts. They preserve test names, assertions, observed status codes, errors, counts and timing values. They are **sanitized raw runner output**, not network packet captures, not invented HTTP access logs, and not evidence of attacks on a live production installation.

| Artifact | Meaning |
|---|---|
| [pre-fix-attacks.txt](pre-fix-attacks.txt) | Initial 10 failing secure-behavior assertions covering RT-01–RT-06; earlier Windows-local discovery phase |
| [pre-fix-provider-attacks.txt](pre-fix-provider-attacks.txt) | RT-07/RT-08 controlled local sink observations, before fixes |
| [pre-fix-symlink.txt](pre-fix-symlink.txt) | WSL RT-09 disposable-key exposure before fix |
| [pre-fix-roster-role.txt](pre-fix-roster-role.txt) | WSL RT-10 read/write role-boundary failure before fix |
| [post-fix-attacks.txt](post-fix-attacks.txt) | Historical early remediation pass: the original 12 security cases passed; not the final total |
| [full-suite.txt](full-suite.txt) | Final WSL application run: 557 passed, zero failed/skipped |
| [production-smoke.txt](production-smoke.txt) | Final production-mode HTTPS/process run: 15 passed |
| [runtime-security.txt](runtime-security.txt) | Final Linux crash/migration/filesystem/archive run: 14 passed |
| [build.txt](build.txt) | Final application syntax verification |
| [summary.json](summary.json) | Measured coverage, with server/browser metrics separated |
| [manifest.json](manifest.json) | Original raw and sanitized SHA-256 checksums, source names and sizes |

No separate pre-fix attack transcript was captured for RT-11. Its underlying source-preservation observation and current startup/archive checks are described in the assessment and runtime tests. Missing historical evidence has not been reconstructed as if it were an original log.

## Sanitization and provenance

[export-evidence.mjs](../../../scripts/security/export-evidence.mjs) reads an explicit allowlist under ignored `coverage/security/` and exports these copies. It normalizes CRLF/ANSI formatting and trailing whitespace; replaces workstation/WSL fixture paths and process IDs; redacts the synthetic bearer credential representation and any session-cookie values; and fails closed if common private-key, access-token, password-hash or home-path patterns remain. Test outcomes and assertions are not edited. Synthetic account names and synthetic story/prompt text are intentionally retained as evidence.

The exporter is a bounded scrubber, not a guarantee that arbitrary logs contain no secrets. These specific files were also reviewed before publication. Private keyrings, environment files, databases, recordings, raw browser coverage, dependency caches and arbitrary coverage-directory contents are **not** included. Existing ignored files remain ignored; there is no blanket force-add of coverage output.

The manifest's raw hash fingerprints the locally retained original without publishing it. Its sanitized hash verifies the published copy. The tested application commit is `b47dabc795dbfd59a3e3aa96bb8088903d2e36f0`; the documentation/exporter follow-up changes do not retroactively rerun or alter those application results.

Run the exporter only where the original synthetic assessment logs are present:

```sh
node scripts/security/export-evidence.mjs
```

[Attack diagrams](../ATTACK_PATHS.md) · [All findings](../FINDINGS.md) · [PoC sources](../pocs/README.md) · [Full assessment](../ASSESSMENT.md)
