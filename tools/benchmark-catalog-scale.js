const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const root = path.resolve(__dirname, "..");
const { SHOWS_PER_COHORT, writeScaleFixture } = require("./lib/catalog-scale-fixtures");
const { loadCatalog, loadCollections } = require("../backend/lib/catalog");
const { loadEntities } = require("../backend/lib/entities");
const { loadArchiveContext } = require("../backend/lib/ai/archive-context");
const { buildDiscoveryGapReport } = require("../backend/lib/discovery-gaps");
const { buildEntityGraphData } = require("../backend/lib/entity-graph");
const { loadSiteHelpContext } = require("../backend/lib/ai/site-help");
const { applyGeneratedCoverVariants } = require("../backend/lib/responsive-images");
const { buildSitemapEntries, buildSitemapXml } = require("../backend/lib/sitemap");
const { createShowPageMarkup } = require("../backend/lib/show-page-render");
const { createSimilarityIndex } = require("../shared/archive-similarity");
const archiveSearch = require("../shared/archive-search");
const discovery = require("../shared/discovery");
const { buildGeneratedSimilarityCollections } = require("../backend/lib/shows-like-routes");
const {
  createSearchIndexRecord,
  serializeRuntimeShow,
  writeCatalogArtifacts,
} = require("./lib/catalog-artifacts");
const { getDiscoveryTaxonomy } = require("../shared/archive-tags");
const { buildRecommendationCoverageReport } = require("./lib/recommendation-coverage-report");

function parseArgs(argv) {
  const options = {
    sizes: [2_000, 5_000, 10_000, 25_000],
    coverageFullMax: 2_000,
    coverageSamples: 12,
    pageSamples: 250,
    browser: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--browser") options.browser = true;
    else if (argument === "--json") options.json = true;
    else if (argument.startsWith("--sizes=")) {
      options.sizes = argument.slice("--sizes=".length).split(",").map(Number);
    } else if (argument === "--sizes") {
      options.sizes = String(argv[++index] || "").split(",").map(Number);
    } else if (argument.startsWith("--coverage-full-max=")) {
      options.coverageFullMax = Number(argument.slice("--coverage-full-max=".length));
    } else if (argument === "--coverage-full-max") {
      options.coverageFullMax = Number(argv[++index]);
    } else if (argument.startsWith("--coverage-samples=")) {
      options.coverageSamples = Number(argument.slice("--coverage-samples=".length));
    } else if (argument === "--coverage-samples") {
      options.coverageSamples = Number(argv[++index]);
    } else if (argument.startsWith("--page-samples=")) {
      options.pageSamples = Number(argument.slice("--page-samples=".length));
    } else if (argument === "--page-samples") {
      options.pageSamples = Number(argv[++index]);
    } else {
      throw new Error("Unknown argument. Use --sizes, --coverage-full-max, --coverage-samples, --page-samples, --browser, or --json.");
    }
  }

  if (!options.sizes.length || options.sizes.some((size) => !Number.isInteger(size) || size < 1)) {
    throw new Error("--sizes must be a comma-separated list of positive integers.");
  }
  if (!Number.isInteger(options.coverageFullMax) || options.coverageFullMax < 0) {
    throw new Error("--coverage-full-max must be a non-negative integer.");
  }
  if (!Number.isInteger(options.coverageSamples) || options.coverageSamples < 1) {
    throw new Error("--coverage-samples must be a positive integer.");
  }
  if (!Number.isInteger(options.pageSamples) || options.pageSamples < 1) {
    throw new Error("--page-samples must be a positive integer.");
  }
  return options;
}

function elapsed(start) {
  return Math.round((performance.now() - start) * 100) / 100;
}

function captureMemory() {
  const { rss, heapUsed, heapTotal, external, arrayBuffers } = process.memoryUsage();
  return {
    rss,
    maxRssBytes: process.resourceUsage().maxRSS * 1024,
    heapUsed,
    heapTotal,
    external,
    arrayBuffers,
  };
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.max(0, Math.ceil(sorted.length * fraction) - 1);
  return Math.round(sorted[Math.min(sorted.length - 1, rank)] * 100) / 100;
}

