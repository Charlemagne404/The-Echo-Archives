#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 0077

DEPLOY_SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_REPO="${SOURCE_REPO:-$(cd "${DEPLOY_SCRIPT_ROOT}/.." && pwd)}"
DEPLOY_ROOT="${DEPLOY_ROOT:-/srv/echo-archives}"
RELEASES_DIR="${DEPLOY_ROOT}/releases"
RUNTIME_DIR="${DEPLOY_ROOT}/runtime"
STAGING_RUNTIME_DIR="${RUNTIME_DIR}/staging"
PRODUCTION_RUNTIME_DIR="${RUNTIME_DIR}/production"
SHARED_DIR="${DEPLOY_ROOT}/shared"
ENV_DIR="${SHARED_DIR}/env"
STATE_DIR="${SHARED_DIR}/state"
CURRENT_LINK="${DEPLOY_ROOT}/current"
STAGING_LINK="${DEPLOY_ROOT}/staging"
PRODUCTION_SITE_LINK="${PRODUCTION_RUNTIME_DIR}/current"
STAGING_SITE_LINK="${STAGING_RUNTIME_DIR}/current"
STAGING_ENV_FILE="${STAGING_ENV_FILE:-${ENV_DIR}/staging.env}"
PRODUCTION_ENV_FILE="${PRODUCTION_ENV_FILE:-${ENV_DIR}/production.env}"
STAGING_SERVICE="${STAGING_SERVICE:-echo-archives-staging.service}"
PRODUCTION_SERVICE="${PRODUCTION_SERVICE:-echo-archives.service}"
STAGING_PORT="${STAGING_PORT:-3011}"
PRODUCTION_PORT="${PRODUCTION_PORT:-3010}"
STAGING_URL="${STAGING_URL:-https://staging.echoarchives.net}"
PRODUCTION_URL="${PRODUCTION_URL:-https://echoarchives.net}"
STAGING_INTERNAL_HEALTH_PORT="${STAGING_INTERNAL_HEALTH_PORT:-4011}"
PRODUCTION_INTERNAL_HEALTH_PORT="${PRODUCTION_INTERNAL_HEALTH_PORT:-4010}"
STAGING_HEALTH_URL="${STAGING_HEALTH_URL:-http://127.0.0.1:${STAGING_INTERNAL_HEALTH_PORT}/api/health}"
PRODUCTION_HEALTH_URL="${PRODUCTION_HEALTH_URL:-http://127.0.0.1:${PRODUCTION_INTERNAL_HEALTH_PORT}/api/health}"
STAGING_PUBLIC_HEALTH_URL="${STAGING_PUBLIC_HEALTH_URL:-${STAGING_URL}/api/health}"
PRODUCTION_PUBLIC_HEALTH_URL="${PRODUCTION_PUBLIC_HEALTH_URL:-${PRODUCTION_URL}/api/health}"
GIT_REMOTE="${GIT_REMOTE:-origin}"
KEEP_RELEASES="${KEEP_RELEASES:-8}"

log() {
  printf '[%s] %s\n' "$(date --iso-8601=seconds)" "$*"
}

die() {
  log "ERROR: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command is missing: $1"
}

require_deployment_user() {
  [[ "${EUID}" -ne 0 ]] || die "run as the deployment user; use sudo only for systemd operations"
}

ensure_layout() {
  [[ -n "${DEPLOY_ROOT}" && "${DEPLOY_ROOT}" != "/" && "${DEPLOY_ROOT}" != "${SOURCE_REPO}" ]] ||
    die "DEPLOY_ROOT must be a dedicated directory distinct from SOURCE_REPO"
  mkdir -p -m 0750 "${RELEASES_DIR}" "${STAGING_RUNTIME_DIR}" "${PRODUCTION_RUNTIME_DIR}" "${ENV_DIR}" "${STATE_DIR}"
}

assert_environment_file() {
  local environment="$1"
  local file_path="$2"
  [[ -f "${file_path}" && ! -L "${file_path}" ]] || die "${environment} environment file is missing or unsafe: ${file_path}"
  local mode
  mode="$(stat -c '%a' "${file_path}")"
  [[ "${mode}" == "600" ]] || die "${environment} environment file must be mode 0600: ${file_path} (found ${mode})"
}

