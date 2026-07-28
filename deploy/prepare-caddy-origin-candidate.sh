#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 0077

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CURRENT_CONFIG="${1:-/etc/caddy/Caddyfile}"
OUTPUT_CONFIG="${2:-}"
GLOBAL_SNIPPET="${REPO_ROOT}/deploy/Caddyfile.global.echo"
SITE_SNIPPET="${REPO_ROOT}/deploy/Caddyfile.echo"
TEMP_DIR=""

cleanup() {
  if [[ -n "${TEMP_DIR}" &&
    "${TEMP_DIR}" == /tmp/echo-caddy-origin.* &&
    -d "${TEMP_DIR}" &&
    ! -L "${TEMP_DIR}" ]]; then
    find "${TEMP_DIR}" -xdev -depth -delete
  fi
}
trap cleanup EXIT

fail() {
  echo "Caddy candidate preparation failed: $*" >&2
  exit 1
}

[[ -n "${OUTPUT_CONFIG}" ]] ||
  fail "usage: $0 CURRENT_CADDYFILE OUTPUT_CADDYFILE"
[[ -r "${CURRENT_CONFIG}" && -f "${CURRENT_CONFIG}" && ! -L "${CURRENT_CONFIG}" ]] ||
  fail "current Caddyfile must be a readable regular file, not a symlink"
[[ -r "${GLOBAL_SNIPPET}" && -r "${SITE_SNIPPET}" ]] ||
  fail "checked-in Echo Caddy snippets are missing"
[[ ! -e "${OUTPUT_CONFIG}" ]] ||
  fail "refusing to overwrite existing candidate: ${OUTPUT_CONFIG}"

first_token="$(
  awk '
    /^[[:space:]]*($|#)/ { next }
    { print $1; exit }
  ' "${CURRENT_CONFIG}"
)"
[[ "${first_token}" != "{" ]] ||
  fail "the shared Caddyfile already has global options; merge and review the Echo global snippet manually"

for command_name in awk caddy find install mktemp; do
  command -v "${command_name}" >/dev/null 2>&1 ||
    fail "required command is missing: ${command_name}"
done

TEMP_DIR="$(mktemp -d /tmp/echo-caddy-origin.XXXXXX)"
filtered_config="${TEMP_DIR}/without-echo-sites"
candidate_config="${TEMP_DIR}/candidate"

awk '
  BEGIN {
    skipping = 0
    depth = 0
  }
  /^(echo\.continental-hub\.com|www\.echoarchives\.net|echoarchives\.net)[[:space:]]*\{/ {
    skipping = 1
    line = $0
    opens = gsub(/\{/, "{", line)
    line = $0
    closes = gsub(/\}/, "}", line)
    depth = opens - closes
    if (depth <= 0) skipping = 0
    next
  }
  skipping == 1 {
    line = $0
    opens = gsub(/\{/, "{", line)
    line = $0
    closes = gsub(/\}/, "}", line)
    depth += opens - closes
    if (depth <= 0) skipping = 0
    next
  }
  { print }
' "${CURRENT_CONFIG}" > "${filtered_config}"

{
  awk '{ print }' "${GLOBAL_SNIPPET}"
  printf '\n'
  awk '{ print }' "${filtered_config}"
  printf '\n'
  awk '{ print }' "${SITE_SNIPPET}"
  printf '\n'
} > "${candidate_config}"

caddy validate --config "${candidate_config}" --adapter caddyfile
install -m 0600 "${candidate_config}" "${OUTPUT_CONFIG}"

echo "Validated shared-host Caddy candidate: ${OUTPUT_CONFIG}"
