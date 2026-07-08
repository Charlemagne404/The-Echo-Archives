const path = require("node:path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const DATA_ROOT = path.resolve(PROJECT_ROOT, "data");

function parseBoolean(value, fallback = false) {
  if (value === undefined) {
    return fallback;
  }

  return /^(1|true|yes|on)$/i.test(String(value).trim());
}

const communityTurnstileSecretKey = process.env.COMMUNITY_TURNSTILE_SECRET_KEY || "";
const communityVoterHashSecret =
  process.env.COMMUNITY_VOTER_HASH_SECRET ||
  process.env.COMMUNITY_TURNSTILE_SECRET_KEY ||
  process.env.MAINTAINER_REVIEW_COOKIE_SECRET ||
  process.env.MAINTAINER_REVIEW_PASSPHRASE ||
  "echo-community-dev-voter-secret";
const communityTurnstileEnabled = parseBoolean(
  process.env.COMMUNITY_TURNSTILE_ENABLED,
  Boolean(communityTurnstileSecretKey),
);
const communityRatingWritesEnabled = parseBoolean(process.env.COMMUNITY_RATING_WRITES_ENABLED, true);

module.exports = {
  PORT: Number.parseInt(process.env.PORT || "3010", 10),
  OLLAMA_URL: process.env.OLLAMA_URL || "http://127.0.0.1:11434/api/generate",
  OLLAMA_MODEL: process.env.OLLAMA_MODEL || "mistral",
  REQUEST_TIMEOUT_MS: Number.parseInt(process.env.REQUEST_TIMEOUT_MS || "30000", 10),
  SERVE_STATIC: process.env.SERVE_STATIC !== "false",
  TRUST_PROXY: process.env.TRUST_PROXY || "loopback",
  STATIC_ROOT: path.resolve(PROJECT_ROOT, process.env.STATIC_ROOT || ".."),
  DB_PATH: process.env.DB_PATH || path.join(DATA_ROOT, "community.sqlite"),
  SITE_URL: process.env.SITE_URL || "https://echo.continental-hub.com",
  CHAT_RATE_LIMIT_WINDOW_MS: Number.parseInt(process.env.CHAT_RATE_LIMIT_WINDOW_MS || "600000", 10),
  CHAT_RATE_LIMIT_MAX: Number.parseInt(process.env.CHAT_RATE_LIMIT_MAX || "40", 10),
  COMMUNITY_WRITE_WINDOW_MS: Number.parseInt(process.env.COMMUNITY_WRITE_WINDOW_MS || "600000", 10),
  COMMUNITY_WRITE_MAX: Number.parseInt(process.env.COMMUNITY_WRITE_MAX || "20", 10),
  COMMUNITY_MIN_PUBLIC_RATINGS: Number.parseInt(process.env.COMMUNITY_MIN_PUBLIC_RATINGS || "3", 10),
  COMMUNITY_ABUSE_RETENTION_DAYS: Number.parseInt(process.env.COMMUNITY_ABUSE_RETENTION_DAYS || "30", 10),
  COMMUNITY_TURNSTILE_SITE_KEY: process.env.COMMUNITY_TURNSTILE_SITE_KEY || "",
  COMMUNITY_TURNSTILE_SECRET_KEY: communityTurnstileSecretKey,
  COMMUNITY_TURNSTILE_VERIFY_URL:
    process.env.COMMUNITY_TURNSTILE_VERIFY_URL || "https://challenges.cloudflare.com/turnstile/v0/siteverify",
  COMMUNITY_TURNSTILE_ENABLED: communityTurnstileEnabled,
  COMMUNITY_RATING_WRITES_ENABLED: communityRatingWritesEnabled,
  COMMUNITY_VOTER_COOKIE_NAME: process.env.COMMUNITY_VOTER_COOKIE_NAME || "echo-community-voter",
  COMMUNITY_VOTER_HASH_SECRET: communityVoterHashSecret,
  SUBMISSION_RATE_LIMIT_WINDOW_MS: Number.parseInt(process.env.SUBMISSION_RATE_LIMIT_WINDOW_MS || "3600000", 10),
  SUBMISSION_RATE_LIMIT_MAX: Number.parseInt(process.env.SUBMISSION_RATE_LIMIT_MAX || "3", 10),
  MAINTAINER_REVIEW_PASSPHRASE: process.env.MAINTAINER_REVIEW_PASSPHRASE || "",
  MAINTAINER_REVIEW_COOKIE_SECRET:
    process.env.MAINTAINER_REVIEW_COOKIE_SECRET || process.env.MAINTAINER_REVIEW_PASSPHRASE || "",
  MAINTAINER_REVIEW_SESSION_TTL_HOURS: Number.parseInt(process.env.MAINTAINER_REVIEW_SESSION_TTL_HOURS || "12", 10),
  PODCAST_INDEX_API_KEY: process.env.PODCAST_INDEX_API_KEY || "",
  PODCAST_INDEX_API_SECRET: process.env.PODCAST_INDEX_API_SECRET || "",
  PODCAST_INDEX_USER_AGENT: process.env.PODCAST_INDEX_USER_AGENT || "",
  IMPORT_SUGGESTION_PROVIDER: process.env.IMPORT_SUGGESTION_PROVIDER || "",
  IMPORT_SUGGESTION_MODEL: process.env.IMPORT_SUGGESTION_MODEL || "",
  HOME_CARD_HOVER_EXPAND_ENABLED: parseBoolean(process.env.HOME_CARD_HOVER_EXPAND_ENABLED, false),
  PROFILE_HEADER: "x-echo-profile-id",
  MAINTAINER_REVIEW_COOKIE_NAME: "echo-maintainer-session",
  PROJECT_ROOT,
  DATA_ROOT,
};
