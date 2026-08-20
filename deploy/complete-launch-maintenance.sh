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
OLLAMA_BIN="/usr/local/bin/ollama"
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
ROLLBACK_STATUS=0
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
  printf '[%s] [%s] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "${CURRENT_STAGE}" "$*"
}

file_mtime_seconds() {
  local path="$1"
  if stat -c %Y "${path}" >/dev/null 2>&1; then
    stat -c %Y "${path}"
  else
    stat -f %m "${path}"
  fi
}

fail() {
  log "FAIL: $*" >&2
  return 1
}

safe_remove_temp() {
  local path="$1"
  local expected_prefix="${2:-/var/tmp/echo-launch-maintenance.}"
  [[ -z "${path}" ]] && return 0
  [[ "${path}" == "${expected_prefix}"* ]] || return 1
  [[ ! -L "${path}" ]] || return 1
  [[ ! -e "${path}" ]] && return 0
  [[ -d "${path}" ]] || return 1
  find "${path}" -xdev -depth -delete || return 1
  [[ ! -e "${path}" && ! -L "${path}" ]]
}

safe_remove_archivist_temp() {
  local path="$1"
  local expected_prefix="${2:-/var/tmp/echo-archives-pi-restore.archivist.}"
  [[ -z "${path}" ]] && return 0
  [[ "${path}" == "${expected_prefix}"* ]] || return 1
  [[ ! -L "${path}" ]] || return 1
  [[ ! -e "${path}" ]] && return 0
  [[ -d "${path}" ]] || return 1
  find "${path}" -xdev -depth -delete || return 1
  [[ ! -e "${path}" && ! -L "${path}" ]]
}

cleanup() {
  if ! safe_remove_archivist_temp "${ARCHIVIST_RESTORE_ROOT}"; then
    log "CLEANUP FAILED: guarded Archivist restore data remains at ${ARCHIVIST_RESTORE_ROOT}."
  fi
  ARCHIVIST_RESTORE_ROOT=""
  if [[ "${LOCAL_MONITOR_TIMER_PAUSED}" == "yes" ]]; then
    if ! resume_local_monitor_timer; then
      log "CLEANUP FAILED: restart echo-archives-local-monitor.timer before leaving maintenance."
    fi
  fi
  if ! safe_remove_temp "${TEMP_ROOT}"; then
    log "CLEANUP FAILED: guarded maintenance temporary data remains at ${TEMP_ROOT}."
  fi
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
  systemctl start echo-archives-local-monitor.timer || return 1
  systemctl is-active --quiet echo-archives-local-monitor.timer || {
    fail "local monitor timer did not resume after the backup window"
    return 1
  }
  LOCAL_MONITOR_TIMER_PAUSED="no"
}

execute_current_rollback() {
  set +e
  (
    set -Eeuo pipefail
    "${CURRENT_ROLLBACK}"
  )
  ROLLBACK_STATUS="$?"
  set -e
}

report_and_run_current_rollback() {
  if [[ -n "${CURRENT_ROLLBACK}" && "${ROLLBACK_RUNNING}" -eq 0 ]]; then
    ROLLBACK_RUNNING=1
    log "Attempting rollback for the current stage only: ${CURRENT_STAGE}."
    execute_current_rollback
    if [[ "${ROLLBACK_STATUS}" -eq 0 ]]; then
      log "Current-stage rollback completed."
    else
      log "ROLLBACK FAILED. Do not continue; use the recovery commands in COMPLETE_LAUNCH_MAINTENANCE.md."
    fi
  fi
}

on_error() {
  local status="$?"
  local line="$1"
  trap - ERR
  log "Maintenance stopped at line ${line} with exit status ${status}."
  report_and_run_current_rollback
  log "FAIL summary: completed stages: ${STAGE_RESULTS[*]:-none}; failed stage: ${CURRENT_STAGE}."
  [[ -z "${LOG_FILE}" ]] || log "Protected log: ${LOG_FILE}"
  exit "${status}"
}

