#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 0077
export LC_ALL=C

APP_USER="echo-archives"
APP_GROUP="echo-archives"
DEPLOY_USER="charlie"
DEPLOY_GROUP="charlie"
REPO_ROOT="/home/charlie/The-Echo-Archives"
SERVICE_NAME="echo-archives.service"
DISCOVERY_SERVICE="echo-archives-discovery.service"
DISCOVERY_TIMER="echo-archives-discovery.timer"
BACKUP_TIMER="echo-archives-backup.timer"
OFFSITE_TIMER="echo-archives-offsite-backup.timer"
MONITOR_TIMER="echo-archives-local-monitor.timer"
SERVICE_SOURCE="${REPO_ROOT}/deploy/echo-archives.service"
SERVICE_DEST="/etc/systemd/system/${SERVICE_NAME}"
JOURNAL_CONFIG_SOURCE="${REPO_ROOT}/deploy/echo-archives-journald.conf"
JOURNAL_CONFIG_DIR="/etc/systemd/journald@echo-archives.conf.d"
JOURNAL_CONFIG_DEST="${JOURNAL_CONFIG_DIR}/retention.conf"
DISCOVERY_DROPIN_DIR="/etc/systemd/system/${DISCOVERY_SERVICE}.d"
DISCOVERY_DROPIN="${DISCOVERY_DROPIN_DIR}/10-runtime-account.conf"
ENV_FILE="${REPO_ROOT}/backend/.env"
OLD_DB="${REPO_ROOT}/backend/data/community.sqlite"
STATE_ROOT="/var/lib/echo-archives"
NEW_DB="${STATE_ROOT}/community.sqlite"
MIGRATION_META_ROOT="/var/lib/echo-archives-runtime-account"
READINESS_FILE="${MIGRATION_META_ROOT}/readiness"
BACKUP_ROOT="/var/backups/echo-archives-runtime-account"
LOCK_FILE="/run/lock/echo-archives-runtime-account.lock"
LOCAL_HEALTH_URL="http://127.0.0.1:3010/api/health"
LOCAL_HOME_URL="http://127.0.0.1:3010/"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR=""
APPLY_MUTATED=0
UNITS_QUIESCED=0
ROLLBACK_RUNNING=0

WRITABLE_DIRECTORIES=(
  "${REPO_ROOT}/backend/data/import-staging"
  "${REPO_ROOT}/catalog-src/shows"
  "${REPO_ROOT}/images/covers"
  "${REPO_ROOT}/images/generated/covers"
  "${REPO_ROOT}/data/reviews"
)

WRITABLE_FILES=(
  "${REPO_ROOT}/data/shows.json"
  "${REPO_ROOT}/data/collections.json"
  "${REPO_ROOT}/data/search-index.json"
  "${REPO_ROOT}/data/archive-stats.json"
  "${REPO_ROOT}/docs/generated/catalog-status.json"
  "${REPO_ROOT}/docs/generated/catalog-status.md"
)

WRITABLE_FILE_PARENT_DIRECTORIES=(
  "${REPO_ROOT}/data"
  "${REPO_ROOT}/docs/generated"
)

QUIESCED_UNITS=(
  "${DISCOVERY_TIMER}"
  "${BACKUP_TIMER}"
  "${OFFSITE_TIMER}"
  "${MONITOR_TIMER}"
)

log() {
  printf '[%s] %s\n' "$(date --iso-8601=seconds)" "$*"
}

die() {
  log "ERROR: $*"
  return 1
}

usage() {
  printf 'Usage: sudo %s --apply|--check|--repair-access|--rollback [backup-directory]\n' \
    "${REPO_ROOT}/deploy/migrate-echo-archives-runtime-account.sh"
}

require_root() {
  [[ "${EUID}" -eq 0 ]] || die "Run this script as root."
}

require_operator() {
  [[ "${SUDO_USER:-}" == "${DEPLOY_USER}" ]] ||
    die "Run this exact script with sudo from the ${DEPLOY_USER} account."
}

require_commands() {
  local command_name
  for command_name in \
    awk basename bash chmod chown cp curl date find flock getfacl getent git grep id \
    install journalctl mktemp mv node readlink rm runuser setfacl sleep stat \
    systemctl systemd-analyze touch useradd; do
    command -v "${command_name}" >/dev/null 2>&1 ||
      die "Required command is missing: ${command_name}"
  done
}

