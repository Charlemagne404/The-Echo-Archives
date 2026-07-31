#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 0077
export LC_ALL=C

OPERATOR_USER="charlie"
APP_USER="echo-archives"
APP_GROUP="echo-archives"
REPO_ROOT="/home/charlie/The-Echo-Archives"
SERVICE_NAME="echo-archives-offsite-backup.service"
TIMER_NAME="echo-archives-offsite-backup.timer"
MONITOR_SERVICE="echo-archives-local-monitor.service"
SERVICE_SOURCE="${REPO_ROOT}/deploy/echo-archives-offsite-backup.service"
TIMER_SOURCE="${REPO_ROOT}/deploy/echo-archives-offsite-backup.timer"
CANONICAL_SCRIPT="${REPO_ROOT}/deploy/echo-archives-offsite-backup.sh"
SERVICE_DEST="/etc/systemd/system/${SERVICE_NAME}"
TIMER_DEST="/etc/systemd/system/${TIMER_NAME}"
MANUAL_SCRIPT="/usr/local/sbin/echo-archives-pi-backup"
ENV_FILE="/etc/echo-archives/pi-restic.env"
PASSWORD_FILE="/etc/echo-archives/pi-restic-password"
SSH_IDENTITY="/root/.ssh/echo-archives-pi-backup"
SSH_ALIAS="echo-backup-pi"
PI_TAILSCALE_IP="100.102.113.86"
EXPECTED_HOST="charlie-Legion-T530-28ICB"
EXPECTED_REPOSITORY="sftp:echo-backup-pi:/home/echo-backup/echo-archives-restic"
DRILL_SNAPSHOT=""
PASSED_SETUP_LOG="/var/log/echo-archives/pi-backup-setup-20260727T190634Z.log"
BACKUP_CHECK="${REPO_ROOT}/tools/check-database-backup.js"
APPLICATION_CHECK="${REPO_ROOT}/deploy/verify-restored-application.sh"
SUCCESS_SELECTOR="${REPO_ROOT}/tools/select-restic-success-snapshot.js"
OFFSITE_SUCCESS_MARKER="/var/lib/echo-archives-monitoring/offsite-backup-success"
RESTORE_PREFIX="/var/tmp/echo-archives-pi-restore."
RESULT_DIR="/var/lib/echo-archives-monitoring"
RESULT_FILE="${RESULT_DIR}/pi-backup-readiness"
LOCK_FILE="/run/lock/echo-archives-pi-backup-setup.lock"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_DIR="/var/log/echo-archives"
LOG_FILE="${LOG_DIR}/pi-backup-setup-${TIMESTAMP}.log"
BACKUP_DIR="/var/backups/echo-archives-pi-backup/${TIMESTAMP}"
RESTORE_DIR=""
RESTORE_REMOVED="no"
RESTORE_COUNTS=""
NEW_SNAPSHOT=""
SSH_EFFECTIVE=""
RESULT_TEMP=""

log() {
  printf '[%s] %s\n' "$(date --iso-8601=seconds)" "$*"
}

die() {
  log "ERROR: $*"
  exit 1
}

cleanup_restore() {
  if [[ -z "${RESTORE_DIR}" ]]; then
    return
  fi
  if [[ "${RESTORE_DIR}" != "${RESTORE_PREFIX}"* ]] ||
    [[ "${RESTORE_DIR}" == "${RESTORE_PREFIX}" ]] ||
    [[ ! -d "${RESTORE_DIR}" ]] ||
    [[ -L "${RESTORE_DIR}" ]]; then
    log "ERROR: Refusing to remove an unexpected restore path: ${RESTORE_DIR}"
    return 1
  fi
  find "${RESTORE_DIR}" -xdev -depth -delete
  RESTORE_REMOVED="yes"
  RESTORE_DIR=""
  log "Removed only the temporary restored copy."
}

