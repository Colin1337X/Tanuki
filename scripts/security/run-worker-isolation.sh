#!/usr/bin/env bash
set -euo pipefail
if [[ $(id -u) != 0 ]]; then echo 'Run the isolated fixture supervisor as the WSL operator.' >&2; exit 1; fi
source_root=$(cd "$(dirname "$0")/../.." && pwd)
node_binary=${TANUKI_NODE:?Set TANUKI_NODE to the verified Node runtime}
bundle=${1:?Pass the newly built worker artifact}
worker_uid=${2:?Pass the dedicated worker UID}
api_uid=${3:?Pass the non-root API UID}
export PATH="$(dirname "$node_binary"):/usr/sbin:/usr/bin:/bin"
cd "$source_root"
fixture=$("$node_binary" scripts/security/prepare-worker-isolation.mjs "$bundle" "$worker_uid" "$api_uid")
unit="$(basename "$fixture").service"
api_gid=$(getent passwd "$api_uid" | cut -d: -f4)
setpriv --reuid "$api_uid" --regid "$api_gid" --init-groups env TANUKI_WORKER_OS_FIXTURE="$fixture/app/config.json" "$node_binary" --test scripts/trusted-worker-os.test.js >"$fixture/app/test.log" 2>&1 &
test_pid=$!
finish() { systemctl stop "$unit" >/dev/null 2>&1 || true; if kill -0 "$test_pid" 2>/dev/null; then kill "$test_pid"; fi; }
trap finish EXIT
for ((i=0;i<300;i++)); do [[ -f "$fixture/app/ready.json" ]] && break; sleep 0.1; done
if [[ ! -f "$fixture/app/ready.json" ]]; then cat "$fixture/app/test.log"; exit 1; fi
if ! "$node_binary" scripts/security/control-worker-isolation.mjs "$fixture"; then
  journalctl -u "$unit" --no-pager -n 20
  cat "$fixture/app/worker-audit.log" 2>/dev/null || true
  cat "$fixture/app/test.log"
  exit 1
fi
result=0
wait "$test_pid" || result=$?
cat "$fixture/app/test.log"
printf 'Isolated worker fixture: %s\n' "$fixture"
exit "$result"
