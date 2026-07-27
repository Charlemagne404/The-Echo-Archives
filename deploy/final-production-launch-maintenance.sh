#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 0077
export LC_ALL=C

APP_USER="charlie"
APP_GROUP="charlie"
APP_HOME="/home/charlie"
REPO_ROOT="/home/charlie/The-Echo-Archives"
LOCAL_HEALTH_URL="http://127.0.0.1:3010/api/health"
PUBLIC_ORIGIN="https://echoarchives.net"
AUTH_HEALTH_URL="https://mpmc.ddns.net/api/health"
ROOT_AUTH_SERVICE="continental-dashboard-auth.service"
USER_AUTH_SERVICE="continental-id-auth.service"

LOCAL_MONITOR_SERVICE_SOURCE="${REPO_ROOT}/deploy/echo-archives-local-monitor.service"
LOCAL_MONITOR_TIMER_SOURCE="${REPO_ROOT}/deploy/echo-archives-local-monitor.timer"
OFFSITE_BACKUP_SCRIPT="${REPO_ROOT}/deploy/echo-archives-offsite-backup.sh"
OFFSITE_BACKUP_SERVICE_SOURCE="${REPO_ROOT}/deploy/echo-archives-offsite-backup.service"
OFFSITE_BACKUP_TIMER_SOURCE="${REPO_ROOT}/deploy/echo-archives-offsite-backup.timer"
MONITOR_ENV_EXAMPLE="${REPO_ROOT}/deploy/monitoring.env.example"
PRODUCTION_CHECK="${REPO_ROOT}/deploy/check-echo-archives-production.sh"
BACKUP_CHECK="${REPO_ROOT}/tools/check-database-backup.js"

LOCAL_MONITOR_SERVICE_DEST="/etc/systemd/system/echo-archives-local-monitor.service"
LOCAL_MONITOR_TIMER_DEST="/etc/systemd/system/echo-archives-local-monitor.timer"
OFFSITE_BACKUP_SERVICE_DEST="/etc/systemd/system/echo-archives-offsite-backup.service"
OFFSITE_BACKUP_TIMER_DEST="/etc/systemd/system/echo-archives-offsite-backup.timer"
MONITOR_ENV_DEST="/etc/echo-archives/monitoring.env"

EXPECTED_BACKEND_PACKAGE_SHA="8058043170b0936023435ebd03d556de916eb1c1528b3b411456d02b84627fea"
EXPECTED_BACKEND_LOCK_SHA="4b6fb301cf0b33a343e604f28e1939136959be325a546af5a4abad4285d03240"
EXPECTED_PRODUCTION_CHECK_SHA="e7ba7b4a46378687a87ea5becf1654299a5306993984cdbc4e5b4cd22aa2715e"
EXPECTED_LOCAL_MONITOR_SERVICE_SHA="c6c0e07eab6f2d7d60ddd74bdc3f36b3a4174929efc9d92ce43a14496d0e4804"
EXPECTED_LOCAL_MONITOR_TIMER_SHA="09fd9b666484787feddcb608305cab012fb51f822ae5a35af08c2e049e155aff"
EXPECTED_OFFSITE_BACKUP_SCRIPT_SHA="7de9392c3111f76eb9e26e40e310c239db0cdcdf1310832deb9d0a2da55890db"
EXPECTED_OFFSITE_BACKUP_SERVICE_SHA="c481b7b6103765ffe11d47b3a62337f77ed149592e68ff88bd3f258593703013"
EXPECTED_OFFSITE_BACKUP_TIMER_SHA="893540a82122b2678cb3f4d99691feeb7e3328aa7451825f9fac7cb35601fd46"
EXPECTED_MONITOR_ENV_SHA="5c1785f8a2d0138558439c96124d60957fd2e86424ed3bd6c6bfd8430f8b65d5"
EXPECTED_BACKUP_CHECK_SHA="a33e24ae19d16537c251522313a1eb172f1f3a5a7c242172f2df16278d54aef3"

