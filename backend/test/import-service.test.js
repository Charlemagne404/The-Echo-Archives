const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { openDatabase } = require("../lib/store/database");
const { createImportService } = require("../lib/services/import-service");
const { createImportStore } = require("../lib/store/import-store");
const { readShowsFile, validateSiteData } = require("../scripts/review-helpers");

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function createTempImportContext({ shows = [], collections = [], fetchImpl } = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "echo-archives-import-"));
  const dbPath = path.join(tempDir, "community.sqlite");
  const siteRoot = path.join(tempDir, "site");

  writeJson(path.join(siteRoot, "data", "shows.json"), shows);
  writeJson(path.join(siteRoot, "data", "collections.json"), collections);

  const db = openDatabase(dbPath);
  const store = createImportStore({ db });
  const service = createImportService({
    store,
    staticRoot: siteRoot,
    config: {
      PODCAST_INDEX_API_KEY: "",
      PODCAST_INDEX_API_SECRET: "",
      PODCAST_INDEX_USER_AGENT: "",
      IMPORT_SUGGESTION_PROVIDER: "",
      IMPORT_SUGGESTION_MODEL: "",
    },
    fetchImpl,
  });

  return {
    db,
    service,
    siteRoot,
    tempDir,
  };
}

function cleanupTempImportContext(context) {
  context.db.close();
  fs.rmSync(context.tempDir, { recursive: true, force: true });
}

function createShowRecord(id, title, similarTo = []) {
  return {
    id,
    title,
    description: `${title} archive description.`,
    cover: "images/demo-cover.png",
    coverAlt: `${title} cover art`,
    status: "published",
    reviewStatus: "indexed-only",
    releaseStatus: "completed",
    completionStatus: "finished",
    listenLinks: {},
    genres: ["sci-fi"],
    tones: ["dark"],
    formats: ["full-cast"],
    tags: ["Archive"],
    ratings: {
      archive: 8,
    },
    bestFor: ["easy-entry"],
    similarTo,
    similarReasons: Object.fromEntries(similarTo.map((neighborId) => [neighborId, `Close to ${neighborId}.`])),
    archiveTake: `${title} is worth indexing.`,
    spoilerFreeReview: "",
    thoughts: "",
    quote: {
      text: "",
      attribution: "",
    },
    updatedAt: "2026-06-30",
  };
}

function createBaselineCollections(showIds) {
  return [
    {
      id: "baseline-route-one",
      title: "Baseline Route One",
      description: "First baseline route.",
      showIds: [...showIds],
      showReasons: Object.fromEntries(showIds.map((showId) => [showId, `${showId} reason one.`])),
      updatedAt: "2026-06-30",
    },
    {
      id: "baseline-route-two",
      title: "Baseline Route Two",
      description: "Second baseline route.",
      showIds: [...showIds],
      showReasons: Object.fromEntries(showIds.map((showId) => [showId, `${showId} reason two.`])),
      updatedAt: "2026-06-30",
    },
  ];
}

test("import service seeds candidates and persists duplicate or scope review state", () => {
  const context = createTempImportContext();

  try {
    const seeded = context.service.seedCandidates({
      entries: ["Signal Lost"],
      actor: "CA",
    });
    assert.equal(seeded.candidates.length, 1);
    assert.equal(seeded.candidates[0].status, "discovered");

    const reviewed = context.service.reviewForMaintainer(
      seeded.candidates[0].id,
      {
        status: "duplicate",
        scopeStatus: "borderline",
        duplicateOfShowId: "signal-lost",
        reviewNotes: "Same feed already exists in the archive.",
        reviewedBy: "CA",
      },
      "CA",
    );

    assert.equal(reviewed.status, "duplicate");
    assert.equal(reviewed.scopeStatus, "borderline");
    assert.equal(reviewed.duplicateOfShowId, "signal-lost");
    assert.match(reviewed.reviewNotes, /same feed/i);
    assert.equal(context.service.listForMaintainer({ includeClosed: true }).total, 1);
  } finally {
    cleanupTempImportContext(context);
  }
});

