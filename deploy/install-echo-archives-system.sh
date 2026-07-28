#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script with sudo."
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_SOURCE="${REPO_ROOT}/deploy/echo-archives.service"
SERVICE_DEST="/etc/systemd/system/echo-archives.service"
RUNTIME_ACCOUNT_MIGRATION="${REPO_ROOT}/deploy/migrate-echo-archives-runtime-account.sh"
RUNTIME_ACCOUNT_READINESS="/var/lib/echo-archives-runtime-account/readiness"
JOURNAL_CONFIG_SOURCE="${REPO_ROOT}/deploy/echo-archives-journald.conf"
JOURNAL_CONFIG_DIR="/etc/systemd/journald@echo-archives.conf.d"
JOURNAL_CONFIG_DEST="${JOURNAL_CONFIG_DIR}/retention.conf"
DISCOVERY_SERVICE_SOURCE="${REPO_ROOT}/deploy/echo-archives-discovery.service"
DISCOVERY_TIMER_SOURCE="${REPO_ROOT}/deploy/echo-archives-discovery.timer"
DISCOVERY_SERVICE_DEST="/etc/systemd/system/echo-archives-discovery.service"
DISCOVERY_TIMER_DEST="/etc/systemd/system/echo-archives-discovery.timer"
BACKUP_SERVICE_SOURCE="${REPO_ROOT}/deploy/echo-archives-backup.service"
BACKUP_TIMER_SOURCE="${REPO_ROOT}/deploy/echo-archives-backup.timer"
BACKUP_SERVICE_DEST="/etc/systemd/system/echo-archives-backup.service"
BACKUP_TIMER_DEST="/etc/systemd/system/echo-archives-backup.timer"
CADDY_SNIPPET="${REPO_ROOT}/deploy/Caddyfile.echo"
CADDY_GLOBAL_SNIPPET="${REPO_ROOT}/deploy/Caddyfile.global.echo"
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

if [[ ! -x "${RUNTIME_ACCOUNT_MIGRATION}" || ! -f "${JOURNAL_CONFIG_SOURCE}" ]]; then
  echo "Missing runtime-account migration or isolated-journal configuration."
  exit 1
fi

if ! id echo-archives >/dev/null 2>&1 || [[ ! -f "${RUNTIME_ACCOUNT_READINESS}" ]]; then
  echo "The dedicated runtime-account migration has not been completed." >&2
  echo "Review and run: sudo ${RUNTIME_ACCOUNT_MIGRATION} --apply" >&2
  exit 1
fi

if [[ ! -f "${DISCOVERY_SERVICE_SOURCE}" || ! -f "${DISCOVERY_TIMER_SOURCE}" ]]; then
  echo "Missing discovery service templates."
  exit 1
fi

if [[ ! -f "${BACKUP_SERVICE_SOURCE}" || ! -f "${BACKUP_TIMER_SOURCE}" ]]; then
  echo "Missing backup service templates."
  exit 1
fi

if [[ ! -f "${CADDY_SNIPPET}" ]]; then
  echo "Missing Caddy snippet: ${CADDY_SNIPPET}"
  exit 1
fi

if [[ ! -f "${CADDY_GLOBAL_SNIPPET}" ]]; then
  echo "Missing Caddy global-options snippet: ${CADDY_GLOBAL_SNIPPET}"
  exit 1
fi

if [[ ! -f "${CADDYFILE}" ]]; then
  echo "Missing Caddyfile: ${CADDYFILE}"
  exit 1
fi

for required_setting in \
  "trusted_proxies_strict" \
  "client_ip_headers CF-Connecting-IP" \
  "strict_sni_host on"; do
  if ! grep -Fq "${required_setting}" "${CADDYFILE}"; then
    echo "The shared Caddyfile is missing: ${required_setting}" >&2
    echo "Review and merge ${CADDY_GLOBAL_SNIPPET} into its single leading global options block first." >&2
    echo "Do not append a second global block or apply it without testing every co-hosted service." >&2
    exit 1
  fi
done

if [[ ! -x /usr/bin/node ]] || ! /usr/bin/node -e '
  const [major, minor] = process.versions.node.split(".").map(Number);
  process.exit(major > 22 || (major === 22 && minor >= 12) ? 0 : 1);
'; then
  echo "The systemd runtime at /usr/bin/node must be Node.js 22.12 or newer."
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
  /^(echo\.continental-hub\.com|www\.echoarchives\.net|echoarchives\.net)[[:space:]]*\{/ {
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
for unit_path in "${SERVICE_DEST}" "${JOURNAL_CONFIG_DEST}" "${DISCOVERY_SERVICE_DEST}" "${DISCOVERY_TIMER_DEST}" "${BACKUP_SERVICE_DEST}" "${BACKUP_TIMER_DEST}"; do
  if [[ -f "${unit_path}" ]]; then
    cp "${unit_path}" "${unit_path}.bak.${TIMESTAMP}"
  fi
done

install -m 0644 "${TMP_CADDYFILE}" "${CADDYFILE}"

install -d -m 0755 "${JOURNAL_CONFIG_DIR}"
install -m 0644 "${JOURNAL_CONFIG_SOURCE}" "${JOURNAL_CONFIG_DEST}"
install -m 0644 "${SERVICE_SOURCE}" "${SERVICE_DEST}"
install -m 0644 "${DISCOVERY_SERVICE_SOURCE}" "${DISCOVERY_SERVICE_DEST}"
install -m 0644 "${DISCOVERY_TIMER_SOURCE}" "${DISCOVERY_TIMER_DEST}"
install -m 0644 "${BACKUP_SERVICE_SOURCE}" "${BACKUP_SERVICE_DEST}"
install -m 0644 "${BACKUP_TIMER_SOURCE}" "${BACKUP_TIMER_DEST}"

systemctl daemon-reload
systemctl try-restart systemd-journald@echo-archives.service
systemctl enable echo-archives.service
systemctl enable --now echo-archives-discovery.timer
systemctl restart echo-archives.service

for attempt in {1..20}; do
  if curl -fsS --max-time 5 http://127.0.0.1:3010/api/health >/dev/null; then
    break
  fi

  if [[ "${attempt}" -eq 20 ]]; then
    echo "The service did not become healthy." >&2
    systemctl --no-pager --full status echo-archives.service || true
    journalctl --namespace=echo-archives --unit echo-archives.service \
      --lines 80 --no-pager || true
    exit 1
  fi

  sleep 2
done

"${RUNTIME_ACCOUNT_MIGRATION}" --check

systemctl enable --now echo-archives-backup.timer
systemctl reload caddy

echo
echo "echo-archives.service:"
systemctl --no-pager --full status echo-archives.service | sed -n '1,40p'

echo
echo "Local health check:"
curl -fsS --max-time 5 http://127.0.0.1:3010/api/health

echo
echo
echo "Scheduled maintenance timers:"
systemctl list-timers echo-archives-backup.timer echo-archives-discovery.timer --no-pager

echo
echo
echo "Caddy is configured for echoarchives.net and redirects www.echoarchives.net and echo.continental-hub.com permanently."
echo "Public DNS for all three hosts must point at this server while the redirects are retained."
echo "Expected records should match the other live subdomains on this host instead of GitHub Pages."