REVIEWED_UPDATE_PACKAGES=(
  libc-bin
  libc-dev-bin
  libc-devtools
  libc6
  libc6:i386
  libc6-dbg
  libc6-dev
  locales
  netdata
  netdata-dashboard
  netdata-plugin-apps
  netdata-plugin-chartsd
  netdata-plugin-debugfs
  netdata-plugin-ebpf
  netdata-plugin-go
  netdata-plugin-ibm
  netdata-plugin-ibm-libs
  netdata-plugin-network-viewer
  netdata-plugin-nfacct
  netdata-plugin-otel
  netdata-plugin-perf
  netdata-plugin-pythond
  netdata-plugin-scripts
  netdata-plugin-slabinfo
  netdata-plugin-systemd-journal
  netdata-user
)

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_DIR="/var/log/echo-archives"
LOG_FILE="${LOG_DIR}/final-launch-maintenance-${TIMESTAMP}.log"
READABLE_LOG="/tmp/echo-final-launch-maintenance-latest.log"
BACKUP_DIR="/var/backups/echo-archives-final-launch/${TIMESTAMP}"
APT_UPDATE_PLAN=""
RESTIC_PLAN=""
TEMP_DIR=""
RESTIC_INSTALL_REQUIRED=0
REVIEWED_UPDATES_REQUIRED=0

log() {
  printf '[%s] %s\n' "$(date --iso-8601=seconds)" "$*"
}

cleanup() {
  if [[ -n "${APT_UPDATE_PLAN}" && "${APT_UPDATE_PLAN}" == /tmp/echo-final-updates.* ]]; then
    rm -f -- "${APT_UPDATE_PLAN}"
  fi
  if [[ -n "${RESTIC_PLAN}" && "${RESTIC_PLAN}" == /tmp/echo-final-restic.* ]]; then
    rm -f -- "${RESTIC_PLAN}"
  fi
  if [[ -n "${TEMP_DIR}" && "${TEMP_DIR}" == /tmp/echo-final-checks.* ]]; then
    rm -rf -- "${TEMP_DIR}"
  fi
}

publish_log() {
  if [[ -f "${LOG_FILE}" ]]; then
    install -m 0600 -o "${APP_USER}" -g "${APP_GROUP}" \
      "${LOG_FILE}" "${READABLE_LOG}" || true
  fi
}

on_error() {
  local status="$?"
  local line="$1"
  trap - ERR
  log "ERROR: final maintenance stopped at line ${line} with exit status ${status}."
  log "No reboot was performed. Review ${LOG_FILE} and backups under ${BACKUP_DIR}."
  publish_log
  cleanup
  exit "${status}"
}

die() {
  log "ERROR: $*"
  publish_log
  exit 1
}

trap 'on_error "${LINENO}"' ERR
trap cleanup EXIT

if [[ "${EUID}" -ne 0 ]]; then
  printf 'Run this script with sudo.\n' >&2
  exit 1
fi

install -d -m 0750 -o root -g adm "${LOG_DIR}"
touch "${LOG_FILE}"
chmod 0600 "${LOG_FILE}"
exec > >(tee -a "${LOG_FILE}") 2>&1

exec 9>"/run/lock/echo-archives-final-launch.lock"
flock -n 9 || die "Another Echo Archives launch-maintenance process is running."

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Required command is missing: $1"
}

for command_name in \
  apt apt-get awk bash caddy chmod chown cp curl date df find flock grep id \
  install mktemp nft node npm python3 readlink rm runuser sed sha256sum ss stat \
  systemctl systemd-analyze tee ufw; do
  require_command "${command_name}"
done

[[ -r /etc/os-release ]] || die "Cannot read /etc/os-release."
# shellcheck source=/etc/os-release
source /etc/os-release
[[ "${ID:-}" == "ubuntu" ]] || die "This reviewed script supports Ubuntu only."
[[ "$(readlink -f "${REPO_ROOT}")" == "${REPO_ROOT}" ]] ||
  die "Unexpected repository path."
id "${APP_USER}" >/dev/null 2>&1 || die "Application user is missing."
[[ "$(id -gn "${APP_USER}")" == "${APP_GROUP}" ]] ||
  die "Application user's primary group is unexpected."

APP_UID="$(id -u "${APP_USER}")"

run_as_app() {
  runuser -u "${APP_USER}" -- env \
    HOME="${APP_HOME}" \
    PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/snap/bin" \
    "$@"
}

