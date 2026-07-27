#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 0077
export LC_ALL=C

APP_USER="charlie"
APP_GROUP="charlie"
APP_HOME="/home/charlie"
REPO_ROOT="/home/charlie/The-Echo-Archives"
USER_AUTH_SERVICE="continental-id-auth.service"
ROOT_AUTH_SERVICE="continental-dashboard-auth.service"
USER_AUTH_UNIT="${APP_HOME}/.config/systemd/user/${USER_AUTH_SERVICE}"
AUTH_DROPIN_DIR="${APP_HOME}/.config/systemd/user/${USER_AUTH_SERVICE}.d"
AUTH_DROPIN="${AUTH_DROPIN_DIR}/10-mongodb-readiness.conf"
EXPECTED_AUTH_UNIT_SHA="efce91fbdc09f10373ddb91bc8815d9b04a2b4fa1777058d4fd793c535d01e13"
LOCAL_ECHO_HEALTH="http://127.0.0.1:3010/api/health"
PUBLIC_ECHO_HEALTH="https://echoarchives.net/api/health"
PUBLIC_AUTH_HEALTH="https://mpmc.ddns.net/api/health"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_DIR="/var/log/echo-archives"
LOG_FILE="${LOG_DIR}/local-launch-readiness-${TIMESTAMP}.log"
READABLE_LOG="/tmp/echo-local-launch-readiness-latest.log"
BACKUP_DIR="/var/backups/echo-archives-local-readiness/${TIMESTAMP}"
TEMP_DIR=""
APP_UID=""
DROPIN_EXISTED=0
AUTH_MUTATED=0

log() {
  printf '[%s] %s\n' "$(date --iso-8601=seconds)" "$*"
}

publish_log() {
  if [[ -f "${LOG_FILE}" ]]; then
    install -m 0600 -o "${APP_USER}" -g "${APP_GROUP}" \
      "${LOG_FILE}" "${READABLE_LOG}" || true
  fi
}

user_systemctl() {
  runuser -u "${APP_USER}" -- env \
    HOME="${APP_HOME}" \
    XDG_RUNTIME_DIR="/run/user/${APP_UID}" \
    DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/${APP_UID}/bus" \
    systemctl --user "$@"
}

rollback_auth_dropin() {
  (( AUTH_MUTATED == 1 )) || return 0
  log "Rolling back the auth readiness drop-in."
  if (( DROPIN_EXISTED == 1 )); then
    install -m 0644 -o "${APP_USER}" -g "${APP_GROUP}" \
      "${BACKUP_DIR}/auth-dropin-before.conf" "${AUTH_DROPIN}"
  else
    rm -f -- "${AUTH_DROPIN}"
  fi
  user_systemctl daemon-reload || true
  user_systemctl restart "${USER_AUTH_SERVICE}" || true
  AUTH_MUTATED=0
}

cleanup() {
  if [[ -n "${TEMP_DIR}" && "${TEMP_DIR}" == /tmp/echo-local-readiness.* ]]; then
    rm -rf -- "${TEMP_DIR}"
  fi
}

die() {
  log "ERROR: $*"
  rollback_auth_dropin
  publish_log
  exit 1
}

on_error() {
  local status="$?"
  local line="$1"
  trap - ERR
  log "ERROR: stopped at line ${line} with exit status ${status}."
  rollback_auth_dropin
  publish_log
  cleanup
  exit "${status}"
}

trap 'on_error "${LINENO}"' ERR
trap cleanup EXIT

if [[ "${EUID}" -ne 0 ]]; then
  printf 'Run this script with sudo and the --apply flag.\n' >&2
  exit 1
fi
[[ "${1:-}" == "--apply" && "$#" -eq 1 ]] ||
  die "Usage: sudo ${REPO_ROOT}/deploy/complete-local-launch-readiness.sh --apply"

for command_name in \
  awk bash caddy cat chmod cp curl date flock grep id install ip ip6tables-save \
  iptables-save loginctl mktemp mongosh nft node readlink rm runuser sed \
  sha256sum sleep ss stat systemctl systemd-analyze tee timeout touch tr ufw; do
  command -v "${command_name}" >/dev/null 2>&1 ||
    die "Required command is missing: ${command_name}"
