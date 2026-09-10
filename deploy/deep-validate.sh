#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 0077

SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=release-common.sh
source "${SCRIPT_ROOT}/release-common.sh"

EXTERNAL_LINKS=false
STAGING_CRAWL=false
COMMIT_REQUEST=""
TEMP_ROOT=""
FAILURES=()
WARNINGS=()

cleanup() {
  if [[ -n "${TEMP_ROOT}" && -d "${TEMP_ROOT}" && ! -L "${TEMP_ROOT}" ]]; then
    rm -rf -- "${TEMP_ROOT}"
  fi
}
trap cleanup EXIT

run_step() {
  local label="$1"
  shift
  log "BEGIN ${label}"
  if "$@"; then
    log "PASS ${label}"
  else
    local status=$?
    FAILURES+=("${label} (exit ${status})")
    log "FAIL ${label} (exit ${status})"
  fi
}

parse_args() {
  while [[ "$#" -gt 0 ]]; do
    case "$1" in
      --external-links) EXTERNAL_LINKS=true ;;
      --crawl) STAGING_CRAWL=true ;;
      --help|-h)
        cat <<'EOF'
Usage: ./deploy/echo validate <commit-or-ref> [--external-links] [--crawl]

Creates a disposable exact-commit tree, installs locked dependencies, runs the
full project verification suite, checks generated route/data sanity, and can
optionally check external catalog links and crawl staging.
EOF
        exit 0
        ;;
      --*) die "unknown validation option: $1" ;;
      *) [[ -z "${COMMIT_REQUEST}" ]] || die "validation accepts one commit or ref"; COMMIT_REQUEST="$1" ;;
    esac
    shift
  done
  [[ -n "${COMMIT_REQUEST}" ]] || die "validate requires a commit or ref"
}

main() {
  parse_args "$@"
  require_deployment_user
  for command_name in date env git npm node rm tar mktemp; do
    require_command "${command_name}"
  done
  fetch_source
  local commit
  commit="$(resolve_commit "${COMMIT_REQUEST}")"
  TEMP_ROOT="$(mktemp -d /tmp/echo-deep-validation.XXXXXX)"
  git -C "${SOURCE_REPO}" archive --format=tar "${commit}" | tar -x -C "${TEMP_ROOT}"
  for required_file in package.json backend/package-lock.json deploy/catalog-sanity.js; do
    [[ -f "${TEMP_ROOT}/${required_file}" ]] || {
      FAILURES+=("release is missing ${required_file}")
      continue
    }
  done
  run_step "locked dependency installation" npm --prefix "${TEMP_ROOT}/backend" ci --no-audit --no-fund
  run_step "full project verification" env -i \
    "PATH=${PATH}" \
    "HOME=${HOME:-/tmp}" \
    NODE_ENV=test \
    npm --prefix "${TEMP_ROOT}" run verify
  run_step "catalog/entity/route sanity" node "${TEMP_ROOT}/deploy/catalog-sanity.js" "${TEMP_ROOT}"

  if [[ "${EXTERNAL_LINKS}" == true ]]; then
    run_step "catalog external-link checks" npm --prefix "${TEMP_ROOT}/backend" run check:external-links -- --confirm-network
  else
    WARNINGS+=("external catalog links were not checked; pass --external-links to opt in")
  fi

  if [[ "${STAGING_CRAWL}" == true ]]; then
    run_step "broader staging crawl" "${SCRIPT_ROOT}/staging-smoke.sh" "${STAGING_URL}" --crawl
  else
    WARNINGS+=("staging-wide route crawl was not run; pass --crawl to opt in")
  fi

  echo
  echo "Deep validation summary for ${commit}"
  if ((${#FAILURES[@]} == 0)); then
    echo "RESULT: PASS"
  else
    echo "RESULT: FAIL"
    printf 'ERROR: %s\n' "${FAILURES[@]}"
  fi
  printf 'WARNING: %s\n' "${WARNINGS[@]}"
  ((${#FAILURES[@]} == 0)) || exit 1
}

main "$@"