user_systemctl() {
  runuser -u "${APP_USER}" -- env \
    HOME="${APP_HOME}" \
    XDG_RUNTIME_DIR="/run/user/${APP_UID}" \
    DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/${APP_UID}/bus" \
    systemctl --user "$@"
}

assert_reviewed_file() {
  local path="$1"
  local expected_sha="$2"
  local actual_sha
  [[ -f "${path}" ]] || die "Reviewed input is missing: ${path}"
  actual_sha="$(sha256sum "${path}" | awk '{print $1}')"
  [[ "${actual_sha}" == "${expected_sha}" ]] ||
    die "Reviewed input changed after review: ${path}"
}

save_file() {
  local source="$1"
  local backup_name
  if [[ -e "${source}" || -L "${source}" ]]; then
    backup_name="$(printf '%s' "${source#/}" | sed 's|/|_|g')"
    cp -a -- "${source}" "${BACKUP_DIR}/${backup_name}"
    log "Backed up ${source}."
  fi
}

ufw_has_target() {
  local target="$1"
  ufw status | awk -v target="${target}" '
    $1 == target { found = 1 }
    END { exit(found ? 0 : 1) }
  '
}

ufw_target_count() {
  local target="$1"
  ufw status | awk -v target="${target}" '
    $1 == target { count += 1 }
    END { print count + 0 }
  '
}

show_ufw_numbered() {
  log "Current numbered UFW rules:"
  ufw status numbered
}

delete_ufw_allow() {
  local target="$1"
  local description="$2"
  local attempts=0
  local count_before count_after
  while ufw_has_target "${target}"; do
    attempts=$((attempts + 1))
    (( attempts <= 10 )) ||
      die "Too many duplicate UFW rules matched ${target}; stopping for manual review."
    count_before="$(ufw_target_count "${target}")"
    log "Removing ${description}: allow ${target} (IPv4 and IPv6)."
    ufw delete allow "${target}"
    count_after="$(ufw_target_count "${target}")"
    (( count_after < count_before )) ||
      die "UFW reported success without reducing matching rules for ${target}."
  done
  if (( attempts == 0 )); then
    log "${description} is already absent: allow ${target}."
  fi
  if ufw_has_target "${target}"; then
    die "UFW rule remained after deletion: ${target}"
  fi
  show_ufw_numbered
}

require_ufw_target() {
  local target="$1"
  local description="$2"
  local expected_count=1
  local actual_count
  if grep -qE '^IPV6=yes([[:space:]]|$)' /etc/default/ufw; then
    expected_count=2
  fi
  actual_count="$(ufw_target_count "${target}")"
  (( actual_count == expected_count )) ||
    die "Required ${description} UFW rule is missing or duplicated for one or more address families: ${target}"
}

validate_ufw_command_grammar() {
  log "Validating every mutating UFW command against the installed parser."
  ufw version
  python3 - <<'PY'
import builtins

builtins._ = lambda value: value

from ufw.parser import UFWCommandRule

commands = [
    ["allow", "80/tcp", "comment", "Caddy HTTP"],
    ["allow", "8080/tcp", "comment", "Jarvis API and WebSocket"],
    ["delete", "allow", "80"],
    ["delete", "allow", "8080"],
    ["delete", "allow", "25565/tcp"],
    ["delete", "allow", "25566/tcp"],
    ["delete", "allow", "8804/tcp"],
]

for command in commands:
    UFWCommandRule(command[0]).parse(command.copy())
PY
}

port_has_listener() {
  local port="$1"
  ss -H -lntup | awk -v suffix=":${port}" '
    index($5, suffix) && substr($5, length($5) - length(suffix) + 1) == suffix {
      found = 1
    }
    END { exit(found ? 0 : 1) }
  '
}

assert_no_obsolete_container_binding() {
  if ! command -v docker >/dev/null 2>&1; then
    log "Docker CLI is absent; nftables and listening-socket checks remain authoritative."
    return
  fi

  local container_ids
  container_ids="$(docker ps -aq 2>/dev/null || true)"
  if [[ -z "${container_ids}" ]]; then
    log "Docker has no containers."
    return
  fi

  local bindings
  # Container IDs contain no whitespace other than line separators.
  # shellcheck disable=SC2086
  bindings="$(docker inspect --format '{{json .HostConfig.PortBindings}}' ${container_ids})"
  if grep -Eq '"HostPort":"(8804|25565|25566)"' <<<"${bindings}"; then
    die "A Docker container still publishes an obsolete firewall target."
  fi
}

validate_json_health() {
  local file="$1"
  node -e '
    const fs = require("node:fs");
    const health = JSON.parse(fs.readFileSync(process.argv[1]));
    if (health.ok !== true || health.catalogCount < 1 || health.collectionCount < 1) {
      process.exit(1);
    }
  ' "${file}"
}

validate_auth_health() {
  local file="$1"
  node -e '
    const fs = require("node:fs");
    const health = JSON.parse(fs.readFileSync(process.argv[1]));
    if (health.service !== "continental-id-auth" || health.status !== "ok") {
      process.exit(1);
    }
  ' "${file}"
}

validate_http_health() {
  local url="$1"
  local output="$2"
  curl --fail --silent --show-error --max-time 15 \
    --output "${output}" "${url}"
  validate_json_health "${output}" || die "Health semantics failed for ${url}."
}

validate_auth_path() {
  local output="$1"
  curl --fail --silent --show-error --max-time 15 \
    --output "${output}" "${AUTH_HEALTH_URL}"
  validate_auth_health "${output}" ||
    die "Continental ID auth health semantics failed."
}

assert_user_auth_healthy() {
  user_systemctl is-enabled --quiet "${USER_AUTH_SERVICE}" ||
    die "${USER_AUTH_SERVICE} is not enabled."
  user_systemctl is-active --quiet "${USER_AUTH_SERVICE}" ||
    die "${USER_AUTH_SERVICE} is not active."
  ss -H -lntp | awk '
    $4 ~ /^127\.0\.0\.1:5000$/ && /node/ { found = 1 }
    END { exit(found ? 0 : 1) }
  ' || die "The user auth service is not the Node listener on 127.0.0.1:5000."
  validate_auth_path "${TEMP_DIR}/auth-health.json"
}

assert_required_remote_access() {
  for unit in ssh.service tailscaled.service rustdesk.service; do
    systemctl is-enabled --quiet "${unit}" || die "${unit} is not enabled."
    systemctl is-active --quiet "${unit}" || die "${unit} is not active."
  done
  ss -H -lnt | awk '$4 ~ /(^|\\]):22$/ || $4 ~ /(^|:)22$/ { found = 1 }
    END { exit(found ? 0 : 1) }' ||
    die "SSH is not listening on TCP 22."
}

assert_certbot_obsolete_state() {
  if systemctl is-enabled --quiet certbot.timer; then
    die "Certbot timer unexpectedly became enabled; investigate before continuing."
  fi
  if systemctl is-active --quiet certbot.timer; then
    die "Certbot timer unexpectedly became active; investigate before continuing."
  fi
  if grep -RIl --fixed-strings '/etc/letsencrypt/live/mpmc.ddns.net' \
    /etc/caddy /etc/systemd/system 2>/dev/null | grep -q .; then
    die "An active Caddy or system systemd configuration references the legacy certificate."
  fi
}

assert_production_units() {
  local unit
  for unit in \
    echo-archives.service \
    caddy.service \
    echo-archives-backup.timer \
    echo-archives-discovery.timer; do
    systemctl is-enabled --quiet "${unit}" || die "${unit} is not enabled."
    systemctl is-active --quiet "${unit}" || die "${unit} is not active."
  done
}

prepare_package_plans() {
  log "Refreshing Ubuntu package metadata."
  apt-get update

  RESTIC_PLAN="$(mktemp /tmp/echo-final-restic.XXXXXX)"
  apt-get --simulate install --no-install-recommends restic > "${RESTIC_PLAN}"
  if grep -qE '^Remv[[:space:]]' "${RESTIC_PLAN}"; then
    sed -n '/^Remv[[:space:]]/p' "${RESTIC_PLAN}"
    die "Installing restic would remove a package."
  fi
  if grep -qE '^Inst[[:space:]]' "${RESTIC_PLAN}"; then
    RESTIC_INSTALL_REQUIRED=1
  fi

  APT_UPDATE_PLAN="$(mktemp /tmp/echo-final-updates.XXXXXX)"
  apt-get --simulate install --only-upgrade \
    "${REVIEWED_UPDATE_PACKAGES[@]}" > "${APT_UPDATE_PLAN}"
  if grep -qE '^Remv[[:space:]]' "${APT_UPDATE_PLAN}"; then
    sed -n '/^Remv[[:space:]]/p' "${APT_UPDATE_PLAN}"
    die "The reviewed update set would remove a package."
  fi
  if grep -qE '^Inst[[:space:]]' "${APT_UPDATE_PLAN}"; then
    REVIEWED_UPDATES_REQUIRED=1
  fi

  local planned_package reviewed_package package_is_reviewed
  while read -r planned_package; do
    planned_package="${planned_package%%:*}"
    package_is_reviewed=false
    for reviewed_package in "${REVIEWED_UPDATE_PACKAGES[@]}"; do
      if [[ "${planned_package}" == "${reviewed_package%%:*}" ]]; then
        package_is_reviewed=true
        break
      fi
    done
    [[ "${package_is_reviewed}" == "true" ]] ||
      die "The update plan introduced an unreviewed package: ${planned_package}"
  done < <(awk '/^Inst[[:space:]]/ { print $2 }' "${APT_UPDATE_PLAN}")

  log "Reviewed operating-system update plan:"
  if ! grep -E '^Inst[[:space:]]' "${APT_UPDATE_PLAN}"; then
    log "The reviewed operating-system packages are already current."
  fi
  log "Restic installation plan:"
  grep -E '^(Inst|Conf)[[:space:]]' "${RESTIC_PLAN}" ||
    log "Restic is already installed."
}

backup_privileged_state() {
  install -d -m 0700 -o root -g root "${BACKUP_DIR}"
  for path in \
    /etc/ufw/user.rules \
    /etc/ufw/user6.rules \
    /etc/systemd/system/continental-dashboard-auth.service \
    "${LOCAL_MONITOR_SERVICE_DEST}" \
    "${LOCAL_MONITOR_TIMER_DEST}" \
    "${OFFSITE_BACKUP_SERVICE_DEST}" \
    "${OFFSITE_BACKUP_TIMER_DEST}" \
    "${MONITOR_ENV_DEST}"; do
    save_file "${path}"
  done
  ufw status verbose > "${BACKUP_DIR}/ufw-status-before.txt"
  ufw status numbered > "${BACKUP_DIR}/ufw-numbered-before.txt"
  nft list ruleset > "${BACKUP_DIR}/nft-ruleset-before.txt"
  ss -lntup > "${BACKUP_DIR}/listeners-before.txt"
  systemctl show "${ROOT_AUTH_SERVICE}" \
    -p ActiveState -p SubState -p NRestarts -p FragmentPath -p UnitFileState \
    > "${BACKUP_DIR}/root-auth-before.txt"
  chmod 0600 "${BACKUP_DIR}"/*
}

apply_reviewed_updates() {
  if (( RESTIC_INSTALL_REQUIRED == 1 )); then
    log "Installing restic without recommended packages."
    DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=l \
      apt-get -y install --no-install-recommends restic
  else
    log "Restic is already at the reviewed candidate version; skipping installation."
  fi
  restic version

  if (( REVIEWED_UPDATES_REQUIRED == 1 )); then
    log "Installing only the reviewed libc, locale, and Netdata updates."
    DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=l \
      apt-get -y install --only-upgrade "${REVIEWED_UPDATE_PACKAGES[@]}"
  else
    log "No reviewed operating-system updates remain to install."
  fi
}

clean_ufw_rules() {
  log "Applying the reviewed UFW cleanup without touching SSH, 443, or Tailscale."
  local ufw_verbose
  ufw_verbose="$(ufw status verbose)"
  grep -qi '^Status: active' <<<"${ufw_verbose}" || die "UFW is not active."
  grep -qi 'Default: deny (incoming)' <<<"${ufw_verbose}" ||
    die "UFW incoming default is not deny."

  require_ufw_target "22/tcp" "SSH TCP 22"
  require_ufw_target "443" "Caddy TCP/UDP 443"
  if ! ufw_has_target "8080" && ! ufw_has_target "8080/tcp"; then
    die "The deliberately retained Jarvis TCP 8080 rule is missing."
  fi

  if ! ufw_has_target "80/tcp"; then
    log "Adding explicit Caddy TCP 80 before removing the protocol-agnostic rule."
    ufw allow 80/tcp comment "Caddy HTTP"
  fi
  require_ufw_target "80/tcp" "Caddy TCP 80"

  if ! ufw_has_target "8080/tcp"; then
    log "Adding explicit retained Jarvis TCP 8080 before removing unnecessary UDP exposure."
    ufw allow 8080/tcp comment "Jarvis API and WebSocket"
  fi
  require_ufw_target "8080/tcp" "deliberately retained Jarvis TCP 8080"

  delete_ufw_allow "80" "obsolete protocol-agnostic port 80 rule (UDP 80)"
  delete_ufw_allow "8080" "protocol-agnostic Jarvis rule (unnecessary UDP 8080)"
  delete_ufw_allow "25565/tcp" "obsolete Minecraft TCP 25565 rule"
  delete_ufw_allow "25566/tcp" "obsolete Minecraft TCP 25566 rule"
  delete_ufw_allow "8804/tcp" "unowned TCP 8804 rule"

  require_ufw_target "22/tcp" "SSH TCP 22"
  require_ufw_target "80/tcp" "Caddy TCP 80"
  require_ufw_target "443" "Caddy TCP/UDP 443"
  require_ufw_target "8080/tcp" "deliberately retained Jarvis TCP 8080"
  log "TCP 8080 remains deliberately retained for Jarvis; UDP 8080 is removed. No process currently listens there."
}

disable_duplicate_auth_service() {
  log "Disabling the obsolete root auth unit after revalidating the healthy user unit."
  assert_user_auth_healthy
  systemctl disable --now "${ROOT_AUTH_SERVICE}"
  systemctl reset-failed "${ROOT_AUTH_SERVICE}" || true
  if systemctl is-enabled --quiet "${ROOT_AUTH_SERVICE}"; then
    die "${ROOT_AUTH_SERVICE} remained enabled."
  fi
  if systemctl is-active --quiet "${ROOT_AUTH_SERVICE}"; then
    die "${ROOT_AUTH_SERVICE} remained active."
  fi
  assert_user_auth_healthy
}

deploy_local_operations_units() {
  log "Installing credential-neutral local monitoring and off-site backup units."
  install -d -m 0750 -o root -g root /etc/echo-archives
  if [[ ! -e "${MONITOR_ENV_DEST}" ]]; then
    install -m 0600 -o root -g root \
      "${MONITOR_ENV_EXAMPLE}" "${MONITOR_ENV_DEST}"
  else
    [[ "$(stat -c '%U:%G' "${MONITOR_ENV_DEST}")" == "root:root" ]] ||
      die "${MONITOR_ENV_DEST} must be owned by root:root."
    [[ "$(stat -c '%a' "${MONITOR_ENV_DEST}")" == "600" ]] ||
      die "${MONITOR_ENV_DEST} must have mode 0600."
  fi

  install -m 0644 -o root -g root \
    "${LOCAL_MONITOR_SERVICE_SOURCE}" "${LOCAL_MONITOR_SERVICE_DEST}"
  install -m 0644 -o root -g root \
    "${LOCAL_MONITOR_TIMER_SOURCE}" "${LOCAL_MONITOR_TIMER_DEST}"
  install -m 0644 -o root -g root \
    "${OFFSITE_BACKUP_SERVICE_SOURCE}" "${OFFSITE_BACKUP_SERVICE_DEST}"
  install -m 0644 -o root -g root \
    "${OFFSITE_BACKUP_TIMER_SOURCE}" "${OFFSITE_BACKUP_TIMER_DEST}"

  systemctl daemon-reload
  systemctl enable --now echo-archives-local-monitor.timer
  systemctl start echo-archives-local-monitor.service
  systemctl is-enabled --quiet echo-archives-local-monitor.timer ||
    die "Local monitor timer is not enabled."
  systemctl is-active --quiet echo-archives-local-monitor.timer ||
    die "Local monitor timer is not active."
  [[ "$(systemctl show echo-archives-local-monitor.service -p Result --value)" == "success" ]] ||
    die "The first local monitoring run did not succeed."

  if [[ -e /etc/echo-archives/offsite-backup.env ]]; then
    log "Off-site credentials already exist; the off-site timer state was preserved."
  else
    if systemctl is-enabled --quiet echo-archives-offsite-backup.timer; then
      die "Off-site timer is enabled without its credential environment file."
    fi
    log "Off-site units are installed but not enabled; credentials and a restore drill are still required."
  fi
}

postflight() {
  log "Running complete post-maintenance verification."
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
  assert_certbot_obsolete_state
  assert_required_remote_access
  assert_production_units
  assert_user_auth_healthy

  if systemctl is-enabled --quiet "${ROOT_AUTH_SERVICE}" ||
    systemctl is-active --quiet "${ROOT_AUTH_SERVICE}"; then
    die "The obsolete root auth unit is still enabled or active."
  fi

  local failed_units
  failed_units="$(systemctl --failed --no-legend --plain)"
  if [[ -n "${failed_units}" ]]; then
    printf '%s\n' "${failed_units}"
    die "One or more systemd units are failed."
  fi

  validate_http_health "${LOCAL_HEALTH_URL}" "${TEMP_DIR}/local-health.json"
  validate_http_health "${PUBLIC_ORIGIN}/api/health" "${TEMP_DIR}/public-health.json"

  run_as_app /usr/bin/npm --prefix "${REPO_ROOT}/backend" \
    ls --omit=dev --depth=0
  run_as_app /usr/bin/npm --prefix "${REPO_ROOT}/backend" \
    audit --omit=dev --audit-level=high
  run_as_app /usr/bin/npm --prefix "${REPO_ROOT}" \
    run check:backup -- --max-age-hours 30
  run_as_app "${PRODUCTION_CHECK}"

  log "Final UFW status:"
  ufw status verbose
  show_ufw_numbered
  log "Final nftables ruleset:"
  nft list ruleset
  log "Final listening sockets:"
  ss -lntup
  log "Required and newly installed timers:"
  systemctl list-timers \
    echo-archives-backup.timer \
    echo-archives-discovery.timer \
    echo-archives-local-monitor.timer \
    --all --no-pager
  log "Systemd failures:"
  systemctl --failed --no-pager
  log "Remaining package upgrades:"
  apt list --upgradable 2>/dev/null || true
  log "Filesystem capacity:"
  df -hT "${REPO_ROOT}"

  if [[ -e /run/reboot-required ]]; then
    log "REBOOT REQUIRED. This script never reboots automatically."
    if [[ -r /run/reboot-required.pkgs ]]; then
      sed -n '1,120p' /run/reboot-required.pkgs
    fi
  else
    log "The host does not currently report that a reboot is required."
  fi
}

log "Beginning the reviewed final production launch maintenance."
log "Repository: ${REPO_ROOT}"
log "Root log: ${LOG_FILE}"

assert_reviewed_file "${REPO_ROOT}/backend/package.json" "${EXPECTED_BACKEND_PACKAGE_SHA}"
assert_reviewed_file "${REPO_ROOT}/backend/package-lock.json" "${EXPECTED_BACKEND_LOCK_SHA}"
assert_reviewed_file "${PRODUCTION_CHECK}" "${EXPECTED_PRODUCTION_CHECK_SHA}"
assert_reviewed_file "${LOCAL_MONITOR_SERVICE_SOURCE}" "${EXPECTED_LOCAL_MONITOR_SERVICE_SHA}"
assert_reviewed_file "${LOCAL_MONITOR_TIMER_SOURCE}" "${EXPECTED_LOCAL_MONITOR_TIMER_SHA}"
assert_reviewed_file "${OFFSITE_BACKUP_SCRIPT}" "${EXPECTED_OFFSITE_BACKUP_SCRIPT_SHA}"
assert_reviewed_file "${OFFSITE_BACKUP_SERVICE_SOURCE}" "${EXPECTED_OFFSITE_BACKUP_SERVICE_SHA}"
assert_reviewed_file "${OFFSITE_BACKUP_TIMER_SOURCE}" "${EXPECTED_OFFSITE_BACKUP_TIMER_SHA}"
assert_reviewed_file "${MONITOR_ENV_EXAMPLE}" "${EXPECTED_MONITOR_ENV_SHA}"
assert_reviewed_file "${BACKUP_CHECK}" "${EXPECTED_BACKUP_CHECK_SHA}"

[[ -f "${REPO_ROOT}/backend/.env" ]] || die "Production environment file is missing."
[[ "$(stat -c '%U:%G' "${REPO_ROOT}/backend/.env")" == "${APP_USER}:${APP_GROUP}" ]] ||
  die "Production environment ownership is incorrect."
[[ "$(stat -c '%a' "${REPO_ROOT}/backend/.env")" == "600" ]] ||
  die "Production environment mode is not 0600."
[[ -f "${REPO_ROOT}/backend/data/community.sqlite" ]] ||
  die "Production database is missing."
[[ "$(stat -c '%a' "${REPO_ROOT}/backend/data/community.sqlite")" == "600" ]] ||
  die "Production database mode is not 0600."

TEMP_DIR="$(mktemp -d /tmp/echo-final-checks.XXXXXX)"
available_bytes="$(df --output=avail -B1 "${REPO_ROOT}" | awk 'NR == 2 { print $1 }')"
(( available_bytes >= 10 * 1024 * 1024 * 1024 )) ||
  die "Less than 10 GiB is available on the production filesystem."

assert_required_remote_access
assert_production_units
assert_user_auth_healthy
assert_certbot_obsolete_state
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
validate_http_health "${LOCAL_HEALTH_URL}" "${TEMP_DIR}/local-health-before.json"
validate_http_health "${PUBLIC_ORIGIN}/api/health" "${TEMP_DIR}/public-health-before.json"
run_as_app /usr/bin/npm --prefix "${REPO_ROOT}" \
  run check:backup -- --max-age-hours 30
run_as_app /usr/bin/npm --prefix "${REPO_ROOT}/backend" \
  ls --omit=dev --depth=0

for port in 8804 25565 25566; do
  if port_has_listener "${port}"; then
    die "An obsolete firewall target still has a listener on port ${port}."
  fi
done
assert_no_obsolete_container_binding

validate_ufw_command_grammar
systemd-analyze verify \
  "${LOCAL_MONITOR_SERVICE_SOURCE}" \
  "${LOCAL_MONITOR_TIMER_SOURCE}" \
  "${OFFSITE_BACKUP_SERVICE_SOURCE}" \
  "${OFFSITE_BACKUP_TIMER_SOURCE}"

prepare_package_plans

printf '\n'
printf 'This guarded maintenance will:\n'
printf '  - back up every privileged file it may replace;\n'
printf '  - install restic and only the reviewed pending libc, locale, and Netdata updates;\n'
printf '  - remove UFW allows for UDP 80, UDP 8080, TCP 25565, TCP 25566, and TCP 8804 (IPv4/IPv6);\n'
printf '  - preserve TCP 22, TCP 80, TCP/UDP 443, Tailscale, and deliberate Jarvis TCP 8080;\n'
printf '  - disable the obsolete root continental-dashboard-auth.service only after proving the user unit healthy;\n'
printf '  - install and start credential-neutral local monitoring;\n'
printf '  - install, but not enable, credential-dependent encrypted off-site backup units;\n'
printf '  - validate Caddy, TLS, services, timers, dependencies, backups, UFW, nftables, sockets, and public health;\n'
printf '  - never alter the production database, SSH configuration, networking, or reboot the host.\n\n'

if [[ ! -t 0 ]]; then
  die "Interactive confirmation is required."
fi
read -r -p "Type APPLY to continue: " confirmation
printf '\n'
[[ "${confirmation}" == "APPLY" ]] ||
  die "Maintenance cancelled without applying changes."

backup_privileged_state
apply_reviewed_updates
clean_ufw_rules
disable_duplicate_auth_service
deploy_local_operations_units
postflight

log "Final launch maintenance completed successfully."
log "Privileged backups: ${BACKUP_DIR}"
log "User-readable log: ${READABLE_LOG}"
log "No reboot was performed."
publish_log
