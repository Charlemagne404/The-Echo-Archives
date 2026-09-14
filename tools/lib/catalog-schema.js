const SHOW_STATUSES = ["published", "draft"];
const REVIEW_STATUSES = ["full-review", "spotlight", "indexed-only", "imported", "planned"];
const RELEASE_STATUSES = ["active", "completed", "hiatus", "inactive", "unknown"];
const COMPLETION_STATUSES = ["ongoing", "finished", "cancelled", "unclear"];
const DISCOVERY_PROFILE_VALUES = Object.freeze({
  voiceStyle: Object.freeze(["primarily-acted", "primarily-narrated", "mixed"]),
  narrativeFocus: Object.freeze(["character-driven", "plot-driven", "balanced"]),
  intensity: Object.freeze(["low", "medium", "high", "variable"]),
  commitment: Object.freeze(["single-sitting", "short", "medium", "long", "deep-dive"]),
});
const DISCOVERY_PROFILE_FIELDS = Object.freeze(Object.keys(DISCOVERY_PROFILE_VALUES));

function isValidDiscoveryProfileValue(fieldName, value) {
  return DISCOVERY_PROFILE_VALUES[fieldName]?.includes(value) === true;
}

function slugToTitle(slug = "") {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function createShowTemplate({ id, title = "", today = "" }) {
  const resolvedTitle = String(title || "").trim() || slugToTitle(id) || "Untitled Show";
  const stamp = String(today || "").trim();

  return {
    id: String(id || "").trim(),
    title: resolvedTitle,
    subtitle: "",
    description: "Draft archive description pending editorial pass.",
    officialDescription: {
      text: "",
      sourceLabel: "",
      sourceUrl: "",
      verifiedAt: "",
    },
    provenance: {
      status: "legacy-unknown",
      sources: [],
      description: {
        origin: "unknown",
        sourceUrls: [],
      },
      artwork: {
        sourceUrl: "",
        sourceType: "unknown",
        rightsNote: "",
      },
      logos: [],
      rightsNotes: "",
    },
    cover: "images/TEA-Logo-S.png",
    coverAlt: `${resolvedTitle} cover art`,
    status: "draft",
    reviewStatus: "indexed-only",
    releaseStatus: "unknown",
    completionStatus: "unclear",
    listenLinks: {
      start: "",
      spotify: "",
      apple: "",
      website: "",
      rss: "",
    },
    genres: [],
    tones: [],
    formats: [],
    tags: [],
    aliases: [],
    themes: [],
    contentNotes: [],
    languages: [],
    transcriptLanguages: [],
    length: {
      label: "",
    },
    releaseDates: {
      first: "",
      latest: "",
    },
    ratings: {},
    facts: {},
    bestFor: [],
    similarTo: [],
    similarReasons: {},
    archiveTake: "",
    spoilerFreeReview: "",
    thoughts: "",
    quote: {
      text: "",
      attribution: "",
    },
    officialLinks: {
      website: "",
      patreon: "",
      discord: "",
      youtube: "",
    },
    credits: {},
    entityLinks: [],
    verification: {},
    availability: {},
    content: {},
    discovery: {},
    metadata: {
      objectiveSources: [],
      researchGaps: [],
    },
    featured: false,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

function createCollectionTemplate({ id, title = "", today = "", order = 0, showIds = [] }) {
  const resolvedTitle = String(title || "").trim() || slugToTitle(id) || "Untitled Collection";

  return {
    id: String(id || "").trim(),
    title: resolvedTitle,
    description: "Draft collection summary pending editorial pass.",
    showIds,
    coverShowIds: [],
    showReasons: {},
    intentTags: [],
    kind: "editorial",
    label: "",
    commitment: "",
    featured: false,
    order,
    createdAt: String(today || "").trim(),
    updatedAt: String(today || "").trim(),
  };
}

module.exports = {
  COMPLETION_STATUSES,
  DISCOVERY_PROFILE_FIELDS,
  DISCOVERY_PROFILE_VALUES,
  RELEASE_STATUSES,
  REVIEW_STATUSES,
  SHOW_STATUSES,
  createCollectionTemplate,
  createShowTemplate,
  isValidDiscoveryProfileValue,
  slugToTitle,
};
