# Attack paths before and after hardening

GitHub renders the fenced `mermaid` graphs below using Mermaid. These describe **how the confirmed weaknesses could affect a live installation with the stated prerequisites**. They are not records of attacks on a real deployment: all reproduced behavior used synthetic local fixtures. See [every finding and its evidence](FINDINGS.md) and the [full assessment](ASSESSMENT.md).

## Before: reachable weaknesses at different trust boundaries

```mermaid
flowchart LR
    S["Authenticated student or former account holder"]
    T["Educator with a misconfigured managed roster"]
    A["Application administrator without operator secret access"]
    D["Attacker able to write the application database"]
    F["Attacker able to alter a recording or its backup"]
    W["Attacker able to place an asset symlink"]
    P["Redirecting or compromised AI endpoint"]
    L["Reader of retained migration files or backups"]

    S --> Q["RT-01: trailing-slash alias bypasses quota and concurrency checks"]
    S --> U["RT-02: deleted username is reissued; new account reads old story"]
    S --> R["RT-03: reset or disable occurs during verification; stale identity is accepted"]
    S --> G["RT-06: session revoked during provider call; later story still persists"]
    T --> M["RT-10: roster contains an admin; teacher reads and edits that profile"]
    A --> E["RT-07: arbitrary API origin receives the operator credential"]
    D --> I["RT-04: role, session owner or expiry edits produce unauthorized access"]
    F --> B["RT-05: altered encrypted prefix selects unauthenticated raw playback"]
    W --> K["RT-09: public asset symlink serves the private keyring"]
    P --> X["RT-08: HTTP 307 forwards a private prompt to another origin"]
    L --> C["RT-11: preserved users.json contains plaintext passwords"]

    K -.-> IMPACT["Possible downstream impact: content decryption or forged server data"]
    E -.-> IMPACT2["Possible downstream impact: provider-account misuse"]
    C -.-> IMPACT3["Possible downstream impact: reuse of still-valid credentials"]
```

Solid edges summarize behavior reproduced locally. Dotted edges are plausible downstream consequences **not separately executed as full attack chains**. RT-03 was reproduced deterministically at the real asynchronous authentication boundary, not as a timed attack against a live remote login. RT-10 changed profile settings; it did not demonstrate a teacher changing the administrator's password or role. RT-05 returned unauthenticated bytes; it did not recover plaintext by breaking AES.

## After: controls at the corresponding boundary

```mermaid
flowchart LR
    S["Student or former account holder"]
    T["Educator with a misconfigured roster"]
    A["Application administrator"]
    D["Database writer without server keys"]
    F["Recording-file modifier"]
    W["Asset-symlink writer"]
    P["Redirecting AI endpoint"]
    L["Known plaintext migration sources"]

    S --> Q["RT-01: canonical path shared by router and limits"]
    Q --> LIMIT["Quota and concurrent-request rejection"]
    S --> U["RT-02: atomic username retirement"]
    U --> NAME["Recreation denied; historical data preserved"]
    S --> R["RT-03: credential, role and version rechecked after Argon2"]
    R --> AUTH["Stale authentication refused"]
    S --> G["RT-06: live session rechecked before output or persistence"]
    G --> REVOKE["Demonstrated post-revocation write rejected"]
    T --> M["RT-10: managed target must also be a student"]
    M --> ROLE["Administrator profile access denied"]
    A --> E["RT-07: production origins approved by the operator"]
    E --> EGRESS["Unapproved request blocked before credential forwarding"]
    D --> I["RT-04: authenticated metadata, server-origin tag and guarded upgrade"]
    I --> INTEGRITY["Tampering and public-key-only forgery rejected"]
    F --> B["RT-05: authenticated format metadata and envelope checks"]
    B --> AUDIO["Damaged encrypted recording fails closed"]
    W --> K["RT-09: canonical public-root containment"]
    K --> KEY["Outside-root key target returns 404"]
    P --> X["RT-08: outbound redirects rejected"]
    X --> PROMPT["Private body not forwarded"]
    L --> C["RT-11: production startup guard and explicit verified archival"]
    C --> ARCHIVE["Source removed only after encrypted copy verifies"]
```

These are verified controls, not universal guarantees. RT-11 needs the operator to run the archive step; it cannot retract an external copy already made. Restoring historical snapshots can restore historical authorization state. The origin allowlist is not an egress firewall or DNS-pinning control. The symlink fix is not a sandbox against full service-account compromise. Existing legacy raw audio has an explicit compatibility exception.

## Inspect and reproduce

- [Finding-by-finding prerequisites, subcases and source links](FINDINGS.md)
- [Sanitized raw transcripts and provenance](evidence/README.md)
- [Actual local PoC/regression scripts and safe invocation](pocs/README.md)
- [Remaining release blockers](REMEDIATION_BACKLOG.md)

The application uses **server-side encryption, not E2EE**. Public ML-KEM keys need not be confidential; private keys and the derived server-origin authentication key must remain private. Independent review of the application-specific envelope and actual deployment infrastructure is still required.