assert_fixed_checkout() {
  [[ "$(readlink -f "${REPO_ROOT}")" == "${REPO_ROOT}" ]] ||
    die "The production checkout must remain at ${REPO_ROOT}."
  [[ -f "${SERVICE_SOURCE}" && -f "${JOURNAL_CONFIG_SOURCE}" &&
    -f "${ENV_FILE}" && ! -L "${ENV_FILE}" ]] ||
    die "A service template, journald template, or production environment file is missing."
  [[ -d "${REPO_ROOT}/backend/node_modules" ]] ||
    die "Production dependencies are missing."
}

assert_checkout_clean() {
  [[ -z "$(git -C "${REPO_ROOT}" status --porcelain --untracked-files=normal)" ]] ||
    die "Checkout changes must be reviewed and committed before migration."
}

unit_is_active() {
  systemctl is-active --quiet "$1" && printf 'yes\n' || printf 'no\n'
}

backup_optional_file() {
  local source="$1"
  local name="$2"
  [[ ! -L "${source}" ]] ||
    die "Refusing to back up a symbolic link: ${source}"
  if [[ -f "${source}" ]]; then
    cp -a -- "${source}" "${BACKUP_DIR}/${name}"
  else
    touch "${BACKUP_DIR}/${name}.absent"
  fi
}

restore_optional_file() {
  local destination="$1"
  local name="$2"
  if [[ -f "${BACKUP_DIR}/${name}" ]]; then
    install -m 0644 -o root -g root "${BACKUP_DIR}/${name}" "${destination}"
  elif [[ -f "${BACKUP_DIR}/${name}.absent" ]]; then
    rm -f -- "${destination}"
  else
    die "Rollback record is incomplete for ${destination}."
  fi
}

create_migration_backup() {
  BACKUP_DIR="${BACKUP_ROOT}/${TIMESTAMP}"
  install -d -m 0700 -o root -g root "${BACKUP_ROOT}"
  [[ ! -e "${BACKUP_DIR}" ]] ||
    die "Migration backup already exists: ${BACKUP_DIR}"
  install -d -m 0700 -o root -g root "${BACKUP_DIR}"

  backup_optional_file "${SERVICE_DEST}" "echo-archives.service"
  backup_optional_file "${JOURNAL_CONFIG_DEST}" "echo-archives-journald.conf"
  backup_optional_file "${DISCOVERY_DROPIN}" "discovery-runtime-account.conf"
  cp -a -- "${ENV_FILE}" "${BACKUP_DIR}/backend.env"
  getfacl --absolute-names --recursive "${REPO_ROOT}" > "${BACKUP_DIR}/repository.acl"
  getfacl --absolute-names /home/charlie > "${BACKUP_DIR}/home.acl"

  {
    printf 'service_active=%s\n' "$(unit_is_active "${SERVICE_NAME}")"
    printf 'discovery_timer_active=%s\n' "$(unit_is_active "${DISCOVERY_TIMER}")"
    printf 'backup_timer_active=%s\n' "$(unit_is_active "${BACKUP_TIMER}")"
    printf 'offsite_timer_active=%s\n' "$(unit_is_active "${OFFSITE_TIMER}")"
    printf 'monitor_timer_active=%s\n' "$(unit_is_active "${MONITOR_TIMER}")"
  } > "${BACKUP_DIR}/unit-state"
  chmod 0600 "${BACKUP_DIR}/unit-state" "${BACKUP_DIR}/repository.acl" \
    "${BACKUP_DIR}/home.acl" "${BACKUP_DIR}/backend.env"
}

state_value() {
  local key="$1"
  awk -F= -v wanted="${key}" '$1 == wanted { print $2; found = 1 }
    END { if (!found) exit 1 }' "${BACKUP_DIR}/unit-state"
}

stop_for_migration() {
  local unit
  for unit in "${QUIESCED_UNITS[@]}"; do
    if [[ "$(systemctl show "${unit}" -p LoadState --value 2>/dev/null)" == "loaded" ]]; then
      systemctl stop "${unit}"
    fi
  done
  if [[ "$(systemctl show "${DISCOVERY_SERVICE}" -p LoadState --value 2>/dev/null)" == "loaded" ]]; then
    systemctl stop "${DISCOVERY_SERVICE}"
  fi
  systemctl stop "${SERVICE_NAME}"
}

