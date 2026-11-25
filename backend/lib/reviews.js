const fs = require("node:fs");
const path = require("node:path");
const { getReviewSourcePath } = require("../../tools/lib/catalog-source");

const REVIEWS_DIRECTORY = path.join("data", "reviews");

function getReviewFilePath(siteRoot, showId) {
  return getReviewSourcePath(siteRoot, showId);
}

function normalizeParagraphs(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || "").trim()).filter(Boolean);
  }

  if (typeof value !== "string") {
    return [];
  }

  return String(value)
    .split(/\n\s*\n+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function paragraphsToText(paragraphs) {
  return normalizeParagraphs(paragraphs).join(" ");
}

function normalizeQuote(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { text: "", attribution: "" };
  }

  return {
    text: String(value.text || "").trim(),
    attribution: String(value.attribution || "").trim(),
  };
}

function normalizeReviewRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error("Review companion files must contain an object.");
  }

  const spoilerFreeReviewParagraphs = normalizeParagraphs(record.spoilerFreeReview);
  const thoughtsParagraphs = normalizeParagraphs(record.thoughts);

  return {
    archiveTake: String(record.archiveTake || "").trim(),
    ...(String(record.publishedAt || "").trim() ? { publishedAt: String(record.publishedAt).trim() } : {}),
    spoilerFreeReview: spoilerFreeReviewParagraphs,
    thoughts: thoughtsParagraphs,
    quote: normalizeQuote(record.quote),
  };
}

function readReviewRecord(siteRoot, showId) {
  const filePath = getReviewFilePath(siteRoot, showId);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return normalizeReviewRecord(parsed);
}

function pickString(primaryValue, fallbackValue) {
  const primary = String(primaryValue || "").trim();
  if (primary) {
    return primary;
  }

  return String(fallbackValue || "").trim();
}

function pickParagraphs(primaryValue, fallbackValue) {
  const primaryParagraphs = normalizeParagraphs(primaryValue);
  if (primaryParagraphs.length > 0) {
    return primaryParagraphs;
  }

  return normalizeParagraphs(fallbackValue);
}

function pickQuote(primaryValue, fallbackValue) {
  const primaryQuote = normalizeQuote(primaryValue);
  if (primaryQuote.text) {
    return primaryQuote;
  }

  return normalizeQuote(fallbackValue);
}

function mergeReviewContent(record, reviewRecord) {
  const candidatePublishedAt = String(reviewRecord?.publishedAt || "").trim();
  const publishedReview = candidatePublishedAt && hasRichReviewContent(reviewRecord) ? reviewRecord : null;
  const archiveTake = pickString(publishedReview?.archiveTake, record.archiveTake);
  const spoilerFreeReviewParagraphs = pickParagraphs(publishedReview?.spoilerFreeReview, record.spoilerFreeReview);
  const thoughtsParagraphs = pickParagraphs(publishedReview?.thoughts, record.thoughts);
  const quote = pickQuote(publishedReview?.quote, record.quote);
  const reviewPublishedAt = String(publishedReview?.publishedAt || record.reviewPublishedAt || "").trim();
  const mergedRecord = {
    ...record,
    archiveTake,
    ...(reviewPublishedAt ? { reviewPublishedAt } : {}),
    spoilerFreeReview: paragraphsToText(spoilerFreeReviewParagraphs),
    spoilerFreeReviewParagraphs,
    thoughts: paragraphsToText(thoughtsParagraphs),
    thoughtsParagraphs,
    quote,
  };

  if (
    record.status === "published" &&
    ["indexed-only", "planned", "imported"].includes(record.reviewStatus) &&
    reviewPublishedAt &&
    hasRichReviewContent(mergedRecord)
  ) {
    mergedRecord.reviewStatus = "full-review";
  }

  return mergedRecord;
}

function hasRichReviewContent(record) {
  const archiveTake = String(record?.archiveTake || "").trim();
  const spoilerFreeReviewParagraphs = pickParagraphs(record?.spoilerFreeReviewParagraphs, record?.spoilerFreeReview);

  return Boolean(archiveTake && spoilerFreeReviewParagraphs.length > 0);
}

module.exports = {
  REVIEWS_DIRECTORY,
  getReviewFilePath,
  hasRichReviewContent,
  mergeReviewContent,
  normalizeParagraphs,
  normalizeQuote,
  normalizeReviewRecord,
  paragraphsToText,
  readReviewRecord,
};