on_signal() {
  local signal="$1"
  local status="$2"
  trap - ERR INT TERM HUP
  log "Maintenance interrupted by ${signal}."
  report_and_run_current_rollback
  cleanup || log "CLEANUP FAILED after ${signal}."
  log "FAIL summary: completed stages: ${STAGE_RESULTS[*]:-none}; interrupted stage: ${CURRENT_STAGE}."
  [[ -z "${LOG_FILE}" ]] || log "Protected log: ${LOG_FILE}"
  trap - EXIT
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

stage_root_owned_artifacts() {
  local source_caddy_new="${CADDY_NEW_PACKAGE}"
  local source_caddy_old="${CADDY_OLD_PACKAGE}"
  local source_ollama_new="${OLLAMA_NEW_ARCHIVE}"
  local source_ollama_fallback="${OLLAMA_FALLBACK_ARCHIVE}"
  local protected_root="${TEMP_ROOT}/verified-artifacts"
  local source

  for source in \
    "${source_caddy_new}" \
    "${source_caddy_old}" \
    "${source_ollama_new}" \
    "${source_ollama_fallback}"; do
    [[ -f "${source}" && ! -L "${source}" ]] ||
      fail "artifact source is missing or unsafe: ${source}"
  done

  install -d -m 0700 -o root -g root "${protected_root}"
  install -m 0600 -o root -g root -- "${source_caddy_new}" \
    "${protected_root}/caddy-new.deb"
  install -m 0600 -o root -g root -- "${source_caddy_old}" \
    "${protected_root}/caddy-old.deb"
  install -m 0600 -o root -g root -- "${source_ollama_new}" \
    "${protected_root}/ollama-new.tar.zst"
  install -m 0600 -o root -g root -- "${source_ollama_fallback}" \
    "${protected_root}/ollama-fallback.tgz"

  CADDY_NEW_PACKAGE="${protected_root}/caddy-new.deb"
  CADDY_OLD_PACKAGE="${protected_root}/caddy-old.deb"
  OLLAMA_NEW_ARCHIVE="${protected_root}/ollama-new.tar.zst"
  OLLAMA_FALLBACK_ARCHIVE="${protected_root}/ollama-fallback.tgz"

  assert_file_hash sha512 "${CADDY_NEW_SHA512}" "${CADDY_NEW_PACKAGE}"
  assert_file_hash sha512 "${CADDY_OLD_SHA512}" "${CADDY_OLD_PACKAGE}"
  assert_file_hash sha256 "${OLLAMA_NEW_SHA256}" "${OLLAMA_NEW_ARCHIVE}"
  assert_file_hash sha256 "${OLLAMA_FALLBACK_SHA256}" "${OLLAMA_FALLBACK_ARCHIVE}"

  install -d -m 0700 -o root -g root "${protected_root}/caddy-extracted"
  dpkg-deb --extract "${CADDY_NEW_PACKAGE}" "${protected_root}/caddy-extracted"
  CADDY_STAGED_BIN="${protected_root}/caddy-extracted/usr/bin/caddy"
  [[ -x "${CADDY_STAGED_BIN}" && ! -L "${CADDY_STAGED_BIN}" ]] ||
    fail "verified Caddy package did not extract the expected binary"
  [[ "$(stat -c '%U:%G' "${CADDY_STAGED_BIN}")" == "root:root" ]] ||
    fail "verified Caddy binary is not root-owned"
  log "Copied and re-hashed all upgrade and rollback artifacts in protected root-owned staging."
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
  node --check "${REPO_ROOT}/tools/verify-restic-recovery-inventory.js"
  node --check "${REPO_ROOT}/tools/select-restic-success-snapshot.js"
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
  if [[ "${EUID}" -eq 0 ]]; then
    install -m 0600 -o root -g root -- "${preserved_candidate}" \
      "${TEMP_ROOT}/preserved-caddy-candidate"
    preserved_candidate="${TEMP_ROOT}/preserved-caddy-candidate"
  fi
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

restore_and_verify_snapshot_inventory() {
  local snapshot_id="$1"
  local source_root="$2"
  local restore_target="${TEMP_ROOT}/successful-restic-restore"
  local restored_recovery_root

  [[ "${source_root}" == /var/lib/echo-archives-monitoring/recovery-staging.*/recovery ]] ||
    fail "selected successful snapshot has an unsafe expanded source root"
  [[ ! -e "${restore_target}" && ! -L "${restore_target}" ]] ||
    fail "successful-snapshot restore target already exists"
  install -d -m 0700 -o root -g root "${restore_target}"
  install -d -m 0700 -o root -g root "${restore_target}/recovery"
  (
    set -a
    source /etc/echo-archives/pi-restic.env
    set +a
    export HOME=/root
    export RESTIC_CACHE_DIR=/var/cache/echo-archives-pi-restic
    restic restore --verify --target "${restore_target}/recovery" \
      "${snapshot_id}:${source_root}"
  )
  restored_recovery_root="${restore_target}/recovery"
  node "${REPO_ROOT}/tools/verify-restic-recovery-inventory.js" \
    --recovery-root "${restored_recovery_root}"
  find "${restore_target}" -xdev -depth -delete
  [[ ! -e "${restore_target}" && ! -L "${restore_target}" ]] ||
    fail "successful-snapshot restore was not removed after verification"
}

verify_last_successful_remote_inventory() {
  local snapshots="${TEMP_ROOT}/restic-preflight-snapshots.json"
  local selection="${TEMP_ROOT}/restic-success-selection.json"
  local snapshot_id
  local source_root
  local inventory_format

  (
    set -a
    # Root-owned, mode-0600 operational configuration; never print it.
    source /etc/echo-archives/pi-restic.env
    set +a
    export HOME=/root
    export RESTIC_CACHE_DIR=/var/cache/echo-archives-pi-restic
    restic snapshots --json --tag echo-archives > "${snapshots}"
  )
  node "${REPO_ROOT}/tools/select-restic-success-snapshot.js" \
    --snapshots "${snapshots}" \
    --marker "${OFFSITE_SUCCESS_MARKER}" \
    --host "${EXPECTED_HOST}" > "${selection}"
  snapshot_id="$(node -e '
    const value = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
    if (!/^[0-9a-f]{64}$/.test(value.snapshotId ?? "")) process.exit(1);
    process.stdout.write(value.snapshotId);
  ' "${selection}")" || fail "successful Restic selection did not return a full snapshot ID"
  source_root="$(node -e '
    const value = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
    if (typeof value.sourceRoot !== "string") process.exit(1);
    process.stdout.write(value.sourceRoot);
  ' "${selection}")" || fail "successful Restic selection did not return a source root"
  inventory_format="$(node -e '
    const value = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
    if (!["legacy-database", "expanded"].includes(value.inventoryFormat)) process.exit(1);
    process.stdout.write(value.inventoryFormat);
  ' "${selection}")" || fail "successful Restic selection returned an unknown inventory format"

  if [[ "${inventory_format}" == "legacy-database" ]]; then
    log "The atomic success marker selects the reviewed legacy database snapshot; expanded recovery verification will be established by the new backup in this run."
    return 0
  fi
  restore_and_verify_snapshot_inventory "${snapshot_id}" "${source_root}"
  log "Restored and exactly verified the snapshot pinned by the last successful off-site marker without changing the repository."
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

offsite_failure_is_reviewed_transition() {
  local journal="$1"

  if grep -Fq ".retention-write-probe." "${journal}" &&
    grep -Fq "Read-only file system" "${journal}"; then
    return 0
  fi

  # Restic 0.16 excludes a source nested below RESTIC_CACHE_DIR. The affected
  # job uploaded only the source's ancestor directories, restored zero bytes,
  # failed the inventory verifier, and deliberately did not publish success.
  # Require the complete current-invocation signature so unrelated failures
  # and historical journal entries remain fatal.
  grep -Fq "Sending the protected recovery inventory to the encrypted restic repository." "${journal}" &&
    grep -Fq "/var/cache/echo-archives-pi-restic/verify." "${journal}" &&
    grep -Eq 'Summary: Restored [0-9]+ files/dirs \(0 B\)' "${journal}" &&
    grep -Fq "finished verifying 0 files" "${journal}" &&
    grep -Fq "Restic recovery inventory verification failed: restored recovery root is missing or unreadable" "${journal}"
}

offsite_success_marker_is_stale() {
  local marker_time
  local now

  [[ -f "${OFFSITE_SUCCESS_MARKER}" &&
    ! -L "${OFFSITE_SUCCESS_MARKER}" ]] || return 1
  marker_time="$(file_mtime_seconds "${OFFSITE_SUCCESS_MARKER}")"
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
    offsite_failure_is_reviewed_transition "${offsite_journal}" ||
      fail "off-site backup failure does not match a reviewed recovery transition"
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
    log "Accepted only the reviewed off-site recovery transition; unrelated failed units remain fatal."
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
  local capacity_path
  local available_bytes
  for command_name in \
    awk basename bash caddy chmod chown cmp cp curl date df diff dpkg dpkg-deb dpkg-query env \
    find flock getent git grep hostname id install ip jq journalctl lsblk mktemp mv \
    nft node npm openssl readlink restic rm runuser sed sha256sum sha512sum sleep \
    smartctl sort ssh ss stat systemctl systemd-analyze tail tailscale tar tee \
    timeout touch tr ufw uname wc zstd; do
    command -v "${command_name}" >/dev/null 2>&1 ||
      fail "required command is missing: ${command_name}"
  done
  for capacity_path in \
    "${REPO_ROOT}" \
    "${ARTIFACT_ROOT}" \
    /var/tmp \
    "${BACKUP_ROOT}" \
    /usr/local; do
    available_bytes="$(df --output=avail -B1 "${capacity_path}" | tail -n 1 | tr -d ' ')"
    [[ "${available_bytes}" =~ ^[0-9]+$ && "${available_bytes}" -ge 21474836480 ]] ||
      fail "at least 20 GiB free space is required on the filesystem containing ${capacity_path}"
  done
  stage_root_owned_artifacts
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
  "${OLLAMA_BIN}" --version 2>&1 |
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
  validate_restic_prerequisites
  verify_last_successful_remote_inventory
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
  caddy adapt --config "${config}" --adapter caddyfile > "${adapted}" || return 1
  node - "${adapted}" > "${hosts}" <<'NODE' || return 1
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
  [[ -s "${hosts}" ]] || {
    fail "no unrelated shared Caddy hosts were discovered"
    return 1
  }
  : > "${output}"
  local host
  local status
  while IFS= read -r host; do
    status="$(
      curl --silent --show-error --max-time 15 \
        --resolve "${host}:443:127.0.0.1" \
        --output /dev/null --write-out '%{http_code}' \
        "https://${host}/"
    )" || {
      fail "shared-host origin request failed for ${host}"
      return 1
    }
    [[ "${status}" =~ ^[1-5][0-9][0-9]$ ]] || {
      fail "shared-host origin returned an invalid status for ${host}"
      return 1
    }
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
  "${OLLAMA_BIN}" --version > "${RUN_DIR}/ollama.version.before" 2>&1
  dpkg-query -W -f='${Package}\t${Version}\n' caddy > "${RUN_DIR}/caddy.package.before"
  cp -a -- "${OLLAMA_BIN}" "${RUN_DIR}/ollama.binary.before"
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
    offsite.service.before 0644 || return 1
  systemctl daemon-reload || return 1
  systemd-analyze verify \
    /etc/systemd/system/echo-archives-offsite-backup.service \
    /etc/systemd/system/echo-archives-offsite-backup.timer || return 1
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
  caddy validate --config "${RUN_DIR}/Caddyfile.before" --adapter caddyfile || return 1
  install -m 0644 -o root -g root \
    "${RUN_DIR}/Caddyfile.before" /etc/caddy/Caddyfile || return 1
  activate_caddy || return 1
  capture_shared_routes \
    /etc/caddy/Caddyfile "${RUN_DIR}/shared-routes.rollback-origin" || return 1
  compare_shared_routes \
    "${RUN_DIR}/shared-routes.before" \
    "${RUN_DIR}/shared-routes.rollback-origin" || return 1
  verify_public_echo || return 1
}

activate_caddy() {
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile ||
    return 1
  if systemctl is-active --quiet caddy.service; then
    systemctl reload caddy.service || return 1
  else
    systemctl start caddy.service || return 1
  fi
  systemctl is-active --quiet caddy.service || return 1
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
    --output "${health}" https://echoarchives.net/api/health || return 1
  node - "${health}" <<'NODE' || return 1
const fs = require("node:fs");
const health = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (health.ok !== true || health.service !== "echo-archives") process.exit(1);
NODE
  curl --fail --silent --show-error --max-time 20 \
    --output "${homepage}" https://echoarchives.net/ || return 1
  grep -Fq "The Echo Archives" "${homepage}" || return 1
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
    return 1
  fi
  if curl --silent --show-error --insecure --max-time 10 \
    --resolve "www.echoarchives.net:443:127.0.0.1" \
    --header "${headers[0]}" --header "${headers[1]}" \
    --output /dev/null https://www.echoarchives.net/; then
    fail "direct www origin request with spoofed proxy headers was not blocked"
    return 1
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
  [[ "${mismatched_status}" != "200" ]] || {
    fail "mismatched SNI/Host plus spoofed proxy headers reached Echo"
    return 1
  }
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
    dpkg --force-confold --install "${rollback_package}" || return 1
  install -m 0644 -o root -g root \
    "${RUN_DIR}/Caddyfile.before-upgrade" /etc/caddy/Caddyfile || return 1
  activate_caddy || return 1
  capture_shared_routes \
    /etc/caddy/Caddyfile "${RUN_DIR}/shared-routes.rollback-upgrade" || return 1
  compare_shared_routes \
    "${RUN_DIR}/shared-routes.before" \
    "${RUN_DIR}/shared-routes.rollback-upgrade" || return 1
  verify_public_echo || return 1
  expect_direct_origin_blocked || return 1
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
    # A prior maintenance attempt already completed and verified the migration.
    # Do not introduce another production restart merely to make this stage look
    # active: the deep preflight and live-application stage verify the currently
    # running process and the exact production behavior used by this run.
    log "Dedicated runtime account already passed; preserving the healthy running Echo process idempotently."
  else
    SUDO_USER="${OPERATOR_USER}" \
      "${REPO_ROOT}/deploy/migrate-echo-archives-runtime-account.sh" --repair-access
    log "Dedicated runtime account ACL drift was repaired without rerunning its completed migration."
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
    better-stack-dropin.before 0644 || return 1
  systemctl daemon-reload || return 1
  systemd-analyze verify \
    /etc/systemd/system/echo-archives-offsite-backup.service \
    /etc/systemd/system/echo-archives-offsite-backup.timer || return 1
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
  systemctl stop echo-archives-offsite-backup.timer || return 1
  if systemctl is-active --quiet echo-archives-offsite-backup.service; then
    systemctl stop echo-archives-offsite-backup.service || return 1
  fi
  if systemctl is-active --quiet echo-archives-offsite-backup.service; then
    log "Could not quiesce the off-site service before restoring its automation."
    return 1
  fi
  restore_optional_file \
    /etc/systemd/system/echo-archives-offsite-backup.service \
    offsite.service.pre-backup 0644 || return 1
  restore_optional_file \
    /etc/systemd/system/echo-archives-offsite-backup.timer \
    offsite.timer.pre-backup 0644 || return 1
  restore_optional_file \
    /etc/systemd/system/echo-archives-offsite-backup.service.d/better-stack-heartbeat.conf \
    "${heartbeat_backup}" 0644 || return 1
  systemctl daemon-reload || return 1
  if grep -Fxq "enabled" "${RUN_DIR}/offsite-timer.enabled"; then
    systemctl enable echo-archives-offsite-backup.timer >/dev/null || return 1
  else
    systemctl disable echo-archives-offsite-backup.timer >/dev/null 2>&1 || return 1
  fi
  if grep -Fxq "active" "${RUN_DIR}/offsite-timer.active"; then
    systemctl start echo-archives-offsite-backup.timer || return 1
  else
    systemctl stop echo-archives-offsite-backup.timer >/dev/null 2>&1 || return 1
  fi
  systemctl reset-failed \
    echo-archives-offsite-backup.service \
    echo-archives-local-monitor.service || return 1
  if [[ "${BACKUP_MONITOR_FRESHNESS_DEFERRED}" == "yes" ]]; then
    log "Restored backup automation; local monitor remains pending because this failed stage did not publish a fresh off-site success marker."
  else
    systemctl start echo-archives-local-monitor.service || return 1
    [[ "$(systemctl show echo-archives-local-monitor.service -p Result --value)" == "success" ]] ||
      return 1
    [[ -z "$(systemctl --failed --no-legend --plain)" ]] || return 1
  fi
  resume_local_monitor_timer || return 1
}

stage_backup_restore() {
  local readiness_before=0
  local readiness_after
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
  systemctl stop echo-archives-offsite-backup.timer
  if systemctl is-active --quiet echo-archives-offsite-backup.timer; then
    fail "off-site backup timer did not pause before the restore and backup drill"
  fi
  if systemctl is-active --quiet echo-archives-offsite-backup.service; then
    fail "off-site backup service is already active; refusing concurrent Restic work"
  fi
  if [[ -f /var/lib/echo-archives-monitoring/pi-backup-readiness ]]; then
    readiness_before="$(stat -c %Y /var/lib/echo-archives-monitoring/pi-backup-readiness)"
  fi
  SUDO_USER="${OPERATOR_USER}" \
    "${REPO_ROOT}/deploy/complete-pi-backup-setup.sh" --apply
  readiness_after="$(stat -c %Y /var/lib/echo-archives-monitoring/pi-backup-readiness)"
  [[ "${readiness_after}" =~ ^[0-9]+$ && "${readiness_after}" -gt "${readiness_before}" ]] ||
    fail "Pi backup readiness record was not refreshed by the verified backup"
  [[ "$(systemctl show echo-archives-offsite-backup.service -p Result --value)" == "success" ]] ||
    fail "off-site backup service did not finish successfully"
  [[ "$(systemctl show echo-archives-offsite-backup.service -p ExecMainStatus --value)" == "0" ]] ||
    fail "off-site backup service retained a nonzero exit status"
  systemctl is-enabled --quiet echo-archives-offsite-backup.timer
  systemctl is-active --quiet echo-archives-offsite-backup.timer
  [[ -f /var/lib/echo-archives-monitoring/pi-backup-readiness ]] ||
    fail "Pi backup readiness record is missing"
  grep -Eq '^new_snapshot=[0-9a-f]{64}$' \
    /var/lib/echo-archives-monitoring/pi-backup-readiness
  grep -Fxq "service_result=success" \
    /var/lib/echo-archives-monitoring/pi-backup-readiness
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
  local baseline_version="0.6.7"
  if grep -Fq "0.32.5" "${RUN_DIR}/ollama.version.before"; then
    baseline_version="0.32.5"
  fi
  systemctl stop ollama.service || return 1
  if systemctl is-active --quiet ollama.service; then
    log "Ollama rollback could not stop the service."
    return 1
  fi
  if [[ -d /usr/local/lib/ollama && ! -L /usr/local/lib/ollama ]]; then
    mv -- /usr/local/lib/ollama "${RUN_DIR}/ollama-lib.failed-${TIMESTAMP}" || return 1
  elif [[ -e /usr/local/lib/ollama || -L /usr/local/lib/ollama ]]; then
    log "Ollama rollback found an unsafe installed library path."
    return 1
  fi
  [[ ! -e /usr/local/lib/ollama && ! -L /usr/local/lib/ollama ]] || return 1
  install -m 0755 -o root -g root \
    "${RUN_DIR}/ollama.binary.before" "${OLLAMA_BIN}" || return 1
  install_ollama_library_tree "${RUN_DIR}/ollama-lib.before" || return 1
  cmp --silent -- "${RUN_DIR}/ollama.binary.before" "${OLLAMA_BIN}" || return 1
  restore_optional_file \
    /etc/systemd/system/ollama.service ollama.service.before 0644 || return 1
  systemctl daemon-reload || return 1
  systemctl start ollama.service || return 1
  verify_ollama_runtime "${baseline_version}" || return 1
  log "Ollama rollback restored and fully verified version ${baseline_version}."
}

install_ollama_library_tree() {
  local source_tree="$1"
  [[ -d "${source_tree}" && ! -L "${source_tree}" ]] || return 1
  [[ ! -e /usr/local/lib/ollama && ! -L /usr/local/lib/ollama ]] || return 1
  install -d -m 0755 -o root -g root /usr/local/lib/ollama || return 1
  cp -a --no-dereference -- "${source_tree}/." /usr/local/lib/ollama/ || return 1
  chown -R root:root /usr/local/lib/ollama || return 1
  find /usr/local/lib/ollama -type d -exec chmod 0755 {} + || return 1
  find /usr/local/lib/ollama -type f -perm /111 -exec chmod 0755 {} + || return 1
  diff --recursive --brief \
    "${source_tree}" /usr/local/lib/ollama >/dev/null || return 1
  runuser -u ollama -- test -x /usr/local/lib/ollama/llama-server || return 1
}

ollama_listener_is_private() {
  ss -H -ltn | awk '
    $4 ~ /:11434$/ && $4 != "127.0.0.1:11434" { bad = 1 }
    $4 == "127.0.0.1:11434" { found = 1 }
    END { exit(found && !bad ? 0 : 1) }
  '
}

wait_for_ollama_ready() {
  local expected_version="$1"
  local attempt
  for attempt in {1..30}; do
    if systemctl is-active --quiet ollama.service &&
      "${OLLAMA_BIN}" --version 2>&1 | grep -Fq "${expected_version}" &&
      ollama_listener_is_private &&
      curl --fail --silent --show-error --max-time 5 \
        --output "${TEMP_ROOT}/ollama-version.json" \
        http://127.0.0.1:11434/api/version &&
      node - "${TEMP_ROOT}/ollama-version.json" "${expected_version}" <<'NODE' &&
const fs = require("node:fs");
const [versionPath, expectedVersion] = process.argv.slice(2);
const result = JSON.parse(fs.readFileSync(versionPath, "utf8"));
if (result.version !== expectedVersion) process.exit(1);
NODE
      curl --fail --silent --show-error --max-time 5 \
        --output "${TEMP_ROOT}/ollama-tags.json" \
        http://127.0.0.1:11434/api/tags &&
      node - "${TEMP_ROOT}/ollama-tags.json" <<'NODE'
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (!Array.isArray(result.models) || !result.models.some((model) => /^mistral(?::|$)/.test(model.name))) {
  process.exit(1);
}
NODE
    then
      return 0
    fi
    sleep 1
  done
  return 1
}

verify_ollama_runtime() {
  local expected_version="${1:-0.32.5}"
  wait_for_ollama_ready "${expected_version}" || {
    fail "Ollama ${expected_version} did not become ready on its private listener"
    return 1
  }
  curl --fail --silent --show-error --max-time 20 \
    --output "${TEMP_ROOT}/ollama-tags.json" \
    http://127.0.0.1:11434/api/tags || return 1
  node - "${TEMP_ROOT}/ollama-tags.json" <<'NODE' || return 1
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
    http://127.0.0.1:11434/api/generate || return 1
  node - "${TEMP_ROOT}/ollama-generate.json" <<'NODE' || return 1
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (typeof result.response !== "string" || result.response.trim().length === 0) process.exit(1);
NODE
  local endpoint
  local public_status
  for endpoint in /api/tags /api/version /api/ps; do
    public_status="$(
      curl --silent --show-error --max-time 20 \
        --output /dev/null --write-out '%{http_code}' \
        "https://echoarchives.net${endpoint}"
    )" || public_status="000"
    [[ "${public_status}" != "200" ]] || {
      fail "the public Echo site unexpectedly exposes Ollama endpoint ${endpoint}"
      return 1
    }
  done
}

