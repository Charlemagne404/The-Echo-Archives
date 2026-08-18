const TAXONOMY = require("../catalog-src/tag-taxonomy.json");

const MIN_PUBLISHED_DISCOVERY_TAGS = 0;
const MIN_PUBLISHED_DISCOVERY_SIGNALS = 2;
const MAX_PUBLISHED_DISCOVERY_TAGS = 4;
const MIN_DISCOVERY_TAG_LENGTH = 2;
const MAX_DISCOVERY_TAG_LENGTH = 48;
const APPROVED_DISCOVERY_TAG_STATUS = "approved";
const PROVISIONAL_DISCOVERY_TAG_STATUS = "provisional";
const DEPRECATED_DISCOVERY_TAG_STATUS = "deprecated";

const SCI_FI_TAG_PATTERN = /^(?:sci[\s-]*fi|scifi|science[\s-]*fiction)$/i;
const REDUNDANT_DISCOVERY_TAGS = new Set([
  "arts",
  "audio drama",
  "audio dramas",
  "audio fiction",
  "audiodrama",
  "audiodramas",
  "drama",
  "fiction",
  "fiction podcast",
  "fiction podcasts",
  "games & hobbies",
  "hobbies",
  "performing arts",
  "podcast",
  "podcast fiction",
  "podcasts",
  "scripted fiction",
  "scripted podcast",
  "scripted podcasts",
]);

function normalizeDiscoveryTagKey(value = "") {
  return String(value || "").trim().toLowerCase();
}

const taxonomyEntries = Array.isArray(TAXONOMY.tags) ? TAXONOMY.tags : [];
const taxonomyByLabel = new Map(taxonomyEntries.map((entry) => [normalizeDiscoveryTagKey(entry.label), entry]));
const taxonomyAliases = new Map(
  Object.entries(TAXONOMY.aliases || {}).map(([alias, label]) => [normalizeDiscoveryTagKey(alias), label]),
);
const DISCOVERY_TAG_ALIASES = new Map([
  ...taxonomyAliases.entries(),
  ["alt-history", "Alternate history"],
  ["alternate history", "Alternate history"],
  ["analogue horror", "Analog horror"],
  ["dystopia", "Dystopian"],
  ["folk horror", "Folk horror"],
]);

function assertDiscoveryTaxonomyIntegrity() {
  const ids = new Set();
  const labels = new Set();
  const statuses = new Set([
    APPROVED_DISCOVERY_TAG_STATUS,
    PROVISIONAL_DISCOVERY_TAG_STATUS,
    DEPRECATED_DISCOVERY_TAG_STATUS,
  ]);

  taxonomyEntries.forEach((entry) => {
    if (!entry || typeof entry !== "object" || !entry.id || !entry.label || !statuses.has(entry.status)) {
      throw new Error("Discovery taxonomy contains an invalid entry.");
    }
    if (ids.has(entry.id) || labels.has(normalizeDiscoveryTagKey(entry.label))) {
      throw new Error(`Discovery taxonomy contains a duplicate entry for "${entry.label}".`);
    }
    ids.add(entry.id);
    labels.add(normalizeDiscoveryTagKey(entry.label));

    if (entry.status === PROVISIONAL_DISCOVERY_TAG_STATUS) {
      const hasEvidence = Array.isArray(entry.evidence) && entry.evidence.some((value) => /^https?:\/\//.test(String(value || "")));
      if (!String(entry.rationale || "").trim() || !hasEvidence || !/^\d{4}-\d{2}-\d{2}$/.test(String(entry.reviewBy || ""))) {
        throw new Error(`Provisional discovery tag "${entry.label}" requires rationale, evidence, and reviewBy.`);
      }
    }
  });
}

assertDiscoveryTaxonomyIntegrity();

function canonicalizeDiscoveryTag(value = "") {
  const tag = String(value || "").trim();
  const key = normalizeDiscoveryTagKey(tag);
  if (!tag) return "";
  if (taxonomyByLabel.has(key)) return taxonomyByLabel.get(key).label;
  const alias = DISCOVERY_TAG_ALIASES.get(key);
  if (alias) return alias;
  return /^[a-z]/.test(tag) ? `${tag.charAt(0).toUpperCase()}${tag.slice(1)}` : tag;
}

function getDiscoveryTag(value = "") {
  return taxonomyByLabel.get(normalizeDiscoveryTagKey(canonicalizeDiscoveryTag(value))) || null;
}

function discoveryTagStatus(value = "") {
  return getDiscoveryTag(value)?.status || null;
}

function isApprovedDiscoveryTag(value = "") {
  return discoveryTagStatus(value) === APPROVED_DISCOVERY_TAG_STATUS;
}

function isProvisionalDiscoveryTag(value = "") {
  return discoveryTagStatus(value) === PROVISIONAL_DISCOVERY_TAG_STATUS;
}

function isDeprecatedDiscoveryTag(value = "") {
  return discoveryTagStatus(value) === DEPRECATED_DISCOVERY_TAG_STATUS;
}

function isRedundantDiscoveryTag(value = "") {
  return REDUNDANT_DISCOVERY_TAGS.has(normalizeDiscoveryTagKey(value));
}

function normalizeDiscoveryTags(values = []) {
  const seen = new Set();

  return (Array.isArray(values) ? values : [])
    .map(canonicalizeDiscoveryTag)
    .filter((tag) => tag && !isRedundantDiscoveryTag(tag))
    .filter((tag) => {
      const key = normalizeDiscoveryTagKey(tag);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_PUBLISHED_DISCOVERY_TAGS);
}

function getDiscoveryTaxonomy() {
  return {
    version: TAXONOMY.version,
    facets: TAXONOMY.facets || [],
    tags: taxonomyEntries.map(({ id, label, facet, status }) => ({ id, label, facet, status })),
  };
}

module.exports = {
  APPROVED_DISCOVERY_TAG_STATUS,
  DEPRECATED_DISCOVERY_TAG_STATUS,
  DISCOVERY_TAG_ALIASES,
  MAX_DISCOVERY_TAG_LENGTH,
  MAX_PUBLISHED_DISCOVERY_TAGS,
  MIN_DISCOVERY_TAG_LENGTH,
  MIN_PUBLISHED_DISCOVERY_SIGNALS,
  MIN_PUBLISHED_DISCOVERY_TAGS,
  REDUNDANT_DISCOVERY_TAGS,
  SCI_FI_TAG_PATTERN,
  canonicalizeDiscoveryTag,
  assertDiscoveryTaxonomyIntegrity,
  discoveryTagStatus,
  getDiscoveryTag,
  getDiscoveryTaxonomy,
  isApprovedDiscoveryTag,
  isDeprecatedDiscoveryTag,
  isProvisionalDiscoveryTag,
  isRedundantDiscoveryTag,
  normalizeDiscoveryTagKey,
  normalizeDiscoveryTags,
};
