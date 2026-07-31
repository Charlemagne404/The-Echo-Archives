#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 0077
export LC_ALL=C

REPO_ROOT="/home/charlie/The-Echo-Archives"
OPERATOR_USER="charlie"
RUNTIME_USER="echo-archives"
EXPECTED_HOST="charlie-Legion-T530-28ICB"
EXPECTED_BRANCH="main"
EXPECTED_COMMIT=""
MODE=""

ARTIFACT_ROOT="/home/charlie/.local/state/echo-archives-rollbacks/20260728T124747Z"
CADDY_NEW_PACKAGE="${ARTIFACT_ROOT}/caddy_2.11.4_linux_amd64.deb"
CADDY_OLD_PACKAGE="${ARTIFACT_ROOT}/caddy_2.10.2_linux_amd64.deb"
CADDY_STAGED_BIN="${ARTIFACT_ROOT}/caddy-2.11.4-stage/usr/bin/caddy"
OLLAMA_NEW_ARCHIVE="${ARTIFACT_ROOT}/ollama-linux-amd64-v0.32.5.tar.zst"
OLLAMA_FALLBACK_ARCHIVE="${ARTIFACT_ROOT}/ollama-linux-amd64-v0.6.7.tgz"
CADDY_NEW_SHA512="1c6f5404f3622e46d401d81f4af59677d46b886229c6694d60fd936b87c72d3bb5d1fcf42b55c8d555769fa75acf434ab618fc7e0df2c79cf8512ee580d38d06"
CADDY_OLD_SHA512="e3d6909253b12dc723393fb1f0ace74e2c9bd8d64273fca6727adcf7c7882ebcb9611b6ab42223b20e93fc702f7c0f25bff1c12a88223202a069bb770d95990d"
OLLAMA_NEW_SHA256="f7d6bdbcf71b83aa8670c4e7dc4b6936c0952fcf8b114eaf6a11cbadb9684214"
OLLAMA_FALLBACK_SHA256="42b6bc1237c6932d36694606bf3d56d99fbd03b570b6002364773e00f56fa4cf"
OFFSITE_SUCCESS_MARKER="/var/lib/echo-archives-monitoring/offsite-backup-success"
OFFSITE_BACKUP_UNIT_CANDIDATE="${REPO_ROOT}/deploy/echo-archives-offsite-backup.service"
MAX_OFFSITE_MARKER_AGE_HOURS=30

LOCK_FILE="/run/lock/echo-archives-complete-launch-maintenance.lock"
LOG_ROOT="/var/log/echo-archives"
BACKUP_ROOT="/var/backups/echo-archives-launch-maintenance"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RUN_DIR=""
TEMP_ROOT=""
ARCHIVIST_RESTORE_ROOT=""
LOG_FILE=""
CURRENT_STAGE="preflight"
CURRENT_ROLLBACK=""
ROLLBACK_RUNNING=0
BETTER_STACK_INSTALLED="no"
RUNTIME_MIGRATION_APPLIED="no"
CADDY_CONFIG_CHANGED="no"
CADDY_UPGRADED="no"
OLLAMA_UPGRADED="no"
BACKUP_DRILL_COMPLETED="no"
ROLLBACK_DRILL_COMPLETED="no"
BACKUP_UNIT_TRANSITION="no"
BACKUP_UNIT_NEEDS_INSTALL="no"
BACKUP_MONITOR_FRESHNESS_DEFERRED="no"
BACKUP_MONITOR_FRESHNESS_RECOVERED="no"
LOCAL_MONITOR_TIMER_PAUSED="no"
STAGE_RESULTS=()

usage() {
  cat <<'USAGE'
Usage:
  deploy/complete-launch-maintenance.sh --repository-check --expected-commit SHA
  sudo deploy/complete-launch-maintenance.sh --check --expected-commit SHA
  sudo deploy/complete-launch-maintenance.sh --apply --expected-commit SHA

--repository-check performs only unprivileged offline validation.
--check performs the complete root preflight without applying production changes.
--apply runs the controlled maintenance stages.
USAGE
}

log() {
  printf '[%s] [%s] %s\n' "$(date --iso-8601=seconds)" "${CURRENT_STAGE}" "$*"
}

fail() {
  log "FAIL: $*" >&2
  return 1
}

safe_remove_temp() {
  local path="$1"
  if [[ -n "${path}" &&
    "${path}" == /var/tmp/echo-launch-maintenance.* &&
    -d "${path}" &&
    ! -L "${path}" ]]; then
    find "${path}" -xdev -depth -delete
  fi
}

cleanup() {
  if [[ -n "${ARCHIVIST_RESTORE_ROOT}" &&
    "${ARCHIVIST_RESTORE_ROOT}" == /var/tmp/echo-archives-pi-restore.archivist.* &&
    -d "${ARCHIVIST_RESTORE_ROOT}" &&
    ! -L "${ARCHIVIST_RESTORE_ROOT}" ]]; then
    find "${ARCHIVIST_RESTORE_ROOT}" -xdev -depth -delete
  fi
  ARCHIVIST_RESTORE_ROOT=""
  if [[ "${LOCAL_MONITOR_TIMER_PAUSED}" == "yes" ]]; then
    if ! resume_local_monitor_timer; then
      log "CLEANUP FAILED: restart echo-archives-local-monitor.timer before leaving maintenance."
    fi
  fi
  safe_remove_temp "${TEMP_ROOT}" || true
  TEMP_ROOT=""
}

pause_local_monitor_timer() {
  systemctl is-enabled --quiet echo-archives-local-monitor.timer ||
    fail "local monitor timer must remain enabled during maintenance"
  systemctl is-active --quiet echo-archives-local-monitor.timer ||
    fail "local monitor timer was not active before the freshness deferral"
  LOCAL_MONITOR_TIMER_PAUSED="yes"
  systemctl stop echo-archives-local-monitor.timer
  if systemctl is-active --quiet echo-archives-local-monitor.timer; then
    fail "local monitor timer did not pause for the verified backup window"
    return 1
  fi
  return 0
}

resume_local_monitor_timer() {
  [[ "${LOCAL_MONITOR_TIMER_PAUSED}" == "yes" ]] || return 0
  systemctl start echo-archives-local-monitor.timer
  systemctl is-active --quiet echo-archives-local-monitor.timer ||
    fail "local monitor timer did not resume after the backup window"
  LOCAL_MONITOR_TIMER_PAUSED="no"
}

on_error() {
  local status="$?"
  local line="$1"
  trap - ERR
  log "Maintenance stopped at line ${line} with exit status ${status}."
  if [[ -n "${CURRENT_ROLLBACK}" && "${ROLLBACK_RUNNING}" -eq 0 ]]; then
    ROLLBACK_RUNNING=1
    log "Attempting rollback for the current stage only: ${CURRENT_STAGE}."
    if "${CURRENT_ROLLBACK}"; then
      log "Current-stage rollback completed."
    else
      log "ROLLBACK FAILED. Do not continue; use the recovery commands in COMPLETE_LAUNCH_MAINTENANCE.md."
    fi
  fi
  log "FAIL summary: completed stages: ${STAGE_RESULTS[*]:-none}; failed stage: ${CURRENT_STAGE}."
  [[ -z "${LOG_FILE}" ]] || log "Protected log: ${LOG_FILE}"
  exit "${status}"
}

parse_arguments() {
  while (($# > 0)); do
    case "$1" in
      --repository-check|--check|--apply)
        [[ -z "${MODE}" ]] || {
          usage >&2
          exit 2
        }
        MODE="${1#--}"
        shift
        ;;
      --expected-commit)
        [[ "$#" -ge 2 ]] || {
          usage >&2
          exit 2
        }
        EXPECTED_COMMIT="$2"
        shift 2
        ;;
      --help|-h)
        usage
        exit 0
        ;;
      *)
        usage >&2
        exit 2
        ;;
    esac
  done
  [[ -n "${MODE}" && "${EXPECTED_COMMIT}" =~ ^[0-9a-f]{40}$ ]] || {
    usage >&2
    exit 2
  }
}

operator_git() {
  if [[ "${EUID}" -eq 0 ]]; then
    runuser -u "${OPERATOR_USER}" -- git -C "${REPO_ROOT}" "$@"
  else
    git -C "${REPO_ROOT}" "$@"
  fi
}

