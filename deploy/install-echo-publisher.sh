#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 0077

if [[ "${EUID}" -ne 0 ]]; then
  printf 'Install the Echo Publisher host runner with sudo.\n' >&2
  exit 1
fi

SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "${SCRIPT_ROOT}/.." && pwd -P)"
OPERATOR_USER="${SUDO_USER:-}"
OPERATOR_GROUP="echo-publisher-operators"
RUNNER_SOURCE="${REPO_ROOT}/deploy/echo-publisher-runner.js"
RUNNER_INSTALL="/usr/local/sbin/echo-publisher-runner"
CLIENT_INSTALL="/usr/local/bin/echo-publisher"
SUDOERS_INSTALL="/etc/sudoers.d/echo-publisher"
DEPLOYMENT_LOCK="/srv/echo-archives/shared/state/deployment.lock"
PRODUCTION_LINK="/srv/echo-archives/current"
PRODUCTION_RUNTIME_LINK="/srv/echo-archives/runtime/production/current"

die() {
  printf 'Echo Publisher host setup failed: %s\n' "$*" >&2
  exit 1
}

for command_name in cmp flock getent groupadd id install mktemp mv readlink stat systemctl usermod visudo; do
  command -v "${command_name}" >/dev/null 2>&1 || die "required command is missing: ${command_name}"
done
[[ "${OPERATOR_USER}" =~ ^[A-Za-z0-9._-]{1,64}$ && "${OPERATOR_USER}" != "root" && "${OPERATOR_USER}" != -* ]] ||
  die "run this installer through sudo from the local account that will operate Echo Publisher"
id "${OPERATOR_USER}" >/dev/null 2>&1 || die "the invoking local account does not exist: ${OPERATOR_USER}"
[[ -f "${RUNNER_SOURCE}" && ! -L "${RUNNER_SOURCE}" ]] || die "publisher host runner source is missing or unsafe"
[[ -f "${DEPLOYMENT_LOCK}" && ! -L "${DEPLOYMENT_LOCK}" ]] || die "the release deployment lock is missing; complete the release-workflow setup first"
exec 9<>"${DEPLOYMENT_LOCK}"
flock --shared --nonblock 9 || die "an Echo release operation is running; retry host setup after it finishes"

[[ -L "${PRODUCTION_LINK}" && -L "${PRODUCTION_RUNTIME_LINK}" ]] || die "active production release and runtime pointers are required"
ACTIVE_RELEASE="$(readlink -f -- "${PRODUCTION_LINK}")"
ACTIVE_RUNTIME="$(readlink -f -- "${PRODUCTION_RUNTIME_LINK}")"
RELEASE_ID="$(basename -- "${ACTIVE_RELEASE}")"
[[ "${RELEASE_ID}" =~ ^[0-9a-f]{40}$ && "${ACTIVE_RELEASE}" == "/srv/echo-archives/releases/${RELEASE_ID}" ]] || die "the active production release pointer is unsafe"
[[ "${ACTIVE_RUNTIME}" == "/srv/echo-archives/runtime/production/${RELEASE_ID}" ]] || die "the active production runtime overlay does not match the release"
[[ -f "${ACTIVE_RUNTIME}/release.json" ]] || die "the active production overlay release marker is missing"
/usr/bin/systemctl is-active --quiet echo-archives.service || die "the production service must be active before installing its publisher runner"
cmp -s "${RUNNER_SOURCE}" "${ACTIVE_RELEASE}/deploy/echo-publisher-runner.js" || die "the host runner source must match the active immutable release"
cmp -s "${BASH_SOURCE[0]}" "${ACTIVE_RELEASE}/deploy/install-echo-publisher.sh" || die "the installer must match the active immutable release"

sudoers_temp="$(mktemp /etc/sudoers.d/.echo-publisher.XXXXXX)"
runner_temp=""
client_temp=""
trap '[[ -z "${runner_temp}" ]] || rm -f -- "${runner_temp}"; [[ -z "${client_temp}" ]] || rm -f -- "${client_temp}"; rm -f -- "${sudoers_temp}"' EXIT
cat >"${sudoers_temp}" <<SUDOERS
%${OPERATOR_GROUP} ALL=(root) NOPASSWD: ${RUNNER_INSTALL} ""
SUDOERS
chmod 0440 "${sudoers_temp}"
chown root:root "${sudoers_temp}"
visudo -cf "${sudoers_temp}" >/dev/null || die "the restricted Echo Publisher sudo rule did not validate"
if [[ -e "${SUDOERS_INSTALL}" || -L "${SUDOERS_INSTALL}" ]]; then
  [[ -f "${SUDOERS_INSTALL}" && ! -L "${SUDOERS_INSTALL}" ]] || die "existing publisher sudoers path is unsafe"
  [[ "$(stat -c '%u:%g:%a' "${SUDOERS_INSTALL}")" == "0:0:440" ]] || die "existing publisher sudoers file must be root-owned mode 0440"
  cmp -s "${sudoers_temp}" "${SUDOERS_INSTALL}" || die "existing ${SUDOERS_INSTALL} differs from the reviewed publisher-only rule; inspect it manually"
