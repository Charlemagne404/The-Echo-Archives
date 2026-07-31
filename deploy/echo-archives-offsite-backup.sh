#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 0077

REPO_ROOT="/home/charlie/The-Echo-Archives"
BACKUP_DIR="${REPO_ROOT}/backend/data/backups"
IMPORT_STAGING_DIR="${REPO_ROOT}/backend/data/import-staging"
BACKEND_ENV="${REPO_ROOT}/backend/.env"
SUCCESS_MARKER="/var/lib/echo-archives-monitoring/offsite-backup-success"
CACHE_DIR="${RESTIC_CACHE_DIR:-/var/cache/echo-archives-pi-restic}"
MAX_LOCAL_BACKUP_AGE_HOURS="${MAX_LOCAL_BACKUP_AGE_HOURS:-6}"
RESULT_FILE=""
MARKER_TEMP=""
VERIFY_DIR=""
BACKUP_WRITE_PROBE=""
REMOTE_LIST_FILE=""

log() {
  printf '[%s] %s\n' "$(date --iso-8601=seconds)" "$*"
}

cleanup() {
  if [[ -n "${BACKUP_WRITE_PROBE}" &&
    "${BACKUP_WRITE_PROBE}" == "${BACKUP_DIR}"/.retention-write-probe.* &&
    -f "${BACKUP_WRITE_PROBE}" &&
    ! -L "${BACKUP_WRITE_PROBE}" ]]; then
    rm -f -- "${BACKUP_WRITE_PROBE}"
  fi
  BACKUP_WRITE_PROBE=""
  if [[ -n "${RESULT_FILE}" && "${RESULT_FILE}" == /var/lib/echo-archives-monitoring/restic-result.* ]]; then
    rm -f -- "${RESULT_FILE}"
  fi
  if [[ -n "${REMOTE_LIST_FILE}" &&
    "${REMOTE_LIST_FILE}" == /var/lib/echo-archives-monitoring/restic-inventory.* ]]; then
    rm -f -- "${REMOTE_LIST_FILE}"
  fi
  if [[ -n "${MARKER_TEMP}" && "${MARKER_TEMP}" == /var/lib/echo-archives-monitoring/offsite-backup-success.* ]]; then
    rm -f -- "${MARKER_TEMP}"
  fi
  if [[ -n "${VERIFY_DIR}" &&
    "${VERIFY_DIR}" == "${CACHE_DIR}"/verify.* &&
    -d "${VERIFY_DIR}" &&
    ! -L "${VERIFY_DIR}" ]]; then
    find "${VERIFY_DIR}" -xdev -depth -delete
  fi
}

fail() {
  log "ERROR: $*"
  exit 1
}

on_error() {
  local status="$?"
  local line="$1"
  trap - ERR
  log "ERROR: Off-site backup stopped at line ${line} with status ${status}."
  exit "${status}"
}

stage_private_configuration() {
  local source="$1"
  local destination_name="$2"
  [[ ! -L "${source}" ]] ||
    fail "Recovery configuration source is not a safe regular file: ${source}"
  if [[ ! -e "${source}" ]]; then
    log "Optional recovery configuration is absent: ${destination_name}."
    return 0
  fi
  [[ -f "${source}" ]] ||
    fail "Recovery configuration source is not a safe regular file: ${source}"
  install -m 0600 -- "${source}" \
    "${recovery_root}/configuration/${destination_name}"
}

stage_publication_directory() {
  local relative_path="$1"
  local source="${REPO_ROOT}/${relative_path}"
  local destination_parent="${recovery_root}/publication/$(dirname -- "${relative_path}")"
  [[ -d "${source}" && ! -L "${source}" ]] ||
    fail "Runtime publication directory is missing or unsafe: ${source}"
  if find "${source}" -xdev -type l -print -quit | grep -q .; then
    fail "Runtime publication directory contains a symbolic link: ${source}"
  fi
  install -d -m 0700 "${destination_parent}"
  cp --archive --no-dereference -- "${source}" "${destination_parent}/"
}

stage_publication_file() {
  local relative_path="$1"
  local source="${REPO_ROOT}/${relative_path}"
  local destination="${recovery_root}/publication/${relative_path}"
  [[ -f "${source}" && ! -L "${source}" ]] ||
    fail "Runtime publication file is missing or unsafe: ${source}"
  install -D -m 0600 -- "${source}" "${destination}"
}

trap cleanup EXIT
trap 'on_error "${LINENO}"' ERR

[[ "${EUID}" -eq 0 ]] || fail "Run this job through its root-owned systemd service."

for command_name in basename cmp cp cut date dirname find grep install mktemp node restic rm sed sort stat; do
  command -v "${command_name}" >/dev/null 2>&1 || fail "Required command is missing: ${command_name}"
done

[[ "${MAX_LOCAL_BACKUP_AGE_HOURS}" =~ ^[1-9][0-9]*$ ]] ||
  fail "MAX_LOCAL_BACKUP_AGE_HOURS must be a positive integer."