done

[[ "$(readlink -f "${REPO_ROOT}")" == "${REPO_ROOT}" ]] ||
  die "Unexpected repository path."
[[ "$(id -gn "${APP_USER}")" == "${APP_GROUP}" ]] ||
  die "Unexpected application user's primary group."
APP_UID="$(id -u "${APP_USER}")"
[[ "$(loginctl show-user "${APP_USER}" -p Linger --value)" == "yes" ]] ||
  die "User lingering is not enabled for ${APP_USER}."
[[ -f "${USER_AUTH_UNIT}" ]] || die "The user auth unit is missing."
[[ "$(sha256sum "${USER_AUTH_UNIT}" | awk '{print $1}')" == "${EXPECTED_AUTH_UNIT_SHA}" ]] ||
  die "The reviewed user auth unit changed."
[[ "$(systemctl show "${ROOT_AUTH_SERVICE}" -p FragmentPath --value)" == \
  "/etc/systemd/system/${ROOT_AUTH_SERVICE}" ]] ||
  die "The obsolete root auth unit is not at the reviewed path."

install -d -m 0750 -o root -g adm "${LOG_DIR}"
install -d -m 0700 -o root -g root "${BACKUP_DIR}"
touch "${LOG_FILE}"
chmod 0600 "${LOG_FILE}"
exec > >(tee -a "${LOG_FILE}") 2>&1
exec 9>"/run/lock/echo-archives-local-readiness.lock"
flock -n 9 || die "Another local-readiness run is active."
TEMP_DIR="$(mktemp -d /tmp/echo-local-readiness.XXXXXX)"

validate_echo_health() {
  local url="$1"
  local output="$2"
  curl --fail --silent --show-error --max-time 15 --output "${output}" "${url}"
  node -e '
    const fs = require("node:fs");
    const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    if (value.ok !== true || value.service !== "echo-archives" ||
        !(value.catalogCount > 0) || !(value.collectionCount > 0)) process.exit(1);
  ' "${output}" || die "Echo health semantics failed for ${url}."
}

auth_health_is_ok() {
  local output="$1"
  curl --fail --silent --show-error --max-time 15 \
    --output "${output}" "${PUBLIC_AUTH_HEALTH}" &&
  node -e '
    const fs = require("node:fs");
    const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    if (value.service !== "continental-id-auth" || value.status !== "ok") process.exit(1);
  ' "${output}"
}

validate_auth_health() {
  auth_health_is_ok "$1" ||
    die "Continental ID auth health semantics failed."
}

assert_user_auth_healthy() {
  user_systemctl is-enabled --quiet "${USER_AUTH_SERVICE}" ||
    die "${USER_AUTH_SERVICE} is not enabled."
  user_systemctl is-active --quiet "${USER_AUTH_SERVICE}" ||
    die "${USER_AUTH_SERVICE} is not active."
  ss -H -lntp | awk '
    $4 == "127.0.0.1:5000" && /node/ { found = 1 }
    END { exit(found ? 0 : 1) }
  ' || die "The user auth service is not the Node listener on 127.0.0.1:5000."
  validate_auth_health "${TEMP_DIR}/auth-health.json"
}

assert_root_auth_disabled() {
  if systemctl is-enabled --quiet "${ROOT_AUTH_SERVICE}"; then
    die "${ROOT_AUTH_SERVICE} is enabled."
  fi
  if systemctl is-active --quiet "${ROOT_AUTH_SERVICE}"; then
    die "${ROOT_AUTH_SERVICE} is active."
  fi
}

