const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const { readCatalogSource } = require("../lib/catalog-source");
const { createShowTemplate } = require("../lib/catalog-schema");
const {
  buildImportedProvenance,
  normalizeProvenance,
  validateProvenance,
} = require("../lib/catalog-provenance");
const { summarizeProvenance } = require("../report-provenance");

const ROOT = path.resolve(__dirname, "../..");

test("show templates include an explicit legacy-safe provenance shape", () => {
  const template = createShowTemplate({ id: "sample-show", title: "Sample Show" });
  assert.deepEqual(template.provenance, {
    status: "legacy-unknown",
    sources: [],
    description: { origin: "unknown", sourceUrls: [] },
    artwork: { sourceUrl: "", sourceType: "unknown", rightsNote: "" },
    logos: [],
    rightsNotes: "",
  });
});

test("provenance validation accepts canonical data and rejects unsafe URLs", () => {
  const sample = normalizeProvenance({
    status: "documented",
    sources: [{ sourceUrl: "https://example.com/show", sourceType: "official-website" }],
    description: { origin: "original-to-echo", sourceUrls: [] },
    artwork: { sourceUrl: "", sourceType: "unknown", rightsNote: "" },
    logos: [],
    rightsNotes: "",
  });
  assert.doesNotThrow(() => validateProvenance("sample-show", sample));
  assert.throws(
    () => validateProvenance("sample-show", {
      ...sample,
      sources: [{ sourceUrl: "ftp://example.com/show", sourceType: "official-website" }],
    }),
    /HTTP\(S\) URL/,
  );
});

test("imported records map field evidence into lightweight provenance", () => {
  const provenance = buildImportedProvenance({
    candidate: {
      primarySourceType: "website",
      provenance: {
        fields: {
          description: {
            sources: [{ sourceType: "rss", sourceUrl: "https://example.com/feed.xml" }],
          },
          artworkUrl: {
            sources: [{ sourceType: "creator-provided", sourceUrl: "https://example.com/cover.jpg" }],
          },
        },
      },
    },
    objective: {},
    sourceReferences: [{ sourceType: "website", sourceUrl: "https://example.com/show" }],
    externalSources: ["https://database.example/show"],
  });

  assert.equal(provenance.status, "documented");
  assert.equal(provenance.description.origin, "sourced-externally");
  assert.deepEqual(provenance.description.sourceUrls, ["https://example.com/feed.xml"]);
  assert.equal(provenance.artwork.sourceType, "creator-provided");
  assert.equal(provenance.sources[0].sourceType, "official-website");
  assert.equal(provenance.sources[1].sourceType, "third-party-database");
});

test("current catalogue provenance report validates explicit records without requiring migration", () => {
  const { shows } = readCatalogSource(ROOT);
  const summary = summarizeProvenance(shows);
  assert.equal(summary.totalShows, shows.length);
  assert.equal(summary.legacyUnknown + summary.documentedProvenance, shows.length);
});
