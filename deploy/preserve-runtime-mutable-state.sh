#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 0077

SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=runtime-mutable-paths.sh
source "${SCRIPT_ROOT}/runtime-mutable-paths.sh"

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

[[ "$#" -eq 4 ]] || fail "usage: preserve-runtime-mutable-state.sh <runtime-root> <environment> <source-root> <target-root>"
runtime_root="$1"
environment="$2"
source_root="$3"
target_root="$4"

[[ "${runtime_root}" == /* && -d "${runtime_root}" && ! -L "${runtime_root}" ]] ||
  fail "runtime root is missing or unsafe"
runtime_root="$(/usr/bin/realpath -e -- "${runtime_root}")" || fail "runtime root cannot be resolved"
[[ "${environment}" == "staging" || "${environment}" == "production" ]] || fail "unknown environment"
environment_root="${runtime_root}/${environment}"
[[ -d "${environment_root}" && ! -L "${environment_root}" ]] || fail "environment runtime directory is missing or unsafe"
environment_root="$(/usr/bin/realpath -e -- "${environment_root}")" || fail "environment runtime directory cannot be resolved"

source_name="${source_root##*/}"
target_name="${target_root##*/}"
[[ "$(dirname -- "${source_root}")" == "${environment_root}" && "${source_name}" =~ ^[0-9a-f]{40}$ ]] ||
  fail "source runtime is outside the selected environment"
[[ "$(dirname -- "${target_root}")" == "${environment_root}" ]] || fail "target runtime is outside the selected environment"
[[ "${target_name}" =~ ^[0-9a-f]{40}$ || "${target_name}" =~ ^runtime-[0-9a-f]{40}\.[[:alnum:]]+$ ]] ||
  fail "target runtime name is invalid"
[[ -d "${source_root}" && ! -L "${source_root}" && -d "${target_root}" && ! -L "${target_root}" ]] ||
  fail "source or target runtime is missing or unsafe"
[[ "$(/usr/bin/realpath -e -- "${source_root}")" == "${source_root}" && "$(/usr/bin/realpath -e -- "${target_root}")" == "${target_root}" ]] ||
  fail "source or target runtime resolves through a symlink"
[[ "${source_root}" != "${target_root}" ]] || fail "source and target runtimes must differ"

current_link="${environment_root}/current"
[[ -L "${current_link}" && "$(/usr/bin/readlink -f -- "${current_link}")" == "${source_root}" ]] ||
  fail "source runtime is no longer active"
[[ "$(/usr/bin/readlink -f -- "${current_link}")" != "${target_root}" ]] || fail "refusing to overwrite the active runtime"

assert_safe_parent_chain() {
  local root="$1"
  local relative_path="$2"
  local parent_relative="${relative_path%/*}"
  [[ "${parent_relative}" != "${relative_path}" ]] || parent_relative=""
  local current="${root}"
  local part
  local -a parts
  if [[ -n "${parent_relative}" ]]; then
    IFS='/' read -r -a parts <<< "${parent_relative}"
    for part in "${parts[@]}"; do
      current="${current}/${part}"
      [[ -d "${current}" && ! -L "${current}" ]] || fail "runtime path has an unsafe parent directory"
    done
  fi
}

staging_root="${source_root}/import-staging"
if [[ -e "${staging_root}" || -L "${staging_root}" ]]; then
  [[ -d "${staging_root}" && ! -L "${staging_root}" ]] || fail "import staging path is unsafe"
fi

# The privileged deployment path has a fixed system Node location. Direct
# unprivileged test/development runs use the project Node already on PATH.
if [[ "${EUID}" -eq 0 ]]; then
  node_binary="/usr/bin/node"
else
  node_binary="$(command -v node)" || fail "the Node runtime is required for catalogue snapshot locking"
fi
[[ -x "${node_binary}" ]] || fail "the Node runtime is unavailable for catalogue snapshot locking"

# Catalogue writers use this same atomic journal directory as their exclusion
# gate. Holding a runtime-snapshot journal makes concurrent writers fail closed
# and makes a publisher that wins the mkdir race prevent this copy from starting.
snapshot_worker_pid=""
snapshot_worker_ready=false
snapshot_owner_args=()
if [[ "${EUID}" -eq 0 ]]; then
  service_account="$(getent passwd echo-archives)" || fail "the Echo service account is required for journal snapshot recovery"
  IFS=: read -r _ _ snapshot_owner_uid snapshot_owner_gid _ <<< "${service_account}"
  [[ "${snapshot_owner_uid}" =~ ^[0-9]+$ && "${snapshot_owner_gid}" =~ ^[0-9]+$ ]] ||
    fail "the Echo service account has invalid uid/gid metadata"
  snapshot_owner_args=("${snapshot_owner_uid}" "${snapshot_owner_gid}")
fi
release_snapshot_worker_on_exit() {
  [[ -n "${snapshot_worker_pid}" ]] || return 0
  if [[ "${snapshot_worker_ready}" == "true" ]]; then
    printf 'release\n' >&"${snapshot_control_fd}" || true
  else
    kill -TERM "${snapshot_worker_pid}" 2>/dev/null || true
  fi
  wait "${snapshot_worker_pid}" 2>/dev/null || true
  snapshot_worker_pid=""
}

coproc CATALOG_SNAPSHOT_LOCK {
  "${node_binary}" "${SCRIPT_ROOT}/runtime-snapshot-lock.js" "${source_root}" "${snapshot_owner_args[@]}"
}
snapshot_worker_pid="${CATALOG_SNAPSHOT_LOCK_PID}"
snapshot_status_fd="${CATALOG_SNAPSHOT_LOCK[0]}"
snapshot_control_fd="${CATALOG_SNAPSHOT_LOCK[1]}"
trap release_snapshot_worker_on_exit EXIT
if ! IFS= read -r -t 10 -u "${snapshot_status_fd}" snapshot_status || [[ "${snapshot_status}" != "snapshot-lock-ready" ]]; then
  fail "could not acquire the catalogue publication journal for a consistent runtime snapshot"
fi
snapshot_worker_ready=true

remove_copied_runtime_snapshot_journal() {
  local source_staging="$1"
  local target_staging="$2"
  "${node_binary}" - "${source_staging}" "${target_staging}" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const [sourceStaging, targetStaging] = process.argv.slice(2);
const journalName = ".echo-catalog-transaction";
const sourceJournal = path.join(sourceStaging, journalName);
const targetJournal = path.join(targetStaging, journalName);

function assertDirectory(directory) {
  if (fs.realpathSync(directory) !== path.resolve(directory)) throw new Error("snapshot staging path resolves through a symlink");
}

function readSnapshotJournal(directory) {
  const directoryStat = fs.lstatSync(directory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) throw new Error("copied runtime snapshot journal is not a regular directory");
  const entries = fs.readdirSync(directory);
  if (entries.length !== 1 || entries[0] !== "manifest.json") throw new Error("runtime snapshot journal has unexpected contents");
  const manifestPath = path.join(directory, "manifest.json");
  const manifestStat = fs.lstatSync(manifestPath);
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) throw new Error("runtime snapshot manifest is not a regular file");
  const bytes = fs.readFileSync(manifestPath);
  const manifest = JSON.parse(bytes.toString("utf8"));
  if (manifest.schema !== 1 || manifest.kind !== "runtime-snapshot" || manifest.phase !== "prepared" ||
      !Number.isInteger(manifest.pid) || typeof manifest.instance !== "string" ||
      !Array.isArray(manifest.files) || manifest.files.length !== 0 ||
      !Array.isArray(manifest.absentDirectories) || manifest.absentDirectories.length !== 0 ||
      manifest.recoveryData !== undefined) {
    throw new Error("catalogue journal is not the temporary runtime snapshot lock");
  }
  return bytes;
}

assertDirectory(sourceStaging);
assertDirectory(targetStaging);
const sourceBytes = readSnapshotJournal(sourceJournal);
const targetBytes = readSnapshotJournal(targetJournal);
if (!sourceBytes.equals(targetBytes)) throw new Error("copied runtime snapshot journal does not match its active source lock");

// This journal only excludes writers during the copy. Carrying its private
// manifest into the new overlay makes service startup try to recover a lock
// owned by the deployment process, so remove the verified copy while the
// source lock is still held.
fs.rmSync(targetJournal, { recursive: true });
NODE
}

for relative_path in "${runtime_mutable_paths[@]}"; do
  source_path="${source_root}/${relative_path}"
  target_path="${target_root}/${relative_path}"
  [[ -e "${source_path}" || -L "${source_path}" ]] || continue
  assert_safe_parent_chain "${source_root}" "${relative_path}"
  assert_safe_parent_chain "${target_root}" "${relative_path}"
  /usr/bin/rm -rf -- "${target_path}" || fail "could not replace an inactive runtime path"
  /usr/bin/cp -a -- "${source_path}" "${target_path}" || fail "could not preserve runtime content"
  if [[ "${relative_path}" == "import-staging" ]]; then
    remove_copied_runtime_snapshot_journal "${source_path}" "${target_path}" ||
      fail "could not remove the verified temporary runtime snapshot journal copy"
  fi
done

if ! printf 'release\n' >&"${snapshot_control_fd}"; then
  fail "could not release the catalogue runtime snapshot journal"
fi
if ! wait "${snapshot_worker_pid}"; then
  snapshot_worker_pid=""
  fail "could not release the catalogue runtime snapshot journal"
fi
snapshot_worker_pid=""
snapshot_worker_ready=false
trap - EXIT
