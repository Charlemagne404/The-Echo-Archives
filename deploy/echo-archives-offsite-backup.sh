#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 0077

REPO_ROOT="/home/charlie/The-Echo-Archives"
BACKUP_DIR="${REPO_ROOT}/backend/data/backups"
SUCCESS_MARKER="/var/lib/echo-archives-monitoring/offsite-backup-success"
RESULT_FILE=""
MARKER_TEMP=""

log() {
  printf '[%s] %s\n' "$(date --iso-8601=seconds)" "$*"
}

cleanup() {
  if [[ -n "${RESULT_FILE}" && "${RESULT_FILE}" == /var/lib/echo-archives-monitoring/restic-result.* ]]; then
    rm -f -- "${RESULT_FILE}"
  fi
  if [[ -n "${MARKER_TEMP}" && "${MARKER_TEMP}" == /var/lib/echo-archives-monitoring/offsite-backup-success.* ]]; then
    rm -f -- "${MARKER_TEMP}"
  fi
}

fail() {
  log "ERROR: $*"
  exit 1
}

trap cleanup EXIT

[[ "${EUID}" -eq 0 ]] || fail "Run this job through its root-owned systemd service."

for command_name in cut date find install mktemp node restic rm sed sort stat; do
  command -v "${command_name}" >/dev/null 2>&1 || fail "Required command is missing: ${command_name}"
done

: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY must be set by /etc/echo-archives/offsite-backup.env}"
: "${RESTIC_PASSWORD_FILE:?RESTIC_PASSWORD_FILE must be set by /etc/echo-archives/offsite-backup.env}"

[[ "${RESTIC_PASSWORD_FILE}" == /* ]] || fail "RESTIC_PASSWORD_FILE must be an absolute path."
[[ -f "${RESTIC_PASSWORD_FILE}" ]] || fail "RESTIC_PASSWORD_FILE does not exist."
[[ "$(stat -c '%U:%G' "${RESTIC_PASSWORD_FILE}")" == "root:root" ]] ||
  fail "RESTIC_PASSWORD_FILE must be owned by root:root."
[[ "$(stat -c '%a' "${RESTIC_PASSWORD_FILE}")" == "600" ]] ||
  fail "RESTIC_PASSWORD_FILE must have mode 0600."

latest_backup="$(
  find "${BACKUP_DIR}" -maxdepth 1 -type f -name '*.sqlite' -printf '%T@ %p\n' |
    sort -nr |
    sed -n '1p' |
    cut -d' ' -f2-
)"
[[ -n "${latest_backup}" ]] || fail "No completed local SQLite backup was found."

node "${REPO_ROOT}/tools/check-database-backup.js" \
  --file "${latest_backup}" \
  --max-age-hours 30

install -d -m 0700 -o root -g root \
  /var/lib/echo-archives-monitoring \
  /var/cache/echo-archives-restic
RESULT_FILE="$(mktemp /var/lib/echo-archives-monitoring/restic-result.XXXXXX)"

log "Sending the newest verified SQLite backup to the encrypted restic repository."
restic backup --json --tag echo-archives -- "${latest_backup}" > "${RESULT_FILE}"

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

restic snapshots --json --latest 1 --tag echo-archives |
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

log "Applying reviewed retention to Echo Archives-tagged restic snapshots."
restic forget \
  --tag echo-archives \
  --keep-daily 7 \
  --keep-weekly 5 \
  --keep-monthly 12 \
  --keep-yearly 2 \
  --prune

MARKER_TEMP="$(mktemp /var/lib/echo-archives-monitoring/offsite-backup-success.XXXXXX)"
printf '%s\n' "$(date -u --iso-8601=seconds)" > "${MARKER_TEMP}"
install -m 0644 -o root -g root "${MARKER_TEMP}" "${SUCCESS_MARKER}"
rm -f -- "${MARKER_TEMP}"
MARKER_TEMP=""

log "Off-site backup completed and the remote snapshot was listed successfully."
