#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 0077

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CURRENT_CONFIG="${1:-/etc/caddy/Caddyfile}"
OUTPUT_CONFIG="${2:-}"
STAGING_SNIPPET="${REPO_ROOT}/deploy/Caddyfile.staging.echo"
TEMP_CONFIG=""

cleanup() {
  if [[ -n "${TEMP_CONFIG}" && -f "${TEMP_CONFIG}" && ! -L "${TEMP_CONFIG}" ]]; then
    rm -f -- "${TEMP_CONFIG}"
  fi
}
trap cleanup EXIT

die() {
  printf 'Staging Caddy candidate failed: %s\n' "$*" >&2
  exit 1
}

[[ -n "${OUTPUT_CONFIG}" ]] || die "usage: $0 CURRENT_CADDYFILE OUTPUT_CADDYFILE"
[[ "${CURRENT_CONFIG}" != "${OUTPUT_CONFIG}" ]] || die "candidate output must differ from the live Caddyfile"
[[ -f "${CURRENT_CONFIG}" && ! -L "${CURRENT_CONFIG}" && -r "${CURRENT_CONFIG}" ]] ||
  die "current Caddyfile must be a readable regular file, not a symlink"
[[ -f "${STAGING_SNIPPET}" && -r "${STAGING_SNIPPET}" ]] || die "missing ${STAGING_SNIPPET}"
[[ ! -e "${OUTPUT_CONFIG}" ]] || die "refusing to overwrite existing candidate: ${OUTPUT_CONFIG}"
grep -Eq '^[[:space:]]*staging\.echoarchives\.net[[:space:]]*\{' "${CURRENT_CONFIG}" &&
  die "the current Caddyfile already contains staging.echoarchives.net"

for command_name in caddy grep install mktemp rm; do
  command -v "${command_name}" >/dev/null 2>&1 || die "required command is missing: ${command_name}"
done

TEMP_CONFIG="$(mktemp /tmp/echo-staging-caddy.XXXXXX)"
{
  cat "${CURRENT_CONFIG}"
  printf '\n'
  cat "${STAGING_SNIPPET}"
  printf '\n'
} >"${TEMP_CONFIG}"

caddy validate --config "${TEMP_CONFIG}" --adapter caddyfile
install -m 0644 "${TEMP_CONFIG}" "${OUTPUT_CONFIG}"
printf 'Validated staging Caddy candidate: %s\n' "${OUTPUT_CONFIG}"
printf 'No live Caddyfile was written or reloaded.\n'