cleanup() {
  if [[ -n "${SSH_EFFECTIVE}" &&
    "${SSH_EFFECTIVE}" == /var/tmp/echo-archives-ssh-effective.* &&
    -f "${SSH_EFFECTIVE}" &&
    ! -L "${SSH_EFFECTIVE}" ]]; then
    rm -f -- "${SSH_EFFECTIVE}"
  fi
  SSH_EFFECTIVE=""
  if [[ -n "${RESULT_TEMP}" &&
    "${RESULT_TEMP}" == "${RESULT_DIR}"/pi-backup-readiness.* &&
    -f "${RESULT_TEMP}" &&
    ! -L "${RESULT_TEMP}" ]]; then
    rm -f -- "${RESULT_TEMP}"
  fi
  RESULT_TEMP=""
  cleanup_restore
}

on_error() {
  local status="$?"
  local line="$1"
  trap - ERR
  log "ERROR: Pi backup completion stopped at line ${line} with exit status ${status}."
  cleanup || true
  log "Review the protected log: ${LOG_FILE}"
  exit "${status}"
}

on_signal() {
  local signal="$1"
  local status="$2"
  trap - ERR EXIT INT TERM HUP
  log "ERROR: Pi backup completion interrupted by ${signal}."
  cleanup || log "ERROR: Temporary restore cleanup also failed."
  log "Review the protected log: ${LOG_FILE}"
  exit "${status}"
}

usage() {
  printf 'Usage: sudo %s --apply|--repair-automation\n' \
    "${REPO_ROOT}/deploy/complete-pi-backup-setup.sh"
}

assert_secure_file() {
  local path="$1"
  local expected_mode="$2"
  [[ -f "${path}" && ! -L "${path}" ]] || die "Required regular file is missing or is a symlink: ${path}"
  [[ "$(stat -c '%U:%G' "${path}")" == "root:root" ]] ||
    die "${path} must be owned by root:root."
  [[ "$(stat -c '%a' "${path}")" == "${expected_mode}" ]] ||
    die "${path} must have mode ${expected_mode}."
}

require_script_text() {
  local pattern="$1"
  local description="$2"
  grep -Eq -- "${pattern}" "${MANUAL_SCRIPT}" ||
    die "Manual script audit failed: missing ${description}."
}

latest_snapshot_id() {
  /usr/bin/restic snapshots --json --tag echo-archives |
    /usr/bin/node -e '
      let input = "";
      process.stdin.on("data", (chunk) => { input += chunk; });
      process.stdin.on("end", () => {
        const snapshots = JSON.parse(input);
        const expectedHost = process.argv[1];
        const now = Date.now();
        const eligible = Array.isArray(snapshots)
          ? snapshots.filter((snapshot) => {
              const timestamp = Date.parse(snapshot.time);
              return snapshot.hostname === expectedHost && Number.isFinite(timestamp) && timestamp <= now;
            })
          : [];
        if (eligible.length === 0) {
          process.exit(1);
        }
        eligible.sort((left, right) => Date.parse(right.time) - Date.parse(left.time));
        if (!/^[0-9a-f]{64}$/.test(eligible[0]?.id ?? "")) process.exit(1);
        process.stdout.write(eligible[0].id);
      });
    ' "${EXPECTED_HOST}"
}

last_successful_snapshot_id() {
  local snapshots_file="${BACKUP_DIR}/successful-snapshot-candidates.json"
  local selection_file="${BACKUP_DIR}/successful-snapshot-selection.json"
  /usr/bin/restic snapshots --json --tag echo-archives > "${snapshots_file}"
  /usr/bin/node "${SUCCESS_SELECTOR}" \
    --snapshots "${snapshots_file}" \
    --marker "${OFFSITE_SUCCESS_MARKER}" \
    --host "${EXPECTED_HOST}" > "${selection_file}"
  /usr/bin/node -e '
    const value = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
    if (!/^[0-9a-f]{64}$/.test(value.snapshotId ?? "")) process.exit(1);
    process.stdout.write(value.snapshotId);
  ' "${selection_file}"
}

