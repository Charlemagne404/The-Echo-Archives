#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CANONICAL_WORKFLOW="${REPO_ROOT}/deploy/echo"

if [[ ! -x "${CANONICAL_WORKFLOW}" ]]; then
  printf 'Release workflow unavailable: %s\n' "${CANONICAL_WORKFLOW}" >&2
  exit 1
fi

printf 'Delegating to the release workflow: deploy/echo\n'
exec "${CANONICAL_WORKFLOW}" "$@"
