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
  return invalidIndex < 0 ? buildSubmitControlId(fieldName) : `${buildSubmitControlId(fieldName)}Url${invalidIndex}`;
}

function validateOptionalEmail(value) {
  return !value || isValidEmail(value);
}

function validateCorrection(draft) {
  const sourceLinks = normalizeLinkRows(draft.sourceLinks, true);
  if (sourceLinks.some((row) => !isValidHttpUrl(row.url))) {
    return createValidationError(
      getInvalidLinkFieldId("sourceLinks", draft.sourceLinks, true),
      "Source links must use valid http or https URLs.",
      buildSubmitControlId("sourceLinks"),
    );
  }
  const sourceRequired = ["metadata", "status", "credits", "creator-page"].includes(draft.correctionType);
  if (sourceRequired && sourceLinks.length === 0) {
    return createValidationError(buildSubmitControlId("sourceLinks"), "Add at least one official source.");
  }

  switch (draft.correctionType) {
    case "broken-link":
      if (!isValidHttpUrl(draft.affectedUrl)) {
        return createValidationError("submitAffectedUrl", "Enter the affected http or https URL.");
      }
      if (draft.linkAction === "replace" && !isValidHttpUrl(draft.replacementUrl)) {
        return createValidationError("submitReplacementUrl", "Enter a valid replacement URL.");
      }
      break;
    case "metadata":
      if (!draft.metadataField) return createValidationError("submitMetadataField", "Choose the metadata field.");
      if (!draft.proposedMetadataValue) return createValidationError("submitProposedMetadataValue", "Enter the corrected information.");
      break;
    case "status":
      if (!draft.proposedStatus) return createValidationError("submitProposedStatus", "Choose the proposed status.");
      break;
    case "credits":
      if (!draft.creditAction) return createValidationError("submitCreditAction", "Choose how the credit should change.");
      if (!draft.creditName) return createValidationError("submitCreditName", "Enter the person or organization.");
      if (!draft.creditRole) return createValidationError("submitCreditRole", "Enter the credit role.");
      break;
    case "creator-page":
      if (!draft.creatorPageName) return createValidationError("submitCreatorPageName", "Creator, studio, network, or person is required.");
      if (!draft.creatorPageIssue) return createValidationError("submitCreatorPageIssue", "Choose what needs updating.");
      if (!draft.creatorPageProposedValue) return createValidationError("submitCreatorPageProposedValue", "Describe the factual creator-page update.");
      break;
    case "artwork":
      if (!isValidHttpUrl(draft.artworkUrl)) return createValidationError("submitArtworkUrl", "Enter a valid official artwork URL.");
      break;
    case "other":
      if (!draft.otherIssue) return createValidationError("submitOtherIssue", "Describe the factual issue.");
      if (!draft.otherProposedValue) return createValidationError("submitOtherProposedValue", "Describe the proposed correction.");
      break;
    default:
      return createValidationError("submitCorrectionType", "Choose a valid correction type.");
  }

  if (!validateOptionalEmail(draft.contactEmail)) {
    return createValidationError("submitContactEmail", "Contact email must be valid if provided.");
  }
  return null;
}

function validateVerification(draft) {
  if (!draft.creatorName) return createValidationError("submitCreatorName", "Creator or network is required.");
  if (!draft.role) return createValidationError("submitRole", "Your role is required.");
  if (!draft.verificationMethod) {
    return createValidationError(buildSubmitControlId("verificationMethod"), "Verification method is required.");
  }
  if (!draft.requestedUpdates) return createValidationError("submitRequestedUpdates", "Describe the facts to confirm or update.");

  if (draft.verificationMethod === "official-domain-email") {
    if (!isValidEmail(draft.contactEmail)) {
      return createValidationError("submitContactEmail", "Enter a valid official-domain email.");
    }
  } else if (["website", "social-account", "press-kit"].includes(draft.verificationMethod)) {
    if (!isValidHttpUrl(draft.proofUrl)) {
      return createValidationError("submitProofUrl", "Enter a valid official proof URL.");
    }
  } else if (draft.verificationMethod === "other") {
    if (!draft.evidenceDescription) {
      return createValidationError("submitEvidenceDescription", "Describe how we can verify your association.");
    }
    if (!draft.proofUrl && !draft.contactEmail) {
      return createValidationError("submitProofUrl", "Provide an evidence URL or contact email.");
    }
    if (draft.proofUrl && !isValidHttpUrl(draft.proofUrl)) {
      return createValidationError("submitProofUrl", "Evidence URL must use http or https.");
    }
    if (!validateOptionalEmail(draft.contactEmail)) {
      return createValidationError("submitContactEmail", "Contact email must be valid if provided.");
    }
  }

  const officialLinks = normalizeLinkRows(draft.officialLinks, false);
  if (officialLinks.some((row) => !isValidHttpUrl(row.url))) {
    return createValidationError(
      getInvalidLinkFieldId("officialLinks", draft.officialLinks, false),
      "Official links must use valid http or https URLs.",
      buildSubmitControlId("officialLinks"),
    );
  }
  return null;
}

export function validateDraft(mode, draft, showMap) {
  if (mode === "show") {
    if (!draft.showTitle) return createValidationError("submitShowTitle", "Show title is required.");
    const listenLinks = normalizeLinkRows(draft.listenLinks, false);
    if (listenLinks.length === 0) {
      return createValidationError(buildSubmitControlId("listenLinks"), "Add at least one official or listening link.");
    }
    if (listenLinks.some((row) => !isValidHttpUrl(row.url))) {
      return createValidationError(
        getInvalidLinkFieldId("listenLinks", draft.listenLinks, false),
        "Links must use valid http or https URLs.",
        buildSubmitControlId("listenLinks"),
      );
    }
    if (!validateOptionalEmail(draft.contactEmail)) {
      return createValidationError("submitContactEmail", "Contact email must be valid if provided.");
    }
    return null;
  }

  const selectedShow = draft.existingShowId ? showMap.get(draft.existingShowId) || null : null;
  const canSubmitWithoutShow = mode === "correction" && draft.correctionType === "creator-page" && !draft.existingShowId;
  if (!selectedShow && !canSubmitWithoutShow) {
    return createValidationError("submitExistingShowSearch", "Choose the existing archive entry for this submission.");
  }

  if (mode === "correction") return validateCorrection(draft);

  if (mode === "listener-review") {
    if (!Number.isInteger(draft.ratingStars) || draft.ratingStars < 1 || draft.ratingStars > 5) {
      return createValidationError("submitRatingStars", "Choose an overall rating from 1 to 5 stars.");
    }
    for (const [key, rawRating] of Object.entries(draft.categoryScores || {})) {
      const rating = Number(rawRating);
      if (!Number.isInteger(rating) || rating < 1 || rating > 10) {
        return createValidationError(`submitCategory${key[0].toUpperCase()}${key.slice(1)}`, "Detailed ratings must be from 1 to 10.");
      }
    }
    if (!draft.reviewText) return createValidationError("submitReviewText", "Review text is required.");
    if (!draft.spoilerLevel) return createValidationError(buildSubmitControlId("spoilerLevel"), "Spoiler level is required.");
    if (!validateOptionalEmail(draft.contactEmail)) {
      return createValidationError("submitContactEmail", "Contact email must be valid if provided.");
    }
    return null;
  }

  return validateVerification(draft);
}