same_host_snapshot_ids() {
  /usr/bin/restic snapshots --json --tag echo-archives |
    /usr/bin/node -e '
      let input = "";
      process.stdin.on("data", (chunk) => { input += chunk; });
      process.stdin.on("end", () => {
        const expectedHost = process.argv[1];
        const now = Date.now();
        const snapshots = JSON.parse(input);
        const ids = Array.isArray(snapshots)
          ? snapshots
              .filter((snapshot) => {
                const timestamp = Date.parse(snapshot.time);
                return snapshot.hostname === expectedHost &&
                  Number.isFinite(timestamp) && timestamp <= now &&
                  /^[0-9a-f]{64}$/.test(snapshot.id ?? "");
              })
              .map((snapshot) => snapshot.id)
          : [];
        process.stdout.write(`${[...new Set(ids)].sort().join("\n")}\n`);
      });
    ' "${EXPECTED_HOST}"
}

reset_failed_unit() {
  local unit="$1"
  if /usr/bin/systemctl is-failed --quiet "${unit}"; then
    /usr/bin/systemctl reset-failed "${unit}"
    log "Cleared failed state for ${unit}."
  else
    log "No failed state needs clearing for ${unit}."
  fi
}

assert_no_competing_automation() {
  local automation_script
  local reference
  local unexpected_references=()

  for automation_script in "${MANUAL_SCRIPT}" "${CANONICAL_SCRIPT}"; do
    while IFS= read -r reference; do
      if [[ "${automation_script}" == "${CANONICAL_SCRIPT}" &&
        "${reference}" == "${SERVICE_DEST}" ]]; then
        continue
      fi
      unexpected_references+=("${reference}")
    done < <(
      grep -RIl --fixed-strings "${automation_script}" \
        /etc/systemd/system \
        "/home/${OPERATOR_USER}/.config/systemd/user" \
        2>/dev/null || true
    )
  done

  if (( ${#unexpected_references[@]} > 0 )); then
    printf '%s\n' "${unexpected_references[@]}"
    die "Another system unit references the Pi backup script."
  fi

  if grep -RIl --fixed-strings \
    -e "${MANUAL_SCRIPT}" \
    -e "${CANONICAL_SCRIPT}" \
    -e "${EXPECTED_REPOSITORY}" \
    -e "${ENV_FILE}" \
    /etc/crontab /etc/cron.d /etc/cron.daily /etc/cron.hourly /etc/cron.weekly /etc/cron.monthly \
    2>/dev/null | grep -q .; then
    die "A cron entry also references the Pi backup configuration."
  fi
  for cron_user in root "${OPERATOR_USER}" "${APP_USER}"; do
    if /usr/bin/crontab -u "${cron_user}" -l 2>/dev/null |
      grep -Fq \
        -e "${MANUAL_SCRIPT}" \
        -e "${CANONICAL_SCRIPT}" \
        -e "${EXPECTED_REPOSITORY}" \
        -e "${ENV_FILE}"; then
      die "The ${cron_user} crontab also references the Pi backup configuration."
    fi
  done

  if systemctl list-unit-files --type=timer --no-legend |
    awk '$1 ~ /^echo-archives-(pi|offsite).*backup\\.timer$/ &&
      $1 != "echo-archives-offsite-backup.timer" &&
      $2 == "enabled" { found = 1 } END { exit(found ? 0 : 1) }'; then
    die "A competing Echo Archives Pi/off-site backup timer is enabled."
  fi
}

[[ "${EUID}" -eq 0 ]] || {
  usage >&2
  exit 1
}
[[ "$#" -eq 1 ]] || {
  usage >&2
  exit 1
}
case "${1}" in
  --apply)
    MODE="full"
    ;;
  --repair-automation)
    MODE="repair"
    ;;
  *)
    usage >&2
    exit 1
    ;;
esac
[[ "${SUDO_USER:-}" == "${OPERATOR_USER}" ]] ||
  die "Run this exact script with sudo from the ${OPERATOR_USER} account."
[[ "$(id -u "${OPERATOR_USER}")" == "1000" ]] ||
  die "The expected operator account UID changed."
id "${APP_USER}" >/dev/null 2>&1 ||
  die "The dedicated ${APP_USER} runtime account must exist before the restore drill."