stage_ollama_upgrade() {
  if "${OLLAMA_BIN}" --version 2>&1 | grep -Fq "0.32.5"; then
    log "Ollama already reports 0.32.5; verifying idempotently."
  else
    local stage="${TEMP_ROOT}/ollama-stage"
    install -d -m 0700 -o root -g root "${stage}"
    tar --zstd --extract --file "${OLLAMA_NEW_ARCHIVE}" --directory "${stage}"
    [[ -x "${stage}/bin/ollama" && -d "${stage}/lib/ollama" &&
      -x "${stage}/lib/ollama/llama-server" &&
      ! -L "${stage}/lib/ollama/llama-server" ]] ||
      fail "extracted Ollama archive is incomplete"
    CURRENT_ROLLBACK=rollback_ollama_upgrade
    systemctl stop ollama.service
    if systemctl is-active --quiet ollama.service; then
      fail "Ollama remained active after the controlled stop"
    fi
    [[ -d /usr/local/lib/ollama && ! -L /usr/local/lib/ollama ]] ||
      fail "installed Ollama library tree became unsafe before upgrade"
    mv -- /usr/local/lib/ollama "${RUN_DIR}/ollama-lib.pre-upgrade"
    [[ ! -e /usr/local/lib/ollama && ! -L /usr/local/lib/ollama ]] ||
      fail "installed Ollama library path remained after preservation"
    install -m 0755 -o root -g root "${stage}/bin/ollama" "${OLLAMA_BIN}"
    install_ollama_library_tree "${stage}/lib/ollama" ||
      fail "could not install the exact staged Ollama library tree"
    [[ -x /usr/local/lib/ollama/llama-server &&
      ! -L /usr/local/lib/ollama/llama-server ]] ||
      fail "installed Ollama runner is missing or unsafe"
    systemctl start ollama.service
    OLLAMA_UPGRADED="yes"
  fi
  verify_ollama_runtime "0.32.5"
  stage_archivist_paths
  CURRENT_ROLLBACK=""
  log "Ollama 0.32.5, loopback bind, installed model, generation, non-exposure, and Echo success/fallback integration verified."
}

