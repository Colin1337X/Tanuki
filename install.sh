#!/bin/sh
# Run from a verified, extracted Tanuki Server release bundle.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if [ ! -x "$ROOT/runtime/node" ]; then
  echo 'Download and extract the complete Tanuki Server release for this OS first.' >&2
  echo 'This installer uses the bundled runtime; a source checkout is not a release.' >&2
  exit 1
fi
"$ROOT/runtime/node" "$ROOT/scripts/release/verify.mjs" "$ROOT"
if [ "${1:-}" = '--check' ]; then exit 0; fi
exec "$ROOT/runtime/node" "$ROOT/installer/setup.mjs" "$@"
