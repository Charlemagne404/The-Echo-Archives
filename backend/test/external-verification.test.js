const test = require("node:test");
const assert = require("node:assert/strict");

async function loadVerificationWorkflow() {
  return import("../../shared/app/maintainer-import/external-verification.js");
}

test("external verification brief includes the editable record and known sources", async () => {
  const { buildExternalVerificationBrief } = await loadVerificationWorkflow();
  const brief = buildExternalVerificationBrief({
    id: "candidate-1",
    title: "Signal Lost",
    creatorName: "Archive Studio",
    primarySourceType: "rss",
    primarySourceUrl: "https://example.com/feed.xml",
    objective: {
      title: "Signal Lost",
      description: "A fiction show.",
      categories: ["Science Fiction"],
    },
    readiness: { blockers: [{ code: "weak-description" }] },
  });

  assert.match(brief, /"echo_archives_verification": "v2"/);
  assert.match(brief, /"title": "Signal Lost"/);
  assert.match(brief, /https:\/\/example\.com\/feed\.xml/);
  assert.match(brief, /weak-description/);
  assert.match(brief, /complete official show description/i);
  assert.match(brief, /Never write, shorten, expand, summarize, paraphrase, combine, or infer a description/i);
  assert.match(brief, /always return 2 to 6 distinct source-supported values in "tags"/i);
  assert.match(brief, /"sci-fi" \(never "science fiction"/i);
  assert.match(brief, /Never use "Science Fiction" as a tag; use "Sci-fi" instead/i);
  assert.match(brief, /catalog enrichment/i);
  assert.match(brief, /archive takes, reviews, recommendations/i);
});

test("external verification parser accepts fenced JSON and ignores unsafe values", async () => {
  const { parseExternalVerificationResponse } = await loadVerificationWorkflow();
  const response = parseExternalVerificationResponse(`ChatGPT response:\n\n\`\`\`json
{
  "verified": {
    "title": "Signal Lost",
    "creator_name": "Archive Studio",
    "categories": ["Science Fiction", "Audio Drama"],
    "tags": ["Science Fiction", "SPACE"],
    "episode_count": 12,
    "first_publication_date": "2026-06-01",
    "rss_url": "https://example.com/feed.xml",
    "website_url": "not-a-url",
    "completion_status": "finished"
  },
  "source_urls": ["https://example.com/feed.xml", "not-a-url"],
  "notes": "The official feed lists twelve full episodes.",
  "uncertain_fields": ["Average runtime"]
}
\`\`\``);

  assert.deepEqual(response.details, {
    title: "Signal Lost",
    creatorName: "Archive Studio",
    categories: "sci-fi",
    tags: "Sci-fi, Space",
    rssUrl: "https://example.com/feed.xml",
    episodeCount: "12",
    firstPublicationDate: "2026-06-01",
    completionStatus: "finished",
  });
  assert.deepEqual(response.sourceUrls, ["https://example.com/feed.xml"]);
  assert.deepEqual(response.uncertainFields, ["Average runtime"]);
});

test("external verification parser requires two normalized discovery tags", async () => {
  const { parseExternalVerificationResponse } = await loadVerificationWorkflow();
  assert.throws(
    () => parseExternalVerificationResponse(JSON.stringify({ verified: { title: "Signal Lost", tags: ["Science Fiction"] } })),
    /at least two source-supported discovery tags/i,
  );
});

test("external verification parser carries source-backed catalog enrichment into the editor", async () => {
  const { parseExternalVerificationResponse } = await loadVerificationWorkflow();
  const response = parseExternalVerificationResponse(JSON.stringify({
    verified: { title: "Signal Lost", tags: ["Science Fiction", "Space"] },
    enrichment: {
      formats: ["Serialized", "Full cast"],
      tones: ["Atmospheric"],
      themes: ["Isolation"],
      contentNotes: ["Official site notes strong language"],
      people: [{ name: "Alex Writer", role: "writer", url: "https://example.com/about" }],
      officialLinks: { patreonUrl: "https://patreon.com/signal-lost", youtubeUrl: "https://youtube.com/@signallost" },
      socialUrls: ["https://instagram.com/signallost", "not-a-url"],
      cadenceLabel: "Weekly",
    },
    source_urls: ["https://example.com/feed.xml"],
    field_sources: { formats: ["https://example.com/about"], cadenceLabel: ["https://example.com/episodes"] },
  }));

  assert.deepEqual(response.enrichment, {
    formats: ["Serialized", "Full cast"],
    tones: ["Atmospheric"],
    themes: ["Isolation"],
    contentNotes: ["Official site notes strong language"],
    people: [{ name: "Alex Writer", role: "writer", url: "https://example.com/about" }],
    officialLinks: { patreonUrl: "https://patreon.com/signal-lost", youtubeUrl: "https://youtube.com/@signallost" },
    socialUrls: ["https://instagram.com/signallost"],
    cadenceLabel: "Weekly",
  });
  assert.deepEqual(response.fieldSources, {
    formats: ["https://example.com/about"],
    cadenceLabel: ["https://example.com/episodes"],
  });
});
