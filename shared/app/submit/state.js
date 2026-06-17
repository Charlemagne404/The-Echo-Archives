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
    return;
  }

  const show = state.showMap.get(requestedShowId);
  for (const mode of MODES_WITH_EXISTING_SHOW) {
    state.drafts[mode].existingShowId = show.id;
    state.drafts[mode].showSearch = show.title;
  }
  state.searchOpen = false;
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
        officialSite: "",
        listenLinks: [{ label: "Spotify", url: "" }],
        selectedTags: [],
        completionStatus: "ongoing",
        shortDescription: "",
        archiveFitNote: "",
        verificationNotes: "",
      };
    case "correction":
      return {
        existingShowId: "",
        showSearch: "",
        correctionType: "broken-link",
        issueDescription: "",
        correctedInformation: "",
        sourceLinks: [{ url: "" }],
        optionalNotes: "",
        contactEmail: "",
      };
    case "listener-review":
      return {
        existingShowId: "",
        showSearch: "",
        ratingStars: 4,
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
        role: "creator",
        officialSite: "",
        verificationMethod: "official-domain-email",
        proofUrl: "",
        requestedUpdates: "",
        preferredDescription: "",
        officialLinks: [{ label: "Website", url: "" }],
        optionalNotes: "",
      };
    default:
      return {};
  }
}

export function getActiveDraft(state) {
  return state.drafts[state.activeMode];
}

export function appendLinkRow(draft, fieldName, options = []) {
  const currentRows = Array.isArray(draft[fieldName]) ? draft[fieldName] : [];
  const nextLabel = pickNextLinkOption(currentRows, options);
  const row = fieldName === "sourceLinks"
    ? { url: "" }
    : { label: nextLabel, url: "" };
  draft[fieldName] = [...currentRows, row];
}

export function appendModeLinkRow(draft, fieldName) {
  appendLinkRow(
    draft,
    fieldName,
    fieldName === "listenLinks"
      ? LISTEN_LINK_OPTIONS
      : fieldName === "officialLinks"
        ? OFFICIAL_LINK_OPTIONS
        : [],
  );
}

export function removeLinkRow(draft, fieldName, index) {
  const currentRows = Array.isArray(draft[fieldName]) ? draft[fieldName] : [];
  const nextRows = currentRows.filter((_, currentIndex) => currentIndex !== index);
  if (nextRows.length > 0) {
    draft[fieldName] = nextRows;
    return;
  }

  draft[fieldName] = fieldName === "sourceLinks"
    ? [{ url: "" }]
    : fieldName === "officialLinks"
      ? [{ label: OFFICIAL_LINK_OPTIONS[0] || "Website", url: "" }]
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
