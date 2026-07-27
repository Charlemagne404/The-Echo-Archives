#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 0077

APP_USER="charlie"
APP_GROUP="charlie"
APP_HOME="/home/charlie"
SERVICE_NAME="echo-archives.service"
BACKUP_TIMER="echo-archives-backup.timer"
DISCOVERY_TIMER="echo-archives-discovery.timer"
LOCAL_HEALTH_URL="http://127.0.0.1:3010/api/health"
PUBLIC_ORIGIN="https://echoarchives.net"
LEGACY_ORIGIN="https://echo.continental-hub.com"
AUTH_SERVICE_UNIT="/home/charlie/.config/systemd/user/continental-id-auth.service"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd -P)"
BACKEND_ROOT="${REPO_ROOT}/backend"
CADDYFILE="/etc/caddy/Caddyfile"
CADDY_SNIPPET="${REPO_ROOT}/deploy/Caddyfile.echo"

SERVICE_SOURCE="${REPO_ROOT}/deploy/echo-archives.service"
BACKUP_SERVICE_SOURCE="${REPO_ROOT}/deploy/echo-archives-backup.service"
BACKUP_TIMER_SOURCE="${REPO_ROOT}/deploy/echo-archives-backup.timer"
DISCOVERY_SERVICE_SOURCE="${REPO_ROOT}/deploy/echo-archives-discovery.service"
DISCOVERY_TIMER_SOURCE="${REPO_ROOT}/deploy/echo-archives-discovery.timer"

SERVICE_DEST="/etc/systemd/system/echo-archives.service"
BACKUP_SERVICE_DEST="/etc/systemd/system/echo-archives-backup.service"
BACKUP_TIMER_DEST="/etc/systemd/system/echo-archives-backup.timer"
DISCOVERY_SERVICE_DEST="/etc/systemd/system/echo-archives-discovery.service"
DISCOVERY_TIMER_DEST="/etc/systemd/system/echo-archives-discovery.timer"

EXPECTED_BACKEND_PACKAGE_SHA="8058043170b0936023435ebd03d556de916eb1c1528b3b411456d02b84627fea"
EXPECTED_BACKEND_LOCK_SHA="4b6fb301cf0b33a343e604f28e1939136959be325a546af5a4abad4285d03240"
EXPECTED_CADDY_SNIPPET_SHA="8981a3d0164b1e2e6a0ddc357f5859bfb3026b0d8d9e6be454cea283787a29f1"
EXPECTED_SERVICE_SHA="203ec9acd241f67b37016bf6b5312e4d3f1ecdbafb94b23cb7d0fede70bbb1f8"
EXPECTED_BACKUP_SERVICE_SHA="57db3b0dc3aa1c031e9250e9d0b9c6aa5c493e73ef5c92190d4c88e543d407eb"
EXPECTED_BACKUP_TIMER_SHA="5b1d3d192f8e4802a2a8f1afc5fcf1dfac13908d11335f47c99f666f9be8672b"
EXPECTED_DISCOVERY_SERVICE_SHA="28c0d5d4da084d03fec544daab6028cbbecc8fe9751592fb6f58b72e8f3b7f2f"
EXPECTED_DISCOVERY_TIMER_SHA="62c8bb91e6830bdb4bbd21ae0f56516b9e575ff1a998715649db7b1bbc0f9eee"
ALLOWED_APT_REMOVAL="netdata-plugin-otel-signal-viewer"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_DIR="/var/log/echo-archives"
LOG_FILE="${LOG_DIR}/production-host-maintenance-${TIMESTAMP}.log"
BACKUP_ROOT="/var/backups/echo-archives-maintenance"
BACKUP_DIR="${BACKUP_ROOT}/${TIMESTAMP}"

CADDY_CANDIDATE=""
CERTIFICATE_PROBE=""
DEPENDENCY_STAGE=""
APT_PLAN=""
NODE_MODULES_BACKUP=""
DEPLOYMENT_STARTED=0
DEPLOYMENT_COMMITTED=0
ROLLBACK_RUNNING=0

