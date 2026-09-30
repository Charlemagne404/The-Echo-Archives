const test = require("node:test");
const assert = require("node:assert/strict");

test("home search cache imports in Node without browser globals", async () => {
  assert.equal(typeof globalThis.document, "undefined");
  const searchCache = await import("../../shared/app/pages/home/search-cache.js");
  assert.equal(typeof searchCache.createHomeSearchPerformanceCache, "function");
});
