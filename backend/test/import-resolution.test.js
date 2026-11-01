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

test("a structured organization homepage does not create a false show-title conflict", () => {
  const resolved = resolveSourceFacts([
    { sourceType: "rss", sourceUrl: "https://aat.example/feed.xml", normalized: { title: "The Great Work and Other Administrative Matters" } },
    { sourceType: "apple", sourceUrl: "https://podcasts.apple.com/us/podcast/id123456", normalized: { title: "The Great Work and Other Administrative Matters" } },
    { sourceType: "website", sourceUrl: "https://aat.example/", normalized: { structured: true, structuredType: "organization", genericOrganizationTitle: true, title: "A.A.T. Studios", networkName: "A.A.T. Studios" } },
  ]);
  assert.equal(resolved.objective.title, "The Great Work and Other Administrative Matters");
  assert.equal(resolved.fieldSummary.title.confidence, 0.98);
  assert.equal(resolved.fieldSummary.title.method, "source-agreement");
  assert.equal(resolved.conflicts.some((conflict) => conflict.fieldName === "title"), false);
});

test("resolved title and creator values collapse source whitespace without changing identity facts", () => {
  const resolved = resolveSourceFacts([
    { sourceType: "rss", sourceUrl: "https://example.com/feed.xml", normalized: { title: "Mina  -  An Audiobook Podcast", creatorName: "  Roo   Bannister " } },
  ]);
  assert.equal(resolved.objective.title, "Mina - An Audiobook Podcast");
  assert.equal(resolved.objective.creatorName, "Roo Bannister");
});