validate_environment_file() {
  local environment="$1"
  local file_path="$2"
  validate_environment_with_root "${environment}" "${file_path}" "${SOURCE_REPO}"
}

validate_environment_with_root() {
  local environment="$1"
  local file_path="$2"
  local application_root="$3"
  assert_environment_file "${environment}" "${file_path}"
  [[ -f "${application_root}/deploy/validate-env.js" ]] ||
    die "deployment environment validator is missing from ${application_root}"
  [[ -f "${application_root}/backend/scripts/check-config.js" ]] ||
    die "application configuration validator is missing from ${application_root}"

  # Node's --env-file intentionally does not override inherited variables. Use
  # a small clean environment so a developer's shell cannot silently change the
  # values being validated or leak unrelated credentials into a build.
  env -i \
    "PATH=${PATH}" \
    "HOME=${HOME:-/tmp}" \
    "NODE_ENV=production" \
    "ECHO_ENV_FILE=${file_path}" \
    /usr/bin/node --env-file="${file_path}" "${application_root}/deploy/validate-env.js" "${environment}"
  env -i \
    "PATH=${PATH}" \
    "HOME=${HOME:-/tmp}" \
    "NODE_ENV=production" \
    "ECHO_ENV_FILE=${file_path}" \
    /usr/bin/node --env-file="${file_path}" "${application_root}/backend/scripts/check-config.js"
}

run_with_environment() {
  local environment="$1"
  local site_url="$2"
  local file_path="$3"
  local root="$4"
  shift 4
  [[ -d "${root}" && ! -L "${root}" ]] || die "release root is missing or unsafe: ${root}"
  (
    cd "${root}"
    env -i \
      "PATH=${PATH}" \
      "HOME=${HOME:-/tmp}" \
      "NODE_ENV=production" \
      "DEPLOYMENT_ENV=${environment}" \
      "SITE_URL=${site_url}" \
      "ECHO_ENV_FILE=${file_path}" \
      /usr/bin/node --env-file="${file_path}" "${root}/deploy/run-with-env.js" "$@"
  )
}

run_in_test_environment() {
  local root="$1"
  shift
  [[ -d "${root}" && ! -L "${root}" ]] || die "test root is missing or unsafe: ${root}"
  (
    cd "${root}"
    env -i \
      "PATH=${PATH}" \
      "HOME=${HOME:-/tmp}" \
      NODE_ENV=test \
      "$@"
  )
}

prepare_release_permissions() {
  local release_root="$1"
  if [[ ! -d "${release_root}" || -L "${release_root}" ]]; then
    log "ERROR: release root is missing or unsafe: ${release_root}" >&2
    return 1
  fi
  if ! getent passwd echo-archives >/dev/null; then
    log "ERROR: dedicated runtime account echo-archives is missing" >&2
    return 1
  fi
  find "${release_root}" -xdev -type d -exec setfacl -m u:echo-archives:r-x {} + || return 1
  find "${release_root}" -xdev -type f -exec setfacl -m u:echo-archives:r-- {} + || return 1
}

prepare_runtime_permissions() {
  local runtime_root="$1"
  if [[ ! -d "${runtime_root}" || -L "${runtime_root}" ]]; then
    log "ERROR: runtime root is missing or unsafe: ${runtime_root}" >&2
    return 1
  fi
  if ! getent passwd echo-archives >/dev/null; then
    log "ERROR: dedicated runtime account echo-archives is missing" >&2
    return 1
  fi
  find "${runtime_root}" -xdev -type d -exec setfacl -m u:echo-archives:r-x {} + || return 1
  find "${runtime_root}" -xdev -type f -exec setfacl -m u:echo-archives:r-- {} + || return 1
}

runtime_environment_dir() {
  case "$1" in
    staging) printf '%s\n' "${STAGING_RUNTIME_DIR}" ;;
    production) printf '%s\n' "${PRODUCTION_RUNTIME_DIR}" ;;
    *) die "unknown runtime environment: $1" ;;
  esac
}

runtime_path() {
  local environment="$1"
  local release_id="$2"
  assert_release_id "${release_id}"
  printf '%s/%s\n' "$(runtime_environment_dir "${environment}")" "${release_id}"
}

runtime_site_link() {
  case "$1" in
    staging) printf '%s\n' "${STAGING_SITE_LINK}" ;;
    production) printf '%s\n' "${PRODUCTION_SITE_LINK}" ;;
    *) die "unknown runtime environment: $1" ;;
  esac
}

