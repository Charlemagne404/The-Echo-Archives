const CANONICAL_SCI_FI_TAG = "Sci-fi";
const MIN_PUBLISHED_DISCOVERY_TAGS = 2;

const SCI_FI_TAG_PATTERN = /^(?:sci[\s-]*fi|scifi|science[\s-]*fiction)$/i;
const REDUNDANT_DISCOVERY_TAGS = new Set([
  "arts",
  "audio drama",
  "audio fiction",
  "audiodrama",
  "drama",
  "fiction",
  "games & hobbies",
  "hobbies",
  "performing arts",
  "podcast",
]);

function normalizeDiscoveryTagKey(value = "") {
  return String(value || "").trim().toLowerCase();
}

function canonicalizeDiscoveryTag(value = "") {
  const tag = String(value || "").trim();
  return SCI_FI_TAG_PATTERN.test(tag) ? CANONICAL_SCI_FI_TAG : tag;
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
    });
}

module.exports = {
  CANONICAL_SCI_FI_TAG,
  MIN_PUBLISHED_DISCOVERY_TAGS,
  REDUNDANT_DISCOVERY_TAGS,
  SCI_FI_TAG_PATTERN,
  canonicalizeDiscoveryTag,
  isRedundantDiscoveryTag,
  normalizeDiscoveryTagKey,
  normalizeDiscoveryTags,
};