test("import service hydrates candidates from Apple search and RSS metadata", async () => {
  const fetchImpl = async (url) => {
    const value = String(url);

    if (value.startsWith("https://itunes.apple.com/search")) {
      return new Response(
        JSON.stringify({
          results: [
            {
              collectionId: 123456,
              collectionName: "Signal Lost",
              artistName: "Archive Studio",
              description: "A serialized fiction mystery.",
              collectionViewUrl: "https://podcasts.apple.com/us/podcast/signal-lost/id123456",
              feedUrl: "https://example.com/feed.xml",
              artworkUrl600: "https://example.com/cover.jpg",
              genres: ["Fiction", "Drama"],
              primaryGenreName: "Fiction",
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    }

    if (value === "https://example.com/feed.xml") {
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
          <channel>
            <title>Signal Lost</title>
            <itunes:author>Archive Studio</itunes:author>
            <itunes:summary>Fiction audio drama about a vanished station.</itunes:summary>
            <itunes:image href="https://example.com/cover.jpg" />
            <language>en</language>
            <itunes:category text="Fiction" />
            <item><title>Episode 1</title><pubDate>Mon, 08 Jun 2026 00:00:00 GMT</pubDate></item>
          </channel>
        </rss>`,
        {
          status: 200,
          headers: {
            "content-type": "application/rss+xml",
          },
        },
      );
    }

    throw new Error(`Unexpected fetch URL: ${value}`);
  };

  const context = createTempImportContext({ fetchImpl });

  try {
    const seeded = context.service.seedCandidates({
      entries: ["Signal Lost"],
      actor: "CA",
    });
    const hydrated = await context.service.hydrateForMaintainer(seeded.candidates[0].id, "CA");

    assert.equal(hydrated.status, "hydrated");
    assert.equal(hydrated.scopeStatus, "in-scope");
    assert.equal(hydrated.objective.title, "Signal Lost");
    assert.equal(hydrated.objective.creatorName, "Archive Studio");
    assert.equal(hydrated.objective.rssUrl, "https://example.com/feed.xml");
    assert.deepEqual(hydrated.sources.map((source) => source.sourceType), ["rss", "apple"]);
  } finally {
    cleanupTempImportContext(context);
  }
});

test("import service writes drafts, blocks invalid publish attempts, and promotes publish-ready drafts", async () => {
  const showIds = ["alpha-show", "beta-show", "gamma-show", "delta-show"];
  const shows = showIds.map((showId) =>
    createShowRecord(showId, showId.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()), showIds.filter((id) => id !== showId)),
  );
  const collections = createBaselineCollections(showIds);
  const context = createTempImportContext({ shows, collections });

  try {
    const seeded = context.service.seedCandidates({
      entries: ["Fresh Import"],
      actor: "CA",
    });
    const draftResult = await context.service.draftForMaintainer(seeded.candidates[0].id, "CA");
    const draftShowId = draftResult.showId;
    let writtenShows = readShowsFile(context.siteRoot);
    const draftedShow = writtenShows.find((show) => show.id === draftShowId);

    assert.ok(draftedShow);
    assert.equal(draftedShow.status, "draft");
    assert.equal(draftedShow.ratings.archive, undefined);

    await assert.rejects(
      context.service.publishForMaintainer(seeded.candidates[0].id, "CA"),
      /ratings\.archive|Gate B validation failed/i,
    );

    writtenShows = readShowsFile(context.siteRoot);
    assert.equal(writtenShows.find((show) => show.id === draftShowId)?.status, "draft");

    const publishReadyShows = writtenShows.map((show) => {
      if (show.id !== draftShowId) {
        return show;
      }

      return {
        ...show,
        ratings: {
          archive: 7,
        },
        tones: ["dark"],
        formats: ["full-cast"],
        bestFor: ["easy-entry"],
        similarTo: ["alpha-show", "beta-show", "gamma-show"],
        similarReasons: {
          "alpha-show": "Shares the same closed-system sci-fi tension.",
          "beta-show": "Leans on the same atmospheric character focus.",
          "gamma-show": "Feels similarly serialized and immersive.",
        },
      };
    });
    writeJson(path.join(context.siteRoot, "data", "shows.json"), publishReadyShows);

    const publishReadyCollections = createBaselineCollections([...showIds, draftShowId]);
    writeJson(path.join(context.siteRoot, "data", "collections.json"), publishReadyCollections);

    await validateSiteData(context.siteRoot);

    const published = await context.service.publishForMaintainer(seeded.candidates[0].id, "CA");
    assert.equal(published.candidate.status, "published");
    assert.equal(published.showId, draftShowId);

    const finalShows = readShowsFile(context.siteRoot);
    assert.equal(finalShows.find((show) => show.id === draftShowId)?.status, "published");
  } finally {
    cleanupTempImportContext(context);
  }
});