async function timeAsync(operation) {
  const startedAt = performance.now();
  const value = await operation();
  return { value, milliseconds: elapsed(startedAt) };
}

function timeSync(operation) {
  const startedAt = performance.now();
  const value = operation();
  return { value, milliseconds: elapsed(startedAt) };
}

async function loadHomeModules() {
  const moduleUrl = (relativePath) => require("node:url").pathToFileURL(path.join(root, relativePath)).href;
  const [filterState, searchCache] = await Promise.all([
    import(moduleUrl("shared/app/pages/home/filter-state.js")),
    import(moduleUrl("shared/app/pages/home/search-cache.js")),
  ]);
  return { filterState, searchCache };
}

async function measureBrowser(searchIndexJson, query, loadedShows) {
  const playwrightPath = path.join(root, "backend", "node_modules", "playwright");
  if (!fs.existsSync(playwrightPath)) {
    throw new Error("Playwright is not installed under backend/node_modules. Run npm --prefix backend run test:setup:browser and retry.");
  }
  const { chromium } = require(playwrightPath);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    const cssPath = path.join(root, "home.css");
    const css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, "utf8") : "";
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>${css}\n.scale-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem;padding:0.75rem}.scale-grid>*{min-width:0}.scale-grid img{max-width:100%;height:auto}</style><main><div id="scale-grid" class="scale-grid"></div></main>`);
    await page.addScriptTag({ path: path.join(root, "shared", "archive-search.js") });
    const parsed = await page.evaluate(({ json, searchQuery }) => {
      const started = performance.now();
      const records = JSON.parse(json);
      const parsedAt = performance.now();
      const indexed = window.EchoArchiveSearch.hydrateCatalogSearch(records);
      const hydratedAt = performance.now();
      const results = window.EchoArchiveSearch.scoreCatalog(indexed, searchQuery);
      const searchedAt = performance.now();
      return {
        count: records.length,
        ids: results.slice(0, 24).map((record) => record.id),
        parseMilliseconds: Math.round((parsedAt - started) * 100) / 100,
        hydrateMilliseconds: Math.round((hydratedAt - parsedAt) * 100) / 100,
        searchMilliseconds: Math.round((searchedAt - hydratedAt) * 100) / 100,
        heapUsed: performance.memory?.usedJSHeapSize ?? null,
      };
    }, { json: searchIndexJson, searchQuery: query });

    const byId = new Map(loadedShows.map((show) => [show.id, show]));
    const { renderCollectionShowCard } = require("./lib/home-page-prerender");
    const cardMarkup = parsed.ids
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((show) => renderCollectionShowCard(show, "", {
        surface: "catalog-scale-browser-benchmark",
        resultType: "show_card",
        recommendationSource: "none",
      }))
      .join("");
    const rendered = await page.evaluate((markup) => {
      const started = performance.now();
      const grid = document.querySelector("#scale-grid");
      grid.innerHTML = markup;
      const rect = grid.getBoundingClientRect();
      const firstCard = grid.firstElementChild;
      const finished = performance.now();
      return {
        cards: grid.children.length,
        domRenderMilliseconds: Math.round((finished - started) * 100) / 100,
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        overflowsHorizontally: document.documentElement.scrollWidth > window.innerWidth,
        gridWidth: Math.round(rect.width * 100) / 100,
        cardWidth: firstCard ? Math.round(firstCard.getBoundingClientRect().width * 100) / 100 : 0,
        gridHeight: Math.round(grid.scrollHeight * 100) / 100,
        heapUsed: performance.memory?.usedJSHeapSize ?? null,
      };
    }, cardMarkup);
    return { ...parsed, ...rendered, viewport: "390x844" };
  } finally {
    await browser.close();
  }
}

function sampleIds(shows, count) {
  if (shows.length <= count) return shows.map((show) => show.id);
  const interval = shows.length / count;
  const distributeWithinCohort = interval >= SHOWS_PER_COHORT;
  return Array.from({ length: count }, (_, index) => {
    const position = Math.floor(index * interval);
    const cohortOffset = distributeWithinCohort
      ? Math.floor((interval * 0.37) + (index * 7)) % SHOWS_PER_COHORT
      : 0;
    return shows[Math.min(shows.length - 1, position + cohortOffset)].id;
  });
}

async function benchmarkSize(size, options) {
  if (typeof global.gc === "function") global.gc();
  const initialMemory = captureMemory();
  const peakMemory = { ...initialMemory };
  const memoryCheckpoints = {};
  const recordMemoryCheckpoint = (name) => {
    const current = captureMemory();
    memoryCheckpoints[name] = current;
    Object.keys(peakMemory).forEach((key) => {
      peakMemory[key] = Math.max(peakMemory[key], current[key]);
    });
    return current;
  };
  let fixture;
  let fixtureWriteMilliseconds = 0;
  let browserMetrics = null;
  try {
    const fixtureWriteStart = performance.now();
    fixture = writeScaleFixture(size);
    fixtureWriteMilliseconds = elapsed(fixtureWriteStart);
    recordMemoryCheckpoint("afterFixturePreparation");
    const load = await timeAsync(() => loadCatalog(fixture.root));
    const catalog = load.value;
    const afterLoadMemory = recordMemoryCheckpoint("afterCatalogLoad");
    const entities = loadEntities(fixture.root, catalog);
    const collectionLoad = timeSync(() => loadCollections(fixture.root, new Set(catalog.map((show) => show.id))));
    const collections = collectionLoad.value;
    const sourceCollectionCount = fixture.collections.length;
    const generatedCollections = collections.filter((collection) => collection.generatedFrom === "authored-similarTo");
    const generatedRoutesTimed = timeSync(() => buildGeneratedSimilarityCollections({ shows: catalog, collections: fixture.collections }));

    const runtimeSerializationStart = performance.now();
    const runtimeCatalog = catalog.filter((show) => show.status === "published").map(serializeRuntimeShow);
    const runtimeJson = JSON.stringify(runtimeCatalog);
    const runtimeSerializationMilliseconds = elapsed(runtimeSerializationStart);
    const searchIndexStart = performance.now();
    const searchIndex = catalog.filter((show) => show.status === "published").map(createSearchIndexRecord);
    const searchIndexJson = JSON.stringify(searchIndex);
    const searchIndexMilliseconds = elapsed(searchIndexStart);
    const artifactContext = {
      entities,
      creators: [],
      networks: [],
      changelog: [],
      featureAvailability: {},
    };
    const gapReportTimed = timeSync(() => buildDiscoveryGapReport(catalog, collections));
    const gapReport = gapReportTimed.value;
    const artifactGeneration = await timeAsync(() => writeCatalogArtifacts(fixture.root, {
      catalog,
      collections,
      reviewsById: {},
      gapReport,
      archiveContext: artifactContext,
      tagTaxonomy: getDiscoveryTaxonomy(),
    }));
    const artifactGenerationMilliseconds = artifactGeneration.milliseconds;
    artifactGeneration.value = null;
    recordMemoryCheckpoint("afterArtifactGeneration");
    const coverVariantHydration = timeSync(() => applyGeneratedCoverVariants(fixture.root, catalog));
    const entityGraphStart = performance.now();
    const entityGraph = buildEntityGraphData({ shows: catalog, entities });
    const entityGraphMilliseconds = elapsed(entityGraphStart);
    const entityGraphBytes = Buffer.byteLength(JSON.stringify(entityGraph));
    recordMemoryCheckpoint("afterEntityGraph");

    const sitemapStart = performance.now();
    const sitemapEntries = buildSitemapEntries({
      siteUrl: "https://scale-fixture.example.invalid",
      catalog,
      collections,
      entities,
    });
    const sitemapXml = buildSitemapXml({
      siteUrl: "https://scale-fixture.example.invalid",
      catalog,
      collections,
      entities,
    });
    const sitemapMilliseconds = elapsed(sitemapStart);
    recordMemoryCheckpoint("afterSitemap");

    const similarityStart = performance.now();
    const similarityIndex = createSimilarityIndex({ shows: catalog, collections });
    const similarityIndexMilliseconds = elapsed(similarityStart);
    recordMemoryCheckpoint("afterSimilarityIndex");
    const similaritySampleIds = sampleIds(catalog, Math.min(12, catalog.length));
    const similaritySampleStart = performance.now();
    let similarityCandidateCount = 0;
    for (const showId of similaritySampleIds) {
      similarityCandidateCount += similarityIndex.getSimilarShows(showId, { limit: 24 }).length;
    }
    const similaritySampleMilliseconds = elapsed(similaritySampleStart);

    const sampleCount = Math.min(options.coverageSamples, catalog.length);
    let recommendationCoverage;
    if (size <= options.coverageFullMax) {
      const coverageStart = performance.now();
      const report = buildRecommendationCoverageReport({ shows: catalog, collections, legacyCollections: fixture.collections });
      recommendationCoverage = {
        mode: "full",
        sampledShows: report.records.length,
        coveredPercentage: report.coverage.coveredPercentage,
        milliseconds: elapsed(coverageStart),
      };
    } else {
      const coverageStart = performance.now();
      let diagnosticCandidates = 0;
      let publicMatches = 0;
      let authoredMatches = 0;
      for (const showId of sampleIds(catalog, sampleCount)) {
        diagnosticCandidates += similarityIndex.getSimilarShows(showId, { limit: catalog.length })
          .filter((entry) => entry.similarity?.curatedEvidence !== true).length;
        publicMatches += similarityIndex.getPublicSimilarityMatches(showId).length;
        authoredMatches += similarityIndex.getEditorialSimilarityMatches(showId, { limit: catalog.length }).length;
      }
      recommendationCoverage = {
        mode: "sampled-per-show-paths",
        sampledShows: sampleCount,
        averageDiagnosticCandidates: Math.round((diagnosticCandidates / sampleCount) * 100) / 100,
        averagePublicMatches: Math.round((publicMatches / sampleCount) * 100) / 100,
        averageAuthoredMatches: Math.round((authoredMatches / sampleCount) * 100) / 100,
        milliseconds: elapsed(coverageStart),
      };
    }

    const showMap = new Map(catalog.map((show) => [show.id, show]));
    const pageCount = Math.min(size, size <= 2_000 ? size : options.pageSamples);
    const pageSampleIds = sampleIds(catalog, pageCount);
    const pageStart = performance.now();
    let generatedPageBytes = 0;
    for (const showId of pageSampleIds) {
      const markup = createShowPageMarkup(showMap.get(showId), showMap, collections, {}, similarityIndex);
      generatedPageBytes += Buffer.byteLength(markup);
    }
    const pageGenerationMilliseconds = elapsed(pageStart);
    recordMemoryCheckpoint("afterPageGeneration");

    const query = catalog[0]?.title || "synthetic";
    const queries = [query, "sci-fi", "synthetic creator", "finished sci-fi"];
    const searchLatencies = [];
    const searchSamples = [];
    for (let iteration = 0; iteration < 5; iteration += 1) {
      for (const searchQuery of queries) {
        const started = performance.now();
        const matches = archiveSearch.scoreCatalog(catalog, searchQuery);
        const milliseconds = elapsed(started);
        searchLatencies.push(milliseconds);
        searchSamples.push({ query: searchQuery, iteration, milliseconds, resultCount: matches.length });
      }
    }
    const searchReferenceQuery = queries[0];
    const exhaustiveSearchStart = performance.now();
    archiveSearch.scoreCatalog(catalog, searchReferenceQuery, { exhaustiveCandidates: true });
    const exhaustiveSearchMilliseconds = elapsed(exhaustiveSearchStart);
    const indexedSearchStart = performance.now();
    archiveSearch.scoreCatalog(catalog, searchReferenceQuery);
    const indexedSearchMilliseconds = elapsed(indexedSearchStart);
    const { filterState, searchCache } = await loadHomeModules();
    const filterShows = catalog.map((show) => ({
      ...show,
      genreTokens: show.genres.map(archiveSearch.normalizeTag),
      tagTokens: show.tags.map(archiveSearch.normalizeTag),
      bestForTokens: show.bestFor.map(archiveSearch.normalizeTag),
    }));
    const filterGenre = filterShows[0]?.genreTokens?.[0] || "sci-fi";
    const filters = {
      genres: new Set([filterGenre]),
      tones: new Set(catalog[0]?.tones || []),
      formats: new Set(catalog[0]?.formats || []),
      tags: new Set(),
      bestFor: new Set(),
      completionStatus: new Set(),
      reviewStatus: new Set(),
    };
    const filterStart = performance.now();
    let filteredCount = 0;
    for (let iteration = 0; iteration < 30; iteration += 1) {
      filteredCount += filterShows.filter((show) => filterState.matchesSelectedFilters(show, filters)).length;
    }
    const repeatedFilterMilliseconds = elapsed(filterStart);
    const searchCacheInstance = searchCache.createHomeSearchPerformanceCache({ shows: catalog, archiveSearch, similarityIndex });
    const repeatedSearchStart = performance.now();
    for (let iteration = 0; iteration < 30; iteration += 1) {
      searchCacheInstance.getScoredSearchResults(iteration % 3 === 0 ? "sci-fi" : "SCI-FI!");
    }
    const repeatedSearchMilliseconds = elapsed(repeatedSearchStart);

    const discoveryStart = performance.now();
    const engine = discovery.createDiscoveryEngine({
      shows: catalog,
      searchCatalog: searchIndex,
      collections,
      entities,
      catalogueRevision: `synthetic-scale-${size}`,
      similarityIndex,
    });
    const discoveryEngineMilliseconds = elapsed(discoveryStart);
    const discoveryQuery = catalog[0]?.genres?.[0] || "sci-fi";
    const parseStart = performance.now();
    const parsedIntent = engine.parse(discoveryQuery, { surface: "show-search" });
    const discoveryParseMilliseconds = elapsed(parseStart);
    const retrieveStart = performance.now();
    const discoveryResult = engine.retrieve(parsedIntent);
    const discoveryRetrieveMilliseconds = elapsed(retrieveStart);

    const archiveContextTimed = await timeAsync(() => loadArchiveContext(fixture.root, catalog, collections));
    const siteHelpContextTimed = timeSync(() => loadSiteHelpContext({
      catalog: catalog.filter((show) => show.status === "published"),
      collections,
      archiveContext: archiveContextTimed.value,
    }));
    recordMemoryCheckpoint("afterBackendContext");
    const backendStateBuildComponentsMilliseconds = [
      load.milliseconds,
      collectionLoad.milliseconds,
      coverVariantHydration.milliseconds,
      runtimeSerializationMilliseconds,
      searchIndexMilliseconds,
      similarityIndexMilliseconds,
      archiveContextTimed.milliseconds,
      siteHelpContextTimed.milliseconds,
      entityGraphMilliseconds,
    ].reduce((total, value) => total + value, 0);
    const generatedPageAverageBytes = pageSampleIds.length ? Math.round(generatedPageBytes / pageSampleIds.length) : 0;
    const files = {
      shows: fs.statSync(path.join(fixture.root, "data", "shows.json")).size,
      collections: fs.statSync(path.join(fixture.root, "data", "collections.json")).size,
      entities: fs.statSync(path.join(fixture.root, "data", "entities.json")).size,
      searchIndex: fs.statSync(path.join(fixture.root, "data", "search-index.json")).size,
      entityGraph: fs.statSync(path.join(fixture.root, "data", "entity-graph.json")).size,
      archiveStats: fs.statSync(path.join(fixture.root, "data", "archive-stats.json")).size,
      sitemap: Buffer.byteLength(sitemapXml),
      serializedRuntimeShowsInMemory: Buffer.byteLength(runtimeJson),
    };

    if (options.browser && size === Math.max(...options.sizes)) {
      browserMetrics = await measureBrowser(searchIndexJson, query, catalog);
    }

    const result = {
      catalogueSize: size,
      cohortCount: fixture.cohortCount,
      authoredCollectionCount: sourceCollectionCount,
      generatedSimilarityCollectionCount: generatedCollections.length,
      generatedRoutesBuilt: generatedRoutesTimed.value.length,
      timingsMs: {
        fixturePreparationAndDiskWrite: fixtureWriteMilliseconds,
        catalogueLoading: load.milliseconds,
        collectionLoadingAndGeneratedRoutes: collectionLoad.milliseconds,
        standaloneGeneratedRoutes: generatedRoutesTimed.milliseconds,
        catalogueArtifactGeneration: artifactGenerationMilliseconds,
        discoveryGapReport: gapReportTimed.milliseconds,
        generatedCoverVariantHydration: coverVariantHydration.milliseconds,
        runtimeShowSerialization: runtimeSerializationMilliseconds,
        searchIndexGeneration: searchIndexMilliseconds,
        entityGraphGeneration: entityGraphMilliseconds,
        sitemapGenerationAndEntryBuild: sitemapMilliseconds,
        similarityIndexGeneration: similarityIndexMilliseconds,
        similarityCandidateSample: similaritySampleMilliseconds,
        recommendationCoverage,
        showPageGeneration: pageGenerationMilliseconds,
        discoveryEngineStartup: discoveryEngineMilliseconds,
        discoveryParse: discoveryParseMilliseconds,
        discoveryRetrieval: discoveryRetrieveMilliseconds,
        backendArchiveContextStartup: archiveContextTimed.milliseconds,
        backendSiteHelpContextStartup: siteHelpContextTimed.milliseconds,
        backendStateBuildComponentsTotal: Math.round(backendStateBuildComponentsMilliseconds * 100) / 100,
        repeatedSearch: repeatedSearchMilliseconds,
        repeatedFilter: repeatedFilterMilliseconds,
      },
      search: {
        uniqueQueryCount: queries.length,
        queryCount: searchLatencies.length,
        measurements: queries.map((searchQuery) => {
          const samples = searchSamples.filter((sample) => sample.query === searchQuery);
          return {
            query: searchQuery,
            resultCount: samples.at(-1)?.resultCount || 0,
            averageMs: Math.round((samples.reduce((sum, sample) => sum + sample.milliseconds, 0) / Math.max(1, samples.length)) * 100) / 100,
            p95Ms: percentile(samples.map((sample) => sample.milliseconds), 0.95),
            latenciesMs: samples.map((sample) => sample.milliseconds),
          };
        }),
        referenceQuery: searchReferenceQuery,
        exhaustiveReferenceMs: exhaustiveSearchMilliseconds,
        indexedReferenceMs: indexedSearchMilliseconds,
        referenceSpeedup: indexedSearchMilliseconds > 0
          ? Math.round((exhaustiveSearchMilliseconds / indexedSearchMilliseconds) * 100) / 100
          : null,
        latenciesMs: searchLatencies,
        averageMs: Math.round((searchLatencies.reduce((sum, value) => sum + value, 0) / searchLatencies.length) * 100) / 100,
        p95Ms: percentile(searchLatencies, 0.95),
      },
      filters: {
        iterations: 30,
        averageMatches: Math.round(filteredCount / 30),
      },
      similarity: {
        sampledAnchors: similaritySampleIds.length,
        sampledCandidates: similarityCandidateCount,
        averageCandidatesPerAnchor: Math.round((similarityCandidateCount / similaritySampleIds.length) * 100) / 100,
      },
      discovery: {
        engineVersion: engine.version,
        query: discoveryQuery,
        parsedKind: parsedIntent.kind,
        retrievedShows: discoveryResult.sections.shows.length,
        catalogueRevision: engine.catalogueRevision,
      },
      entityGraph: {
        entities: entityGraph.entities.length,
        shows: entityGraph.shows.length,
        edges: entityGraph.edges.length,
        connections: entityGraph.entityConnections.length,
      },
      sitemap: { entries: sitemapEntries.length },
      pageGeneration: {
        pages: pageSampleIds.length,
        averageHtmlBytes: generatedPageAverageBytes,
        projectedAllPagesMilliseconds: Math.round((pageGenerationMilliseconds / Math.max(1, pageSampleIds.length)) * size * 100) / 100,
      },
      generatedDataBytes: files,
      memoryBytes: {
        beforeFixture: initialMemory,
        afterCatalogLoad: afterLoadMemory,
        afterAllOperations: recordMemoryCheckpoint("afterAllOperations"),
        maximumCheckpointSnapshot: peakMemory,
        checkpoints: memoryCheckpoints,
      },
      browser: browserMetrics,
    };
    return result;
  } finally {
    fixture?.cleanup();
    if (typeof global.gc === "function") global.gc();
  }
}

function printSummary(results) {
  for (const result of results) {
    process.stdout.write(`\n${result.catalogueSize.toLocaleString()} synthetic shows\n`);
    process.stdout.write(`  load ${result.timingsMs.catalogueLoading} ms; artifacts ${result.timingsMs.catalogueArtifactGeneration} ms; search-index ${result.timingsMs.searchIndexGeneration} ms (${(result.generatedDataBytes.searchIndex / 1_000_000).toFixed(2)} MB)\n`);
    process.stdout.write(`  search avg/p95 ${result.search.averageMs}/${result.search.p95Ms} ms; 30 filters ${result.timingsMs.repeatedFilter} ms; 30 cached searches ${result.timingsMs.repeatedSearch} ms\n`);
    process.stdout.write(`  similarity index ${result.timingsMs.similarityIndexGeneration} ms; ${result.similarity.averageCandidatesPerAnchor} avg sample candidates; coverage ${result.timingsMs.recommendationCoverage.mode} ${result.timingsMs.recommendationCoverage.milliseconds} ms\n`);
    process.stdout.write(`  entity graph ${result.timingsMs.entityGraphGeneration} ms; sitemap ${result.timingsMs.sitemapGenerationAndEntryBuild} ms (${result.generatedDataBytes.sitemap} bytes); show pages ${result.pageGeneration.pages} in ${result.timingsMs.showPageGeneration} ms (projected all: ${result.pageGeneration.projectedAllPagesMilliseconds} ms)\n`);
    process.stdout.write(`  Discovery startup/parse/retrieve ${result.timingsMs.discoveryEngineStartup}/${result.timingsMs.discoveryParse}/${result.timingsMs.discoveryRetrieval} ms; archive-context startup ${result.timingsMs.backendArchiveContextStartup} ms\n`);
    if (result.browser) {
      process.stdout.write(`  Chromium 390x844 parse/hydrate/search/render ${result.browser.parseMilliseconds}/${result.browser.hydrateMilliseconds}/${result.browser.searchMilliseconds}/${result.browser.domRenderMilliseconds} ms; overflow=${result.browser.overflowsHorizontally}\n`);
    }
  }
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const osInfo = {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    cpu: os.cpus()[0]?.model || "unknown",
    logicalCpus: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
  };
  const results = [];
  for (const size of options.sizes) {
    (options.json ? process.stderr : process.stdout).write(`Preparing and benchmarking ${size.toLocaleString()} synthetic shows...\n`);
    const result = await benchmarkSize(size, options);
    results.push(result);
    if (!options.json) printSummary([result]);
  }

  const report = {
    schema: "echo-archives/catalog-scale-benchmark/v1",
    generatedAt: new Date().toISOString(),
    environment: osInfo,
    fixture: {
      distribution: "deterministic synthetic cohorts of 20; invented IDs, titles, descriptions, creator relationships, and collection membership",
      authoredCatalogueModified: false,
      browserViewport: options.browser ? "390x844 Chromium" : null,
    },
    options,
    results,
  };
  if (options.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else process.stdout.write("\nScale benchmark complete. Fixture directories were removed from the OS temporary directory.\n");
  return report;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  });
}

module.exports = { benchmarkSize, main, parseArgs, percentile };
