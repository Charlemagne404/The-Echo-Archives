const fs = require("node:fs");
const path = require("node:path");

const siteRoot = path.resolve(process.argv[2] || process.cwd());
const failures = [];

function readJson(relativePath, fallback = null) {
  const filePath = path.join(siteRoot, relativePath);
  if (!fs.existsSync(filePath)) {
    if (fallback !== null) return fallback;
    failures.push(`missing ${relativePath}`);
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    failures.push(`${relativePath} is not valid JSON: ${error.message}`);
    return null;
  }
}

const shows = readJson("data/shows.json", []);
const collections = readJson("data/collections.json", []);
const searchIndex = readJson("data/search-index.json", []);
const archiveStats = readJson("data/archive-stats.json", {});
const creators = readJson("data/creators.json", []);
const networks = readJson("data/networks.json", []);
const entities = readJson("data/entities.json", []);
const manifest = readJson("site-src/page-manifest.json", []);

if (!Array.isArray(shows) || shows.length === 0) failures.push("data/shows.json must contain at least one show");
if (!Array.isArray(collections) || collections.length === 0) failures.push("data/collections.json must contain at least one collection");
if (!Array.isArray(searchIndex) || searchIndex.length !== (Array.isArray(shows) ? shows.length : 0)) {
  failures.push("data/search-index.json must contain one record per published runtime show");
}

const showIds = new Set((Array.isArray(shows) ? shows : []).map((show) => show?.id).filter(Boolean));
const creatorIds = new Set((Array.isArray(creators) ? creators : []).map((creator) => creator?.id).filter(Boolean));
const networkIds = new Set((Array.isArray(networks) ? networks : []).map((network) => network?.id).filter(Boolean));
const entityIds = new Set((Array.isArray(entities) ? entities : []).map((entity) => entity?.id).filter(Boolean));
const creatorNames = new Set();
const unlinkedPublishedShows = [];

(Array.isArray(shows) ? shows : []).forEach((show) => {
  if (!show?.id || !show?.title) failures.push("a generated show record is missing id or title");
  if (show?.entityLinks !== undefined && !Array.isArray(show.entityLinks)) {
    failures.push(`show ${show.id} has invalid entityLinks`);
  }
  const entityLinks = Array.isArray(show?.entityLinks) ? show.entityLinks : [];
  entityLinks.forEach((link) => {
    if (!link?.entityId || (entityIds.size > 0 && !entityIds.has(link.entityId))) {
      failures.push(`show ${show.id} references unknown entity ${link?.entityId || "(missing id)"}`);
    }
  });
  const legacyCreators = Array.isArray(show?.creators) ? show.creators : [];
  if (show?.status === "published" && legacyCreators.length === 0 && entityLinks.length === 0) {
    unlinkedPublishedShows.push(show.id);
  }
  legacyCreators.forEach((creator) => {
    const normalized = String(creator || "").trim().toLocaleLowerCase();
    if (normalized) creatorNames.add(normalized);
  });
  if (show?.cover) {
    const coverPath = path.join(siteRoot, String(show.cover).replace(/^\/+/, ""));
    if (!fs.existsSync(coverPath)) failures.push(`show ${show.id} references missing cover ${show.cover}`);
  }
  if (show?.creatorId && creators.length > 0 && !creatorIds.has(show.creatorId)) {
    failures.push(`show ${show.id} references unknown creator ${show.creatorId}`);
  }
  if (show?.networkId && networks.length > 0 && !networkIds.has(show.networkId)) {
    failures.push(`show ${show.id} references unknown network ${show.networkId}`);
  }
});

(Array.isArray(collections) ? collections : []).forEach((collection) => {
  if (!collection?.id || !collection?.title) failures.push("a generated collection record is missing id or title");
  const referencedShowIds = [
    ...(Array.isArray(collection?.showIds) ? collection.showIds : []),
    ...(Array.isArray(collection?.coverShowIds) ? collection.coverShowIds : []),
  ];
  referencedShowIds.forEach((showId) => {
    if (!showIds.has(showId)) failures.push(`collection ${collection.id} references unknown show ${showId}`);
  });
});

const manifestOutputs = new Set(
  (Array.isArray(manifest) ? manifest : []).map((entry) => entry?.output).filter(Boolean),
);
for (const requiredPage of ["index.html", "collections.html", "for-creators.html", "show.html", "submit.html", "privacy.html", "terms.html", "cookies.html", "copyright.html", "404.html", "500.html", "offline.html"]) {
  if (!manifestOutputs.has(requiredPage) || !fs.existsSync(path.join(siteRoot, requiredPage))) {
    failures.push(`generated route page is missing: ${requiredPage}`);
  }
}

const publishedShows = (Array.isArray(shows) ? shows : []).filter((show) => show?.status === "published");
const expectedShowRoutes = publishedShows.length;
const expectedCollectionRoutes = Array.isArray(collections) ? collections.length : 0;
if (Number.isFinite(archiveStats.showCount) && archiveStats.showCount !== expectedShowRoutes) {
  failures.push(`archive-stats showCount=${archiveStats.showCount} does not match ${expectedShowRoutes}`);
}
if (Number.isFinite(archiveStats.collectionCount) && archiveStats.collectionCount !== expectedCollectionRoutes) {
  failures.push(`archive-stats collectionCount=${archiveStats.collectionCount} does not match ${expectedCollectionRoutes}`);
}
if (Number.isFinite(archiveStats.creatorCount) && archiveStats.creatorCount !== creatorNames.size) {
  failures.push(`archive-stats creatorCount=${archiveStats.creatorCount} does not match ${creatorNames.size} creator relationships`);
}

if (failures.length > 0) {
  console.error("Catalog sanity validation failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

const warnings = [];
if (unlinkedPublishedShows.length > 0) {
  warnings.push(`${unlinkedPublishedShows.length} published show(s) have no legacy creator or entity relationship`);
}

console.log(JSON.stringify({
  ok: true,
  publishedShows: expectedShowRoutes,
  collections: expectedCollectionRoutes,
  searchRecords: Array.isArray(searchIndex) ? searchIndex.length : 0,
  creators: Array.isArray(creators) ? creators.length : 0,
  networks: Array.isArray(networks) ? networks.length : 0,
  entities: Array.isArray(entities) ? entities.length : 0,
  indexableEntities: Array.isArray(entities) ? entities.filter((entity) => entity?.indexable).length : 0,
  unlinkedPublishedShows,
  warnings,
  expectedDynamicShowRoutes: expectedShowRoutes,
  expectedDynamicCollectionRoutes: expectedCollectionRoutes,
}));
