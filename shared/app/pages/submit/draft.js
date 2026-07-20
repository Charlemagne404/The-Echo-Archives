import { MODES_WITH_EXISTING_SHOW } from "../../submit/config.js";
import { getActiveDraft } from "../../submit/state.js";

export function captureCurrentDraft(state, elements) {
  const draft = getActiveDraft(state);
  const currentMode = state.activeMode;

  if (MODES_WITH_EXISTING_SHOW.has(currentMode)) {
    draft.showSearch = readValue("submitExistingShowSearch");
  }

  switch (currentMode) {
    case "show":
      draft.showTitle = readValue("submitShowTitle");
      draft.creatorName = readValue("submitCreatorName");
      draft.contactEmail = readValue("submitContactEmail");
      draft.completionStatus = readValue("submitCompletionStatus");
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
