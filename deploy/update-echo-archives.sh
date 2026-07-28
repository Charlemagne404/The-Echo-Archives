#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 0077

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_NAME="${SERVICE_NAME:-echo-archives.service}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3010/api/health}"
HEALTH_ATTEMPTS="${HEALTH_ATTEMPTS:-20}"
HEALTH_INTERVAL_SECONDS="${HEALTH_INTERVAL_SECONDS:-2}"
HEALTH_OUTPUT="$(mktemp)"
CANDIDATE_PARENT=""
CANDIDATE_WORKTREE=""
PREVIOUS_DEPENDENCIES=""
PREVIOUS_REVISION=""
TARGET_REVISION=""
CURRENT_BRANCH=""
DEPLOYMENT_APPLIED=false
ROLLBACK_SUCCEEDED=false

cleanup_tree() {
  local target="$1"
  local required_prefix="$2"
  if [[ -n "${target}" &&
    "${target}" == "${required_prefix}"* &&
    -d "${target}" &&
    ! -L "${target}" ]]; then
    find "${target}" -xdev -depth -delete
  fi
}

cleanup() {
  if [[ -n "${CANDIDATE_WORKTREE}" &&
    -d "${CANDIDATE_WORKTREE}" &&
    ! -L "${CANDIDATE_WORKTREE}" ]]; then
    git -C "${REPO_ROOT}" worktree remove --force "${CANDIDATE_WORKTREE}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${CANDIDATE_PARENT}" ]]; then
    cleanup_tree "${CANDIDATE_PARENT}" "${REPO_ROOT}.deploy."
  fi
  if [[ -f "${HEALTH_OUTPUT}" && ! -L "${HEALTH_OUTPUT}" ]]; then
    unlink "${HEALTH_OUTPUT}"
  fi
}
trap cleanup EXIT

fail() {
  echo "Update aborted: $*" >&2
  exit 1
}

wait_for_health() {
  local attempt
  for ((attempt = 1; attempt <= HEALTH_ATTEMPTS; attempt += 1)); do
    if curl --fail --silent --show-error --max-time 5 \
      --output "${HEALTH_OUTPUT}" "${HEALTH_URL}"; then
      return 0
    fi
    if (( attempt < HEALTH_ATTEMPTS )); then
      sleep "${HEALTH_INTERVAL_SECONDS}"
    fi
  done
  return 1
}

rollback_application() {
  [[ "${DEPLOYMENT_APPLIED}" == true ]] || return 0
  [[ "${ROLLBACK_SUCCEEDED}" == false ]] || return 0

  echo "Health failed; restoring revision ${PREVIOUS_REVISION} and its dependency tree." >&2
  sudo systemctl stop "${SERVICE_NAME}" || return 1

  # The script's entry gate proved this checkout was clean. Only the exact
  # fast-forward performed below can be discarded here.
  git reset --hard "${PREVIOUS_REVISION}" || return 1

  if [[ -d "${REPO_ROOT}/backend/node_modules" ]]; then
    mv "${REPO_ROOT}/backend/node_modules" "${CANDIDATE_PARENT}/node_modules.failed" || return 1
  fi
  if [[ -d "${PREVIOUS_DEPENDENCIES}" ]]; then
    mv "${PREVIOUS_DEPENDENCIES}" "${REPO_ROOT}/backend/node_modules" || return 1
  fi

  sudo systemctl start "${SERVICE_NAME}" || return 1
  wait_for_health || return 1
  ROLLBACK_SUCCEEDED=true
  echo "Rollback health passed. The database was intentionally not rolled back." >&2
  return 0
}

on_error() {
  local status="$?"
  local line="$1"
  trap - ERR
  if [[ "${DEPLOYMENT_APPLIED}" == true && "${ROLLBACK_SUCCEEDED}" == false ]]; then
    rollback_application || {
      echo "AUTOMATIC ROLLBACK FAILED; service intervention is required." >&2
      sudo systemctl --no-pager --full status "${SERVICE_NAME}" || true
      sudo journalctl --namespace=echo-archives \
        --unit "${SERVICE_NAME}" --lines 100 --no-pager || true
    }
  fi
  echo "Update failed at line ${line} with status ${status}." >&2
  exit "${status}"
}
trap 'on_error "${LINENO}"' ERR

if [[ "${EUID}" -eq 0 ]]; then
  fail "run this script as the deployment user, not root; it uses sudo only for systemd"
fi

for command_name in curl find git ln mktemp mv node npm sleep sudo unlink; do
  command -v "${command_name}" >/dev/null 2>&1 ||
    fail "required command is missing: ${command_name}"
done

