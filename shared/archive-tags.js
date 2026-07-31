const CANONICAL_SCI_FI_TAG = "Sci-fi";
const MIN_PUBLISHED_DISCOVERY_TAGS = 2;
const MAX_PUBLISHED_DISCOVERY_TAGS = 6;
const MIN_DISCOVERY_TAG_LENGTH = 2;
const MAX_DISCOVERY_TAG_LENGTH = 48;

const SCI_FI_TAG_PATTERN = /^(?:sci[\s-]*fi|scifi|science[\s-]*fiction)$/i;
const DISCOVERY_TAG_ALIASES = new Map([
  ["'80s", "1980s"],
  ["alt-history", "Alternate history"],
  ["alternate history", "Alternate history"],
  ["analog horror", "Analog horror"],
  ["analogue horror", "Analog horror"],
  ["dystopia", "Dystopian"],
  ["folk horror", "Folk horror"],
  ["foundaudio", "Found audio"],
  ["full-cast", "Full cast"],
  ["full cast", "Full cast"],
  ["science fiction", CANONICAL_SCI_FI_TAG],
  ["science-fiction", CANONICAL_SCI_FI_TAG],
  ["sci fi", CANONICAL_SCI_FI_TAG],
  ["sci-fi", CANONICAL_SCI_FI_TAG],
  ["scifi", CANONICAL_SCI_FI_TAG],
]);
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

function canonicalizeDiscoveryTag(value = "") {
  const tag = String(value || "").trim();
  const alias = DISCOVERY_TAG_ALIASES.get(normalizeDiscoveryTagKey(tag));
  if (alias) return alias;
  if (/^[a-z]/.test(tag)) return `${tag.charAt(0).toUpperCase()}${tag.slice(1)}`;
  return tag;
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

module.exports = {
  CANONICAL_SCI_FI_TAG,
  DISCOVERY_TAG_ALIASES,
  MAX_DISCOVERY_TAG_LENGTH,
  MAX_PUBLISHED_DISCOVERY_TAGS,
  MIN_DISCOVERY_TAG_LENGTH,
  MIN_PUBLISHED_DISCOVERY_TAGS,
  REDUNDANT_DISCOVERY_TAGS,
  SCI_FI_TAG_PATTERN,
  canonicalizeDiscoveryTag,
  isRedundantDiscoveryTag,
  normalizeDiscoveryTagKey,
  normalizeDiscoveryTags,
};
