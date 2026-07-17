const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { openDatabase } = require("../lib/store/database");
const { createImportService } = require("../lib/services/import-service");
const { createImportStore } = require("../lib/store/import-store");
const { readShowsFile } = require("../scripts/review-helpers");

const repositoryRoot = path.resolve(__dirname, "../..");
const coverBytes = fs.readFileSync(path.join(repositoryRoot, "images/covers/archive-81.jpg"));

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function createTempImportContext({ shows = [], collections = [], fetchImpl, onPublished = null } = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "echo-import-v2-"));
  const dbPath = path.join(tempDir, "community.sqlite");
  const siteRoot = path.join(tempDir, "site");
  writeJson(path.join(siteRoot, "data/shows.json"), shows);
  writeJson(path.join(siteRoot, "data/collections.json"), collections);
  const db = openDatabase(dbPath);
  const store = createImportStore({ db });
  const service = createImportService({
    store,
    staticRoot: siteRoot,
    config: {
      DB_PATH: dbPath,
      DATA_ROOT: tempDir,
      PODCAST_INDEX_API_KEY: "",
      PODCAST_INDEX_API_SECRET: "",
      PODCAST_INDEX_USER_AGENT: "Echo Import Tests",
      IMPORT_AUTO_WORKER: false,
      IMPORT_FETCH_TIMEOUT_MS: 2_000,
      IMPORT_DOCUMENT_MAX_BYTES: 2 * 1024 * 1024,
      IMPORT_COVER_MAX_BYTES: 2 * 1024 * 1024,
    },
    fetchImpl,
    onPublished,
  });
  return { db, store, service, siteRoot, tempDir };
}

function cleanup(context) {
  context.service.stop();
  context.db.close();
  fs.rmSync(context.tempDir, { recursive: true, force: true });
}

