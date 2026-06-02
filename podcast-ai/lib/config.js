const path = require("node:path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const DATA_ROOT = path.resolve(PROJECT_ROOT, "data");

module.exports = {
  PORT: Number.parseInt(process.env.PORT || "3010", 10),
  OLLAMA_URL: process.env.OLLAMA_URL || "http://127.0.0.1:11434/api/generate",
  OLLAMA_MODEL: process.env.OLLAMA_MODEL || "mistral",
  REQUEST_TIMEOUT_MS: Number.parseInt(process.env.REQUEST_TIMEOUT_MS || "30000", 10),
  SERVE_STATIC: process.env.SERVE_STATIC !== "false",
  STATIC_ROOT: path.resolve(PROJECT_ROOT, process.env.STATIC_ROOT || ".."),
  DB_PATH: process.env.DB_PATH || path.join(DATA_ROOT, "community.sqlite"),
  SITE_URL: process.env.SITE_URL || "https://echo.continental-hub.com",
  COMMUNITY_WRITE_WINDOW_MS: Number.parseInt(process.env.COMMUNITY_WRITE_WINDOW_MS || "600000", 10),
  COMMUNITY_WRITE_MAX: Number.parseInt(process.env.COMMUNITY_WRITE_MAX || "20", 10),
  PROFILE_HEADER: "x-echo-profile-id",
  PROJECT_ROOT,
  DATA_ROOT,
};