for command_path in \
  /usr/bin/find \
  /usr/bin/flock \
  /usr/bin/comm \
  /usr/bin/crontab \
  /usr/bin/grep \
  /usr/bin/install \
  /usr/bin/journalctl \
  /usr/bin/node \
  /usr/bin/restic \
  /usr/bin/ssh \
  /usr/bin/stat \
  /usr/bin/systemctl \
  /usr/bin/systemd-analyze \
  /usr/bin/tailscale \
  /usr/bin/tee; do
  [[ -x "${command_path}" ]] || die "Required command is missing: ${command_path}"
done

exec 9>"${LOCK_FILE}"
/usr/bin/flock -n 9 || die "Another Pi backup completion run is active."

install -d -m 0700 -o root -g root "${LOG_DIR}" "${BACKUP_DIR}"
install -d -m 0755 -o root -g root "${RESULT_DIR}"
touch "${LOG_FILE}"
chmod 0600 "${LOG_FILE}"
exec > >(tee -a "${LOG_FILE}") 2>&1
trap 'on_error "${LINENO}"' ERR
trap cleanup EXIT
trap 'on_signal INT 130' INT
trap 'on_signal TERM 143' TERM
trap 'on_signal HUP 129' HUP

log "Beginning guarded Raspberry Pi backup completion."
log "No repository initialization, reboot, or live-database restore will be performed."

[[ -f "${SERVICE_SOURCE}" && -f "${TIMER_SOURCE}" ]] ||
  die "Canonical systemd source files are missing."
[[ -x "${CANONICAL_SCRIPT}" ]] || die "Canonical off-site backup script is missing or not executable."
[[ -f "${BACKUP_CHECK}" ]] || die "Backup verifier is missing."
[[ -x "${APPLICATION_CHECK}" ]] || die "Isolated application verifier is missing or not executable."
[[ -f "${SUCCESS_SELECTOR}" && ! -L "${SUCCESS_SELECTOR}" ]] ||
  die "Successful Restic snapshot selector is missing or unsafe."
bash -n "${CANONICAL_SCRIPT}"
bash -n "${MANUAL_SCRIPT}"

if [[ -f "${SERVICE_DEST}" ]]; then
  cp -a -- "${SERVICE_DEST}" "${BACKUP_DIR}/"
fi
if [[ -f "${TIMER_DEST}" ]]; then
  cp -a -- "${TIMER_DEST}" "${BACKUP_DIR}/"
fi

if [[ -f "${SERVICE_DEST}" ]] &&
  grep -Fq "/etc/echo-archives/offsite-backup.env" "${SERVICE_DEST}"; then
  log "Audit: installed off-site service is the credential-neutral pre-Pi unit and its timer is disabled."
else
  log "Audit: installed off-site service is already Pi-specific or differs from the original template."
fi

assert_secure_file "${ENV_FILE}" 600
assert_secure_file "${PASSWORD_FILE}" 600
assert_secure_file "${SSH_IDENTITY}" 600
assert_secure_file "${MANUAL_SCRIPT}" 700
[[ "$(stat -c '%a %U:%G' /root/.ssh)" == "700 root:root" ]] ||
  die "/root/.ssh must be root:root mode 0700."

if [[ "${MODE}" == "repair" ]]; then
  assert_secure_file "${PASSED_SETUP_LOG}" 600
  grep -Fq "Restore drill verified: integrity=ok, foreign-key violations=0" "${PASSED_SETUP_LOG}" ||
    die "The prior setup log does not confirm the passed restore verification."
  grep -Fq "Removed only the temporary restored copy." "${PASSED_SETUP_LOG}" ||
    die "The prior setup log does not confirm restore-copy cleanup."
  require_script_text 'runuser[^#]*-u[[:space:]]+charlie' \
    "the observed runuser-to-charlie backup path"
  require_script_text 'backup:database' \
    "the observed fresh local-backup command"
  log "Audit: prior restore verification and cleanup are confirmed; they will not be repeated."
  log "Audit: the retired manual script creates a fresh local backup through runuser."
else
  require_script_text '^[[:space:]]*set[[:space:]]+-[^#]*e[^#]*u[^#]*o[[:space:]]+pipefail' \
    "strict shell error handling"
  require_script_text 'restic[[:space:]]+backup|RESTIC[^[:space:]]*[[:space:]]+backup' \
    "restic backup command"
  if grep -Eq 'restic[[:space:]]+init|RESTIC[^[:space:]]*[[:space:]]+init' "${MANUAL_SCRIPT}"; then
    die "Manual script audit failed: repository initialization is forbidden."
  fi