latest_local_backup() {
  find "${REPO_ROOT}/backend/data/backups" -maxdepth 1 -type f \
    -name 'community-*.sqlite' -printf '%T@ %p\n' |
    sort -nr |
    sed -n '1s/^[^ ]* //p'
}

find_available_restore_test_port() {
  local port
  for port in {3912..3921}; do
    if ! ss -H -ltn "sport = :${port}" | grep -q .; then
      printf '%s' "${port}"
      return 0
    fi
  done
  fail "no loopback port is available for isolated Archivist verification"
}

stage_archivist_paths() {
  local source
  local runtime_db_dir
  local restored_db
  local verification_json
  local podcasts
  local ollama_port
  local fallback_port
  source="$(latest_local_backup)"
  [[ -n "${source}" && -f "${source}" && ! -L "${source}" ]] ||
    fail "no completed local backup is available for Archivist verification"
  ARCHIVIST_RESTORE_ROOT="$(
    mktemp -d /var/tmp/echo-archives-pi-restore.archivist.XXXXXX
  )"
  chmod 0700 "${ARCHIVIST_RESTORE_ROOT}"
  runtime_db_dir="${ARCHIVIST_RESTORE_ROOT}/runtime-db"
  install -d -m 0700 -o root -g root "${runtime_db_dir}"
  restored_db="${runtime_db_dir}/archivist.sqlite"
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
  ollama_port="$(find_available_restore_test_port)"
  APP_USER="${RUNTIME_USER}" \
    RESTORE_TEST_PORT="${ollama_port}" \
    VERIFY_ARCHIVIST_EXPECTED_SOURCE=ollama \
    "${REPO_ROOT}/deploy/verify-restored-application.sh" \
      "${restored_db}" "${podcasts}"
  fallback_port="$(find_available_restore_test_port)"
  APP_USER="${RUNTIME_USER}" \
    RESTORE_TEST_PORT="${fallback_port}" \
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
  local evidence_root="${1:-${RUN_DIR}}"
  local evidence="${evidence_root}/firewall-evidence"
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
  local evidence_root="${1:-${RUN_DIR}}"
  local evidence="${evidence_root}/storage-evidence"
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
  local expected_request_id="$2"
  local output="${TEMP_ROOT}/echo-access-events.jsonl"
  journalctl --namespace=echo-archives --unit echo-archives.service \
    --since "${since}" --output cat --no-pager |
    grep -F '"event":"http_request"' > "${output}"
  [[ -s "${output}" ]] || fail "no structured access event was recorded"
  node - "${output}" "${expected_request_id}" <<'NODE'
