const path = require("node:path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const DATA_ROOT = path.resolve(PROJECT_ROOT, "data");
const IS_PRODUCTION = process.env.NODE_ENV === "production";

function parseBoolean(value, fallback = false) {
  if (value === undefined) {
    return fallback;
  }

  return /^(1|true|yes|on)$/i.test(String(value).trim());
}

function parseInteger(value, fallback) {
  return Number(value === undefined ? fallback : value);
}

const communityTurnstileSecretKey = process.env.COMMUNITY_TURNSTILE_SECRET_KEY || "";
const communityVoterHashSecret =
  process.env.COMMUNITY_VOTER_HASH_SECRET ||
  (IS_PRODUCTION ? "" : "echo-community-dev-voter-secret");
const communityTurnstileEnabled = parseBoolean(
  process.env.COMMUNITY_TURNSTILE_ENABLED,
  Boolean(communityTurnstileSecretKey),
);
const communityRatingWritesEnabled = parseBoolean(process.env.COMMUNITY_RATING_WRITES_ENABLED, !IS_PRODUCTION);
const accessLogEnabled = parseBoolean(process.env.ACCESS_LOG_ENABLED, false);

const config = {
  NODE_ENV: process.env.NODE_ENV || "development",
  IS_PRODUCTION,
  HOST: process.env.HOST || (IS_PRODUCTION ? "127.0.0.1" : "0.0.0.0"),
  PORT: parseInteger(process.env.PORT, 3010),
  OLLAMA_URL: process.env.OLLAMA_URL || "http://127.0.0.1:11434/api/generate",
  OLLAMA_MODEL: process.env.OLLAMA_MODEL || "mistral",
  REQUEST_TIMEOUT_MS: parseInteger(process.env.REQUEST_TIMEOUT_MS, 30000),
  SERVE_STATIC: process.env.SERVE_STATIC !== "false",
  TRUST_PROXY: process.env.TRUST_PROXY || "loopback",
  STATIC_ROOT: path.resolve(PROJECT_ROOT, process.env.STATIC_ROOT || ".."),
  DB_PATH: process.env.DB_PATH || path.join(DATA_ROOT, "community.sqlite"),
  SITE_URL: process.env.SITE_URL || "https://echoarchives.net",
  ACCESS_LOG_ENABLED: accessLogEnabled,
  ACCESS_LOG_HMAC_SECRET: process.env.ACCESS_LOG_HMAC_SECRET || "",
  CHAT_RATE_LIMIT_WINDOW_MS: parseInteger(process.env.CHAT_RATE_LIMIT_WINDOW_MS, 600000),
  CHAT_RATE_LIMIT_MAX: parseInteger(process.env.CHAT_RATE_LIMIT_MAX, 40),
  CHAT_MESSAGE_MAX_LENGTH: parseInteger(process.env.CHAT_MESSAGE_MAX_LENGTH, 2000),
  CHAT_HISTORY_ENTRY_MAX_LENGTH: parseInteger(process.env.CHAT_HISTORY_ENTRY_MAX_LENGTH, 2000),
  COMMUNITY_WRITE_WINDOW_MS: parseInteger(process.env.COMMUNITY_WRITE_WINDOW_MS, 600000),
  COMMUNITY_WRITE_MAX: parseInteger(process.env.COMMUNITY_WRITE_MAX, 20),
  COMMUNITY_MIN_PUBLIC_RATINGS: parseInteger(process.env.COMMUNITY_MIN_PUBLIC_RATINGS, 3),
  COMMUNITY_ABUSE_RETENTION_DAYS: parseInteger(process.env.COMMUNITY_ABUSE_RETENTION_DAYS, 30),
  COMMUNITY_SUMMARY_MAX_IDS: parseInteger(process.env.COMMUNITY_SUMMARY_MAX_IDS, 100),
  COMMUNITY_TURNSTILE_SITE_KEY: process.env.COMMUNITY_TURNSTILE_SITE_KEY || "",
  COMMUNITY_TURNSTILE_SECRET_KEY: communityTurnstileSecretKey,
  COMMUNITY_TURNSTILE_VERIFY_URL:
    process.env.COMMUNITY_TURNSTILE_VERIFY_URL || "https://challenges.cloudflare.com/turnstile/v0/siteverify",
  COMMUNITY_TURNSTILE_TIMEOUT_MS: parseInteger(process.env.COMMUNITY_TURNSTILE_TIMEOUT_MS, 5000),
  COMMUNITY_TURNSTILE_ENABLED: communityTurnstileEnabled,
  COMMUNITY_RATING_WRITES_ENABLED: communityRatingWritesEnabled,
  COMMUNITY_VOTER_COOKIE_NAME: process.env.COMMUNITY_VOTER_COOKIE_NAME || "echo-community-voter",
  COMMUNITY_VOTER_HASH_SECRET: communityVoterHashSecret,
  SUBMISSION_RATE_LIMIT_WINDOW_MS: parseInteger(process.env.SUBMISSION_RATE_LIMIT_WINDOW_MS, 3600000),
  SUBMISSION_RATE_LIMIT_MAX: parseInteger(process.env.SUBMISSION_RATE_LIMIT_MAX, 3),
  MAINTAINER_LOGIN_WINDOW_MS: parseInteger(process.env.MAINTAINER_LOGIN_WINDOW_MS, 900000),
  MAINTAINER_LOGIN_MAX: parseInteger(process.env.MAINTAINER_LOGIN_MAX, 5),
  MAINTAINER_REVIEW_PASSPHRASE: process.env.MAINTAINER_REVIEW_PASSPHRASE || "",
  MAINTAINER_REVIEW_COOKIE_SECRET: process.env.MAINTAINER_REVIEW_COOKIE_SECRET || "",
  MAINTAINER_REVIEW_SESSION_TTL_HOURS: parseInteger(process.env.MAINTAINER_REVIEW_SESSION_TTL_HOURS, 12),
  PODCAST_INDEX_API_KEY: process.env.PODCAST_INDEX_API_KEY || "",
  PODCAST_INDEX_API_SECRET: process.env.PODCAST_INDEX_API_SECRET || "",
  PODCAST_INDEX_USER_AGENT: process.env.PODCAST_INDEX_USER_AGENT || "",
  IMPORT_SUGGESTION_PROVIDER: process.env.IMPORT_SUGGESTION_PROVIDER || "",
  IMPORT_SUGGESTION_MODEL: process.env.IMPORT_SUGGESTION_MODEL || "",
  COLLECTION_SUGGESTION_PROVIDER: process.env.COLLECTION_SUGGESTION_PROVIDER || process.env.IMPORT_SUGGESTION_PROVIDER || "",
  COLLECTION_SUGGESTION_MODEL: process.env.COLLECTION_SUGGESTION_MODEL || process.env.IMPORT_SUGGESTION_MODEL || "",
  COLLECTION_MIN_MATCHES: parseInteger(process.env.COLLECTION_MIN_MATCHES, 4),
  COLLECTION_SEMANTIC_CONFIDENCE: parseInteger(process.env.COLLECTION_SEMANTIC_CONFIDENCE, 78) / 100,
  COLLECTION_SEMANTIC_BORDERLINE_CONFIDENCE: parseInteger(process.env.COLLECTION_SEMANTIC_BORDERLINE_CONFIDENCE, 65) / 100,
  IMPORT_FETCH_TIMEOUT_MS: parseInteger(process.env.IMPORT_FETCH_TIMEOUT_MS, 15000),
  IMPORT_DOCUMENT_MAX_BYTES: parseInteger(process.env.IMPORT_DOCUMENT_MAX_BYTES, 5 * 1024 * 1024),
  IMPORT_COVER_MAX_BYTES: parseInteger(process.env.IMPORT_COVER_MAX_BYTES, 8 * 1024 * 1024),
  IMPORT_WORKER_CONCURRENCY: parseInteger(process.env.IMPORT_WORKER_CONCURRENCY, 4),
  IMPORT_HOST_CONCURRENCY: parseInteger(process.env.IMPORT_HOST_CONCURRENCY, 2),
  IMPORT_APPLE_REQUESTS_PER_MINUTE: parseInteger(process.env.IMPORT_APPLE_REQUESTS_PER_MINUTE, 15),
  IMPORT_AUTO_WORKER: parseBoolean(process.env.IMPORT_AUTO_WORKER, true),
  IMPORT_AUTO_DISCOVERY: parseBoolean(process.env.IMPORT_AUTO_DISCOVERY, false),
  IMPORT_DISCOVERY_CONCURRENCY: parseInteger(process.env.IMPORT_DISCOVERY_CONCURRENCY, 2),
  HOME_CARD_HOVER_EXPAND_ENABLED: parseBoolean(process.env.HOME_CARD_HOVER_EXPAND_ENABLED, false),
  PROFILE_HEADER: "x-echo-profile-id",
  MAINTAINER_REVIEW_COOKIE_NAME: "echo-maintainer-session",
  PROJECT_ROOT,
  DATA_ROOT,
};

const POSITIVE_INTEGER_KEYS = [
  "PORT",
  "REQUEST_TIMEOUT_MS",
  "CHAT_RATE_LIMIT_WINDOW_MS",
  "CHAT_RATE_LIMIT_MAX",
  "CHAT_MESSAGE_MAX_LENGTH",
  "CHAT_HISTORY_ENTRY_MAX_LENGTH",
  "COMMUNITY_WRITE_WINDOW_MS",
  "COMMUNITY_WRITE_MAX",
  "COMMUNITY_MIN_PUBLIC_RATINGS",
  "COMMUNITY_ABUSE_RETENTION_DAYS",
  "COMMUNITY_SUMMARY_MAX_IDS",
  "COMMUNITY_TURNSTILE_TIMEOUT_MS",
  "SUBMISSION_RATE_LIMIT_WINDOW_MS",
  "SUBMISSION_RATE_LIMIT_MAX",
  "MAINTAINER_LOGIN_WINDOW_MS",
  "MAINTAINER_LOGIN_MAX",
  "MAINTAINER_REVIEW_SESSION_TTL_HOURS",
  "IMPORT_FETCH_TIMEOUT_MS",
  "IMPORT_DOCUMENT_MAX_BYTES",
  "IMPORT_COVER_MAX_BYTES",
  "IMPORT_WORKER_CONCURRENCY",
  "IMPORT_HOST_CONCURRENCY",
  "IMPORT_APPLE_REQUESTS_PER_MINUTE",
  "IMPORT_DISCOVERY_CONCURRENCY",
  "COLLECTION_MIN_MATCHES",
];

function isValidAbsoluteUrl(value, { httpsOnly = false } = {}) {
  try {
    const parsed = new URL(String(value || ""));
    return parsed.origin !== "null" && (!httpsOnly || parsed.protocol === "https:");
  } catch (_error) {
    return false;
  }
}

function validateConfig(candidate = config) {
  const errors = [];

  POSITIVE_INTEGER_KEYS.forEach((key) => {
    if (!Number.isInteger(candidate[key]) || candidate[key] <= 0) {
      errors.push(`${key} must be a positive integer.`);
    }
  });

  if (candidate.PORT > 65535) {
    errors.push("PORT must be between 1 and 65535.");
  }

  if (
    !Number.isFinite(candidate.COLLECTION_SEMANTIC_CONFIDENCE) ||
    candidate.COLLECTION_SEMANTIC_CONFIDENCE <= 0 ||
    candidate.COLLECTION_SEMANTIC_CONFIDENCE > 1 ||
    !Number.isFinite(candidate.COLLECTION_SEMANTIC_BORDERLINE_CONFIDENCE) ||
    candidate.COLLECTION_SEMANTIC_BORDERLINE_CONFIDENCE <= 0 ||
    candidate.COLLECTION_SEMANTIC_BORDERLINE_CONFIDENCE > candidate.COLLECTION_SEMANTIC_CONFIDENCE
  ) {
    errors.push("Collection semantic confidence thresholds must be between 0 and 1, with borderline below the publish threshold.");
  }

  if (!String(candidate.HOST || "").trim()) {
    errors.push("HOST must not be empty.");
  }

  if (!isValidAbsoluteUrl(candidate.SITE_URL, { httpsOnly: candidate.IS_PRODUCTION })) {
    errors.push(`SITE_URL must be an absolute ${candidate.IS_PRODUCTION ? "HTTPS " : ""}URL.`);
  } else {
    const siteUrl = new URL(candidate.SITE_URL);
    if (
      siteUrl.username ||
      siteUrl.password ||
      (siteUrl.pathname !== "/" && siteUrl.pathname !== "") ||
      siteUrl.search ||
      siteUrl.hash
    ) {
      errors.push("SITE_URL must contain only the public origin, without credentials, path, query, or fragment.");
    }
  }

  if (!isValidAbsoluteUrl(candidate.OLLAMA_URL)) {
    errors.push("OLLAMA_URL must be an absolute URL.");
  }
  if (!isValidAbsoluteUrl(candidate.COMMUNITY_TURNSTILE_VERIFY_URL, { httpsOnly: candidate.IS_PRODUCTION })) {
    errors.push(
      `COMMUNITY_TURNSTILE_VERIFY_URL must be an absolute ${candidate.IS_PRODUCTION ? "HTTPS " : ""}URL.`,
    );
  }

  if (candidate.IS_PRODUCTION && !path.isAbsolute(candidate.DB_PATH)) {
    errors.push("DB_PATH must be absolute in production.");
  }

  const hasMaintainerPassphrase = Boolean(String(candidate.MAINTAINER_REVIEW_PASSPHRASE || ""));
  const hasMaintainerSecret = Boolean(String(candidate.MAINTAINER_REVIEW_COOKIE_SECRET || ""));
  if (hasMaintainerPassphrase !== hasMaintainerSecret) {
    errors.push("MAINTAINER_REVIEW_PASSPHRASE and MAINTAINER_REVIEW_COOKIE_SECRET must be configured together.");
  }

  if (candidate.IS_PRODUCTION && hasMaintainerPassphrase) {
    const passphrase = String(candidate.MAINTAINER_REVIEW_PASSPHRASE);
    const secret = String(candidate.MAINTAINER_REVIEW_COOKIE_SECRET);
    if (passphrase.length < 12 || /^(?:change-?me|password|secret|archive-test)/i.test(passphrase)) {
      errors.push("MAINTAINER_REVIEW_PASSPHRASE must be at least 12 characters and not a placeholder.");
    }
    if (secret.length < 32 || /^(?:change-?me|password|secret|archive-test)/i.test(secret)) {
      errors.push("MAINTAINER_REVIEW_COOKIE_SECRET must be at least 32 characters and not a placeholder.");
    }
    if (passphrase === secret) {
      errors.push("Maintainer passphrase and cookie secret must be distinct.");
    }
  }

  if (candidate.IS_PRODUCTION && candidate.COMMUNITY_RATING_WRITES_ENABLED) {
    if (!candidate.COMMUNITY_TURNSTILE_ENABLED) {
      errors.push("COMMUNITY_TURNSTILE_ENABLED must be true when community rating writes are enabled.");
    }
    if (!candidate.COMMUNITY_TURNSTILE_SITE_KEY || !candidate.COMMUNITY_TURNSTILE_SECRET_KEY) {
      errors.push("Turnstile site and secret keys are required when community rating writes are enabled.");
    }
    if (String(candidate.COMMUNITY_VOTER_HASH_SECRET || "").length < 32) {
      errors.push("COMMUNITY_VOTER_HASH_SECRET must be at least 32 characters when community rating writes are enabled.");
    }
  }

  if (
    candidate.ACCESS_LOG_ENABLED &&
    String(candidate.ACCESS_LOG_HMAC_SECRET || "").length < 32
  ) {
    errors.push("ACCESS_LOG_HMAC_SECRET must be at least 32 characters when access logging is enabled.");
  }

  if (errors.length > 0) {
    const error = new Error(`Invalid Echo Archives configuration:\n- ${errors.join("\n- ")}`);
    error.code = "INVALID_CONFIGURATION";
    error.details = errors;
    throw error;
  }

  return candidate;
}

function getConfigWarnings(candidate = config) {
  const warnings = [];
  if (
    candidate.IS_PRODUCTION &&
    (!candidate.MAINTAINER_REVIEW_PASSPHRASE || !candidate.MAINTAINER_REVIEW_COOKIE_SECRET)
  ) {
    warnings.push(
      "Maintainer authentication is disabled; public submissions cannot be reviewed through the web queue.",
    );
  }
  return warnings;
}

module.exports = config;
module.exports.getConfigWarnings = getConfigWarnings;
module.exports.validateConfig = validateConfig;
