function isHttpUrl(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
  } catch (_error) {
    return false;
  }
}

function isStableImportedIdentity(value) {
  if (typeof value !== "string" && typeof value !== "number") return false;
  return String(value).trim().length > 0;
}

function isCompleteProvisionalIndexedEntry(record = {}) {
  const importer = record.metadata?.import || {};
  const publication = importer.publication || {};
  const factualReview = importer.factualReview || {};
  const scopeReview = importer.scopeReview || {};
  const identifiers = importer.identifiers || {};
  const reviewedAt = factualReview.reviewedAt;
  const reviewedBy = factualReview.reviewedBy;
  const revision = factualReview.inputRevision;
  const timestamp = typeof reviewedAt === "string" && reviewedAt.trim() ? Date.parse(reviewedAt) : Number.NaN;

  const hasStableIdentity = [
    identifiers.podcastGuid,
    identifiers.rssUrl,
    identifiers.appleCollectionId,
    identifiers.podcastIndexFeedId,
    identifiers.amazonMusicId,
  ].some(isStableImportedIdentity);
  const hasSourceProvenance = Array.isArray(importer.selectedSources) && importer.selectedSources.some((source) =>
    source && typeof source.sourceType === "string" && source.sourceType.trim() && isHttpUrl(source.sourceUrl));
  const hasScopeEvidence = Array.isArray(scopeReview.evidenceSources) && scopeReview.evidenceSources.some(isHttpUrl);

  return Boolean(
    record.status === "published" &&
    record.reviewStatus === "indexed-only" &&
    publication.provisional === true &&
    Number.isFinite(timestamp) &&
    typeof reviewedBy === "string" && reviewedBy.trim() &&
    Number.isInteger(revision) && revision > 0 &&
    scopeReview.status === "in-scope" &&
    scopeReview.inputRevision === revision &&
    scopeReview.reviewedAt === reviewedAt &&
    scopeReview.reviewedBy === reviewedBy &&
    hasStableIdentity &&
    hasSourceProvenance &&
    hasScopeEvidence,
  );
}

module.exports = { isCompleteProvisionalIndexedEntry };
