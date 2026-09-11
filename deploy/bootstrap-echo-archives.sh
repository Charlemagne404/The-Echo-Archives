#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 0077

if [[ "${EUID}" -ne 0 ]]; then
  printf 'Run this host bootstrap with sudo.\n' >&2
  exit 1
fi

SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="${REPO_ROOT:-$(cd "${SCRIPT_ROOT}/.." && pwd -P)}"
DEPLOY_ROOT="${DEPLOY_ROOT:-/srv/echo-archives}"
DEPLOY_USER="${DEPLOY_USER:-$(stat -c '%U' "${REPO_ROOT}")}"
DEPLOY_GROUP="${DEPLOY_GROUP:-$(id -gn "${DEPLOY_USER}")}"
RUNTIME_USER="${RUNTIME_USER:-echo-archives}"
RUNTIME_GROUP="${RUNTIME_GROUP:-echo-archives}"

die() {
  printf 'Echo Archives host bootstrap failed: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command is missing: $1"
}

for command_name in cp date getent grep id install rmdir setfacl stat systemd-analyze systemctl useradd; do
  require_command "${command_name}"
done

[[ -d "${REPO_ROOT}" && ! -L "${REPO_ROOT}" ]] || die "repository is missing or unsafe: ${REPO_ROOT}"
[[ "${DEPLOY_ROOT}" == "/srv/echo-archives" ]] ||
  die "checked-in systemd units use the reviewed architecture root /srv/echo-archives"
id "${DEPLOY_USER}" >/dev/null 2>&1 || die "deployment user does not exist: ${DEPLOY_USER}"
getent group "${DEPLOY_GROUP}" >/dev/null 2>&1 || die "deployment group does not exist: ${DEPLOY_GROUP}"

if ! id "${RUNTIME_USER}" >/dev/null 2>&1; then
  useradd --system --user-group --home-dir /nonexistent --shell /usr/sbin/nologin "${RUNTIME_USER}"
fi
id "${RUNTIME_USER}" >/dev/null 2>&1 || die "runtime user could not be created: ${RUNTIME_USER}"
getent group "${RUNTIME_GROUP}" >/dev/null 2>&1 || die "runtime group does not exist: ${RUNTIME_GROUP}"

RELEASES_DIR="${DEPLOY_ROOT}/releases"
RUNTIME_DIR="${DEPLOY_ROOT}/runtime"
SHARED_DIR="${DEPLOY_ROOT}/shared"
ENV_DIR="${SHARED_DIR}/env"
STATE_DIR="${SHARED_DIR}/state"
HOST_TOOLING_DIR="/usr/local/lib/echo-archives"

install -d -o "${DEPLOY_USER}" -g "${DEPLOY_GROUP}" -m 0750 \
  "${DEPLOY_ROOT}" \
  "${RELEASES_DIR}" \
  "${RUNTIME_DIR}" \
  "${RUNTIME_DIR}/staging" \
  "${RUNTIME_DIR}/production" \
  "${SHARED_DIR}" \
  "${ENV_DIR}" \
  "${STATE_DIR}"
install -d -o "${RUNTIME_USER}" -g "${RUNTIME_GROUP}" -m 0750 \
  /var/lib/echo-archives \
  /var/lib/echo-archives-staging \
  /var/backups/echo-archives

# Releases are deployment-user-owned and immutable by convention. The runtime
# account receives only traversal/read ACLs here; the release helper grants
# writable ACLs to the explicit mutable runtime overlay paths.
setfacl -m "u:${RUNTIME_USER}:r-x" "${DEPLOY_ROOT}" "${RELEASES_DIR}" "${SHARED_DIR}"
setfacl -m "u:${RUNTIME_USER}:r-x" "${RUNTIME_DIR}" "${RUNTIME_DIR}/staging" "${RUNTIME_DIR}/production"
setfacl -m "u:${RUNTIME_USER}:--x" "${ENV_DIR}"

if [[ ! -e "${ENV_DIR}/staging.env" ]]; then
  install -o "${DEPLOY_USER}" -g "${DEPLOY_GROUP}" -m 0600 \
    "${REPO_ROOT}/deploy/env/staging.env.example" "${ENV_DIR}/staging.env"
