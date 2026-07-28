#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function fail(message) {
  process.stderr.write(`Access-observability setup failed: ${message}\n`);
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--env") {
  fail("usage: node backend/scripts/configure-access-observability.js --env PATH");
}

const envPath = path.resolve(args[1]);
let stat;
try {
  stat = fs.lstatSync(envPath);
} catch (_error) {
  fail("environment file does not exist");
}
if (!stat.isFile() || stat.isSymbolicLink()) {
  fail("environment path must be a regular file, not a symlink");
}
if ((stat.mode & 0o077) !== 0) {
  fail("environment file must not be accessible by group or other users");
}

const current = fs.readFileSync(envPath, "utf8");
for (const key of ["ACCESS_LOG_ENABLED", "ACCESS_LOG_HMAC_SECRET"]) {
  if (new RegExp(`^${key}=`, "m").test(current)) {
    fail(`${key} is already configured; review it manually`);
  }
}

const secret = crypto.randomBytes(32).toString("base64url");
const separator = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
fs.appendFileSync(
  envPath,
  `${separator}ACCESS_LOG_ENABLED=true\nACCESS_LOG_HMAC_SECRET=${secret}\n`,
  { encoding: "utf8", mode: 0o600 },
);
fs.chmodSync(envPath, 0o600);

process.stdout.write("Access observability enabled with a new private weekly-HMAC master secret.\n");