fi
log "The canonical service verifies and uploads a completed local backup, then applies retention and restic check."

set -a
# The file is root-owned mode 0600 and is deliberately sourced without printing it.
source "${ENV_FILE}"
set +a
[[ "${RESTIC_REPOSITORY:-}" == "${EXPECTED_REPOSITORY}" ]] ||
  die "The configured Restic repository is not the reviewed Raspberry Pi repository."
[[ "${RESTIC_PASSWORD_FILE:-}" == "${PASSWORD_FILE}" ]] ||
  die "RESTIC_PASSWORD_FILE is not the reviewed protected password file."
[[ -z "${RESTIC_PASSWORD:-}" ]] ||
  die "RESTIC_PASSWORD must not be stored directly in the environment file."
export HOME=/root
export RESTIC_CACHE_DIR=/var/cache/echo-archives-pi-restic
install -d -m 0700 -o root -g root "${RESTIC_CACHE_DIR}"

SSH_EFFECTIVE="$(mktemp /var/tmp/echo-archives-ssh-effective.XXXXXX)"
chmod 0600 "${SSH_EFFECTIVE}"
HOME=/root /usr/bin/ssh -G "${SSH_ALIAS}" > "${SSH_EFFECTIVE}"
awk -v expected="${PI_TAILSCALE_IP}" '$1 == "hostname" && $2 == expected { found = 1 }
  END { exit(found ? 0 : 1) }' "${SSH_EFFECTIVE}" ||
  die "The root SSH alias does not resolve to the reviewed Pi Tailscale IP."
awk '$1 == "user" && $2 == "echo-backup" { found = 1 }
  END { exit(found ? 0 : 1) }' "${SSH_EFFECTIVE}" ||
  die "The root SSH alias does not use the echo-backup account."
awk -v expected="${SSH_IDENTITY}" '$1 == "identityfile" && $2 == expected { found = 1 }
  END { exit(found ? 0 : 1) }' "${SSH_EFFECTIVE}" ||
  die "The root SSH alias does not use the reviewed identity."
rm -f -- "${SSH_EFFECTIVE}"
SSH_EFFECTIVE=""

/usr/bin/tailscale ping --c=1 --timeout=20s --until-direct=false "${PI_TAILSCALE_IP}"
HOME=/root /usr/bin/ssh \
  -o BatchMode=yes \
  -o ConnectTimeout=20 \
  "${SSH_ALIAS}" /usr/bin/true
log "Audit: Tailscale and root SSH access to the dedicated Pi account succeeded."

if [[ "${MODE}" == "full" ]]; then
  DRILL_SNAPSHOT="$(last_successful_snapshot_id)" ||
    die "No marker-pinned successful Echo Archives snapshot is available for the restore drill."
  log "Starting real restore drill from encrypted snapshot ${DRILL_SNAPSHOT}."
  RESTORE_DIR="$(mktemp -d "${RESTORE_PREFIX}XXXXXX")"
  chmod 0700 "${RESTORE_DIR}"
  /usr/bin/restic restore --verify --target "${RESTORE_DIR}" "${DRILL_SNAPSHOT}"

  mapfile -d '' restored_databases < <(
    find "${RESTORE_DIR}" -xdev -type f -name '*.sqlite' -print0
  )
  (( ${#restored_databases[@]} == 1 )) ||
    die "Restore drill expected exactly one SQLite file; found ${#restored_databases[@]}."

  restore_json="$(
    /usr/bin/node "${BACKUP_CHECK}" \
      --file "${restored_databases[0]}" \
      --max-age-hours 876000
  )"
  RESTORE_COUNTS="$(
    /usr/bin/node -e '
      const result = JSON.parse(process.argv[1]);
      const required = [
        "podcasts",
        "community_profiles",
        "catalog_import_candidates",
        "catalog_discovery_sources",
      ];
      if (
        result.ok !== true ||
        result.integrity !== "ok" ||
        result.foreignKeyViolations !== 0 ||
        !result.counts ||
        required.some((table) => !Number.isInteger(result.counts[table]))
      ) process.exit(1);
      if (result.counts.podcasts < 1) process.exit(2);
      process.stdout.write(required.map((table) => `${table}=${result.counts[table]}`).join(", "));
    ' "${restore_json}"
  )" || {
    status="$?"
    if [[ "${status}" -eq 2 ]]; then
      die "Restored podcasts table is unexpectedly empty."
    fi
    die "Restored SQLite verification output was incomplete."
  }
  log "Restore drill verified: integrity=ok, foreign-key violations=0, ${RESTORE_COUNTS}."
  restored_podcast_count="$(
    /usr/bin/node -e '
      const result = JSON.parse(process.argv[1]);
      process.stdout.write(String(result.counts.podcasts));
    ' "${restore_json}"
  )"
  APP_USER="${APP_USER}" \
    "${APPLICATION_CHECK}" "${restored_databases[0]}" "${restored_podcast_count}"
  log "Isolated application verified against the newest restored database."
  cleanup_restore
