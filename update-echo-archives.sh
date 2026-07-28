#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CANONICAL_UPDATE="${REPO_ROOT}/deploy/update-echo-archives.sh"

if [[ ! -x "${CANONICAL_UPDATE}" ]]; then
  printf 'Update aborted: canonical deployment script is missing or not executable: %s\n' "${CANONICAL_UPDATE}" >&2
  exit 1
fi

printf 'Delegating to the only supported deployment entry point: deploy/update-echo-archives.sh\n'
exec "${CANONICAL_UPDATE}" "$@"
