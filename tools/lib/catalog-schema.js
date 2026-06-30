const SHOW_STATUSES = ["published", "draft"];
const REVIEW_STATUSES = ["full-review", "spotlight", "indexed-only", "planned"];
const RELEASE_STATUSES = ["active", "completed", "hiatus", "inactive", "unknown"];
const COMPLETION_STATUSES = ["ongoing", "finished", "cancelled", "unclear"];

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
    cover: "images/TEA-Logo-S.png",
    coverAlt: `${resolvedTitle} cover art`,
    status: "draft",
    reviewStatus: "indexed-only",
    releaseStatus: "unknown",
    completionStatus: "unclear",
    listenLinks: {
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
    verification: {},
    availability: {},
    content: {},
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
  RELEASE_STATUSES,
  REVIEW_STATUSES,
  SHOW_STATUSES,
  createCollectionTemplate,
  createShowTemplate,
  slugToTitle,
};
