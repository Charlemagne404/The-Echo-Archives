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
    description: "A source-backed demo description with enough detail to support trustworthy archive discovery and validation.",
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
    tags: ["Time travel", "Sci-fi"],
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

  assert.ok(catalog.length >= 68);
  assert.equal(ids.size, catalog.length);
  assert.ok(impactWinter);
  assert.equal(impactWinter.finalRating, 10);
  assert.equal(impactWinter.hasPage, true);
  assert.equal(impactWinter.href, "/shows/impact-winter");
  assert.match(impactWinter.summary, /devastating winter/i);
  assert.ok(Array.isArray(impactWinter.spoilerFreeReviewParagraphs));
});

test("importer-origin catalogue entries retain their publication tier", () => {
  const authoredShows = JSON.parse(fs.readFileSync(path.join(siteRoot, "data", "shows.json"), "utf8"));
  const importerOrigin = authoredShows.filter((show) => show.metadata?.import);
  assert.equal(importerOrigin.length, 618);
  assert.equal(importerOrigin.filter((show) => show.reviewStatus === "indexed-only").length, 133);
  assert.equal(importerOrigin.filter((show) => show.reviewStatus === "imported").length, 485);
  assert.ok(importerOrigin.every((show) => ["indexed-only", "imported"].includes(show.reviewStatus)));
});

test("confirmed broken external destinations are not reintroduced", async () => {
  const catalog = await loadCatalog(siteRoot);
  const byId = new Map(catalog.map((show) => [show.id, show]));
  const urls = catalog.flatMap((show) => [
    ...Object.values(show.listenLinks || {}),
    ...Object.values(show.officialLinks || {}),
    ...(show.metadata?.socialUrls || []),
  ]);
  const retiredUrls = [
    "https://podcasts.apple.com/us/podcast/death-by-dying/",
    "https://desertskiespodcast.com/merch/",
    "https://www.planetm.io/eos10/",
    "https://podcasts.apple.com/us/podcast/impact-winter/id1605294203",
    "https://www.youtube.com/@weopenatsix",
    "https://www.martletradio.com/",
    "https://www.redvalleypod.com/shop.html",
    "https://podcasts.apple.com/us/podcast/the-deca-tapes/id1478571412",
    "https://redcircle.com/shows/the-penumbra-podcast",
    "https://podcasts.apple.com/us/podcast/the-phenomenon/id1291807225",
    "https://www.youtube.com/@FoolandScholar",
    "https://www.werealive.com/shop/",
    "http://twitter.com/@CopperheartPod",
    "http://twitter.com/woebegonepod",
    "https://open.spotify.com/show/0RRSDPSo4fDJI5g7iHbJTy",
    "https://open.spotify.com/show/1Jx1PpUmJrZgM68re3zMjJ",
    "https://open.spotify.com/show/6S8iYyZ3eg9vP1Dcg9E0I3",
    "https://open.spotify.com/show/6zCjlwfTyQ8grdlLIW4EAq",
    "https://thestoragepapers.com/",
    "https://www.thestoragepapers.com/",
    "https://www.malevolent.ca/",
    "https://www.patreon.com/cdn-cgi/content?id=daQbmk8mj5khNir34t2HverWEM141QES33ciWjJ5A64-1784636557.7980247-1.2.1.1-luLQS_M54uo5nE_8r1GeRe9gsc8UFYQxoTOEfUD5drk",
    "https://www.patreon.com/cdn-cgi/content?id=VtqbRQEhdt47Y0HMr3CAWSx5.Z8KwQXTq6lmE4KoQuQ-1784636556.3692062-1.2.1.1-muo2cq8DHX1beir_kYCikkt0KUa44WS500rTSOCWO2o",
    "https://www.spectrepod.com/1-1-a-way-out/",
  ];

  for (const retiredUrl of retiredUrls) {
    assert.ok(!urls.includes(retiredUrl), `retired external destination returned: ${retiredUrl}`);
  }

  assert.equal(byId.get("death-by-dying").listenLinks.apple, "https://podcasts.apple.com/us/podcast/death-by-dying/id1437812269");
  assert.equal(byId.get("desert-skies").officialLinks.merch, "https://desertskiespodcast.com/shop/");
  assert.equal(byId.get("the-deca-tapes").listenLinks.apple, "https://podcasts.apple.com/us/podcast/the-deca-tapes/id1455127076");
  assert.equal(byId.get("the-penumbra-podcast").officialLinks.website, "https://www.thepenumbrapodcast.com/");
  assert.equal(byId.get("the-phenomenon").listenLinks.apple, "https://podcasts.apple.com/us/podcast/the-phenomenon/id1291807221");
  assert.equal(byId.get("the-white-vault").officialLinks.youtube, "https://www.youtube.com/channel/UCPaOxWK6Wau96cfG0cCwxQA");
  assert.equal(byId.get("copperheart-a-riggstories-audio-drama").officialLinks.social, "https://x.com/CopperheartPod");
  assert.equal(byId.get("woe-begone").officialLinks.social, "https://x.com/woebegonepod");
  assert.equal(byId.get("derelict").listenLinks.spotify, "https://open.spotify.com/show/0RRsd7061dikIOv6WbhmDS");
  assert.equal(byId.get("from-now").listenLinks.spotify, "https://open.spotify.com/show/1t2hGRFzuVraNXtwdPAYNS");
  assert.equal(byId.get("the-deca-tapes").listenLinks.spotify, "https://open.spotify.com/show/6S8iYgJibdA6xkVQnVVo7b");
  assert.equal(byId.get("ars-paradoxica").listenLinks.spotify, "https://open.spotify.com/show/6pRM9esVLZ1gIFZYPzdMDh");
  assert.equal(byId.get("the-storage-papers").listenLinks.website, undefined);
  assert.equal(byId.get("the-storage-papers").officialLinks.website, undefined);
  assert.equal(byId.get("malevolent").listenLinks.website, "https://shows.acast.com/malevolent");
  assert.equal(byId.get("the-town-whispers").officialLinks.patreon, "https://www.patreon.com/pulpaudio");
  assert.equal(byId.get("the-milkman-of-st-gaffs").officialLinks.patreon, "https://www.patreon.com/cw/howiemilkman");
  assert.equal(
    byId.get("spectre").listenLinks.start,
    "https://podcasts.apple.com/ca/podcast/1-01-a-way-out/id1593110598?i=1000563131302",
  );
});

