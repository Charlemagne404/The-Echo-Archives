#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 0077

SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=release-common.sh
source "${SCRIPT_ROOT}/release-common.sh"

PREFLIGHT_ROOT="${PREFLIGHT_ROOT:-${DEPLOY_ROOT}/preflight}"
PRODUCTION_DB_PATH="${PRODUCTION_DB_PATH:-/var/lib/echo-archives/community.sqlite}"
LEGACY_REPO_ROOT="${LEGACY_REPO_ROOT:-${SOURCE_REPO}}"

copy_if_present() {
  local source_path="$1"
  local target_root="$2"
  if [[ -e "${source_path}" || -L "${source_path}" ]]; then
    mkdir -p "${target_root}"
    cp -a -- "${source_path}" "${target_root}/"
  fi
}

main() {
  require_deployment_user
  for command_name in cp caddy date find git install mkdir node readlink sha256sum stat systemctl tar tr wc; do
    require_command "${command_name}"
  done
  ensure_layout
  [[ -d "${LEGACY_REPO_ROOT}" ]] || die "legacy/current repository is missing: ${LEGACY_REPO_ROOT}"
  [[ -f "/etc/caddy/Caddyfile" ]] || die "authoritative Caddyfile is missing: /etc/caddy/Caddyfile"

  local timestamp
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  local snapshot
  snapshot="$(mktemp -d "${PREFLIGHT_ROOT}/preflight-${timestamp}.XXXXXX")"
  chmod 0700 "${snapshot}"
  mkdir -p -m 0700 "${snapshot}/configuration" "${snapshot}/persistent" "${snapshot}/generated" "${snapshot}/runtime"

  local service_fragment_path
  service_fragment_path="$(sudo systemctl show echo-archives.service -p FragmentPath --value)" ||
    die "could not determine the installed production service unit path"
  local service_environment_files
  service_environment_files="$(sudo systemctl show echo-archives.service -p EnvironmentFiles --value)" ||
    die "could not determine the installed production environment file location"
  local main_pid
  main_pid="$(sudo systemctl show echo-archives.service -p MainPID --value)" || main_pid=""
  [[ ! -e "${CURRENT_LINK}" || -L "${CURRENT_LINK}" ]] ||
    die "production current path is not a symlink: ${CURRENT_LINK}"

  local legacy_commit
  legacy_commit="$(git -C "${LEGACY_REPO_ROOT}" rev-parse HEAD 2>/dev/null || echo unknown)"
  local legacy_worktree_status
  legacy_worktree_status="$(git -C "${LEGACY_REPO_ROOT}" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
  local active_release=""
  local active_code_root="${LEGACY_REPO_ROOT}"
  local active_static_root="${LEGACY_REPO_ROOT}"
  if [[ -L "${CURRENT_LINK}" ]]; then
    active_release="$(link_release_id "${CURRENT_LINK}")"
    active_code_root="$(readlink -f -- "${CURRENT_LINK}")"
    [[ -d "${active_code_root}" && ! -L "${active_code_root}" ]] ||
      die "production current link does not resolve to a release directory: ${CURRENT_LINK}"
    if [[ -L "${PRODUCTION_SITE_LINK}" ]]; then
      local runtime_release
      runtime_release="$(runtime_link_release_id production)" ||
        die "production runtime link is not a valid release overlay: ${PRODUCTION_SITE_LINK}"
      [[ "${runtime_release}" == "${active_release}" ]] ||
        die "production code and runtime links disagree: ${active_release} vs ${runtime_release}"
      active_static_root="$(readlink -f -- "${PRODUCTION_SITE_LINK}")"
    else
      log "WARNING: production runtime link is absent; preflight will snapshot the active release tree instead."
      active_static_root="${active_code_root}"
    fi
  fi
  local active_commit="${legacy_commit}"
  if [[ -n "${active_release}" ]]; then
    active_commit="$(release_commit "${active_release}")"
  fi
  local environment_file="${LEGACY_REPO_ROOT}/backend/.env"
  if [[ -n "${active_release}" ]]; then
    environment_file="${PRODUCTION_ENV_FILE}"
  fi

  log "Capturing a non-destructive production preflight snapshot at ${snapshot}."
  {
    echo "capturedAt=${timestamp}"
    echo "legacyRepository=${LEGACY_REPO_ROOT}"
    echo "legacyCommit=${legacy_commit}"
    echo "legacyBranch=$(git -C "${LEGACY_REPO_ROOT}" symbolic-ref --short -q HEAD 2>/dev/null || echo detached)"
    echo "legacyWorktreeStatus=${legacy_worktree_status}"
    echo "activeRelease=${active_release:-legacy-checkout}"
    echo "activeCommit=${active_commit}"
    echo "activeCodeRoot=${active_code_root}"
    echo "activeStaticRoot=${active_static_root}"
    echo "productionDatabase=${PRODUCTION_DB_PATH}"
    echo "productionEnvironmentFile=${environment_file}"
    echo "effectiveEnvironmentFiles=${service_environment_files}"
    echo "productionService=echo-archives.service"
    echo "productionServiceFragment=${service_fragment_path}"
    echo "productionMainPID=${main_pid}"
    echo "caddyConfig=/etc/caddy/Caddyfile"
    echo "releaseRoot=${DEPLOY_ROOT}"
  } >"${snapshot}/MANIFEST.txt"

  git -C "${LEGACY_REPO_ROOT}" status --short >"${snapshot}/configuration/legacy-git-status.txt" || true
  git -C "${LEGACY_REPO_ROOT}" diff --stat --no-ext-diff >"${snapshot}/configuration/legacy-working-tree-stat.txt" || true
  git -C "${LEGACY_REPO_ROOT}" ls-files --others --exclude-standard >"${snapshot}/configuration/legacy-untracked-files.txt" || true
  sudo systemctl cat echo-archives.service >"${snapshot}/configuration/echo-archives.service.txt"
  sudo systemctl show echo-archives.service \
    -p FragmentPath -p DropInPaths -p User -p Group -p WorkingDirectory -p ExecStart \
    -p EnvironmentFiles -p ActiveState -p SubState >"${snapshot}/configuration/echo-archives.service.show.txt"
  if [[ -n "${service_fragment_path}" && -f "${service_fragment_path}" && ! -L "${service_fragment_path}" ]]; then
    sudo cp -a -- "${service_fragment_path}" "${snapshot}/configuration/installed-production-unit"
  fi
  if [[ "${main_pid}" =~ ^[1-9][0-9]*$ ]]; then
    readlink "/proc/${main_pid}/cwd" >"${snapshot}/runtime/production-main-cwd.txt" 2>/dev/null || true
    tr '\0' ' ' <"/proc/${main_pid}/cmdline" >"${snapshot}/runtime/production-main-cmdline.txt" 2>/dev/null || true
  fi
  sudo systemctl cat caddy.service >"${snapshot}/configuration/caddy.service.txt"
  sudo cp -a -- /etc/caddy/Caddyfile "${snapshot}/configuration/Caddyfile"
  sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >"${snapshot}/configuration/caddy-validate.txt"
  sha256sum "${snapshot}/configuration/Caddyfile" >"${snapshot}/configuration/Caddyfile.sha256"

  if [[ -f "${environment_file}" && ! -L "${environment_file}" ]]; then
    stat "${environment_file}" >"${snapshot}/configuration/production-env.stat"
    sha256sum "${environment_file}" >"${snapshot}/configuration/production-env.sha256"
  else
    echo "production environment file is missing: ${environment_file}" >"${snapshot}/configuration/production-env.missing"
  fi

  if [[ -f "${PRODUCTION_DB_PATH}" && ! -L "${PRODUCTION_DB_PATH}" ]]; then
    mkdir -p -m 0700 "${snapshot}/persistent/database-backup"
    local backup_tool="${active_code_root}/tools/backup-database.js"
    [[ -f "${backup_tool}" && ! -L "${backup_tool}" ]] || backup_tool="${LEGACY_REPO_ROOT}/tools/backup-database.js"
    /usr/bin/node "${backup_tool}" \
      --source "${PRODUCTION_DB_PATH}" \
      --destination "${snapshot}/persistent/database-backup/community.sqlite"
    sha256sum "${snapshot}/persistent/database-backup/community.sqlite" >"${snapshot}/persistent/database-backup/community.sqlite.sha256"
  else
    die "production database is missing or unsafe: ${PRODUCTION_DB_PATH}"
  fi

  # These are the active deployment's durable/catalog inputs and generated outputs.
  # They are copied for disaster inspection; they are not treated as a database rollback.
  copy_if_present "${active_static_root}/catalog-src" "${snapshot}/generated"
  copy_if_present "${active_static_root}/images/covers" "${snapshot}/generated"
  copy_if_present "${active_static_root}/images/generated/covers" "${snapshot}/generated"
  copy_if_present "${active_static_root}/data" "${snapshot}/generated"
  copy_if_present "${active_static_root}/docs/generated" "${snapshot}/generated"
  copy_if_present "${active_static_root}/import-staging" "${snapshot}/runtime"
  # Preserve the legacy checkout's local SQLite sidecars when present; these
  # are not authoritative when the service uses /var/lib/echo-archives.
  copy_if_present "${LEGACY_REPO_ROOT}/backend/data/import-staging" "${snapshot}/runtime"
  copy_if_present "${LEGACY_REPO_ROOT}/backend/data/community.sqlite" "${snapshot}/runtime"
  copy_if_present "${LEGACY_REPO_ROOT}/backend/data/community.sqlite-wal" "${snapshot}/runtime"
  copy_if_present "${LEGACY_REPO_ROOT}/backend/data/community.sqlite-shm" "${snapshot}/runtime"

  cat >"${snapshot}/RECOVERY_NOTES.txt" <<EOF
This snapshot was captured without stopping Echo, Caddy, or changing production.

The SQLite file is an online integrity-checked backup and is the authoritative
rollback point for production community/submission state. The copied catalog
and generated files describe the active deployment and are not automatically
restored by a code release rollback.

Secrets were deliberately not copied. The production environment file is
represented only by its path, mode/stat output, and SHA-256 checksum.
Keep this directory private and copy it off-host before the first promotion.
EOF
  chmod 0600 "${snapshot}/MANIFEST.txt" "${snapshot}/RECOVERY_NOTES.txt" "${snapshot}/configuration"/* 2>/dev/null || true

  local marker="${STATE_DIR}/preflight-latest.json"
  cat >"${marker}.tmp.$$" <<EOF
{"snapshot":"${snapshot}","capturedAt":"${timestamp}","productionDatabase":"${PRODUCTION_DB_PATH}","legacyCommit":"${legacy_commit}","legacyWorktreeStatus":${legacy_worktree_status},"activeRelease":"${active_release}","activeCommit":"${active_commit}"}
EOF
  chmod 0600 "${marker}.tmp.$$"
  mv -f -- "${marker}.tmp.$$" "${marker}"
  log "Preflight snapshot complete. Copy ${snapshot} off-host before production cutover."
}

main "$@"
