import { MODES_WITH_EXISTING_SHOW } from "../../submit/config.js";
import { createDraft, getActiveDraft } from "../../submit/state.js";
import {
  clearStoredDraft,
  createDraftContext,
  hasDraftContent,
  loadStoredDraft,
  saveStoredDraft,
} from "../../submit/draft-storage.js";

const DRAFT_MODES = ["show", "correction", "listener-review", "creator-verification"];

export function createDraftContexts() {
  return Object.fromEntries(DRAFT_MODES.map((mode) => [mode, createDraftContext()]));
}

export function hydrateDraftsForRoute(state, route = {}) {
  const requestedShowId = String(route.requestedShowId || "").trim();
  const requestedEntityId = String(route.requestedEntityId || "").trim();
  const knownRequestedShow = !requestedShowId || state.showMap.has(requestedShowId);

  DRAFT_MODES.forEach((mode) => {
    if (state.draftHydrated.has(mode)) {
      return;
    }

    if (MODES_WITH_EXISTING_SHOW.has(mode) && requestedShowId && !knownRequestedShow) {
      return;
    }

    hydrateDraftForMode(state, mode, createDraftContext({
      showId: MODES_WITH_EXISTING_SHOW.has(mode) ? requestedShowId : "",
      entityId: mode === "correction" ? requestedEntityId : "",
    }));
  });
}

export function hydrateDraftForMode(state, mode, context) {
  const normalizedContext = createDraftContext(context);
  const restoredDraft = loadStoredDraft(mode, normalizedContext);
  const draft = {
    ...createDraft(mode),
    ...(restoredDraft || {}),
  };

  state.drafts[mode] = draft;
  state.draftContexts[mode] = normalizedContext;
  state.draftHydrated.add(mode);
  applyDraftContext(state, mode, normalizedContext);
  return Boolean(restoredDraft);
}

export function switchActiveDraftContext(state, elements, context, { restore = true, showTitle = "" } = {}) {
  captureCurrentDraft(state, elements);
  const mode = state.activeMode;
  const normalizedContext = createDraftContext(context);
  const restoredDraft = restore ? loadStoredDraft(mode, normalizedContext) : null;

  state.drafts[mode] = {
    ...createDraft(mode),
    ...(restoredDraft || {}),
  };
  state.draftContexts[mode] = normalizedContext;
  state.draftHydrated.add(mode);
  applyDraftContext(state, mode, normalizedContext, { showTitle });
  return Boolean(restoredDraft);
}

export function clearActiveDraft(state, elements) {
  const mode = state.activeMode;
  const context = state.draftContexts[mode] || createDraftContext();
  clearStoredDraft(mode, context);
  state.drafts[mode] = createDraft(mode);
  state.draftHydrated.add(mode);
  applyDraftContext(state, mode, context);
  elements.legalAcknowledgement.checked = false;
  state.onDraftChanged?.();
}

export function clearSubmittedDraft(state, mode, context) {
  clearStoredDraft(mode, context);
  state.drafts[mode] = createDraft(mode);
  state.draftContexts[mode] = createDraftContext();
  state.draftHydrated.add(mode);
}

export function persistActiveDraft(state) {
  const mode = state.activeMode;
  if (!state.draftHydrated.has(mode)) {
    return false;
  }

  return saveStoredDraft(
    mode,
    state.draftContexts[mode] || createDraftContext(),
    getActiveDraft(state),
  );
}

export function hasActiveDraftContent(state) {
  const mode = state.activeMode;
  return state.draftHydrated.has(mode) && hasDraftContent(
    mode,
    getActiveDraft(state),
    state.draftContexts[mode] || createDraftContext(),
  );
}

function applyDraftContext(state, mode, context, { showTitle = "" } = {}) {
  const draft = state.drafts[mode];
  if (!draft) {
    return;
  }

  if (MODES_WITH_EXISTING_SHOW.has(mode)) {
    draft.existingShowId = context.showId;
    if (context.showId) {
      draft.showSearch = showTitle || state.showMap.get(context.showId)?.title || draft.showSearch;
    }
  }

  if (mode === "correction") {
    draft.creatorPageId = context.entityId;
  }
}

