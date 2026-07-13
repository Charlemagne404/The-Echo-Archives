#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_NAME="${SERVICE_NAME:-echo-archives.service}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3010/api/health}"
HEALTH_ATTEMPTS="${HEALTH_ATTEMPTS:-20}"
HEALTH_INTERVAL_SECONDS="${HEALTH_INTERVAL_SECONDS:-2}"
HEALTH_OUTPUT="$(mktemp)"

cleanup() {
  rm -f "${HEALTH_OUTPUT}"
}
trap cleanup EXIT

fail() {
  echo "Update aborted: $*" >&2
  exit 1
}

if [[ "${EUID}" -eq 0 ]]; then
  fail "run this script as the application user, not root; it will use sudo only for systemd."
fi

for command in git npm node curl sudo; do
  command -v "${command}" >/dev/null 2>&1 || fail "required command is missing: ${command}"
done

[[ -x /usr/bin/node ]] || fail "the systemd Node runtime is missing at /usr/bin/node."
/usr/bin/node -e '
  const [major, minor] = process.versions.node.split(".").map(Number);
  process.exit(major > 20 || (major === 20 && minor >= 12) ? 0 : 1);
' || fail "the systemd runtime at /usr/bin/node must be Node.js 20.12 or newer."

[[ "${HEALTH_ATTEMPTS}" =~ ^[1-9][0-9]*$ ]] || fail "HEALTH_ATTEMPTS must be a positive integer."
[[ "${HEALTH_INTERVAL_SECONDS}" =~ ^[1-9][0-9]*$ ]] || fail "HEALTH_INTERVAL_SECONDS must be a positive integer."

cd "${REPO_ROOT}"

if [[ -n "$(git status --porcelain)" ]]; then
  fail "the working tree is not clean; preserve or resolve local changes before updating."
fi

current_branch="$(git symbolic-ref --quiet --short HEAD)" || fail "the repository is in detached-HEAD state."
upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null)" || fail "${current_branch} has no upstream branch."

echo "Fetching ${upstream}..."
git fetch --prune
git pull --ff-only

echo "Installing locked production dependencies..."
npm --prefix backend ci --omit=dev

echo "Checking production configuration..."
NODE_ENV=production npm run check:config

echo "Validating committed generated output and backend behavior..."
npm run build:catalog
npm run build:pages
npm run check:structure
npm run test:tools
npm --prefix backend run validate:data
npm --prefix backend run check:links
npm --prefix backend test

if [[ -n "$(git status --porcelain)" ]]; then
  git status --short
  fail "generation or validation changed tracked output; commit the generated artifacts from a development checkout before deployment."
fi

echo "Creating an online SQLite backup..."
npm run backup:database

echo "Restarting ${SERVICE_NAME}..."
sudo systemctl restart "${SERVICE_NAME}"

for ((attempt = 1; attempt <= HEALTH_ATTEMPTS; attempt += 1)); do
  if curl --fail --silent --show-error --max-time 5 "${HEALTH_URL}" > "${HEALTH_OUTPUT}"; then
    echo "Health check passed on attempt ${attempt}:"
    cat "${HEALTH_OUTPUT}"
    echo
    echo "Deployment update completed on ${current_branch}."
    exit 0
  fi

  if (( attempt < HEALTH_ATTEMPTS )); then
    sleep "${HEALTH_INTERVAL_SECONDS}"
  fi
done

echo "Health check failed after ${HEALTH_ATTEMPTS} attempts." >&2
sudo systemctl --no-pager --full status "${SERVICE_NAME}" || true
sudo journalctl --unit "${SERVICE_NAME}" --lines 80 --no-pager || true
exit 1
