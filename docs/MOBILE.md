# Tauri desktop and mobile clients

The shared Tauri 2 client in `src-tauri` targets Windows, macOS, Linux, Android and iOS. It connects to the same Node.js Tanuki Server used by regular modern browsers. The server installers remain separate: no server, AI worker, SQLite database or provider secret is embedded in the client.

## Connect by domain or IP

Configure one reachable HTTPS origin on the server and its reverse proxy. Open that exact address in a browser, or enter it in the app's server chooser:

- Domain: `https://stories.school.edu`
- IPv4 with a custom port: `https://192.168.1.20:8443`
- IPv6 with a custom port: `https://[2001:db8::20]:8443`

The IP examples are illustrative. Use an address reachable from the device, permit the HTTPS port through your firewall and configure a certificate valid for that domain or IP. A private certificate authority must be trusted on each device. The app does not bypass TLS verification. Loopback is not a shared network endpoint. The installed server listens privately on loopback; the reverse proxy serves the configured reachable address.

Selecting an address chooses the server; it does not create an account or grant a role. Sign in with the same account and server authorization used in the browser. No app-only API, pairing secret or subscription is required. Server-side AI generation remains independent of browser/app connectivity. The hosted UI provides the same themes, classroom access and teacher statistics.

## Client trust boundary

The bundled Jua chooser can invoke one native command to select the server. Rust validates the HTTPS origin and restricts subsequent top-level navigation to that exact scheme/host/port. Hosted pages receive no Tauri capabilities. Shell execution, local model sidecars, filesystem commands, offline mutation queues and device-identity broadcasting have been removed.

Restart the app to return to the chooser. Selecting a workspace clears the previous webview browsing data before navigation. This is intended for shared-device baseline use; client-held preview encryption keys must not be treated as durably backed up by this shell. Native permission requests and downloads are denied in this first version, so microphone recording, file downloads and encrypted key-file workflows need additional permission UX and device acceptance before being offered in the apps. Those browser features remain available through supported browsers.

The navigation policy does not constrain every server-page subresource request; the server's CSP and normal browser isolation still apply. No automatic certificate trust or native token storage is introduced. Platform webviews and their OS updates remain part of the security boundary.

## Build

Use the pinned Rust toolchain and install the platform prerequisites described by [Tauri](https://v2.tauri.app/start/prerequisites/).

```sh
npm ci --prefix clients
cargo test --manifest-path src-tauri/Cargo.toml --locked
npm run tauri -- build --ci -- --locked
npm run tauri -- android init --ci
node clients/prepare-android.mjs
# Install clients/android-security.init.gradle into a private GRADLE_USER_HOME/init.d.
npm run tauri -- android build --ci --target aarch64 --apk --aab
# On macOS with Xcode:
npm run tauri -- ios init --ci
npm run tauri -- ios build --ci --target aarch64 --no-sign --archive-only
```

`Build Tauri clients` produces Windows NSIS, Linux DEB, macOS app/DMG, Android APK/AAB and an unsigned iOS review IPA. The unsigned IPA is not installable on a physical iPhone until correctly signed/provisioned. Artifacts are candidates, never automatically published. Windows and Apple distribution require signing/notarization; Android needs a stable production signing key. Developer/store credentials are not included.

The independent audit job preserves the exact Cargo inventory and raw advisory results. GLib 0.18.5 uses the upstream iterator fix as a source-verified compatibility backport, with an optimized Linux regression. The `proc-macro-error` unmaintained advisory remains a documented build-time maintenance risk, not a claimed fix. Only these exact dispositions are recognized; new findings fail. Generated Android builds retain the reviewed Gradle/transitive overrides and a resolved Maven audit. See `src-tauri/vendor/README.md`.

The earlier hand-written Android/iOS shells and their policy tests remain under `mobile/` as migration evidence. Their [historical build guide](MOBILE_NATIVE_LEGACY.md) and screenshots do not describe the new Tauri binaries. The historical workflow is manual-only and does not produce the active client release.