link_runtime_children() {
  local source_dir="$1"
  local destination_dir="$2"
  local excluded_names="$3"
  [[ -d "${source_dir}" && ! -L "${source_dir}" ]] || return 1
  mkdir -p "${destination_dir}" || return 1
  local child name
  while IFS= read -r -d '' child; do
    name="${child##*/}"
    case ",${excluded_names}," in
      *,"${name}",*) continue ;;
    esac
    ln -s "${child}" "${destination_dir}/${name}" || return 1
  done < <(find "${source_dir}" -xdev -mindepth 1 -maxdepth 1 -print0)
}

copy_runtime_mutable_tree() {
  local release_root="$1"
  local runtime_root="$2"
  [[ -d "${release_root}" && ! -L "${release_root}" ]] || return 1
  mkdir -p "${runtime_root}" || return 1

  local child name
  while IFS= read -r -d '' child; do
    name="${child##*/}"
    case "${name}" in
      catalog-src|images|data|docs) ;;
      *) ln -s "${child}" "${runtime_root}/${name}" || return 1 ;;
    esac
  done < <(find "${release_root}" -xdev -mindepth 1 -maxdepth 1 -print0)

  mkdir -p "${runtime_root}/import-staging" || return 1

  cp -a -- "${release_root}/catalog-src" "${runtime_root}/catalog-src" || return 1

  mkdir -p "${runtime_root}/images" || return 1
  link_runtime_children "${release_root}/images" "${runtime_root}/images" "covers,generated" || return 1
  if [[ -d "${release_root}/images/covers" ]]; then
    cp -a -- "${release_root}/images/covers" "${runtime_root}/images/covers" || return 1
  else
    mkdir -p "${runtime_root}/images/covers" || return 1
  fi
  if [[ -d "${release_root}/images/generated" ]]; then
    mkdir -p "${runtime_root}/images/generated" || return 1
    link_runtime_children "${release_root}/images/generated" "${runtime_root}/images/generated" "covers" || return 1
    if [[ -d "${release_root}/images/generated/covers" ]]; then
      cp -a -- "${release_root}/images/generated/covers" "${runtime_root}/images/generated/covers" || return 1
    else
      mkdir -p "${runtime_root}/images/generated/covers" || return 1
    fi
  fi

  mkdir -p "${runtime_root}/data" || return 1
  link_runtime_children "${release_root}/data" "${runtime_root}/data" \
    "shows.json,collections.json,search-index.json,archive-stats.json,tag-taxonomy.json,reviews" || return 1
  if [[ -d "${release_root}/data/reviews" ]]; then
    cp -a -- "${release_root}/data/reviews" "${runtime_root}/data/reviews" || return 1
  else
    mkdir -p "${runtime_root}/data/reviews" || return 1
  fi
  for name in shows.json collections.json search-index.json archive-stats.json tag-taxonomy.json; do
    if [[ -f "${release_root}/data/${name}" ]]; then
      cp -a -- "${release_root}/data/${name}" "${runtime_root}/data/${name}" || return 1
    fi
  done

  mkdir -p "${runtime_root}/docs" || return 1
  link_runtime_children "${release_root}/docs" "${runtime_root}/docs" "generated" || return 1
  if [[ -d "${release_root}/docs/generated" ]]; then
    cp -a -- "${release_root}/docs/generated" "${runtime_root}/docs/generated" || return 1
  else
    mkdir -p "${runtime_root}/docs/generated" || return 1
  fi
}

prepare_runtime_tree() {
  local environment="$1"
  local release_id="$2"
  local release_root
  release_root="$(release_path "${release_id}")"
  local environment_dir
  environment_dir="$(runtime_environment_dir "${environment}")"
  local final_path
  final_path="$(runtime_path "${environment}" "${release_id}")"

  if [[ -d "${final_path}" ]]; then
    verify_runtime_tree "${environment}" "${release_id}"
    prepare_runtime_permissions "${final_path}"
    log "Runtime content for ${environment} ${release_id} already exists; reusing it."
    return 0
  fi
  [[ ! -e "${final_path}" ]] || die "runtime path exists but is not a directory: ${final_path}"

  local temporary_path
  temporary_path="$(mktemp -d "${environment_dir}/.${release_id}.XXXXXX")"
  if ! copy_runtime_mutable_tree "${release_root}" "${temporary_path}" ||
    ! prepare_runtime_permissions "${temporary_path}"; then
    rm -rf -- "${temporary_path}"
    return 1
  fi
  if ! chmod 0750 "${temporary_path}"; then
    rm -rf -- "${temporary_path}"
    return 1
  fi
  if ! mv -Tf -- "${temporary_path}" "${final_path}"; then
    rm -rf -- "${temporary_path}"
    return 1
  fi
  log "Runtime content ready for ${environment} ${release_id}."
}

