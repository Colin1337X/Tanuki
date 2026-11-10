# Installable releases and production rollout

Tanuki ships a self-contained Node application, not a compiled rewrite of its JavaScript.
Every bundle includes the reviewed Node **24.22.2** runtime and platform-specific native
Argon2 binary. End users do not need Node, npm, a compiler, or a development checkout.

| Platform | Installer | Portable bundle |
| --- | --- | --- |
| Windows x64 | Branded native Inno Setup `.exe` | `.zip` |
| macOS Intel | Native `.pkg`, Applications launcher | `.tar.gz` |
| macOS Apple Silicon | Native arm64 `.pkg`, Applications launcher | `.tar.gz` |
| Linux x64 | `.deb` with desktop-menu launchers | `.tar.gz` |

All platforms use the same accessible Jua-based graphical setup, with a local reading-tanuki
illustration, mobile layout and keyboard navigation. The native Windows installer has matching
artwork; the macOS package provides a native welcome/conclusion and Applications launcher.
Linux packages install the setup/server desktop launchers. No package silently opens a public
port, creates a default password, enables the experimental encryption workspace, or starts a
privileged application service.

## Install and configure

![Actual Tanuki Server graphical setup wizard](screenshots/server-setup-address.png)

The [illustrated setup walkthrough](SCREENSHOTS.md#tanuki-server-graphical-installation) shows
administrator creation, review and successful provisioning with synthetic data.

For script-based **Tanuki Server GUI installation**, extract the complete portable release and
double-click `install.bat` on Windows, or run `sh install.sh` on Linux/macOS. Both verify the
release manifest and open the same local graphical wizard used by native installers. They use
the included Node runtime and never write plaintext passwords into shell configuration.
`--check` verifies files without provisioning; `--no-open` prints the private setup link for
headless access. These scripts replace the historical development installers. They do not
download or silently trust an arbitrary release, install TLS, or enable privileged services.

Android/iOS clients and signing requirements are described in [mobile clients](MOBILE.md).

1. Download the correct architecture from a reviewed release. Compare its SHA-256 with
   `SHA256SUMS.txt`; also verify the GitHub provenance attestation against this repository.
   An unsigned checksum file alone does not authenticate a compromised download source.
2. Run the native installer or extract the complete portable archive. Open **Set up Tanuki
   Stories** on Windows, **Tanuki Stories** from Applications on macOS, or **Tanuki Stories
   Setup** from the Linux desktop menu. Portable Linux/macOS bundles use `./tanuki-setup`.
3. Enter the public HTTPS origin, a private listening port, and an administrator username and
   password of at least 16 characters. A provider is optional during installation; generation
   remains unavailable until configured. Setup makes no external provider requests.
4. Setup generates the encryption keyring, hashes the administrator password with Argon2id,
   and encrypts the provider key. The password is never written to a config/environment file
   or passed through process arguments. Existing profiles are refused, including partial ones.
5. Start the server using the installed shortcut/command. It binds only to `127.0.0.1` and
   requires a TLS reverse proxy at the configured origin. `deploy/Caddyfile.example` is a
   starting point. Install/configure the proxy and DNS yourself; the installer does not claim
   to issue certificates or verify an external domain. Preserve API no-store headers and
   streaming responses. Do not expose the Node listener directly.
6. Stop the server, back up the entire profile and separately protect its keyring, then verify
   a restore on an isolated installation. Test login, logout, generation, deletion and recovery
   through the actual HTTPS domain before admitting users.

Default profiles:

- Windows: `%LOCALAPPDATA%\Tanuki Stories\profile` (ACL restricted to the installing user and SYSTEM).
- macOS: `~/Library/Application Support/Tanuki Stories/profile` (0700).
- Linux: `~/.local/share/tanuki-stories` (0700).

`TANUKI_PROFILE_DIR` chooses an explicit profile for all bundled commands. Keep it outside the
application installation directory. Application uninstall/update does not delete profiles.
Installed binaries and dependency files have a release manifest. Verify an extracted bundle:
`runtime/node scripts/release/verify.mjs .` (use `runtime\node.exe` on Windows). For a Windows
installed payload, add `--installed`, which permits only Inno's three known uninstaller files
outside the manifest. This does not replace verifying the installer signature/provenance.

To configure/change the provider later: stop Tanuki and run the bundled runtime with
`installer/provider.mjs`. It prompts for the approved HTTPS URL and hides key input; the key is
encrypted on disk. Restart after configuration. Do not put credentials into shell command
arguments. HTTPS provider trust and credential scope remain an operator responsibility.

## Linux production service

Install/extract the application at `/opt/tanuki`. Create a dedicated `tanuki` system user/group
with `/var/lib/tanuki` as its private state directory, owned by that account. Run setup as that
user with `TANUKI_PROFILE_DIR=/var/lib/tanuki/profile` and `--no-open`. For a headless host, use an
SSH local port forward using the same local and remote port printed by setup, then open the
private fragment-token link locally. Setup validates the exact Host, including that port.
Do not forward the setup listener publicly or share its token.

Review/install `deploy/tanuki-api.service` and your reverse proxy. The service uses an
unprivileged identity, read-only system paths, no capabilities, no new privileges, a private
temporary directory, core-dump suppression and bounded memory/tasks. Check those controls on
the target host. The packaged launcher clears ambient bootstrap/feature variables, so it cannot
accidentally inherit development defaults. One application process per profile is supported.

The separate trusted-worker architecture remains an advanced, separately provisioned deployment;
the packaged baseline intentionally leaves both encryption preview flags off. Use the existing
[worker deployment guide](security/TRUSTED_WORKER.md) and [PQ migration guide](security/CRYPTO_STACK.md)
for that architecture. The baseline AI path processes plaintext in the backend/provider and must
not be advertised as end-to-end encrypted.

## Build and release workflow

- `verify.yml` runs syntax checks, the full Node/Chromium coverage suite, migration/runtime tests,
  packaged-profile smoke tests, production-only dependency smoke, and actual separate-UID worker
  checks. No live provider or real account is used.
- `release.yml` runs that verification gate before building Windows x64, Linux x64, macOS x64
  and macOS arm64. Each job verifies the payload manifest and uses the **bundled runtime** to
  provision a disposable profile and test production login/default-credential rejection.
  Native package jobs then install and test the installed payload on their OS runner.
- Actions are pinned to commit SHAs; checkout credentials are not persisted. Pull-request builds
  do not publish releases or use signing credentials. Successful manual runs upload reviewable
  artifacts. Version tags produce checksums/provenance and create a **draft**, not a public release.
- To cut a candidate, update `package.json` and `package-lock.json` versions together, review the
  change, then push the matching `vX.Y.Z` tag. The build refuses a mismatched tag. Review the
  draft's checks, signatures, install/uninstall evidence and deployment acceptance before publishing.

Local build: `npm ci`, `npm run release:bundle`, `node scripts/release/verify.mjs <bundle>`,
then `npm run release:archive`. Linux/macOS native packages use
`node scripts/release/native-package.mjs` on their own OS. Windows uses the reviewed Inno Setup
compiler from its runner image, with artwork generated by `scripts/release/installer-art.mjs`
and `installer/windows/convert-art.ps1`. No cross-compiled native addon is substituted.

## Remaining release gates

Windows Authenticode credentials and Apple Developer ID signing/notarization credentials are
not present in this repository. Generated installers are unsigned candidates; GitHub provenance
does not replace OS trust signatures. Do not instruct users to disable Gatekeeper or SmartScreen.
Public desktop distribution needs those signing/notarization steps before publishing a release.

Real-host TLS/DNS, backups and restore acceptance, realistic capacity testing, administrator
recovery, and the security review of the new cryptographic envelope remain necessary. Passing
CI or producing installers does not establish production readiness. Earlier reports describe
unfinished encrypted multi-chapter/feedback/history workflows; packaging does not complete them.
