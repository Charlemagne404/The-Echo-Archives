const fs = require("node:fs");
const path = require("node:path");

const { buildCatalog } = require("../../../tools/build-catalog");
const {
  COLLECTIONS_SOURCE_DIR,
  RUNTIME_DATA_DIR,
  getReviewSourcePath,
  hasSplitCatalogSource,
  readCatalogSource,
  writeJsonFileAtomic,
  writeShowRecordsAtomically,
} = require("../../../tools/lib/catalog-source");
const { normalizeParagraphs, normalizeQuote, normalizeReviewRecord } = require("../reviews");
const { validateSiteData } = require("../../scripts/review-helpers");

const FULL_REVIEW_SOURCE_STATUSES = new Set(["imported", "indexed-only", "planned"]);

function text(value, limit = 4_000) {
  return String(value || "").trim().slice(0, limit);
}

function strings(value, limit = 12) {
  const seen = new Set();
  return (Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [])
    .map((entry) => text(entry, 160))
    .filter((entry) => {
      const key = entry.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

function hasDetailedLength(show = {}) {
  return Boolean(show.length && typeof show.length === "object" && Object.keys(show.length).length > 1);
}

function collectionMemberships(showId, collections = []) {
  return collections.filter((collection) => Array.isArray(collection.showIds) && collection.showIds.includes(showId));
}

function missingEditorialFields(show, review, collections, factualCurrent) {
  const missing = [];
  if (!factualCurrent) missing.push("current factual review");
  if (!Number.isFinite(Number(show.ratings?.archive))) missing.push("archive rating");
  if (!text(review?.archiveTake)) missing.push("archive take");
  if (!normalizeParagraphs(review?.spoilerFreeReview).length) missing.push("spoiler-safe review");
  if (!strings(show.tones).length) missing.push("tones");
  if (!strings(show.formats).length) missing.push("formats");
  if (!strings(show.bestFor).length) missing.push("best-for signals");
  if (!hasDetailedLength(show)) missing.push("detailed length");
  const similarTo = strings(show.similarTo, 5);
  if (similarTo.length < 3 || similarTo.length > 5) missing.push("3–5 similar shows");
  else if (similarTo.some((id) => !text(show.similarReasons?.[id]))) missing.push("similar-show reasons");
  const memberships = collectionMemberships(show.id, collections);
  if (memberships.length < 2) missing.push("two collection placements");
  else if (memberships.some((collection) => !text(collection.showReasons?.[show.id]))) missing.push("collection reasons");
  return missing;
}

function factualCurrentFor(show, candidate) {
  const factualReview = show.metadata?.import?.factualReview;
  return Boolean(
    factualReview?.reviewedAt ||
    (candidate?.factsReviewedAt && Number(candidate.factsReviewedRevision) === Number(candidate.inputRevision)),
  );
}

function sourceStrength(candidate) {
  const sources = candidate?.sources || [];
  const healthy = sources.filter((source) => ["fetched", "success", "not-modified", "cache-hit"].includes(source.fetchStatus)).length;
  return healthy >= 2 ? 25 : healthy === 1 ? 15 : 0;
}

function rarityScore(show, fullReviews) {
  const signals = [...strings(show.genres), ...strings(show.tags)];
  const counts = signals.map((signal) => fullReviews.filter((entry) => [...strings(entry.genres), ...strings(entry.tags)].some((value) => value.toLowerCase() === signal.toLowerCase())).length);
  if (!counts.length) return 0;
  const least = Math.min(...counts);
  return least === 0 ? 20 : least === 1 ? 12 : least <= 3 ? 6 : 0;
}

function rankEntry(show, candidate, collections, fullReviews, target) {
  const factors = [];
  const blockers = [];
  let score = 0;
  if (show.status !== "published") blockers.push("not published");
  if (candidate?.scopeStatus && candidate.scopeStatus !== "in-scope") blockers.push("outside confirmed scope");
  if (candidate?.hasDuplicateMatch || candidate?.conflicts?.length) blockers.push("unresolved duplicate or source conflict");
  if (!blockers.length) {
    score += 30;
    factors.push("Clear in-scope identity");
  }
  const sources = sourceStrength(candidate);
  score += sources;
  if (sources) factors.push(sources === 25 ? "Multiple healthy source snapshots" : "Healthy source snapshot");
  const factualFields = [show.description, show.listenLinks?.rss || show.listenLinks?.apple, show.cover, show.genres?.length, show.tags?.length, hasDetailedLength(show)]
    .filter(Boolean).length;
  const completeness = factualFields >= 6 ? 25 : factualFields >= 4 ? 15 : 5;
  score += completeness;
  factors.push(completeness === 25 ? "Strong factual baseline" : "Factual baseline has useful coverage");
  const factualCurrent = factualCurrentFor(show, candidate);
  if (target === "indexed-only") {
    if (show.reviewStatus !== "imported") blockers.push("already above Imported tier");
    if (!factualCurrent) factors.push("Needs named factual review before promotion");
    else {
      score += 20;
      factors.push("Factual review is already current");
    }
  } else {
    if (!FULL_REVIEW_SOURCE_STATUSES.has(show.reviewStatus)) blockers.push("not an elevatable review tier");
    const rarity = rarityScore(show, fullReviews);
    score += rarity;
    if (rarity) factors.push("Adds underrepresented discovery coverage");
    const memberships = collectionMemberships(show.id, collections).length;
    if (memberships < 2) {
      score += 10;
      factors.push("Could strengthen collection pathways");
    }
    if (strings(show.similarTo, 5).length < 3) {
      score += 10;
      factors.push("Could add useful similar-show routes");
    }
    const review = null;
    const editorialMissing = missingEditorialFields(show, review, collections, factualCurrent);
    if (!factualCurrent) factors.push("Start a factual elevation before publishing the review");
    if (editorialMissing.length <= 3) score += 10;
  }
  return {
    showId: show.id,
    title: show.title,
    reviewStatus: show.reviewStatus,
    target,
    score,
    factors,
    blockers,
    eligible: blockers.length === 0,
    createdAt: candidate?.createdAt || show.updatedAt || "",
  };
}

function buildBrief({ show, candidate, review, target, collections }) {
  const factualCurrent = factualCurrentFor(show, candidate);
  const editorialMissing = target === "full-review" ? missingEditorialFields(show, review, collections, factualCurrent) : [];
  const sourceLines = (candidate?.sources || []).map((source) => `- ${source.sourceType}: ${source.sourceUrl || source.sourceKey}`).join("\n") || "- No retained importer snapshot; use the published official links below.";
  return [
    `# Elevation brief: ${show.title}`,
    "",
    `Target: ${target}`,
    `Current tier: ${show.reviewStatus}`,
    `Factual review: ${factualCurrent ? "current" : "required before publication"}`,
    "",
    "## Current catalog facts",
    `- Creator: ${(show.credits?.creatorName || show.creators?.[0] || "unknown")}`,
    `- Description: ${show.description || "unknown"}`,
    `- RSS: ${show.listenLinks?.rss || "unknown"}`,
    `- Official website: ${show.officialLinks?.website || show.listenLinks?.website || "unknown"}`,
    `- Apple: ${show.listenLinks?.apple || "unknown"}`,
    `- Genres/tags: ${[...(show.genres || []), ...(show.tags || [])].join(", ") || "unknown"}`,
    "",
    "## Retained source evidence",
    sourceLines,
    "",
    "## Research constraints",
    "- Preserve official wording and attach source URLs for factual additions.",
    "- Do not invent ratings, completion claims, tags, recommendations, or review copy.",
    ...(editorialMissing.length ? ["", "## Still needed for a full review", ...editorialMissing.map((entry) => `- ${entry}`)] : []),
    "",
    "## Requested output",
    target === "indexed-only"
      ? "Return only verified factual corrections/additions with source URLs and clearly mark unknowns."
      : "Draft spoiler-safe editorial fields separately from verified facts: archive take, review paragraphs, optional quote, rating rationale, best-for signals, 3–5 similar shows with reasons, and collection placement reasons.",
  ].join("\n");
}

function normalizeDraft(raw = {}) {
  return {
    review: normalizeReviewRecord({
      archiveTake: text(raw.archiveTake, 500),
      spoilerFreeReview: normalizeParagraphs(raw.spoilerFreeReview),
      thoughts: normalizeParagraphs(raw.thoughts),
      quote: normalizeQuote({ text: text(raw.quoteText, 500), attribution: text(raw.quoteAttribution, 160) }),
    }),
    archiveRating: raw.archiveRating === "" || raw.archiveRating === undefined ? null : Number(raw.archiveRating),
    tones: strings(raw.tones),
    formats: strings(raw.formats),
    bestFor: strings(raw.bestFor),
    similarTo: strings(raw.similarTo, 5),
    similarReasons: raw.similarReasons && typeof raw.similarReasons === "object" ? Object.fromEntries(Object.entries(raw.similarReasons).map(([id, value]) => [text(id, 120), text(value, 500)]).filter(([id]) => id)) : {},
    collections: Array.isArray(raw.collections) ? raw.collections.map((entry) => ({ id: text(entry?.id, 120), reason: text(entry?.reason, 500) })).filter((entry) => entry.id) : [],
  };
}

function writeDirectChanges(siteRoot, source, show, collections, review, changedCollectionIds = []) {
  const backups = new Map();
  const remember = (filePath) => {
    if (!backups.has(filePath)) backups.set(filePath, fs.existsSync(filePath) ? fs.readFileSync(filePath) : null);
  };
  const write = (filePath, value) => {
    remember(filePath);
    writeJsonFileAtomic(filePath, value);
  };
  const showTransaction = writeShowRecordsAtomically(siteRoot, [show]);
  try {
    const reviewPath = getReviewSourcePath(siteRoot, show.id);
    write(reviewPath, review);
    if (hasSplitCatalogSource(siteRoot)) {
      const changed = new Set(changedCollectionIds);
      collections.filter((collection) => changed.has(collection.id)).forEach((collection) => write(path.join(siteRoot, COLLECTIONS_SOURCE_DIR, `${collection.id}.json`), collection));
    } else {
      write(path.join(siteRoot, RUNTIME_DATA_DIR, "collections.json"), collections);
    }
  } catch (error) {
    showTransaction.rollback();
    [...backups.entries()].reverse().forEach(([filePath, value]) => value === null ? fs.rmSync(filePath, { force: true }) : fs.writeFileSync(filePath, value));
    throw error;
  }
  return {
    rollback() {
      showTransaction.rollback();
      [...backups.entries()].reverse().forEach(([filePath, value]) => value === null ? fs.rmSync(filePath, { force: true }) : fs.writeFileSync(filePath, value));
    },
  };
}

function createElevationService({ staticRoot, importService, onPublished = null }) {
  function getShow(showId) {
    const source = readCatalogSource(staticRoot);
    const show = source.shows.find((entry) => entry.id === showId);
    if (!show) {
      const error = new Error("The catalogue record could not be found.");
      error.statusCode = 404;
      throw error;
    }
    return { source, show, review: source.reviewsById[showId] || null };
  }

  function listForMaintainer(target = "indexed-only") {
    const selectedTarget = target === "full-review" ? "full-review" : "indexed-only";
    const source = readCatalogSource(staticRoot);
    const fullReviews = source.shows.filter((show) => show.reviewStatus === "full-review");
    return {
      target: selectedTarget,
      items: source.shows
        .filter((show) => show.status === "published")
        .filter((show) => selectedTarget === "indexed-only" ? show.reviewStatus === "imported" : FULL_REVIEW_SOURCE_STATUSES.has(show.reviewStatus))
        .map((show) => rankEntry(show, importService.getPublishedCandidateForShow(show.id), source.collections, fullReviews, selectedTarget))
        .sort((left, right) => right.score - left.score || String(left.createdAt).localeCompare(String(right.createdAt)) || left.showId.localeCompare(right.showId)),
    };
  }

  function getForMaintainer(showId) {
    const { source, show, review } = getShow(showId);
    const candidate = importService.getPublishedCandidateForShow(showId);
    const factualCurrent = factualCurrentFor(show, candidate);
    return {
      show,
      review: review || { archiveTake: "", spoilerFreeReview: [], thoughts: [], quote: { text: "", attribution: "" } },
      candidate: candidate ? {
        id: candidate.id,
        status: candidate.status,
        inputRevision: candidate.inputRevision,
        factsReviewedAt: candidate.factsReviewedAt,
        factsReviewedRevision: candidate.factsReviewedRevision,
        conflicts: candidate.conflicts,
        sources: candidate.sources.map((entry) => ({ sourceType: entry.sourceType, sourceUrl: entry.sourceUrl, sourceKey: entry.sourceKey, fetchStatus: entry.fetchStatus, fetchedAt: entry.fetchedAt })),
      } : null,
      factualCurrent,
      editorialMissing: missingEditorialFields(show, review, source.collections, factualCurrent),
      collections: source.collections.map((collection) => ({ id: collection.id, title: collection.title, selected: collection.showIds?.includes(showId), reason: collection.showReasons?.[showId] || "" })),
    };
  }

  function createFactualDraft(showId, actor) {
    return importService.createElevationUpdateForMaintainer(showId, actor);
  }

  async function saveReviewDraft(showId, rawDraft = {}) {
    const { source, show } = getShow(showId);
    if (!FULL_REVIEW_SOURCE_STATUSES.has(show.reviewStatus)) {
      const error = new Error("This record cannot enter the full-review workflow.");
      error.statusCode = 409;
      throw error;
    }
    const draft = normalizeDraft(rawDraft);
    if (draft.archiveRating !== null && (!Number.isFinite(draft.archiveRating) || draft.archiveRating < 0 || draft.archiveRating > 10)) {
      const error = new Error("Archive rating must be between 0 and 10.");
      error.statusCode = 400;
      throw error;
    }
    const updatedShow = {
      ...show,
      reviewStatus: show.reviewStatus === "imported" ? "planned" : show.reviewStatus,
      updatedAt: new Date().toISOString().slice(0, 10),
    };
    if (draft.archiveRating !== null) updatedShow.ratings = { ...(show.ratings || {}), archive: draft.archiveRating };
    ["tones", "formats", "bestFor", "similarTo"].forEach((field) => {
      if (draft[field].length) updatedShow[field] = draft[field];
    });
    if (draft.similarTo.length) updatedShow.similarReasons = Object.fromEntries(draft.similarTo.map((id) => [id, draft.similarReasons[id] || ""]));
    const selected = new Map(draft.collections.map((entry) => [entry.id, entry.reason]));
    const changedCollectionIds = [];
    const updatedCollections = source.collections.map((collection) => {
      const currentlyIncluded = Array.isArray(collection.showIds) && collection.showIds.includes(showId);
      const requested = selected.has(collection.id);
      if (!currentlyIncluded && !requested) return collection;
      const showIds = (collection.showIds || []).filter((id) => id !== showId);
      if (requested) showIds.push(showId);
      const showReasons = { ...(collection.showReasons || {}) };
      if (requested) showReasons[showId] = selected.get(collection.id);
      else delete showReasons[showId];
      changedCollectionIds.push(collection.id);
      return { ...collection, showIds, showReasons, updatedAt: updatedShow.updatedAt };
    });
    const transaction = writeDirectChanges(staticRoot, source, updatedShow, updatedCollections, draft.review, changedCollectionIds);
    try {
      await validateSiteData(staticRoot);
      if (typeof onPublished === "function") await onPublished();
    } catch (error) {
      transaction.rollback();
      throw error;
    }
    return getForMaintainer(showId);
  }

  async function publishReview(showId, actor = "") {
    const { source, show, review } = getShow(showId);
    const candidate = importService.getPublishedCandidateForShow(showId);
    const factualCurrent = factualCurrentFor(show, candidate);
    const missing = missingEditorialFields(show, review, source.collections, factualCurrent);
    if (missing.length) {
      const error = new Error(`Full review is incomplete: ${missing.join(", ")}.`);
      error.statusCode = 409;
      throw error;
    }
    const published = { ...show, reviewStatus: "full-review", updatedAt: new Date().toISOString().slice(0, 10) };
    const transaction = writeShowRecordsAtomically(staticRoot, [published]);
    try {
      await validateSiteData(staticRoot);
      if (typeof onPublished === "function") await onPublished();
      return { showId, reviewStatus: "full-review", reviewedBy: text(actor, 160) || "authenticated-maintainer" };
    } catch (error) {
      transaction.rollback();
      await buildCatalog(staticRoot).catch(() => {});
      throw error;
    }
  }

  function buildCodexBrief(showId, target = "indexed-only") {
    const { source, show, review } = getShow(showId);
    return { brief: buildBrief({ show, candidate: importService.getPublishedCandidateForShow(showId), review, target: target === "full-review" ? "full-review" : "indexed-only", collections: source.collections }) };
  }

  return { buildCodexBrief, createFactualDraft, getForMaintainer, listForMaintainer, publishReview, saveReviewDraft };
}

module.exports = { createElevationService, rankEntry };
