import {
  buildSubmitControlId,
  isValidEmail,
  isValidHttpUrl,
  normalizeLinkRows,
} from "./utils.js";

function createValidationError(fieldId, message, errorFieldId = fieldId) {
  return { fieldId, message, errorFieldId };
}

function getInvalidLinkFieldId(fieldName, rows, plain) {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const invalidIndex = normalizedRows.findIndex((row) => {
    const url = String(row?.url || "").trim();
    return url && !isValidHttpUrl(url);
  });

  if (invalidIndex < 0) {
    return buildSubmitControlId(fieldName);
  }

  return `${buildSubmitControlId(fieldName)}Url${invalidIndex}`;
}

export function validateDraft(mode, draft, showMap) {
  const selectedShow = draft.existingShowId ? showMap.get(draft.existingShowId) || null : null;

  if (mode === "show") {
    if (!draft.showTitle) {
      return createValidationError("submitShowTitle", "Show title is required.");
    }
    if (!draft.creatorName) {
      return createValidationError("submitCreatorName", "Creator or network is required.");
    }
    if (!isValidEmail(draft.contactEmail)) {
      return createValidationError("submitContactEmail", "A valid contact email is required.");
    }
    const listenLinks = normalizeLinkRows(draft.listenLinks, false);
    if (listenLinks.length === 0) {
      return createValidationError(buildSubmitControlId("listenLinks"), "Add at least one listen link.");
    }
    if (listenLinks.some((row) => !isValidHttpUrl(row.url))) {
      return createValidationError(
        getInvalidLinkFieldId("listenLinks", draft.listenLinks, false),
        "Listen links must use valid http or https URLs.",
        buildSubmitControlId("listenLinks"),
      );
    }
    if (draft.officialSite && !isValidHttpUrl(draft.officialSite)) {
      return createValidationError("submitOfficialSite", "Official website must use a valid http or https URL.");
    }
    if (!Array.isArray(draft.selectedTags) || draft.selectedTags.length === 0) {
      return createValidationError(buildSubmitControlId("selectedTags"), "Choose at least one genre or tag.");
    }
    if (!draft.completionStatus) {
      return createValidationError("submitCompletionStatus", "Completion status is required.");
    }
    if (!draft.shortDescription) {
      return createValidationError("submitShortDescription", "Short spoiler-free description is required.");
    }
    if (!draft.archiveFitNote) {
      return createValidationError("submitArchiveFitNote", "Why it belongs in the archive is required.");
    }
    return null;
  }

  if (!selectedShow) {
    return createValidationError("submitExistingShowSearch", "Choose the existing archive entry for this submission.");
  }

  if (mode === "correction") {
    if (!draft.correctionType) {
      return createValidationError("submitCorrectionType", "Correction type is required.");
    }
    if (!draft.issueDescription) {
      return createValidationError("submitIssueDescription", "Describe what is wrong.");
    }
    if (!draft.correctedInformation) {
      return createValidationError("submitCorrectedInformation", "Correct information is required.");
    }
    const sourceLinks = normalizeLinkRows(draft.sourceLinks, true);
    if (sourceLinks.length === 0) {
      return createValidationError(buildSubmitControlId("sourceLinks"), "Add at least one source link.");
    }
    if (sourceLinks.some((row) => !isValidHttpUrl(row.url))) {
      return createValidationError(
        getInvalidLinkFieldId("sourceLinks", draft.sourceLinks, true),
        "Source links must use valid http or https URLs.",
        buildSubmitControlId("sourceLinks"),
      );
    }
    if (draft.contactEmail && !isValidEmail(draft.contactEmail)) {
      return createValidationError("submitContactEmail", "Contact email must be valid if provided.");
    }
    return null;
  }

  if (mode === "listener-review") {
    if (!Number.isInteger(draft.ratingStars) || draft.ratingStars < 1 || draft.ratingStars > 5) {
      return createValidationError("submitRatingStars", "Listener reviews require a 1 to 5 star rating.");
    }
    if (!draft.reviewTitle) {
      return createValidationError("submitReviewTitle", "Review title is required.");
    }
    if (!draft.reviewText) {
      return createValidationError("submitReviewText", "Review text is required.");
    }
    if (!draft.spoilerLevel) {
      return createValidationError(buildSubmitControlId("spoilerLevel"), "Spoiler level is required.");
    }
    if (draft.contactEmail && !isValidEmail(draft.contactEmail)) {
      return createValidationError("submitContactEmail", "Contact email must be valid if provided.");
    }
    return null;
  }

  if (!draft.creatorName) {
    return createValidationError("submitCreatorName", "Creator or network is required.");
  }
  if (!draft.role) {
    return createValidationError("submitRole", "Your role is required.");
  }
  if (draft.officialSite && !isValidHttpUrl(draft.officialSite)) {
    return createValidationError("submitOfficialSite", "Official website must use a valid http or https URL.");
  }
  if (!draft.verificationMethod) {
    return createValidationError(buildSubmitControlId("verificationMethod"), "Verification method is required.");
  }
  if (!isValidHttpUrl(draft.proofUrl)) {
    return createValidationError("submitProofUrl", "Proof link or profile URL must use a valid http or https URL.");
  }
  if (!draft.requestedUpdates) {
    return createValidationError("submitRequestedUpdates", "Requested updates are required.");
  }
  const officialLinks = normalizeLinkRows(draft.officialLinks, false);
  if (officialLinks.length === 0) {
    return createValidationError(buildSubmitControlId("officialLinks"), "Add at least one official link.");
  }
  if (officialLinks.some((row) => !isValidHttpUrl(row.url))) {
    return createValidationError(
      getInvalidLinkFieldId("officialLinks", draft.officialLinks, false),
      "Official links must use valid http or https URLs.",
      buildSubmitControlId("officialLinks"),
    );
  }
  return null;
}