const fs = require("node:fs");
const [eventPath, expectedRequestId] = process.argv.slice(2);
const required = ["level", "event", "requestId", "method", "route", "status", "durationMs", "client"];
const forbidden = ["cookie", "authorization", "turnstile", "passphrase", "requestBody", "body", "ip"];
const events = fs.readFileSync(eventPath, "utf8").trim().split(/\n+/).map(JSON.parse);
const matching = events.filter((event) => event.requestId === expectedRequestId);
if (matching.length !== 1) process.exit(1);
const event = matching[0];
if (
  event.event !== "http_request" ||
  !required.every((key) => Object.hasOwn(event, key)) ||
  !/^[0-9a-f]{16}$/.test(event.client) ||
  forbidden.some((key) => Object.hasOwn(event, key)) ||
  Object.keys(event).some((key) => !required.includes(key))
) process.exit(1);
NODE
}

verify_public_tls() {
  local protocol
  local output
  for protocol in tls1_2 tls1_3; do
    output="${TEMP_ROOT}/openssl-${protocol}.txt"
    timeout 20 openssl s_client \
      -connect echoarchives.net:443 \
      -servername echoarchives.net \
      -verify_hostname echoarchives.net \
      -verify_return_error \
      -"${protocol}" \
      -brief < /dev/null > "${output}" 2>&1
    grep -Fq "Verification: OK" "${output}" ||
      fail "public certificate hostname verification failed for ${protocol}"
    case "${protocol}" in
      tls1_2)
        grep -Fq "Protocol version: TLSv1.2" "${output}" ||
          fail "public endpoint did not negotiate TLS 1.2"
        ;;
      tls1_3)
        grep -Fq "Protocol version: TLSv1.3" "${output}" ||
          fail "public endpoint did not negotiate TLS 1.3"
        ;;
    esac
  done
}