CONFIG_DESTINATIONS=(
  "${CADDYFILE}"
  "${SERVICE_DEST}"
  "${BACKUP_SERVICE_DEST}"
  "${BACKUP_TIMER_DEST}"
  "${DISCOVERY_SERVICE_DEST}"
  "${DISCOVERY_TIMER_DEST}"
)

log() {
  printf '[%s] %s\n' "$(date --iso-8601=seconds)" "$*"
}

cleanup_temporary_files() {
  if [[ -n "${CADDY_CANDIDATE}" && "${CADDY_CANDIDATE}" == /tmp/echo-archives-caddy.* ]]; then
    rm -f -- "${CADDY_CANDIDATE}"
  fi
  if [[ -n "${CERTIFICATE_PROBE}" && "${CERTIFICATE_PROBE}" == /tmp/echo-archives-cert.* ]]; then
    rm -f -- "${CERTIFICATE_PROBE}"
  fi
  if [[ -n "${APT_PLAN}" && "${APT_PLAN}" == /tmp/echo-archives-apt.* ]]; then
    rm -f -- "${APT_PLAN}"
  fi
  if [[ -n "${DEPENDENCY_STAGE}" && "${DEPENDENCY_STAGE}" == "${REPO_ROOT}"/.maintenance-deps.* ]]; then
    rm -rf -- "${DEPENDENCY_STAGE}"
  fi
}

