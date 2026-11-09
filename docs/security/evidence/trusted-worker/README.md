# Trusted worker evidence

These are sanitized transcripts from isolated WSL2 tests with disposable databases,
local provider fixtures and synthetic keys. No production logs or private keys are included.
The manifest records raw/local and published log hashes and normalized source hashes.
Paths and process IDs are redacted; test outcomes are unchanged.

- `full-suite.log`: 641 application tests, 641 pass, zero fail/skip.
- `production.log`: 19 tests against the production-dependency installation, all pass.
- `runtime.log`: 14 migration/crash/runtime tests, all pass.
- `os-isolation.log`: 8 actual separate-UID/systemd worker tests, all pass.
- `build.log`: syntax checks (the check count is not a test count).
- `artifact.log`: rebuilt worker artifact, 52 files. Artifact reproducibility and tamper
  rejection are tested in the application suite. Dependency bytes are not embedded here.
- `summary.json`: measured coverage and its scope limitations.
- `recipient-pin-poc.log`: two before/after observations using checkpoint `7f611ad` and
  current code. These observations are not added to the automated test count.

Reproduce using `npm run test:coverage`, `npm run coverage:report`, `npm run build`,
and the scripts in `scripts/security/`. The OS harness requires a dedicated non-root
worker UID distinct from the non-root API UID and root provisioning of its disposable
systemd fixture. Do not run it against production services or reuse fixture credentials.
The 682 total executions are evidence of these specific checks, not production approval.
See [architecture, deployment and remaining risks](../../TRUSTED_WORKER.md).
