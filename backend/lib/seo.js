const BRAND_NAME = "The Echo Archives";
const BRAND_DESCRIPTOR = "The Echo Archives — Audio Drama Discovery";
const DEFAULT_DESCRIPTION =
  "Human-curated audio drama discovery with fiction podcast recommendations, reviews, listening collections, and similar-show routes.";
const COLLECTION_MIN_INDEXABLE_SHOWS = 4;
const COLLECTION_MIN_DESCRIPTION_LENGTH = 60;

function normalizeSiteUrl(siteUrl = "") {
  return String(siteUrl || "").replace(/\/+$/, "");
}

function buildAbsoluteUrl(siteUrl, value = "") {
  const normalizedSiteUrl = normalizeSiteUrl(siteUrl);

  try {
    return new URL(value, `${normalizedSiteUrl}/`).toString();
  } catch (_error) {
    return `${normalizedSiteUrl}${value}`;
  }
}

function buildShowPath(showId = "") {
  return `/shows/${encodeURIComponent(String(showId || "").trim())}`;
}

function buildCollectionPath(collectionId = "") {
  return `/collections/${encodeURIComponent(String(collectionId || "").trim())}`;
}

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function toDisplayTag(value = "") {
  return cleanText(value)
    .split(/[-\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function truncateDescription(value, maxLength = 160) {
  const text = cleanText(value);
  if (text.length <= maxLength) {
    return text;
  }

  const slice = text.slice(0, maxLength - 1);
  const boundary = slice.lastIndexOf(" ");
  return `${slice.slice(0, boundary >= maxLength * 0.7 ? boundary : slice.length).replace(/[\s,;:.!?-]+$/, "")}…`;
}

function uniqueText(values = []) {
  const seen = new Set();
  return (Array.isArray(values) ? values : []).map(cleanText).filter((value) => {
    const key = value.toLowerCase();
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildShowSeoTitle(show = {}) {
  const title = cleanText(show.title) || "Audio drama";
  return show.reviewStatus === "full-review"
    ? `${title} Review & Similar Podcasts | ${BRAND_NAME}`
    : `${title}: Similar Audio Dramas | ${BRAND_NAME}`;
}

function buildShowSeoDescription(show = {}) {
  const title = cleanText(show.title) || "This fiction podcast";
  const genres = uniqueText(show.genres).slice(0, 2).map(toDisplayTag);
  const genrePhrase = genres.length > 0 ? `${genres.join(" and ")} ` : "";
  const editorialText = cleanText(show.subtitle || show.description);
  const action = show.reviewStatus === "full-review"
    ? "Read the human-curated review and find similar fiction podcasts."
    : "Explore the archive guide and find similar fiction podcasts.";
  return truncateDescription(`Discover ${title}, a ${genrePhrase}audio drama. ${editorialText} ${action}`);
}

function buildCollectionSeoTitle(collection = {}) {
  const title = cleanText(collection.title) || "Curated fiction podcasts";
  return `${title}: Audio Drama Recommendations | ${BRAND_NAME}`;
}

function buildCollectionSeoDescription(collection = {}, collectionShows = []) {
  const description = truncateDescription(cleanText(collection.description), 72);
  const showTitles = uniqueText(collectionShows.map((show) => show?.title)).slice(0, 3);
  const examples = showTitles.length > 0 ? ` Featuring ${showTitles.join(", ")}${collectionShows.length > 3 ? ", and more" : ""}.` : "";
  return truncateDescription(`${description} Human-curated audio drama and fiction podcast recommendations.${examples}`);
}

function isIndexableCollection(collection = {}, collectionShows = []) {
  const shows = Array.isArray(collectionShows) ? collectionShows.filter(Boolean) : [];
  const reasons = collection.showReasons && typeof collection.showReasons === "object" ? collection.showReasons : {};
  const hasReasonForEveryShow = shows.every((show) => cleanText(reasons[show.id]).length >= 20);

  return (
    cleanText(collection.title).length > 0 &&
    cleanText(collection.description).length >= COLLECTION_MIN_DESCRIPTION_LENGTH &&
    shows.length >= COLLECTION_MIN_INDEXABLE_SHOWS &&
    hasReasonForEveryShow
  );
}

module.exports = {
  BRAND_DESCRIPTOR,
  BRAND_NAME,
  COLLECTION_MIN_DESCRIPTION_LENGTH,
  COLLECTION_MIN_INDEXABLE_SHOWS,
  DEFAULT_DESCRIPTION,
  buildAbsoluteUrl,
  buildCollectionPath,
  buildCollectionSeoDescription,
  buildCollectionSeoTitle,
  buildShowPath,
  buildShowSeoDescription,
  buildShowSeoTitle,
  cleanText,
  isIndexableCollection,
  normalizeSiteUrl,
  truncateDescription,
};
