# Recipient encryption checkpoint evidence

These are real WSL transcripts, sanitized by
`scripts/security/export-recipient-evidence.mjs`. They contain synthetic fixtures only.
`manifest.json` identifies original/published log hashes and normalized tested source hashes.
Historical evidence in the parent directory is preserved unchanged.

- `full-suite.log`: 611 passed, zero failed/skipped.
- `production.log`: 19 passed through local HTTPS, non-root, production-only dependencies.
- `runtime.log`: 14 original runtime-security checks passed.
- `summary.json`: measured coverage and its scope.
- `stream-completion-poc.log`: RT-12 baseline/current observations, not additional suite cases.
- `queue-origin-before.log` and `queue-origin-after.log`: real pre-release PRE-01 failures and fixes;
  the pre-fix workspace was not a published Git commit. Their cases are included in the final suite.
- `build.log`: native module syntax checks.

No log establishes production certification, mathematical security proof, or independent audit.
See the [checkpoint report](../../RECIPIENT_ENCRYPTION.md) for unfinished work and limitations.
