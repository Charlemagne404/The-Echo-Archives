const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { loadCatalog, loadCollections, resolveCollectionView, scoreCatalog } = require("../lib/catalog");
const { buildFallbackAnswer, sanitizeAnswerText } = require("../lib/ai/chat");
const { validateSiteData } = require("../scripts/review-helpers");

const siteRoot = path.resolve(__dirname, "../..");

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function createTempSiteRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "echo-archives-catalog-"));
}

function createShowRecord(overrides = {}) {
  return {
    id: "demo-show",
    title: "Demo Show",
    description: "A demo archive description.",
    cover: "images/Logo.png",
    coverAlt: "Demo Show cover art",
    status: "published",
    reviewStatus: "indexed-only",
    releaseStatus: "completed",
    completionStatus: "finished",
    listenLinks: {
      website: "https://example.com",
    },
    genres: ["sci-fi"],
    tones: ["dark"],
    formats: ["full-cast"],
    tags: ["Time travel"],
    ratings: {
      archive: 8,
    },
    bestFor: ["easy-entry"],
    similarTo: [],
    archiveTake: "Worth indexing.",
    spoilerFreeReview: "",
    thoughts: "",
    quote: {
      text: "",
      attribution: "",
    },
    updatedAt: "2026-06-02",
    ...overrides,
  };
}

test("loadCatalog reads the structured show catalog", async () => {
  const catalog = await loadCatalog(siteRoot);
  const impactWinter = catalog.find((entry) => entry.title === "Impact Winter");
  const ids = new Set(catalog.map((entry) => entry.id));

  assert.equal(catalog.length, 48);
  assert.equal(ids.size, 48);
  assert.ok(impactWinter);
  assert.equal(impactWinter.finalRating, 10);
  assert.equal(impactWinter.hasPage, true);
  assert.equal(impactWinter.href, "/show?id=impact-winter");
  assert.match(impactWinter.summary, /endless winter/i);
  assert.ok(Array.isArray(impactWinter.spoilerFreeReviewParagraphs));
});

test("loadCollections reads curated collections against the catalog ids", async () => {
  const catalog = await loadCatalog(siteRoot);
  const collections = loadCollections(siteRoot, new Set(catalog.map((entry) => entry.id)));

  assert.equal(collections.length, 26);
  assert.ok(collections.every((collection) => collection.showIds.length > 0));
});

test("resolveCollectionView returns published shows for a known collection", () => {
  const collection = {
    id: "test-collection",
    title: "Test collection",
    description: "Description",
    showIds: ["published-show", "draft-show"],
  };
  const catalog = [
    { id: "published-show", status: "published", title: "Published Show" },
    { id: "draft-show", status: "draft", title: "Draft Show" },
  ];

  const result = resolveCollectionView({
    catalog,
    collections: [collection],
    collectionId: "test-collection",
  });

  assert.equal(result.collection.id, "test-collection");
  assert.deepEqual(result.shows.map((show) => show.id), ["published-show"]);
});

test("resolveCollectionView rejects unknown collections", () => {
  assert.throws(
    () => {
      resolveCollectionView({
        catalog: [],
        collections: [],
        collectionId: "missing-collection",
      });
    },
    {
      message: /unknown collection/i,
    },
  );
});

test("scoreCatalog ranks relevant matches first", async () => {
  const catalog = await loadCatalog(siteRoot);
  const results = scoreCatalog(catalog, "I want a sci-fi survival show with vampires");

  assert.ok(results.length > 0);
  assert.equal(results[0].title, "Impact Winter");
  assert.ok(results.every((show) => show.genres.includes("sci-fi")));
  assert.ok(results.every((show) => /survival/i.test(show.searchText)));
  assert.ok(results.every((show) => /vampire/i.test(show.searchText)));
});