verify_runtime_tree() {
  local environment="$1"
  local release_id="$2"
  local path
  path="$(runtime_path "${environment}" "${release_id}")"
  [[ -d "${path}" && ! -L "${path}" ]] || die "runtime content is missing: ${environment} ${release_id}"
  [[ "$(readlink -f -- "${path}/release.json")" == "$(release_path "${release_id}")/release.json" ]] ||
    die "runtime metadata does not point to its release: ${environment} ${release_id}"
  [[ -d "${path}/catalog-src" && -d "${path}/data" && -d "${path}/images" ]] ||
    die "runtime content is incomplete: ${environment} ${release_id}"
}

atomic_runtime_switch() {
  local environment="$1"
  local link_path
  link_path="$(runtime_site_link "${environment}")"
  local release_id="$2"
  verify_runtime_tree "${environment}" "${release_id}"
  local temporary_link="${link_path}.next.$$"
  [[ ! -e "${link_path}" || -L "${link_path}" ]] || die "runtime link is a regular directory/file: ${link_path}"
  [[ ! -e "${temporary_link}" || -L "${temporary_link}" ]] || die "temporary runtime link already exists: ${temporary_link}"
  rm -f -- "${temporary_link}"
  ln -s "${release_id}" "${temporary_link}"
  mv -Tf -- "${temporary_link}" "${link_path}"
}

remove_runtime_link() {
  local environment="$1"
  local link_path
  link_path="$(runtime_site_link "${environment}")"
  if [[ ! -e "${link_path}" && ! -L "${link_path}" ]]; then
    return 0
  fi
  [[ -L "${link_path}" ]] || die "runtime link is not a symlink: ${link_path}"
  rm -f -- "${link_path}"
}

runtime_link_release_id() {
  local environment="$1"
  local link_path
  link_path="$(runtime_site_link "${environment}")"
  [[ -L "${link_path}" ]] || return 1
  local target
  target="$(readlink "${link_path}")"
  assert_release_id "${target}"
  [[ "$(readlink -f -- "${link_path}")" == "$(runtime_path "${environment}" "${target}")" ]] || return 1
  printf '%s\n' "${target}"
}

