const { performance } = require("node:perf_hooks");

const discovery = require("../shared/discovery");
const archiveSimilarity = require("../shared/archive-similarity.js");
const shows = require("../data/shows.json");
const searchCatalog = require("../data/search-index.json");
const collections = require("../data/collections.json");
const entities = require("../catalog-src/entities.json");
const runtimeEvidence = require("../data/runtime-evidence.json");

const QUERY = "sci-fi";
const RUNS = 24;
const WARMUPS = 3;
const PREFERRED_ANCHORS = ["midnight-burger", "the-white-vault", "ars-paradoxica", "were-alive", "king-falls-am"];
const SIGNAL_STATES = ["saved", "listening", "finished", "dropped"];

function percentile(values, fraction) {
  const sorted = values.slice().sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)];
}

function summarize(values) {
  return {
    medianMs: Number(percentile(values, 0.5).toFixed(3)),
    p95Ms: Number(percentile(values, 0.95).toFixed(3)),
  };
}

function makeContext(size) {
  const ids = [...PREFERRED_ANCHORS, ...shows.map((show) => show.id).filter((id) => !PREFERRED_ANCHORS.includes(id))];
  return {
    enabled: true,
    entries: ids.slice(0, size).map((showId, index) => {
      const entry = { showId, state: SIGNAL_STATES[index % SIGNAL_STATES.length] };
      if (index % 4 === 0) entry.rating = [5, 4, 2, 1][Math.floor(index / 4) % 4];
      return entry;
    }),
  };
}

function timeCall(callback) {
  const startedAt = performance.now();
  const value = callback();
  return { elapsedMs: performance.now() - startedAt, value };
}

async function main() {
  const { createPersonalDiscoveryPersonalizer } = await import("../shared/app/discovery-personalization.js");
  const reports = [];
  const lengthById = new Map(runtimeEvidence
    .filter((record) => record?.length && Object.keys(record.length).length)
    .map((record) => [record.id, record.length]));
  const similarityShows = searchCatalog.map((show) => {
    const length = lengthById.get(show.id);
    return length ? { ...show, length } : show;
  });
  const similarityIndex = archiveSimilarity.createSimilarityIndex({ shows: similarityShows, collections });

  for (const librarySize of [1, 5, 20]) {
    const engine = discovery.createDiscoveryEngine({
      // Match the homepage: compact search records plus the separate public
      // runtime-evidence projection feed recommendation similarity checks.
      shows: searchCatalog,
      searchCatalog,
      collections,
      entities,
      similarityIndex,
      catalogueRevision: `personal-discovery-benchmark-${librarySize}`,
    });
    const personalize = createPersonalDiscoveryPersonalizer({ shows: searchCatalog, similarityIndex, scope: "search" });
    const personalContext = makeContext(librarySize);
    const disabledCall = () => engine.retrieve(QUERY, { personalContext: { enabled: false, entries: [] }, personalize });
    const enabledCall = () => engine.retrieve(QUERY, { personalContext, personalize });

    for (let index = 0; index < WARMUPS; index += 1) disabledCall();
    const firstEnabledSample = timeCall(enabledCall);
    for (let index = 0; index < WARMUPS; index += 1) {
      disabledCall();
      enabledCall();
    }

    const disabledSamples = [];
    const enabledSamples = [];
    let lastEnabledResult = null;
    for (let index = 0; index < RUNS; index += 1) {
      const order = index % 2 === 0 ? [disabledCall, enabledCall] : [enabledCall, disabledCall];
      for (const call of order) {
        const sample = timeCall(call);
        if (call === enabledCall) {
          enabledSamples.push(sample.elapsedMs);
          lastEnabledResult = sample.value;
        } else {
          disabledSamples.push(sample.elapsedMs);
        }
      }
    }

    reports.push({
      libraryEntries: librarySize,
      firstEnabledAfterPublicWarmupMs: Number(firstEnabledSample.elapsedMs.toFixed(3)),
      candidateCount: lastEnabledResult?.candidateIds.length || 0,
      personalizedReasons: [...(lastEnabledResult?.sections.shows || [])].filter((entry) => entry.personalizationReason).length,
      disabled: summarize(disabledSamples),
      enabled: summarize(enabledSamples),
    });
  }

  process.stdout.write(`${JSON.stringify({ node: process.version, query: QUERY, runsPerMode: RUNS, warmupsPerMode: WARMUPS, reports }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