: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY must be set by /etc/echo-archives/pi-restic.env}"
: "${RESTIC_PASSWORD_FILE:?RESTIC_PASSWORD_FILE must be set by /etc/echo-archives/pi-restic.env}"

[[ "${CACHE_DIR}" == "/var/cache/echo-archives-pi-restic" ]] ||
  fail "RESTIC_CACHE_DIR must be the reviewed Pi cache directory."
export RESTIC_CACHE_DIR="${CACHE_DIR}"
[[ "${RESTIC_PASSWORD_FILE}" == /* ]] || fail "RESTIC_PASSWORD_FILE must be an absolute path."
[[ -f "${RESTIC_PASSWORD_FILE}" ]] || fail "RESTIC_PASSWORD_FILE does not exist."
[[ "$(stat -c '%U:%G' "${RESTIC_PASSWORD_FILE}")" == "root:root" ]] ||
  fail "RESTIC_PASSWORD_FILE must be owned by root:root."
[[ "$(stat -c '%a' "${RESTIC_PASSWORD_FILE}")" == "600" ]] ||
  fail "RESTIC_PASSWORD_FILE must have mode 0600."

BACKUP_WRITE_PROBE="$(mktemp "${BACKUP_DIR}/.retention-write-probe.XXXXXX")"
[[ "${BACKUP_WRITE_PROBE}" == "${BACKUP_DIR}"/.retention-write-probe.* &&
  -f "${BACKUP_WRITE_PROBE}" &&
  ! -L "${BACKUP_WRITE_PROBE}" ]] ||
  fail "Completed-backup retention write probe returned an unsafe path."
rm -f -- "${BACKUP_WRITE_PROBE}"
BACKUP_WRITE_PROBE=""
log "Verified the service sandbox can apply retention only in the completed-backup directory."

latest_backup="$(
  find "${BACKUP_DIR}" -maxdepth 1 -type f -name '*.sqlite' -printf '%T@ %p\n' |
    sort -nr |
    sed -n '1p' |
    cut -d' ' -f2-
)"
[[ -n "${latest_backup}" ]] || fail "No completed local SQLite backup was found."

install -d -m 0755 -o root -g root /var/lib/echo-archives-monitoring
install -d -m 0700 -o root -g root "${CACHE_DIR}"
VERIFY_DIR="$(mktemp -d "${CACHE_DIR}/verify.XXXXXX")"
recovery_root="${VERIFY_DIR}/recovery"
staged_backup="${recovery_root}/database/$(basename -- "${latest_backup}")"
install -d -m 0700 "${recovery_root}/database" "${recovery_root}/configuration"
cp --preserve=mode,timestamps -- "${latest_backup}" "${staged_backup}"

log "Verifying a protected byte-for-byte staging copy of the newest completed local backup."
node "${REPO_ROOT}/tools/check-database-backup.js" \
  --file "${staged_backup}" \
  --max-age-hours "${MAX_LOCAL_BACKUP_AGE_HOURS}"
cmp --silent -- "${latest_backup}" "${staged_backup}" ||
  fail "The verified staging copy differs from the selected local backup."

if [[ -L "${IMPORT_STAGING_DIR}" ]]; then
  fail "Importer staging root must not be a symbolic link: ${IMPORT_STAGING_DIR}"
fi
if [[ -d "${IMPORT_STAGING_DIR}" ]]; then
  if find "${IMPORT_STAGING_DIR}" -type l -print -quit | grep -q .; then
    fail "Importer staging contains a symbolic link: ${IMPORT_STAGING_DIR}"
  fi
  log "Staging importer cover state in the protected recovery inventory."
  cp --archive -- "${IMPORT_STAGING_DIR}" "${recovery_root}/import-staging"
fi

log "Staging every runtime-writable publication path in the protected recovery inventory."
for relative_path in \
  catalog-src/shows \
  images/covers \
  images/generated/covers \
  data/reviews; do
  stage_publication_directory "${relative_path}"
done
for relative_path in \
  data/shows.json \
  data/collections.json \
  data/search-index.json \
  data/archive-stats.json \
  docs/generated/catalog-status.json \
  docs/generated/catalog-status.md; do
  stage_publication_file "${relative_path}"
done

stage_private_configuration "${BACKEND_ENV}" "backend.env"
stage_private_configuration "/etc/caddy/Caddyfile" "Caddyfile"
stage_private_configuration "/etc/echo-archives/monitoring.env" "monitoring.env"
stage_private_configuration "/etc/echo-archives/better-stack.env" "better-stack.env"
stage_private_configuration "/etc/echo-archives/pi-restic.env" "pi-restic.env"
stage_private_configuration \
  "/etc/systemd/journald@echo-archives.conf.d/retention.conf" \
  "echo-archives-journald.conf"
stage_private_configuration \
  "/etc/systemd/system/echo-archives-discovery.service.d/10-runtime-account.conf" \
  "echo-archives-discovery-runtime-account.conf"
stage_private_configuration \
  "/etc/systemd/system/echo-archives-offsite-backup.service.d/better-stack-heartbeat.conf" \
  "echo-archives-offsite-backup-heartbeat.conf"
stage_private_configuration \
  "/var/lib/echo-archives-runtime-account/readiness" \
  "echo-archives-runtime-account-readiness"
stage_private_configuration "/etc/systemd/system/ollama.service" "ollama.service"

for unit_name in \
  echo-archives.service \
  echo-archives-backup.service \
  echo-archives-backup.timer \
  echo-archives-discovery.service \
  echo-archives-discovery.timer \
  echo-archives-local-monitor.service \
  echo-archives-local-monitor.timer \
  echo-archives-offsite-backup.service \
  echo-archives-offsite-backup.timer; do
  unit_path="/etc/systemd/system/${unit_name}"
  if [[ -f "${unit_path}" ]]; then
    install -m 0600 -- "${unit_path}" \
      "${recovery_root}/configuration/${unit_name}"
  fi
done

required_paths="${recovery_root}/REQUIRED_PATHS"
find "${recovery_root}" -xdev -mindepth 1 \
  ! -path "${required_paths}" -printf '%P\n' |
  sort > "${required_paths}"
printf '%s\n' "REQUIRED_PATHS" >> "${required_paths}"
[[ -s "${required_paths}" ]] ||
  fail "Recovery inventory manifest is unexpectedly empty."

RESULT_FILE="$(mktemp /var/lib/echo-archives-monitoring/restic-result.XXXXXX)"

log "Sending the protected recovery inventory to the encrypted restic repository."
restic backup --json --tag echo-archives -- \
  "${recovery_root}" > "${RESULT_FILE}"

snapshot_id="$(
  node -e '
    const fs = require("node:fs");
    const lines = fs.readFileSync(process.argv[1], "utf8").trim().split(/\n+/);
    const messages = lines.map((line) => JSON.parse(line));
    const summary = messages.findLast((message) => message.message_type === "summary");
    if (!summary?.snapshot_id) process.exit(1);
    process.stdout.write(summary.snapshot_id);
  ' "${RESULT_FILE}"
)" || fail "Restic completed without returning a snapshot ID."

restic snapshots --json "${snapshot_id}" |
  node -e '
    let input = "";
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => {
      const snapshots = JSON.parse(input);
      const expected = process.argv[1];
      if (
        !Array.isArray(snapshots) ||
        snapshots.length !== 1 ||
        snapshots[0].id !== expected
      ) process.exit(1);
    });
  ' "${snapshot_id}" ||
  fail "The new off-site snapshot could not be listed."

REMOTE_LIST_FILE="$(mktemp /var/lib/echo-archives-monitoring/restic-inventory.XXXXXX)"
restic ls --json "${snapshot_id}" > "${REMOTE_LIST_FILE}"
node - "${required_paths}" "${REMOTE_LIST_FILE}" <<'NODE'
const fs = require("node:fs");
const [manifestPath, remotePath] = process.argv.slice(2);
const required = fs.readFileSync(manifestPath, "utf8").trim().split(/\n+/);
const remote = new Set();
for (const line of fs.readFileSync(remotePath, "utf8").trim().split(/\n+/)) {
  const entry = JSON.parse(line);
  if (entry.struct_type !== "node" || typeof entry.path !== "string") continue;
  const marker = "/recovery/";
  const markerIndex = entry.path.lastIndexOf(marker);
  if (markerIndex >= 0) remote.add(entry.path.slice(markerIndex + marker.length));
}
const missing = required.filter((relativePath) => !remote.has(relativePath));
if (missing.length > 0) {
  console.error(`Remote recovery inventory is incomplete (${missing.length} missing path(s)).`);
  process.exit(1);
}
process.stdout.write(`Remote recovery inventory contains all ${required.length} staged paths.\n`);
NODE
rm -f -- "${REMOTE_LIST_FILE}"
REMOTE_LIST_FILE=""

log "Applying reviewed retention to Echo Archives-tagged restic snapshots."
restic forget \
  --tag echo-archives \
  --group-by host,tags \
  --keep-daily 7 \
  --keep-weekly 5 \
  --keep-monthly 12 \
  --keep-yearly 2 \
  --prune

log "Checking repository integrity after backup and retention."
restic check

log "Applying owner-approved 30-day local retention after verified off-site recovery."
node "${REPO_ROOT}/tools/prune-local-backups.js" \
  --directory "${BACKUP_DIR}" \
  --retention-days 30 \
  --minimum-keep 7 \
  --apply \
  --offsite-verified

MARKER_TEMP="$(mktemp /var/lib/echo-archives-monitoring/offsite-backup-success.XXXXXX)"
printf '%s\n' "$(date -u --iso-8601=seconds)" > "${MARKER_TEMP}"
install -m 0644 -o root -g root "${MARKER_TEMP}" "${SUCCESS_MARKER}"
rm -f -- "${MARKER_TEMP}"
MARKER_TEMP=""

log "Off-site backup, retention, and repository check completed successfully."