run_remaining_stage_preflight() {
  local evidence_root="${RUN_DIR}/preflight"
  local ollama_extract="${TEMP_ROOT}/ollama-extract-preflight"
  local local_health="${TEMP_ROOT}/preflight-local-health.json"
  local public_health="${TEMP_ROOT}/preflight-public-health.json"
  local current_ollama_version="0.6.7"

  install -d -m 0700 -o root -g root "${evidence_root}"
  install -d -m 0700 -o root -g root "${ollama_extract}"
  tar --zstd --extract --file "${OLLAMA_NEW_ARCHIVE}" --directory "${ollama_extract}"
  [[ -x "${ollama_extract}/bin/ollama" &&
    -d "${ollama_extract}/lib/ollama" &&
    -x "${ollama_extract}/lib/ollama/llama-server" &&
    ! -L "${ollama_extract}/bin/ollama" &&
    ! -L "${ollama_extract}/lib/ollama" &&
    ! -L "${ollama_extract}/lib/ollama/llama-server" ]] ||
    fail "full Ollama preflight extraction did not produce the reviewed layout"
  OLLAMA_HOST=http://127.0.0.1:1 \
    "${ollama_extract}/bin/ollama" --version 2>&1 |
    grep -Fq "client version is 0.32.5" ||
    fail "preflight-extracted Ollama binary does not report client version 0.32.5"
  curl --fail --silent --show-error --max-time 10 \
    --output "${local_health}" http://127.0.0.1:3010/api/health
  curl --fail --silent --show-error --max-time 20 \
    --output "${public_health}" https://echoarchives.net/api/health
  validate_live_health_file "${local_health}"
  validate_live_health_file "${public_health}"
  verify_null_rating_output \
    "http://127.0.0.1:3010" "${TEMP_ROOT}/preflight-marsfall-local.html"
  verify_null_rating_output \
    "https://echoarchives.net" "${TEMP_ROOT}/preflight-marsfall-public.html"
  verify_public_echo
  expect_direct_origin_blocked
  verify_public_tls

  if "${OLLAMA_BIN}" --version 2>&1 | grep -Fq "0.32.5"; then
    current_ollama_version="0.32.5"
  fi
  verify_ollama_runtime "${current_ollama_version}"
  stage_archivist_paths
  stage_firewall_evidence "${evidence_root}"
  stage_storage_evidence "${evidence_root}"
  stage_rollback_drill
  log "Deep preflight passed every non-destructive production check used by the remaining stages."
}

