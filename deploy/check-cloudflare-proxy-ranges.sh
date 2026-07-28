#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIRM_NETWORK=false
TEMP_DIR=""

cleanup() {
  if [[ -n "${TEMP_DIR}" && "${TEMP_DIR}" == /tmp/echo-cloudflare-ranges.* && -d "${TEMP_DIR}" ]]; then
    find "${TEMP_DIR}" -xdev -depth -delete
  fi
}
trap cleanup EXIT

fail() {
  echo "Cloudflare range check failed: $*" >&2
  exit 1
}

if [[ "${1:-}" == "--confirm-network" ]]; then
  CONFIRM_NETWORK=true
  shift
fi
[[ "$#" -eq 0 ]] || fail "usage: $0 --confirm-network"
[[ "${CONFIRM_NETWORK}" == true ]] ||
  fail "network access is opt-in; rerun with --confirm-network"

for command_name in curl find mktemp node; do
  command -v "${command_name}" >/dev/null 2>&1 ||
    fail "required command is missing: ${command_name}"
done

TEMP_DIR="$(mktemp -d /tmp/echo-cloudflare-ranges.XXXXXX)"
curl --fail --silent --show-error --location \
  --max-time 20 --retry 2 --retry-all-errors \
  --output "${TEMP_DIR}/ips-v4" \
  https://www.cloudflare.com/ips-v4
curl --fail --silent --show-error --location \
  --max-time 20 --retry 2 --retry-all-errors \
  --output "${TEMP_DIR}/ips-v6" \
  https://www.cloudflare.com/ips-v6

node - "${REPO_ROOT}" "${TEMP_DIR}/ips-v4" "${TEMP_DIR}/ips-v6" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const [root, ipv4Path, ipv6Path] = process.argv.slice(2);
const expected = [...fs.readFileSync(ipv4Path, "utf8").trim().split(/\s+/),
  ...fs.readFileSync(ipv6Path, "utf8").trim().split(/\s+/)];
const expectedSet = new Set(expected);

if (expectedSet.size !== expected.length || expected.length < 20) {
  throw new Error("Cloudflare returned an unexpected or duplicate range list.");
}

const configPaths = [
  "deploy/Caddyfile.global.echo",
  "deploy/Caddyfile.echo",
];
const cidrPattern = /\b(?:[0-9a-f:.]+\/\d{1,3})\b/gi;

for (const relativePath of configPaths) {
  const contents = fs.readFileSync(path.join(root, relativePath), "utf8");
  const found = new Set(contents.match(cidrPattern) || []);
  const missing = expected.filter((range) => !found.has(range));
  const unexpected = [...found].filter((range) => !expectedSet.has(range));
  if (missing.length || unexpected.length) {
    throw new Error(
      `${relativePath} is stale (missing: ${missing.join(", ") || "none"}; ` +
      `unexpected: ${unexpected.join(", ") || "none"}).`,
    );
  }
}

process.stdout.write(`Cloudflare proxy ranges match (${expected.length} ranges).\n`);
NODE
