export const BRAND_NAME = "The Echo Archives";
export const BRAND_DESCRIPTOR = "The Echo Archives — Audio Drama Discovery";
export const DEFAULT_SEO_DESCRIPTION =
  "Human-curated audio drama discovery with fiction podcast recommendations, reviews, listening collections, and similar-show routes.";

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
  if (text.length <= maxLength) return text;
  const slice = text.slice(0, maxLength - 1);
  const boundary = slice.lastIndexOf(" ");
  return `${slice.slice(0, boundary >= maxLength * 0.7 ? boundary : slice.length).replace(/[\s,;:.!?-]+$/, "")}…`;
}

export function buildShowSeoTitle(show = {}) {
  const title = cleanText(show.title) || "Audio drama";
  return show.reviewStatus === "full-review"
    ? `${title} Review & Similar Podcasts | ${BRAND_NAME}`
    : `${title}: Similar Audio Dramas | ${BRAND_NAME}`;
}

export function buildShowSeoDescription(show = {}) {
  const title = cleanText(show.title) || "This fiction podcast";
  const genres = [...new Set((show.genres || []).map(cleanText).filter(Boolean))].slice(0, 2).map(toDisplayTag);
  const genrePhrase = genres.length > 0 ? `${genres.join(" and ")} ` : "";
  const editorialText = cleanText(show.subtitle || show.description);
  const action = show.reviewStatus === "full-review"
    ? "Read the human-curated review and find similar fiction podcasts."
    : "Explore the archive guide and find similar fiction podcasts.";
  return truncateDescription(`Discover ${title}, a ${genrePhrase}audio drama. ${editorialText} ${action}`);
}

export function buildCollectionSeoTitle(collection = {}) {
  return `${cleanText(collection.title) || "Curated fiction podcasts"}: Audio Drama Recommendations | ${BRAND_NAME}`;
}

export function buildCollectionSeoDescription(collection = {}, shows = []) {
  const showTitles = [...new Set((shows || []).map((show) => cleanText(show?.title)).filter(Boolean))].slice(0, 3);
  const examples = showTitles.length > 0 ? ` Featuring ${showTitles.join(", ")}${shows.length > 3 ? ", and more" : ""}.` : "";
  return truncateDescription(
    `${truncateDescription(cleanText(collection.description), 72)} Human-curated audio drama and fiction podcast recommendations.${examples}`,
  );
}