fi
if [[ ! -e "${ENV_DIR}/production.env" ]]; then
  install -o root -g root -m 0600 \
    "${REPO_ROOT}/deploy/env/production.env.example" "${ENV_DIR}/production.env"
fi

assert_environment_file() {
  local path="$1"
  local expected_owner="$2"
  [[ -f "${path}" && ! -L "${path}" ]] || die "environment file is missing or unsafe: ${path}"
  [[ "$(stat -c '%a' "${path}")" == "600" ]] || die "environment file must be mode 0600: ${path}"
  [[ "$(stat -c '%U:%G' "${path}")" == "${expected_owner}" ]] ||
    die "environment file has unexpected ownership: ${path}"
}

assert_environment_file "${ENV_DIR}/staging.env" "${DEPLOY_USER}:${DEPLOY_GROUP}"
assert_environment_file "${ENV_DIR}/production.env" "root:root"

install -d -m 0755 /etc/echo-archives
install -d -m 0755 /etc/systemd/journald@echo-archives.conf.d
if [[ ! -e /etc/echo-archives/monitoring.env ]]; then
  install -o root -g root -m 0600 \
    "${REPO_ROOT}/deploy/monitoring.env.example" /etc/echo-archives/monitoring.env
fi
if [[ ! -e /etc/echo-archives/pi-restic.env ]]; then
  install -o root -g root -m 0600 \
    "${REPO_ROOT}/deploy/offsite-backup.env.example" /etc/echo-archives/pi-restic.env
fi
assert_environment_file /etc/echo-archives/monitoring.env "root:root"
assert_environment_file /etc/echo-archives/pi-restic.env "root:root"

HOST_UNIT_BACKUP_DIR="/var/backups/echo-archives/host-units/$(date -u +%Y%m%dT%H%M%SZ)-$$"
HOST_UNIT_BACKUP_CREATED=false

backup_host_unit() {
  local source_path="$1"
  [[ -e "${source_path}" || -L "${source_path}" ]] || return 0

  if [[ "${HOST_UNIT_BACKUP_CREATED}" == false ]]; then
    install -d -o root -g root -m 0700 "${HOST_UNIT_BACKUP_DIR}"
    HOST_UNIT_BACKUP_CREATED=true
  fi

  local relative_path="${source_path#/etc/systemd/system/}"
  install -d -o root -g root -m 0700 "${HOST_UNIT_BACKUP_DIR}/$(dirname -- "${relative_path}")"
  cp -a -- "${source_path}" "${HOST_UNIT_BACKUP_DIR}/${relative_path}"
}

for unit_name in \
  echo-archives.service \
  echo-archives-staging.service \
  echo-archives-backup.service \
  echo-archives-backup.timer \
  echo-archives-discovery.service \
  echo-archives-discovery.timer \
  echo-archives-local-monitor.service \
  echo-archives-local-monitor.timer \
  echo-archives-offsite-backup.service \
  echo-archives-offsite-backup.timer; do
  backup_host_unit "/etc/systemd/system/${unit_name}"
done

install_host_tooling() {
  install -d -o root -g "${RUNTIME_GROUP}" -m 0750 "${HOST_TOOLING_DIR}"
  for source_path in \
    "${REPO_ROOT}/deploy/check-echo-archives-production.sh" \
    "${REPO_ROOT}/deploy/echo-archives-offsite-backup.sh"; do
    local source_name="${source_path##*/}"
    [[ -f "${source_path}" && ! -L "${source_path}" ]] ||
      die "host tooling source is missing or unsafe: ${source_path}"
    install -o root -g "${RUNTIME_GROUP}" -m 0750 \
      "${source_path}" "${HOST_TOOLING_DIR}/${source_name}"
  done
}

