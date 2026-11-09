# Release verification checkpoint — 2026-11-09

Candidate source: `c5b8d7b6a0cfc68b1fe71a8591b8f37e1c54572c`, PR [55](https://github.com/Colin1337X/Tanuki/pull/55).
This is an unsigned installer candidate, not a production-readiness certification.

## Recorded verification

[GitHub release matrix](https://github.com/Colin1337X/Tanuki/actions/runs/42599228187)
and [standalone verification](https://github.com/Colin1337X/Tanuki/actions/runs/42599228228)
use clean checkouts, Node 24.22.2, synthetic accounts, temporary databases and disposable keys.
No live AI provider, production account or real credential is exercised.

| Verification group | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Full application and Chromium suite | 680 | 0 | 0 |
| Runtime security regressions | 14 | 0 | 0 |
| Production-only dependency smoke | 19 | 0 | 0 |
| Separate-UID/systemd worker isolation | 8 | 0 | 0 |
| Installed-profile production smoke | 1 | 0 | 0 |

The full suite also passed in isolated WSL2. All original tests remain; ten installer tests
cover capability authentication, Host/Origin checks, malformed input, provisioning races,
existing-data preservation, encrypted provider rotation, desktop setup and mobile layout.

Each Windows x64, Linux x64, macOS Intel and macOS Apple Silicon build separately verifies
its manifest and runs the same installed-profile smoke test twice: once from the portable
bundle and once from the native installed payload. These repeated executions are not new
unique test cases. Windows additionally compiles and executes Inno Setup and its uninstaller;
Linux installs/removes the Debian package; macOS installs the actual product package.
OS-specific workflow steps are conditionally skipped on other platforms; those are not
skipped test cases. Public release publication and provenance signing are intentionally
not executed by a pull-request build.

## Coverage and evidence

The verification artifact contains `full-suite.log`, `report.html`, `summary.json`,
`lcov.info`, and graphical setup screenshots. Build artifacts contain native installers,
portable archives and SHA-256 checksums. CI evidence expires after 14 days and build
artifacts after 30 days; retain reviewed evidence with a release before those deadlines.

Measured loaded server modules: **85.75% lines**, **79.97% branches**, **90.44% functions**.
Loaded worker modules: **84.91% lines**, **77.95% branches**, **92.68% functions**.
Application recipient envelope: **100% lines**, **87.60% branches**, **92.86% functions**.
Browser `app.js`: **53.78% executed source characters**, not statement/branch coverage.
Dependencies, unloaded modules, installer code and separate child/OS process execution are
not represented by those percentages. Installer assertions and native installation smoke
tests are behavioral evidence, not a claim of complete installer coverage.

## Defects found while validating releases

- Git normalized the vendored Argon2 distribution from upstream CRLF to LF. Clean-checkout
  byte-integrity tests failed despite the original local copy passing. The exact upstream
  bytes are now tracked with a specific `-text` attribute and reindexed. The checksum
  assertion was preserved.
- Coverage logging raced directory creation on a fresh checkout. The workflow now creates
  the directory before starting `tee`; pipeline failures still fail the job.
- Git Bash's `whoami.exe` shadowed the Windows SID utility. Provisioning failed closed.
  Windows ACL utilities now use explicit System32 paths; native provisioning passes.
- A pre-existing randomized envelope-tampering test could replace a character with itself.
  The mutation now guarantees a different byte representation and retains rejection checks.

Provider rotation additionally verifies real encryption/decryption, atomic binding of URL
and credential, preservation of the previous configuration after rejected input, and refusal
to overwrite an interrupted update file. No cryptographic operation is mocked.

## Remaining release gates and assumptions

- Windows Authenticode and Apple Developer ID signing/notarization are not configured.
  Do not publish desktop installers as trusted releases or advise bypassing OS protections.
- Shared graphical setup was browser-tested on Chromium/Linux. Native package installation
  is automated on every target OS; native wizard appearance, assistive technologies and
  Finder/desktop launch behavior still require human acceptance on supported systems.
- This does not prove upgrade compatibility across every historical installer or OS version,
  preservation under disk failure, power loss, or every possible ACL configuration. Existing
  profiles are refused rather than overwritten; partial provisioning requires operator recovery.
- Real-host HTTPS/DNS, restore testing, capacity, monitoring and administrator recovery remain
  deployment acceptance tasks. Signing and draft-release publication paths have not run in PR CI.
- The baseline installer disables experimental recipient/trusted-worker features. Advanced
  worker deployment remains separate. Existing unfinished encrypted product flows and an
  independent review of the cryptographic envelope remain open. Backend/provider plaintext
  processing is not end-to-end encryption.

See [release operations](RELEASES.md) and the existing [security backlog](security/REMEDIATION_BACKLOG.md).
