#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 0077

APP_USER="${APP_USER:-charlie}"
REPO_ROOT="/home/charlie/The-Echo-Archives"
PORT="${RESTORE_TEST_PORT:-3911}"
DATABASE_PATH="${1:-}"
EXPECTED_PODCASTS="${2:-}"
APP_PID=""
TEMP_DIR=""

cleanup() {
  if [[ -n "${APP_PID}" ]] && kill -0 "${APP_PID}" 2>/dev/null; then
    kill -TERM "${APP_PID}" 2>/dev/null || true
    wait "${APP_PID}" 2>/dev/null || true
  fi
  APP_PID=""
  if [[ -n "${TEMP_DIR}" &&
    "${TEMP_DIR}" == /var/tmp/echo-archives-restore-app.* &&
    -d "${TEMP_DIR}" &&
    ! -L "${TEMP_DIR}" ]]; then
    find "${TEMP_DIR}" -xdev -depth -delete
  fi
}
trap cleanup EXIT

fail() {
  echo "Restored application verification failed: $*" >&2
  exit 1
}

[[ "${EUID}" -eq 0 ]] || fail "run this check through the root-owned restore drill"
[[ "${DATABASE_PATH}" == /var/tmp/echo-archives-pi-restore.*/*.sqlite ]] ||
  fail "database must be inside the guarded restore directory"
[[ -f "${DATABASE_PATH}" && ! -L "${DATABASE_PATH}" ]] ||
  fail "restored database is missing, not regular, or a symlink"
[[ "${EXPECTED_PODCASTS}" =~ ^[1-9][0-9]*$ ]] ||
  fail "expected podcast count must be a positive integer"
[[ "${PORT}" =~ ^[1-9][0-9]*$ && "${PORT}" -le 65535 ]] ||
  fail "RESTORE_TEST_PORT must be between 1 and 65535"

for command_name in chown chmod curl find grep kill mktemp node runuser sed sleep ss; do
  command -v "${command_name}" >/dev/null 2>&1 ||
    fail "required command is missing: ${command_name}"
done

if ss -H -ltn "sport = :${PORT}" | grep -q .; then
  fail "loopback verification port ${PORT} is already in use"
fi

database_dir="$(dirname -- "${DATABASE_PATH}")"
restore_relative="${DATABASE_PATH#/var/tmp/}"
restore_component="${restore_relative%%/*}"
restore_root="/var/tmp/${restore_component}"
[[ "${restore_root}" == /var/tmp/echo-archives-pi-restore.* &&
  "${DATABASE_PATH}" == "${restore_root}/"* ]] ||
  fail "could not resolve the guarded restore root"

current_parent="${database_dir}"
while [[ "${current_parent}" != "${restore_root}" ]]; do
  chown root:"${APP_USER}" "${current_parent}"
  chmod 0710 "${current_parent}"
  current_parent="$(dirname -- "${current_parent}")"
done
chown root:"${APP_USER}" "${restore_root}"
chmod 0710 "${restore_root}"
chown "${APP_USER}:${APP_USER}" "${database_dir}" "${DATABASE_PATH}"
chmod 0700 "${database_dir}"
chmod 0600 "${DATABASE_PATH}"

TEMP_DIR="$(mktemp -d /var/tmp/echo-archives-restore-app.XXXXXX)"
chown "${APP_USER}:${APP_USER}" "${TEMP_DIR}"
chmod 0700 "${TEMP_DIR}"
app_log="${TEMP_DIR}/application.log"
health_json="${TEMP_DIR}/health.json"
catalog_json="${TEMP_DIR}/catalog.json"
show_html="${TEMP_DIR}/show.html"

runuser -u "${APP_USER}" -- env -i \
  HOME="${TEMP_DIR}" \
  PATH=/usr/bin:/bin \
  NODE_ENV=development \
  HOST=127.0.0.1 \
  PORT="${PORT}" \
  STATIC_ROOT="${REPO_ROOT}" \
  SERVE_STATIC=true \
  SITE_URL=https://echoarchives.net \
  DB_PATH="${DATABASE_PATH}" \
  COMMUNITY_RATING_WRITES_ENABLED=false \
  COMMUNITY_TURNSTILE_ENABLED=false \
  IMPORT_AUTO_WORKER=false \
  IMPORT_AUTO_DISCOVERY=false \
  /usr/bin/node "${REPO_ROOT}/backend/server.js" > "${app_log}" 2>&1 &
APP_PID="$!"

for attempt in {1..30}; do
  if curl --fail --silent --show-error --max-time 2 \
    --output "${health_json}" "http://127.0.0.1:${PORT}/api/health"; then
    break
  fi
  if ! kill -0 "${APP_PID}" 2>/dev/null; then
    sed -n '1,120p' "${app_log}" >&2
    fail "isolated application exited before becoming healthy"
  fi
  if [[ "${attempt}" -eq 30 ]]; then
    sed -n '1,120p' "${app_log}" >&2
    fail "isolated application did not become healthy"
  fi
  sleep 1
done

curl --fail --silent --show-error --max-time 5 \
  --output "${catalog_json}" "http://127.0.0.1:${PORT}/data/shows.json"

first_show_id="$(
  node - "${health_json}" "${catalog_json}" "${EXPECTED_PODCASTS}" <<'NODE'
const fs = require("node:fs");
const [healthPath, catalogPath, expectedText] = process.argv.slice(2);
const health = JSON.parse(fs.readFileSync(healthPath, "utf8"));
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const expected = Number(expectedText);
if (
  health.ok !== true ||
  health.service !== "echo-archives" ||
  health.catalogCount !== expected ||
  !Array.isArray(catalog) ||
  catalog.length !== expected ||
  typeof catalog[0]?.id !== "string"
) process.exit(1);
process.stdout.write(catalog[0].id);
NODE
)" || fail "health and representative catalog read did not match the restored database"

curl --fail --silent --show-error --max-time 5 \
  --output "${show_html}" "http://127.0.0.1:${PORT}/shows/${first_show_id}"
grep -Fq "<title>" "${show_html}" ||
  fail "representative restored show page did not render HTML"

kill -TERM "${APP_PID}"
wait "${APP_PID}" || {
  status="$?"
  [[ "${status}" -eq 143 ]] ||
    fail "isolated application exited with unexpected status ${status}"
}
APP_PID=""

echo "Isolated restored application verified: health, ${EXPECTED_PODCASTS} catalog records, and show HTML."