fi

if ! getent group "${OPERATOR_GROUP}" >/dev/null 2>&1; then
  groupadd --system "${OPERATOR_GROUP}"
fi
OPERATOR_GROUP_RECORD="$(getent group "${OPERATOR_GROUP}")" || die "could not verify the publisher operator group"
OPERATOR_GROUP_MEMBERS="${OPERATOR_GROUP_RECORD##*:}"
IFS=',' read -r -a configured_operators <<< "${OPERATOR_GROUP_MEMBERS}"
for configured_operator in "${configured_operators[@]}"; do
  [[ -z "${configured_operator}" || "${configured_operator}" == "${OPERATOR_USER}" ]] ||
    die "${OPERATOR_GROUP} already contains an unexpected account: ${configured_operator}"
done
usermod --append --groups "${OPERATOR_GROUP}" "${OPERATOR_USER}"

install -d -o root -g root -m 0755 /usr/local/sbin /usr/local/bin
if [[ -e "${RUNNER_INSTALL}" || -L "${RUNNER_INSTALL}" ]]; then
  [[ -f "${RUNNER_INSTALL}" && ! -L "${RUNNER_INSTALL}" ]] || die "existing publisher runner path is unsafe"
  [[ "$(stat -c '%u:%g' "${RUNNER_INSTALL}")" == "0:0" ]] || die "existing publisher runner must be root-owned"
fi
runner_temp="$(mktemp /usr/local/sbin/.echo-publisher-runner.XXXXXX)"
install -o root -g root -m 0755 "${RUNNER_SOURCE}" "${runner_temp}"
mv -Tf -- "${runner_temp}" "${RUNNER_INSTALL}"
runner_temp=""

if [[ -e "${CLIENT_INSTALL}" || -L "${CLIENT_INSTALL}" ]]; then
  [[ -f "${CLIENT_INSTALL}" && ! -L "${CLIENT_INSTALL}" ]] || die "existing publisher client path is unsafe"
  [[ "$(stat -c '%u:%g' "${CLIENT_INSTALL}")" == "0:0" ]] || die "existing publisher client must be root-owned"
fi
client_temp="$(mktemp /usr/local/bin/.echo-publisher.XXXXXX)"
cat >"${client_temp}" <<'CLIENT'
#!/usr/bin/env bash
set -Eeuo pipefail
release_link=/srv/echo-archives/current
[[ -L "${release_link}" ]] || { printf 'Echo production release pointer is missing.\n' >&2; exit 1; }
release_root="$(readlink -f -- "${release_link}")"
[[ "${release_root}" =~ ^/srv/echo-archives/releases/[0-9a-f]{40}$ ]] || {
  printf 'Echo production release pointer is invalid.\n' >&2
  exit 1
}
client="${release_root}/backend/scripts/echo-publisher.js"
[[ -f "${client}" && ! -L "${client}" ]] || {
  printf 'The active production release does not contain the Echo Publisher client. Deploy the Echo Publisher release first.\n' >&2
  exit 1
}
exec /usr/bin/node "${client}" "$@"
CLIENT
chmod 0755 "${client_temp}"
chown root:root "${client_temp}"
mv -Tf -- "${client_temp}" "${CLIENT_INSTALL}"
client_temp=""

if [[ -e "${SUDOERS_INSTALL}" ]]; then
  rm -f -- "${sudoers_temp}"
else
  mv -Tf -- "${sudoers_temp}" "${SUDOERS_INSTALL}"
fi
trap - EXIT

printf '%s\n' \
  "Installed the restricted Echo Publisher runner and client." \
  "Added ${OPERATOR_USER} to ${OPERATOR_GROUP}; start a new login session before use." \
  "No production service was restarted and no catalogue or submission was changed."
