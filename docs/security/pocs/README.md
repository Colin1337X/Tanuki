# Local proof-of-concept and regression scripts

The actual proof-of-concept code is already tracked in Git, not hidden in generated coverage output:

- [tests/node/adversarial.test.js](../../../tests/node/adversarial.test.js): original twelve adversarial cases, metadata/forgery/property tests, cache and role checks.
- [scripts/security-runtime.test.js](../../../scripts/security-runtime.test.js): Linux filesystem key exposure, crashes, rollback, migration and plaintext archive cases.
- [tests/node/browser.test.js](../../../tests/node/browser.test.js): real Chromium critical paths and the five additional security browser cases.
- [scripts/production-smoke.test.js](../../../scripts/production-smoke.test.js): isolated production-mode TLS, account/session, restart/restore and listener checks.

These are the source files used to find and retest the defects. They have retained their secure-behavior assertions. They were not rewritten into a remote exploit tool. The current source includes subsequent hardening and added cases, so historical line numbers can differ. There is no claim that a complete vulnerable pre-remediation source snapshot was committed; the retained pre-fix transcripts are the historical evidence.

## Run an individual finding in an isolated WSL checkout

Use the synthetic test installation described in [the backlog](../REMEDIATION_BACKLOG.md). Install dependencies from the lockfile in that copy. Do not use a real production checkout/data directory.

```sh
node scripts/security/run-poc.mjs --list
node scripts/security/run-poc.mjs RT-01
node scripts/security/run-poc.mjs RT-04
node scripts/security/run-poc.mjs RT-09
node scripts/security/run-poc.mjs RT-11
```

The [selector script](../../../scripts/security/run-poc.mjs) invokes the real source tests by name. It accepts a finding ID, **not a target URL**, and refuses test execution outside Linux. Each test creates its own temporary data/keys and local services. The static symlink case creates/removes a link only inside that disposable app copy. Failed archive verification preserves its synthetic input. Temporary private fixture directories can remain for investigation.

Passing means the exercised behavior matches the secure assertion. A vulnerable build would fail that assertion. Name-filtered runs are targeted PoC retests, not replacements for the complete suite. No safeguards should be disabled to reproduce a historical failure; do not deploy a vulnerable build on a public interface.

## Full verification

```sh
npm run test:coverage
npm run coverage:report
node --test scripts/security-runtime.test.js
```

Run `node --test scripts/production-smoke.test.js` in a separate `npm ci --omit=dev` installation with OpenSSL. The main browser suite requires Chromium and its Linux libraries. The production and runtime harnesses use synthetic credentials and loopback HTTP/TLS fixtures; they never require live provider secrets.

For command-to-finding mapping and prerequisites, see [FINDINGS.md](../FINDINGS.md). Historical [sanitized transcripts](../evidence/README.md) remain distinct from any newly generated results.
