#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 0077

REPO_ROOT="/home/charlie/The-Echo-Archives"
PORT="${ROLLBACK_DRILL_PORT:-3921}"
EXPECTED_COMMIT="${1:-}"
TEMP_ROOT=""
WORKTREE=""
APP_PID=""

log() {
  printf '[rollback-drill] %s\n' "$*"
}

fail() {
  log "FAIL: $*" >&2
  exit 1
}

cleanup() {
  if [[ -n "${APP_PID}" ]] && kill -0 "${APP_PID}" 2>/dev/null; then
    kill -TERM "${APP_PID}" 2>/dev/null || true
    wait "${APP_PID}" 2>/dev/null || true
  fi
  APP_PID=""
  if [[ -n "${WORKTREE}" && -d "${WORKTREE}" && ! -L "${WORKTREE}" ]]; then
    git -C "${REPO_ROOT}" worktree remove --force "${WORKTREE}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${TEMP_ROOT}" &&
    "${TEMP_ROOT}" == /tmp/echo-deployment-rollback.* &&
    -d "${TEMP_ROOT}" &&
    ! -L "${TEMP_ROOT}" ]]; then
    find "${TEMP_ROOT}" -xdev -depth -delete
  fi
}
trap cleanup EXIT

[[ "${EUID}" -ne 0 ]] || fail "run as the deployment account, not root"
[[ "${EXPECTED_COMMIT}" =~ ^[0-9a-f]{40}$ ]] ||
  fail "pass the exact expected 40-character commit"
[[ "${PORT}" =~ ^[1-9][0-9]*$ && "${PORT}" -le 65535 ]] ||
  fail "ROLLBACK_DRILL_PORT must be between 1 and 65535"

for command_name in cp curl find git grep kill ln mktemp node sed sleep ss; do
  command -v "${command_name}" >/dev/null 2>&1 ||
    fail "required command is missing: ${command_name}"
done

[[ "$(git -C "${REPO_ROOT}" rev-parse HEAD)" == "${EXPECTED_COMMIT}" ]] ||
  fail "the checkout is not at the expected commit"
[[ -z "$(git -C "${REPO_ROOT}" status --porcelain --untracked-files=normal)" ]] ||
  fail "the checkout must be clean"
previous_commit="$(git -C "${REPO_ROOT}" rev-parse "${EXPECTED_COMMIT}^")" ||
  fail "the expected commit has no parent for the rollback drill"
latest_backup="$(
  find "${REPO_ROOT}/backend/data/backups" -maxdepth 1 -type f \
    -name 'community-*.sqlite' -printf '%T@ %p\n' |
    sort -nr |
    sed -n '1s/^[^ ]* //p'
)"
[[ -n "${latest_backup}" && -f "${latest_backup}" && ! -L "${latest_backup}" ]] ||
  fail "a completed local SQLite backup is required"
if ss -H -ltn "sport = :${PORT}" | grep -q .; then
  fail "isolated rollback-drill port ${PORT} is already in use"
fi

TEMP_ROOT="$(mktemp -d /tmp/echo-deployment-rollback.XXXXXX)"
WORKTREE="${TEMP_ROOT}/candidate"
database_copy="${TEMP_ROOT}/rollback-drill.sqlite"
app_log="${TEMP_ROOT}/application.log"
health_json="${TEMP_ROOT}/health.json"
cp --preserve=mode,timestamps -- "${latest_backup}" "${database_copy}"
git -C "${REPO_ROOT}" worktree add --detach "${WORKTREE}" "${EXPECTED_COMMIT}" >/dev/null
ln -s "${REPO_ROOT}/backend/node_modules" "${WORKTREE}/backend/node_modules"

node - "${database_copy}" <<'NODE'
const dbPath = process.argv[2];
const Database = require("/home/charlie/The-Echo-Archives/backend/node_modules/better-sqlite3");
const database = new Database(dbPath);
try {
  database.pragma("journal_mode = WAL");
  database.pragma("synchronous = FULL");
  database.exec(
    "CREATE TABLE launch_rollback_probe (" +
    "id INTEGER PRIMARY KEY CHECK (id = 1), value TEXT NOT NULL);",
  );
  database.prepare("INSERT INTO launch_rollback_probe (id, value) VALUES (1, ?)").run(
    "accepted-after-activation",
  );
} finally {
  database.close();
}
NODE

start_isolated() {
  : > "${app_log}"
  env \
    NODE_ENV=development \
    HOST=127.0.0.1 \
    PORT="${PORT}" \
    STATIC_ROOT="${WORKTREE}" \
    SERVE_STATIC=true \
    SITE_URL=https://echoarchives.net \
    DB_PATH="${database_copy}" \
    COMMUNITY_RATING_WRITES_ENABLED=false \
    COMMUNITY_TURNSTILE_ENABLED=false \
    IMPORT_AUTO_WORKER=false \
    IMPORT_AUTO_DISCOVERY=false \
    node "${WORKTREE}/backend/server.js" > "${app_log}" 2>&1 &
  APP_PID="$!"
}

wait_for_health() {
  local attempt
  for attempt in {1..20}; do
    if curl --fail --silent --show-error --max-time 2 \
      --output "${health_json}" "http://127.0.0.1:${PORT}/api/health"; then
      return
    fi
    kill -0 "${APP_PID}" 2>/dev/null ||
      return 1
    sleep 1
  done
  return 1
}

start_isolated
wait_for_health || {
  sed -n '1,100p' "${app_log}" >&2
  fail "the candidate commit was not healthy in isolation"
}
kill -TERM "${APP_PID}"
wait "${APP_PID}" 2>/dev/null || true
APP_PID=""

# Corrupt only the disposable candidate to exercise failure detection.
printf '%s\n' 'process.exit(42);' > "${WORKTREE}/backend/server.js"
start_isolated
if wait_for_health; then
  fail "the deliberately unhealthy disposable candidate unexpectedly became healthy"
fi
wait "${APP_PID}" 2>/dev/null || true
APP_PID=""
log "Deliberately unhealthy candidate was detected."

git -C "${WORKTREE}" reset --hard "${previous_commit}" >/dev/null
[[ -d "${WORKTREE}/backend/node_modules" ]] ||
  ln -s "${REPO_ROOT}/backend/node_modules" "${WORKTREE}/backend/node_modules"
start_isolated
wait_for_health || {
  sed -n '1,100p' "${app_log}" >&2
  fail "the prior revision could not recover against the post-activation database"
}

node - "${database_copy}" <<'NODE'
const dbPath = process.argv[2];
const Database = require("/home/charlie/The-Echo-Archives/backend/node_modules/better-sqlite3");
const database = new Database(dbPath, { readonly: true, fileMustExist: true });
try {
  const value = database.prepare(
    "SELECT value FROM launch_rollback_probe WHERE id = 1",
  ).pluck().get();
  if (value !== "accepted-after-activation") process.exit(1);
} finally {
  database.close();
}
NODE

kill -TERM "${APP_PID}"
wait "${APP_PID}" 2>/dev/null || true
APP_PID=""
[[ -z "$(git -C "${REPO_ROOT}" status --porcelain --untracked-files=normal)" ]] ||
  fail "the production checkout changed during the disposable drill"

log "PASS: failure was detected, the prior revision recovered, the database write remained, and production was untouched."