start_previously_active_units() {
  local status=0
  if [[ "$(state_value service_active)" == "yes" ]]; then
    systemctl start "${SERVICE_NAME}" || status=1
  fi
  if [[ "$(state_value discovery_timer_active)" == "yes" ]]; then
    systemctl start "${DISCOVERY_TIMER}" || status=1
  fi
  if [[ "$(state_value backup_timer_active)" == "yes" ]]; then
    systemctl start "${BACKUP_TIMER}" || status=1
  fi
  if [[ "$(state_value offsite_timer_active)" == "yes" ]]; then
    systemctl start "${OFFSITE_TIMER}" || status=1
  fi
  if [[ "$(state_value monitor_timer_active)" == "yes" ]]; then
    systemctl start "${MONITOR_TIMER}" || status=1
  fi
  return "${status}"
}

create_verified_database_copy() {
  local source="$1"
  local destination="$2"
  [[ -f "${source}" && ! -L "${source}" ]] ||
    die "Database source is missing or unsafe: ${source}"
  [[ ! -e "${destination}" ]] ||
    die "Refusing to overwrite database copy: ${destination}"
  /usr/bin/node "${REPO_ROOT}/tools/backup-database.js" \
    --source "${source}" \
    --destination "${destination}"
  /usr/bin/node "${REPO_ROOT}/tools/check-database-backup.js" \
    --file "${destination}" \
    --max-age-hours 1 >/dev/null
}

ensure_runtime_account() {
  if id "${APP_USER}" >/dev/null 2>&1; then
    [[ "$(id -gn "${APP_USER}")" == "${APP_GROUP}" ]] ||
      die "${APP_USER} exists with an unexpected primary group."
    [[ "$(getent passwd "${APP_USER}" | awk -F: '{print $6}')" == "${STATE_ROOT}" ]] ||
      die "${APP_USER} exists with an unexpected home directory."
    [[ "$(getent passwd "${APP_USER}" | awk -F: '{print $7}')" == "/usr/sbin/nologin" ]] ||
      die "${APP_USER} exists with an unexpected login shell."
    return
  fi

  useradd \
    --system \
    --user-group \
    --home-dir "${STATE_ROOT}" \
    --shell /usr/sbin/nologin \
    "${APP_USER}"
}

update_environment_database_path() {
  local temp_file
  local owner
  local group
  local mode
  temp_file="$(mktemp "${BACKUP_DIR}/backend.env.updated.XXXXXX")"
  owner="$(stat -c %U "${ENV_FILE}")"
  group="$(stat -c %G "${ENV_FILE}")"
  mode="$(stat -c %a "${ENV_FILE}")"

  awk -v database_path="${NEW_DB}" '
    BEGIN { replaced = 0 }
    /^DB_PATH=/ {
      if (!replaced) {
        print "DB_PATH=" database_path
        replaced = 1
      }
      next
    }
    { print }
    END {
      if (!replaced) print "DB_PATH=" database_path
    }
  ' "${ENV_FILE}" > "${temp_file}"

  install -m "${mode}" -o "${owner}" -g "${group}" "${temp_file}" "${ENV_FILE}"
  rm -f -- "${temp_file}"
}

grant_runtime_read_access() {
  setfacl -m "u:${APP_USER}:--x" /home/charlie

  find "${REPO_ROOT}" -xdev \
    -path "${REPO_ROOT}/.git" -prune -o \
    -path "${REPO_ROOT}/backend/data/backups" -prune -o \
    \( -type d -o -type f \) \
    -exec setfacl -m "u:${APP_USER}:r-X" {} +
  find "${REPO_ROOT}" -xdev \
    -path "${REPO_ROOT}/.git" -prune -o \
    -path "${REPO_ROOT}/backend/data/backups" -prune -o \
    -type d -exec setfacl -m "d:u:${APP_USER}:r-X" {} +

  setfacl -m "u:${APP_USER}:r--" "${ENV_FILE}"
  for database_file in "${OLD_DB}" "${OLD_DB}-wal" "${OLD_DB}-shm"; do
    if [[ -e "${database_file}" ]]; then
      setfacl -x "u:${APP_USER}" "${database_file}" || true
    fi
  done
}

