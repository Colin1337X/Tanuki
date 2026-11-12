#!/usr/bin/env bash
# GitHub's Azure mirror can stall dependency installation before tests run.
# Keep Ubuntu's signed repositories; change only the mirror and bound retries.
set -euo pipefail
if [[ ! -f /etc/os-release ]]; then echo "Unsupported CI host" >&2; exit 1; fi
. /etc/os-release
if [[ "$ID" != ubuntu ]]; then echo "Ubuntu runner required" >&2; exit 1; fi
shopt -s nullglob
sources=(/etc/apt/sources.list /etc/apt/sources.list.d/*.list /etc/apt/sources.list.d/*.sources)
for source in "${sources[@]}"; do
  [[ -f "$source" ]] || continue
  sudo sed -i 's|http://azure.archive.ubuntu.com/ubuntu|https://archive.ubuntu.com/ubuntu|g;s|https://azure.archive.ubuntu.com/ubuntu|https://archive.ubuntu.com/ubuntu|g' "$source"
done
printf '%s\n' 'Acquire::Retries "3";' 'Acquire::http::Timeout "30";' 'Acquire::https::Timeout "30";' | sudo tee /etc/apt/apt.conf.d/80-tanuki-ci-network >/dev/null
sudo apt-get update -o APT::Update::Error-Mode=any