verify_checkout() {
  [[ "$(hostname)" == "${EXPECTED_HOST}" ]] ||
    fail "expected host ${EXPECTED_HOST}; found $(hostname)"
  [[ "$(uname -m)" == "x86_64" ]] ||
    fail "this reviewed maintenance is only for x86_64"
  [[ "$(readlink -f "${REPO_ROOT}")" == "${REPO_ROOT}" ]] ||
    fail "repository path is not the reviewed fixed checkout"
  [[ "$(operator_git rev-parse HEAD)" == "${EXPECTED_COMMIT}" ]] ||
    fail "checkout HEAD does not match --expected-commit"
  [[ "$(operator_git symbolic-ref --quiet --short HEAD)" == "${EXPECTED_BRANCH}" ]] ||
    fail "checkout is not on ${EXPECTED_BRANCH}"
  [[ "$(operator_git rev-parse "refs/remotes/origin/${EXPECTED_BRANCH}")" == "${EXPECTED_COMMIT}" ]] ||
    fail "origin/${EXPECTED_BRANCH} does not match the expected commit"
  [[ -z "$(operator_git status --porcelain --untracked-files=normal)" ]] ||
    fail "production checkout is not clean"
}

assert_file_hash() {
  local algorithm="$1"
  local expected="$2"
  local path="$3"
  local actual
  [[ -f "${path}" && ! -L "${path}" ]] ||
    fail "required artifact is missing or unsafe: ${path}"
  case "${algorithm}" in
    sha256)
      actual="$(sha256sum "${path}" | awk '{print $1}')"
      ;;
    sha512)
      actual="$(sha512sum "${path}" | awk '{print $1}')"
      ;;
    *)
      fail "unsupported hash algorithm: ${algorithm}"
      ;;
  esac
  [[ "${actual}" == "${expected}" ]] ||
    fail "checksum mismatch for $(basename -- "${path}")"
}

validate_artifacts() {
  assert_file_hash sha512 "${CADDY_NEW_SHA512}" "${CADDY_NEW_PACKAGE}"
  assert_file_hash sha512 "${CADDY_OLD_SHA512}" "${CADDY_OLD_PACKAGE}"
  assert_file_hash sha256 "${OLLAMA_NEW_SHA256}" "${OLLAMA_NEW_ARCHIVE}"
  assert_file_hash sha256 "${OLLAMA_FALLBACK_SHA256}" "${OLLAMA_FALLBACK_ARCHIVE}"
  [[ -x "${CADDY_STAGED_BIN}" && ! -L "${CADDY_STAGED_BIN}" ]] ||
    fail "staged Caddy 2.11.4 binary is missing"
  "${CADDY_STAGED_BIN}" version | grep -Fq "v2.11.4" ||
    fail "staged Caddy binary does not report v2.11.4"
  tar --zstd --list --file "${OLLAMA_NEW_ARCHIVE}" |
    awk '
      $0 == "bin/ollama" { has_binary = 1 }
      /^lib\/ollama\// { has_library = 1 }
      END { exit !(has_binary && has_library) }
    ' ||
    fail "Ollama upgrade archive lacks its binary or library tree"
}

validate_repository_files() {
  local script
  for script in \
    deploy/complete-launch-maintenance.sh \
    deploy/check-cloudflare-proxy-ranges.sh \
    deploy/prepare-caddy-origin-candidate.sh \
    deploy/migrate-echo-archives-runtime-account.sh \
    deploy/complete-pi-backup-setup.sh \
    deploy/echo-archives-offsite-backup.sh \
    deploy/check-echo-archives-production.sh \
    deploy/verify-restored-application.sh \
    deploy/verify-deployment-rollback-invariants.sh; do
    bash -n "${REPO_ROOT}/${script}"
  done
  node --check "${REPO_ROOT}/deploy/notify-better-stack-heartbeat.js"
  node --check "${REPO_ROOT}/deploy/validate-caddy-origin-semantics.js"
  systemd-analyze verify \
    "${REPO_ROOT}/deploy/echo-archives.service" \
    "${REPO_ROOT}/deploy/echo-archives-offsite-backup.service" \
    "${REPO_ROOT}/deploy/echo-archives-offsite-backup.timer"
  validate_artifacts
  local preserved_candidate="${ARTIFACT_ROOT}/Caddyfile.origin-candidate"
  [[ -f "${preserved_candidate}" && ! -L "${preserved_candidate}" ]] ||
    preserved_candidate="${ARTIFACT_ROOT}/Caddyfile.candidate"
  [[ -f "${preserved_candidate}" && ! -L "${preserved_candidate}" ]] ||
    fail "preserved full shared-host Caddy candidate is missing"
  "${CADDY_STAGED_BIN}" validate \
    --config "${preserved_candidate}" --adapter caddyfile
  node "${REPO_ROOT}/deploy/validate-caddy-origin-semantics.js" \
    "${preserved_candidate}" "${CADDY_STAGED_BIN}"
  log "Repository scripts, staged units, upgrade artifacts, and Caddy candidate validated."
}

validate_restic_prerequisites() {
  local env_file="/etc/echo-archives/pi-restic.env"
  local password_file="/etc/echo-archives/pi-restic-password"
  local identity="/root/.ssh/echo-archives-pi-backup"
  for path in "${env_file}" "${password_file}" "${identity}"; do
    [[ -f "${path}" && ! -L "${path}" ]] ||
      fail "required Restic file is missing or unsafe: ${path}"
    [[ "$(stat -c '%U:%G %a' "${path}")" == "root:root 600" ]] ||
      fail "${path} must be root:root mode 0600"
  done
  [[ "$(stat -c '%U:%G %a' /root/.ssh)" == "root:root 700" ]] ||
    fail "/root/.ssh must be root:root mode 0700"
  (
    set -a
    # Root-owned, mode-0600 operational configuration; never print it.
    source "${env_file}"
    set +a
    [[ "${RESTIC_REPOSITORY:-}" == \
      "sftp:echo-backup-pi:/home/echo-backup/echo-archives-restic" ]]
    [[ "${RESTIC_PASSWORD_FILE:-}" == "${password_file}" ]]
    [[ -z "${RESTIC_PASSWORD:-}" ]]
    export HOME=/root
    export RESTIC_CACHE_DIR=/var/cache/echo-archives-pi-restic
    restic snapshots --json --tag echo-archives >/dev/null
  ) || fail "Restic environment, credentials, or existing repository access failed"
  HOME=/root ssh -G echo-backup-pi |
    awk '$1 == "hostname" && $2 == "100.102.113.86" { found = 1 }
      END { exit(found ? 0 : 1) }' ||
    fail "reviewed Pi SSH alias host changed"
  HOME=/root ssh -G echo-backup-pi |
    awk '$1 == "user" && $2 == "echo-backup" { found = 1 }
      END { exit(found ? 0 : 1) }' ||
    fail "reviewed Pi SSH alias user changed"
  HOME=/root ssh -G echo-backup-pi |
    awk '$1 == "identityfile" &&
      $2 == "/root/.ssh/echo-archives-pi-backup" { found = 1 }
      END { exit(found ? 0 : 1) }' ||
    fail "reviewed Pi SSH alias identity changed"
  tailscale ping --c=1 --timeout=20s --until-direct=false 100.102.113.86 >/dev/null
  HOME=/root ssh -o BatchMode=yes -o ConnectTimeout=20 \
    echo-backup-pi /usr/bin/true
}

capture_current_unit_journal() {
  local unit="$1"
  local output="$2"
  local invocation

  invocation="$(systemctl show "${unit}" -p InvocationID --value)"
  [[ "${invocation}" =~ ^[0-9a-f]{32}$ ]] ||
    fail "could not identify the current failed invocation for ${unit}"
  journalctl "_SYSTEMD_INVOCATION_ID=${invocation}" \
    --output cat --no-pager > "${output}"
  [[ -s "${output}" ]] ||
    fail "the current failed invocation for ${unit} has no journal evidence"
}

offsite_success_marker_is_stale() {
  local marker_time
  local now

  [[ -f "${OFFSITE_SUCCESS_MARKER}" &&
    ! -L "${OFFSITE_SUCCESS_MARKER}" ]] || return 1
  marker_time="$(stat -c %Y "${OFFSITE_SUCCESS_MARKER}")"
  now="$(date +%s)"
  [[ "${marker_time}" =~ ^[0-9]+$ && "${now}" =~ ^[0-9]+$ ]] || return 2
  (( marker_time <= now )) || return 2
  if (( now - marker_time > MAX_OFFSITE_MARKER_AGE_HOURS * 3600 )); then
    return 0
  fi
  return 1
}

