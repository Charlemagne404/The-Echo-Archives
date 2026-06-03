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
    listenerRating,
    spoilerLevel,
    listenerReview,
    verificationSources,
    provenanceNotes,
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
    const normalizedShowTitle = trimString(showTitle, 160);
    const normalizedCreatorName = trimString(creatorName, 160);
    const normalizedContactEmail = trimString(contactEmail, 160).toLowerCase();
    const normalizedOfficialSite = trimString(officialSite, 500);
    const normalizedRssOrListenLink = trimString(rssOrListenLink, 500);
    const normalizedGenres = trimString(genres, 300);
    const normalizedListenerRating = trimString(listenerRating, 4);
    const normalizedSpoilerLevel = allowedSpoilerLevels.has(spoilerLevel) ? spoilerLevel : "spoiler-free";
    const normalizedListenerReview = trimString(listenerReview, 4000);
    const normalizedVerificationSources = parseUrlList(verificationSources).slice(0, 20);
    const normalizedProvenanceNotes = trimString(provenanceNotes, 4000);
    const normalizedNotes = trimString(notes, 4000);

    if (!normalizedShowTitle) {
      const error = new Error("Show title is required.");
      error.statusCode = 400;
      throw error;
    }

    if (
      normalizedSubmissionType === "correction" ||
      normalizedSubmissionType === "listener-review" ||
      normalizedSubmissionType === "creator-verification"
    ) {
      if (!normalizedExistingShowId) {
        const error = new Error("Choose the existing archive entry for this submission.");
        error.statusCode = 400;
        throw error;
      }

      if (knownShowIds instanceof Set && !knownShowIds.has(normalizedExistingShowId)) {
        const error = new Error("Unknown archive entry selected for correction.");
        error.statusCode = 400;
        throw error;
      }
    }

    if (!normalizedContactEmail || !isValidEmail(normalizedContactEmail)) {
      const error = new Error("A valid contact email is required.");
      error.statusCode = 400;
      throw error;
    }

    if (!isValidUrl(normalizedOfficialSite) || !isValidUrl(normalizedRssOrListenLink)) {
      const error = new Error("Submitted links must be valid http or https URLs.");
      error.statusCode = 400;
      throw error;
    }

    if (normalizedSubmissionType === "show" && !normalizedOfficialSite && !normalizedRssOrListenLink) {
      const error = new Error("Provide either an official site or an RSS/listen link.");
      error.statusCode = 400;
      throw error;
    }

    if (normalizedSubmissionType === "correction" && !normalizedNotes) {
      const error = new Error("Correction details are required.");
      error.statusCode = 400;
      throw error;
    }

    const sourceLinksAreValid = normalizedVerificationSources.every((value) => isValidUrl(value));
    if (!sourceLinksAreValid) {
      const error = new Error("Verification source links must be valid http or https URLs.");
      error.statusCode = 400;
      throw error;
    }

    if (normalizedSubmissionType === "listener-review") {
      const numericRating = Number.parseInt(normalizedListenerRating, 10);
      if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 10) {
        const error = new Error("Listener reviews require a rating between 1 and 10.");
        error.statusCode = 400;
        throw error;
      }

      if (!normalizedListenerReview) {
        const error = new Error("Listener review text is required.");
        error.statusCode = 400;
        throw error;
      }
    }

    if (normalizedSubmissionType === "creator-verification") {
      if (normalizedVerificationSources.length === 0) {
        const error = new Error("At least one verification source link is required.");
        error.statusCode = 400;
        throw error;
      }

      if (!normalizedProvenanceNotes) {
        const error = new Error("Facts to verify or update are required.");
        error.statusCode = 400;
        throw error;
      }
    }

    const payload =
      normalizedSubmissionType === "listener-review"
        ? {
            rating: Number.parseInt(normalizedListenerRating, 10),
            spoilerLevel: normalizedSpoilerLevel,
            review: normalizedListenerReview,
            notes: normalizedNotes,
          }
        : normalizedSubmissionType === "creator-verification"
          ? {
              sourceLinks: normalizedVerificationSources,
              factsToVerify: normalizedProvenanceNotes,
              notes: normalizedNotes,
            }
          : normalizedSubmissionType === "correction"
            ? {
                correctionDetails: normalizedNotes,
              }
            : {
                genres: normalizedGenres,
                notes: normalizedNotes,
              };

    const provenance =
      normalizedSubmissionType === "creator-verification"
        ? {
            sourceLinks: normalizedVerificationSources,
          }
        : {};

    const submission = store.createShowSubmission({
      status: "new",
      submissionType: normalizedSubmissionType,
      existingShowId: normalizedExistingShowId,
      showTitle: normalizedShowTitle,
      creatorName: normalizedCreatorName,
      contactEmail: normalizedContactEmail,
      officialSite: normalizedOfficialSite,
      rssOrListenLink: normalizedRssOrListenLink,
      genres: normalizedGenres,
      notes: normalizedNotes,
      payload,
      provenance,
      sourceIp: sourceIp || "",
      userAgent: trimString(userAgent, 500),
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
