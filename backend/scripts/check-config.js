const config = require("../lib/config");

try {
  config.validateConfig(config);
  config.getConfigWarnings(config).forEach((warning) => console.warn(`Warning: ${warning}`));
  console.log(`Echo Archives configuration is valid for ${config.NODE_ENV}.`);
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}