classify_backup_unit_transition() {
  local failed_units="${TEMP_ROOT}/failed-units.txt"
  local unexpected_units="${TEMP_ROOT}/unexpected-failed-units.txt"
  local installed_unit="${TEMP_ROOT}/offsite-unit.installed"
  local offsite_journal="${TEMP_ROOT}/offsite-unit.journal"
  local monitor_journal="${TEMP_ROOT}/local-monitor.journal"
  local offsite_failed="no"
  local monitor_failed="no"
  local marker_stale="no"
  local marker_status=0

  systemctl --failed --no-legend --plain |
    awk '{print $1}' |
    sort -u > "${failed_units}"
  systemctl cat echo-archives-offsite-backup.service \
    > "${installed_unit}"

  grep -Fq \
    "ReadWritePaths=${REPO_ROOT}/backend/data/backups" \
    "${OFFSITE_BACKUP_UNIT_CANDIDATE}" ||
    fail "reviewed off-site unit does not contain the required backup write path"

  if ! grep -Fq \
    "ReadWritePaths=${REPO_ROOT}/backend/data/backups" \
    "${installed_unit}"; then
    BACKUP_UNIT_NEEDS_INSTALL="yes"
  fi

  awk '
    $1 != "echo-archives-offsite-backup.service" &&
    $1 != "echo-archives-local-monitor.service" { print }
  ' "${failed_units}" > "${unexpected_units}"
  [[ ! -s "${unexpected_units}" ]] ||
    fail "an unrelated system unit is already failed"

  offsite_success_marker_is_stale || marker_status="$?"
  case "${marker_status}" in
    0)
      marker_stale="yes"
      ;;
    1)
      ;;
    *)
      fail "off-site backup success marker timestamp is invalid or in the future"
      ;;
  esac

  if grep -Fxq "echo-archives-offsite-backup.service" "${failed_units}"; then
    offsite_failed="yes"
    capture_current_unit_journal \
      echo-archives-offsite-backup.service "${offsite_journal}"
    grep -Fq ".retention-write-probe." "${offsite_journal}" &&
      grep -Fq "Read-only file system" "${offsite_journal}" ||
      fail "off-site backup failure does not match the reviewed sandbox transition"
  fi

  if grep -Fxq "echo-archives-local-monitor.service" "${failed_units}"; then
    monitor_failed="yes"
    capture_current_unit_journal \
      echo-archives-local-monitor.service "${monitor_journal}"
    if grep -Fq "FAIL: One or more systemd units are failed." \
      "${monitor_journal}"; then
      [[ "${offsite_failed}" == "yes" ]] ||
        fail "local monitor reports a backup cascade without a failed backup unit"
    elif grep -Eq \
      'FAIL: Off-site backup success marker is [0-9]+h old\.' \
      "${monitor_journal}"; then
      [[ "${offsite_failed}" == "no" ]] ||
        fail "local monitor freshness failure is mixed with a failed backup unit"
      [[ "${BACKUP_UNIT_NEEDS_INSTALL}" == "no" ]] ||
        fail "local monitor freshness failed before the reviewed backup unit was installed"
      [[ "${marker_stale}" == "yes" ]] ||
        fail "off-site backup success marker is missing, unsafe, or inconsistent with the current freshness failure"
      BACKUP_MONITOR_FRESHNESS_DEFERRED="yes"
    else
      fail "local monitor failure is neither the reviewed backup cascade nor stale backup freshness"
    fi
  fi

  if [[ "${marker_stale}" == "yes" && "${offsite_failed}" == "no" &&
    "${monitor_failed}" == "no" ]]; then
    [[ "${BACKUP_UNIT_NEEDS_INSTALL}" == "no" ]] ||
      fail "stale off-site freshness cannot be deferred before the reviewed backup unit is installed"
    BACKUP_MONITOR_FRESHNESS_DEFERRED="yes"
  fi

  if [[ "${offsite_failed}" == "no" && "${monitor_failed}" == "no" &&
    "${BACKUP_UNIT_NEEDS_INSTALL}" != "yes" && "${marker_stale}" != "yes" ]]; then
    return
  fi

  BACKUP_UNIT_TRANSITION="yes"
  if [[ "${BACKUP_MONITOR_FRESHNESS_DEFERRED}" == "yes" ]]; then
    log "Accepted the current stale off-site freshness marker; monitor recovery is deferred until the verified Restic backup stage."
  else
    log "Accepted only the reviewed off-site sandbox transition; unrelated failed units remain fatal."
  fi
}

require_root_identity() {
  [[ "${EUID}" -eq 0 ]] || fail "run --${MODE} through sudo"
  [[ "${SUDO_USER:-}" == "${OPERATOR_USER}" ]] ||
    fail "run this exact script with sudo from ${OPERATOR_USER}"
  [[ "$(id -u "${OPERATOR_USER}")" == "1000" ]] ||
    fail "expected operator UID 1000 changed"
  verify_checkout
}

require_root_context() {
  require_root_identity
  local command_name
  for command_name in \
    awk basename bash caddy chmod chown cmp cp curl date df diff dpkg dpkg-query env \
    find flock getent git grep hostname id install ip jq journalctl lsblk mktemp mv \
    nft node npm openssl readlink restic rm runuser sed sha256sum sha512sum sleep \
    smartctl sort ssh ss stat systemctl systemd-analyze tail tailscale tar tee \
    timeout touch tr ufw uname wc zstd; do
    command -v "${command_name}" >/dev/null 2>&1 ||
      fail "required command is missing: ${command_name}"
  done
  [[ -f /etc/caddy/Caddyfile && ! -L /etc/caddy/Caddyfile ]] ||
    fail "live Caddyfile is missing or a symlink"
  [[ -f "${REPO_ROOT}/backend/.env" && ! -L "${REPO_ROOT}/backend/.env" ]] ||
    fail "production backend environment is missing or a symlink"
  for unit in caddy.service echo-archives.service ollama.service; do
    systemctl is-active --quiet "${unit}" ||
      fail "${unit} must be active before maintenance"
  done
  caddy version 2>&1 |
    grep -Eq 'v2\.(10\.2|11\.4)([[:space:]]|$)' ||
    fail "installed Caddy is neither reviewed version 2.10.2 nor 2.11.4"
  /usr/local/bin/ollama --version 2>&1 |
    grep -Eq '0\.(6\.7|32\.5)([[:space:]]|$)' ||
    fail "installed Ollama is neither reviewed version 0.6.7 nor 0.32.5"
  classify_backup_unit_transition
  validate_repository_files
  "${REPO_ROOT}/deploy/check-cloudflare-proxy-ranges.sh" --confirm-network
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
  "${CADDY_STAGED_BIN}" validate \
    --config /etc/caddy/Caddyfile --adapter caddyfile
  [[ "$(stat -c %a "${CADDY_NEW_PACKAGE}")" == "600" &&
    "$(stat -c %a "${CADDY_OLD_PACKAGE}")" == "600" &&
    "$(stat -c %a "${OLLAMA_NEW_ARCHIVE}")" == "600" &&
    "$(stat -c %a "${OLLAMA_FALLBACK_ARCHIVE}")" == "600" ]] ||
    fail "staged artifacts must remain mode 0600"
  [[ "$(df --output=avail -B1 "${REPO_ROOT}" | tail -n 1 | tr -d ' ')" -ge 21474836480 ]] ||
    fail "at least 20 GiB free space is required"
  validate_restic_prerequisites
  local better_status=0
  validate_better_stack_secret || better_status="$?"
  [[ "${better_status}" -eq 0 || "${better_status}" -eq 2 ]] ||
    fail "existing Better Stack heartbeat configuration is invalid"
  if [[ "${better_status}" -eq 2 &&
    -e /etc/systemd/system/echo-archives-offsite-backup.service.d/better-stack-heartbeat.conf ]]; then
    fail "Better Stack drop-in exists without its required protected environment"
  fi
  runuser -u "${OPERATOR_USER}" -- env NODE_ENV=production \
    npm --prefix "${REPO_ROOT}" run check:config
  log "Root preflight passed; no production configuration was changed."
}

prepare_root_run() {
  install -d -m 0700 -o root -g root "${LOG_ROOT}" "${BACKUP_ROOT}"
  RUN_DIR="${BACKUP_ROOT}/${TIMESTAMP}"
  [[ ! -e "${RUN_DIR}" ]] || fail "run directory already exists: ${RUN_DIR}"
  install -d -m 0700 -o root -g root "${RUN_DIR}"
  LOG_FILE="${LOG_ROOT}/complete-launch-maintenance-${TIMESTAMP}.log"
  touch "${LOG_FILE}"
  chmod 0600 "${LOG_FILE}"
  exec > >(tee -a "${LOG_FILE}") 2>&1
  TEMP_ROOT="$(mktemp -d /var/tmp/echo-launch-maintenance.XXXXXX)"
  chmod 0700 "${TEMP_ROOT}"
}