else
  RESTORE_REMOVED="previously-confirmed"
  RESTORE_COUNTS="previously verified; see ${PASSED_SETUP_LOG}"
fi

log "Validating and installing the canonical systemd unit pair."
/usr/bin/systemd-analyze verify "${SERVICE_SOURCE}" "${TIMER_SOURCE}"
install -m 0644 -o root -g root "${SERVICE_SOURCE}" "${SERVICE_DEST}"
install -m 0644 -o root -g root "${TIMER_SOURCE}" "${TIMER_DEST}"

# Disable only a known former Pi-specific timer name if it exists. The generic
# off-site timer name above is retained as the sole canonical name.
if /usr/bin/systemctl list-unit-files echo-archives-pi-backup.timer --no-legend |
  grep -q '^echo-archives-pi-backup.timer'; then
  /usr/bin/systemctl disable --now echo-archives-pi-backup.timer
fi
/usr/bin/systemctl disable --now "${TIMER_NAME}" >/dev/null 2>&1 || true
/usr/bin/systemctl daemon-reload
reset_failed_unit "${SERVICE_NAME}"
reset_failed_unit "${MONITOR_SERVICE}"
assert_no_competing_automation

snapshots_before="${BACKUP_DIR}/snapshot-ids.before"
snapshots_after="${BACKUP_DIR}/snapshot-ids.after"
same_host_snapshot_ids > "${snapshots_before}"
before_service_invocation="$(
  /usr/bin/systemctl show "${SERVICE_NAME}" -p InvocationID --value
)"
run_since="$(date --iso-8601=seconds)"
log "Running the canonical Pi backup service manually."
/usr/bin/systemctl start "${SERVICE_NAME}"
after_service_invocation="$(
  /usr/bin/systemctl show "${SERVICE_NAME}" -p InvocationID --value
)"
[[ "${after_service_invocation}" =~ ^[0-9a-f]{32}$ &&
  "${after_service_invocation}" != "${before_service_invocation}" ]] ||
  die "The Pi backup service did not record a new invocation."
