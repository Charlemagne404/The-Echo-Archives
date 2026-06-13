function createSubmissionService({
  store,
  knownShowIds = null,
  throttleWindowMs = 60 * 60 * 1000,
  maxSubmissionsPerWindow = 3,
}) {
  const recentByIp = new Map();
  const allowedSubmissionTypes = new Set(["show", "correction", "listener-review", "creator-verification"]);
  const allowedSpoilerLevels = new Set(["spoiler-free", "light-spoilers", "full-spoilers"]);

  function trimString(value, maxLength = 2000) {
    return String(value || "").trim().slice(0, maxLength);
  }

  function trimStringArray(value, { maxItems = 12, maxItemLength = 120, splitPattern = null } = {}) {
    const values = Array.isArray(value)
      ? value
      : splitPattern && typeof value === "string"
        ? value.split(splitPattern)
        : [];

    return values
      .map((entry) => trimString(entry, maxItemLength))
      .filter(Boolean)
      .slice(0, maxItems);
  }

  function isValidUrl(value = "") {
    if (!value) {
      return true;
    }

    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch (_error) {
      return false;
    }
  }

  function isValidEmail(value = "") {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function parseUrlList(value = "") {
    return String(value || "")
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  function normalizeNamedLinks(value, { maxRows = 12, fallbackLabel = "Website" } = {}) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((row) => ({
        label: trimString(row?.label || fallbackLabel, 80) || fallbackLabel,
        url: trimString(row?.url, 500),
      }))
      .filter((row) => row.url)
      .slice(0, maxRows);
  }

  function normalizeUrlRows(value, { maxRows = 12 } = {}) {
    const rows = Array.isArray(value)
      ? value.map((row) => (typeof row === "string" ? { url: row } : row))
      : [];

    return rows
      .map((row) => ({
        url: trimString(row?.url, 500),
      }))
      .filter((row) => row.url)
      .slice(0, maxRows);
  }

  function parseIntegerInRange(value, minimum, maximum) {
    const numericValue = Number.parseInt(String(value || "").trim(), 10);
    if (!Number.isInteger(numericValue) || numericValue < minimum || numericValue > maximum) {
      return null;
    }

    return numericValue;
  }

  function ensureKnownShowId(submissionType, showId) {
    if (!showId) {
      const error = new Error("Choose the existing archive entry for this submission.");
      error.statusCode = 400;
      throw error;
    }

    if (knownShowIds instanceof Set && !knownShowIds.has(showId)) {
      const error = new Error(`Unknown archive entry selected for ${submissionType}.`);
      error.statusCode = 400;
      throw error;
    }
  }

  function ensureValidUrls(values, message) {
    if (values.some((value) => !isValidUrl(value))) {
      const error = new Error(message);
      error.statusCode = 400;
      throw error;
    }
  }

  function checkThrottle(sourceIp) {
    if (!sourceIp) {
      return;
    }

    const now = Date.now();
    const recent = (recentByIp.get(sourceIp) || []).filter((timestamp) => now - timestamp < throttleWindowMs);

    if (recent.length >= maxSubmissionsPerWindow) {
      const error = new Error("Too many submissions from this address. Try again later.");
      error.statusCode = 429;
      throw error;
    }

    recent.push(now);
    recentByIp.set(sourceIp, recent);
  }

  function submitShow({
    submissionType,
    existingShowId,
    showTitle,
    creatorName,
    contactEmail,
    officialSite,
    rssOrListenLink,
    genres,
    listenLinks,
    selectedTags,
    completionStatus,
    shortDescription,
    archiveFitNote,
    verificationNotes,
    correctionType,
    issueDescription,
    correctedInformation,
    sourceLinks,
    listenerRating,
    ratingStars,
    spoilerLevel,
    listenerReview,
    reviewTitle,
    reviewText,
    whoWouldLikeThis,
    bestFor,
    workedBest,
    similarShows,
    alias,
    verificationSources,
    provenanceNotes,
    role,
    verificationMethod,
    proofUrl,
    requestedUpdates,
    preferredDescription,
    officialLinks,
    notes,
    honeypot,
    sourceIp,
    userAgent,
  }) {
    if (trimString(honeypot, 200)) {
      return {
        accepted: true,
        filtered: true,
      };
    }

    checkThrottle(sourceIp);

    const normalizedSubmissionType = allowedSubmissionTypes.has(submissionType) ? submissionType : "show";
    const normalizedExistingShowId = trimString(existingShowId, 120);
    const normalizedCreatorName = trimString(creatorName, 160);
    const normalizedContactEmail = trimString(contactEmail, 160).toLowerCase();
    const normalizedOfficialSite = trimString(officialSite, 500);
    const normalizedRssOrListenLink = trimString(rssOrListenLink, 500);
    const normalizedGenres = trimString(genres, 300);
    const normalizedNotes = trimString(notes, 4000);
    const normalizedSpoilerLevel = allowedSpoilerLevels.has(spoilerLevel) ? spoilerLevel : "spoiler-free";
    const normalizedLegacyVerificationSources = parseUrlList(verificationSources).slice(0, 20);
    const normalizedLegacyProvenanceNotes = trimString(provenanceNotes, 4000);
    const normalizedUserAgent = trimString(userAgent, 500);

    if (
      normalizedSubmissionType === "correction" ||
      normalizedSubmissionType === "listener-review" ||
      normalizedSubmissionType === "creator-verification"
    ) {
      ensureKnownShowId(normalizedSubmissionType, normalizedExistingShowId);
    }

    if (
      normalizedSubmissionType === "show" &&
      (!normalizedContactEmail || !isValidEmail(normalizedContactEmail))
    ) {
      const error = new Error("A valid contact email is required.");
      error.statusCode = 400;
      throw error;
    }

    if (
      normalizedSubmissionType !== "show" &&
      normalizedContactEmail &&
      !isValidEmail(normalizedContactEmail)
    ) {
      const error = new Error("Contact email must be valid if provided.");
      error.statusCode = 400;
      throw error;
    }

    if (!isValidUrl(normalizedOfficialSite) || !isValidUrl(normalizedRssOrListenLink)) {
      const error = new Error("Submitted links must be valid http or https URLs.");
      error.statusCode = 400;
      throw error;
    }

    const normalizedShowTitle = (() => {
      const preferredTitle = trimString(showTitle, 160);
      if (preferredTitle) {
        return preferredTitle;
      }
      if (normalizedExistingShowId) {
        return normalizedExistingShowId;
      }
      const error = new Error("Show title is required.");
      error.statusCode = 400;
      throw error;
    })();

    if (normalizedSubmissionType === "show") {
      const normalizedListenLinks = normalizeNamedLinks(listenLinks, { fallbackLabel: "Listen link" });
      const normalizedSelectedTags = trimStringArray(selectedTags, { maxItems: 12, maxItemLength: 80 });
      if (normalizedSelectedTags.length === 0 && normalizedGenres) {
        normalizedSelectedTags.push(...trimStringArray(normalizedGenres, {
          maxItems: 12,
          maxItemLength: 80,
          splitPattern: /\s*,\s*/,
        }));
      }

      const normalizedCompletionStatus = trimString(completionStatus, 80) || "unknown";
      const normalizedShortDescription = trimString(shortDescription || normalizedNotes, 1000);
      const normalizedArchiveFitNote = trimString(archiveFitNote || normalizedNotes, 4000);
      const normalizedVerificationNotes = trimString(verificationNotes, 1000);
      const effectivePrimaryLink = normalizedRssOrListenLink || normalizedListenLinks[0]?.url || "";

      ensureValidUrls(
        [normalizedOfficialSite, effectivePrimaryLink, ...normalizedListenLinks.map((row) => row.url)].filter(Boolean),
        "Show submission links must be valid http or https URLs.",
      );

      if (!normalizedCreatorName) {
        const error = new Error("Creator or network is required.");
        error.statusCode = 400;
        throw error;
      }

      if (!normalizedOfficialSite && normalizedListenLinks.length === 0 && !effectivePrimaryLink) {
        const error = new Error("Provide at least one official or listen link.");
        error.statusCode = 400;
        throw error;
      }

      if (!normalizedShortDescription) {
        const error = new Error("Short spoiler-free description is required.");
        error.statusCode = 400;
        throw error;
      }

      if (!normalizedArchiveFitNote) {
        const error = new Error("Why it belongs in the archive is required.");
        error.statusCode = 400;
        throw error;
      }

      if (normalizedSelectedTags.length === 0) {
        const error = new Error("At least one genre or tag is required.");
        error.statusCode = 400;
        throw error;
      }

      const payload = {
        listenLinks: normalizedListenLinks,
        selectedTags: normalizedSelectedTags,
        completionStatus: normalizedCompletionStatus,
        shortDescription: normalizedShortDescription,
        archiveFitNote: normalizedArchiveFitNote,
        verificationNotes: normalizedVerificationNotes,
      };

      const submission = store.createShowSubmission({
        status: "new",
        submissionType: normalizedSubmissionType,
        existingShowId: "",
        showTitle: normalizedShowTitle,
        creatorName: normalizedCreatorName,
        contactEmail: normalizedContactEmail,
        officialSite: normalizedOfficialSite,
        rssOrListenLink: effectivePrimaryLink,
        genres: normalizedSelectedTags.join(", "),
        notes: normalizedArchiveFitNote,
        payload,
        provenance: {},
        sourceIp: sourceIp || "",
        userAgent: normalizedUserAgent,
      });

      return {
        accepted: true,
        filtered: false,
        submission,
      };
    }

    if (normalizedSubmissionType === "correction") {
      const normalizedCorrectionType = trimString(correctionType, 80) || "metadata";
      const normalizedIssueDescription = trimString(issueDescription || normalizedNotes, 1000);
      const normalizedCorrectedInformation = trimString(correctedInformation, 1000);
      const normalizedSourceLinks = [
        ...normalizeUrlRows(sourceLinks).map((row) => row.url),
        ...normalizedLegacyVerificationSources,
      ].filter(Boolean).slice(0, 20);
      const normalizedOptionalNotes = trimString(normalizedNotes, 1000);

      ensureValidUrls(normalizedSourceLinks, "Source links must be valid http or https URLs.");

      if (!normalizedIssueDescription) {
        const error = new Error("Correction details are required.");
        error.statusCode = 400;
        throw error;
      }

      if (!normalizedCorrectedInformation) {
        const error = new Error("Correct information is required.");
        error.statusCode = 400;
        throw error;
      }

      if (normalizedSourceLinks.length === 0) {
        const error = new Error("At least one correction source link is required.");
        error.statusCode = 400;
        throw error;
      }

      const payload = {
        correctionType: normalizedCorrectionType,
        issueDescription: normalizedIssueDescription,
        correctedInformation: normalizedCorrectedInformation,
        sourceLinks: normalizedSourceLinks,
        notes: normalizedOptionalNotes,
      };

      const provenance = {
        sourceLinks: normalizedSourceLinks,
      };

      const submission = store.createShowSubmission({
        status: "new",
        submissionType: normalizedSubmissionType,
        existingShowId: normalizedExistingShowId,
        showTitle: normalizedShowTitle,
        creatorName: "",
        contactEmail: normalizedContactEmail,
        officialSite: "",
        rssOrListenLink: "",
        genres: "",
        notes: normalizedOptionalNotes || normalizedIssueDescription,
        payload,
        provenance,
        sourceIp: sourceIp || "",
        userAgent: normalizedUserAgent,
      });

      return {
        accepted: true,
        filtered: false,
        submission,
      };
    }

    if (normalizedSubmissionType === "listener-review") {
      const parsedRatingStars = parseIntegerInRange(ratingStars, 1, 5);
      const parsedLegacyRating = parseIntegerInRange(listenerRating, 1, 10);
      const normalizedRatingStars = parsedRatingStars || (parsedLegacyRating ? Math.max(1, Math.min(5, Math.round(parsedLegacyRating / 2))) : null);
      const normalizedRating = parsedLegacyRating || (normalizedRatingStars ? normalizedRatingStars * 2 : null);
      const normalizedReviewTitle = trimString(reviewTitle, 80) || trimString(listenerReview, 80) || "Listener review";
      const normalizedReviewText = trimString(reviewText || listenerReview, 4000);
      const normalizedWhoWouldLikeThis = trimString(whoWouldLikeThis, 200);
      const normalizedBestFor = trimStringArray(bestFor, { maxItems: 12, maxItemLength: 80 });
      const normalizedWorkedBest = trimStringArray(workedBest, { maxItems: 12, maxItemLength: 80 });
      const normalizedSimilarShows = trimString(similarShows, 120);
      const normalizedAlias = trimString(alias, 120);

      if (!normalizedRatingStars || !normalizedRating) {
        const error = new Error("Listener reviews require a rating between 1 and 5 stars.");
        error.statusCode = 400;
        throw error;
      }

      if (!normalizedReviewText) {
        const error = new Error("Listener review text is required.");
        error.statusCode = 400;
        throw error;
      }

      const payload = {
        ratingStars: normalizedRatingStars,
        rating: normalizedRating,
        spoilerLevel: normalizedSpoilerLevel,
        reviewTitle: normalizedReviewTitle,
        review: normalizedReviewText,
        whoWouldLikeThis: normalizedWhoWouldLikeThis,
        bestFor: normalizedBestFor,
        workedBest: normalizedWorkedBest,
        similarShows: normalizedSimilarShows,
        alias: normalizedAlias,
        notes: normalizedNotes,
      };

      const submission = store.createShowSubmission({
        status: "new",
        submissionType: normalizedSubmissionType,
        existingShowId: normalizedExistingShowId,
        showTitle: normalizedShowTitle,
        creatorName: "",
        contactEmail: normalizedContactEmail,
        officialSite: "",
        rssOrListenLink: "",
        genres: "",
        notes: normalizedNotes,
        payload,
        provenance: {},
        sourceIp: sourceIp || "",
        userAgent: normalizedUserAgent,
      });

      return {
        accepted: true,
        filtered: false,
        submission,
      };
    }

    const normalizedRole = trimString(role, 80);
    const normalizedVerificationMethod = trimString(verificationMethod, 80);
    const normalizedProofUrl = trimString(proofUrl, 500);
    const normalizedRequestedUpdates = trimString(requestedUpdates || normalizedLegacyProvenanceNotes, 4000);
    const normalizedPreferredDescription = trimString(preferredDescription, 1000);
    const normalizedOfficialLinks = normalizeNamedLinks(officialLinks, { fallbackLabel: "Official link" });
    const fallbackOfficialLinks = normalizedLegacyVerificationSources.map((url) => ({ label: "Official source", url }));
    const effectiveOfficialLinks = [...normalizedOfficialLinks, ...fallbackOfficialLinks].slice(0, 20);
    const effectiveOfficialSite = normalizedOfficialSite || effectiveOfficialLinks.find((row) => row.label.toLowerCase().includes("website"))?.url || "";

    ensureValidUrls(
      [normalizedProofUrl, effectiveOfficialSite, ...effectiveOfficialLinks.map((row) => row.url)].filter(Boolean),
      "Verification links must be valid http or https URLs.",
    );

    if (!normalizedCreatorName) {
      const error = new Error("Creator or network is required.");
      error.statusCode = 400;
      throw error;
    }

    if (!normalizedRole) {
      const error = new Error("Role is required for creator verification.");
      error.statusCode = 400;
      throw error;
    }

    if (!normalizedVerificationMethod) {
      const error = new Error("Verification method is required.");
      error.statusCode = 400;
      throw error;
    }

    if (!normalizedProofUrl) {
      const error = new Error("A proof link or profile URL is required.");
      error.statusCode = 400;
      throw error;
    }

    if (!normalizedRequestedUpdates) {
      const error = new Error("Facts to verify or update are required.");
      error.statusCode = 400;
      throw error;
    }

    if (effectiveOfficialLinks.length === 0) {
      const error = new Error("At least one official link is required.");
      error.statusCode = 400;
      throw error;
    }

    const payload = {
      role: normalizedRole,
      verificationMethod: normalizedVerificationMethod,
      proofUrl: normalizedProofUrl,
      requestedUpdates: normalizedRequestedUpdates,
      preferredDescription: normalizedPreferredDescription,
      officialLinks: effectiveOfficialLinks,
      notes: normalizedNotes,
    };

    const provenance = {
      proofUrl: normalizedProofUrl,
      officialLinks: effectiveOfficialLinks,
    };

    const submission = store.createShowSubmission({
      status: "new",
      submissionType: normalizedSubmissionType,
      existingShowId: normalizedExistingShowId,
      showTitle: normalizedShowTitle,
      creatorName: normalizedCreatorName,
      contactEmail: normalizedContactEmail,
      officialSite: effectiveOfficialSite,
      rssOrListenLink: "",
      genres: "",
      notes: normalizedNotes,
      payload,
      provenance,
      sourceIp: sourceIp || "",
      userAgent: normalizedUserAgent,
    });

    return {
      accepted: true,
      filtered: false,
      submission,
    };
  }

  return {
    submitShow,
  };
}

module.exports = {
  createSubmissionService,
};
