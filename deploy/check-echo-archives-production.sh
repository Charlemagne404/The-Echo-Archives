#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 0077

REPO_ROOT="/home/charlie/The-Echo-Archives"
LOCAL_HEALTH_URL="http://127.0.0.1:3010/api/health"
PUBLIC_ORIGIN="https://echoarchives.net"
WWW_ORIGIN="https://www.echoarchives.net"
LEGACY_ORIGIN="https://echo.continental-hub.com"
OFFSITE_SUCCESS_MARKER="${OFFSITE_SUCCESS_MARKER:-/var/lib/echo-archives-monitoring/offsite-backup-success}"
REQUIRE_OFFSITE_BACKUP="${REQUIRE_OFFSITE_BACKUP:-false}"
MAX_BACKUP_AGE_HOURS="${MAX_BACKUP_AGE_HOURS:-30}"
MIN_FREE_GIB="${MIN_FREE_GIB:-10}"
MAX_DISK_PERCENT="${MAX_DISK_PERCENT:-80}"
TLS_MINIMUM_SECONDS="${TLS_MINIMUM_SECONDS:-1814400}"
EXPECTED_COMMUNITY_RATING_WRITES="${EXPECTED_COMMUNITY_RATING_WRITES:-true}"
EXPECTED_MAINTAINER_REVIEW="${EXPECTED_MAINTAINER_REVIEW:-true}"
EXPECTED_ACCESS_LOGS="${EXPECTED_ACCESS_LOGS:-true}"

TEMP_DIR=""

log() {
  printf '[%s] %s\n' "$(date --iso-8601=seconds)" "$*"
}

cleanup() {
  if [[ -n "${TEMP_DIR}" && "${TEMP_DIR}" == /tmp/echo-production-check.* ]]; then
    rm -rf -- "${TEMP_DIR}"
  fi
}

fail() {
  log "FAIL: $*"
  exit 1
}

trap cleanup EXIT

for command_name in curl date df grep mktemp node npm openssl rm stat systemctl tail tr; do
  command -v "${command_name}" >/dev/null 2>&1 || fail "Required command is missing: ${command_name}"
done

[[ -d "${REPO_ROOT}" ]] || fail "Repository is missing: ${REPO_ROOT}"
TEMP_DIR="$(mktemp -d /tmp/echo-production-check.XXXXXX)"

for unit in \
  echo-archives.service \
  caddy.service \
  echo-archives-backup.timer \
  echo-archives-discovery.timer; do
  systemctl is-enabled --quiet "${unit}" || fail "${unit} is not enabled."
  systemctl is-active --quiet "${unit}" || fail "${unit} is not active."
done

failed_units="$(systemctl --failed --no-legend --plain)"
[[ -z "${failed_units}" ]] || fail "One or more systemd units are failed."

validate_health_json() {
  local file="$1"
  node -e '
    const fs = require("node:fs");
    const health = JSON.parse(fs.readFileSync(process.argv[1]));
    const parseExpected = (value, label) => {
      if (value !== "true" && value !== "false") {
        throw new Error(`${label} must be true or false`);
      }
      return value === "true";
    };
    if (health.ok !== true || !(health.catalogCount > 0) || !(health.collectionCount > 0)) {
      process.exit(1);
    }
    if (health.features?.communityRatingWrites !== parseExpected(process.argv[2], "EXPECTED_COMMUNITY_RATING_WRITES")) {
      process.exit(1);
    }
    if (health.features?.maintainerReview !== parseExpected(process.argv[3], "EXPECTED_MAINTAINER_REVIEW")) {
      process.exit(1);
    }
    if (health.features?.accessLogs !== parseExpected(process.argv[4], "EXPECTED_ACCESS_LOGS")) {
      process.exit(1);
    }
  ' "${file}" "${EXPECTED_COMMUNITY_RATING_WRITES}" "${EXPECTED_MAINTAINER_REVIEW}" "${EXPECTED_ACCESS_LOGS}"
}

curl --fail --silent --show-error --max-time 10 \
  --output "${TEMP_DIR}/local-health.json" "${LOCAL_HEALTH_URL}" ||
  fail "Local health request failed."
validate_health_json "${TEMP_DIR}/local-health.json" || fail "Local health response semantics failed."

