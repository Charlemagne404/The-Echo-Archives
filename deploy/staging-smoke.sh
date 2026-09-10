#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${STAGING_SMOKE_BASE_URL:-https://staging.echoarchives.net}"
if [[ "$#" -gt 0 && "$1" != --* ]]; then
  BASE_URL="$1"
  shift
fi

command -v node >/dev/null 2>&1 || { echo "staging smoke: node is required" >&2; exit 1; }
exec node "${SCRIPT_ROOT}/deploy/staging-smoke.js" "${BASE_URL}" "$@"