preserve_optional_file() {
  local source="$1"
  local name="$2"
  [[ ! -L "${source}" ]] || fail "refusing symbolic link: ${source}"
  if [[ -f "${source}" ]]; then
    cp -a -- "${source}" "${RUN_DIR}/${name}"
  else
    touch "${RUN_DIR}/${name}.absent"
  fi
}

restore_optional_file() {
  local destination="$1"
  local name="$2"
  local mode="${3:-0644}"
  if [[ -f "${RUN_DIR}/${name}" ]]; then
    install -D -m "${mode}" -o root -g root "${RUN_DIR}/${name}" "${destination}"
  elif [[ -f "${RUN_DIR}/${name}.absent" ]]; then
    rm -f -- "${destination}"
  else
    fail "rollback record for ${destination} is incomplete"
  fi
}

capture_shared_routes() {
  local config="$1"
  local output="$2"
  local adapted="${TEMP_ROOT}/caddy-adapted.json"
  local hosts="${TEMP_ROOT}/caddy-hosts.txt"
  caddy adapt --config "${config}" --adapter caddyfile > "${adapted}"
  node - "${adapted}" > "${hosts}" <<'NODE'
const fs = require("node:fs");
const config = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const hosts = new Set();
function walk(value) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) return value.forEach(walk);
  if (Array.isArray(value.host)) {
    for (const host of value.host) {
      if (
        typeof host === "string" &&
        !["echoarchives.net", "www.echoarchives.net", "echo.continental-hub.com"].includes(host)
      ) hosts.add(host);
    }
  }
  Object.values(value).forEach(walk);
}
walk(config);
for (const host of [...hosts].sort()) process.stdout.write(`${host}\n`);
NODE
  [[ -s "${hosts}" ]] || fail "no unrelated shared Caddy hosts were discovered"
  : > "${output}"
  local host
  local status
  while IFS= read -r host; do
    status="$(
      curl --silent --show-error --max-time 15 \
        --resolve "${host}:443:127.0.0.1" \
        --output /dev/null --write-out '%{http_code}' \
        "https://${host}/"
    )" || fail "shared-host origin request failed for ${host}"
    [[ "${status}" =~ ^[1-5][0-9][0-9]$ ]] ||
      fail "shared-host origin returned an invalid status for ${host}"
    printf '%s\t%s\n' "${host}" "${status}" >> "${output}"
  done < "${hosts}"
}

compare_shared_routes() {
  local before="$1"
  local after="$2"
  cmp --silent "${before}" "${after}" || {
    diff --unified "${before}" "${after}" || true
    fail "an unrelated shared Caddy host changed status"
  }
}

stage_preserve_baseline() {
  cp -a -- /etc/caddy/Caddyfile "${RUN_DIR}/Caddyfile.before"
  systemctl cat caddy.service > "${RUN_DIR}/caddy.service.before"
  systemctl cat echo-archives.service > "${RUN_DIR}/echo-archives.service.before"
  preserve_optional_file \
    /etc/systemd/system/ollama.service \
    ollama.service.before
  caddy version > "${RUN_DIR}/caddy.version.before" 2>&1
  /usr/local/bin/ollama --version > "${RUN_DIR}/ollama.version.before" 2>&1
  dpkg-query -W -f='${Package}\t${Version}\n' caddy > "${RUN_DIR}/caddy.package.before"
  cp -a -- /usr/local/bin/ollama "${RUN_DIR}/ollama.binary.before"
  [[ -d /usr/local/lib/ollama && ! -L /usr/local/lib/ollama ]] ||
    fail "installed Ollama library tree is missing or unsafe"
  cp -a -- /usr/local/lib/ollama "${RUN_DIR}/ollama-lib.before"
  preserve_optional_file \
    /etc/systemd/system/echo-archives-offsite-backup.service \
    offsite.service.before
  preserve_optional_file \
    /etc/systemd/system/echo-archives-offsite-backup.timer \
    offsite.timer.before
  preserve_optional_file \
    /etc/systemd/system/echo-archives-offsite-backup.service.d/better-stack-heartbeat.conf \
    better-stack-dropin.before
  capture_shared_routes /etc/caddy/Caddyfile "${RUN_DIR}/shared-routes.before"
  ss -H -ltnp > "${RUN_DIR}/listeners.before"
  log "Preserved configurations, versions, Ollama binaries, and shared-host baseline."
}

stage_fresh_database_backup() {
  runuser -u "${OPERATOR_USER}" -- \
    /usr/bin/node "${REPO_ROOT}/tools/backup-database.js"
  runuser -u "${OPERATOR_USER}" -- \
    /usr/bin/node "${REPO_ROOT}/tools/check-database-backup.js" \
      --max-age-hours 1 > "${RUN_DIR}/fresh-backup-verification.json"
  node - "${RUN_DIR}/fresh-backup-verification.json" <<'NODE'
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (
  result.ok !== true ||
  result.integrity !== "ok" ||
  result.foreignKeyViolations !== 0 ||
  !(result.counts?.podcasts > 0)
) process.exit(1);
NODE
  log "Fresh online SQLite backup passed integrity, foreign-key, freshness, and catalog checks."
}

rollback_backup_unit_transition() {
  restore_optional_file \
    /etc/systemd/system/echo-archives-offsite-backup.service \
    offsite.service.before 0644
  systemctl daemon-reload
  systemd-analyze verify \
    /etc/systemd/system/echo-archives-offsite-backup.service \
    /etc/systemd/system/echo-archives-offsite-backup.timer
}

stage_backup_unit_transition() {
  if [[ "${BACKUP_UNIT_TRANSITION}" != "yes" ]]; then
    log "Installed off-site service already has the reviewed backup write path."
    return
  fi

  if [[ "${BACKUP_UNIT_NEEDS_INSTALL}" == "yes" ]]; then
    CURRENT_ROLLBACK=rollback_backup_unit_transition
    install -m 0644 -o root -g root \
      "${REPO_ROOT}/deploy/echo-archives-offsite-backup.service" \
      /etc/systemd/system/echo-archives-offsite-backup.service
  else
    log "Reviewed off-site unit was already reconciled; preserving it idempotently."
  fi
  systemd-analyze verify \
    /etc/systemd/system/echo-archives-offsite-backup.service \
    /etc/systemd/system/echo-archives-offsite-backup.timer
  systemctl daemon-reload
  systemctl cat echo-archives-offsite-backup.service \
    > "${TEMP_ROOT}/offsite-unit.reconciled"
  grep -Fq \
    "ReadWritePaths=${REPO_ROOT}/backend/data/backups" \
    "${TEMP_ROOT}/offsite-unit.reconciled" ||
    fail "installed off-site service still lacks the required backup write path"
  CURRENT_ROLLBACK=""
  log "Reconciled the staged backup script with its reviewed systemd write path; no backup was started."
}

rollback_caddy_configuration() {
  caddy validate --config "${RUN_DIR}/Caddyfile.before" --adapter caddyfile &&
    install -m 0644 -o root -g root \
      "${RUN_DIR}/Caddyfile.before" /etc/caddy/Caddyfile &&
    activate_caddy &&
    capture_shared_routes \
      /etc/caddy/Caddyfile "${RUN_DIR}/shared-routes.rollback-origin" &&
    compare_shared_routes \
      "${RUN_DIR}/shared-routes.before" \
      "${RUN_DIR}/shared-routes.rollback-origin" &&
    verify_public_echo
}

activate_caddy() {
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile ||
    return 1
  if systemctl is-active --quiet caddy.service; then
    systemctl reload caddy.service
  else
    systemctl start caddy.service
  fi
  systemctl is-active --quiet caddy.service
}

caddy_gate_is_installed() {
  local trusted_line
  local peer_line
  trusted_line="$(
    grep -F "trusted_proxies static" \
      "${REPO_ROOT}/deploy/Caddyfile.global.echo"
  )"
  peer_line="$(
    grep -F "not remote_ip" "${REPO_ROOT}/deploy/Caddyfile.echo" |
      sed -n '1p'
  )"
  grep -Fq "trusted_proxies_strict" /etc/caddy/Caddyfile &&
    grep -Fq "client_ip_headers CF-Connecting-IP" /etc/caddy/Caddyfile &&
    grep -Fq "strict_sni_host on" /etc/caddy/Caddyfile &&
    [[ "$(grep -Fc "abort @not_cloudflare" /etc/caddy/Caddyfile)" -eq 2 ]] &&
    grep -Fq "header_up X-Forwarded-For {http.request.header.CF-Connecting-IP}" \
      /etc/caddy/Caddyfile &&
    grep -Fq "${trusted_line}" /etc/caddy/Caddyfile &&
    [[ "$(grep -Fc "${peer_line}" /etc/caddy/Caddyfile)" -eq 2 ]]
}

