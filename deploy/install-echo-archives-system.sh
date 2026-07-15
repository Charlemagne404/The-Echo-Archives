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
TMP_CADDYFILE="$(mktemp "${CADDYFILE}.echo.XXXXXX")"

cleanup() {
  rm -f "${TMP_CADDYFILE}"
}
trap cleanup EXIT

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

if [[ ! -x /usr/bin/node ]] || ! /usr/bin/node -e '
  const [major, minor] = process.versions.node.split(".").map(Number);
  process.exit(major > 20 || (major === 20 && minor >= 12) ? 0 : 1);
'; then
  echo "The systemd runtime at /usr/bin/node must be Node.js 20.12 or newer."
  exit 1
fi

if [[ ! -d "${REPO_ROOT}/backend/node_modules" ]]; then
  echo "Dependencies are missing under ${REPO_ROOT}/backend/node_modules."
  echo "Run 'npm --prefix ${REPO_ROOT}/backend ci --omit=dev' as charlie before installing the service."
  exit 1
fi

awk '
  BEGIN {
    skipping = 0
    depth = 0
  }
  /^(echo\.continental-hub\.com|echoarchives\.net)[[:space:]]*\{/ {
    skipping = 1
    line = $0
    opens = gsub(/\{/, "{", line)
    line = $0
    closes = gsub(/\}/, "}", line)
    depth = opens - closes
    if (depth <= 0) {
      skipping = 0
    }
    next
  }
  skipping == 1 {
    line = $0
    opens = gsub(/\{/, "{", line)
    line = $0
    closes = gsub(/\}/, "}", line)
    depth += opens - closes
    if (depth <= 0) {
      skipping = 0
    }
    next
  }
  {
    print
  }
' "${CADDYFILE}" > "${TMP_CADDYFILE}"

printf "\n" >> "${TMP_CADDYFILE}"
cat "${CADDY_SNIPPET}" >> "${TMP_CADDYFILE}"
printf "\n" >> "${TMP_CADDYFILE}"

caddy validate --config "${TMP_CADDYFILE}" --adapter caddyfile

cp "${CADDYFILE}" "${CADDYFILE}.bak.${TIMESTAMP}"
if [[ -f "${SERVICE_DEST}" ]]; then
  cp "${SERVICE_DEST}" "${SERVICE_DEST}.bak.${TIMESTAMP}"
fi

install -m 0644 "${TMP_CADDYFILE}" "${CADDYFILE}"

install -m 0644 "${SERVICE_SOURCE}" "${SERVICE_DEST}"

systemctl daemon-reload
systemctl enable echo-archives.service
systemctl restart echo-archives.service

for attempt in {1..20}; do
  if curl -fsS --max-time 5 http://127.0.0.1:3010/api/health >/dev/null; then
    break
  fi

  if [[ "${attempt}" -eq 20 ]]; then
    echo "The service did not become healthy." >&2
    systemctl --no-pager --full status echo-archives.service || true
    journalctl --unit echo-archives.service --lines 80 --no-pager || true
    exit 1
  fi

  sleep 2
done

systemctl reload caddy

echo
echo "echo-archives.service:"
systemctl --no-pager --full status echo-archives.service | sed -n '1,40p'

echo
echo "Local health check:"
curl -fsS --max-time 5 http://127.0.0.1:3010/api/health

echo
echo
echo "Caddy is configured for echoarchives.net and redirects echo.continental-hub.com permanently."
echo "Public DNS for both hosts must point at this server while the redirect is retained."
echo "Expected records should match the other live subdomains on this host instead of GitHub Pages."
