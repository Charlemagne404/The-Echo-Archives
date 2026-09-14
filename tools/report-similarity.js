const path = require("node:path");

const { loadEntities } = require("../backend/lib/entities");
const { resolveShowEntities } = require("../shared/archive-entities");
const { normalizeCollectionRecord, normalizeShowRecord } = require("../shared/archive-record");
const { createSimilarityIndex, DIMENSION_DEFINITIONS } = require("../shared/archive-similarity");
const { readCatalogSource } = require("./lib/catalog-source");

const DEFAULT_EXAMPLES = ["derelict", "midnight-burger", "the-white-vault"];

function resolveSiteRoot() {
  return path.resolve(__dirname, "..");
}

function getArg(name) {
  const prefix = `--${name}=`;
  const value = process.argv.find((argument) => argument.startsWith(prefix));
  return value ? value.slice(prefix.length).trim() : "";
}

function hasValue(show, definition) {
  const value = definition.field
    ? show?.[definition.field]
    : definition.path?.split(".").reduce((current, key) => current?.[key], show);
  const fallback = definition.fallbackPath?.split(".").reduce((current, key) => current?.[key], show);
  const populated = (entry) => Array.isArray(entry)
    ? entry.length > 0
    : entry !== undefined && entry !== null && String(entry).trim() !== "";
  return populated(value) || populated(fallback);
}

function formatReasons(similarity, limit = 3) {
  return similarity.reasons
    .slice(0, limit)
    .map((reason) => reason.text)
    .join("; ");
}

function loadSimilarityData(siteRoot) {
  const sourceData = readCatalogSource(siteRoot);
  const sourceShows = sourceData.shows.filter((show) => show && show.status === "published");
  const entities = loadEntities(siteRoot, sourceData.shows);
  const shows = sourceShows.map((record) => {
    const show = normalizeShowRecord(record);
    const resolvedEntities = resolveShowEntities(show, entities);
    return resolvedEntities.length ? { ...show, resolvedEntities } : show;
  });
  const collections = sourceData.collections.map(normalizeCollectionRecord);

  return { shows, collections };
}

function printReport({ shows, collections }, selectedShowId, limit) {
  const index = createSimilarityIndex({ shows, collections });
  const manualLinks = shows.reduce((total, show) => total + (Array.isArray(show.similarTo) ? show.similarTo.length : 0), 0);
  const manualReasons = shows.reduce((total, show) => total + Object.keys(show.similarReasons || {}).length, 0);
  const similarityCollections = collections.filter((collection) => collection.kind === "similarity");
  const linkedShows = shows.filter((show) => Array.isArray(show.entityLinks) && show.entityLinks.length > 0).length;

  console.log("Similarity foundation report");
  console.log(`Published shows: ${shows.length}`);
  console.log(`Curated similar links: ${manualLinks} links / ${manualReasons} written reasons across ${shows.filter((show) => show.similarTo?.length).length} shows`);
  console.log(`Similarity collections: ${similarityCollections.length} routes`);
  console.log(`Shows with typed entity links: ${linkedShows}`);
  console.log("");
  console.log("Signal coverage:");
  DIMENSION_DEFINITIONS
    .filter((definition) => definition.field || definition.path)
    .forEach((definition) => {
      const count = shows.filter((show) => hasValue(show, definition)).length;
      const percentage = shows.length ? ((count / shows.length) * 100).toFixed(1) : "0.0";
      console.log(`- ${definition.id}: ${count}/${shows.length} (${percentage}%)`);
    });
  const rated = shows.filter((show) => Object.keys(show.ratings || {}).length > 0).length;
  console.log(`- ratingProfile: ${rated}/${shows.length} (${shows.length ? ((rated / shows.length) * 100).toFixed(1) : "0.0"}%; evidence-only)`);
  console.log("");

  const ids = selectedShowId ? [selectedShowId] : DEFAULT_EXAMPLES;
  ids.forEach((showId) => {
    const show = shows.find((candidate) => candidate.id === showId);
    if (!show) {
      console.log(`No published show found for ${showId}.`);
      return;
    }

    console.log(`Shows like ${show.title} (${show.id}):`);
    const candidates = index.getSimilarShows(show.id, { limit });
    if (candidates.length === 0) {
      console.log("- No candidates met the conservative evidence threshold.");
      return;
    }
    candidates.forEach(({ show: candidate, similarity }) => {
      console.log(`- ${candidate.title} [${candidate.id}] — ${similarity.score}/${similarity.maxScore}; metadata coverage ${Math.round(similarity.metadataCoverage * 100)}%; ${formatReasons(similarity)}`);
    });
  });
}

function main() {
  const siteRoot = resolveSiteRoot();
  const data = loadSimilarityData(siteRoot);
  const limit = Math.max(1, Number(getArg("limit")) || 5);
  printReport(data, getArg("show"), limit);
}

if (require.main === module) {
  main();
}

module.exports = {
  loadSimilarityData,
  printReport,
  resolveSiteRoot,
};
