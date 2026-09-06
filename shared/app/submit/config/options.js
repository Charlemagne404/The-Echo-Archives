export const MODE_ORDER = ["show", "correction", "listener-review", "creator-verification"];
export const MODES_WITH_EXISTING_SHOW = new Set(["correction", "listener-review", "creator-verification"]);

export const FALLBACK_TAG_OPTIONS = [
  "Horror",
  "Sci-fi",
  "Mystery",
  "Fantasy",
  "Comedy",
  "Thriller",
  "Adventure",
  "Character-driven",
  "Found media",
  "Isolation",
  "Space",
  "Survival",
  "Time travel",
];

export const LISTEN_LINK_OPTIONS = ["Spotify", "Apple Podcasts", "RSS Feed", "Official Website", "YouTube", "Other"];

export const CORRECTION_TYPE_OPTIONS = [
  { value: "broken-link", label: "Broken link" },
  { value: "metadata", label: "Metadata error" },
  { value: "status", label: "Status update" },
  { value: "credits", label: "Credit correction" },
  { value: "creator-page", label: "Creator page" },
  { value: "artwork", label: "Artwork update" },
  { value: "other", label: "Other" },
];

export const CREATOR_PAGE_ISSUE_OPTIONS = [
  { value: "missing-page", label: "Missing creator page" },
  { value: "name-or-alias", label: "Name or alias" },
  { value: "organization-type", label: "Organization type" },
  { value: "show-connection", label: "Show connection" },
  { value: "official-links", label: "Official links" },
  { value: "description", label: "Description" },
  { value: "other", label: "Other creator detail" },
];

export const CORRECTION_LINK_ACTION_OPTIONS = [
  { value: "replace", label: "Replace link" },
  { value: "remove", label: "Remove link" },
];

export const CORRECTION_METADATA_FIELD_OPTIONS = [
  { value: "creator", label: "Creator or network" },
  { value: "description", label: "Description" },
  { value: "release-date", label: "Release date" },
  { value: "runtime", label: "Runtime" },
  { value: "language", label: "Language" },
  { value: "other", label: "Other metadata" },
];

export const CORRECTION_CREDIT_ACTION_OPTIONS = [
  { value: "add", label: "Add credit" },
  { value: "update", label: "Update credit" },
  { value: "remove", label: "Remove credit" },
];

export const COMPLETION_STATUS_OPTIONS = [
  { value: "ongoing", label: "Ongoing" },
  { value: "completed", label: "Completed" },
  { value: "hiatus", label: "On hiatus" },
  { value: "returning", label: "Returning / seasonal" },
  { value: "anthology", label: "Anthology" },
  { value: "unknown", label: "Unknown" },
];

export const SPOILER_LEVEL_OPTIONS = [
  {
    value: "spoiler-free",
    label: "Spoiler-free",
    description: "No plot details",
  },
  {
    value: "light-spoilers",
    label: "Mild spoilers",
    description: "Some details",
  },
  {
    value: "full-spoilers",
    label: "Full spoilers",
    description: "All spoilers",
  },
];

export const REVIEW_CONTEXT_OPTIONS = [
  "Long walks",
  "Headphones on",
  "Slow burn",
  "Serious sci-fi",
  "Horror",
  "Comedy",
  "Commute",
  "Background listening",
  "Relaxing",
  "Family-friendly",
  "Kids",
];

export const REVIEW_STRENGTH_OPTIONS = [
  "Atmosphere",
  "Sound design",
  "World-building",
  "Characters",
  "Story",
  "Acting",
  "Pacing",
  "Originality",
  "Emotional impact",
];

export const LISTENER_REVIEW_CATEGORIES = [
  { key: "voiceActing", label: "Voice acting", description: "1 = weak; 10 = exceptional" },
  { key: "soundDesign", label: "Sound design", description: "1 = weak; 10 = exceptional" },
  { key: "story", label: "Story", description: "1 = weak; 10 = exceptional" },
  { key: "characters", label: "Characters", description: "1 = weak; 10 = exceptional" },
  { key: "ads", label: "Ad experience", description: "1 = very disruptive; 10 = ad-free or unobtrusive" },
  { key: "length", label: "Episode length & pacing", description: "1 = poorly matched; 10 = feels right for the show" },
];

export const ROLE_OPTIONS = [
  { value: "creator", label: "Creator" },
  { value: "producer", label: "Producer" },
  { value: "network-representative", label: "Network representative" },
  { value: "publicist", label: "Publicist" },
  { value: "other", label: "Other" },
];

export const VERIFICATION_METHOD_OPTIONS = [
  {
    value: "official-domain-email",
    label: "Official domain email",
    description: "Best for factual updates",
  },
  {
    value: "website",
    label: "Website",
    description: "Official website proof",
  },
  {
    value: "social-account",
    label: "Social account",
    description: "Verified social proof",
  },
  {
    value: "press-kit",
    label: "Press kit",
    description: "Public press materials",
  },
  {
    value: "other",
    label: "Other",
    description: "Another way to prove it",
  },
];

export const OFFICIAL_LINK_OPTIONS = ["Website", "RSS Feed", "Spotify", "Apple Podcasts", "Press kit", "YouTube", "X (Twitter)", "Other"];