grant_runtime_write_directory() {
  local directory="$1"
  install -d -m 0770 -o "${DEPLOY_USER}" -g "${DEPLOY_GROUP}" "${directory}"
  find "${directory}" -xdev -exec \
    setfacl -m "u:${APP_USER}:rwX,u:${DEPLOY_USER}:rwX" {} +
  find "${directory}" -xdev -type d -exec \
    setfacl -m \
      "d:u:${APP_USER}:rwX,d:u:${DEPLOY_USER}:rwX" {} +
}

grant_runtime_write_access() {
  local directory
  local file

  for directory in "${WRITABLE_DIRECTORIES[@]}"; do
    grant_runtime_write_directory "${directory}"
  done

  for file in "${WRITABLE_FILES[@]}"; do
    [[ -f "${file}" && ! -L "${file}" ]] ||
      die "Required generated publication file is missing or unsafe: ${file}"
    setfacl -m "u:${APP_USER}:rw-,u:${DEPLOY_USER}:rw-" "${file}"
  done

  for directory in "${WRITABLE_FILE_PARENT_DIRECTORIES[@]}"; do
    [[ -d "${directory}" && ! -L "${directory}" ]] ||
      die "Generated publication directory is missing or unsafe: ${directory}"
    setfacl -m "d:u:${APP_USER}:rw-,d:u:${DEPLOY_USER}:rw-" "${directory}"
  done
}

configure_state_directory() {
  install -d -m 0750 -o "${APP_USER}" -g "${APP_GROUP}" "${STATE_ROOT}"
  install -m 0640 -o "${APP_USER}" -g "${APP_GROUP}" \
    "${BACKUP_DIR}/migration-database.sqlite" "${NEW_DB}"
  setfacl -m "u:${DEPLOY_USER}:r-X,d:u:${DEPLOY_USER}:r-X" "${STATE_ROOT}"
  setfacl -m "u:${DEPLOY_USER}:r--" "${NEW_DB}"
}

install_discovery_dropin() {
  local dropin_temp
  dropin_temp="$(mktemp "${BACKUP_DIR}/discovery-dropin.XXXXXX")"
  {
    printf '[Service]\n'
    printf 'User=%s\n' "${APP_USER}"
    printf 'Group=%s\n' "${APP_GROUP}"
    printf 'UMask=0027\n'
    printf 'ProtectHome=read-only\n'
    printf 'ProtectSystem=strict\n'
    printf 'PrivateDevices=true\n'
    printf 'ProtectClock=true\n'
    printf 'ProtectControlGroups=true\n'
    printf 'ProtectHostname=true\n'
    printf 'ProtectKernelLogs=true\n'
    printf 'ProtectKernelModules=true\n'
    printf 'ProtectKernelTunables=true\n'
    printf 'CapabilityBoundingSet=\n'
    printf 'LockPersonality=true\n'
    printf 'ProtectProc=invisible\n'
    printf 'ProcSubset=pid\n'
    printf 'RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6\n'
    printf 'RestrictNamespaces=true\n'
    printf 'RestrictRealtime=true\n'
    printf 'RestrictSUIDSGID=true\n'
    printf 'SystemCallArchitectures=native\n'
    printf 'StateDirectory=echo-archives\n'
    printf 'StateDirectoryMode=0750\n'
    printf 'ReadOnlyPaths=%s\n' "${REPO_ROOT}"
    printf 'ReadWritePaths=%s\n' "${STATE_ROOT}"
    printf 'ReadWritePaths=%s\n' "${REPO_ROOT}/backend/data/import-staging"
  } > "${dropin_temp}"

  install -d -m 0755 -o root -g root "${DISCOVERY_DROPIN_DIR}"
  install -m 0644 -o root -g root "${dropin_temp}" "${DISCOVERY_DROPIN}"
  rm -f -- "${dropin_temp}"
}

install_runtime_units() {
  systemd-analyze verify "${SERVICE_SOURCE}"
  install -d -m 0755 -o root -g root "${JOURNAL_CONFIG_DIR}"
  install -m 0644 -o root -g root \
    "${JOURNAL_CONFIG_SOURCE}" "${JOURNAL_CONFIG_DEST}"
  install -m 0644 -o root -g root "${SERVICE_SOURCE}" "${SERVICE_DEST}"
  install_discovery_dropin
  systemctl daemon-reload
  systemctl try-restart systemd-journald@echo-archives.service
}