test("optional start-listening links accept absolute URLs and reject invalid values", async () => {
  const tempRoot = createTempSiteRoot();
  const dataRoot = path.join(tempRoot, "data");
  const validShow = createShowRecord({
    listenLinks: {
      website: "https://example.com",
      start: "https://example.com/season-one",
    },
  });

  writeJson(path.join(dataRoot, "shows.json"), [validShow]);
  writeJson(path.join(dataRoot, "collections.json"), []);
  const [loadedShow] = await loadCatalog(tempRoot);
  assert.equal(loadedShow.listenLinks.start, "https://example.com/season-one");

  writeJson(path.join(dataRoot, "shows.json"), [createShowRecord({
    listenLinks: { website: "https://example.com", start: "not-an-absolute-url" },
  })]);
  await assert.rejects(loadCatalog(tempRoot), /invalid listenLinks\.start URL/i);

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("published catalog records require approved discovery signals instead of filler tags", async () => {
  const tempRoot = createTempSiteRoot();
  const dataRoot = path.join(tempRoot, "data");
  writeJson(path.join(dataRoot, "collections.json"), []);

  writeJson(path.join(dataRoot, "shows.json"), [createShowRecord({ formats: [], tags: [] })]);
  await assert.rejects(loadCatalog(tempRoot), /at least 2 approved discovery signals/i);

  writeJson(path.join(dataRoot, "shows.json"), [createShowRecord({ tags: ["Drama", "Mystery"] })]);
  await assert.rejects(loadCatalog(tempRoot), /redundant discovery tag "Drama"/i);

  writeJson(path.join(dataRoot, "shows.json"), [createShowRecord({ tags: ["Science Fiction", "Space"] })]);
  await assert.rejects(loadCatalog(tempRoot), /canonical discovery tag "Sci-fi"/i);

  writeJson(path.join(dataRoot, "shows.json"), [createShowRecord({ tags: ["Funeral directors", "Space"] })]);
  await assert.rejects(loadCatalog(tempRoot), /unapproved discovery tag "Funeral directors"/i);

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("published catalog records reject noisy or noncanonical discovery tags", async () => {
  const tempRoot = createTempSiteRoot();
  const dataRoot = path.join(tempRoot, "data");
  writeJson(path.join(dataRoot, "collections.json"), []);

  writeJson(path.join(dataRoot, "shows.json"), [createShowRecord({ tags: ["One", "Two", "Three", "Four", "Five", "Six", "Seven"] })]);
  await assert.rejects(loadCatalog(tempRoot), /no more than 4 discovery tags/i);

  writeJson(path.join(dataRoot, "shows.json"), [createShowRecord({ tags: ["time travel", "Space"] })]);
  await assert.rejects(loadCatalog(tempRoot), /canonical discovery tag "Time travel"/i);

  writeJson(path.join(dataRoot, "shows.json"), [createShowRecord({ tags: ["Demo Show", "Space"] })]);
  await assert.rejects(loadCatalog(tempRoot), /own title as a discovery tag/i);

  writeJson(path.join(dataRoot, "shows.json"), [createShowRecord({ tags: ["Audio dramas", "Space"] })]);
  await assert.rejects(loadCatalog(tempRoot), /redundant discovery tag "Audio dramas"/i);

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("published catalog records require complete objective discovery metadata", async () => {
  const tempRoot = createTempSiteRoot();
  const dataRoot = path.join(tempRoot, "data");
  writeJson(path.join(dataRoot, "collections.json"), []);

  writeJson(path.join(dataRoot, "shows.json"), [createShowRecord({ description: "Demo Show" })]);
  await assert.rejects(loadCatalog(tempRoot), /source-backed description of at least 40 characters/i);

  writeJson(path.join(dataRoot, "shows.json"), [createShowRecord({ genres: [] })]);
  await assert.rejects(loadCatalog(tempRoot), /at least one canonical genre/i);

  writeJson(path.join(dataRoot, "shows.json"), [createShowRecord({ genres: ["Science Fiction"] })]);
  await assert.rejects(loadCatalog(tempRoot), /unsupported genre "Science Fiction"/i);

  writeJson(path.join(dataRoot, "shows.json"), [createShowRecord({ listenLinks: { website: "https://patreon.com/demo" } })]);
  await assert.rejects(loadCatalog(tempRoot), /social or support profile as a website/i);

  writeJson(path.join(dataRoot, "shows.json"), [createShowRecord({
    listenLinks: { apple: "https://podcasts.apple.com/us/podcast/demo/id222222" },
    metadata: { import: { identifiers: { appleCollectionId: "111111" } } },
  })]);
  await assert.rejects(loadCatalog(tempRoot), /Apple listen link does not match imported collection id/i);

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("loadCollections reads curated collections against the catalog ids", async () => {
  const catalog = await loadCatalog(siteRoot);
  const collections = loadCollections(siteRoot, new Set(catalog.map((entry) => entry.id)));
  const similarityCollections = collections.filter((collection) => collection.kind === "similarity");

  assert.equal(collections.length, 29);
  assert.ok(collections.every((collection) => collection.showIds.length > 0));
  assert.ok(similarityCollections.length > 0);
  assert.ok(similarityCollections.every((collection) => typeof collection.anchorShowId === "string" && collection.anchorShowId));
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
  assert.ok(completedSciFi.every((show) => show.genres.includes("sci-fi")));

  const easyEntry = scoreCatalog(catalog, "easy entry");
  assert.ok(easyEntry.length > 0);
  assert.ok(easyEntry[0].bestFor.includes("easy-entry"));

  const longWalks = scoreCatalog(catalog, "long walks");
  assert.ok(longWalks.length > 0);
  assert.ok(longWalks.some((show) => show.bestFor.includes("long-walks")));

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

test("generic discovery slightly prefers human-reviewed peers while exact Imported titles stay dominant", () => {
  const base = createShowRecord({
    description: "A mystery signal audio drama with a source-backed publisher description.",
    genres: ["mystery"],
    tags: ["Mystery", "Found audio"],
    formats: ["serialized"],
    tones: [],
    ratings: {},
    bestFor: [],
    archiveTake: "",
  });
  const imported = { ...base, id: "alpha-signal", title: "Alpha Signal", reviewStatus: "imported" };
  const reviewed = { ...base, id: "bravo-signal", title: "Bravo Signal", reviewStatus: "indexed-only" };

  const generic = scoreCatalog([imported, reviewed], "mystery signal");
  assert.equal(generic[0].id, "bravo-signal");

  const direct = scoreCatalog([imported, reviewed], "Alpha Signal");
  assert.equal(direct[0].id, "alpha-signal");
});

test("Archivist fallback discloses the Imported tier for recommendations", () => {
  const match = {
    ...createShowRecord({ reviewStatus: "imported", ratings: {}, archiveTake: "", bestFor: [], tones: [] }),
    href: "/shows/demo-show",
    finalRating: null,
    summary: "A factual publisher summary.",
    reasons: ["matches mystery"],
  };
  assert.match(buildFallbackAnswer("Recommend a mystery", [match]), /Imported entry.*source checked by automation.*not been individually reviewed/i);
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

test("similarity collections require anchorShowId", () => {
  const tempRoot = createTempSiteRoot();
  const dataRoot = path.join(tempRoot, "data");

  writeJson(path.join(dataRoot, "shows.json"), [createShowRecord()]);
  writeJson(path.join(dataRoot, "collections.json"), [
    {
      id: "shows-like-demo-show",
      title: "Shows like Demo Show",
      description: "Similarity route without anchor.",
      kind: "similarity",
      showIds: ["demo-show"],
      updatedAt: "2026-06-30",
    },
  ]);

  assert.throws(
    () => loadCollections(tempRoot, new Set(["demo-show"])),
    /must include anchorShowId/i,
  );

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("similarity collections reject unknown anchorShowId", () => {
  const tempRoot = createTempSiteRoot();
  const dataRoot = path.join(tempRoot, "data");

  writeJson(path.join(dataRoot, "shows.json"), [createShowRecord()]);
  writeJson(path.join(dataRoot, "collections.json"), [
    {
      id: "shows-like-demo-show",
      title: "Shows like Demo Show",
      description: "Similarity route with missing anchor.",
      kind: "similarity",
      anchorShowId: "missing-show",
      showIds: ["demo-show"],
      updatedAt: "2026-06-30",
    },
  ]);

  assert.throws(
    () => loadCollections(tempRoot, new Set(["demo-show"])),
    /unknown anchorShowId/i,
  );

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("indexed-only factual records can publish without editorial discovery fields", async () => {
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

  await assert.doesNotReject(validateSiteData(tempRoot));

  const authoredShowPath = path.join(tempRoot, "catalog-src/shows/demo-show.json");
  const authoredShow = JSON.parse(fs.readFileSync(authoredShowPath, "utf8"));
  authoredShow.reviewStatus = "spotlight";
  writeJson(authoredShowPath, authoredShow);
  await assert.rejects(validateSiteData(tempRoot), /Gate B validation failed/i);

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("Imported records require automated provenance and reject archive editorial fields", async () => {
  const tempRoot = createTempSiteRoot();
  const dataRoot = path.join(tempRoot, "data");
  const imported = createShowRecord({
    reviewStatus: "imported",
    ratings: {},
    tones: [],
    themes: [],
    contentNotes: [],
    bestFor: [],
    similarTo: [],
    similarReasons: {},
    archiveTake: "",
    spoilerFreeReview: "",
    thoughts: "",
    featured: false,
    verification: { status: "automated-source-checked", source: "https://example.com/feed.xml" },
    metadata: { import: { pipelineVersion: "2", identifiers: { rssUrl: "https://example.com/feed.xml" } } },
  });
  writeJson(path.join(dataRoot, "shows.json"), [imported]);
  writeJson(path.join(dataRoot, "collections.json"), []);

  await assert.doesNotReject(validateSiteData(tempRoot));

  const authoredShowPath = path.join(tempRoot, "catalog-src/shows/demo-show.json");
  const authoredShow = JSON.parse(fs.readFileSync(authoredShowPath, "utf8"));
  authoredShow.archiveTake = "An automated entry must not carry an archive verdict.";
  writeJson(authoredShowPath, authoredShow);
  await assert.rejects(validateSiteData(tempRoot), /imported but contains human-owned editorial fields: archiveTake/i);

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("published similar-show links require a public recommendation reason", async () => {
  const tempRoot = createTempSiteRoot();
  const dataRoot = path.join(tempRoot, "data");
  writeJson(path.join(dataRoot, "shows.json"), [
    createShowRecord({ id: "first-show", similarTo: ["second-show"], similarReasons: {} }),
    createShowRecord({ id: "second-show" }),
  ]);
  writeJson(path.join(dataRoot, "collections.json"), []);

  await assert.rejects(loadCatalog(tempRoot), /without a reason/i);
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