grant_active_runtime_write_paths() {
  local environment="$1"
  local link_path
  link_path="$(runtime_site_link "${environment}")"
  local release_root
  release_root="$(readlink -f -- "${link_path}")"
  local expected_root="${RUNTIME_DIR}/${environment}"
  if [[ "${release_root}" != "${expected_root}"/* || ! -d "${release_root}" || -L "${release_root}" ]]; then
    log "ERROR: active runtime link resolves outside the ${environment} runtime directory: ${link_path}" >&2
    return 1
  fi

  local relative_path
  for relative_path in \
    import-staging \
    catalog-src/shows \
    images/covers \
    images/generated/covers \
    data \
    data/reviews \
    docs/generated; do
    local directory_path="${release_root}/${relative_path}"
    if [[ -d "${directory_path}" ]]; then
      setfacl -m u:echo-archives:rwx "${directory_path}" || return 1
    fi
  done

  for relative_path in \
    data/shows.json \
    data/collections.json \
    data/search-index.json \
    data/archive-stats.json \
    data/tag-taxonomy.json \
    docs/generated/catalog-status.json \
    docs/generated/catalog-status.md; do
    local file_path="${release_root}/${relative_path}"
    if [[ -f "${file_path}" ]]; then
      setfacl -m u:echo-archives:rw "${file_path}" || return 1
    fi
  done
}

resolve_commit() {
  local requested="$1"
  local commit
  commit="$(git -C "${SOURCE_REPO}" rev-parse --verify "${requested}^{commit}" 2>/dev/null)" ||
    die "cannot resolve Git commit or ref: ${requested}"
  [[ "${commit}" =~ ^[0-9a-f]{40}$ ]] || die "resolved commit is not a full SHA: ${commit}"
  printf '%s\n' "${commit}"
}

fetch_source() {
  log "Fetching ${GIT_REMOTE} refs without changing the checked-out files."
  git -C "${SOURCE_REPO}" fetch --prune --tags "${GIT_REMOTE}" >/dev/null
}

assert_release_id() {
  [[ "$1" =~ ^[0-9a-f]{40}$ ]] || die "unsafe release id: $1"
}

release_path() {
  local release_id="$1"
  assert_release_id "${release_id}"
  printf '%s/%s\n' "${RELEASES_DIR}" "${release_id}"
}

release_commit() {
  local release_id="$1"
  local path
  path="$(release_path "${release_id}")"
  [[ -d "${path}" && ! -L "${path}" ]] || die "release directory is missing or unsafe: ${path}"
  /usr/bin/node - "${path}/release.json" <<'NODE'
const fs = require("node:fs");
const filePath = process.argv[2];
const metadata = JSON.parse(fs.readFileSync(filePath, "utf8"));
if (typeof metadata.commit !== "string" || !/^[0-9a-f]{40}$/.test(metadata.commit)) process.exit(1);
process.stdout.write(metadata.commit);
NODE
}

verify_release() {
  local release_id="$1"
  local expected_commit="${2:-${release_id}}"
  assert_release_id "${release_id}"
  local path
  path="$(release_path "${release_id}")"
  [[ -d "${path}" && ! -L "${path}" ]] || die "release is missing: ${release_id}"
  [[ -f "${path}/release.json" && ! -L "${path}/release.json" ]] || die "release metadata is missing: ${release_id}"
  [[ "$(release_commit "${release_id}")" == "${expected_commit}" ]] ||
    die "release metadata does not match expected commit: ${release_id}"
  [[ -f "${path}/backend/server.js" && -d "${path}/backend/node_modules" ]] ||
    die "release is incomplete: ${release_id}"
}

atomic_switch() {
  local link_path="$1"
  local release_id="$2"
  verify_release "${release_id}"
  [[ "${link_path}" == "${DEPLOY_ROOT}/current" || "${link_path}" == "${DEPLOY_ROOT}/staging" ]] ||
    die "refusing to switch an unapproved symlink: ${link_path}"
  [[ ! -e "${link_path}" || -L "${link_path}" ]] || die "release link is a regular directory/file: ${link_path}"
  local temporary_link="${link_path}.next.$$"
  [[ ! -e "${temporary_link}" || -L "${temporary_link}" ]] || die "temporary release link already exists: ${temporary_link}"
  rm -f -- "${temporary_link}"
  ln -s "releases/${release_id}" "${temporary_link}"
  mv -Tf -- "${temporary_link}" "${link_path}"
}

remove_release_link() {
  local link_path="$1"
  [[ "${link_path}" == "${DEPLOY_ROOT}/current" || "${link_path}" == "${DEPLOY_ROOT}/staging" ]] ||
    die "refusing to remove an unapproved release link: ${link_path}"
  if [[ ! -e "${link_path}" && ! -L "${link_path}" ]]; then
    return 0
  fi
  [[ -L "${link_path}" ]] || die "release link is not a symlink: ${link_path}"
  rm -f -- "${link_path}"
}

link_release_id() {
  local link_path="$1"
  [[ -L "${link_path}" ]] || return 1
  local target
  target="$(readlink "${link_path}")"
  [[ "${target}" == releases/* ]] || return 1
  local release_id="${target#releases/}"
  assert_release_id "${release_id}"
  printf '%s\n' "${release_id}"
}

restart_service() {
  local service="$1"
  log "Restarting ${service}."
  sudo systemctl restart "${service}"
}

acquire_deployment_lock() {
  require_command flock
  local lock_path="${STATE_DIR}/deployment.lock"
  exec 9>"${lock_path}"
  flock -n 9 || die "another Echo release operation is already running: ${lock_path}"
}

health_check() {
  local label="$1"
  local url="$2"
  local expected_environment="$3"
  local expected_commit="$4"
  local output
  output="$(mktemp /tmp/echo-release-health.XXXXXX)"
  if ! curl --fail --silent --show-error --max-time 10 --output "${output}" "${url}"; then
    rm -f -- "${output}"
    log "ERROR: ${label} health request failed: ${url}" >&2
    return 1
  fi
  if ! /usr/bin/node - "${output}" <<'NODE'
const fs = require("node:fs");
const [filePath] = process.argv.slice(2);
const health = JSON.parse(fs.readFileSync(filePath, "utf8"));
if (health.ok !== true || health.status !== "ok") {
  console.error(JSON.stringify({ health }));
  process.exit(1);
}
NODE
  then
    rm -f -- "${output}"
    log "ERROR: ${label} health response was not healthy" >&2
    return 1
  fi
  rm -f -- "${output}"
  verify_running_release "${expected_environment}" "${expected_commit}" || return 1
  log "${label} health passed for ${expected_commit}."
}

verify_running_release() {
  local environment="$1"
  local expected_commit="$2"
  local service
  local link_path
  case "${environment}" in
    staging)
      service="${STAGING_SERVICE}"
      link_path="${STAGING_LINK}"
      ;;
    production)
      service="${PRODUCTION_SERVICE}"
      link_path="${CURRENT_LINK}"
      ;;
    *)
      log "ERROR: unknown release environment: ${environment}" >&2
      return 1
      ;;
  esac

  local expected_root
  expected_root="$(release_path "${expected_commit}")"
  [[ "$(readlink -f -- "${link_path}")" == "${expected_root}" ]] || {
    log "ERROR: ${environment} release link does not select ${expected_commit}." >&2
    return 1
  }
  [[ "$(systemctl is-active "${service}")" == "active" ]] || {
    log "ERROR: ${service} is not active." >&2
    return 1
  }
  [[ "$(systemctl show "${service}" -p MainPID --value)" =~ ^[1-9][0-9]*$ ]] || {
    log "ERROR: ${service} has no running main process." >&2
    return 1
  }

  local working_directory
  working_directory="$(systemctl show "${service}" -p WorkingDirectory --value)"
  [[ "${working_directory}" == "${link_path}/backend" ]] || {
    log "ERROR: ${service} does not use the expected release working directory." >&2
    return 1
  }
  log "${environment} service is active on the expected release ${expected_commit}."
}

assert_release_service() {
  local service="$1"
  local link_path="$2"
  local environment_file="$3"
  local expected_port="$4"
  local expected_static_root="$5"
  local expected_import_staging_root="$6"
  local unit_contents
  unit_contents="$(sudo systemctl cat "${service}")" || die "cannot read installed unit ${service}"
  [[ "${unit_contents}" == *"WorkingDirectory=${link_path}/backend"* ]] ||
    die "${service} is not configured to use ${link_path}/backend"
  [[ "${unit_contents}" == *"ExecStart=/usr/bin/node ${link_path}/backend/server.js"* ]] ||
    die "${service} is not configured to run ${link_path}/backend/server.js"
  [[ "${unit_contents}" == *"Environment=PORT=${expected_port}"* ]] ||
    die "${service} does not declare the expected port ${expected_port}"
  [[ "${unit_contents}" == *"Environment=STATIC_ROOT=${expected_static_root}"* ]] ||
    die "${service} does not use ${expected_static_root} as its static root"
  [[ "${unit_contents}" == *"Environment=IMPORT_STAGING_ROOT=${expected_import_staging_root}"* ]] ||
    die "${service} does not use ${expected_import_staging_root} as its importer staging root"
  [[ "${unit_contents}" == *"EnvironmentFile=${environment_file}"* ]] ||
    die "${service} does not use ${environment_file}"

  local actual_working_directory actual_exec_start
  actual_working_directory="$(sudo systemctl show "${service}" -p WorkingDirectory --value)" ||
    die "cannot inspect the effective working directory for ${service}"
  actual_exec_start="$(sudo systemctl show "${service}" -p ExecStart --value)" ||
    die "cannot inspect the effective command for ${service}"
  [[ "${actual_working_directory}" == "${link_path}/backend" ]] ||
    die "${service} effective WorkingDirectory is not ${link_path}/backend"
  [[ "${actual_exec_start}" == *"/usr/bin/node ${link_path}/backend/server.js"* ]] ||
    die "${service} effective ExecStart is not ${link_path}/backend/server.js"
}

record_staging_test() {
  local release_id="$1"
  local commit="$2"
  local temporary_file="${STATE_DIR}/staging-tested.json.tmp.$$"
  cat >"${temporary_file}" <<EOF
{"releaseId":"${release_id}","commit":"${commit}","testedAt":"$(date --iso-8601=seconds)","url":"${STAGING_URL}"}
EOF
  chmod 0600 "${temporary_file}"
  mv -f -- "${temporary_file}" "${STATE_DIR}/staging-tested.json"
}

tested_staging_commit() {
  [[ -f "${STATE_DIR}/staging-tested.json" && ! -L "${STATE_DIR}/staging-tested.json" ]] || return 1
  /usr/bin/node - "${STATE_DIR}/staging-tested.json" <<'NODE'
const fs = require("node:fs");
const metadata = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (typeof metadata.commit !== "string" || !/^[0-9a-f]{40}$/.test(metadata.commit)) process.exit(1);
process.stdout.write(metadata.commit);
NODE
}

preflight_legacy_commit() {
  local marker="${STATE_DIR}/preflight-latest.json"
  [[ -f "${marker}" && ! -L "${marker}" ]] || return 1
  /usr/bin/node - "${marker}" <<'NODE'
const fs = require("node:fs");
const metadata = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (typeof metadata.legacyCommit !== "string" || !/^[0-9a-f]{40}$/.test(metadata.legacyCommit)) process.exit(1);
  process.stdout.write(metadata.legacyCommit);
NODE
}

preflight_legacy_worktree_status() {
  local marker="${STATE_DIR}/preflight-latest.json"
  [[ -f "${marker}" && ! -L "${marker}" ]] || return 1
  /usr/bin/node - "${marker}" <<'NODE'
const fs = require("node:fs");
const metadata = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (!Number.isInteger(metadata.legacyWorktreeStatus) || metadata.legacyWorktreeStatus < 0) process.exit(1);
process.stdout.write(String(metadata.legacyWorktreeStatus));
NODE
}

record_production_history() {
  local event="$1"
  local from_release="$2"
  local to_release="$3"
  printf '%s\t%s\t%s\t%s\n' "$(date --iso-8601=seconds)" "${event}" "${from_release}" "${to_release}" >>"${STATE_DIR}/production-history.log"
  chmod 0600 "${STATE_DIR}/production-history.log"
}

require_recent_preflight() {
  local maximum_age_hours="${MAX_PREFLIGHT_AGE_HOURS:-24}"
  [[ "${maximum_age_hours}" =~ ^[1-9][0-9]*$ ]] || die "MAX_PREFLIGHT_AGE_HOURS must be a positive integer"
  local marker="${STATE_DIR}/preflight-latest.json"
  [[ -f "${marker}" && ! -L "${marker}" ]] || die "run ./deploy/echo preflight before production promotion"
  local modified_at now age_seconds
  modified_at="$(stat -c '%Y' "${marker}")"
  now="$(date +%s)"
  age_seconds=$((now - modified_at))
  (( age_seconds >= 0 && age_seconds <= maximum_age_hours * 3600 )) ||
    die "the latest production preflight is older than ${maximum_age_hours} hours; run ./deploy/echo preflight again"
}

previous_production_release() {
  local current_release="$1"
  [[ -f "${STATE_DIR}/production-history.log" ]] || return 1
  tac "${STATE_DIR}/production-history.log" | while IFS=$'\t' read -r _timestamp event from_release to_release; do
    # A successful rollback records the bad release in from_release. Once the
    # target is current, do not immediately offer that known-bad release as
    # the next default rollback target.
    if [[ "${event}" == "rollback" && "${to_release}" == "${current_release}" ]]; then
      continue
    fi
    if [[ "${event}" == "promote" || "${event}" == "rollback" ]] &&
      [[ "${from_release}" =~ ^[0-9a-f]{40}$ && "${from_release}" != "${current_release}" ]] &&
      [[ -d "$(release_path "${from_release}")" ]]; then
      printf '%s\n' "${from_release}"
      break
    fi
  done
}

remove_release_dir() {
  local release_id="$1"
  local path
  path="$(release_path "${release_id}")"
  [[ -d "${path}" && ! -L "${path}" ]] || die "refusing to remove a missing or symlinked release: ${release_id}"
  rm -rf -- "${path}"
}
