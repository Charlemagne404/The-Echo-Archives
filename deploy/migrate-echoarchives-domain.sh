#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script with sudo." >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_USER="${APP_USER:-charlie}"
APP_GROUP="${APP_GROUP:-${APP_USER}}"
ENV_FILE="${ENV_FILE:-${REPO_ROOT}/backend/.env}"
SITE_URL="https://echoarchives.net"
LEGACY_URL="https://echo.continental-hub.com"
ENV_DIRECTORY="$(dirname "${ENV_FILE}")"
TEMP_ENV=""

cleanup() {
  rm -f "${TEMP_ENV}"
}
trap cleanup EXIT

fail() {
  echo "Domain migration aborted: $*" >&2
  exit 1
}

for command in awk caddy curl install npm; do
  command -v "${command}" >/dev/null 2>&1 || fail "required command is missing: ${command}"
done

[[ -d "${REPO_ROOT}/backend/node_modules" ]] || fail "production dependencies are missing; run npm --prefix backend ci --omit=dev first."
[[ -x "${REPO_ROOT}/deploy/install-echo-archives-system.sh" ]] || fail "missing deployment installer."

mkdir -p "${ENV_DIRECTORY}"
TEMP_ENV="$(mktemp "${ENV_FILE}.domain.XXXXXX")"

if [[ -f "${ENV_FILE}" ]]; then
  awk -v site_url="${SITE_URL}" '
    /^[[:space:]]*(export[[:space:]]+)?SITE_URL=/ {
      if (!updated) print "SITE_URL=" site_url
      updated = 1
      next
    }
    { print }
    END {
      if (!updated) print "SITE_URL=" site_url
    }
  ' "${ENV_FILE}" > "${TEMP_ENV}"
else
  printf 'SITE_URL=%s\n' "${SITE_URL}" > "${TEMP_ENV}"
fi

install -o "${APP_USER}" -g "${APP_GROUP}" -m 0600 "${TEMP_ENV}" "${ENV_FILE}"

cd "${REPO_ROOT}"
NODE_ENV=production npm run check:config
./deploy/install-echo-archives-system.sh

for attempt in {1..20}; do
  if curl --fail --silent --show-error --resolve "echoarchives.net:443:127.0.0.1" "${SITE_URL}/api/health" >/dev/null; then
    break
  fi

  if [[ "${attempt}" -eq 20 ]]; then
    fail "${SITE_URL} did not become healthy over HTTPS."
  fi

  sleep 2
done

legacy_headers="$(curl --silent --show-error --resolve "echo.continental-hub.com:443:127.0.0.1" --dump-header - --output /dev/null "${LEGACY_URL}/shows/derelict?source=legacy")"
grep -qE '^HTTP/[0-9.]+ 301' <<< "${legacy_headers}" || fail "legacy host did not return HTTP 301."
grep -qiE '^location: https://echoarchives\.net/shows/derelict\?source=legacy' <<< "${legacy_headers}" || fail "legacy redirect did not preserve the expected path and query."

echo "Domain migration complete. ${SITE_URL} is healthy and ${LEGACY_URL} redirects permanently."
