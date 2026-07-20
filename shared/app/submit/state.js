import {
  LISTEN_LINK_OPTIONS,
  MODE_CONFIG,
  MODES_WITH_EXISTING_SHOW,
  OFFICIAL_LINK_OPTIONS,
} from "./config.js";
import { pickNextLinkOption } from "./utils.js";

export function seedStateFromParams(state) {
  const params = new URLSearchParams(window.location.search);
  const requestedMode = params.get("submissionType");
  if (requestedMode && Object.hasOwn(MODE_CONFIG, requestedMode)) {
    state.activeMode = requestedMode;
  }

  const requestedShowId = params.get("showId");
  if (!requestedShowId || !state.showMap.has(requestedShowId)) {
    state.searchOpen = false;
    return { requestedMode: state.activeMode, requestedShowId: requestedShowId || "" };
  }

  const show = state.showMap.get(requestedShowId);
  for (const mode of MODES_WITH_EXISTING_SHOW) {
    state.drafts[mode].existingShowId = show.id;
    state.drafts[mode].showSearch = show.title;
  }
  state.searchOpen = false;
  return { requestedMode: state.activeMode, requestedShowId };
}

export function createDrafts() {
  return {
    show: createDraft("show"),
    correction: createDraft("correction"),
    "listener-review": createDraft("listener-review"),
    "creator-verification": createDraft("creator-verification"),
  };
}

export function createDraft(mode) {
  switch (mode) {
    case "show":
      return {
        showTitle: "",
        creatorName: "",
        contactEmail: "",
        listenLinks: [],
        selectedTags: [],
        completionStatus: "unknown",
        shortDescription: "",
        verificationNotes: "",
        helpfulDetailsOpen: false,
      };
    case "correction":
      return {
        existingShowId: "",
        showSearch: "",
        correctionType: "broken-link",
        linkAction: "replace",
        affectedUrl: "",
        replacementUrl: "",
        metadataField: "creator",
        proposedMetadataValue: "",
        proposedStatus: "ongoing",
        statusContext: "",
        creditAction: "add",
        creditName: "",
        creditRole: "",
        artworkUrl: "",
        artworkCredit: "",
        otherIssue: "",
        otherProposedValue: "",
        sourceLinks: [{ url: "" }],
        optionalNotes: "",
        contactEmail: "",
      };
    case "listener-review":
      return {
        existingShowId: "",
        showSearch: "",
        ratingStars: 0,
        categoryScores: {},
        detailedRatingsOpen: false,
        spoilerLevel: "spoiler-free",
        reviewTitle: "",
        reviewText: "",
        whoWouldLikeThis: "",
        bestFor: [],
        workedBest: [],
        similarShows: "",
        alias: "",
        contactEmail: "",
      };
    case "creator-verification":
      return {
        existingShowId: "",
        showSearch: "",
        creatorName: "",
        contactEmail: "",
        role: "creator",
        verificationMethod: "official-domain-email",
        proofUrl: "",
        evidenceDescription: "",
        requestedUpdates: "",
        preferredDescription: "",
        officialLinks: [],
        optionalNotes: "",
        additionalVerificationOpen: false,
      };
    default:
      return {};
  }
}

export function getActiveDraft(state) {
  return state.drafts[state.activeMode];
}

export function appendLinkRow(draft, fieldName, options = [], preferredLabel = "") {
  const currentRows = Array.isArray(draft[fieldName]) ? draft[fieldName] : [];
  const nextLabel = String(preferredLabel || "").trim() || pickNextLinkOption(currentRows, options);
  const row = fieldName === "sourceLinks"
    ? { url: "" }
    : { label: nextLabel, url: "" };
  draft[fieldName] = [...currentRows, row];
}

export function appendModeLinkRow(draft, fieldName, preferredLabel = "") {
  appendLinkRow(
    draft,
    fieldName,
    fieldName === "listenLinks"
      ? LISTEN_LINK_OPTIONS
      : fieldName === "officialLinks"
        ? OFFICIAL_LINK_OPTIONS
        : [],
    preferredLabel,
  );
}

export function removeLinkRow(draft, fieldName, index) {
  const currentRows = Array.isArray(draft[fieldName]) ? draft[fieldName] : [];
  const nextRows = currentRows.filter((_, currentIndex) => currentIndex !== index);
  if (nextRows.length > 0) {
    draft[fieldName] = nextRows;
    return;
  }

  if (fieldName === "listenLinks") {
    draft[fieldName] = [];
    return;
  }

  if (fieldName === "officialLinks") {
    draft[fieldName] = [];
    return;
  }

  draft[fieldName] = fieldName === "sourceLinks"
    ? [{ url: "" }]
    : [{ label: LISTEN_LINK_OPTIONS[0] || "Spotify", url: "" }];
}

export function toggleArrayValue(draft, field, value) {
  const current = new Set(Array.isArray(draft[field]) ? draft[field] : []);
  if (current.has(value)) {
    current.delete(value);
  } else if (current.size < 8 || field !== "selectedTags") {
    current.add(value);
  }
  draft[field] = [...current];
}

export function addArrayValue(draft, field, value, limit = Number.POSITIVE_INFINITY) {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue) {
    return;
  }

  const current = Array.isArray(draft[field]) ? [...draft[field]] : [];
  const exists = current.some((entry) => entry.trim().toLowerCase() === normalizedValue.toLowerCase());
  if (exists || current.length >= limit) {
    return;
  }

  draft[field] = [...current, normalizedValue];
}
