function isHttpUrl(value = "") {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_error) {
    return false;
  }
}

function isValidReviewDate(value = "") {
  if (!value) return true;
  const text = String(value || "").trim();
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return date.getFullYear() === Number(year) && date.getMonth() === Number(month) - 1 && date.getDate() === Number(day);
  }
  return Number.isFinite(Date.parse(text));
}

function isCompleteProvisionalIndexedEntry(record = {}) {
  const importer = record.metadata?.import || {};
  const publication = importer.publication || {};
  const factualReview = importer.factualReview || {};
  const scopeReview = importer.scopeReview || {};
  const identifiers = importer.identifiers || {};
  const reviewedAt = factualReview.reviewedAt;
  const reviewedBy = factualReview.reviewedBy;
  const revision = Number(factualReview.inputRevision);

  const hasStableIdentity = [
    identifiers.podcastGuid,
    identifiers.rssUrl,
    identifiers.appleCollectionId,
    identifiers.podcastIndexFeedId,
    identifiers.amazonMusicId,
  ].some((value) => String(value || "").trim());
  const hasSourceProvenance = Array.isArray(importer.selectedSources) && importer.selectedSources.some((source) => {
    const url = String(source?.sourceUrl || "").trim();
    return Boolean(url) && isHttpUrl(url);
  });
  const hasScopeEvidence = Array.isArray(scopeReview.evidenceSources) && scopeReview.evidenceSources.some((source) => {
    const url = String(source || "").trim();
    return Boolean(url) && isHttpUrl(url);
  });

  return Boolean(
    record.status === "published" &&
    record.reviewStatus === "indexed-only" &&
    publication.provisional === true &&
    isValidReviewDate(reviewedAt) &&
    String(reviewedBy || "").trim() &&
    Number.isInteger(revision) && revision >= 0 &&
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