stage_final_verification() {
  local since
  local response_headers="${TEMP_ROOT}/public-access-response.headers"
  local request_id
  since="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  verify_public_echo
  expect_direct_origin_blocked
  curl --fail --silent --show-error --max-time 10 \
    http://127.0.0.1:3010/api/health >/dev/null
  curl --fail --silent --show-error --max-time 20 \
    --dump-header "${response_headers}" --output /dev/null \
    https://echoarchives.net/api/health
  request_id="$(
    awk 'BEGIN { IGNORECASE = 1 }
      $1 == "x-request-id:" { gsub(/\r/, "", $2); print $2; exit }' \
      "${response_headers}"
  )"
  [[ "${request_id}" =~ ^[0-9a-f-]{36}$ ]] ||
    fail "public health response did not return a valid request ID"
  sleep 1
  verify_access_log_event "${since}" "${request_id}"
  verify_public_tls
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
  capture_shared_routes /etc/caddy/Caddyfile "${RUN_DIR}/shared-routes.final"
  compare_shared_routes \
    "${RUN_DIR}/shared-routes.before" "${RUN_DIR}/shared-routes.final"
  systemctl is-active --quiet caddy.service
  systemctl is-active --quiet echo-archives.service
  systemctl is-active --quiet ollama.service
  [[ -z "$(systemctl --failed --no-legend --plain)" ]] ||
    fail "one or more system units failed during maintenance"
  REQUIRE_OFFSITE_BACKUP=true \
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
  trap 'on_error "${LINENO}"' ERR
  trap 'on_signal INT 130' INT
  trap 'on_signal TERM 143' TERM
  trap 'on_signal HUP 129' HUP
  require_root_context
  run_remaining_stage_preflight
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
  trap 'on_signal INT 130' INT
  trap 'on_signal TERM 143' TERM
  trap 'on_signal HUP 129' HUP
  require_root_context
  run_remaining_stage_preflight

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
  run_stage firewall-evidence stage_firewall_evidence
  run_stage storage-evidence stage_storage_evidence
  run_stage deployment-rollback-invariant stage_rollback_drill
  run_stage final-verification stage_final_verification

  CURRENT_STAGE="summary"
  {
    printf 'completed_at=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
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
