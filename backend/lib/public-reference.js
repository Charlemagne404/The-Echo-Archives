const {
  buildAbsoluteUrl,
  isIndexableCollection,
} = require("./seo");
const {
  isIndexableEntity,
} = require("../../shared/archive-entities");

const PUBLIC_REFERENCE_SCHEMA_VERSION = "1.0";

function normalizeSiteUrl(siteUrl = "") {
  return String(siteUrl || "").replace(/\/+$/, "");
}

function latestDate(values = []) {
  return values
    .map((value) => String(value || "").trim())
    .filter((value) => /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value))
    .sort()
    .at(-1) || "";
}

function buildResource({
  siteUrl,
  id,
  href,
  description,
  recordType,
  canonicalUrlTemplate,
  idField = "id",
}) {
  return {
    id,
    href: buildAbsoluteUrl(siteUrl, href),
    mediaType: "application/json",
    recordType,
    idField,
    canonicalUrlTemplate: `${normalizeSiteUrl(siteUrl)}${canonicalUrlTemplate}`,
    description,
  };
}

function buildPublicReferenceManifest({ siteUrl, catalog = [], collections = [], entities = [] }) {
  const publishedShows = (Array.isArray(catalog) ? catalog : []).filter((show) => show?.status === "published");
  const publicCollections = Array.isArray(collections) ? collections.filter(Boolean) : [];
  const publicEntities = Array.isArray(entities)
    ? entities.filter((entity) => entity?.publication === "public")
    : [];
  const indexableCollections = publicCollections.filter((collection) => {
    const collectionShows = (Array.isArray(collection.showIds) ? collection.showIds : [])
      .map((showId) => publishedShows.find((show) => show.id === showId))
      .filter(Boolean);
    return isIndexableCollection(collection, collectionShows);
  });
  const indexableEntities = publicEntities.filter((entity) => isIndexableEntity(entity, publishedShows));
  const lastModified = latestDate([
    ...publishedShows.map((show) => show.updatedAt),
    ...publicCollections.map((collection) => collection.updatedAt),
    ...publicEntities.map((entity) => entity.reviewedAt),
  ]);

  const manifest = {
    schemaVersion: PUBLIC_REFERENCE_SCHEMA_VERSION,
    name: "The Echo Archives public reference data",
    description: "A stable index of the published Echo Archives catalogue and its source-backed relationships.",
    canonical: buildAbsoluteUrl(siteUrl, "/data/archive.json"),
    homepage: buildAbsoluteUrl(siteUrl, "/"),
    sitemap: buildAbsoluteUrl(siteUrl, "/sitemap.xml"),
    counts: {
      publishedShows: publishedShows.length,
      collections: publicCollections.length,
      indexableCollections: indexableCollections.length,
      publicEntities: publicEntities.length,
      indexableEntities: indexableEntities.length,
    },
    resources: [
      buildResource({
        siteUrl,
        id: "shows",
        href: "/data/shows.json",
        recordType: "PodcastSeries",
        canonicalUrlTemplate: "/shows/{id}",
        description: "Published show records. Each record uses id as its stable archive identifier and href as its canonical route.",
      }),
      buildResource({
        siteUrl,
        id: "collections",
        href: "/data/collections.json",
        recordType: "CollectionPage",
        canonicalUrlTemplate: "/collections/{id}",
        description: "Public collection records. Membership is expressed by showIds and collection-specific context by showReasons.",
      }),
      buildResource({
        siteUrl,
        id: "entities",
        href: "/data/entities.json",
        recordType: "Organization or Person",
        canonicalUrlTemplate: "/creators/{id}",
        description: "Source-backed public creator, production-company, studio, and network records.",
      }),
      buildResource({
        siteUrl,
        id: "entity-graph",
        href: "/data/entity-graph.json",
        recordType: "EntityGraph",
        canonicalUrlTemplate: "/creators/{id}",
        description: "A derived, source-backed graph of typed show-to-entity edges, reverse show membership, and shared-show connections.",
      }),
      buildResource({
        siteUrl,
        id: "search-index",
        href: "/data/search-index.json",
        recordType: "PodcastSeries discovery projection",
        canonicalUrlTemplate: "/shows/{id}",
        description: "Search-oriented show projections. Use the shows resource for complete reference records.",
      }),
    ],
    relationships: [
      {
        source: "shows",
        field: "entityLinks",
        target: "entities",
        targetField: "id",
        relation: "typed-entity-credit",
        foreignKey: "entityId",
        roleField: "role",
      },
      {
        source: "shows",
        field: "similarTo",
        target: "shows",
        targetField: "id",
        relation: "curated-similarity",
        reasonField: "similarReasons",
      },
      {
        source: "collections",
        field: "showIds",
        target: "shows",
        targetField: "id",
        relation: "curated-membership",
        reasonField: "showReasons",
      },
    ],
  };

  if (lastModified) {
    manifest.lastModified = lastModified;
  }

  return manifest;
}

module.exports = {
  PUBLIC_REFERENCE_SCHEMA_VERSION,
  buildPublicReferenceManifest,
  latestDate,
};