# The migration-era discovery drop-in added permissions for the frozen
# checkout. Remove only that exact, recognizable stale artifact; an unknown
# drop-in is a hard failure so bootstrap cannot discard host policy silently.
LEGACY_DISCOVERY_DROPIN=/etc/systemd/system/echo-archives-discovery.service.d/10-runtime-account.conf
if [[ -e "${LEGACY_DISCOVERY_DROPIN}" ]]; then
  [[ -f "${LEGACY_DISCOVERY_DROPIN}" && ! -L "${LEGACY_DISCOVERY_DROPIN}" ]] ||
    die "unexpected discovery drop-in is not a regular file: ${LEGACY_DISCOVERY_DROPIN}"
  backup_host_unit "${LEGACY_DISCOVERY_DROPIN}"
  grep -Eq '/home/[^[:space:]]*/The-Echo-Archives|backend/data/(community\.sqlite|import-staging|backups)' \
    "${LEGACY_DISCOVERY_DROPIN}" ||
    die "refusing to remove an unrecognized discovery drop-in: ${LEGACY_DISCOVERY_DROPIN}"
  rm -f -- "${LEGACY_DISCOVERY_DROPIN}"
  rmdir --ignore-fail-on-non-empty "$(dirname -- "${LEGACY_DISCOVERY_DROPIN}")" 2>/dev/null || true
fi

install_host_tooling

install -m 0644 "${REPO_ROOT}/deploy/echo-archives.service" \
  /etc/systemd/system/echo-archives.service
install -m 0644 "${REPO_ROOT}/deploy/echo-archives-staging.service" \
  /etc/systemd/system/echo-archives-staging.service
install -m 0644 "${REPO_ROOT}/deploy/echo-archives-backup.service" \
  /etc/systemd/system/echo-archives-backup.service
install -m 0644 "${REPO_ROOT}/deploy/echo-archives-backup.timer" \
  /etc/systemd/system/echo-archives-backup.timer
install -m 0644 "${REPO_ROOT}/deploy/echo-archives-discovery.service" \
  /etc/systemd/system/echo-archives-discovery.service
install -m 0644 "${REPO_ROOT}/deploy/echo-archives-discovery.timer" \
  /etc/systemd/system/echo-archives-discovery.timer
install -m 0644 "${REPO_ROOT}/deploy/echo-archives-local-monitor.service" \
  /etc/systemd/system/echo-archives-local-monitor.service
install -m 0644 "${REPO_ROOT}/deploy/echo-archives-local-monitor.timer" \
  /etc/systemd/system/echo-archives-local-monitor.timer
install -m 0644 "${REPO_ROOT}/deploy/echo-archives-offsite-backup.service" \
  /etc/systemd/system/echo-archives-offsite-backup.service
install -m 0644 "${REPO_ROOT}/deploy/echo-archives-offsite-backup.timer" \
  /etc/systemd/system/echo-archives-offsite-backup.timer
install -m 0644 "${REPO_ROOT}/deploy/echo-archives-journald.conf" \
  /etc/systemd/journald@echo-archives.conf.d/retention.conf

systemd-analyze verify \
  /etc/systemd/system/echo-archives.service \
  /etc/systemd/system/echo-archives-staging.service \
  /etc/systemd/system/echo-archives-backup.service \
  /etc/systemd/system/echo-archives-backup.timer \
  /etc/systemd/system/echo-archives-discovery.service \
  /etc/systemd/system/echo-archives-discovery.timer \
  /etc/systemd/system/echo-archives-local-monitor.service \
  /etc/systemd/system/echo-archives-local-monitor.timer \
  /etc/systemd/system/echo-archives-offsite-backup.service \
  /etc/systemd/system/echo-archives-offsite-backup.timer
systemctl daemon-reload

# Off-site backup is intentionally not enabled until its external peer,
# credentials, and restore drill are ready. This also clears a stale failure
# from the migration-era service so the local monitor can report current state.
systemctl disable --now echo-archives-offsite-backup.timer
systemctl reset-failed echo-archives-offsite-backup.service 2>/dev/null || true

printf '%s\n' \
  'Host layout, host tooling, and release service templates are installed.' \
  'Application services were not started, restarted, stopped, or enabled.' \
  "Existing unit backups are under ${HOST_UNIT_BACKUP_DIR} when replacements were made." \
  'The off-site backup timer remains disabled until external storage is configured and tested.' \
  "Fill and validate ${ENV_DIR}/staging.env and ${ENV_DIR}/production.env before enabling services." \
  'Caddy is intentionally unchanged; review/install its host configuration separately.' \
  'Next: deploy/echo status, then explicitly enable the reviewed units and start staging.'
