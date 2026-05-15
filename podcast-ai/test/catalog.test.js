const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { loadCatalog, scoreCatalog } = require("../lib/catalog");
const { buildFallbackAnswer, sanitizeAnswerText } = require("../lib/chat");

const siteRoot = path.resolve(__dirname, "../..");

test("loadCatalog merges homepage cards with detailed archive data", () => {
  const catalog = loadCatalog(siteRoot);
  const impactWinter = catalog.find((entry) => entry.title === "Impact Winter");

  assert.ok(catalog.length >= 10);
  assert.ok(impactWinter);
  assert.equal(impactWinter.finalRating, 10);
  assert.equal(impactWinter.hasPage, true);
  assert.match(impactWinter.summary, /post-apocalyptic audio drama/i);
});

test("scoreCatalog ranks relevant matches first", () => {
  const catalog = loadCatalog(siteRoot);
  const results = scoreCatalog(catalog, "I want a sci-fi survival show with vampires");

  assert.ok(results.length > 0);
  assert.equal(results[0].title, "Impact Winter");
});

test("fallback answer asks for specificity when no clear match exists", () => {
  const answer = buildFallbackAnswer("hi", []);

  assert.match(answer, /genre, mood, or theme/i);
});

test("sanitizeAnswerText removes generic model framing", () => {
  const answer = sanitizeAnswerText(
    "Based on your request, try Impact Winter. It fits sci-fi survival well. Enjoy your journey through the archive!",
    "Fallback answer.",
  );

  assert.equal(answer, "Fallback answer.");
});
