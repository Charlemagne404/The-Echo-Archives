#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script with sudo."
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_SOURCE="${REPO_ROOT}/deploy/echo-archives.service"
SERVICE_DEST="/etc/systemd/system/echo-archives.service"
CADDY_SNIPPET="${REPO_ROOT}/deploy/Caddyfile.echo"
CADDYFILE="/etc/caddy/Caddyfile"
TIMESTAMP="$(date +%Y%m%d%H%M%S)"
TMP_CADDYFILE="$(mktemp)"

if [[ ! -f "${SERVICE_SOURCE}" ]]; then
  echo "Missing service template: ${SERVICE_SOURCE}"
  exit 1
fi

if [[ ! -f "${CADDY_SNIPPET}" ]]; then
  echo "Missing Caddy snippet: ${CADDY_SNIPPET}"
  exit 1
fi

if [[ ! -f "${CADDYFILE}" ]]; then
  echo "Missing Caddyfile: ${CADDYFILE}"
  exit 1
fi

if [[ ! -d "${REPO_ROOT}/backend/node_modules" ]]; then
  echo "Dependencies are missing under ${REPO_ROOT}/backend/node_modules."
  echo "Run 'cd ${REPO_ROOT}/backend && npm install' as charlie before installing the service."
  exit 1
fi

cp "${CADDYFILE}" "${CADDYFILE}.bak.${TIMESTAMP}"

awk '
  BEGIN {
    skipping = 0
  }
  /^echo\.continental-hub\.com[[:space:]]*\{/ {
    skipping = 1
    next
  }
  skipping == 1 {
    if ($0 ~ /^[[:space:]]*}[[:space:]]*$/) {
      skipping = 0
    }
    next
  }
  {
    print
  }
' "${CADDYFILE}" > "${TMP_CADDYFILE}"

{
  cat "${TMP_CADDYFILE}"
  printf "\n"
  cat "${CADDY_SNIPPET}"
  printf "\n"
} > "${CADDYFILE}"

rm -f "${TMP_CADDYFILE}"

install -m 0644 "${SERVICE_SOURCE}" "${SERVICE_DEST}"

caddy validate --config "${CADDYFILE}"
systemctl daemon-reload
systemctl enable --now echo-archives.service
systemctl restart echo-archives.service
systemctl reload caddy

sleep 2

echo
echo "echo-archives.service:"
systemctl --no-pager --full status echo-archives.service | sed -n '1,40p'

echo
echo "Local health check:"
curl -fsS http://127.0.0.1:3010/api/health

echo
echo
echo "Caddy is configured for echo.continental-hub.com."
echo "Public DNS still needs to point echo.continental-hub.com at this server."
echo "Expected records should match the other live subdomains on this host instead of GitHub Pages."
