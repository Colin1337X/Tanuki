# GLib 0.18 compatibility backport

Tauri 2.12.5's GTK3 dependency requires GLib 0.18. The official GLib iterator fix is released in the incompatible 0.20 line. This directory retains the 0.18.5 crate's source, tests, benches, normalized Cargo manifest and license files with exactly two source changes: `let p` becomes `let mut p`, and the variadic C out-argument `&p` becomes `&mut p` in `src/variant_iter.rs`.

Source: https://crates.io/crates/glib/0.18.5

Upstream fix: https://github.com/gtk-rs/gtk-rs-core/pull/1343

Advisory: https://rustsec.org/advisories/RUSTSEC-2024-0429.html

`glib-integrity.json` records the original crate archive digest and the shipped file hashes (UTF-8 text with LF normalization). `clients/verify-vendor.mjs` verifies the file set and hashes before advisory review. Cargo selects this source through an explicit path patch. The optimized Linux `glib_backport` regression exercises forward/backward iteration, nth/last and full collection with actual GLib; no mock replaces the affected code.

The raw advisory inventory deliberately includes upstream GLib 0.18.5, preserving its findings. `clients/audit.mjs` recognizes only these exact advisory IDs/version after verifying the backport. Unknown findings still fail. The separate `proc-macro-error` unmaintained advisory remains an explicit maintenance risk for GTK macro compilation; it has no published fixed version and is not presented as remediated.

Remove this backport when a supported Tauri/GTK dependency chain can use the upstream patched GLib API. Do not silently regenerate hashes or extend advisory dispositions on dependency updates.
