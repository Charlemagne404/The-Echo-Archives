#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 0077

REPO_ROOT="/home/charlie/The-Echo-Archives"
APP_USER="echo-archives"
RESTORE_ROOT=""

cleanup() {
  if [[ -n "${RESTORE_ROOT}" &&
    "${RESTORE_ROOT}" == /var/tmp/echo-archives-pi-restore.debug.* &&
    -d "${RESTORE_ROOT}" &&
    ! -L "${RESTORE_ROOT}" ]]; then
    find "${RESTORE_ROOT}" -xdev -depth -delete
  fi
}
trap cleanup EXIT

fail() {
  echo "Restored database diagnostic failed: $*" >&2
  exit 1
}

[[ "${EUID}" -eq 0 ]] || fail "run with sudo"
id "${APP_USER}" >/dev/null 2>&1 || fail "runtime account is missing: ${APP_USER}"

source_db="$(
  find "${REPO_ROOT}/backend/data/backups" -maxdepth 1 -type f \
    -name 'community-*.sqlite' -printf '%T@ %p\n' |
    sort -nr |
    sed -n '1s/^[^ ]* //p'
)"
[[ -n "${source_db}" && -f "${source_db}" && ! -L "${source_db}" ]] ||
  fail "no safe local database backup is available"

RESTORE_ROOT="$(mktemp -d /var/tmp/echo-archives-pi-restore.debug.XXXXXX)"
runtime_db_dir="${RESTORE_ROOT}/runtime-db"
database_path="${runtime_db_dir}/archivist.sqlite"
install -d -m 0700 -o root -g root "${runtime_db_dir}"
cp --preserve=mode,timestamps -- "${source_db}" "${database_path}"

node "${REPO_ROOT}/tools/check-database-backup.js" \
  --file "${database_path}" --max-age-hours 876000 >/dev/null

chown root:"${APP_USER}" "${RESTORE_ROOT}"
chmod 0710 "${RESTORE_ROOT}"
for database_file in \
  "${database_path}" \
  "${database_path}-journal" \
  "${database_path}-shm" \
  "${database_path}-wal"; do
  if [[ -e "${database_file}" || -L "${database_file}" ]]; then
    [[ -f "${database_file}" && ! -L "${database_file}" ]] ||
      fail "SQLite sidecar is unsafe: ${database_file}"
    chown "${APP_USER}:${APP_USER}" "${database_file}"
    chmod 0600 "${database_file}"
  fi
done
chown "${APP_USER}:${APP_USER}" "${runtime_db_dir}"
chmod 0700 "${runtime_db_dir}"

namei -l "${database_path}"
runuser -u "${APP_USER}" -- test -r "${database_path}" ||
  fail "runtime account cannot read the temporary database"
runuser -u "${APP_USER}" -- test -w "${runtime_db_dir}" ||
  fail "runtime account cannot create SQLite sidecars"

runuser -u "${APP_USER}" -- /usr/bin/node -e '
const Database = require("/home/charlie/The-Echo-Archives/backend/node_modules/better-sqlite3");
const database = new Database(process.argv[1]);
try {
  console.log("SQLite open: OK");
  console.log(`journal_mode=${database.pragma("journal_mode", { simple: true })}`);
} finally {
  database.close();
}
' "${database_path}"

echo "PASS: ${APP_USER} can open the isolated restored database."