iptables_rule_count() {
  local file="$1"
  local protocol="$2"
  local port="$3"
  local chain="$4"
  awk -v protocol="${protocol}" -v port="${port}" -v chain="${chain}" '
    $1 == "-A" && $2 == chain {
      found_protocol = found_port = found_accept = 0
      for (i = 3; i <= NF; i += 1) {
        if ($i == "-p" && $(i + 1) == protocol) found_protocol = 1
        if ($i == "--dport" && $(i + 1) == port) found_port = 1
        if ($i == "-j" && $(i + 1) == "ACCEPT") found_accept = 1
      }
      if (found_protocol && found_port && found_accept) count += 1
    }
    END { print count + 0 }
  ' "${file}"
}

assert_nft_backed_rules() {
  local prefix="$1"
  local family actual protocol port rule save_file chain
  grep -q 'nf_tables' < <(iptables-save --version) ||
    die "iptables is not using the nftables backend."

  for family in ipv4 ipv6; do
    if [[ "${family}" == "ipv4" ]]; then
      save_file="${BACKUP_DIR}/${prefix}-iptables-save.txt"
      chain="ufw-user-input"
    else
      save_file="${BACKUP_DIR}/${prefix}-ip6tables-save.txt"
      chain="ufw6-user-input"
    fi
    for rule in "tcp 22" "tcp 80" "tcp 443" "udp 443" "tcp 8080"; do
      IFS=' ' read -r protocol port <<<"${rule}"
      actual="$(iptables_rule_count "${save_file}" "${protocol}" "${port}" "${chain}")"
      [[ "${actual}" == "1" ]] ||
        die "${family} nft-backed UFW rule count is ${actual} for ${protocol}/${port}; expected 1."
    done
    for rule in "udp 80" "udp 8080" "tcp 8804" "tcp 25565" "tcp 25566"; do
      IFS=' ' read -r protocol port <<<"${rule}"
      actual="$(iptables_rule_count "${save_file}" "${protocol}" "${port}" "${chain}")"
      [[ "${actual}" == "0" ]] ||
        die "Obsolete ${family} rule remains for ${protocol}/${port}."
    done
  done
}

assert_ufw_public_rules() {
  local status_file="$1"
  local public_interface target expected actual
  declare -A counts=()
  public_interface="$(ip -4 route show default | awk 'NR == 1 {
    for (i = 1; i <= NF; i += 1) if ($i == "dev") print $(i + 1)
  }')"
  [[ -n "${public_interface}" ]] || die "Could not identify the public interface."
  grep -qi '^Status: active' "${status_file}" || die "UFW is not active."
  grep -qi 'Default: deny (incoming)' "${status_file}" ||
    die "UFW incoming default is not deny."

  while IFS= read -r target; do
    counts["${target}"]=$(( ${counts["${target}"]:-0} + 1 ))
  done < <(
    awk -v interface="${public_interface}" '
      /ALLOW IN/ {
        split($0, parts, "ALLOW IN")
        target = parts[1]
        source = parts[2]
        gsub(/^[ \t]+|[ \t]+$/, "", target)
        gsub(/^[ \t]+|[ \t]+$/, "", source)
        sub(/[ \t]+#.*/, "", source)
        if (source != "Anywhere" && source != "Anywhere (v6)") next
        if (target ~ / on /) {
          suffix = " on " interface
          if (substr(target, length(target) - length(suffix) + 1) != suffix) next
          target = substr(target, 1, length(target) - length(suffix))
        }
        sub(/ \(v6\)$/, "", target)
        print target
      }
    ' "${status_file}"
  )

  expected=1
  grep -qE '^IPV6=yes([[:space:]]|$)' /etc/default/ufw && expected=2
  for target in "${!counts[@]}"; do
    case "${target}" in
      22/tcp|80/tcp|443|8080/tcp) ;;
      *) die "Unexpected public UFW allow remains: ${target}" ;;
    esac
  done
  for target in 22/tcp 80/tcp 443 8080/tcp; do
    actual="${counts["${target}"]:-0}"
    [[ "${actual}" == "${expected}" ]] ||
      die "Public UFW rule count is ${actual} for ${target}; expected ${expected}."
  done
  for target in 80 8080 25565/tcp 25566/tcp 8804/tcp; do
    [[ "${counts["${target}"]:-0}" == "0" ]] ||
      die "Obsolete public UFW target remains: ${target}"
  done
}