verify_public_echo() {
  local health="${TEMP_ROOT}/public-health.json"
  local homepage="${TEMP_ROOT}/public-homepage.html"
  curl --fail --silent --show-error --max-time 20 \
    --output "${health}" https://echoarchives.net/api/health
  node - "${health}" <<'NODE'
const fs = require("node:fs");
const health = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (health.ok !== true || health.service !== "echo-archives") process.exit(1);
NODE
  curl --fail --silent --show-error --max-time 20 \
    --output "${homepage}" https://echoarchives.net/
  grep -Fq "The Echo Archives" "${homepage}"
}

expect_direct_origin_blocked() {
  local headers=(
    "X-Forwarded-For: 198.51.100.23"
    "CF-Connecting-IP: 198.51.100.23"
  )
  if curl --silent --show-error --insecure --max-time 10 \
    --resolve "echoarchives.net:443:127.0.0.1" \
    --header "${headers[0]}" --header "${headers[1]}" \
    --output /dev/null https://echoarchives.net/api/health; then
    fail "direct loopback origin request with spoofed proxy headers was not blocked"
  fi
  if curl --silent --show-error --insecure --max-time 10 \
    --resolve "www.echoarchives.net:443:127.0.0.1" \
    --header "${headers[0]}" --header "${headers[1]}" \
    --output /dev/null https://www.echoarchives.net/; then
    fail "direct www origin request with spoofed proxy headers was not blocked"
  fi
  local mismatched_status
  mismatched_status="$(
    curl --silent --show-error --insecure --max-time 10 \
      --resolve "continental-hub.com:443:127.0.0.1" \
      --header "Host: echoarchives.net" \
      --header "${headers[0]}" --header "${headers[1]}" \
      --output /dev/null --write-out '%{http_code}' \
      https://continental-hub.com/api/health
  )" || mismatched_status="000"
  [[ "${mismatched_status}" != "200" ]] ||
    fail "mismatched SNI/Host plus spoofed proxy headers reached Echo"
}

stage_caddy_origin_gate() {
  local candidate="${RUN_DIR}/Caddyfile.origin-candidate"
  CURRENT_ROLLBACK=rollback_caddy_configuration
  if caddy_gate_is_installed; then
    cp -a -- /etc/caddy/Caddyfile "${candidate}"
    log "Cloudflare origin gate is already installed; validating idempotently."
  else
    "${REPO_ROOT}/deploy/prepare-caddy-origin-candidate.sh" \
      /etc/caddy/Caddyfile "${candidate}"
    caddy validate --config "${candidate}" --adapter caddyfile
    "${CADDY_STAGED_BIN}" validate --config "${candidate}" --adapter caddyfile
    install -m 0644 -o root -g root "${candidate}" /etc/caddy/Caddyfile
    caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
    systemctl reload caddy.service
    CADDY_CONFIG_CHANGED="yes"
  fi
  caddy validate --config "${candidate}" --adapter caddyfile
  "${CADDY_STAGED_BIN}" validate --config "${candidate}" --adapter caddyfile
  node "${REPO_ROOT}/deploy/validate-caddy-origin-semantics.js" \
    "${candidate}" "${CADDY_STAGED_BIN}"
  systemctl is-active --quiet caddy.service
  capture_shared_routes /etc/caddy/Caddyfile "${RUN_DIR}/shared-routes.after-origin-gate"
  compare_shared_routes \
    "${RUN_DIR}/shared-routes.before" \
    "${RUN_DIR}/shared-routes.after-origin-gate"
  verify_public_echo
  expect_direct_origin_blocked
  CURRENT_ROLLBACK=""
  log "Reviewed proxy configuration and direct/header-spoof blocking passed local/public checks."
}

rollback_caddy_upgrade() {
  local rollback_package="${CADDY_OLD_PACKAGE}"
  if grep -Fq "v2.11.4" "${RUN_DIR}/caddy.version.before"; then
    rollback_package="${CADDY_NEW_PACKAGE}"
  fi
  env DEBIAN_FRONTEND=noninteractive \
    dpkg --force-confold --install "${rollback_package}" &&
    install -m 0644 -o root -g root \
      "${RUN_DIR}/Caddyfile.before-upgrade" /etc/caddy/Caddyfile &&
    activate_caddy &&
    capture_shared_routes \
      /etc/caddy/Caddyfile "${RUN_DIR}/shared-routes.rollback-upgrade" &&
    compare_shared_routes \
      "${RUN_DIR}/shared-routes.before" \
      "${RUN_DIR}/shared-routes.rollback-upgrade" &&
    verify_public_echo &&
    expect_direct_origin_blocked
}

stage_caddy_upgrade() {
  cp -a -- /etc/caddy/Caddyfile "${RUN_DIR}/Caddyfile.before-upgrade"
  CURRENT_ROLLBACK=rollback_caddy_upgrade
  if caddy version 2>&1 | grep -Fq "v2.11.4"; then
    log "Caddy already reports v2.11.4; verifying idempotently."
  else
    "${CADDY_STAGED_BIN}" validate \
      --config /etc/caddy/Caddyfile --adapter caddyfile
    env DEBIAN_FRONTEND=noninteractive \
      dpkg --force-confold --install "${CADDY_NEW_PACKAGE}"
    caddy version 2>&1 | grep -Fq "v2.11.4" ||
      fail "installed Caddy does not report v2.11.4"
    CADDY_UPGRADED="yes"
  fi
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
  systemctl reload caddy.service
  systemctl is-active --quiet caddy.service
  capture_shared_routes /etc/caddy/Caddyfile "${RUN_DIR}/shared-routes.after-caddy-upgrade"
  compare_shared_routes \
    "${RUN_DIR}/shared-routes.before" \
    "${RUN_DIR}/shared-routes.after-caddy-upgrade"
  verify_public_echo
  expect_direct_origin_blocked
  CURRENT_ROLLBACK=""
  log "Caddy v2.11.4 and every discovered shared-host status verified."
}

stage_runtime_migration() {
  if "${REPO_ROOT}/deploy/migrate-echo-archives-runtime-account.sh" --check; then
    log "Dedicated runtime account already passed; restarting Echo to load the exact pinned checkout."
    systemctl restart echo-archives.service
    local attempt
    for attempt in {1..20}; do
      if curl --fail --silent --show-error --max-time 5 \
        http://127.0.0.1:3010/api/health >/dev/null; then
        break
      fi
      [[ "${attempt}" -lt 20 ]] ||
        fail "Echo did not recover after the controlled runtime-account restart"
      sleep 2
    done
  else
    SUDO_USER="${OPERATOR_USER}" \
      "${REPO_ROOT}/deploy/migrate-echo-archives-runtime-account.sh" --apply
    RUNTIME_MIGRATION_APPLIED="yes"
  fi
  "${REPO_ROOT}/deploy/migrate-echo-archives-runtime-account.sh" --check
  log "Dedicated account, targeted writes, hardened units, import/publication write paths, backup access, and Ollama access verified."
}

validate_live_health_file() {
  local file="$1"
  node - "${file}" <<'NODE'
const fs = require("node:fs");
const health = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (
  health.ok !== true ||
  !(health.catalogCount > 0) ||
  health.features?.communityRatingWrites !== true ||
  health.features?.maintainerReview !== true ||
  health.features?.accessLogs !== true ||
  health.durability?.journalMode !== "WAL" ||
  health.durability?.synchronous !== "FULL"
) process.exit(1);
NODE
}

verify_null_rating_output() {
  local origin="$1"
  local output="$2"
  curl --fail --silent --show-error --max-time 15 \
    --output "${output}" "${origin}/shows/marsfall"
  grep -Fq "Unrated" "${output}" ||
    fail "Marsfall did not render Unrated at ${origin}"
  if grep -Eq '0(?:\.0)?[[:space:]]*/[[:space:]]*10|0\.0</' "${output}"; then
    fail "Marsfall emitted a false 0/10 rating at ${origin}"
  fi
}

