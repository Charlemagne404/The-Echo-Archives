const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { performance } = require("node:perf_hooks");

const root = path.resolve(__dirname, "..");
const { createScaleDataset } = require("./lib/catalog-scale-fixtures");
const { createSearchIndexRecord, createRuntimeEvidenceRecord, serializeRuntimeShow } = require("./lib/catalog-artifacts");
const archiveSearch = require("../shared/archive-search");
const archiveSimilarity = require("../shared/archive-similarity");
const discovery = require("../shared/discovery");
const { createRequire } = require("node:module");

const SHOW_COUNT = Number(process.env.ECHO_SCALE_SHOWS || 7_520);
const WARMUPS = 3;
const RUNS = 24;
const QUERIES = [
  { name: "exact-title", query: "Synthetic Signal 00000" },
  { name: "normal-text", query: "synthetic benchmark fixture" },
  { name: "normal-facet-search", query: "sci-fi" },
  { name: "structured-reference", query: "finished sci-fi" },
  { name: "structured-multi-criterion", query: "finished sci-fi under 10 hours" },
  { name: "similarity-plus-modifier", query: "shows like Synthetic Signal 00000 finished" },
  { name: "runtime-preference", query: "around 10 hours" },
  { name: "runtime-lookup", query: "exact runtime for Synthetic Signal 00000" },
  { name: "entity", query: "who created Synthetic Signal 00000" },
];

function elapsed(startedAt) {
  return performance.now() - startedAt;
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))] || 0;
}

function summarize(values) {
  return {
    medianMs: Number(percentile(values, 0.5).toFixed(3)),
    p95Ms: Number(percentile(values, 0.95).toFixed(3)),
  };
}

function memorySnapshot() {
  const memory = process.memoryUsage();
  const maxRss = process.resourceUsage().maxRSS;
  return {
    rssBytes: memory.rss,
    heapUsedBytes: memory.heapUsed,
    externalBytes: memory.external,
    maxRssBytes: maxRss * 1024,
  };
}

function createIntegratedDataset(size) {
  const dataset = createScaleDataset(size);
  const shows = dataset.shows.map((show, index) => {
    const entity = dataset.entities[Math.floor(index / 20)];
    const episodes = 10 + (index % 24);
    const avgEpisodeMinutes = 24 + (index % 8);
    show.completionStatus = index % 2 === 0 ? "finished" : "ongoing";
    show.releaseStatus = index % 2 === 0 ? "complete" : "active";
    show.tags = ["synthetic-scale", index % 2 === 0 ? "finished" : "ongoing"];
    show.length = {
      episodes,
      avgEpisodeMinutes,
      totalHours: Math.round((episodes * avgEpisodeMinutes / 60) * 10) / 10,
      durationCoverage: 1,
    };
    show.resolvedEntities = [entity];
    return show;
  });
  const runtimeShows = shows.map(serializeRuntimeShow);
  const searchCatalog = shows.map(createSearchIndexRecord);
  const runtimeEvidence = shows.map(createRuntimeEvidenceRecord);
  return { ...dataset, shows: runtimeShows, searchCatalog, runtimeEvidence };
}

function makeLibraryContext(size, shows) {
  const initialIds = [126, 127, 128, 129, 130];
  const used = new Set(initialIds);
  const indexes = [...initialIds];
  for (let step = 0; indexes.length < size && step < shows.length * 2; step += 1) {
    const index = (step * 41 + 617) % shows.length;
    if (!used.has(index)) {
      used.add(index);
      indexes.push(index);
    }
  }
  const states = ["saved", "listening", "finished", "dropped", "hidden"];
  return {
    enabled: true,
    entries: indexes.map((index, entryIndex) => {
      const entry = { showId: shows[index].id, state: states[entryIndex % states.length] };
      if (entryIndex % 4 === 1) entry.rating = [5, 4, 2, 1][Math.floor(entryIndex / 4) % 4];
      return entry;
    }),
  };
}

