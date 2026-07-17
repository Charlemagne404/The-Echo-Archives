import {
  findPrimaryOfficialSite,
  normalizeLinkRows,
  pickPrimaryListenLink,
} from "./utils.js";

export function buildPayload(mode, draft, showMap) {
  const selectedShow = draft.existingShowId ? showMap.get(draft.existingShowId) || null : null;

  if (mode === "show") {
    const listenLinks = normalizeLinkRows(draft.listenLinks, false);
    const topLevelListenLink = pickPrimaryListenLink(listenLinks);
    return {
      submissionType: "show",
      showTitle: draft.showTitle,
      creatorName: draft.creatorName,
      contactEmail: draft.contactEmail,
      officialSite: draft.officialSite,
      rssOrListenLink: topLevelListenLink,
      genres: draft.selectedTags.join(", "),
      notes: draft.archiveFitNote,
      listenLinks,
      selectedTags: [...draft.selectedTags],
      completionStatus: draft.completionStatus,
      shortDescription: draft.shortDescription,
      archiveFitNote: draft.archiveFitNote,
      verificationNotes: draft.verificationNotes,
      website: readHoneypotValue(),
    };
  }

  if (mode === "correction") {
    const sourceLinks = normalizeLinkRows(draft.sourceLinks, true).map((row) => row.url);
    return {
      submissionType: "correction",
      existingShowId: draft.existingShowId,
      showTitle: selectedShow?.title || draft.showSearch,
      creatorName: "",
      contactEmail: draft.contactEmail,
      officialSite: "",
      rssOrListenLink: "",
      genres: "",
      notes: draft.optionalNotes,
      correctionType: draft.correctionType,
      issueDescription: draft.issueDescription,
      correctedInformation: draft.correctedInformation,
      sourceLinks,
      website: readHoneypotValue(),
    };
  }

  if (mode === "listener-review") {
    const normalizedRating = draft.ratingStars * 2;
    return {
      submissionType: "listener-review",
      existingShowId: draft.existingShowId,
      showTitle: selectedShow?.title || draft.showSearch,
      creatorName: "",
      contactEmail: draft.contactEmail,
      officialSite: "",
      rssOrListenLink: "",
      genres: "",
      listenerRating: String(normalizedRating),
      ratingStars: draft.ratingStars,
      categoryScores: { ...draft.categoryScores },
      spoilerLevel: draft.spoilerLevel,
      listenerReview: draft.reviewText,
      notes: "",
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
  return {
    submissionType: "creator-verification",
    existingShowId: draft.existingShowId,
    showTitle: selectedShow?.title || draft.showSearch,
    creatorName: draft.creatorName,
    contactEmail: "",
    officialSite: draft.officialSite || findPrimaryOfficialSite(officialLinks),
    rssOrListenLink: "",
    genres: "",
    notes: draft.optionalNotes,
    role: draft.role,
    verificationMethod: draft.verificationMethod,
    proofUrl: draft.proofUrl,
    requestedUpdates: draft.requestedUpdates,
    preferredDescription: draft.preferredDescription,
    officialLinks,
    website: readHoneypotValue(),
  };
}

export async function submitSubmission(payload) {
  const response = await fetch("/api/submissions/shows", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || `Submission failed with ${response.status}`);
  }

  return result;
}

export function getPendingCopy(mode) {
  switch (mode) {
    case "correction":
      return "Sending your correction into the archive queue...";
    case "listener-review":
      return "Sending your listener review into moderation...";
    case "creator-verification":
      return "Sending your verification request into moderation...";
    default:
      return "Sending your show to the archive queue...";
  }
}

export function getSuccessCopy(mode) {
  switch (mode) {
    case "correction":
      return "Correction received. It is now in the manual archive review queue.";
    case "listener-review":
      return "Listener review received. It is now in the moderation queue.";
    case "creator-verification":
      return "Verification request received. It is now in the moderation queue.";
    default:
      return "Submission received. It is now in the manual archive review queue.";
  }
}

function readHoneypotValue() {
  const honeypot = document.querySelector('input[name="website"]');
  return honeypot instanceof HTMLInputElement ? honeypot.value : "";
}