same_host_snapshot_ids > "${snapshots_after}"
mapfile -t new_snapshot_ids < <(/usr/bin/comm -13 "${snapshots_before}" "${snapshots_after}")
(( ${#new_snapshot_ids[@]} == 1 )) ||
  die "The service did not create exactly one new same-host Restic snapshot."
NEW_SNAPSHOT="${new_snapshot_ids[0]}"
[[ "${NEW_SNAPSHOT}" == "$(latest_snapshot_id)" ]] ||
  die "The newly created Restic snapshot is not the latest valid same-host snapshot."
[[ "$(/usr/bin/systemctl show "${SERVICE_NAME}" -p Result --value)" == "success" ]] ||
  die "The Pi backup service result is not success."
[[ "$(/usr/bin/systemctl show "${SERVICE_NAME}" -p ExecMainStatus --value)" == "0" ]] ||
  die "The Pi backup service returned a nonzero status."

log "Verifying reviewed retention remains applicable after the successful service run."
/usr/bin/restic forget \
  --tag echo-archives \
  --group-by host,tags \
  --keep-daily 7 \
  --keep-weekly 5 \
  --keep-monthly 12 \
  --keep-yearly 2 \
  --dry-run >/dev/null
log "Retention verification succeeded; the service script applied the same reviewed policy."

/usr/bin/systemctl enable --now "${TIMER_NAME}"
/usr/bin/systemctl is-enabled --quiet "${TIMER_NAME}" ||
  die "The canonical Pi backup timer is not enabled."
/usr/bin/systemctl is-active --quiet "${TIMER_NAME}" ||
  die "The canonical Pi backup timer is not active."
next_run="$(
  /usr/bin/systemctl show "${TIMER_NAME}" -p NextElapseUSecRealtime --value
)"
[[ -n "${next_run}" && "${next_run}" != "n/a" ]] ||
  die "The canonical Pi backup timer has no next run."

assert_no_competing_automation
log "Rerunning the local monitor after clearing the dependent failure state."
before_monitor_invocation="$(
  /usr/bin/systemctl show "${MONITOR_SERVICE}" -p InvocationID --value
)"
/usr/bin/systemctl start "${MONITOR_SERVICE}"
after_monitor_invocation="$(
  /usr/bin/systemctl show "${MONITOR_SERVICE}" -p InvocationID --value
)"
[[ "${after_monitor_invocation}" =~ ^[0-9a-f]{32}$ &&
  "${after_monitor_invocation}" != "${before_monitor_invocation}" ]] ||
  die "The local monitor did not record a new post-backup invocation."
[[ "$(/usr/bin/systemctl show "${MONITOR_SERVICE}" -p Result --value)" == "success" ]] ||
  die "The local production monitor did not recover after the Pi backup succeeded."
failed_units="$(/usr/bin/systemctl --failed --no-legend --plain)"
if [[ -n "${failed_units}" ]]; then
  printf '%s\n' "${failed_units}"
  die "One or more systemd units are failed."
fi

log "Canonical service journal for this run:"
/usr/bin/journalctl --unit "${SERVICE_NAME}" --since "${run_since}" --no-pager
log "Canonical timer schedule:"
/usr/bin/systemctl list-timers "${TIMER_NAME}" --all --no-pager
log "Failed units:"
/usr/bin/systemctl --failed --no-pager

RESULT_TEMP="$(mktemp "${RESULT_DIR}/pi-backup-readiness.XXXXXX")"
{
  printf 'completed_at=%s\n' "$(date -u --iso-8601=seconds)"
  if [[ "${MODE}" == "full" ]]; then
    printf 'restore_snapshot=%s\n' "${DRILL_SNAPSHOT}"
    printf 'restore_integrity=ok\n'
    printf 'restore_foreign_key_violations=0\n'
    printf 'restore_counts=%s\n' "${RESTORE_COUNTS}"
    printf 'restore_temporary_copy_removed=%s\n' "${RESTORE_REMOVED}"
  else
    printf 'restore_status=previously-passed-not-repeated\n'
    printf 'restore_log=%s\n' "${PASSED_SETUP_LOG}"
  fi
  printf 'new_snapshot=%s\n' "${NEW_SNAPSHOT}"
  printf 'retention=success\n'
  printf 'restic_check=success\n'
  printf 'service_result=success\n'
  printf 'timer_enabled=yes\n'
  printf 'timer_next=%s\n' "${next_run}"
  printf 'failed_units=0\n'
  printf 'log=%s\n' "${LOG_FILE}"
} > "${RESULT_TEMP}"
install -m 0644 -o root -g root "${RESULT_TEMP}" "${RESULT_FILE}"
rm -f -- "${RESULT_TEMP}"
RESULT_TEMP=""

log "Pi backup completion succeeded."
if [[ "${MODE}" == "full" ]]; then
  log "Restore snapshot: ${DRILL_SNAPSHOT}; temporary copy removed: ${RESTORE_REMOVED}."
else
  log "Previously passed restore drill was not repeated."
fi
log "New automatic-backup snapshot: ${NEW_SNAPSHOT}."
log "Retention: success; restic check: success; failed units: 0."
log "Next timer run: ${next_run}."