restore_file_from_backup() {
  local destination="$1"
  local backup_name
  backup_name="$(printf '%s' "${destination#/}" | tr '/' '_')"
  if [[ -f "${BACKUP_DIR}/${backup_name}" ]]; then
    cp -a -- "${BACKUP_DIR}/${backup_name}" "${destination}"
  fi
}

rollback_deployment() {
  if (( ROLLBACK_RUNNING == 1 || DEPLOYMENT_STARTED == 0 || DEPLOYMENT_COMMITTED == 1 )); then
    return 0
  fi

  ROLLBACK_RUNNING=1
  set +e
  log "Deployment did not commit; restoring the previous application files and configuration."

  if [[ -n "${NODE_MODULES_BACKUP}" && -d "${NODE_MODULES_BACKUP}" ]]; then
    if [[ -d "${BACKEND_ROOT}/node_modules" ]]; then
      mv -- "${BACKEND_ROOT}/node_modules" "${BACKUP_DIR}/node_modules.failed"
    fi
    mv -- "${NODE_MODULES_BACKUP}" "${BACKEND_ROOT}/node_modules"
  fi

  local destination
  for destination in "${CONFIG_DESTINATIONS[@]}"; do
    restore_file_from_backup "${destination}"
  done

  systemctl daemon-reload
  if caddy validate --config "${CADDYFILE}" --adapter caddyfile; then
    systemctl reload caddy.service
  fi
  systemctl restart "${SERVICE_NAME}"
  curl --fail --silent --show-error --max-time 10 "${LOCAL_HEALTH_URL}" >/dev/null
  log "Rollback attempt completed. Inspect ${LOG_FILE} and ${BACKUP_DIR} before retrying."
  set -e
}

on_error() {
  local status="$?"
  local line="$1"
  trap - ERR
  rollback_deployment
  cleanup_temporary_files
  log "Maintenance failed at line ${line} with exit status ${status}."
  exit "${status}"
}

die() {
  log "ERROR: $*"
  rollback_deployment
  cleanup_temporary_files
  exit 1
}

trap 'on_error "${LINENO}"' ERR
trap cleanup_temporary_files EXIT

if [[ "${EUID}" -ne 0 ]]; then
  printf 'Run this script with sudo.\n' >&2
  exit 1
fi

install -d -m 0750 -o root -g adm "${LOG_DIR}"
touch "${LOG_FILE}"
chmod 0600 "${LOG_FILE}"
exec > >(tee -a "${LOG_FILE}") 2>&1

exec 9>"/run/lock/echo-archives-production-maintenance.lock"
flock -n 9 || die "Another Echo Archives maintenance process is already running."

require_command() {
  local command_name="$1"
  command -v "${command_name}" >/dev/null 2>&1 || die "Required command is missing: ${command_name}"
}

for command_name in \
  apt apt-get awk basename caddy cat chmod chown cp curl date df dirname env find \
  flock grep id install lsof mktemp mv nft npm openssl pgrep readlink rg rm runuser \
  sed sha256sum sleep ss stat systemctl systemd-analyze tail tee touch tr ufw; do
  require_command "${command_name}"
done
[[ -x /usr/bin/node ]] || die "Required executable is missing: /usr/bin/node"
[[ -x /usr/bin/npm ]] || die "Required executable is missing: /usr/bin/npm"

if [[ ! -r /etc/os-release ]]; then
  die "Cannot read /etc/os-release."
fi
# shellcheck source=/etc/os-release
source /etc/os-release
if [[ "${ID:-}" != "ubuntu" ]]; then
  die "This reviewed maintenance script only supports Ubuntu."
fi

if ! id "${APP_USER}" >/dev/null 2>&1; then
  die "Application user does not exist: ${APP_USER}"
fi
if [[ "$(id -gn "${APP_USER}")" != "${APP_GROUP}" ]]; then
  die "Application user's primary group is not ${APP_GROUP}."
fi
if [[ "${REPO_ROOT}" != "${APP_HOME}/The-Echo-Archives" ]]; then
  die "Unexpected repository path: ${REPO_ROOT}"
fi

run_as_app() {
  runuser -u "${APP_USER}" -- env \
    HOME="${APP_HOME}" \
    PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/snap/bin" \
    "$@"
}

assert_reviewed_file() {
  local path="$1"
  local expected_sha="$2"
  local actual_sha
  [[ -f "${path}" ]] || die "Reviewed input is missing: ${path}"
  actual_sha="$(sha256sum "${path}" | awk '{print $1}')"
  if [[ "${actual_sha}" != "${expected_sha}" ]]; then
    die "Reviewed input changed after script review: ${path}"
  fi
}

wait_for_health() {
  local url="$1"
  local label="$2"
  local attempts="${3:-20}"
  local attempt
  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    if curl --fail --silent --show-error --max-time 8 "${url}" >/dev/null; then
      log "${label} passed."
      return 0
    fi
    sleep 2
  done
  return 1
}

wait_for_origin_https() {
  local host="$1"
  local path="$2"
  local attempts="${3:-20}"
  local attempt
  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    if curl \
      --fail \
      --silent \
      --show-error \
      --max-time 10 \
      --resolve "${host}:443:127.0.0.1" \
      "https://${host}${path}" >/dev/null; then
      return 0
    fi
    sleep 3
  done
  return 1
}

compose_caddy_candidate() {
  CADDY_CANDIDATE="$(mktemp /tmp/echo-archives-caddy.XXXXXX)"
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
  ' "${CADDYFILE}" > "${CADDY_CANDIDATE}"
  printf '\n' >> "${CADDY_CANDIDATE}"
  cat "${CADDY_SNIPPET}" >> "${CADDY_CANDIDATE}"
  printf '\n' >> "${CADDY_CANDIDATE}"
  chmod 0600 "${CADDY_CANDIDATE}"
}

verify_certbot_is_obsolete() {
  log "Verifying that the legacy Certbot certificate has no active consumer."

  local -a renewal_files=()
  mapfile -t renewal_files < <(find /etc/letsencrypt/renewal -maxdepth 1 -type f -name '*.conf' -print)
  if (( ${#renewal_files[@]} != 1 )) || [[ "$(basename -- "${renewal_files[0]}")" != "mpmc.ddns.net.conf" ]]; then
    die "Certbot usage is uncertain: expected only mpmc.ddns.net.conf under /etc/letsencrypt/renewal."
  fi

  if systemctl is-active --quiet nginx.service || pgrep -x nginx >/dev/null 2>&1; then
    die "Certbot usage is uncertain: nginx is active."
  fi
  if [[ "$(systemctl is-enabled nginx.service 2>/dev/null || true)" != "masked" ]]; then
    die "Certbot usage is uncertain: nginx.service is not masked."
  fi
  if systemctl is-active --quiet apache2.service || pgrep -x apache2 >/dev/null 2>&1; then
    die "Certbot usage is uncertain: Apache is active."
  fi

  if ! grep -qE '^[[:space:]]*authenticator[[:space:]]*=[[:space:]]*nginx[[:space:]]*$' "${renewal_files[0]}"; then
    die "Certbot usage is uncertain: the sole renewal configuration is not the obsolete nginx authenticator."
  fi
  if ! grep -qE '^[[:space:]]*installer[[:space:]]*=[[:space:]]*nginx[[:space:]]*$' "${renewal_files[0]}"; then
    die "Certbot usage is uncertain: the sole renewal configuration is not the obsolete nginx installer."
  fi

  if rg -l --hidden \
    '/etc/letsencrypt/live/mpmc\.ddns\.net/(fullchain|privkey)\.pem' \
    /etc/systemd/system /home/charlie/.config/systemd/user /etc/cron.d /etc/cron.daily \
    2>/dev/null | grep -q .; then
    die "Certbot usage is uncertain: an active configuration directory references the legacy certificate."
  fi

  [[ -f "${AUTH_SERVICE_UNIT}" ]] || die "Cannot verify the active authentication service transport."
  grep -qFx 'Environment=HTTPS_KEY_PATH=/nonexistent' "${AUTH_SERVICE_UNIT}" ||
    die "Certbot usage is uncertain: auth service does not explicitly disable direct TLS."
  grep -qFx 'Environment=HTTPS_CERT_PATH=/nonexistent' "${AUTH_SERVICE_UNIT}" ||
    die "Certbot usage is uncertain: auth service does not explicitly disable direct TLS."
  ss -ltnp | grep -Eq '127\.0\.0\.1:5000[[:space:]].*node' ||
    die "Cannot verify the auth service HTTP loopback listener."

  grep -qE '^mpmc\.ddns\.net[[:space:]]*\{' "${CADDYFILE}" ||
    die "Caddy is not configured to own mpmc.ddns.net."
  if grep -q '/etc/letsencrypt' "${CADDYFILE}"; then
    die "Certbot usage is uncertain: Caddy references /etc/letsencrypt."
  fi

  local open_cert_files
  open_cert_files="$(lsof +D /etc/letsencrypt/live/mpmc.ddns.net 2>/dev/null || true)"
  if [[ -n "${open_cert_files}" ]]; then
    die "Certbot usage is uncertain: a process has the legacy certificate directory open."
  fi

  CERTIFICATE_PROBE="$(mktemp /tmp/echo-archives-cert.XXXXXX)"
  if ! openssl s_client \
    -connect 127.0.0.1:443 \
    -servername mpmc.ddns.net \
    -verify_return_error \
    </dev/null 2>/dev/null |
    openssl x509 -outform PEM -out "${CERTIFICATE_PROBE}"; then
    die "Could not retrieve Caddy's active certificate for mpmc.ddns.net."
  fi
  openssl x509 -checkend 604800 -noout -in "${CERTIFICATE_PROBE}" ||
    die "Caddy's active mpmc.ddns.net certificate expires within seven days."
  openssl x509 -noout -ext subjectAltName -in "${CERTIFICATE_PROBE}" |
    grep -q 'DNS:mpmc.ddns.net' ||
    die "Caddy's active certificate does not cover mpmc.ddns.net."

  log "Certbot is obsolete: nginx is masked/inactive, the auth service is HTTP-only on loopback, and Caddy owns a valid mpmc.ddns.net certificate."
}

backup_configuration() {
  install -d -m 0700 -o root -g root "${BACKUP_ROOT}" "${BACKUP_DIR}"
  local destination
  local backup_name
  for destination in "${CONFIG_DESTINATIONS[@]}"; do
    [[ -f "${destination}" ]] || die "Required live configuration is missing: ${destination}"
    backup_name="$(printf '%s' "${destination#/}" | tr '/' '_')"
    cp -a -- "${destination}" "${BACKUP_DIR}/${backup_name}"
  done
  sha256sum "${BACKUP_DIR}"/* > "${BACKUP_DIR}/configuration.sha256"
  ufw status verbose > "${BACKUP_DIR}/ufw-before.txt"
  nft list ruleset > "${BACKUP_DIR}/nftables-before.txt"
  ss -lntup > "${BACKUP_DIR}/listeners-before.txt"
  systemctl list-timers --all --no-pager > "${BACKUP_DIR}/timers-before.txt"
  log "Configuration and state snapshots saved under ${BACKUP_DIR}."
}

stage_production_dependencies() {
  DEPENDENCY_STAGE="$(mktemp -d "${REPO_ROOT}/.maintenance-deps.XXXXXX")"
  chown "${APP_USER}:${APP_GROUP}" "${DEPENDENCY_STAGE}"
  install -m 0644 -o "${APP_USER}" -g "${APP_GROUP}" \
    "${BACKEND_ROOT}/package.json" "${DEPENDENCY_STAGE}/package.json"
  install -m 0644 -o "${APP_USER}" -g "${APP_GROUP}" \
    "${BACKEND_ROOT}/package-lock.json" "${DEPENDENCY_STAGE}/package-lock.json"

  log "Installing the reviewed production lockfile into an isolated staging directory."
  run_as_app /usr/bin/npm --prefix "${DEPENDENCY_STAGE}" ci --omit=dev --no-audit --no-fund
  run_as_app /usr/bin/npm --prefix "${DEPENDENCY_STAGE}" ls --omit=dev --depth=0
  run_as_app /usr/bin/npm --prefix "${DEPENDENCY_STAGE}" audit --omit=dev
  run_as_app env NODE_PATH="${DEPENDENCY_STAGE}/node_modules" /usr/bin/node -e \
    "require('better-sqlite3'); require('sharp'); require('express');"
}

apply_deployment() {
  DEPLOYMENT_STARTED=1

  NODE_MODULES_BACKUP="${BACKUP_DIR}/node_modules.previous"
  [[ -d "${BACKEND_ROOT}/node_modules" ]] ||
    die "Live backend/node_modules is missing; refusing an unsafe in-place dependency replacement."
  mv -- "${BACKEND_ROOT}/node_modules" "${NODE_MODULES_BACKUP}"
  mv -- "${DEPENDENCY_STAGE}/node_modules" "${BACKEND_ROOT}/node_modules"
  chown -R "${APP_USER}:${APP_GROUP}" "${BACKEND_ROOT}/node_modules"

  install -m 0644 "${CADDY_CANDIDATE}" "${CADDYFILE}"
  install -m 0644 "${SERVICE_SOURCE}" "${SERVICE_DEST}"
  install -m 0644 "${BACKUP_SERVICE_SOURCE}" "${BACKUP_SERVICE_DEST}"
  install -m 0644 "${BACKUP_TIMER_SOURCE}" "${BACKUP_TIMER_DEST}"
  install -m 0644 "${DISCOVERY_SERVICE_SOURCE}" "${DISCOVERY_SERVICE_DEST}"
  install -m 0644 "${DISCOVERY_TIMER_SOURCE}" "${DISCOVERY_TIMER_DEST}"

  systemctl daemon-reload
  caddy validate --config "${CADDYFILE}" --adapter caddyfile
  run_as_app env NODE_ENV=production /usr/bin/npm --prefix "${REPO_ROOT}" run check:config

  systemctl enable "${SERVICE_NAME}"
  systemctl restart "${SERVICE_NAME}"
  wait_for_health "${LOCAL_HEALTH_URL}" "Local application health" 20 ||
    die "The application did not become healthy after restart."

  systemctl enable --now "${BACKUP_TIMER}" "${DISCOVERY_TIMER}"
  systemctl reload caddy.service

  wait_for_origin_https "echoarchives.net" "/api/health" 20 ||
    die "Caddy could not serve the local HTTPS application health check."
  wait_for_origin_https "www.echoarchives.net" "/maintenance-probe" 20 ||
    die "Caddy could not obtain or serve the www.echoarchives.net certificate."

  local www_headers="${BACKUP_DIR}/www-origin-headers.txt"
  local legacy_headers="${BACKUP_DIR}/legacy-origin-headers.txt"
  curl --silent --show-error --max-time 10 \
    --resolve "www.echoarchives.net:443:127.0.0.1" \
    --dump-header "${www_headers}" --output /dev/null \
    "https://www.echoarchives.net/maintenance-probe?source=host"
  grep -qiE '^HTTP/[0-9.]+ (301|308)' "${www_headers}" ||
    die "The local www origin did not return a permanent redirect."
  grep -qiE '^location: https://echoarchives\.net/maintenance-probe\?source=host' "${www_headers}" ||
    die "The local www redirect did not preserve path and query."

  curl --silent --show-error --max-time 10 \
    --resolve "echo.continental-hub.com:443:127.0.0.1" \
    --dump-header "${legacy_headers}" --output /dev/null \
    "${LEGACY_ORIGIN}/maintenance-probe?source=legacy"
  grep -qiE '^HTTP/[0-9.]+ (301|308)' "${legacy_headers}" ||
    die "The local legacy origin did not return a permanent redirect."
  grep -qiE '^location: https://echoarchives\.net/maintenance-probe\?source=legacy' "${legacy_headers}" ||
    die "The local legacy redirect did not preserve path and query."

  DEPLOYMENT_COMMITTED=1
  log "Validated application and Caddy deployment committed."
}

post_deployment_checks() {
  log "Running public health and redirect checks."
  wait_for_health "${PUBLIC_ORIGIN}/api/health" "Public application health" 15 ||
    die "Public application health failed."

  local public_www_headers="${BACKUP_DIR}/www-public-headers.txt"
  local attempt
  for ((attempt = 1; attempt <= 15; attempt += 1)); do
    if curl --silent --show-error --max-time 15 \
      --dump-header "${public_www_headers}" --output /dev/null \
      "https://www.echoarchives.net/maintenance-probe?source=public" &&
      grep -qiE '^HTTP/[0-9.]+ (301|308)' "${public_www_headers}"; then
      break
    fi
    sleep 3
  done
  grep -qiE '^HTTP/[0-9.]+ (301|308)' "${public_www_headers}" ||
    die "Public www did not return a permanent redirect."
  grep -qiE '^location: https://echoarchives\.net/maintenance-probe\?source=public' "${public_www_headers}" ||
    die "Public www redirect did not preserve path and query."

  local public_homepage="${BACKUP_DIR}/apex-public-homepage.html"
  curl --fail --silent --show-error --max-time 15 \
    --output "${public_homepage}" "${PUBLIC_ORIGIN}/" ||
    die "Public apex homepage request failed."
  grep -q 'The Echo Archives' "${public_homepage}" ||
    die "Public apex did not serve the intended application."
}

report_host_state() {
  log "UFW status (no firewall rules are changed by this script):"
  local ufw_output
  ufw_output="$(ufw status verbose)"
  printf '%s\n' "${ufw_output}"
  grep -qi '^Status: active' <<<"${ufw_output}" || die "UFW is not active."
  grep -qi 'Default: deny (incoming)' <<<"${ufw_output}" ||
    die "UFW default incoming policy is not deny."
  ufw status numbered

  log "nftables ruleset:"
  nft list ruleset

  log "Listening sockets:"
  ss -lntup
  ss -ltn | grep -Eq '127\.0\.0\.1:3010[[:space:]]' ||
    die "Echo Archives is not bound to loopback port 3010."

  log "Required services and timers:"
  systemctl is-enabled "${SERVICE_NAME}" caddy.service "${BACKUP_TIMER}" "${DISCOVERY_TIMER}"
  systemctl is-active "${SERVICE_NAME}" caddy.service "${BACKUP_TIMER}" "${DISCOVERY_TIMER}"
  systemctl list-timers "${BACKUP_TIMER}" "${DISCOVERY_TIMER}" --no-pager
  local failed_units
  failed_units="$(systemctl --failed --no-legend --plain)"
  if [[ -n "${failed_units}" ]]; then
    printf '%s\n' "${failed_units}"
    die "One or more systemd units are failed."
  fi
  systemctl --failed --no-pager

  log "Pending package upgrades after maintenance:"
  apt list --upgradable 2>/dev/null || true

  if [[ -e /run/reboot-required ]]; then
    log "REBOOT REQUIRED. This script will not reboot automatically."
    if [[ -r /run/reboot-required.pkgs ]]; then
      sed -n '1,120p' /run/reboot-required.pkgs
    fi
  else
    log "No reboot is currently required."
  fi

  df -hT "${REPO_ROOT}"
  systemctl show "${SERVICE_NAME}" \
    -p ActiveState -p SubState -p MainPID -p NRestarts -p MemoryCurrent -p Result \
    --no-pager
}

log "Beginning reviewed production-host maintenance."
log "Repository: ${REPO_ROOT}"
log "Log: ${LOG_FILE}"

assert_reviewed_file "${BACKEND_ROOT}/package.json" "${EXPECTED_BACKEND_PACKAGE_SHA}"
assert_reviewed_file "${BACKEND_ROOT}/package-lock.json" "${EXPECTED_BACKEND_LOCK_SHA}"
assert_reviewed_file "${CADDY_SNIPPET}" "${EXPECTED_CADDY_SNIPPET_SHA}"
assert_reviewed_file "${SERVICE_SOURCE}" "${EXPECTED_SERVICE_SHA}"
assert_reviewed_file "${BACKUP_SERVICE_SOURCE}" "${EXPECTED_BACKUP_SERVICE_SHA}"
assert_reviewed_file "${BACKUP_TIMER_SOURCE}" "${EXPECTED_BACKUP_TIMER_SHA}"
assert_reviewed_file "${DISCOVERY_SERVICE_SOURCE}" "${EXPECTED_DISCOVERY_SERVICE_SHA}"
assert_reviewed_file "${DISCOVERY_TIMER_SOURCE}" "${EXPECTED_DISCOVERY_TIMER_SHA}"

[[ -f "${BACKEND_ROOT}/.env" ]] || die "Production environment file is missing."
[[ "$(stat -c '%U:%G' "${BACKEND_ROOT}/.env")" == "${APP_USER}:${APP_GROUP}" ]] ||
  die "Production environment file ownership is incorrect."
[[ "$(stat -c '%a' "${BACKEND_ROOT}/.env")" == "600" ]] ||
  die "Production environment file mode must be 0600."
[[ -f "${BACKEND_ROOT}/data/community.sqlite" ]] || die "Production database is missing."
[[ "$(stat -c '%U:%G' "${BACKEND_ROOT}/data/community.sqlite")" == "${APP_USER}:${APP_GROUP}" ]] ||
  die "Production database ownership is unexpected."

available_bytes="$(df --output=avail -B1 "${REPO_ROOT}" | tail -n 1 | tr -d ' ')"
if (( available_bytes < 5 * 1024 * 1024 * 1024 )); then
  die "Less than 5 GiB is available on the production filesystem."
fi

run_as_app env NODE_ENV=production /usr/bin/npm --prefix "${REPO_ROOT}" run check:config
wait_for_health "${LOCAL_HEALTH_URL}" "Pre-maintenance local health" 3 ||
  die "The application is not healthy before maintenance."

compose_caddy_candidate
caddy validate --config "${CADDY_CANDIDATE}" --adapter caddyfile
systemd-analyze verify \
  "${SERVICE_SOURCE}" \
  "${BACKUP_SERVICE_SOURCE}" \
  "${BACKUP_TIMER_SOURCE}" \
  "${DISCOVERY_SERVICE_SOURCE}" \
  "${DISCOVERY_TIMER_SOURCE}"
verify_certbot_is_obsolete

log "Refreshing package metadata and preparing the reviewed Ubuntu dist-upgrade plan."
apt-get update
APT_PLAN="$(mktemp /tmp/echo-archives-apt.XXXXXX)"
apt-get --simulate dist-upgrade > "${APT_PLAN}"
mapfile -t planned_removals < <(awk '/^Remv[[:space:]]/ { print $2 }' "${APT_PLAN}")
if (( ${#planned_removals[@]} > 1 )); then
  sed -n '/^Remv[[:space:]]/p' "${APT_PLAN}"
  die "The reviewed update plan would remove more than the one approved obsolete Netdata plugin."
fi
if (( ${#planned_removals[@]} == 1 )) && [[ "${planned_removals[0]}" != "${ALLOWED_APT_REMOVAL}" ]]; then
  sed -n '/^Remv[[:space:]]/p' "${APT_PLAN}"
  die "The reviewed update plan contains an unapproved package removal."
fi

log "Packages proposed for installation or upgrade:"
if ! grep -E '^Inst[[:space:]]' "${APT_PLAN}"; then
  log "No package upgrades are currently proposed."
fi
if (( ${#planned_removals[@]} == 1 )); then
  log "Approved package replacement removal: ${ALLOWED_APT_REMOVAL} (replaced by the updated netdata-plugin-otel package)."
fi

printf '\n'
printf 'This maintenance will:\n'
printf '  - create a new verified online SQLite backup without replacing the database;\n'
printf '  - install the Ubuntu dist-upgrade plan shown above;\n'
printf '  - permit removal only of the obsolete %s package when the plan requires it;\n' "${ALLOWED_APT_REMOVAL}"
printf '  - install the exact reviewed production npm lockfile as %s;\n' "${APP_USER}"
printf '  - back up and replace only the Echo Caddy block and five Echo systemd unit files;\n'
printf '  - restart %s and reload Caddy after validation;\n' "${SERVICE_NAME}"
printf '  - disable the proven-obsolete Certbot timer without deleting certificates or nginx files;\n'
printf '  - inspect, but not change, UFW and nftables rules;\n'
printf '  - never reboot automatically.\n\n'

if [[ ! -t 0 ]]; then
  die "Interactive confirmation is required."
fi
read -r -p "Type APPLY to continue: " confirmation
printf '\n'
[[ "${confirmation}" == "APPLY" ]] || die "Maintenance cancelled without applying changes."

backup_configuration
log "Creating a verified online database backup before package or service changes."
run_as_app /usr/bin/npm --prefix "${REPO_ROOT}" run backup:database

if grep -qE '^Inst[[:space:]]' "${APT_PLAN}"; then
  log "Installing the reviewed Ubuntu dist-upgrade plan."
  DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=l \
    apt-get -y dist-upgrade
else
  log "Ubuntu packages are already current for the present package metadata."
fi

caddy validate --config "${CADDY_CANDIDATE}" --adapter caddyfile
stage_production_dependencies
apply_deployment

log "Disabling the obsolete Certbot timer; certificate and nginx files are preserved."
systemctl disable --now certbot.timer
systemctl reset-failed certbot.service
if systemctl is-enabled --quiet certbot.timer; then
  die "Certbot timer remained enabled."
fi
if systemctl is-active --quiet certbot.timer; then
  die "Certbot timer remained active."
fi

post_deployment_checks
report_host_state

log "Maintenance completed successfully."
log "Configuration backups and the previous node_modules tree are preserved at ${BACKUP_DIR}."
log "No reboot was performed. If one is required, schedule it and rerun the complete launch-readiness assessment afterward."
