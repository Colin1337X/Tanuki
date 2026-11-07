# Tanuki Stories

A Node.js and vanilla JavaScript reading workspace with student, teacher, and administrator accounts. Studio, claymorphic Classroom, and Focus themes use a locally hosted Jua font. Students set a **0–1800L Lexile writing target in 50L steps** with an accessible slider. This target is a generation instruction, not a certified measurement; teacher reading levels and content restrictions remain authoritative.

## Run locally

Use Node.js **24.8 or newer** (tested here on 25.5.0). SQLite and ML-KEM require a recent Node runtime.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Development creates `admin / admin123` and `student / student123`, plus a development encryption key in `.secrets`. **Do not reuse this development database or its credentials in production.** Development returns clearly marked demo stories until an AI provider is configured.

The active application is `server/`, `public/index.html`, and `public/assets/`. It has no bundler, Next.js, React, or TypeScript runtime. Only two production dependencies remain: native Rust Argon2 and Noble's AES-GCM-SIV implementation. Historical `src/`, `src-tauri/`, framework configuration, installers, and Selenium tests remain in the checkout but are inactive and excluded from the container. Do not use the old installers or desktop build instructions.

## Features

- Students: story and nonfiction prompts, reviewed story plans, streamed chapters, library search, editing, browser print/PDF, reading text size, voice recordings, and saved preferences.
- Teachers: assigned classroom settings and student reading settings, with server-enforced roster isolation.
- Administrators: student/teacher accounts, CSV import, classroom membership, disabled accounts, activity, knowledge documents, AI endpoints and content settings.
- SQLite transactions, opaque revocable sessions, encrypted record payloads and new recordings, and atomic legacy JSON import.

Local inference is supported through an **OpenAI-compatible HTTP endpoint**, not an embedded Transformers runtime. Knowledge retrieval uses local lexical matching. Browser printing exports the currently displayed chapter. Old native desktop packaging and embedded model management are not part of this runtime.

## Tests and reports

```sh
npx playwright install chromium
npm test
npm run test:coverage
npm run coverage:report
npm run build
npm run crypto:benchmark
```

Tests use Node's built-in runner, isolated temporary SQLite databases, real HTTP requests, real cryptography, Chromium, and deterministic local provider fixtures. No production provider account is required. `coverage/report.html` and `coverage/summary.json` are generated alongside LCOV and raw browser V8 coverage. See [the verification report](docs/TEST_REPORT.md) and [WSL production-like results](docs/WSL_TEST_REPORT.md) for the actual runs, scope, and gaps.

## Production

Read [deployment and recovery](docs/DEPLOYMENT.md) and [security boundaries](docs/SECURITY.md) before deploying. Passing tests does not establish production readiness.

The [adversarial security assessment](docs/security/ASSESSMENT.md) documents confirmed fixes and remaining release blockers. Existing databases require a backed-up offline `npm run data:upgrade`; production refuses known plaintext migration JSON until `npm run data:archive-legacy` verifies and archives it.
