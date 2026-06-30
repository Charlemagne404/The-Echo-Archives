#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${REPO_ROOT}/backend"
SERVICE_NAME="${SERVICE_NAME:-echo-archives.service}"
WEB_SERVICE_NAME="${WEB_SERVICE_NAME:-caddy}"

log() {
  printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

fail() {
  printf '\nError: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

require_command git
require_command npm

[[ -d "${APP_DIR}" ]] || fail "Missing app directory: ${APP_DIR}"

if [[ ! -d "${REPO_ROOT}/.git" ]]; then
  fail "This script must live at the root of the git repository."
fi

if [[ -n "$(git -C "${REPO_ROOT}" status --short)" ]]; then
  fail "Working tree is not clean. Commit or stash changes before updating."
fi

CURRENT_BRANCH="$(git -C "${REPO_ROOT}" rev-parse --abbrev-ref HEAD)"

log "Fetching latest changes from origin"
git -C "${REPO_ROOT}" fetch --prune origin

log "Updating ${CURRENT_BRANCH} with a fast-forward pull"
git -C "${REPO_ROOT}" pull --ff-only origin "${CURRENT_BRANCH}"

log "Installing production dependencies"
npm --prefix "${APP_DIR}" install

if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files | grep -Fq "${SERVICE_NAME}"; then
  log "Restarting ${SERVICE_NAME}"
  sudo systemctl restart "${SERVICE_NAME}"

  if systemctl list-unit-files | grep -Fq "${WEB_SERVICE_NAME}.service"; then
    log "Reloading ${WEB_SERVICE_NAME}"
    sudo systemctl reload "${WEB_SERVICE_NAME}" || sudo systemctl restart "${WEB_SERVICE_NAME}"
  fi

  log "Service status"
  systemctl --no-pager --full status "${SERVICE_NAME}" | sed -n '1,20p'
else
  log "Systemd service ${SERVICE_NAME} not found. Code is updated, but no service was restarted."
fi

if command -v curl >/dev/null 2>&1; then
  log "Health check"
  curl -fsS http://127.0.0.1:3010/api/health
  printf '\n'
fi

log "Update complete"