function instrumentSimilarityIndex(index) {
  const calls = { publicMatchCalls: 0, comparedPairs: 0, returnedMatches: 0 };
  const originalMatches = index.getPublicSimilarityMatches.bind(index);
  const originalCompare = index.compare.bind(index);
  index.getPublicSimilarityMatches = (...args) => {
    calls.publicMatchCalls += 1;
    const matches = originalMatches(...args);
    calls.returnedMatches += matches.length;
    return matches;
  };
  index.compare = (...args) => {
    calls.comparedPairs += 1;
    return originalCompare(...args);
  };
  return calls;
}

async function measureBrowser(searchIndexJson, runtimeJson, loadedShows) {
  const playwrightPath = path.join(root, "backend", "node_modules", "playwright");
  if (!fs.existsSync(playwrightPath)) throw new Error("Playwright is unavailable under backend/node_modules.");
  const requireFromPlaywright = createRequire(path.join(playwrightPath, "package.json"));
  const { chromium } = requireFromPlaywright("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    const cssPath = path.join(root, "home.css");
    const css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, "utf8") : "";
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>${css}\n.scale-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem;padding:.75rem}.scale-grid>*{min-width:0}</style><main class="home-page"><div id="scale-grid" class="scale-grid"></div></main>`);
    await page.addScriptTag({ path: path.join(root, "shared", "archive-search.js") });
    const browserData = await page.evaluate(({ searchJson, runtimeData }) => {
      const start = performance.now();
      const searchRecords = JSON.parse(searchJson);
      const parsedSearch = performance.now();
      const runtimeRecords = JSON.parse(runtimeData);
      const parsedRuntime = performance.now();
      const hydrated = window.EchoArchiveSearch.hydrateCatalogSearch(searchRecords);
      const hydratedAt = performance.now();
      const results = window.EchoArchiveSearch.scoreCatalog(hydrated, "sci-fi");
      const searchedAt = performance.now();
      return {
        searchRecordCount: searchRecords.length,
        runtimeRecordCount: runtimeRecords.length,
        ids: results.slice(0, 24).map((record) => record.id),
        parseSearchMs: parsedSearch - start,
        parseRuntimeMs: parsedRuntime - parsedSearch,
        hydrateMs: hydratedAt - parsedRuntime,
        searchMs: searchedAt - hydratedAt,
        heapBeforeBytes: performance.memory?.usedJSHeapSize ?? null,
      };
    }, { searchJson: searchIndexJson, runtimeData: runtimeJson });

    const byId = new Map(loadedShows.map((show) => [show.id, show]));
    const { renderCollectionShowCard } = require("./lib/home-page-prerender");
    const { ids } = browserData;
    const markupFor = (orderedIds) => orderedIds
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((show) => renderCollectionShowCard(show, "", {
        surface: "integrated-discovery-scale",
        resultType: "show_card",
        recommendationSource: "none",
      }))
      .join("");
    const firstMarkup = markupFor(ids);
    const secondMarkup = markupFor([...ids].reverse());
    const render = await page.evaluate(({ first, second }) => {
      const grid = document.querySelector("#scale-grid");
      const startRender = performance.now();
      grid.innerHTML = first;
      const firstRenderMs = performance.now() - startRender;
      const startUpdate = performance.now();
      grid.innerHTML = second;
      const updateMs = performance.now() - startUpdate;
      const box = grid.getBoundingClientRect();
      const overflowElements = [...document.querySelectorAll("body *")]
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName.toLowerCase(),
            className: typeof element.className === "string" ? element.className : "",
            right: Math.round(rect.right * 10) / 10,
            width: Math.round(rect.width * 10) / 10,
            scrollWidth: element.scrollWidth,
            clientWidth: element.clientWidth,
          };
        })
        .filter((element) => element.right > innerWidth + 1 || element.scrollWidth > element.clientWidth + 1)
        .slice(0, 12);
      return {
        cardCount: grid.children.length,
        firstRenderMs,
        updateMs,
        viewportWidth: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        gridWidth: box.width,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        overflowElements,
        heapAfterBytes: performance.memory?.usedJSHeapSize ?? null,
      };
    }, { first: firstMarkup, second: secondMarkup });
    return {
      viewport: "390x844 Chromium",
      searchJsonBytes: Buffer.byteLength(searchIndexJson),
      runtimeJsonBytes: Buffer.byteLength(runtimeJson),
      searchGzipBytes: zlib.gzipSync(searchIndexJson).byteLength,
      runtimeGzipBytes: zlib.gzipSync(runtimeJson).byteLength,
      ...browserData,
      ...render,
    };
  } finally {
    await browser.close();
  }
}

async function main() {
  if (!Number.isInteger(SHOW_COUNT) || SHOW_COUNT < 131) throw new Error("ECHO_SCALE_SHOWS must be an integer of at least 131.");
  if (typeof global.gc === "function") global.gc();
  const before = memorySnapshot();
  const data = createIntegratedDataset(SHOW_COUNT);
  const afterDataset = memorySnapshot();
  const similarityStarted = performance.now();
  const similarityIndex = archiveSimilarity.createSimilarityIndex({ shows: data.shows, collections: data.collections });
  const similarityBuildMs = elapsed(similarityStarted);
  const similarityCalls = instrumentSimilarityIndex(similarityIndex);
  const lengthById = new Map(data.runtimeEvidence.filter((entry) => entry.length).map((entry) => [entry.id, entry.length]));
  const similarityShows = data.searchCatalog.map((show) => {
    const length = lengthById.get(show.id);
    return length ? { ...show, length } : show;
  });
  const engineSamples = [];
  let engine;
  for (let sample = 0; sample < 5; sample += 1) {
    const started = performance.now();
    engine = discovery.createDiscoveryEngine({
      shows: data.shows,
      searchCatalog: similarityShows,
      collections: data.collections,
      entities: data.entities,
      similarityIndex,
      catalogueRevision: `integrated-scale-${SHOW_COUNT}`,
    });
    engineSamples.push(elapsed(started));
  }
  const engineConstruction = summarize(engineSamples);
  const afterEngine = memorySnapshot();

  const queryReports = [];
  for (const definition of QUERIES) {
    const parsed = engine.parse(definition.query);
    const timings = [];
    let result;
    for (let warm = 0; warm < WARMUPS; warm += 1) result = engine.retrieve(parsed);
    for (let sample = 0; sample < RUNS; sample += 1) {
      const started = performance.now();
      result = engine.retrieve(parsed);
      timings.push(elapsed(started));
    }
    queryReports.push({
      name: definition.name,
      query: definition.query,
      intentKind: parsed.kind,
      required: parsed.required,
      preferred: parsed.preferred,
      candidateCount: result.candidateIds.length,
      sectionCounts: Object.fromEntries(Object.entries(result.sections).map(([key, value]) => [key, value.length])),
      timing: summarize(timings),
    });
  }

  const exact = queryReports.find((report) => report.name === "exact-title");
  const exactResult = engine.retrieve(QUERIES[0].query);
  if (exactResult.candidateIds[0] !== "synthetic-show-00000") {
    throw new Error("Synthetic exact-title path did not preserve its exact result.");
  }
  const structuredResult = engine.retrieve("finished sci-fi under 10 hours");
  if (!structuredResult.candidateIds.length) throw new Error("Synthetic multi-criterion query produced no eligible results.");
  for (const entry of structuredResult.sections.shows) {
    const show = data.shows.find((candidate) => candidate.id === entry.id);
    if (show?.completionStatus !== "finished" || !show.genres.includes("sci-fi") || !(entry.runtime?.hours < 10)) {
      throw new Error(`Structured runtime result failed its public constraints: ${entry.id}.`);
    }
  }
  const runtimePreference = engine.retrieve("around 10 hours");
  if (runtimePreference.intent.kind !== "runtime-preference" || !runtimePreference.candidateIds.length) {
    throw new Error("Synthetic runtime preference did not resolve to qualified runtime results.");
  }
  const runtimeLookup = engine.retrieve("exact runtime for Synthetic Signal 00000");
  if (runtimeLookup.intent.kind !== "runtime-lookup" || runtimeLookup.sections.shows[0]?.id !== "synthetic-show-00000") {
    throw new Error("Synthetic exact runtime lookup did not resolve the requested show.");
  }

  const publicResult = engine.retrieve("sci-fi");
  const publicSnapshot = {
    candidateIds: publicResult.candidateIds,
    sectionIds: Object.fromEntries(Object.entries(publicResult.sections).map(([name, entries]) => [name, entries.map((entry) => entry.id)])),
    reasons: publicResult.sections.shows.map((entry) => entry.reasons),
  };
  const personalizationReports = [];
  for (const size of [20, 100, 500]) {
    const context = makeLibraryContext(size, data.shows);
    const personalIndexStarted = performance.now();
    const personalSimilarityIndex = archiveSimilarity.createSimilarityIndex({ shows: similarityShows, collections: data.collections });
    const personalIndexBuildMs = elapsed(personalIndexStarted);
    const personalSimilarityCalls = instrumentSimilarityIndex(personalSimilarityIndex);
    const personalizeSearch = (await import("../shared/app/discovery-personalization.js"))
      .createPersonalDiscoveryPersonalizer({ shows: data.searchCatalog, similarityIndex: personalSimilarityIndex, scope: "search" });
    const disabled = engine.retrieve("sci-fi", { personalContext: { enabled: false, entries: [] }, personalize: personalizeSearch });
    if (JSON.stringify(disabled.candidateIds) !== JSON.stringify(publicResult.candidateIds)
      || JSON.stringify(Object.fromEntries(Object.entries(disabled.sections).map(([name, entries]) => [name, entries.map((entry) => entry.id)]))) !== JSON.stringify(publicSnapshot.sectionIds)
      || JSON.stringify(disabled.sections.shows.map((entry) => entry.reasons)) !== JSON.stringify(publicSnapshot.reasons)) {
      throw new Error("Disabled Personal Discovery changed public candidate IDs, ordering, sections, or reasons.");
    }

    const similarityBefore = { ...personalSimilarityCalls };
    const firstStarted = performance.now();
    const firstEnabled = engine.retrieve("sci-fi", { personalContext: context, personalize: personalizeSearch });
    const firstCallMs = elapsed(firstStarted);
    const firstCallSimilarityWork = {
      publicMatchCalls: personalSimilarityCalls.publicMatchCalls - similarityBefore.publicMatchCalls,
      comparedPairs: personalSimilarityCalls.comparedPairs - similarityBefore.comparedPairs,
      returnedMatches: personalSimilarityCalls.returnedMatches - similarityBefore.returnedMatches,
    };
    const weightedAnchors = context.entries.filter((entry) =>
      entry.state === "saved"
        || entry.state === "listening"
        || [1, 2, 4, 5].includes(entry.rating),
    ).length;
    const similarityWorkLimit = weightedAnchors * 50;
    if (firstCallSimilarityWork.comparedPairs > similarityWorkLimit) {
      throw new Error(`Personal Discovery compared ${firstCallSimilarityWork.comparedPairs} pairs; weighted-anchor limit is ${similarityWorkLimit}.`);
    }
    const disabledSamples = [];
    const enabledSamples = [];
    const pairedOverhead = [];
    let latestEnabled = firstEnabled;
    for (let warm = 0; warm < WARMUPS; warm += 1) {
      engine.retrieve("sci-fi", { personalContext: context, personalize: personalizeSearch });
      engine.retrieve("sci-fi", { personalContext: { enabled: false, entries: [] }, personalize: personalizeSearch });
    }
    const warmSimilarityWork = { ...personalSimilarityCalls };
    for (let sample = 0; sample < RUNS; sample += 1) {
      const disabledStart = performance.now();
      const publicWithDisabledContext = engine.retrieve("sci-fi", { personalContext: { enabled: false, entries: [] }, personalize: personalizeSearch });
      const disabledMs = elapsed(disabledStart);
      const enabledStart = performance.now();
      latestEnabled = engine.retrieve("sci-fi", { personalContext: context, personalize: personalizeSearch });
      const enabledMs = elapsed(enabledStart);
      disabledSamples.push(disabledMs);
      enabledSamples.push(enabledMs);
      pairedOverhead.push(enabledMs - disabledMs);
      if (JSON.stringify(publicWithDisabledContext.candidateIds) !== JSON.stringify(publicResult.candidateIds)) {
        throw new Error("Repeated disabled Personal Discovery query diverged from the public candidate IDs.");
      }
    }
    const warmSimilarityWorkDelta = {
      publicMatchCalls: personalSimilarityCalls.publicMatchCalls - warmSimilarityWork.publicMatchCalls,
      comparedPairs: personalSimilarityCalls.comparedPairs - warmSimilarityWork.comparedPairs,
    };
    if (warmSimilarityWorkDelta.publicMatchCalls || warmSimilarityWorkDelta.comparedPairs) {
      throw new Error(`Repeated warm Personal Discovery query recomputed similarity work: ${JSON.stringify(warmSimilarityWorkDelta)}.`);
    }

    const hiddenIds = context.entries.filter((entry) => entry.state === "hidden").map((entry) => entry.showId);
    const finishedIds = context.entries.filter((entry) => entry.state === "finished").map((entry) => entry.showId);
    const publicIdSet = new Set(publicResult.candidateIds);
    const suppressedHidden = hiddenIds.filter((id) => publicIdSet.has(id) && !latestEnabled.candidateIds.includes(id));
    const finishedStillSearchable = finishedIds.filter((id) => publicIdSet.has(id) && latestEnabled.candidateIds.includes(id));
    const reasonCount = latestEnabled.sections.shows.filter((entry) => entry.personalizationReason).length;
    personalizationReports.push({
      libraryEntries: size,
      eligibleWeightedAnchors: weightedAnchors,
      eligiblePublicCandidates: publicResult.candidateIds.length,
      eligibleCandidateHistoryProduct: publicResult.candidateIds.length * weightedAnchors,
      similarityWorkLimit,
      personalSimilarityIndexBuildMs: Number(personalIndexBuildMs.toFixed(3)),
      firstEnabledMs: Number(firstCallMs.toFixed(3)),
      firstCallSimilarityWork,
      disabled: summarize(disabledSamples),
      enabledWarm: summarize(enabledSamples),
      pairedOverhead: summarize(pairedOverhead),
      warmSimilarityWorkDelta,
      personalizedCandidateCount: latestEnabled.candidateIds.length,
      hiddenCandidatesSuppressed: suppressedHidden.length,
      finishedCandidatesStillSearchable: finishedStillSearchable.length,
      personalReasonCount: reasonCount,
      outputCandidateSample: latestEnabled.candidateIds.slice(0, 8),
    });
  }

  const seedContext = {
    ...makeLibraryContext(100, data.shows),
    entries: [
      { showId: "synthetic-show-00002", state: "saved" },
      { showId: "synthetic-show-00004", state: "listening" },
      ...makeLibraryContext(98, data.shows).entries.slice(5),
    ],
  };
  const personalizeTryNext = (await import("../shared/app/discovery-personalization.js"))
    .createPersonalDiscoveryPersonalizer({ shows: data.searchCatalog, similarityIndex, scope: "try-next" });
  const tryNext = engine.retrieve("shows like Synthetic Signal 00000 finished", {
    personalContext: seedContext,
    personalize: personalizeTryNext,
  });
  const queryJson = JSON.stringify(data.searchCatalog);
  const runtimeJson = JSON.stringify(data.runtimeEvidence);
  if (typeof global.gc === "function") global.gc();
  const beforeBrowser = memorySnapshot();
  const browser = await measureBrowser(queryJson, runtimeJson, data.shows);
  const afterBrowser = memorySnapshot();
  const report = {
    fixture: {
      shows: data.shows.length,
      factorAgainstPublishedCatalogue: Number((data.shows.length / 752).toFixed(2)),
      collections: data.collections.length,
      entities: data.entities.length,
      authoredCatalogueRead: false,
      authoredCatalogueWrite: false,
    },
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpus: require("node:os").cpus().length,
      playwright: require(path.join(root, "backend", "node_modules", "playwright", "package.json")).version,
    },
    measurements: { warmups: WARMUPS, runs: RUNS, similarityIndexBuildMs: Number(similarityBuildMs.toFixed(3)), engineConstruction, queries: queryReports, personalDiscovery: personalizationReports, tryNext: { intentKind: tryNext.intent.kind, candidateCount: tryNext.candidateIds.length, personalReasonCount: tryNext.sections.shows.filter((entry) => entry.personalizationReason).length }, browser },
    memory: { before, afterDataset, afterEngine, beforeBrowser, afterBrowser },
    semantics: { exactTitleFirstResult: exactResult.candidateIds[0], publicCandidateCount: publicResult.candidateIds.length, disabledParity: "candidate IDs, section ordering, and reasons asserted" },
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
