const PROVENANCE_STATUSES = Object.freeze(["documented", "legacy-unknown"]);
const SOURCE_TYPES = Object.freeze([
  "official-website",
  "rss-feed",
  "official-platform",
  "creator-provided",
  "press-kit",
  "third-party-database",
  "manually-entered",
  "unknown",
]);
const DESCRIPTION_ORIGINS = Object.freeze([
  "original-to-echo",
  "sourced-externally",
  "mixed",
  "unknown",
]);

const SOURCE_TYPE_ALIASES = Object.freeze({
  website: "official-website",
  "official-site": "official-website",
  rss: "rss-feed",
  feed: "rss-feed",
  apple: "official-platform",
  creator: "creator-provided",
  presskit: "press-kit",
  "podcast-index": "third-party-database",
  "external-research": "third-party-database",
  database: "third-party-database",
  manual: "manually-entered",
  maintainer: "manually-entered",
});

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function boundedString(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isHttpUrl(value) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function mapSourceType(value) {
  const raw = boundedString(value, 80).toLowerCase().replace(/[ _]+/g, "-");
  if (SOURCE_TYPES.includes(raw)) return raw;
  return SOURCE_TYPE_ALIASES[raw] || "unknown";
}

function normalizeSourceEntry(entry, fallbackType = "unknown") {
  const source = typeof entry === "string" ? { sourceUrl: entry } : isRecord(entry) ? entry : {};
  const sourceUrl = boundedString(source.sourceUrl || source.url, 1200);
  const sourceType = mapSourceType(source.sourceType || fallbackType);
  const note = boundedString(source.note, 1000);

  return {
    sourceUrl,
    sourceType,
    ...(note ? { note } : {}),
  };
}

function normalizeSourceArray(value, maxItems = 20, fallbackType = "unknown") {
  if (!Array.isArray(value)) return [];

  const seen = new Set();
  const normalized = [];
  for (const entry of value) {
    const source = normalizeSourceEntry(entry, fallbackType);
    if (!source.sourceUrl && !source.note) continue;
    const key = `${source.sourceType}|${source.sourceUrl}|${source.note || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(source);
    if (normalized.length >= maxItems) break;
  }
  return normalized;
}

function normalizeAsset(value) {
  const asset = isRecord(value) ? value : {};
  const sourceUrl = boundedString(asset.sourceUrl || asset.url, 1200);
  const sourceType = mapSourceType(asset.sourceType);
  const rightsNote = boundedString(asset.rightsNote, 1000);

  return {
    sourceUrl,
    sourceType,
    ...(rightsNote ? { rightsNote } : {}),
  };
}

function normalizeProvenance(value) {
  if (!isRecord(value)) return null;

  const description = isRecord(value.description) ? value.description : {};
  const descriptionOrigin = boundedString(description.origin, 60);
  const descriptionSourceUrls = Array.isArray(description.sourceUrls)
    ? [...new Set(description.sourceUrls.map((url) => boundedString(url, 1200)).filter(Boolean))].slice(0, 20)
    : [];
  const sources = normalizeSourceArray(value.sources);
  const artwork = normalizeAsset(value.artwork);
  const logos = Array.isArray(value.logos)
    ? value.logos.map(normalizeAsset).filter((asset) => asset.sourceUrl || asset.rightsNote).slice(0, 8)
    : [];
  const rightsNotes = boundedString(value.rightsNotes, 2000);
  const hasDetails = Boolean(
    sources.length ||
      descriptionSourceUrls.length ||
      artwork.sourceUrl ||
      logos.length ||
      rightsNotes,
  );
  const rawStatus = boundedString(value.status, 40);
  const status = PROVENANCE_STATUSES.includes(rawStatus)
    ? rawStatus
    : hasDetails
      ? "documented"
      : "legacy-unknown";

  return {
    status,
    sources,
    description: {
      origin: DESCRIPTION_ORIGINS.includes(descriptionOrigin) ? descriptionOrigin : "unknown",
      sourceUrls: descriptionSourceUrls,
    },
    artwork,
    logos,
    ...(rightsNotes ? { rightsNotes } : {}),
  };
}

function assertBoundedString(value, field, maxLength) {
  if (typeof value !== "string") throw new Error(`Provenance ${field} must be a string`);
  if (value.length > maxLength) throw new Error(`Provenance ${field} is too long`);
}

function validateSourceEntry(showId, entry, field) {
  if (!isRecord(entry)) throw new Error(`Show ${showId} provenance ${field} must contain objects`);
  assertBoundedString(entry.sourceUrl, `${field}.sourceUrl`, 1200);
  if (!isHttpUrl(entry.sourceUrl)) {
    throw new Error(`Show ${showId} provenance ${field}.sourceUrl must be an HTTP(S) URL`);
  }
  if (typeof entry.sourceType !== "string" || !SOURCE_TYPES.includes(entry.sourceType)) {
    throw new Error(`Show ${showId} provenance ${field}.sourceType is invalid`);
  }
  if (entry.note !== undefined) assertBoundedString(entry.note, `${field}.note`, 1000);
}

function validateAsset(showId, value, field) {
  if (value === undefined) return;
  if (!isRecord(value)) throw new Error(`Show ${showId} provenance ${field} must be an object`);
  assertBoundedString(value.sourceUrl, `${field}.sourceUrl`, 1200);
  if (!isHttpUrl(value.sourceUrl)) {
    throw new Error(`Show ${showId} provenance ${field}.sourceUrl must be an HTTP(S) URL`);
  }
  if (typeof value.sourceType !== "string" || !SOURCE_TYPES.includes(value.sourceType)) {
    throw new Error(`Show ${showId} provenance ${field}.sourceType is invalid`);
  }
  if (value.rightsNote !== undefined) assertBoundedString(value.rightsNote, `${field}.rightsNote`, 1000);
}

function validateProvenance(showId, value) {
  if (value === undefined) return;
  if (!isRecord(value)) throw new Error(`Show ${showId} provenance must be an object`);
  if (typeof value.status !== "string" || !PROVENANCE_STATUSES.includes(value.status)) {
    throw new Error(`Show ${showId} provenance.status is invalid`);
  }
  if (!Array.isArray(value.sources)) throw new Error(`Show ${showId} provenance.sources must be an array`);
  value.sources.forEach((entry, index) => validateSourceEntry(showId, entry, `sources[${index}]`));

  if (!isRecord(value.description)) throw new Error(`Show ${showId} provenance.description must be an object`);
  if (typeof value.description.origin !== "string" || !DESCRIPTION_ORIGINS.includes(value.description.origin)) {
    throw new Error(`Show ${showId} provenance.description.origin is invalid`);
  }
  if (!Array.isArray(value.description.sourceUrls)) {
    throw new Error(`Show ${showId} provenance.description.sourceUrls must be an array`);
  }
  value.description.sourceUrls.forEach((url, index) => {
    assertBoundedString(url, `description.sourceUrls[${index}]`, 1200);
    if (!isHttpUrl(url)) throw new Error(`Show ${showId} provenance description source URL must be an HTTP(S) URL`);
  });

  validateAsset(showId, value.artwork, "artwork");
  if (!Array.isArray(value.logos)) throw new Error(`Show ${showId} provenance.logos must be an array`);
  value.logos.forEach((asset, index) => validateAsset(showId, asset, `logos[${index}]`));
  if (value.rightsNotes !== undefined) assertBoundedString(value.rightsNotes, "rightsNotes", 2000);
}

function evidenceEntries(value, fallbackType = "unknown") {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => normalizeSourceEntry(entry, fallbackType)).filter((entry) => entry.sourceUrl);
}

function buildImportedProvenance({ candidate = {}, objective = {}, sourceReferences = [], externalSources = [] } = {}) {
  const candidateProvenance = isRecord(candidate.provenance) ? candidate.provenance : {};
  const fields = isRecord(candidateProvenance.fields) ? candidateProvenance.fields : {};
  const externalResearch = isRecord(objective.externalResearch) ? objective.externalResearch : {};
  const fieldSources = isRecord(externalResearch.fieldSources) ? externalResearch.fieldSources : {};

  const sources = normalizeSourceArray([
    ...sourceReferences,
    ...externalSources.map((sourceUrl) => ({ sourceUrl, sourceType: "third-party-database" })),
  ]);
  const descriptionEvidence = evidenceEntries(
    Array.isArray(fields.description?.sources) && fields.description.sources.length
      ? fields.description.sources
      : fieldSources.description,
  );
  const descriptionSourceUrls = [...new Set(descriptionEvidence.map((entry) => entry.sourceUrl))].slice(0, 20);
  const artworkEvidence = evidenceEntries(fields.artworkUrl?.sources);
  const artworkSource = artworkEvidence[0] || normalizeSourceEntry({
    sourceUrl: objective.artworkUrl,
    sourceType: candidate.primarySourceType,
  });

  const provenance = normalizeProvenance({
    status: "documented",
    sources,
    description: {
      origin: descriptionSourceUrls.length ? "sourced-externally" : "unknown",
      sourceUrls: descriptionSourceUrls,
    },
    artwork: {
      sourceUrl: artworkSource.sourceUrl,
      sourceType: artworkSource.sourceType,
      rightsNote: artworkSource.sourceUrl
        ? "Third-party artwork source recorded; licence or permission is not separately confirmed."
        : "",
    },
    rightsNotes: "Source URLs are recorded for attribution and correction work; this record does not assert a licence or permission to reuse third-party artwork or text.",
  });
  validateProvenance("imported-record", provenance);
  return provenance;
}

module.exports = {
  DESCRIPTION_ORIGINS,
  PROVENANCE_STATUSES,
  SOURCE_TYPES,
  buildImportedProvenance,
  mapSourceType,
  normalizeProvenance,
  validateProvenance,
};
