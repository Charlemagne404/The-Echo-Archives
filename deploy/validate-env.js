const fs = require("node:fs");
const path = require("node:path");
const { parseEnv } = require("node:util");

const environment = String(process.argv[2] || process.env.DEPLOYMENT_ENV || "").trim();
const errors = [];
const envFile = process.env.ECHO_ENV_FILE;
let envFileValues = {};
let envFileKeys = new Set();

if (envFile) {
  try {
    envFileValues = parseEnv(fs.readFileSync(envFile, "utf8"));
    envFileKeys = new Set(Object.keys(envFileValues));
  } catch (_error) {
    // The stat check below reports the actionable path/permission error.
  }
}

function value(name) {
  const rawValue = Object.hasOwn(envFileValues, name) ? envFileValues[name] : process.env[name];
  return String(rawValue || "").trim();
}

function required(name) {
  if (!value(name)) errors.push(`${name} is required.`);
}

function booleanValue(name, expected) {
  if (value(name).toLowerCase() !== expected) {
    errors.push(`${name} must be ${expected}.`);
  }
}

function booleanSyntax(name) {
  if (value(name) && !/^(?:true|false)$/i.test(value(name))) {
    errors.push(`${name} must be true or false.`);
  }
}

function isPlaceholderSecret(secret) {
  return /^(?:replace|change-?me|password|secret|example|archive-test)/i.test(secret);
}

if (!["staging", "production"].includes(environment)) {
  errors.push("Pass staging or production as the environment name.");
}

if (value("DEPLOYMENT_ENV") !== environment) {
  errors.push(`DEPLOYMENT_ENV must equal ${environment}.`);
}

if (value("SQLITE_SYNCHRONOUS").toUpperCase() !== "FULL") {
  errors.push("SQLITE_SYNCHRONOUS must be explicitly set to FULL for a server deployment.");
}

if (envFile) {
  for (const name of ["DEPLOYMENT_ENV", "SITE_URL", "DB_PATH", "SQLITE_SYNCHRONOUS"]) {
    if (!envFileKeys.has(name)) errors.push(`${name} must be present in ${envFile}.`);
  }
}

required("SITE_URL");
required("DB_PATH");
if (value("DB_PATH") && !path.isAbsolute(value("DB_PATH"))) {
  errors.push("DB_PATH must be absolute for a server deployment.");
}

if (environment === "staging") {
  if (value("SITE_URL") !== "https://staging.echoarchives.net") {
    errors.push("Staging SITE_URL must be https://staging.echoarchives.net.");
  }
  if (path.resolve(value("DB_PATH")) !== "/var/lib/echo-archives-staging/community.sqlite") {
    errors.push("Staging DB_PATH must be /var/lib/echo-archives-staging/community.sqlite.");
  }
  booleanValue("COMMUNITY_RATING_WRITES_ENABLED", "true");
  booleanValue("COMMUNITY_TURNSTILE_ENABLED", "false");
  booleanValue("IMPORT_AUTO_WORKER", "false");
  booleanValue("IMPORT_AUTO_DISCOVERY", "false");
  if (value("COMMUNITY_TURNSTILE_SITE_KEY") || value("COMMUNITY_TURNSTILE_SECRET_KEY")) {
    errors.push("Staging must not contain production Turnstile credentials.");
  }
  if (value("PLAUSIBLE_DOMAIN") || value("PLAUSIBLE_SCRIPT_SRC")) {
    errors.push("Staging analytics must remain disabled.");
  }
  if (value("PODCAST_INDEX_API_KEY") || value("PODCAST_INDEX_API_SECRET")) {
    errors.push("Staging must not contain Podcast Index credentials.");
  }
  if (value("COMMUNITY_VOTER_HASH_SECRET").length < 32) {
    errors.push("COMMUNITY_VOTER_HASH_SECRET must be at least 32 characters in staging.");
  }
} else {
  if (value("SITE_URL") !== "https://echoarchives.net") {
    errors.push("Production SITE_URL must be https://echoarchives.net.");
  }
  if (path.resolve(value("DB_PATH")) !== "/var/lib/echo-archives/community.sqlite") {
    errors.push("Production DB_PATH must be /var/lib/echo-archives/community.sqlite.");
  }
  if (value("COMMUNITY_RATING_WRITES_ENABLED").toLowerCase() === "true") {
    booleanValue("COMMUNITY_TURNSTILE_ENABLED", "true");
    required("COMMUNITY_TURNSTILE_SITE_KEY");
    required("COMMUNITY_TURNSTILE_SECRET_KEY");
    if (value("COMMUNITY_VOTER_HASH_SECRET").length < 32) {
      errors.push("COMMUNITY_VOTER_HASH_SECRET must be at least 32 characters in production.");
    }
  }
}

for (const name of ["NODE_ENV", "HOST", "PORT", "INTERNAL_HEALTH_PORT", "STATIC_ROOT", "SERVE_STATIC", "IMPORT_STAGING_ROOT"]) {
  if (envFileKeys.has(name)) {
    errors.push(`${name} is owned by the systemd unit and must be omitted from the ${environment} environment file.`);
  }
}

for (const name of [
  "ACCESS_LOG_ENABLED",
  "ARCHIVIST_ENABLED",
  "COMMUNITY_RATING_WRITES_ENABLED",
  "COMMUNITY_TURNSTILE_ENABLED",
  "IMPORT_AUTO_WORKER",
  "IMPORT_AUTO_DISCOVERY",
]) {
  booleanSyntax(name);
}

for (const name of [
  "COMMUNITY_VOTER_HASH_SECRET",
  "COMMUNITY_TURNSTILE_SITE_KEY",
  "COMMUNITY_TURNSTILE_SECRET_KEY",
  "MAINTAINER_REVIEW_PASSPHRASE",
  "MAINTAINER_REVIEW_COOKIE_SECRET",
  "ACCESS_LOG_HMAC_SECRET",
]) {
  const secret = value(name);
  if (secret && isPlaceholderSecret(secret)) {
    errors.push(`${name} still contains a placeholder value.`);
  }
}

if (envFile) {
  let stat;
  try {
    stat = fs.statSync(envFile);
  } catch (_error) {
    errors.push(`Environment file does not exist: ${envFile}`);
  }
  if (stat && !stat.isFile()) errors.push(`Environment path is not a regular file: ${envFile}`);
  if (stat && (stat.mode & 0o077) !== 0) errors.push(`Environment file must be mode 0600: ${envFile}`);
}

if (errors.length > 0) {
  console.error(`Invalid ${environment} environment:`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`${environment} environment is valid (secret values omitted).`);
