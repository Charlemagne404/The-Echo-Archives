const SUBMISSION_TYPES = ["show", "correction", "listener-review", "creator-verification"];
const SUBMISSION_TYPE_SET = new Set(SUBMISSION_TYPES);
const SPOILER_LEVELS = new Set(["spoiler-free", "light-spoilers", "full-spoilers"]);

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

function ensureKnownShowId(knownShowIds, submissionType, showId) {
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

function createFilteredResult() {
  return {
    accepted: true,
    filtered: true,
  };
}

function createAcceptedResult(submission) {
  return {
    accepted: true,
    filtered: false,
    submission,
  };
}

function resolveSubmissionType(rawBody = {}) {
  return SUBMISSION_TYPE_SET.has(rawBody?.submissionType) ? rawBody.submissionType : "show";
}

function resolveExistingShowId(rawBody = {}) {
  return trimString(rawBody?.existingShowId, 120);
}

function resolveShowTitle(rawBody = {}, existingShowId = "") {
  const preferredTitle = trimString(rawBody?.showTitle, 160);
  if (preferredTitle) {
    return preferredTitle;
  }

  if (existingShowId) {
    return existingShowId;
  }

  const error = new Error("Show title is required.");
  error.statusCode = 400;
  throw error;
}

function normalizeCommonFields(rawBody = {}, requestContext = {}) {
  const submissionType = resolveSubmissionType(rawBody);
  const existingShowId = resolveExistingShowId(rawBody);
  const creatorName = trimString(rawBody?.creatorName, 160);
  const contactEmail = trimString(rawBody?.contactEmail, 160).toLowerCase();
  const officialSite = trimString(rawBody?.officialSite, 500);
  const rssOrListenLink = trimString(rawBody?.rssOrListenLink, 500);
  const genres = trimString(rawBody?.genres, 300);
  const notes = trimString(rawBody?.notes, 4000);
  const spoilerLevel = SPOILER_LEVELS.has(rawBody?.spoilerLevel) ? rawBody.spoilerLevel : "spoiler-free";
  const verificationSources = parseUrlList(rawBody?.verificationSources).slice(0, 20);
  const provenanceNotes = trimString(rawBody?.provenanceNotes, 4000);
  const userAgent = trimString(requestContext?.userAgent, 500);
  const sourceIp = requestContext?.sourceIp || "";
  const honeypot = trimString(rawBody?.website, 200);

  return {
    submissionType,
    existingShowId,
    creatorName,
    contactEmail,
    officialSite,
    rssOrListenLink,
    genres,
    notes,
    spoilerLevel,
    verificationSources,
    provenanceNotes,
    userAgent,
    sourceIp,
    honeypot,
    showTitle: resolveShowTitle(rawBody, existingShowId),
  };
}

function validateCommonSubmissionFields(common) {
  if (common.submissionType === "show") {
    if (!common.contactEmail || !isValidEmail(common.contactEmail)) {
      const error = new Error("A valid contact email is required.");
      error.statusCode = 400;
      throw error;
    }
  } else if (common.contactEmail && !isValidEmail(common.contactEmail)) {
    const error = new Error("Contact email must be valid if provided.");
    error.statusCode = 400;
    throw error;
  }

  if (!isValidUrl(common.officialSite) || !isValidUrl(common.rssOrListenLink)) {
    const error = new Error("Submitted links must be valid http or https URLs.");
    error.statusCode = 400;
    throw error;
  }
}

function createShowSubmissionHandler({ store }) {
  return ({ rawBody, common }) => {
    const listenLinks = normalizeNamedLinks(rawBody?.listenLinks, { fallbackLabel: "Listen link" });
    const selectedTags = trimStringArray(rawBody?.selectedTags, { maxItems: 12, maxItemLength: 80 });
    if (selectedTags.length === 0 && common.genres) {
      selectedTags.push(...trimStringArray(common.genres, {
        maxItems: 12,
        maxItemLength: 80,
        splitPattern: /\s*,\s*/,
      }));
    }

    const completionStatus = trimString(rawBody?.completionStatus, 80) || "unknown";
    const shortDescription = trimString(rawBody?.shortDescription || common.notes, 1000);
    const archiveFitNote = trimString(rawBody?.archiveFitNote || common.notes, 4000);
    const verificationNotes = trimString(rawBody?.verificationNotes, 1000);
    const primaryListenLink = common.rssOrListenLink || listenLinks[0]?.url || "";

    ensureValidUrls(
      [common.officialSite, primaryListenLink, ...listenLinks.map((row) => row.url)].filter(Boolean),
      "Show submission links must be valid http or https URLs.",
    );

    if (!common.creatorName) {
      const error = new Error("Creator or network is required.");
      error.statusCode = 400;
      throw error;
    }

    if (!common.officialSite && listenLinks.length === 0 && !primaryListenLink) {
      const error = new Error("Provide at least one official or listen link.");
      error.statusCode = 400;
      throw error;
    }

    if (!shortDescription) {
      const error = new Error("Short spoiler-free description is required.");
      error.statusCode = 400;
      throw error;
    }

    if (!archiveFitNote) {
      const error = new Error("Why it belongs in the archive is required.");
      error.statusCode = 400;
      throw error;
    }

    if (selectedTags.length === 0) {
      const error = new Error("At least one genre or tag is required.");
      error.statusCode = 400;
      throw error;
    }

    return createAcceptedResult(
      store.createShowSubmission({
        status: "new",
        submissionType: common.submissionType,
        existingShowId: "",
        showTitle: common.showTitle,
        creatorName: common.creatorName,
        contactEmail: common.contactEmail,
        officialSite: common.officialSite,
        rssOrListenLink: primaryListenLink,
        genres: selectedTags.join(", "),
        notes: archiveFitNote,
        payload: {
          listenLinks,
          selectedTags,
          completionStatus,
          shortDescription,
          archiveFitNote,
          verificationNotes,
        },
        provenance: {},
        sourceIp: common.sourceIp,
        userAgent: common.userAgent,
      }),
    );
  };
}

function createCorrectionSubmissionHandler({ store }) {
  return ({ rawBody, common }) => {
    const correctionType = trimString(rawBody?.correctionType, 80) || "metadata";
    const issueDescription = trimString(rawBody?.issueDescription || common.notes, 1000);
    const correctedInformation = trimString(rawBody?.correctedInformation, 1000);
    const sourceLinks = [
      ...normalizeUrlRows(rawBody?.sourceLinks).map((row) => row.url),
      ...common.verificationSources,
    ].filter(Boolean).slice(0, 20);
    const optionalNotes = trimString(common.notes, 1000);

    ensureValidUrls(sourceLinks, "Source links must be valid http or https URLs.");

    if (!issueDescription) {
      const error = new Error("Correction details are required.");
      error.statusCode = 400;
      throw error;
    }

    if (!correctedInformation) {
      const error = new Error("Correct information is required.");
      error.statusCode = 400;
      throw error;
    }

    if (sourceLinks.length === 0) {
      const error = new Error("At least one correction source link is required.");
      error.statusCode = 400;
      throw error;
    }

    return createAcceptedResult(
      store.createShowSubmission({
        status: "new",
        submissionType: common.submissionType,
        existingShowId: common.existingShowId,
        showTitle: common.showTitle,
        creatorName: "",
        contactEmail: common.contactEmail,
        officialSite: "",
        rssOrListenLink: "",
        genres: "",
        notes: optionalNotes || issueDescription,
        payload: {
          correctionType,
          issueDescription,
          correctedInformation,
          sourceLinks,
          notes: optionalNotes,
        },
        provenance: {
          sourceLinks,
        },
        sourceIp: common.sourceIp,
        userAgent: common.userAgent,
      }),
    );
  };
}

function createListenerReviewSubmissionHandler({ store }) {
  return ({ rawBody, common }) => {
    const parsedRatingStars = parseIntegerInRange(rawBody?.ratingStars, 1, 5);
    const parsedLegacyRating = parseIntegerInRange(rawBody?.listenerRating, 1, 10);
    const ratingStars =
      parsedRatingStars || (parsedLegacyRating ? Math.max(1, Math.min(5, Math.round(parsedLegacyRating / 2))) : null);
    const rating = parsedLegacyRating || (ratingStars ? ratingStars * 2 : null);
    const reviewTitle = trimString(rawBody?.reviewTitle, 80) || trimString(rawBody?.listenerReview, 80) || "Listener review";
    const reviewText = trimString(rawBody?.reviewText || rawBody?.listenerReview, 4000);
    const whoWouldLikeThis = trimString(rawBody?.whoWouldLikeThis, 200);
    const bestFor = trimStringArray(rawBody?.bestFor, { maxItems: 12, maxItemLength: 80 });
    const workedBest = trimStringArray(rawBody?.workedBest, { maxItems: 12, maxItemLength: 80 });
    const similarShows = trimString(rawBody?.similarShows, 120);
    const alias = trimString(rawBody?.alias, 120);

    if (!ratingStars || !rating) {
      const error = new Error("Listener reviews require a rating between 1 and 5 stars.");
      error.statusCode = 400;
      throw error;
    }

    if (!reviewText) {
      const error = new Error("Listener review text is required.");
      error.statusCode = 400;
      throw error;
    }

    return createAcceptedResult(
      store.createShowSubmission({
        status: "new",
        submissionType: common.submissionType,
        existingShowId: common.existingShowId,
        showTitle: common.showTitle,
        creatorName: "",
        contactEmail: common.contactEmail,
        officialSite: "",
        rssOrListenLink: "",
        genres: "",
        notes: common.notes,
        payload: {
          ratingStars,
          rating,
          spoilerLevel: common.spoilerLevel,
          reviewTitle,
          review: reviewText,
          whoWouldLikeThis,
          bestFor,
          workedBest,
          similarShows,
          alias,
          notes: common.notes,
        },
        provenance: {},
        sourceIp: common.sourceIp,
        userAgent: common.userAgent,
      }),
    );
  };
}

function createCreatorVerificationSubmissionHandler({ store }) {
  return ({ rawBody, common }) => {
    const role = trimString(rawBody?.role, 80);
    const verificationMethod = trimString(rawBody?.verificationMethod, 80);
    const proofUrl = trimString(rawBody?.proofUrl, 500);
    const requestedUpdates = trimString(rawBody?.requestedUpdates || common.provenanceNotes, 4000);
    const preferredDescription = trimString(rawBody?.preferredDescription, 1000);
    const officialLinks = normalizeNamedLinks(rawBody?.officialLinks, { fallbackLabel: "Official link" });
    const fallbackOfficialLinks = common.verificationSources.map((url) => ({ label: "Official source", url }));
    const effectiveOfficialLinks = [...officialLinks, ...fallbackOfficialLinks].slice(0, 20);
    const effectiveOfficialSite =
      common.officialSite ||
      effectiveOfficialLinks.find((row) => row.label.toLowerCase().includes("website"))?.url ||
      "";

    ensureValidUrls(
      [proofUrl, effectiveOfficialSite, ...effectiveOfficialLinks.map((row) => row.url)].filter(Boolean),
      "Verification links must be valid http or https URLs.",
    );

    if (!common.creatorName) {
      const error = new Error("Creator or network is required.");
      error.statusCode = 400;
      throw error;
    }

    if (!role) {
      const error = new Error("Role is required for creator verification.");
      error.statusCode = 400;
      throw error;
    }

    if (!verificationMethod) {
      const error = new Error("Verification method is required.");
      error.statusCode = 400;
      throw error;
    }

    if (!proofUrl) {
      const error = new Error("A proof link or profile URL is required.");
      error.statusCode = 400;
      throw error;
    }

    if (!requestedUpdates) {
      const error = new Error("Facts to verify or update are required.");
      error.statusCode = 400;
      throw error;
    }

    if (effectiveOfficialLinks.length === 0) {
      const error = new Error("At least one official link is required.");
      error.statusCode = 400;
      throw error;
    }

    return createAcceptedResult(
      store.createShowSubmission({
        status: "new",
        submissionType: common.submissionType,
        existingShowId: common.existingShowId,
        showTitle: common.showTitle,
        creatorName: common.creatorName,
        contactEmail: common.contactEmail,
        officialSite: effectiveOfficialSite,
        rssOrListenLink: "",
        genres: "",
        notes: common.notes,
        payload: {
          role,
          verificationMethod,
          proofUrl,
          requestedUpdates,
          preferredDescription,
          officialLinks: effectiveOfficialLinks,
          notes: common.notes,
        },
        provenance: {
          proofUrl,
          officialLinks: effectiveOfficialLinks,
        },
        sourceIp: common.sourceIp,
        userAgent: common.userAgent,
      }),
    );
  };
}

function createSubmissionService({
  store,
  knownShowIds = null,
  rateLimiter = null,
}) {
  const modeHandlers = {
    show: createShowSubmissionHandler({ store }),
    correction: createCorrectionSubmissionHandler({ store }),
    "listener-review": createListenerReviewSubmissionHandler({ store }),
    "creator-verification": createCreatorVerificationSubmissionHandler({ store }),
  };

  function submit(rawBody = {}, requestContext = {}) {
    const common = normalizeCommonFields(rawBody, requestContext);

    if (common.honeypot) {
      return createFilteredResult();
    }

    rateLimiter?.check("submissions", common.sourceIp);
    validateCommonSubmissionFields(common);

    if (common.submissionType !== "show") {
      ensureKnownShowId(knownShowIds, common.submissionType, common.existingShowId);
    }

    return modeHandlers[common.submissionType]({
      rawBody,
      common,
    });
  }

  function submitShow(payload) {
    return submit(payload, {
      sourceIp: payload?.sourceIp || "",
      userAgent: payload?.userAgent || "",
    });
  }

  return {
    submit,
    submitShow,
  };
}

module.exports = {
  createSubmissionService,
};