wait_for_health() {
  local attempt
  for attempt in {1..20}; do
    if curl --fail --silent --show-error --max-time 5 \
      "${LOCAL_HEALTH_URL}" >/dev/null; then
      return
    fi
    sleep 2
  done
  systemctl --no-pager --full status "${SERVICE_NAME}" || true
  journalctl --namespace=echo-archives --unit "${SERVICE_NAME}" \
    --lines 80 --no-pager || true
  die "The dedicated-account service did not become healthy."
}

probe_runtime_directory_write() {
  local directory="$1"
  local probe
  probe="$(
    runuser -u "${APP_USER}" -- \
      mktemp "${directory}/.echo-runtime-account-check.XXXXXX"
  )"
  [[ "${probe}" == "${directory}/.echo-runtime-account-check."* ]] ||
    die "Unexpected runtime write probe path: ${probe}"
  runuser -u "${APP_USER}" -- rm -f -- "${probe}"
}

check_database_access() {
  runuser -u "${APP_USER}" -- /usr/bin/node - "${NEW_DB}" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const dbPath = process.argv[2];
const modulePath = require.resolve("better-sqlite3", {
  paths: ["/home/charlie/The-Echo-Archives/backend"],
});
const Database = require(modulePath);
const database = new Database(dbPath, { fileMustExist: true, readonly: true });
try {
  const result = database.pragma("integrity_check");
  if (result.length !== 1 || String(result[0].integrity_check).toLowerCase() !== "ok") {
    process.exit(1);
  }
} finally {
  database.close();
}

const probePath = path.join(path.dirname(dbPath), ".runtime-write-check.sqlite");
const probe = new Database(probePath);
try {
  probe.exec("CREATE TABLE runtime_check (value TEXT NOT NULL); INSERT INTO runtime_check VALUES ('ok')");
  if (probe.prepare("SELECT value FROM runtime_check").pluck().get() !== "ok") process.exit(1);
} finally {
  probe.close();
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${probePath}${suffix}`, { force: true });
}
NODE
}

check_environment_database_path() {
  awk -F= -v expected="${NEW_DB}" '
    $1 == "DB_PATH" {
      count += 1
      if (substr($0, index($0, "=") + 1) == expected) matched = 1
    }
    END { exit(count == 1 && matched ? 0 : 1) }
  ' "${ENV_FILE}" ||
    die "${ENV_FILE} must contain exactly DB_PATH=${NEW_DB}."
}

run_runtime_checks() {
  local directory
  local database_mode
  local file
  local health_output

  id "${APP_USER}" >/dev/null 2>&1 ||
    die "Dedicated runtime account is missing."
  [[ "$(id -gn "${APP_USER}")" == "${APP_GROUP}" ]] ||
    die "Dedicated runtime group is incorrect."
  check_environment_database_path

  [[ -f "${NEW_DB}" && ! -L "${NEW_DB}" ]] ||
    die "Dedicated runtime database is missing."
  [[ "$(stat -c %U:%G "${NEW_DB}")" == "${APP_USER}:${APP_GROUP}" ]] ||
    die "Dedicated runtime database ownership is incorrect."
  database_mode="$(stat -c %a "${NEW_DB}")"
  (( (8#${database_mode} & 8#007) == 0 )) ||
    die "Dedicated runtime database is accessible to other users."

  runuser -u "${APP_USER}" -- test -r "${REPO_ROOT}/backend/server.js" ||
    die "Runtime account cannot read deployed application code."
  if runuser -u "${APP_USER}" -- test -w "${REPO_ROOT}/backend/server.js"; then
    die "Runtime account can modify protected application code."
  fi
  runuser -u "${APP_USER}" -- test -r "${ENV_FILE}" ||
    die "Runtime account cannot read the protected application environment."
  runuser -u "${DEPLOY_USER}" -- test -w "${REPO_ROOT}/backend/server.js" ||
    die "Deployment owner can no longer maintain the checkout."
  runuser -u "${DEPLOY_USER}" -- test -w "${REPO_ROOT}/.git" ||
    die "Deployment owner can no longer update Git metadata."

  for directory in "${WRITABLE_DIRECTORIES[@]}"; do
    probe_runtime_directory_write "${directory}"
  done
  for file in "${WRITABLE_FILES[@]}"; do
    runuser -u "${APP_USER}" -- test -w "${file}" ||
      die "Runtime account cannot update publication artifact: ${file}"
  done

  check_database_access
  runuser -u "${DEPLOY_USER}" -- test -r "${NEW_DB}" ||
    die "The local backup account cannot read the dedicated database."
  runuser -u "${APP_USER}" -- \
    curl --fail --silent --show-error --max-time 10 \
    http://127.0.0.1:11434/api/version >/dev/null ||
    die "Runtime account cannot reach loopback Ollama."

  [[ "$(systemctl show "${SERVICE_NAME}" -p User --value)" == "${APP_USER}" ]] ||
    die "${SERVICE_NAME} is not running as ${APP_USER}."
  [[ "$(systemctl show "${SERVICE_NAME}" -p LogNamespace --value)" == "echo-archives" ]] ||
    die "${SERVICE_NAME} is not using the isolated Echo Archives journal."
  [[ "$(systemctl show "${DISCOVERY_SERVICE}" -p User --value)" == "${APP_USER}" ]] ||
    die "${DISCOVERY_SERVICE} is not configured for ${APP_USER}."
  systemctl is-active --quiet "${SERVICE_NAME}" ||
    die "${SERVICE_NAME} is not active."
  systemctl is-active --quiet systemd-journald@echo-archives.service ||
    die "The isolated Echo Archives journal is not active."
  grep -Fxq "MaxRetentionSec=14day" "${JOURNAL_CONFIG_DEST}" ||
    die "The isolated Echo Archives journal does not have 14-day retention."

  health_output="$(mktemp /run/echo-archives-runtime-health.XXXXXX)"
  if ! curl --fail --silent --show-error --max-time 10 \
    --output "${health_output}" "${LOCAL_HEALTH_URL}"; then
    rm -f -- "${health_output}"
    die "Local health failed under the dedicated account."
  fi
  if ! /usr/bin/node -e '
    const fs = require("node:fs");
    const health = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    process.exit(health?.features?.accessLogs === true ? 0 : 1);
  ' "${health_output}"; then
    rm -f -- "${health_output}"
    die "Access observability is not enabled in the runtime health response."
  fi
  sleep 1
  if ! journalctl --namespace=echo-archives --unit "${SERVICE_NAME}" \
    --since "2 minutes ago" --output cat --no-pager > "${health_output}"; then
    rm -f -- "${health_output}"
    die "The isolated Echo Archives journal could not be queried."
  fi
  if ! grep -Fq '"event":"http_request"' "${health_output}"; then
    rm -f -- "${health_output}"
    die "No structured HTTP access event reached the isolated journal."
  fi
  rm -f -- "${health_output}"
  health_output="$(mktemp /run/echo-archives-runtime-home.XXXXXX)"
  if ! curl --fail --silent --show-error --max-time 10 \
    --output "${health_output}" "${LOCAL_HOME_URL}"; then
    rm -f -- "${health_output}"
    die "Static homepage serving failed under the dedicated account."
  fi
  if ! grep -Fq 'The Echo Archives' "${health_output}"; then
    rm -f -- "${health_output}"
    die "Static homepage serving failed under the dedicated account."
  fi
  rm -f -- "${health_output}"

  systemd-analyze verify "${SERVICE_DEST}"
}

run_backup_compatibility_check() {
  log "Creating a normal verified local backup as ${DEPLOY_USER}."
  runuser -u "${DEPLOY_USER}" -- \
    /usr/bin/node "${REPO_ROOT}/tools/backup-database.js"
  runuser -u "${DEPLOY_USER}" -- \
    /usr/bin/node "${REPO_ROOT}/tools/check-database-backup.js" \
      --max-age-hours 1 >/dev/null
}

write_readiness_record() {
  local temp_file
  install -d -m 0755 -o root -g root "${MIGRATION_META_ROOT}"
  temp_file="$(mktemp "${MIGRATION_META_ROOT}/readiness.XXXXXX")"
  {
    printf 'completed_at=%s\n' "$(date -u --iso-8601=seconds)"
    printf 'runtime_user=%s\n' "${APP_USER}"
    printf 'database=%s\n' "${NEW_DB}"
    printf 'rollback_backup=%s\n' "${BACKUP_DIR}"
    printf 'service_user_verified=yes\n'
    printf 'database_write_verified=yes\n'
    printf 'static_serving_verified=yes\n'
    printf 'ollama_loopback_verified=yes\n'
    printf 'backup_compatibility_verified=yes\n'
    printf 'import_write_paths_verified=yes\n'
    printf 'protected_checkout_verified=yes\n'
    printf 'journal_namespace=echo-archives\n'
    printf 'journal_retention=14day\n'
    printf 'structured_access_event_verified=yes\n'
  } > "${temp_file}"
  install -m 0644 -o root -g root "${temp_file}" "${READINESS_FILE}"
  rm -f -- "${temp_file}"
}

validate_backup_directory() {
  local candidate="$1"
  [[ "${candidate}" == "${BACKUP_ROOT}/"* ]] ||
    die "Rollback directory is outside ${BACKUP_ROOT}."
  [[ -d "${candidate}" && ! -L "${candidate}" ]] ||
    die "Rollback directory is missing or unsafe: ${candidate}"
  [[ "$(stat -c %U:%G "${candidate}")" == "root:root" ]] ||
    die "Rollback directory must be owned by root:root."
  [[ "$(stat -c %a "${candidate}")" == "700" ]] ||
    die "Rollback directory must have mode 0700."
  for required in backend.env home.acl repository.acl unit-state migration-database.sqlite; do
    [[ -f "${candidate}/${required}" && ! -L "${candidate}/${required}" ]] ||
      die "Rollback directory is missing ${required}."
  done
}

transfer_runtime_publication_ownership() {
  local directory
  for directory in "${WRITABLE_DIRECTORIES[@]}"; do
    if [[ -d "${directory}" ]]; then
      find "${directory}" -xdev -user "${APP_USER}" -type d -exec \
        setfacl -x "d:u:${APP_USER}" {} +
      find "${directory}" -xdev -user "${APP_USER}" -exec \
        setfacl -x "u:${APP_USER}" {} +
      find "${directory}" -xdev -user "${APP_USER}" -exec \
        chown "${DEPLOY_USER}:${DEPLOY_GROUP}" -- {} +
    fi
  done
}

perform_rollback() {
  local requested_backup="$1"
  local rollback_database
  local sidecar
  ROLLBACK_RUNNING=1
  trap - ERR
  BACKUP_DIR="${requested_backup}"
  validate_backup_directory "${BACKUP_DIR}"

  log "Stopping Echo units before the runtime-account rollback."
  stop_for_migration

  rollback_database="${BACKUP_DIR}/rollback-current-${TIMESTAMP}.sqlite"
  if [[ -f "${NEW_DB}" ]]; then
    create_verified_database_copy "${NEW_DB}" "${rollback_database}"
  else
    rollback_database="${BACKUP_DIR}/migration-database.sqlite"
  fi

  for sidecar in "${OLD_DB}-wal" "${OLD_DB}-shm"; do
    if [[ -e "${sidecar}" ]]; then
      [[ ! -L "${sidecar}" ]] ||
        die "Refusing to replace a legacy database with a symbolic-link sidecar."
      mv -- "${sidecar}" \
        "${BACKUP_DIR}/$(basename "${sidecar}").pre-rollback-${TIMESTAMP}"
    fi
  done

  install -m 0600 -o "${DEPLOY_USER}" -g "${DEPLOY_GROUP}" \
    "${rollback_database}" "${OLD_DB}"
  cp -a -- "${BACKUP_DIR}/backend.env" "${ENV_FILE}"

  restore_optional_file "${SERVICE_DEST}" "echo-archives.service"
  restore_optional_file "${JOURNAL_CONFIG_DEST}" "echo-archives-journald.conf"
  restore_optional_file "${DISCOVERY_DROPIN}" "discovery-runtime-account.conf"
  setfacl --restore="${BACKUP_DIR}/repository.acl"
  setfacl --restore="${BACKUP_DIR}/home.acl"
  transfer_runtime_publication_ownership

  systemctl daemon-reload
  systemctl try-restart systemd-journald@echo-archives.service
  start_previously_active_units
  if [[ "$(state_value service_active)" == "yes" ]]; then
    wait_for_health
  fi

  if [[ -f "${READINESS_FILE}" ]]; then
    mv -- "${READINESS_FILE}" "${BACKUP_DIR}/readiness.rolled-back"
  fi
  log "Rollback completed. The dedicated account and ${STATE_ROOT} were preserved for inspection."
  log "The restored legacy database contains the newest writes captured at rollback time."
}

on_error() {
  local status="$?"
  local line="$1"
  trap - ERR
  log "ERROR: Runtime-account migration failed at line ${line} with status ${status}."
  if (( APPLY_MUTATED == 1 && ROLLBACK_RUNNING == 0 )) && [[ -n "${BACKUP_DIR}" ]]; then
    log "Attempting the guarded rollback from ${BACKUP_DIR}."
    log "If it fails, rerun: sudo ${REPO_ROOT}/deploy/migrate-echo-archives-runtime-account.sh --rollback ${BACKUP_DIR}"
    perform_rollback "${BACKUP_DIR}"
  elif (( UNITS_QUIESCED == 1 && ROLLBACK_RUNNING == 0 )) && [[ -n "${BACKUP_DIR}" ]]; then
    log "No files were changed; restoring the previously active units."
    start_previously_active_units || log "ERROR: A previously active unit did not restart."
  fi
  exit "${status}"
}

apply_migration() {
  assert_checkout_clean
  [[ ! -e "${READINESS_FILE}" ]] ||
    die "The runtime-account migration is already recorded; run --check."
  [[ ! -e "${NEW_DB}" ]] ||
    die "The dedicated database already exists; inspect it before attempting migration."
  systemctl is-active --quiet "${SERVICE_NAME}" ||
    die "${SERVICE_NAME} must be healthy and active before migration."
  [[ -f "${OLD_DB}" && ! -L "${OLD_DB}" ]] ||
    die "The legacy production database is missing or unsafe: ${OLD_DB}"

  create_migration_backup
  UNITS_QUIESCED=1
  stop_for_migration
  create_verified_database_copy "${OLD_DB}" "${BACKUP_DIR}/migration-database.sqlite"
  APPLY_MUTATED=1
  ensure_runtime_account
  configure_state_directory
  update_environment_database_path
  grant_runtime_read_access
  grant_runtime_write_access
  install_runtime_units

  systemctl start "${SERVICE_NAME}"
  wait_for_health
  run_runtime_checks
  run_backup_compatibility_check
  start_previously_active_units
  write_readiness_record
  APPLY_MUTATED=0

  log "Dedicated runtime-account migration completed successfully."
  log "Rollback backup: ${BACKUP_DIR}"
  log "Rollback command: sudo ${REPO_ROOT}/deploy/migrate-echo-archives-runtime-account.sh --rollback ${BACKUP_DIR}"
}

check_migration() {
  [[ -f "${READINESS_FILE}" && ! -L "${READINESS_FILE}" ]] ||
    die "Dedicated runtime-account readiness record is missing."
  run_runtime_checks
  log "Dedicated runtime-account checks passed."
}

repair_runtime_access() {
  require_operator
  assert_checkout_clean
  [[ -f "${READINESS_FILE}" && ! -L "${READINESS_FILE}" ]] ||
    die "Dedicated runtime-account readiness record is missing."
  grant_runtime_read_access
  grant_runtime_write_access
  run_runtime_checks
  log "Dedicated runtime-account access controls were repaired and verified."
}

main() {
  require_root
  require_commands
  assert_fixed_checkout

  exec 9>"${LOCK_FILE}"
  flock -n 9 || die "Another runtime-account migration or rollback is active."

  case "${1:-}" in
    --apply)
      [[ "$#" -eq 1 ]] || {
        usage >&2
        exit 1
      }
      require_operator
      trap 'on_error "${LINENO}"' ERR
      apply_migration
      ;;
    --check)
      [[ "$#" -eq 1 ]] || {
        usage >&2
        exit 1
      }
      check_migration
      ;;
    --repair-access)
      [[ "$#" -eq 1 ]] || {
        usage >&2
        exit 1
      }
      repair_runtime_access
      ;;
    --rollback)
      [[ "$#" -le 2 ]] || {
        usage >&2
        exit 1
      }
      require_operator
      if [[ "$#" -eq 2 ]]; then
        BACKUP_DIR="$2"
      else
        [[ -f "${READINESS_FILE}" ]] ||
          die "Pass the protected rollback directory because readiness is missing."
        BACKUP_DIR="$(
          awk -F= '$1 == "rollback_backup" { print substr($0, index($0, "=") + 1) }' \
            "${READINESS_FILE}"
        )"
      fi
      perform_rollback "${BACKUP_DIR}"
      ;;
    *)
      usage >&2
      exit 1
      ;;
  esac
}

main "$@"
