#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CANONICAL_WORKFLOW="${SCRIPT_ROOT}/echo"

if [[ ! -x "${CANONICAL_WORKFLOW}" ]]; then
  printf 'Release workflow unavailable: %s\n' "${CANONICAL_WORKFLOW}" >&2
  exit 1
fi

if [[ "$#" -eq 0 ]]; then
  set -- deploy
fi

printf 'Delegating to the release workflow: deploy/echo\n'
exec "${CANONICAL_WORKFLOW}" "$@"
