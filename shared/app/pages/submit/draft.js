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
      draft.officialSite = readValue("submitOfficialSite");
      draft.completionStatus = readValue("submitCompletionStatus");
      draft.shortDescription = readValue("submitShortDescription");
      draft.archiveFitNote = readValue("submitArchiveFitNote");
      draft.verificationNotes = readValue("submitVerificationNotes");
      draft.listenLinks = readLinkRows(elements.form, "listenLinks", false);
      break;
    case "correction":
      draft.contactEmail = readValue("submitContactEmail");
      draft.correctionType = readValue("submitCorrectionType");
      draft.issueDescription = readValue("submitIssueDescription");
      draft.correctedInformation = readValue("submitCorrectedInformation");
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
      break;
    case "creator-verification":
      draft.creatorName = readValue("submitCreatorName");
      draft.role = readValue("submitRole");
      draft.officialSite = readValue("submitOfficialSite");
      draft.proofUrl = readValue("submitProofUrl");
      draft.requestedUpdates = readValue("submitRequestedUpdates");
      draft.preferredDescription = readValue("submitPreferredDescription");
      draft.optionalNotes = readValue("submitVerificationNotes");
      draft.officialLinks = readLinkRows(elements.form, "officialLinks", false);
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
