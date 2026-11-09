# PQ-stack verification evidence

Isolated WSL2 Ubuntu 26.04, Node 24.22.2, synthetic accounts/keys/databases and
loopback provider fixtures only. Published logs preserve outcomes while redacting
host paths and process identifiers. No real credentials or private keys are included.
The manifest records original/local log hashes, published hashes and normalized source hashes.

| Suite | Pass | Fail | Skip |
| --- | ---: | ---: | ---: |
| Application, crypto, browser and artifact | 670 | 0 | 0 |
| Production-dependency smoke | 19 | 0 | 0 |
| Runtime and migration | 14 | 0 | 0 |
| Separate-UID systemd worker | 8 | 0 | 0 |
| Executions | 711 | 0 | 0 |

All cancellation/todo counts were zero. Previous tests were retained; OpenPGP
unit tests explicitly target legacy compatibility. Version-specific assertions now
require v2 on new writes. Migration tests generate genuine legacy envelopes.

Measured loaded server coverage: 85.75% lines / 79.97% branches / 90.44% functions.
Worker: 84.91% / 77.95% / 92.68%. Application recipient envelope: 100% / 87.60% / 92.86%.
Browser character coverage: app.js 53.78%, protected workspace 73.12%, PQ envelope
72.04%, browser primitive adapter 100%, legacy wrapper 30.82%. These are distinct
metrics: browser coverage is executed source characters, not statement/branch coverage.
Library internals and separate OS processes are not instrumented. Coverage does not
establish cryptographic security or production readiness.

`full-suite.log`, `production.log`, `runtime.log`, `os-isolation.log` and `build.log`
contain test/syntax outcomes. `artifact.log` identifies the rebuilt worker artifact;
reproducibility and tamper rejection run in the application suite. `benchmark.log`
compares the real native and browser-compatible primitive adapters on the same WSL
machine. `summary.json` contains coverage and scope details.

Reproduce with `npm run test:coverage`, `npm run coverage:report`, `npm run build`,
`npm run crypto:benchmark:pq`, and the isolated deployment/security harnesses.
See [the cryptography and migration guide](../../CRYPTO_STACK.md) for protocol and
deployment limitations. Historical logs in adjacent directories are not overwritten.
