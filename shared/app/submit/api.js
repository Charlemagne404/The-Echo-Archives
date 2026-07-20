import {
  findPrimaryOfficialSite,
  normalizeLinkRows,
  pickPrimaryListenLink,
} from "./utils.js";

function buildCorrectionDetails(draft) {
  switch (draft.correctionType) {
    case "broken-link":
      return {
        action: draft.linkAction,
        affectedUrl: draft.affectedUrl,
        ...(draft.linkAction === "replace" ? { replacementUrl: draft.replacementUrl } : {}),
      };
    case "metadata":
      return { field: draft.metadataField, proposedValue: draft.proposedMetadataValue };
    case "status":
      return {
        proposedStatus: draft.proposedStatus,
        ...(draft.statusContext ? { effectiveDateOrNote: draft.statusContext } : {}),
      };
    case "credits":
      return { action: draft.creditAction, name: draft.creditName, role: draft.creditRole };
    case "artwork":
      return {
        artworkUrl: draft.artworkUrl,
        ...(draft.artworkCredit ? { credit: draft.artworkCredit } : {}),
      };
    default:
      return { issue: draft.otherIssue, proposedValue: draft.otherProposedValue };
  }
}

export function buildPayload(mode, draft, showMap) {
  const selectedShow = draft.existingShowId ? showMap.get(draft.existingShowId) || null : null;

  if (mode === "show") {
    const listenLinks = normalizeLinkRows(draft.listenLinks, false);
    return {
      intakeVersion: 2,
      submissionType: "show",
      showTitle: draft.showTitle,
      creatorName: draft.creatorName,
      contactEmail: draft.contactEmail,
      officialSite: findPrimaryOfficialSite(listenLinks),
      rssOrListenLink: pickPrimaryListenLink(listenLinks),
      genres: draft.selectedTags.join(", "),
      notes: draft.verificationNotes,
      listenLinks,
      selectedTags: [...draft.selectedTags],
      completionStatus: draft.completionStatus || "unknown",
      shortDescription: draft.shortDescription,
      verificationNotes: draft.verificationNotes,
      website: readHoneypotValue(),
    };
  }

  if (mode === "correction") {
    const sourceLinks = normalizeLinkRows(draft.sourceLinks, true).map((row) => row.url);
    return {
      intakeVersion: 2,
      submissionType: "correction",
      existingShowId: draft.existingShowId,
      showTitle: selectedShow?.title || draft.showSearch,
      contactEmail: draft.contactEmail,
      notes: draft.optionalNotes,
      correctionType: draft.correctionType,
      correctionDetails: buildCorrectionDetails(draft),
      sourceLinks,
      website: readHoneypotValue(),
    };
  }

  if (mode === "listener-review") {
    return {
      intakeVersion: 2,
      submissionType: "listener-review",
      existingShowId: draft.existingShowId,
      showTitle: selectedShow?.title || draft.showSearch,
      contactEmail: draft.contactEmail,
      listenerRating: String(draft.ratingStars * 2),
      ratingStars: draft.ratingStars,
      categoryScores: { ...draft.categoryScores },
      spoilerLevel: draft.spoilerLevel,
      reviewTitle: draft.reviewTitle,
      reviewText: draft.reviewText,
      whoWouldLikeThis: draft.whoWouldLikeThis,
      bestFor: [...draft.bestFor],
      workedBest: [...draft.workedBest],
      similarShows: draft.similarShows,
      alias: draft.alias,
      website: readHoneypotValue(),
    };
  }

  const officialLinks = normalizeLinkRows(draft.officialLinks, false);
  const usesContactEmail = ["official-domain-email", "other"].includes(draft.verificationMethod);
  const usesProofUrl = ["website", "social-account", "press-kit", "other"].includes(draft.verificationMethod);
  const usesEvidenceDescription = draft.verificationMethod === "other";
  const evidenceEmail = usesContactEmail ? draft.contactEmail : "";
  const evidenceUrl = usesProofUrl ? draft.proofUrl : "";
  const evidenceDescription = usesEvidenceDescription ? draft.evidenceDescription : "";
  return {
    intakeVersion: 2,
    submissionType: "creator-verification",
    existingShowId: draft.existingShowId,
    showTitle: selectedShow?.title || draft.showSearch,
    creatorName: draft.creatorName,
    contactEmail: evidenceEmail,
    officialSite: findPrimaryOfficialSite(officialLinks),
    notes: draft.optionalNotes,
    role: draft.role,
    verificationEvidence: {
      method: draft.verificationMethod,
      ...(evidenceEmail ? { email: evidenceEmail } : {}),
      ...(evidenceUrl ? { url: evidenceUrl } : {}),
      ...(evidenceDescription ? { description: evidenceDescription } : {}),
    },
    requestedUpdates: draft.requestedUpdates,
    preferredDescription: draft.preferredDescription,
    officialLinks,
    website: readHoneypotValue(),
  };
}

export async function loadShowContext(showId) {
  const response = await fetch(`/api/submissions/shows/${encodeURIComponent(showId)}/context`, {
    headers: { Accept: "application/json" },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.show) {
    throw new Error(result.error || "Current archive details could not be loaded.");
  }
  return result.show;
}

export async function submitSubmission(payload) {
  let response;
  try {
    response = await fetch("/api/submissions/shows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (_error) {
    throw new Error("The submission could not be sent. Check your connection and try again.");
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const retryAfter = Number.parseInt(response.headers.get("Retry-After") || "", 10);
    const retryMessage = response.status === 429 && Number.isInteger(retryAfter)
      ? ` Try again in ${retryAfter} seconds.`
      : " Your entries are still here; try again.";
    const baseMessage = result.error || `Submission failed with ${response.status}`;
    const separator = /[.!?]$/.test(baseMessage) ? "" : ".";
    throw new Error(`${baseMessage}${separator}${retryMessage}`);
  }
  return result;
}

export function getPendingCopy(mode) {
  switch (mode) {
    case "correction": return "Submitting correction…";
    case "listener-review": return "Submitting listener review…";
    case "creator-verification": return "Submitting verification request…";
    default: return "Submitting new show…";
  }
}

export function getSuccessCopy(mode) {
  switch (mode) {
    case "correction": return "Correction received for factual review.";
    case "listener-review": return "Listener review received for moderation.";
    case "creator-verification": return "Creator verification request received.";
    default: return "New show received for archive screening.";
  }
}

function readHoneypotValue() {
  const honeypot = document.querySelector('.hp-field input[name="website"]');
  return honeypot instanceof HTMLInputElement ? honeypot.value : "";
}