test("scoreCatalog matches natural discovery phrases across status, intent, and similarity", async () => {
  const catalog = await loadCatalog(siteRoot);

  const completedSciFi = scoreCatalog(catalog, "completed sci fi");
  assert.ok(completedSciFi.length > 0);
  assert.equal(completedSciFi[0].completionStatus, "finished");
  assert.ok(completedSciFi[0].genres.includes("sci-fi"));
  assert.ok(completedSciFi.every((show) => show.completionStatus === "finished" && show.genres.includes("sci-fi")));

  const easyEntry = scoreCatalog(catalog, "easy entry");
  assert.ok(easyEntry.length > 0);
  assert.ok(easyEntry[0].bestFor.includes("easy-entry"));

  const longWalks = scoreCatalog(catalog, "long walks");
  assert.ok(longWalks.length > 0);
  assert.ok(longWalks[0].bestFor.includes("long-walks"));

  const fullCastHorror = scoreCatalog(catalog, "full cast horror");
  assert.ok(fullCastHorror.length > 0);
  assert.ok(fullCastHorror[0].formats.includes("full-cast"));
  assert.ok(fullCastHorror[0].genres.includes("horror"));
  assert.ok(fullCastHorror.every((show) => show.formats.includes("full-cast")));
  assert.ok(fullCastHorror.every((show) => /horror/i.test(show.searchText)));

  const similarToMidnightBurger = scoreCatalog(catalog, "like Midnight Burger");
  assert.ok(similarToMidnightBurger.length > 0);
  assert.notEqual(similarToMidnightBurger[0].title, "Midnight Burger");
  assert.ok(["Welcome to Night Vale", "Midst", "Wolf 359", "The Waystation", "Desert Skies"].includes(similarToMidnightBurger[0].title));
  assert.ok(similarToMidnightBurger.every((show) => show.id !== "midnight-burger"));

  const directTitle = scoreCatalog(catalog, "derelict");
  assert.ok(directTitle.length > 0);
  assert.equal(directTitle[0].title, "Derelict");
});

test("scoreCatalog now uses richer metadata like creators and source material", async () => {
  const catalog = await loadCatalog(siteRoot);

  const creatorMatch = scoreCatalog(catalog, "Jared Carter");
  assert.ok(creatorMatch.length > 0);
  assert.equal(creatorMatch[0].title, "Desert Skies");

  const sourceMaterialMatch = scoreCatalog(catalog, "based on the novel");
  assert.ok(sourceMaterialMatch.length > 0);
  assert.equal(sourceMaterialMatch[0].title, "The Phenomenon");
});

test("scoreCatalog tolerates close spelling mistakes and returns highlight metadata", async () => {
  const catalog = await loadCatalog(siteRoot);

  const fuzzyTitleMatch = scoreCatalog(catalog, "derelct");
  assert.ok(fuzzyTitleMatch.length > 0);
  assert.equal(fuzzyTitleMatch[0].title, "Derelict");
  assert.ok(fuzzyTitleMatch[0].searchPresentation.titleTerms.includes("derelict"));

  const fuzzyCreatorMatch = scoreCatalog(catalog, "Jared Cartr");
  assert.ok(fuzzyCreatorMatch.length > 0);
  assert.equal(fuzzyCreatorMatch[0].title, "Desert Skies");
  assert.match(fuzzyCreatorMatch[0].searchPresentation.metaText, /Creator:\s*Jared Carter/i);

  const fuzzyTagMatch = scoreCatalog(catalog, "vampres");
  assert.ok(fuzzyTagMatch.length > 0);
  assert.equal(fuzzyTagMatch[0].title, "Impact Winter");
  assert.match(fuzzyTagMatch[0].searchPresentation.metaText, /Tag:\s*Vampires/i);
});

test("scoreCatalog supports structured recommendation constraints", async () => {
  const catalog = await loadCatalog(siteRoot);

  const finishedMidnightBurgerNeighbors = scoreCatalog(catalog, "Recommend something like Midnight Burger but finished", {
    seedShowId: "midnight-burger",
    requiredFields: {
      completionStatus: ["finished"],
    },
  });
  assert.ok(finishedMidnightBurgerNeighbors.length > 0);
  assert.ok(["Wolf 359", "Midst"].includes(finishedMidnightBurgerNeighbors[0].title));
  assert.ok(finishedMidnightBurgerNeighbors.some((show) => show.title === "Midst"));
  assert.ok(finishedMidnightBurgerNeighbors.every((show) => show.completionStatus === "finished"));

  const mysteryOutsideHowIDiedLane = scoreCatalog(catalog, "Recommend a mystery", {
    excludeIds: ["how-i-died", "paralyzed", "the-white-vault"],
    avoidSimilaritySeedIds: ["how-i-died"],
    requiredFields: {
      genres: ["mystery"],
    },
  });
  assert.ok(mysteryOutsideHowIDiedLane.length > 0);
  assert.ok(mysteryOutsideHowIDiedLane.every((show) => show.genres.includes("mystery")));
  assert.ok(mysteryOutsideHowIDiedLane.every((show) => !["how-i-died", "paralyzed", "the-white-vault"].includes(show.id)));
});

