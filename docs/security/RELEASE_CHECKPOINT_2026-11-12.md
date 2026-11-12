# Release blocker checkpoint — 2026-11-12

## Confirmed fixes under verification

- Official Node 26.13.1 security release replaces 26.13.0 across release builds,
  application/worker engine constraints, CI, runtime license retrieval and Docker.
  The container index is pinned to
  `sha256:5df79989ed685e09f0a98019db4cebfb22fb9df1a53c0161664a011f7ff6b0f1`.
- Startup rejects Node 26.13.0 before opening application data. The existing runtime
  regression explicitly exercises this newly rejected version; no tests were removed.
- The official Linux x64 archive passed SHA-256 verification against the Node
  distribution manifest. The actual executable reports Node 26.13.1 / SQLite 3.54.1.
- The last application CI failure occurred while installing browser dependencies:
  Azure's Ubuntu mirror failed DNS resolution. Linux Tauri packaging also timed out
  in apt. CI now selects the primary Ubuntu archive, retains signature verification,
  fails on incomplete apt updates and bounds download retries/timeouts. No test or
  dependency security gate was bypassed.

Sources: [Node release index](https://nodejs.org/dist/index.json),
[official security notice](https://nodejs.org/en/blog/vulnerability/november-2026-security-releases),
[checksums](https://nodejs.org/dist/v26.13.1/SHASUMS256.txt).
The previous “not yet published” statements in older dated evidence are historical.

## Verification

Full WSL2 coverage, runtime/installation regressions, read-only container acceptance
and fresh native packaging are in progress. Do not infer success from the version
pin alone. Final results are recorded below when observed.

## Still external or unverified

Signing credentials, Apple notarization/provisioning, physical-device and screen-reader
acceptance, a real target host's TLS/ACL/backup configuration, independent crypto review
and school-scale capacity acceptance remain separate gates. No public release is
authorized by this checkpoint. See [the release backlog](REMEDIATION_BACKLOG.md).

### Observed local results

- Node 26.13.1 in isolated WSL2: **741 passed, 0 failed, 0 skipped**.
- Additional runtime/installed-profile checks: **15 passed, 0 failed, 0 skipped**.
- Coverage: **86.30% lines, 81.22% branches, 91.58% functions**. The machine-readable
  report is [tracked here](evidence/runtime-2026-11-12/coverage-summary.json).
- Fresh Linux production-only bundle: **591 files verified**, installation integrity
  check passed, actual bundled runtime provisioning/login smoke **1 passed**.
- Application and worker npm audits: **zero reported vulnerabilities**.
- All workflow files passed actionlint. The local Docker Linux engine was stopped,
  so container acceptance is delegated to the required CI job, not counted as passed.
- PR #65 had merged into the dependency branch after PR #62 reached main. The migration
  and runtime fixes are now combined in [PR #66](https://github.com/Colin1337X/Tanuki/pull/66).
  Fresh native/platform and container job conclusions remain the source of truth for
  packaging acceptance; local tests do not establish signing or device behavior.