[[ -x /usr/bin/node ]] || fail "the systemd Node runtime is missing at /usr/bin/node"
/usr/bin/node -e '
  const [major, minor] = process.versions.node.split(".").map(Number);
  process.exit(major > 22 || (major === 22 && minor >= 12) ? 0 : 1);
' || fail "the systemd runtime at /usr/bin/node must be Node.js 22.12 or newer"

[[ "${HEALTH_ATTEMPTS}" =~ ^[1-9][0-9]*$ ]] ||
  fail "HEALTH_ATTEMPTS must be a positive integer"
[[ "${HEALTH_INTERVAL_SECONDS}" =~ ^[1-9][0-9]*$ ]] ||
  fail "HEALTH_INTERVAL_SECONDS must be a positive integer"

cd "${REPO_ROOT}"
if [[ -n "$(git status --porcelain)" ]]; then
  fail "the working tree is not clean; preserve or resolve local changes before updating"
fi

CURRENT_BRANCH="$(git symbolic-ref --quiet --short HEAD)" ||
  fail "the repository is in detached-HEAD state"
upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null)" ||
  fail "${CURRENT_BRANCH} has no upstream branch"
PREVIOUS_REVISION="$(git rev-parse HEAD)"

echo "Fetching ${upstream} without changing the live checkout..."
git fetch --prune
TARGET_REVISION="$(git rev-parse "${upstream}")"
git merge-base --is-ancestor "${PREVIOUS_REVISION}" "${TARGET_REVISION}" ||
  fail "upstream is not a fast-forward from the deployed revision"

CANDIDATE_PARENT="$(mktemp -d "${REPO_ROOT}.deploy.XXXXXX")"
CANDIDATE_WORKTREE="${CANDIDATE_PARENT}/candidate"
git worktree add --detach "${CANDIDATE_WORKTREE}" "${TARGET_REVISION}"
ln -s "${REPO_ROOT}/backend/.env" "${CANDIDATE_WORKTREE}/backend/.env"

echo "Installing locked dependencies in the disposable candidate..."
npm --prefix "${CANDIDATE_WORKTREE}/backend" ci --omit=dev

echo "Validating the exact candidate revision before activation..."
(
  cd "${CANDIDATE_WORKTREE}"
  NODE_ENV=production npm run check:config
  npm run build:catalog
  npm run build:pages
  npm run check:structure
  npm run test:tools
  npm --prefix backend run validate:data
  npm --prefix backend run check:links
  npm --prefix backend test
)

if [[ -n "$(git -C "${CANDIDATE_WORKTREE}" status --porcelain --untracked-files=no)" ]]; then
  git -C "${CANDIDATE_WORKTREE}" status --short
  fail "candidate generation changed committed output"
fi

echo "Creating a verified online SQLite backup immediately before activation..."
npm run backup:database

echo "Activating ${TARGET_REVISION}..."
git merge --ff-only "${TARGET_REVISION}"
PREVIOUS_DEPENDENCIES="${CANDIDATE_PARENT}/node_modules.previous"
[[ -d "${REPO_ROOT}/backend/node_modules" ]] ||
  fail "live backend/node_modules is missing"
mv "${REPO_ROOT}/backend/node_modules" "${PREVIOUS_DEPENDENCIES}"
mv "${CANDIDATE_WORKTREE}/backend/node_modules" "${REPO_ROOT}/backend/node_modules"
DEPLOYMENT_APPLIED=true

sudo systemctl restart "${SERVICE_NAME}"
if ! wait_for_health; then
  sudo systemctl --no-pager --full status "${SERVICE_NAME}" || true
  sudo journalctl --namespace=echo-archives \
    --unit "${SERVICE_NAME}" --lines 100 --no-pager || true
  rollback_application ||
    fail "health failed and automatic rollback did not recover the service"
  fail "candidate health failed; the previous application revision was restored"
fi

if [[ -n "$(git status --porcelain)" ]]; then
  fail "the activated checkout is unexpectedly dirty"
fi

cleanup_tree "${PREVIOUS_DEPENDENCIES}" "${CANDIDATE_PARENT}/node_modules.previous"
PREVIOUS_DEPENDENCIES=""

echo "Health check passed:"
node -e '
  const fs = require("node:fs");
  const health = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  process.stdout.write(JSON.stringify({
    ok: health.ok,
    service: health.service,
    catalogCount: health.catalogCount,
    collectionCount: health.collectionCount,
    features: health.features,
  }));
' "${HEALTH_OUTPUT}"
echo
echo "Deployment completed on ${CURRENT_BRANCH}: ${PREVIOUS_REVISION} -> ${TARGET_REVISION}"