test("loadCatalog merges companion review files into the returned show record", async () => {
  const tempRoot = createTempSiteRoot();
  const dataRoot = path.join(tempRoot, "data");
  const imagesRoot = path.join(tempRoot, "images");

  fs.mkdirSync(imagesRoot, { recursive: true });
  fs.copyFileSync(path.join(siteRoot, "images", "Logo.png"), path.join(imagesRoot, "Logo.png"));

  writeJson(path.join(dataRoot, "shows.json"), [
    createShowRecord({
      reviewStatus: "full-review",
      archiveTake: "",
      spoilerFreeReview: "",
    }),
  ]);
  writeJson(path.join(dataRoot, "reviews", "demo-show.json"), {
    archiveTake: "Companion archive take.",
    spoilerFreeReview: ["First paragraph.", "Second paragraph."],
    thoughts: ["Archive reaction paragraph."],
    quote: {
      text: "Optional quote",
      attribution: "Archive note",
    },
  });

  const [show] = await loadCatalog(tempRoot);

  assert.equal(show.archiveTake, "Companion archive take.");
  assert.equal(show.spoilerFreeReview, "First paragraph. Second paragraph.");
  assert.deepEqual(show.spoilerFreeReviewParagraphs, ["First paragraph.", "Second paragraph."]);
  assert.deepEqual(show.thoughtsParagraphs, ["Archive reaction paragraph."]);

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("draft shows may omit ratings.archive during catalog load", async () => {
  const tempRoot = createTempSiteRoot();
  const dataRoot = path.join(tempRoot, "data");

  writeJson(
    path.join(dataRoot, "shows.json"),
    [
      createShowRecord({
        status: "draft",
        ratings: {},
        tones: [],
        formats: [],
        bestFor: [],
      }),
    ],
  );
  writeJson(path.join(dataRoot, "collections.json"), []);

  const [show] = await loadCatalog(tempRoot);
  assert.equal(show.status, "draft");

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("published shows may omit ratings.archive during catalog load", async () => {
  const tempRoot = createTempSiteRoot();
  const dataRoot = path.join(tempRoot, "data");

  writeJson(
    path.join(dataRoot, "shows.json"),
    [
      createShowRecord({
        ratings: {},
      }),
    ],
  );
  writeJson(path.join(dataRoot, "collections.json"), []);

  const [show] = await loadCatalog(tempRoot);
  assert.equal(show.status, "published");
  assert.equal(show.finalRating, null);

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("catalog load rejects out-of-range ratings", async () => {
  const tempRoot = createTempSiteRoot();
  const dataRoot = path.join(tempRoot, "data");

  writeJson(
    path.join(dataRoot, "shows.json"),
    [
      createShowRecord({
        ratings: {
          archive: 11,
        },
      }),
    ],
  );
  writeJson(path.join(dataRoot, "collections.json"), []);

  await assert.rejects(loadCatalog(tempRoot), /out-of-range ratings\.archive/i);

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("catalog load rejects impossible date-only values", async () => {
  const tempRoot = createTempSiteRoot();
  const dataRoot = path.join(tempRoot, "data");

  writeJson(
    path.join(dataRoot, "shows.json"),
    [
      createShowRecord({
        updatedAt: "2026-02-31",
      }),
    ],
  );
  writeJson(path.join(dataRoot, "collections.json"), []);

  await assert.rejects(loadCatalog(tempRoot), /invalid updatedAt/i);

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("collections reject duplicate show references", () => {
  const tempRoot = createTempSiteRoot();
  const dataRoot = path.join(tempRoot, "data");

  writeJson(path.join(dataRoot, "shows.json"), [createShowRecord()]);
  writeJson(path.join(dataRoot, "collections.json"), [
    {
      id: "duplicate-route",
      title: "Duplicate route",
      description: "Contains duplicated show references.",
      showIds: ["demo-show", "demo-show"],
      updatedAt: "2026-06-30",
    },
  ]);

  assert.throws(
    () => loadCollections(tempRoot, new Set(["demo-show"])),
    /duplicate showIds value/i,
  );

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("published shows still fail Gate B validation when discovery fields are missing", async () => {
  const tempRoot = createTempSiteRoot();
  const dataRoot = path.join(tempRoot, "data");

  writeJson(
    path.join(dataRoot, "shows.json"),
    [
      createShowRecord({
        ratings: {
          archive: 8,
        },
        tones: [],
        formats: [],
        similarTo: [],
        bestFor: [],
      }),
    ],
  );
  writeJson(path.join(dataRoot, "collections.json"), []);

  await assert.rejects(validateSiteData(tempRoot), /Gate B validation failed/i);

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("companion review content overrides stale inline review fields", async () => {
  const tempRoot = createTempSiteRoot();
  const dataRoot = path.join(tempRoot, "data");
  const imagesRoot = path.join(tempRoot, "images");

  fs.mkdirSync(imagesRoot, { recursive: true });
  fs.copyFileSync(path.join(siteRoot, "images", "Logo.png"), path.join(imagesRoot, "Logo.png"));

  writeJson(path.join(dataRoot, "shows.json"), [
    createShowRecord({
      reviewStatus: "full-review",
      archiveTake: "Old inline take.",
      spoilerFreeReview: "Old inline review.",
      thoughts: "Old inline thoughts.",
    }),
  ]);
  writeJson(path.join(dataRoot, "reviews", "demo-show.json"), {
    archiveTake: "Fresh companion take.",
    spoilerFreeReview: ["Fresh companion review."],
    thoughts: ["Fresh companion thoughts."],
  });

  const [show] = await loadCatalog(tempRoot);

  assert.equal(show.archiveTake, "Fresh companion take.");
  assert.equal(show.spoilerFreeReview, "Fresh companion review.");
  assert.equal(show.thoughts, "Fresh companion thoughts.");

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("loadCatalog preserves richer optional metadata for future show-page use", async () => {
  const tempRoot = createTempSiteRoot();
  const dataRoot = path.join(tempRoot, "data");
  const imagesRoot = path.join(tempRoot, "images");

  fs.mkdirSync(imagesRoot, { recursive: true });
  fs.copyFileSync(path.join(siteRoot, "images", "Logo.png"), path.join(imagesRoot, "Logo.png"));

  writeJson(path.join(dataRoot, "shows.json"), [
    createShowRecord({
      aliases: [" Demo Show ", "The Demo Show"],
      themes: ["Isolation", "Hope"],
      contentNotes: ["Loud audio spikes"],
      languages: ["English"],
      transcriptLanguages: ["English"],
      cast: [" Actor One ", "Actor Two"],
      creators: ["Creator One"],
      creatorId: "creator-display",
      networkId: "network-display",
      officialLinks: {
        website: "https://official.example.com",
        discord: "https://discord.gg/example",
      },
      releaseDates: {
        first: "2024-01-02",
        latest: "2024-06-03",
      },
      facts: {
        narrator: "Single narrator",
        adBreaks: "mid-roll only",
      },
      credits: {
        network: "Network Display",
        writer: "Writer Name",
        cast: ["Actor One", "Actor Two"],
      },
      availability: {
        transcripts: "select episodes",
      },
      content: {
        setting: "deep space",
        intensity: "high",
      },
      verification: {
        status: "creator-verified",
        verifiedAt: "2026-06-02",
        note: "Facts only.",
      },
      metadata: {
        awards: ["Example Award"],
        schedule: {
          cadence: "seasonal",
        },
      },
    }),
  ]);

  const [show] = await loadCatalog(tempRoot);

  assert.deepEqual(show.aliases, ["Demo Show", "The Demo Show"]);
  assert.deepEqual(show.themes, ["Isolation", "Hope"]);
  assert.deepEqual(show.contentNotes, ["Loud audio spikes"]);
  assert.deepEqual(show.languages, ["English"]);
  assert.deepEqual(show.transcriptLanguages, ["English"]);
  assert.deepEqual(show.cast, ["Actor One", "Actor Two"]);
  assert.deepEqual(show.creators, ["Creator One"]);
  assert.equal(show.creatorId, "creator-display");
  assert.equal(show.networkId, "network-display");
  assert.equal(show.credits.network, "Network Display");
  assert.equal(show.officialLinks.discord, "https://discord.gg/example");
  assert.equal(show.releaseDates.first, "2024-01-02");
  assert.equal(show.releaseDates.latest, "2024-06-03");
  assert.equal(show.facts.narrator, "Single narrator");
  assert.deepEqual(show.credits.cast, ["Actor One", "Actor Two"]);
  assert.equal(show.availability.transcripts, "select episodes");
  assert.equal(show.content.setting, "deep space");
  assert.equal(show.verification.status, "creator-verified");
  assert.equal(show.metadata.schedule.cadence, "seasonal");

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("loadCatalog rejects deprecated show aliases so schema drift cannot return", async () => {
  const aliases = [
    ["creatorName", "Creator Display"],
    ["networkName", "Network Display"],
    ["firstRelease", "2024-01-02"],
    ["firstReleasedAt", "2024-01-02"],
    ["latestRelease", "2024-06-03"],
    ["lastReleasedAt", "2024-06-03"],
    ["reviewFile", "reviews/demo-show.json"],
  ];

  for (const [fieldName, fieldValue] of aliases) {
    const tempRoot = createTempSiteRoot();
    const dataRoot = path.join(tempRoot, "data");
    const imagesRoot = path.join(tempRoot, "images");

    fs.mkdirSync(imagesRoot, { recursive: true });
    fs.copyFileSync(path.join(siteRoot, "images", "Logo.png"), path.join(imagesRoot, "Logo.png"));

    writeJson(path.join(dataRoot, "shows.json"), [
      createShowRecord({
        [fieldName]: fieldValue,
      }),
    ]);

    await assert.rejects(
      async () => {
        await loadCatalog(tempRoot);
      },
      {
        message: new RegExp(`deprecated field "${fieldName}"`, "i"),
      },
    );

    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("full-review validation still fails when neither inline nor companion rich content exists", async () => {
  const tempRoot = createTempSiteRoot();
  const dataRoot = path.join(tempRoot, "data");
  const imagesRoot = path.join(tempRoot, "images");

  fs.mkdirSync(imagesRoot, { recursive: true });
  fs.copyFileSync(path.join(siteRoot, "images", "Logo.png"), path.join(imagesRoot, "Logo.png"));

  writeJson(path.join(dataRoot, "shows.json"), [
    createShowRecord({
      reviewStatus: "full-review",
      archiveTake: "",
      spoilerFreeReview: "",
    }),
  ]);

  await assert.rejects(
    async () => {
      await loadCatalog(tempRoot);
    },
    {
      message: /full-review without richer review content/i,
    },
  );

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("fallback answer asks for specificity when no clear match exists", () => {
  const answer = buildFallbackAnswer("hi", []);

  assert.match(answer, /finished or ongoing|mood|theme/i);
});

test("fallback answer now includes grounded recommendation detail", () => {
  const answer = buildFallbackAnswer("Recommend a finished sci-fi show", [
    {
      title: "Impact Winter",
      reasons: ["fits sci fi", "good for long walks"],
      bestFor: ["long-walks"],
      tags: ["Sci-fi", "Horror"],
      tones: ["tense", "cinematic"],
      formats: ["full-cast"],
      genres: ["sci-fi", "horror"],
      completionStatus: "finished",
      finalRating: 10,
      archiveTake: "A high-confidence recommendation when someone wants scope without losing warmth.",
      summary: "A cold-world survival drama.",
    },
    {
      title: "Derelict",
      reasons: ["fits sci fi"],
      bestFor: [],
      tags: ["Sci-fi"],
      tones: ["tense"],
      formats: ["full-cast"],
      genres: ["sci-fi"],
      completionStatus: "ongoing",
      finalRating: 9,
      archiveTake: "",
      summary: "A survival-forward sci-fi drama.",
    },
  ]);

  assert.match(answer, /Impact Winter is (?:the strongest fit|probably your best next stop)|Impact Winter looks like the cleanest archive match/i);
  assert.match(answer, /finished|tagged/i);
  assert.match(answer, /Derelict/i);
});

test("sanitizeAnswerText removes generic model framing", () => {
  const answer = sanitizeAnswerText(
    "Based on your request, try Impact Winter. It fits sci-fi survival well. Enjoy your journey through the archive!",
    "Fallback answer.",
  );

  assert.equal(answer, "Fallback answer.");
});