stage_application_verification() {
  local local_health="${TEMP_ROOT}/local-health.json"
  local public_health="${TEMP_ROOT}/public-health-after-runtime.json"
  curl --fail --silent --show-error --max-time 10 \
    --output "${local_health}" http://127.0.0.1:3010/api/health
  curl --fail --silent --show-error --max-time 20 \
    --output "${public_health}" https://echoarchives.net/api/health
  validate_live_health_file "${local_health}"
  validate_live_health_file "${public_health}"
  [[ "$(systemctl show echo-archives.service -p User --value)" == "${RUNTIME_USER}" ]] ||
    fail "Echo does not run as ${RUNTIME_USER}"
  ss -H -ltn | awk '
    $4 ~ /:3010$/ && $4 != "127.0.0.1:3010" { bad = 1 }
    END { exit(bad ? 1 : 0) }
  ' || fail "Echo is not bound only to loopback"
  verify_null_rating_output "http://127.0.0.1:3010" "${TEMP_ROOT}/marsfall-local.html"
  verify_null_rating_output "https://echoarchives.net" "${TEMP_ROOT}/marsfall-public.html"
  if [[ "${BACKUP_MONITOR_FRESHNESS_DEFERRED}" == "yes" ]]; then
    pause_local_monitor_timer
  fi
  if [[ "${BACKUP_UNIT_TRANSITION}" == "yes" ]]; then
    systemctl reset-failed \
      echo-archives-offsite-backup.service \
      echo-archives-local-monitor.service
  fi
  REQUIRE_OFFSITE_BACKUP=false \
    "${REPO_ROOT}/deploy/check-echo-archives-production.sh"
  if [[ "${BACKUP_MONITOR_FRESHNESS_DEFERRED}" == "yes" ]]; then
    log "Deferring the systemd monitor freshness check until the off-site stage completes a verified Restic backup."
  elif [[ "${BACKUP_UNIT_TRANSITION}" == "yes" ]]; then
    systemctl start echo-archives-local-monitor.service
    [[ "$(systemctl show echo-archives-local-monitor.service -p Result --value)" == "success" ]] ||
      fail "local monitor did not recover after the reviewed backup transition"
    [[ -z "$(systemctl --failed --no-legend --plain)" ]] ||
      fail "failed unit state remained after the reviewed backup transition"
  fi
  log "Live server fixes, feature flags, WAL/FULL durability, and null rating output verified."
}

validate_better_stack_secret() {
  local env_file="/etc/echo-archives/better-stack.env"
  [[ ! -L "${env_file}" ]] ||
    fail "${env_file} must not be a symbolic link"
  [[ -f "${env_file}" ]] || return 2
  [[ "$(stat -c '%U:%G %a' "${env_file}")" == "root:root 600" ]] ||
    fail "${env_file} must be root:root mode 0600"
  node - "${env_file}" "${REPO_ROOT}/deploy/notify-better-stack-heartbeat.js" <<'NODE'
const fs = require("node:fs");
const [envPath, modulePath] = process.argv.slice(2);
const lines = fs.readFileSync(envPath, "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"));
if (lines.length !== 1) process.exit(1);
const match = lines[0].match(/^BETTER_STACK_BACKUP_HEARTBEAT_URL=(.+)$/);
if (!match) process.exit(1);
if (match[1].includes("REPLACE_WITH_PROVIDER_VALUE")) process.exit(1);
require(modulePath).parseHeartbeatUrl(match[1]);
NODE
}

rollback_better_stack() {
  restore_optional_file \
    /etc/systemd/system/echo-archives-offsite-backup.service.d/better-stack-heartbeat.conf \
    better-stack-dropin.before 0644
  systemctl daemon-reload
  systemd-analyze verify \
    /etc/systemd/system/echo-archives-offsite-backup.service \
    /etc/systemd/system/echo-archives-offsite-backup.timer
}

stage_better_stack() {
  local secret_status=0
  validate_better_stack_secret || secret_status="$?"
  if [[ "${secret_status}" -eq 2 ]]; then
    [[ ! -e /etc/systemd/system/echo-archives-offsite-backup.service.d/better-stack-heartbeat.conf ]] ||
      fail "Better Stack drop-in exists without its required protected environment"
    log "SKIP: Better Stack heartbeat secret is absent; no drop-in was installed."
    return
  fi
  [[ "${secret_status}" -eq 0 ]] ||
    fail "Better Stack heartbeat environment failed validation"
  CURRENT_ROLLBACK=rollback_better_stack
  install -d -m 0755 -o root -g root \
    /etc/systemd/system/echo-archives-offsite-backup.service.d
  install -m 0644 -o root -g root \
    "${REPO_ROOT}/deploy/echo-archives-offsite-backup-heartbeat.conf" \
    /etc/systemd/system/echo-archives-offsite-backup.service.d/better-stack-heartbeat.conf
  systemd-analyze verify \
    /etc/systemd/system/echo-archives-offsite-backup.service \
    /etc/systemd/system/echo-archives-offsite-backup.timer
  systemctl daemon-reload
  systemctl cat echo-archives-offsite-backup.service |
    grep -Fq "notify-better-stack-heartbeat.js success" ||
    fail "Better Stack success integration is not active in the unit"
  systemctl cat echo-archives-offsite-backup.service |
    grep -Fq "notify-better-stack-heartbeat.js systemd-result" ||
    fail "Better Stack failure integration is not active in the unit"
  BETTER_STACK_INSTALLED="yes"
  CURRENT_ROLLBACK=""
  log "Better Stack backup heartbeat drop-in installed; the real backup stage will send success only after all checks."
}

rollback_backup_automation() {
  local heartbeat_backup="better-stack-dropin.pre-backup"
  if [[ "${BETTER_STACK_INSTALLED}" == "yes" ]]; then
    heartbeat_backup="better-stack-dropin.before"
  fi
  restore_optional_file \
    /etc/systemd/system/echo-archives-offsite-backup.service \
    offsite.service.pre-backup 0644
  restore_optional_file \
    /etc/systemd/system/echo-archives-offsite-backup.timer \
    offsite.timer.pre-backup 0644
  restore_optional_file \
    /etc/systemd/system/echo-archives-offsite-backup.service.d/better-stack-heartbeat.conf \
    "${heartbeat_backup}" 0644
  systemctl daemon-reload
  if grep -Fxq "enabled" "${RUN_DIR}/offsite-timer.enabled"; then
    systemctl enable echo-archives-offsite-backup.timer >/dev/null
  else
    systemctl disable echo-archives-offsite-backup.timer >/dev/null 2>&1 || true
  fi
  if grep -Fxq "active" "${RUN_DIR}/offsite-timer.active"; then
    systemctl start echo-archives-offsite-backup.timer
  else
    systemctl stop echo-archives-offsite-backup.timer >/dev/null 2>&1 || true
  fi
  systemctl reset-failed \
    echo-archives-offsite-backup.service \
    echo-archives-local-monitor.service
  if [[ "${BACKUP_MONITOR_FRESHNESS_DEFERRED}" == "yes" ]]; then
    log "Restored backup automation; local monitor remains pending because this failed stage did not publish a fresh off-site success marker."
  else
    systemctl start echo-archives-local-monitor.service
    [[ "$(systemctl show echo-archives-local-monitor.service -p Result --value)" == "success" ]]
    [[ -z "$(systemctl --failed --no-legend --plain)" ]]
  fi
  resume_local_monitor_timer
}

stage_backup_restore() {
  preserve_optional_file \
    /etc/systemd/system/echo-archives-offsite-backup.service \
    offsite.service.pre-backup
  preserve_optional_file \
    /etc/systemd/system/echo-archives-offsite-backup.timer \
    offsite.timer.pre-backup
  preserve_optional_file \
    /etc/systemd/system/echo-archives-offsite-backup.service.d/better-stack-heartbeat.conf \
    better-stack-dropin.pre-backup
  systemctl is-enabled echo-archives-offsite-backup.timer \
    > "${RUN_DIR}/offsite-timer.enabled" 2>/dev/null || true
  systemctl is-active echo-archives-offsite-backup.timer \
    > "${RUN_DIR}/offsite-timer.active" 2>/dev/null || true
  CURRENT_ROLLBACK=rollback_backup_automation
  SUDO_USER="${OPERATOR_USER}" \
    "${REPO_ROOT}/deploy/complete-pi-backup-setup.sh" --apply
  [[ "$(systemctl show echo-archives-offsite-backup.service -p Result --value)" == "success" ]] ||
    fail "off-site backup service did not finish successfully"
  [[ "$(systemctl show echo-archives-offsite-backup.service -p ExecMainStatus --value)" == "0" ]] ||
    fail "off-site backup service retained a nonzero exit status"
  systemctl is-enabled --quiet echo-archives-offsite-backup.timer
  systemctl is-active --quiet echo-archives-offsite-backup.timer
  [[ -f /var/lib/echo-archives-monitoring/pi-backup-readiness ]] ||
    fail "Pi backup readiness record is missing"
  grep -Fxq "restore_integrity=ok" \
    /var/lib/echo-archives-monitoring/pi-backup-readiness
  grep -Fxq "restore_foreign_key_violations=0" \
    /var/lib/echo-archives-monitoring/pi-backup-readiness
  [[ "$(systemctl show echo-archives-local-monitor.service -p Result --value)" == "success" ]] ||
    fail "local monitor did not pass after the verified off-site backup"
  [[ -z "$(systemctl --failed --no-legend --plain)" ]] ||
    fail "failed unit state remained after the verified off-site backup"
  resume_local_monitor_timer
  BACKUP_DRILL_COMPLETED="yes"
  if [[ "${BACKUP_MONITOR_FRESHNESS_DEFERRED}" == "yes" ]]; then
    BACKUP_MONITOR_FRESHNESS_RECOVERED="yes"
  fi
  CURRENT_ROLLBACK=""
  log "Newest Restic restore, isolated app, fresh encrypted backup, retention, restic check, timer, and local monitor passed."
}