capture_and_validate_firewall() {
  local prefix="$1"
  ufw status verbose > "${BACKUP_DIR}/${prefix}-ufw-status.txt"
  ufw status numbered > "${BACKUP_DIR}/${prefix}-ufw-numbered.txt"
  nft list ruleset > "${BACKUP_DIR}/${prefix}-nft-ruleset.txt"
  nft --stateless list ruleset > "${BACKUP_DIR}/${prefix}-nft-ruleset-stateless.txt"
  nft -j list ruleset > "${BACKUP_DIR}/${prefix}-nft-ruleset.json"
  iptables-save > "${BACKUP_DIR}/${prefix}-iptables-save.txt"
  ip6tables-save > "${BACKUP_DIR}/${prefix}-ip6tables-save.txt"
  node -e '
    const fs = require("node:fs");
    const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    if (!Array.isArray(value.nftables) || value.nftables.length < 1) process.exit(1);
  ' "${BACKUP_DIR}/${prefix}-nft-ruleset.json" ||
    die "The nftables JSON ruleset is invalid."
  grep -q 'chain ufw-user-input' "${BACKUP_DIR}/${prefix}-nft-ruleset.txt" ||
    die "The nftables ruleset does not contain the UFW user-input chain."
  assert_ufw_public_rules "${BACKUP_DIR}/${prefix}-ufw-status.txt"
  assert_nft_backed_rules "${prefix}"
  sha256sum "${BACKUP_DIR}/${prefix}-"* > "${BACKUP_DIR}/firewall-${prefix}.sha256"
  log "Captured and validated exact ${prefix} UFW and nftables state."
}

assert_listener() {
  local port="$1"
  ss -H -lntup | awk -v suffix=":${port}" '
    index($5, suffix) && substr($5, length($5) - length(suffix) + 1) == suffix {
      found = 1
    }
    END { exit(found ? 0 : 1) }
  ' || die "Required listener is missing on port ${port}."
}

assert_no_listener() {
  local port="$1"
  if ss -H -lntup | awk -v suffix=":${port}" '
    index($5, suffix) && substr($5, length($5) - length(suffix) + 1) == suffix {
      found = 1
    }
    END { exit(found ? 0 : 1) }
  '; then
    die "Unexpected listener remains on port ${port}."
  fi
}

log "Beginning guarded local launch-readiness completion."
log "Repository: ${REPO_ROOT}"
log "Privileged evidence: ${BACKUP_DIR}"
assert_user_auth_healthy
assert_root_auth_disabled
systemctl is-active --quiet mongod.service || die "MongoDB is not active."
systemctl is-enabled --quiet mongod.service || die "MongoDB is not enabled."
mongosh --quiet --host 127.0.0.1 --port 27017 \
  --eval 'quit(db.adminCommand({ping: 1}).ok ? 0 : 1)' >/dev/null ||
  die "MongoDB did not pass a ping."
capture_and_validate_firewall before

if [[ -f "${AUTH_DROPIN}" ]]; then
  cp -a -- "${AUTH_DROPIN}" "${BACKUP_DIR}/auth-dropin-before.conf"
  DROPIN_EXISTED=1
fi
install -d -m 0755 -o "${APP_USER}" -g "${APP_GROUP}" "${AUTH_DROPIN_DIR}"
cat > "${TEMP_DIR}/10-mongodb-readiness.conf" <<'EOF'
[Unit]
After=network-online.target
Wants=network-online.target

[Service]
ExecStartPre=/usr/bin/timeout 90 /usr/bin/bash -c 'until /usr/bin/mongosh --quiet --host 127.0.0.1 --port 27017 --eval "quit(db.adminCommand({ping: 1}).ok ? 0 : 1)" >/dev/null 2>&1; do /usr/bin/sleep 1; done'
EOF
install -m 0644 -o "${APP_USER}" -g "${APP_GROUP}" \
  "${TEMP_DIR}/10-mongodb-readiness.conf" "${AUTH_DROPIN}"
AUTH_MUTATED=1

