const http = require("node:http");

// Public JSON bodies are small; imports run after the body has been accepted.
// Bound incomplete HTTP traffic independently of application handler duration.
function createBoundedHttpServer(handler, overrides = {}) {
  return http.createServer({
    headersTimeout: 10_000,
    requestTimeout: 15_000,
    connectionsCheckingInterval: 1_000,
    keepAliveTimeout: 5_000,
    maxHeaderSize: 16 * 1024,
    ...overrides,
  }, handler);
}
module.exports = { createBoundedHttpServer };