rollback_ollama_upgrade() {
  systemctl stop ollama.service || true
  if [[ -d /usr/local/lib/ollama && ! -L /usr/local/lib/ollama ]]; then
    mv -- /usr/local/lib/ollama "${RUN_DIR}/ollama-lib.failed-${TIMESTAMP}" || true
  fi
  install -m 0755 -o root -g root \
      "${RUN_DIR}/ollama.binary.before" /usr/local/bin/ollama &&
    cp -a -- "${RUN_DIR}/ollama-lib.before" /usr/local/lib/ollama &&
    restore_optional_file \
      /etc/systemd/system/ollama.service ollama.service.before 0644 &&
    systemctl daemon-reload &&
    systemctl start ollama.service &&
    systemctl is-active --quiet ollama.service
}

verify_ollama_runtime() {
  systemctl is-active --quiet ollama.service
  /usr/local/bin/ollama --version 2>&1 | grep -Fq "0.32.5" ||
    fail "Ollama does not report 0.32.5"
  ss -H -ltn | awk '
    $4 ~ /:11434$/ && $4 != "127.0.0.1:11434" { bad = 1 }
    $4 == "127.0.0.1:11434" { found = 1 }
    END { exit(found && !bad ? 0 : 1) }
  ' || fail "Ollama is not listening only on 127.0.0.1:11434"
  curl --fail --silent --show-error --max-time 20 \
    --output "${TEMP_ROOT}/ollama-tags.json" \
    http://127.0.0.1:11434/api/tags
  node - "${TEMP_ROOT}/ollama-tags.json" <<'NODE'
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (!Array.isArray(result.models) || !result.models.some((model) => /^mistral(?::|$)/.test(model.name))) {
  process.exit(1);
}
NODE
  curl --fail --silent --show-error --max-time 90 \
    --header "Content-Type: application/json" \
    --data '{"model":"mistral","prompt":"Reply with only OK.","stream":false,"options":{"num_predict":8}}' \
    --output "${TEMP_ROOT}/ollama-generate.json" \
    http://127.0.0.1:11434/api/generate
  node - "${TEMP_ROOT}/ollama-generate.json" <<'NODE'
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (typeof result.response !== "string" || result.response.trim().length === 0) process.exit(1);
NODE
  local public_status
  public_status="$(
    curl --silent --show-error --max-time 20 \
      --output /dev/null --write-out '%{http_code}' \
      https://echoarchives.net/api/tags
  )"
  [[ "${public_status}" != "200" ]] ||
    fail "the public Echo site unexpectedly exposes the Ollama tags endpoint"
}

stage_ollama_upgrade() {
  CURRENT_ROLLBACK=rollback_ollama_upgrade
  if /usr/local/bin/ollama --version 2>&1 | grep -Fq "0.32.5"; then
    log "Ollama already reports 0.32.5; verifying idempotently."
  else
    local stage="${TEMP_ROOT}/ollama-stage"
    install -d -m 0700 -o root -g root "${stage}"
    tar --zstd --extract --file "${OLLAMA_NEW_ARCHIVE}" --directory "${stage}"
    [[ -x "${stage}/bin/ollama" && -d "${stage}/lib/ollama" ]] ||
      fail "extracted Ollama archive is incomplete"
    systemctl stop ollama.service
    mv -- /usr/local/lib/ollama "${RUN_DIR}/ollama-lib.pre-upgrade"
    install -m 0755 -o root -g root "${stage}/bin/ollama" /usr/local/bin/ollama
    cp -a -- "${stage}/lib/ollama" /usr/local/lib/ollama
    systemctl start ollama.service
    OLLAMA_UPGRADED="yes"
  fi
  verify_ollama_runtime
  CURRENT_ROLLBACK=""
  log "Ollama 0.32.5, loopback bind, installed model, generation, and non-exposure verified."
}

latest_local_backup() {
  find "${REPO_ROOT}/backend/data/backups" -maxdepth 1 -type f \
    -name 'community-*.sqlite' -printf '%T@ %p\n' |
    sort -nr |
    sed -n '1s/^[^ ]* //p'
}

stage_archivist_paths() {
  local source
  local restored_db
  local verification_json
  local podcasts
  source="$(latest_local_backup)"
  [[ -n "${source}" && -f "${source}" && ! -L "${source}" ]] ||
    fail "no completed local backup is available for Archivist verification"
  ARCHIVIST_RESTORE_ROOT="$(
    mktemp -d /var/tmp/echo-archives-pi-restore.archivist.XXXXXX
  )"
  chmod 0700 "${ARCHIVIST_RESTORE_ROOT}"
  restored_db="${ARCHIVIST_RESTORE_ROOT}/archivist.sqlite"
  cp --preserve=mode,timestamps -- "${source}" "${restored_db}"
  verification_json="$(
    node "${REPO_ROOT}/tools/check-database-backup.js" \
      --file "${restored_db}" --max-age-hours 876000
  )"
  podcasts="$(
    node -e '
      const result = JSON.parse(process.argv[1]);
      if (result.ok !== true || !(result.counts?.podcasts > 0)) process.exit(1);
      process.stdout.write(String(result.counts.podcasts));
    ' "${verification_json}"
  )"
  APP_USER="${RUNTIME_USER}" \
    RESTORE_TEST_PORT=3912 \
    VERIFY_ARCHIVIST_EXPECTED_SOURCE=ollama \
    "${REPO_ROOT}/deploy/verify-restored-application.sh" \
      "${restored_db}" "${podcasts}"
  APP_USER="${RUNTIME_USER}" \
    RESTORE_TEST_PORT=3913 \
    OLLAMA_URL_OVERRIDE=http://127.0.0.1:1/api/generate \
    VERIFY_ARCHIVIST_EXPECTED_SOURCE=fallback \
    "${REPO_ROOT}/deploy/verify-restored-application.sh" \
      "${restored_db}" "${podcasts}"
  [[ "${ARCHIVIST_RESTORE_ROOT}" == /var/tmp/echo-archives-pi-restore.archivist.* &&
    -d "${ARCHIVIST_RESTORE_ROOT}" && ! -L "${ARCHIVIST_RESTORE_ROOT}" ]] ||
    fail "Archivist restore cleanup path guard failed"
  find "${ARCHIVIST_RESTORE_ROOT}" -xdev -depth -delete
  ARCHIVIST_RESTORE_ROOT=""
  log "Ask the Archivist succeeded through Ollama and fell back safely in isolated restored applications."
}