export function captureCurrentDraft(state, elements) {
  const draft = getActiveDraft(state);
  const currentMode = state.activeMode;
  draft.legalAcknowledged = elements.legalAcknowledgement.checked;

  if (MODES_WITH_EXISTING_SHOW.has(currentMode)) {
    draft.showSearch = readValue("submitExistingShowSearch");
  }

  switch (currentMode) {
    case "show":
      draft.showTitle = readValue("submitShowTitle");
      draft.creatorName = readValue("submitCreatorName");
      draft.contactEmail = readValue("submitContactEmail");
      draft.completionStatus = readValue("submitCompletionStatus");
      draft.suggestedDescriptors = readValue("submitSuggestedDescriptors");
      draft.shortDescription = readValue("submitShortDescription");
      draft.verificationNotes = readValue("submitVerificationNotes");
      draft.listenLinks = readLinkRows(elements.form, "listenLinks", false);
      draft.helpfulDetailsOpen = readDisclosureOpen("submitHelpfulDetails");
      break;
    case "correction":
      draft.contactEmail = readValue("submitContactEmail");
      draft.correctionType = readValue("submitCorrectionType");
      draft.linkAction = readPresentValue("submitLinkAction", draft.linkAction);
      draft.affectedUrl = readPresentValue("submitAffectedUrl", draft.affectedUrl);
      draft.replacementUrl = readPresentValue("submitReplacementUrl", draft.replacementUrl);
      draft.metadataField = readPresentValue("submitMetadataField", draft.metadataField);
      draft.proposedMetadataValue = readPresentValue("submitProposedMetadataValue", draft.proposedMetadataValue);
      draft.proposedStatus = readPresentValue("submitProposedStatus", draft.proposedStatus);
      draft.statusContext = readPresentValue("submitStatusContext", draft.statusContext);
      draft.creditAction = readPresentValue("submitCreditAction", draft.creditAction);
      draft.creditName = readPresentValue("submitCreditName", draft.creditName);
      draft.creditRole = readPresentValue("submitCreditRole", draft.creditRole);
      draft.creatorPageName = readPresentValue("submitCreatorPageName", draft.creatorPageName);
      draft.creatorPageIssue = readPresentValue("submitCreatorPageIssue", draft.creatorPageIssue);
      draft.creatorPageProposedValue = readPresentValue("submitCreatorPageProposedValue", draft.creatorPageProposedValue);
      draft.artworkUrl = readPresentValue("submitArtworkUrl", draft.artworkUrl);
      draft.artworkCredit = readPresentValue("submitArtworkCredit", draft.artworkCredit);
      draft.otherIssue = readPresentValue("submitOtherIssue", draft.otherIssue);
      draft.otherProposedValue = readPresentValue("submitOtherProposedValue", draft.otherProposedValue);
      draft.optionalNotes = readValue("submitCorrectionNotes");
      draft.sourceLinks = readLinkRows(elements.form, "sourceLinks", true);
      break;
    case "listener-review":
      draft.reviewTitle = readValue("submitReviewTitle");
      draft.reviewText = readValue("submitReviewText");
      draft.whoWouldLikeThis = readValue("submitWhoWouldLikeThis");
      draft.similarShows = readValue("submitSimilarShows");
      draft.alias = readValue("submitAlias");
      draft.contactEmail = readValue("submitContactEmail");
      draft.detailedRatingsOpen = readDisclosureOpen("submitDetailedRatings");
      break;
    case "creator-verification":
      draft.creatorName = readValue("submitCreatorName");
      draft.contactEmail = readPresentValue("submitContactEmail", draft.contactEmail);
      draft.role = readValue("submitRole");
      draft.proofUrl = readPresentValue("submitProofUrl", draft.proofUrl);
      draft.evidenceDescription = readPresentValue("submitEvidenceDescription", draft.evidenceDescription);
      draft.requestedUpdates = readValue("submitRequestedUpdates");
      draft.preferredDescription = readValue("submitPreferredDescription");
      draft.optionalNotes = readValue("submitVerificationNotes");
      draft.officialLinks = readLinkRows(elements.form, "officialLinks", false);
      draft.additionalVerificationOpen = readDisclosureOpen("submitAdditionalVerification");
      break;
    default:
      break;
  }

  state.persistActiveDraft?.();
  state.onDraftChanged?.();
}

function readValue(id) {
  const field = document.getElementById(id);
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
    return field.value.trim();
  }

  return "";
}

function readPresentValue(id, fallback = "") {
  const field = document.getElementById(id);
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
    return field.value.trim();
  }
  return fallback;
}

function readDisclosureOpen(id) {
  const disclosure = document.getElementById(id);
  return disclosure instanceof HTMLDetailsElement && disclosure.open;
}

function readLinkRows(form, fieldName, plain) {
  const urlInputs = Array.from(form.querySelectorAll(`[data-link-list="${fieldName}"][data-link-part="url"]`));
  const labelInputs = plain
    ? []
    : Array.from(form.querySelectorAll(`[data-link-list="${fieldName}"][data-link-part="label"]`));

  return urlInputs.map((node, index) => {
    const url = node instanceof HTMLInputElement ? node.value.trim() : "";
    const labelNode = labelInputs[index];
    const label = labelNode instanceof HTMLSelectElement ? labelNode.value.trim() : "";
    return plain ? { url } : { label, url };
  });
}
