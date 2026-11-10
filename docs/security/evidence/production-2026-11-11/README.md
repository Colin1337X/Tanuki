# First-release hardening evidence

Code commit: `217861b99a59c949d4eeb3406c502bc60a996c4a`.

- WSL2 Ubuntu 26.04, Node 26.13.0: **739 passed, 0 failed, 0 skipped**. `wsl-suite.log` retains assertions/results; the local checkout path is replaced with `/workspace/tanuki`. Accounts, keys, databases and providers were synthetic.
- `coverage-summary.json`: loaded server modules have **85.82% line, 80.93% branch and 91.32% function coverage**. Child-process migration coverage is excluded. Browser entries measure V8 executed character ranges, not branches. Node's aggregate report also includes tests and helper modules; use the scoped metrics for application coverage.
- [GitHub verification](https://github.com/Colin1337X/Tanuki/actions/runs/42920411897): successful; 739 full-suite tests, 15 runtime/installed-profile tests, 19 production-only dependency tests, 19 actual read-only/non-root container tests, and 8 separate-UID worker-isolation tests, all with zero failures/skips. The two 19-test runs intentionally exercise the same acceptance suite in different environments; they are not 38 unique test cases.
- [Installer matrix](https://github.com/Colin1337X/Tanuki/actions/runs/42920412045) and [mobile builds](https://github.com/Colin1337X/Tanuki/actions/runs/42920411902) identify this code revision's platform results.

The 18 added tests cover offline maintenance (13) and authentication/proxy capacity (5), using real SQLite, Argon2id, encrypted records, HTTP requests and process termination. Existing tests were retained.

Local Docker was unavailable; container acceptance ran on the GitHub Linux runner. Recovery tests run on Linux; native installer smoke tests do not establish every recovery edge case on Windows/macOS. No actual public host, signing identity, real user data or live AI provider was involved. The November Node security release was still preannounced at this checkpoint. See the current [backlog](../../REMEDIATION_BACKLOG.md) for remaining release gates.