stage_firewall_evidence() {
  local evidence="${RUN_DIR}/firewall-evidence"
  install -d -m 0700 -o root -g root "${evidence}"
  ufw status verbose > "${evidence}/ufw-verbose.txt"
  ufw status numbered > "${evidence}/ufw-numbered.txt"
  nft list ruleset > "${evidence}/nft-ruleset.txt"
  nft -j list ruleset > "${evidence}/nft-ruleset.json"
  command -v iptables-save >/dev/null 2>&1 &&
    iptables-save > "${evidence}/iptables-save.txt"
  command -v ip6tables-save >/dev/null 2>&1 &&
    ip6tables-save > "${evidence}/ip6tables-save.txt"
  ss -H -lntup > "${evidence}/listeners.txt"
  sha256sum "${evidence}"/* > "${evidence}/SHA256SUMS"
  grep -Fq "Status: active" "${evidence}/ufw-verbose.txt" ||
    fail "UFW is not active"
  grep -Eq 'Default: deny \(incoming\)' "${evidence}/ufw-verbose.txt" ||
    fail "UFW default incoming policy is not deny"
  ss -H -ltn | awk '
    ($4 ~ /:3010$/ || $4 ~ /:11434$/) &&
      $4 !~ /^127\.0\.0\.1:/ { bad = 1 }
    END { exit(bad ? 1 : 0) }
  ' || fail "Echo or Ollama has a non-loopback TCP listener"
  log "Captured root-only UFW/nftables/listener evidence without changing any rule."
}

stage_storage_evidence() {
  local evidence="${RUN_DIR}/storage-evidence"
  local device
  local output
  local status
  install -d -m 0700 -o root -g root "${evidence}"
  lsblk -d -o NAME,PATH,TYPE,ROTA,MODEL,SIZE > "${evidence}/lsblk.txt"
  while IFS= read -r device; do
    [[ "${device}" == /dev/* ]] ||
      fail "unexpected block-device path: ${device}"
    output="${evidence}/$(basename -- "${device}").smart.txt"
    status=0
    smartctl -H -A "${device}" > "${output}" 2>&1 || status="$?"
    # smartctl uses a bitmask; bits 0-2 are invocation/device-command errors.
    (( (status & 7) == 0 )) ||
      fail "SMART inspection could not complete for ${device}"
    grep -Eq \
      'SMART overall-health self-assessment test result:[[:space:]]+PASSED|SMART Health Status:[[:space:]]+OK' \
      "${output}" ||
      fail "${device} did not report a passing overall SMART health result"
    if grep -Eq '^Critical Warning:[[:space:]]+0x0*[1-9a-fA-F]' "${output}"; then
      fail "${device} reports a nonzero NVMe critical warning"
    fi
  done < <(lsblk -dpno NAME,TYPE | awk '$2 == "disk" { print $1 }')
  [[ "$(find "${evidence}" -maxdepth 1 -type f -name '*.smart.txt' | wc -l)" -ge 1 ]] ||
    fail "no physical disk SMART evidence was captured"
  sha256sum "${evidence}"/* > "${evidence}/SHA256SUMS"
  log "Captured passing root-only SMART health evidence for every discovered physical disk."
}

verify_access_log_event() {
  local since="$1"
  local output="${TEMP_ROOT}/echo-access-events.jsonl"
  journalctl --namespace=echo-archives --unit echo-archives.service \
    --since "${since}" --output cat --no-pager |
    grep -F '"event":"http_request"' > "${output}"
  [[ -s "${output}" ]] || fail "no structured access event was recorded"
  node - "${output}" <<'NODE'
const fs = require("node:fs");
const required = ["level", "event", "requestId", "method", "route", "status", "durationMs", "client"];
const forbidden = ["cookie", "authorization", "turnstile", "passphrase", "requestBody", "body", "ip"];
const events = fs.readFileSync(process.argv[2], "utf8").trim().split(/\n+/).map(JSON.parse);
const event = events.at(-1);
if (
  event.event !== "http_request" ||
  !required.every((key) => Object.hasOwn(event, key)) ||
  !/^[0-9a-f]{16}$/.test(event.client) ||
  forbidden.some((key) => Object.hasOwn(event, key)) ||
  Object.keys(event).some((key) => !required.includes(key))
) process.exit(1);
NODE
}

stage_final_verification() {
  local since
  since="$(date --iso-8601=seconds)"
  verify_public_echo
  expect_direct_origin_blocked
  curl --fail --silent --show-error --max-time 10 \
    http://127.0.0.1:3010/api/health >/dev/null
  sleep 1
  verify_access_log_event "${since}"
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
  capture_shared_routes /etc/caddy/Caddyfile "${RUN_DIR}/shared-routes.final"
  compare_shared_routes \
    "${RUN_DIR}/shared-routes.before" "${RUN_DIR}/shared-routes.final"
  systemctl is-active --quiet caddy.service
  systemctl is-active --quiet echo-archives.service
  systemctl is-active --quiet ollama.service
  [[ -z "$(systemctl --failed --no-legend --plain)" ]] ||
    fail "one or more system units failed during maintenance"
  "${REPO_ROOT}/deploy/check-echo-archives-production.sh"
  log "Final local/public health, origin/spoof, TLS, shared-host, service, and structured-log checks passed."
}

stage_rollback_drill() {
  runuser -u "${OPERATOR_USER}" -- env \
    ROLLBACK_DRILL_PORT=3921 \
    "${REPO_ROOT}/deploy/verify-deployment-rollback-invariants.sh" \
      "${EXPECTED_COMMIT}"
  ROLLBACK_DRILL_COMPLETED="yes"
  log "Disposable failed-candidate rollback invariant drill passed; no production process or database was changed."
}

run_stage() {
  local name="$1"
  local function_name="$2"
  CURRENT_STAGE="${name}"
  CURRENT_ROLLBACK=""
  log "BEGIN"
  "${function_name}"
  STAGE_RESULTS+=("${name}=PASS")
  log "PASS"
}

run_repository_check() {
  CURRENT_STAGE="repository-check"
  verify_checkout
  validate_repository_files
  log "PASS: repository check completed without privileged or production changes."
}

run_check() {
  require_root_identity
  exec 9>"${LOCK_FILE}"
  flock -n 9 || fail "another launch-maintenance run is active"
  prepare_root_run
  trap cleanup EXIT
  require_root_context
  log "PASS: privileged check completed without applying production configuration."
  log "Protected check log: ${LOG_FILE}"
}

run_apply() {
  require_root_identity
  exec 9>"${LOCK_FILE}"
  flock -n 9 || fail "another launch-maintenance run is active"
  prepare_root_run
  trap cleanup EXIT
  trap 'on_error "${LINENO}"' ERR
  require_root_context

  run_stage preserve-baseline stage_preserve_baseline
  run_stage fresh-database-backup stage_fresh_database_backup
  run_stage backup-unit-transition stage_backup_unit_transition
  run_stage caddy-origin-gate stage_caddy_origin_gate
  run_stage caddy-upgrade stage_caddy_upgrade
  run_stage runtime-account stage_runtime_migration
  run_stage live-application stage_application_verification
  run_stage better-stack-heartbeat stage_better_stack
  run_stage offsite-restore-and-backup stage_backup_restore
  run_stage ollama-upgrade stage_ollama_upgrade
  run_stage archivist-success-and-fallback stage_archivist_paths
  run_stage firewall-evidence stage_firewall_evidence
  run_stage storage-evidence stage_storage_evidence
  run_stage deployment-rollback-invariant stage_rollback_drill
  run_stage final-verification stage_final_verification

  CURRENT_STAGE="summary"
  {
    printf 'completed_at=%s\n' "$(date -u --iso-8601=seconds)"
    printf 'expected_commit=%s\n' "${EXPECTED_COMMIT}"
    printf 'caddy_config_changed=%s\n' "${CADDY_CONFIG_CHANGED}"
    printf 'caddy_upgraded=%s\n' "${CADDY_UPGRADED}"
    printf 'runtime_migration_applied=%s\n' "${RUNTIME_MIGRATION_APPLIED}"
    printf 'better_stack_installed=%s\n' "${BETTER_STACK_INSTALLED}"
    printf 'backup_drill_completed=%s\n' "${BACKUP_DRILL_COMPLETED}"
    printf 'ollama_upgraded=%s\n' "${OLLAMA_UPGRADED}"
    printf 'rollback_invariant_drill_completed=%s\n' "${ROLLBACK_DRILL_COMPLETED}"
    printf 'backup_unit_transition_reconciled=%s\n' "${BACKUP_UNIT_TRANSITION}"
    printf 'backup_monitor_freshness_deferred=%s\n' "${BACKUP_MONITOR_FRESHNESS_DEFERRED}"
    printf 'backup_monitor_freshness_recovered=%s\n' "${BACKUP_MONITOR_FRESHNESS_RECOVERED}"
    printf 'result=PASS\n'
  } > "${RUN_DIR}/SUMMARY"
  chmod 0600 "${RUN_DIR}/SUMMARY"
  log "PASS: all controlled maintenance stages completed."
  log "Protected evidence: ${RUN_DIR}"
  log "Protected log: ${LOG_FILE}"
  log "No DNS, Cloudflare account, TLS policy, UFW rule, or unrelated service configuration was changed."
}

main() {
  parse_arguments "$@"
  case "${MODE}" in
    repository-check)
      run_repository_check
      ;;
    check)
      run_check
      ;;
    apply)
      run_apply
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