function appleEmptyResponse() {
  return new Response(JSON.stringify({ resultCount: 0, results: [] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function rssDocument({ title = "Signal Lost", website = "https://example.com/", feedUrl = "https://example.com/feed.xml", complete = false } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0"
      xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
      xmlns:podcast="https://podcastindex.org/namespace/1.0">
      <channel>
        <title>${title}</title>
        <link>${website}</link>
        <itunes:author>Archive Studio</itunes:author>
        <itunes:subtitle>Strange transmissions from a missing station.</itunes:subtitle>
        <itunes:summary>A serialized fiction audio drama about a vanished research station.</itunes:summary>
        <itunes:image href="https://example.com/cover.jpg" />
        <language>en</language>
        <itunes:category text="Fiction"><itunes:category text="Drama" /></itunes:category>
        <itunes:type>serial</itunes:type>
        ${complete ? "<podcast:complete>true</podcast:complete>" : ""}
        <podcast:guid>4c4d1ac2-1ab3-42ad-8898-123456789abc</podcast:guid>
        <podcast:person role="writer" group="creative">Alex Writer</podcast:person>
        <podcast:funding url="https://example.com/support">Support the show</podcast:funding>
        <item>
          <guid>signal-1</guid><title>Episode 1</title>
          <itunes:duration>00:30:00</itunes:duration><itunes:season>1</itunes:season>
          <pubDate>Mon, 01 Jun 2026 00:00:00 GMT</pubDate>
          <podcast:transcript url="https://example.com/transcripts/1.vtt" type="text/vtt" language="en" />
        </item>
        <item>
          <guid>signal-bonus</guid><title>Behind the signal</title><itunes:episodeType>bonus</itunes:episodeType>
          <pubDate>Mon, 02 Jun 2026 00:00:00 GMT</pubDate>
        </item>
      </channel>
    </rss>`;
}

function sourceRichFetch({ conflictingWebsiteTitle = "" } = {}) {
  return async (url) => {
    const value = String(url);
    if (value.startsWith("https://itunes.apple.com/search")) return appleEmptyResponse();
    if (value === "https://example.com/feed.xml") {
      return new Response(rssDocument(), { status: 200, headers: { "content-type": "application/rss+xml", etag: '"feed-v1"' } });
    }
    if (value === "https://example.com/" || value === "https://example.com") {
      const structured = conflictingWebsiteTitle
        ? `<script type="application/ld+json">${JSON.stringify({ "@type": "PodcastSeries", name: conflictingWebsiteTitle, description: "A serialized fiction audio drama about a vanished research station." })}</script>`
        : "";
      return new Response(`<!doctype html><html lang="en"><head>${structured}<title>Signal Lost</title></head><body><a href="https://open.spotify.com/show/abc123">Listen on Spotify</a><a href="https://podcasts.apple.com/us/podcast/id123456">Apple</a></body></html>`, {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }
    if (value === "https://example.com/cover.jpg") {
      return new Response(coverBytes, { status: 200, headers: { "content-type": "image/jpeg" } });
    }
    throw new Error(`Unexpected fetch URL: ${value}`);
  };
}

test("seed upsert reuses exact identities and queues persistent work", async () => {
  const context = createTempImportContext({ fetchImpl: sourceRichFetch() });
  try {
    const first = await context.service.seedCandidates({ entries: ["https://example.com/feed.xml"], actor: "CA" });
    const second = await context.service.seedCandidates({ entries: ["https://example.com/feed.xml"], actor: "CA" });
    assert.equal(first.candidates[0].status, "queued");
    assert.equal(second.candidateIds[0], first.candidateIds[0]);
    assert.equal(context.service.listForMaintainer({ includeClosed: true }).total, 1);
    assert.equal(context.service.getRun(second.runId).progress.total, 1);
  } finally {
    cleanup(context);
  }
});

test("discovery sources persist seen results, suppress closed identities, and require an explicit reopen", async () => {
  const discoveryFetch = async (url) => {
    if (String(url).startsWith("https://itunes.apple.com/search")) {
      return new Response(JSON.stringify({
        resultCount: 1,
        results: [{
          collectionId: 987654321,
          collectionName: "Discovery Signal",
          artistName: "Discovery Studio",
          description: "A fiction audio drama from a distant relay.",
          primaryGenreName: "Fiction",
          feedUrl: "https://discovery.example/feed.xml",
          collectionViewUrl: "https://podcasts.apple.com/us/podcast/discovery-signal/id987654321",
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  };
  const context = createTempImportContext({ fetchImpl: discoveryFetch });
  try {
    const source = context.service.createDiscoverySourceForMaintainer({
      name: "Focused fiction source",
      sourceType: "apple-search",
      query: "fiction audio drama",
      intervalMinutes: 60,
    });
    const scheduled = await context.service.runDueDiscovery({ force: true, actor: "test" });
    const run = await context.service.waitForDiscoveryRun(scheduled.runIds[0]);
    assert.equal(run.status, "completed");
    assert.equal(run.summary.found, 1);
    assert.equal(run.summary.candidateIds.length, 1);

    const candidateId = run.summary.candidateIds[0];
    const candidate = context.service.getForMaintainer(candidateId);
    assert.equal(candidate.discoverySourceId, source.id);
    assert.equal(candidate.discoveryRunId, run.id);

    context.service.reviewForMaintainer(candidateId, { status: "rejected", reviewedBy: "CA" }, "CA");
    const reseed = await context.service.seedCandidates({
      searchResults: [{
        sourceType: "apple",
        sourceKey: "987654321",
        sourceUrl: "https://podcasts.apple.com/us/podcast/discovery-signal/id987654321",
        title: "Discovery Signal",
        creatorName: "Discovery Studio",
        objective: { appleCollectionId: "987654321", rssUrl: "https://discovery.example/feed.xml", primaryGenre: "Fiction" },
      }],
    });
    assert.equal(reseed.candidateIds.length, 0);
    assert.equal(reseed.suppressed[0].reason, "rejected");

    const reopened = context.service.reopenForMaintainer(candidateId, "CA");
    assert.equal(reopened.candidateIds[0], candidateId);
    assert.equal(context.service.getForMaintainer(candidateId).status, "queued");
  } finally {
    cleanup(context);
  }
});

test("a vetted new-show submission can enter the protected import lane without publication", async () => {
  const context = createTempImportContext({ fetchImpl: sourceRichFetch() });
  try {
    const result = await context.service.seedSubmissionForMaintainer({
      id: "submission-123",
      submissionType: "show",
      status: "in-review",
      showTitle: "Submission Signal",
      creatorName: "Submission Studio",
      officialSite: "https://example.com/",
      rssOrListenLink: "https://example.com/feed.xml",
      genres: "fiction, drama",
      payload: { shortDescription: "A factual submission ready for source enrichment.", selectedTags: ["fiction", "drama"] },
    }, "CA");
    assert.equal(result.candidateIds.length, 1);
    const candidate = context.service.getForMaintainer(result.candidateIds[0]);
    assert.equal(candidate.status, "queued");
    assert.equal(candidate.primarySourceType, "submission");
    assert.match(candidate.events[0].eventType, /submission-handed-off|seeded/);
    assert.equal(candidate.publishedShowId, "");
  } finally {
    cleanup(context);
  }
});

test("exact Apple title discovery is confirmed by collection lookup and cached separately", async () => {
  const baseFetch = sourceRichFetch();
  let lookupCount = 0;
  const appleResult = {
    collectionId: 123456,
    collectionName: "Signal Lost",
    artistName: "Test Network",
    collectionViewUrl: "https://podcasts.apple.com/us/podcast/signal-lost/id123456",
    feedUrl: "https://example.com/feed.xml",
    artworkUrl600: "https://example.com/cover.jpg",
    genres: ["Fiction"],
    kind: "podcast",
  };
  const context = createTempImportContext({
    fetchImpl: async (url, init) => {
      const value = String(url);
      if (value.startsWith("https://itunes.apple.com/search")) {
        return new Response(JSON.stringify({ resultCount: 1, results: [appleResult] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (value.startsWith("https://itunes.apple.com/lookup")) {
        lookupCount += 1;
        return new Response(JSON.stringify({ resultCount: 1, results: [appleResult] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return baseFetch(url, init);
    },
  });
  try {
    const seeded = await context.service.seedCandidates({ entries: ["Signal Lost"], autoHydrate: true });
    const candidate = context.service.getForMaintainer(seeded.candidateIds[0]);
    assert.equal(candidate.status, "ready");
    assert.equal(lookupCount, 1);
    assert.equal(candidate.sources.find((source) => source.sourceType === "apple").normalized.identityExact, true);
    assert.ok(candidate.fieldEvidence.some((item) => item.fieldName === "appleCollectionId" && item.sourceType === "apple" && item.confidence === 0.9));
    assert.ok(context.store.getSourceCache("apple-search", "signal-lost"));
    assert.ok(context.store.getSourceCache("apple", "123456"));
  } finally {
    cleanup(context);
  }
});

test("a source-rich RSS import becomes review-and-publish ready and publishes without catalog editing", async () => {
  const context = createTempImportContext({ fetchImpl: sourceRichFetch() });
  try {
    const seeded = await context.service.seedCandidates({ entries: ["https://example.com/feed.xml"], actor: "CA", autoHydrate: true });
    const candidate = context.service.getForMaintainer(seeded.candidateIds[0]);
    assert.equal(candidate.status, "ready");
    assert.equal(candidate.readiness.ready, true);
    assert.equal(candidate.preparedRecord.reviewStatus, "indexed-only");
    assert.deepEqual(candidate.preparedRecord.tones, []);
    assert.deepEqual(candidate.preparedRecord.similarTo, []);
    assert.deepEqual(candidate.preparedRecord.formats, ["serialized"]);
    assert.equal(candidate.preparedRecord.length.episodes, 1);
    assert.equal(candidate.preparedRecord.length.episodeCounts.bonus, 1);
    assert.equal(candidate.preparedRecord.availability.transcripts, "1 observed episodes");
    assert.equal(candidate.coverStage.width, 1200);
    assert.equal(candidate.coverStage.echoPublishable, true);
    assert.ok(candidate.fieldEvidence.some((item) => item.fieldName === "description" && item.confidence === 0.95));

    const published = await context.service.publishForMaintainer(candidate.id, "CA");
    assert.equal(published.candidate.status, "published");
    assert.equal(published.buildCount, 1);
    const record = readShowsFile(context.siteRoot).find((show) => show.id === published.showId);
    assert.ok(record);
    assert.equal(record.status, "published");
    assert.match(record.verification.status, /source-reviewed/);
    assert.equal(record.ratings.archive, undefined);
    assert.ok(fs.existsSync(path.join(context.siteRoot, record.cover)));
  } finally {
    cleanup(context);
  }
});

test("high-confidence official disagreement blocks publication and exposes reviewer-selectable evidence", async () => {
  const context = createTempImportContext({ fetchImpl: sourceRichFetch({ conflictingWebsiteTitle: "Signal Harbour" }) });
  try {
    const seeded = await context.service.seedCandidates({ entries: ["https://example.com/feed.xml"], autoHydrate: true });
    const candidate = context.service.getForMaintainer(seeded.candidateIds[0]);
    assert.equal(candidate.status, "needs-review");
    assert.ok(candidate.conflicts.some((conflict) => conflict.fieldName === "title" && conflict.blocking));
    assert.ok(candidate.readiness.blockers.some((blocker) => blocker.code === "source-conflict"));
    const rssTitle = candidate.fieldEvidence.find((item) => item.fieldName === "title" && item.sourceType === "rss");
    const queued = context.service.selectEvidenceForMaintainer(candidate.id, "title", rssTitle.id, "CA");
    await context.service.processPendingJobs();
    await context.service.waitForRun(queued.runId);
    const resolved = context.service.getForMaintainer(candidate.id);
    assert.equal(resolved.objective.title, "Signal Lost");
    assert.equal(resolved.conflicts.some((conflict) => conflict.fieldName === "title"), false);
    assert.equal(resolved.status, "ready");
  } finally {
    cleanup(context);
  }
});

test("catalog update candidates preserve legacy and human-owned fields", async () => {
  const existing = {
    id: "signal-lost",
    title: "Signal Lost",
    subtitle: "Human subtitle",
    description: "Human-polished factual description.",
    cover: "images/covers/archive-81.jpg",
    coverAlt: "Signal Lost art",
    status: "published",
    reviewStatus: "indexed-only",
    releaseStatus: "unknown",
    completionStatus: "unclear",
    listenLinks: { rss: "https://example.com/feed.xml" },
    genres: ["sci-fi"], tones: ["dark"], formats: ["serialized"], tags: ["Curated"],
    ratings: { archive: 9 }, bestFor: ["late-night"], similarTo: [], similarReasons: {},
    archiveTake: "Human archive take.", spoilerFreeReview: "", thoughts: "", quote: { text: "", attribution: "" },
    officialLinks: {}, credits: {}, availability: {}, content: {}, metadata: {}, featured: true,
    updatedAt: "2026-06-30",
  };
  const context = createTempImportContext({ shows: [existing], fetchImpl: sourceRichFetch() });
  fs.mkdirSync(path.join(context.siteRoot, "images/covers"), { recursive: true });
  fs.copyFileSync(path.join(repositoryRoot, "images/covers/archive-81.jpg"), path.join(context.siteRoot, existing.cover));
  try {
    const seeded = await context.service.seedCandidates({ entries: ["https://example.com/feed.xml"], autoHydrate: true });
    const candidate = context.service.getForMaintainer(seeded.candidateIds[0]);
    assert.equal(candidate.mode, "update");
    assert.equal(candidate.existingShowId, existing.id);
    assert.equal(candidate.status, "ready");
    assert.equal(candidate.preparedRecord.description, existing.description);
    assert.deepEqual(candidate.preparedRecord.ratings, existing.ratings);
    assert.equal(candidate.preparedRecord.archiveTake, existing.archiveTake);
    assert.ok(candidate.lockedFields.includes("description"));
    await context.service.publishForMaintainer(candidate.id, "CA");
    const updated = readShowsFile(context.siteRoot).find((show) => show.id === existing.id);
    assert.deepEqual(updated.ratings, existing.ratings);
    assert.equal(updated.archiveTake, existing.archiveTake);
    assert.deepEqual(updated.tones, existing.tones);
  } finally {
    cleanup(context);
  }
});

test("permanent source failures finish with explicit readiness blockers instead of invented metadata", async () => {
  const context = createTempImportContext({
    fetchImpl: async () => new Response("missing", { status: 404, headers: { "content-type": "text/plain" } }),
  });
  try {
    const seeded = await context.service.seedCandidates({ entries: ["https://example.com/missing.xml"], autoHydrate: true });
    const candidate = context.service.getForMaintainer(seeded.candidateIds[0]);
    assert.equal(candidate.status, "needs-review");
    assert.ok(candidate.sourceHealth.errors.some((error) => error.retryable === false));
    assert.ok(candidate.readiness.blockers.some((blocker) => blocker.code === "weak-description"));
    await assert.rejects(context.service.publishForMaintainer(candidate.id, "CA"), /not ready to publish/i);
  } finally {
    cleanup(context);
  }
});

test("failed publication rolls authored and generated catalog data back and leaves the candidate ready", async () => {
  const context = createTempImportContext({ fetchImpl: sourceRichFetch() });
  try {
    const seeded = await context.service.seedCandidates({ entries: ["https://example.com/feed.xml"], autoHydrate: true });
    const candidate = context.service.getForMaintainer(seeded.candidateIds[0]);
    context.store.updateCandidate(candidate.id, { preparedRecord: { ...candidate.preparedRecord, title: "" } });
    await assert.rejects(context.service.publishForMaintainer(candidate.id, "CA"), /title/i);
    assert.equal(context.service.getForMaintainer(candidate.id).status, "ready");
    assert.equal(readShowsFile(context.siteRoot).some((show) => show.id === candidate.preparedRecord.id), false);
  } finally {
    cleanup(context);
  }
});

test("failed post-build reload rolls publication back before identities are bound", async () => {
  const context = createTempImportContext({
    fetchImpl: sourceRichFetch(),
    onPublished: async () => {
      throw new Error("simulated runtime reload failure");
    },
  });
  try {
    const seeded = await context.service.seedCandidates({ entries: ["https://example.com/feed.xml"], autoHydrate: true });
    const candidate = context.service.getForMaintainer(seeded.candidateIds[0]);
    await assert.rejects(context.service.publishForMaintainer(candidate.id, "CA"), /runtime reload failure/i);
    assert.equal(context.service.getForMaintainer(candidate.id).status, "ready");
    assert.equal(readShowsFile(context.siteRoot).some((show) => show.id === candidate.preparedRecord.id), false);
    assert.equal(context.store.findIdentity("rss-url", "https://example.com/feed.xml").existingShowId, "");
  } finally {
    cleanup(context);
  }
});

test("batch publication requires individual review and performs one catalog build", async () => {
  const fetchImpl = async (url) => {
    const value = String(url);
    if (value.startsWith("https://itunes.apple.com/search")) return appleEmptyResponse();
    const feedMatch = value.match(/^https:\/\/(one|two)\.example\.com\/feed\.xml$/);
    if (feedMatch) {
      const number = feedMatch[1] === "one" ? "One" : "Two";
      const guid = feedMatch[1] === "one" ? "11111111-1111-4111-8111-111111111111" : "22222222-2222-4222-8222-222222222222";
      return new Response(`<?xml version="1.0"?><rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:podcast="https://podcastindex.org/namespace/1.0"><channel><title>Signal ${number}</title><link>https://${feedMatch[1]}.example.com/</link><description>A fiction audio drama for batch publication.</description><language>en</language><itunes:category text="Fiction"/><itunes:image href="https://${feedMatch[1]}.example.com/cover.jpg"/><podcast:guid>${guid}</podcast:guid><item><title>Episode</title><pubDate>2026-06-01T00:00:00Z</pubDate></item></channel></rss>`, {
        status: 200, headers: { "content-type": "application/rss+xml" },
      });
    }
    if (/^https:\/\/(one|two)\.example\.com\/?$/.test(value)) return new Response("<!doctype html><title>Signal</title>", { status: 200, headers: { "content-type": "text/html" } });
    if (/^https:\/\/(one|two)\.example\.com\/cover\.jpg$/.test(value)) return new Response(coverBytes, { status: 200, headers: { "content-type": "image/jpeg" } });
    throw new Error(`Unexpected fetch URL: ${value}`);
  };
  const context = createTempImportContext({ fetchImpl });
  try {
    const seeded = await context.service.seedCandidates({
      entries: ["https://one.example.com/feed.xml", "https://two.example.com/feed.xml"],
      autoHydrate: true,
    });
    const candidates = seeded.candidateIds.map((id) => context.service.getForMaintainer(id));
    assert.ok(candidates.every((candidate) => candidate.status === "ready"));
    await assert.rejects(context.service.batchPublishForMaintainer(seeded.candidateIds, "CA"), /individually reviewed/i);
    seeded.candidateIds.forEach((id) => context.service.reviewForMaintainer(id, { status: "ready", reviewedBy: "CA" }, "CA"));
    const result = await context.service.batchPublishForMaintainer(seeded.candidateIds, "CA");
    assert.equal(result.buildCount, 1);
    assert.equal(result.showIds.length, 2);
    assert.equal(readShowsFile(context.siteRoot).length, 2);
  } finally {
    cleanup(context);
  }
});
