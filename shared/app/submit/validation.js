import {
  isValidEmail,
  isValidHttpUrl,
  normalizeLinkRows,
} from "./utils.js";

export function validateDraft(mode, draft, showMap) {
  const selectedShow = draft.existingShowId ? showMap.get(draft.existingShowId) || null : null;

  if (mode === "show") {
    if (!draft.showTitle) {
      return "Show title is required.";
    }
    if (!draft.creatorName) {
      return "Creator or network is required.";
    }
    if (!isValidEmail(draft.contactEmail)) {
      return "A valid contact email is required.";
    }
    const listenLinks = normalizeLinkRows(draft.listenLinks, false);
    if (listenLinks.length === 0) {
      return "Add at least one listen link.";
    }
    if (listenLinks.some((row) => !isValidHttpUrl(row.url))) {
      return "Listen links must use valid http or https URLs.";
    }
    if (draft.officialSite && !isValidHttpUrl(draft.officialSite)) {
      return "Official website must use a valid http or https URL.";
    }
    if (!Array.isArray(draft.selectedTags) || draft.selectedTags.length === 0) {
      return "Choose at least one genre or tag.";
    }
    if (!draft.completionStatus) {
      return "Completion status is required.";
    }
    if (!draft.shortDescription) {
      return "Short spoiler-free description is required.";
    }
    if (!draft.archiveFitNote) {
      return "Why it belongs in the archive is required.";
    }
    return null;
  }

  if (!selectedShow) {
    return "Choose the existing archive entry for this submission.";
  }

  if (mode === "correction") {
    if (!draft.correctionType) {
      return "Correction type is required.";
    }
    if (!draft.issueDescription) {
      return "Describe what is wrong.";
    }
    if (!draft.correctedInformation) {
      return "Correct information is required.";
    }
    const sourceLinks = normalizeLinkRows(draft.sourceLinks, true);
    if (sourceLinks.length === 0) {
      return "Add at least one source link.";
    }
    if (sourceLinks.some((row) => !isValidHttpUrl(row.url))) {
      return "Source links must use valid http or https URLs.";
    }
    if (draft.contactEmail && !isValidEmail(draft.contactEmail)) {
      return "Contact email must be valid if provided.";
    }
    return null;
  }

  if (mode === "listener-review") {
    if (!Number.isInteger(draft.ratingStars) || draft.ratingStars < 1 || draft.ratingStars > 5) {
      return "Listener reviews require a 1 to 5 star rating.";
    }
    if (!draft.reviewTitle) {
      return "Review title is required.";
    }
    if (!draft.reviewText) {
      return "Review text is required.";
    }
    if (!draft.spoilerLevel) {
      return "Spoiler level is required.";
    }
    if (draft.contactEmail && !isValidEmail(draft.contactEmail)) {
      return "Contact email must be valid if provided.";
    }
    return null;
  }

  if (!draft.creatorName) {
    return "Creator or network is required.";
  }
  if (!draft.role) {
    return "Your role is required.";
  }
  if (draft.officialSite && !isValidHttpUrl(draft.officialSite)) {
    return "Official website must use a valid http or https URL.";
  }
  if (!draft.verificationMethod) {
    return "Verification method is required.";
  }
  if (!isValidHttpUrl(draft.proofUrl)) {
    return "Proof link or profile URL must use a valid http or https URL.";
  }
  if (!draft.requestedUpdates) {
    return "Requested updates are required.";
  }
  const officialLinks = normalizeLinkRows(draft.officialLinks, false);
  if (officialLinks.length === 0) {
    return "Add at least one official link.";
  }
  if (officialLinks.some((row) => !isValidHttpUrl(row.url))) {
    return "Official links must use valid http or https URLs.";
  }
  return null;
}