curl --fail --silent --show-error --max-time 15 \
  --output "${TEMP_DIR}/public-health.json" "${PUBLIC_ORIGIN}/api/health" ||
  fail "Public health request failed."
validate_health_json "${TEMP_DIR}/public-health.json" || fail "Public health response semantics failed."

curl --fail --silent --show-error --max-time 15 \
  --output "${TEMP_DIR}/apex.html" "${PUBLIC_ORIGIN}/" ||
  fail "Public apex request failed."
grep -q 'The Echo Archives' "${TEMP_DIR}/apex.html" ||
  fail "Public apex identity did not match."

curl --silent --show-error --max-time 15 \
  --dump-header "${TEMP_DIR}/www.headers" --output /dev/null \
  "${WWW_ORIGIN}/monitoring-probe?source=local" ||
  fail "Public www redirect request failed."
grep -qiE '^HTTP/[0-9.]+ (301|308)' "${TEMP_DIR}/www.headers" ||
  fail "Public www did not return a permanent redirect."
grep -qiE '^location: https://echoarchives\.net/monitoring-probe\?source=local' \
  "${TEMP_DIR}/www.headers" ||
  fail "Public www redirect did not preserve path and query."

curl --silent --show-error --max-time 15 \
  --dump-header "${TEMP_DIR}/legacy.headers" --output /dev/null \
  "${LEGACY_ORIGIN}/monitoring-probe?source=local" ||
  fail "Public legacy redirect request failed."
grep -qiE '^HTTP/[0-9.]+ (301|308)' "${TEMP_DIR}/legacy.headers" ||
  fail "Public legacy host did not return a permanent redirect."
grep -qiE '^location: https://echoarchives\.net/monitoring-probe\?source=local' \
  "${TEMP_DIR}/legacy.headers" ||
  fail "Public legacy redirect did not preserve path and query."

for host in echoarchives.net www.echoarchives.net echo.continental-hub.com; do
  openssl s_client -connect "${host}:443" -servername "${host}" \
    </dev/null > "${TEMP_DIR}/${host}.public.pem" 2>/dev/null ||
    fail "Could not retrieve the public TLS certificate for ${host}."
  openssl x509 -in "${TEMP_DIR}/${host}.public.pem" \
    -checkend "${TLS_MINIMUM_SECONDS}" -noout ||
    fail "Public TLS certificate for ${host} expires within 21 days."

  openssl s_client -connect 127.0.0.1:443 -servername "${host}" \
    </dev/null > "${TEMP_DIR}/${host}.origin.pem" 2>/dev/null ||
    fail "Could not retrieve Caddy's origin TLS certificate for ${host}."
  openssl x509 -in "${TEMP_DIR}/${host}.origin.pem" \
    -checkend "${TLS_MINIMUM_SECONDS}" -noout ||
    fail "Caddy's origin TLS certificate for ${host} expires within 21 days."
done

npm --prefix "${REPO_ROOT}" run check:backup -- \
  --max-age-hours "${MAX_BACKUP_AGE_HOURS}"

disk_percent="$(df --output=pcent "${REPO_ROOT}" | tail -n 1 | tr -cd '0-9')"
available_bytes="$(df --output=avail -B1 "${REPO_ROOT}" | tail -n 1 | tr -d ' ')"
minimum_bytes=$((MIN_FREE_GIB * 1024 * 1024 * 1024))
(( disk_percent <= MAX_DISK_PERCENT )) ||
  fail "Production filesystem usage is ${disk_percent}%."
(( available_bytes >= minimum_bytes )) ||
  fail "Production filesystem has less than ${MIN_FREE_GIB} GiB free."

if [[ "${REQUIRE_OFFSITE_BACKUP}" == "true" ]]; then
  [[ -f "${OFFSITE_SUCCESS_MARKER}" ]] || fail "Off-site backup success marker is missing."
  marker_age_hours=$(( ($(date +%s) - $(stat -c %Y "${OFFSITE_SUCCESS_MARKER}")) / 3600 ))
  (( marker_age_hours <= MAX_BACKUP_AGE_HOURS )) ||
    fail "Off-site backup success marker is ${marker_age_hours}h old."
else
  log "WARN: off-site backup freshness is not required until external storage is configured."
fi

if [[ -e /run/reboot-required ]]; then
  log "WARN: the host reports that a reboot is required."
fi

log "PASS: Echo Archives local production checks succeeded."
