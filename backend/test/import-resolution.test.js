const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveSourceFacts } = require("../lib/import/resolution");

test("field resolution adds independent agreement confidence and follows field-specific source priority", () => {
  const resolved = resolveSourceFacts([
    { sourceType: "podcast-index", sourceUrl: "https://index.example/feed", normalized: { title: "Signal", description: "Official description.", artworkUrl: "https://index.example/art.jpg" } },
    { sourceType: "rss", sourceUrl: "https://example.com/feed.xml", normalized: { title: "Signal", description: "Official description.", artworkUrl: "https://example.com/rss.jpg" } },
    { sourceType: "website", sourceUrl: "https://example.com/", normalized: { structured: true, title: "Signal", spotifyUrl: "https://open.spotify.com/show/abc" } },
  ]);
  assert.equal(resolved.fieldSummary.title.confidence, 0.99);
  assert.equal(resolved.fieldSummary.description.confidence, 0.98);
  assert.equal(resolved.objective.artworkUrl, "https://example.com/rss.jpg");
  assert.equal(resolved.objective.spotifyUrl, "https://open.spotify.com/show/abc");
  assert.equal(resolved.conflicts.length, 0);
});

test("material official disagreement blocks while unstructured assistance stays below auto-apply confidence", () => {
  const resolved = resolveSourceFacts([
    { sourceType: "rss", sourceUrl: "https://example.com/feed.xml", normalized: { title: "Signal" } },
    { sourceType: "website", sourceUrl: "https://example.com/", normalized: { structured: true, title: "Signal Programme" } },
    { sourceType: "website", sourceUrl: "https://example.com/about", normalized: { structured: false, description: "Unstructured prose." } },
  ]);
  assert.ok(resolved.conflicts.some((conflict) => conflict.fieldName === "title" && conflict.blocking));
  assert.equal(resolved.fieldSummary.description.confidence, 0.6);
});