runuser -u "${APP_USER}" -- env HOME="${APP_HOME}" \
  XDG_RUNTIME_DIR="/run/user/${APP_UID}" \
  DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/${APP_UID}/bus" \
  systemd-analyze --user verify "${USER_AUTH_SERVICE}"
user_systemctl daemon-reload
user_systemctl restart "${USER_AUTH_SERVICE}"

auth_ready=0
for attempt in {1..30}; do
  if user_systemctl is-active --quiet "${USER_AUTH_SERVICE}" &&
    auth_health_is_ok "${TEMP_DIR}/auth-health-after.json"; then
    auth_ready=1
    break
  fi
  sleep 1
done
(( auth_ready == 1 )) || die "The user auth service did not recover after restart."
user_systemctl show "${USER_AUTH_SERVICE}" -p ExecStartPre --value |
  grep -q '/usr/bin/mongosh' ||
  die "The MongoDB readiness gate is not loaded."

systemctl disable --now "${ROOT_AUTH_SERVICE}"
assert_root_auth_disabled
assert_user_auth_healthy

caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
for unit in \
  caddy.service echo-archives.service mongod.service ssh.service tailscaled.service \
  rustdesk.service NetworkManager.service netdata.service echo-archives-backup.timer \
  echo-archives-discovery.timer echo-archives-local-monitor.timer; do
  systemctl is-enabled --quiet "${unit}" || die "${unit} is not enabled."
  systemctl is-active --quiet "${unit}" || die "${unit} is not active."
done
[[ -z "$(systemctl --failed --no-legend --plain)" ]] ||
  die "A system service is failed."
[[ -z "$(user_systemctl --failed --no-legend --plain)" ]] ||
  die "A user service is failed."

for port in 22 80 443 3010 5000; do
  assert_listener "${port}"
done
for port in 8080 8804 25565 25566; do
  assert_no_listener "${port}"
done
ss -H -lntp | awk '
  ($4 ~ /:3010$/ || $4 ~ /:5000$/) && $4 !~ /^127\.0\.0\.1:/ { bad = 1 }
  END { exit(bad ? 1 : 0) }
' || die "Echo or auth is listening beyond loopback."

validate_echo_health "${LOCAL_ECHO_HEALTH}" "${TEMP_DIR}/echo-local.json"
validate_echo_health "${PUBLIC_ECHO_HEALTH}" "${TEMP_DIR}/echo-public.json"
curl --resolve echoarchives.net:443:127.0.0.1 \
  --fail --silent --show-error --max-time 15 \
  --output "${TEMP_DIR}/echo-origin.json" \
  "https://echoarchives.net/api/health"
node -e '
  const fs = require("node:fs");
  const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (value.ok !== true || value.service !== "echo-archives") process.exit(1);
' "${TEMP_DIR}/echo-origin.json" || die "Origin-direct Echo health failed."
curl --resolve www.echoarchives.net:443:127.0.0.1 \
  --silent --show-error --max-time 15 \
  --dump-header "${TEMP_DIR}/www-origin.headers" --output /dev/null \
  "https://www.echoarchives.net/readiness?source=origin"
grep -qiE '^HTTP/[0-9.]+ (301|308)' "${TEMP_DIR}/www-origin.headers" ||
  die "Origin-direct www redirect is not permanent."
grep -qiE '^location: https://echoarchives\.net/readiness\?source=origin' \
  "${TEMP_DIR}/www-origin.headers" ||
  die "Origin-direct www redirect did not preserve path and query."

systemctl start echo-archives-local-monitor.service
[[ "$(systemctl show echo-archives-local-monitor.service -p Result --value)" == "success" ]] ||
  die "The local production monitor failed."
capture_and_validate_firewall after

AUTH_MUTATED=0
log "PASS: all local launch-readiness checks succeeded."
log "No reboot was performed."
log "Installed auth readiness drop-in: ${AUTH_DROPIN}"
log "Privileged firewall evidence: ${BACKUP_DIR}"
log "User-readable log: ${READABLE_LOG}"
publish_log
