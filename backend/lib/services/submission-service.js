const SUBMISSION_TYPES = ["show", "correction", "listener-review", "creator-verification"];
const SUBMISSION_TYPE_SET = new Set(SUBMISSION_TYPES);
const SPOILER_LEVELS = new Set(["spoiler-free", "light-spoilers", "full-spoilers"]);
const MODERATION_STATUSES = ["new", "in-review", "accepted", "rejected", "needs-follow-up"];
const MODERATION_STATUS_SET = new Set(MODERATION_STATUSES);
const OPEN_MODERATION_STATUSES = ["new", "in-review", "needs-follow-up"];
const PRIORITIES = ["high", "normal", "low"];
const PRIORITY_SET = new Set(PRIORITIES);
const LISTENER_REVIEW_CATEGORY_KEYS = ["voiceActing", "soundDesign", "story", "characters", "ads", "length"];
const CORRECTION_TYPES = new Set(["broken-link", "metadata", "status", "credits", "creator-page", "artwork", "other"]);
const CORRECTION_LINK_ACTIONS = new Set(["replace", "remove"]);
const CORRECTION_CREDIT_ACTIONS = new Set(["add", "update", "remove"]);
const CORRECTION_METADATA_FIELDS = new Set(["creator", "description", "release-date", "runtime", "language", "other"]);
const CORRECTION_STATUSES = new Set(["ongoing", "completed", "hiatus", "returning", "anthology", "unknown"]);
const CREATOR_PAGE_ISSUES = new Set(["missing-page", "name-or-alias", "organization-type", "show-connection", "official-links", "description", "other"]);
const ENTITY_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERIFICATION_METHODS = new Set(["official-domain-email", "website", "social-account", "press-kit", "other"]);
const LEGAL_DOCUMENT_VERSION = "2026-08-20";
const LINK_LABELS = {
  apple: "Apple Podcasts",
  rss: "RSS Feed",
  spotify: "Spotify",
  website: "Official Website",
  youtube: "YouTube",
  patreon: "Patreon",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  x: "X (Twitter)",
};

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
  const normalizedValue = String(value ?? "").trim();
  if (!/^\d+$/.test(normalizedValue)) {
    return null;
  }
  const numericValue = Number(normalizedValue);
  if (!Number.isInteger(numericValue) || numericValue < minimum || numericValue > maximum) {
    return null;
  }

  return numericValue;
}

function normalizeListenerReviewCategoryScores(value) {
  if (value === undefined || value === null || value === "") {
    return {};
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    const error = new Error("Detailed ratings must use category scores from 1 to 10.");
    error.statusCode = 400;
    throw error;
  }

  const unknownKeys = Object.keys(value).filter((key) => !LISTENER_REVIEW_CATEGORY_KEYS.includes(key));
  if (unknownKeys.length > 0) {
    const error = new Error("Unknown detailed rating category.");
    error.statusCode = 400;
    throw error;
  }

  return Object.fromEntries(LISTENER_REVIEW_CATEGORY_KEYS.flatMap((key) => {
    const rawScore = value[key];
    if (rawScore === undefined || rawScore === null || rawScore === "") {
      return [];
    }
    const score = parseIntegerInRange(rawScore, 1, 10);
    if (!score) {
      const error = new Error("Detailed ratings must be whole numbers from 1 to 10.");
      error.statusCode = 400;
      throw error;
    }
    return [[key, score]];
  }));
}

function normalizeIntakeVersion(rawBody = {}) {
  return Number.parseInt(String(rawBody?.intakeVersion || ""), 10) === 2 ? 2 : 1;
}

function requireText(value, message, maxLength = 1000) {
  const normalized = trimString(value, maxLength);
  if (!normalized) {
    const error = new Error(message);
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

function requireUrl(value, message) {
  const normalized = requireText(value, message, 500);
  if (!isValidUrl(normalized)) {
    const error = new Error(message);
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

function normalizeCorrectionDetails(correctionType, rawDetails = {}, sourceLinks = []) {
  const details = rawDetails && typeof rawDetails === "object" && !Array.isArray(rawDetails) ? rawDetails : {};

  switch (correctionType) {
    case "broken-link": {
      const action = CORRECTION_LINK_ACTIONS.has(details.action) ? details.action : "replace";
      const affectedUrl = requireUrl(details.affectedUrl, "Choose or enter the affected link.");
      const replacementUrl = action === "replace"
        ? requireUrl(details.replacementUrl, "A valid replacement link is required.")
        : "";
      return { action, affectedUrl, ...(replacementUrl ? { replacementUrl } : {}) };
    }
    case "metadata": {
      const field = CORRECTION_METADATA_FIELDS.has(details.field) ? details.field : "";
      if (!field) {
        const error = new Error("Choose the metadata field to correct.");
        error.statusCode = 400;
        throw error;
      }
      if (sourceLinks.length === 0) {
        const error = new Error("Add an official source for this metadata correction.");
        error.statusCode = 400;
        throw error;
      }
      return {
        field,
        proposedValue: requireText(details.proposedValue, "Enter the corrected metadata.", 1000),
      };
    }
    case "status": {
      const proposedStatus = CORRECTION_STATUSES.has(details.proposedStatus) ? details.proposedStatus : "";
      if (!proposedStatus) {
        const error = new Error("Choose the proposed show status.");
        error.statusCode = 400;
        throw error;
      }
      if (sourceLinks.length === 0) {
        const error = new Error("Add an official source for this status update.");
        error.statusCode = 400;
        throw error;
      }
      const effectiveDateOrNote = trimString(details.effectiveDateOrNote, 500);
      return { proposedStatus, ...(effectiveDateOrNote ? { effectiveDateOrNote } : {}) };
    }
    case "credits": {
      const action = CORRECTION_CREDIT_ACTIONS.has(details.action) ? details.action : "";
      if (!action) {
        const error = new Error("Choose how the credit should change.");
        error.statusCode = 400;
        throw error;
      }
      if (sourceLinks.length === 0) {
        const error = new Error("Add an official source for this credit correction.");
        error.statusCode = 400;
        throw error;
      }
      return {
        action,
        name: requireText(details.name, "Enter the credited person or organization.", 200),
        role: requireText(details.role, "Enter the credit role.", 160),
      };
    }
    case "creator-page": {
      if (sourceLinks.length === 0) {
        const error = new Error("Add an official source for this creator-page correction.");
        error.statusCode = 400;
        throw error;
      }
      const creatorPageIssue = CREATOR_PAGE_ISSUES.has(details.creatorPageIssue) ? details.creatorPageIssue : "";
      if (!creatorPageIssue) {
        const error = new Error("Choose what needs updating on the creator page.");
        error.statusCode = 400;
        throw error;
      }
      const creatorPageId = trimString(details.creatorPageId, 120);
      return {
        creatorPageName: requireText(details.creatorPageName, "Creator page name is required.", 160),
        creatorPageIssue,
        ...(creatorPageId && ENTITY_ID_PATTERN.test(creatorPageId) ? { creatorPageId } : {}),
        proposedValue: requireText(details.proposedValue, "Describe the creator-page update.", 1000),
      };
    }
    case "artwork": {
      const credit = trimString(details.credit, 300);
      return {
        artworkUrl: requireUrl(details.artworkUrl, "A valid official artwork URL is required."),
        ...(credit ? { credit } : {}),
      };
    }
    case "other":
      return {
        issue: requireText(details.issue, "Describe the factual issue.", 1000),
        proposedValue: requireText(details.proposedValue, "Describe the proposed correction.", 1000),
      };
    default: {
      const error = new Error("Choose a valid correction type.");
      error.statusCode = 400;
      throw error;
    }
  }
}

function objectLinksToRows(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  return Object.entries(value).flatMap(([key, url]) => {
    const normalizedUrl = trimString(url, 500);
    return normalizedUrl && isValidUrl(normalizedUrl)
      ? [{ label: LINK_LABELS[key] || key.replace(/[-_]/g, " ").replace(/^./, (character) => character.toUpperCase()), url: normalizedUrl }]
      : [];
  });
}

function buildShowContext(show) {
  if (!show) {
    return null;
  }
  const dedupeLinks = (rows) => {
    const seenUrls = new Set();
    return rows.filter((row) => {
      if (seenUrls.has(row.url)) return false;
      seenUrls.add(row.url);
      return true;
    });
  };
  const listenLinks = dedupeLinks(objectLinksToRows(show.listenLinks));
  const officialLinks = dedupeLinks(objectLinksToRows(show.officialLinks));
  return {
    id: show.id,
    title: show.title,
    creators: trimStringArray(show.creators, { maxItems: 20, maxItemLength: 160 }),
    completionStatus: trimString(show.completionStatus || show.releaseStatus || "unknown", 80),
    officialDescription: trimString(
      typeof show.officialDescription === "string" ? show.officialDescription : show.officialDescription?.text,
      4000,
    ),
    listenLinks,
    officialLinks,
  };
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

function withLegalAcknowledgement(common, provenance = {}) {
  if (!common.legalAcknowledged) {
    return provenance;
  }

  return {
    ...provenance,
    legalAcknowledgement: {
      version: common.legalVersion,
      acknowledgedAt: new Date().toISOString(),
    },
  };
}

function createMaintainerNotFoundError() {
  const error = new Error("Submission not found.");
  error.statusCode = 404;
  return error;
}

function resolveSubmissionType(rawBody = {}) {
  return SUBMISSION_TYPE_SET.has(rawBody?.submissionType) ? rawBody.submissionType : "show";
}

function resolveExistingShowId(rawBody = {}) {
  return trimString(rawBody?.existingShowId, 120);
}

function isCreatorPageCorrection(rawBody = {}) {
  return resolveSubmissionType(rawBody) === "correction" && trimString(rawBody?.correctionType, 80) === "creator-page";
}

function resolveShowTitle(rawBody = {}, existingShowId = "") {
  const creatorPageName = isCreatorPageCorrection(rawBody)
    ? rawBody?.creatorPageName || rawBody?.correctionDetails?.creatorPageName
    : "";
  const preferredTitle = trimString(rawBody?.showTitle, 160) || trimString(creatorPageName, 160);
  if (preferredTitle) {
    return preferredTitle;
  }

  if (existingShowId) {
    return existingShowId;
  }

  if (isCreatorPageCorrection(rawBody)) {
    return "Creator page correction";
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
  const legalAcknowledged = rawBody?.legalAcknowledged === true;
  const legalVersion = trimString(rawBody?.legalVersion, 40);

  return {
    intakeVersion: normalizeIntakeVersion(rawBody),
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
    legalAcknowledged,
    legalVersion,
    honeypot,
    showTitle: resolveShowTitle(rawBody, existingShowId),
  };
}

function validateCommonSubmissionFields(common, { requireLegalAcknowledgement = false } = {}) {
  if (common.contactEmail && !isValidEmail(common.contactEmail)) {
    const error = new Error("Contact email must be valid if provided.");
    error.statusCode = 400;
    throw error;
  }

  if (!isValidUrl(common.officialSite) || !isValidUrl(common.rssOrListenLink)) {
    const error = new Error("Submitted links must be valid http or https URLs.");
    error.statusCode = 400;
    throw error;
  }

  if (requireLegalAcknowledgement &&
      (!common.legalAcknowledged || common.legalVersion !== LEGAL_DOCUMENT_VERSION)) {
    const error = new Error("Please acknowledge the current Terms and Privacy notice before submitting.");
    error.statusCode = 400;
    throw error;
  }
}

function toMaintainerSubmission(submission) {
  if (!submission) {
    return null;
  }

  return {
    id: submission.id,
    status: submission.status,
    priority: submission.priority || "normal",
    submissionType: submission.submission_type,
    existingShowId: submission.existing_show_id,
    submittedAt: submission.submitted_at,
    showTitle: submission.show_title,
    creatorName: submission.creator_name,
    contactEmail: submission.contact_email,
    officialSite: submission.official_site,
    rssOrListenLink: submission.rss_or_listen_link,
    genres: submission.genres,
    notes: submission.notes,
    payload: submission.payload_json || {},
    provenance: submission.provenance_json || {},
    reviewNotes: submission.review_notes,
    reviewedBy: submission.reviewed_by,
    reviewedAt: submission.reviewed_at,
    sourceIp: submission.source_ip,
    userAgent: submission.user_agent,
  };
}

function normalizeListFilters(filters = {}) {
  const status = trimString(filters.status, 80);
  const submissionType = trimString(filters.submissionType, 80);
  const priority = trimString(filters.priority, 40);
  const q = trimString(filters.q, 200);

  if (status && !MODERATION_STATUS_SET.has(status)) {
    const error = new Error("Unknown maintainer status filter.");
    error.statusCode = 400;
    throw error;
  }

  if (submissionType && !SUBMISSION_TYPE_SET.has(submissionType)) {
    const error = new Error("Unknown submission type filter.");
    error.statusCode = 400;
    throw error;
  }

  if (priority && !PRIORITY_SET.has(priority)) {
    const error = new Error("Unknown priority filter.");
    error.statusCode = 400;
    throw error;
  }

  return {
    status,
    submissionType,
    priority,
    q,
    includeClosed: filters.includeClosed === true,
    page: Math.max(1, Number.parseInt(String(filters.page || "1"), 10) || 1),
    pageSize: Math.min(200, Math.max(1, Number.parseInt(String(filters.pageSize || "20"), 10) || 20)),
    openStatuses: OPEN_MODERATION_STATUSES,
  };
}

function normalizeReviewUpdates(rawUpdates = {}) {
  const updates = {};

  if (Object.hasOwn(rawUpdates, "status")) {
    const status = trimString(rawUpdates.status, 80);
    if (!MODERATION_STATUS_SET.has(status)) {
      const error = new Error("Unknown moderation status.");
      error.statusCode = 400;
      throw error;
    }
    updates.status = status;
  }

  if (Object.hasOwn(rawUpdates, "priority")) {
    const priority = trimString(rawUpdates.priority, 40);
    if (!PRIORITY_SET.has(priority)) {
      const error = new Error("Unknown submission priority.");
      error.statusCode = 400;
      throw error;
    }
    updates.priority = priority;
  }

  if (Object.hasOwn(rawUpdates, "reviewNotes")) {
    updates.reviewNotes = trimString(rawUpdates.reviewNotes, 4000);
  }

  if (Object.hasOwn(rawUpdates, "reviewedBy")) {
    updates.reviewedBy = trimString(rawUpdates.reviewedBy, 160);
  }

  if (Object.keys(updates).length === 0) {
    const error = new Error("No maintainer review fields were provided.");
    error.statusCode = 400;
    throw error;
  }

  return updates;
}

function createShowSubmissionHandler({ store }) {
  return ({ rawBody, common }) => {
    const listenLinks = normalizeNamedLinks(rawBody?.listenLinks, { fallbackLabel: "Listen link" });
    const { isApprovedDiscoveryTag, canonicalizeDiscoveryTag } = require("../../../shared/archive-tags");
    const submittedTags = trimStringArray(rawBody?.selectedTags, { maxItems: 4, maxItemLength: 80 });
    const selectedTags = submittedTags.map(canonicalizeDiscoveryTag).filter(isApprovedDiscoveryTag);
    const suggestedDescriptors = trimString(rawBody?.suggestedDescriptors, 500);

    const completionStatus = trimString(rawBody?.completionStatus, 80) || "unknown";
    const shortDescription = trimString(rawBody?.shortDescription, 1000);
    const verificationNotes = trimString(rawBody?.verificationNotes || common.notes, 1000);
    const derivedOfficialSite = common.officialSite || listenLinks.find((row) => /website/i.test(row.label))?.url || "";
    const primaryListenLink = common.rssOrListenLink ||
      listenLinks.find((row) => /rss/i.test(row.label))?.url ||
      listenLinks.find((row) => !/website/i.test(row.label))?.url ||
      "";

    ensureValidUrls(
      [derivedOfficialSite, primaryListenLink, ...listenLinks.map((row) => row.url)].filter(Boolean),
      "Show submission links must be valid http or https URLs.",
    );

    if (!derivedOfficialSite && listenLinks.length === 0 && !primaryListenLink) {
      const error = new Error("Provide at least one official or listen link.");
      error.statusCode = 400;
      throw error;
    }

    const payload = {
      ...(common.intakeVersion === 2 ? { intakeVersion: 2 } : {}),
      listenLinks,
      selectedTags,
      ...(suggestedDescriptors ? { suggestedDescriptors } : {}),
      completionStatus,
      shortDescription,
      verificationNotes,
    };
    if (common.intakeVersion !== 2) {
      const archiveFitNote = trimString(rawBody?.archiveFitNote || common.notes, 4000);
      if (archiveFitNote) payload.archiveFitNote = archiveFitNote;
    }

    return createAcceptedResult(
      store.createShowSubmission({
        status: "new",
        submissionType: common.submissionType,
        existingShowId: "",
        showTitle: common.showTitle,
        creatorName: common.creatorName,
        contactEmail: common.contactEmail,
        officialSite: derivedOfficialSite,
        rssOrListenLink: primaryListenLink,
        notes: verificationNotes,
        payload,
        provenance: withLegalAcknowledgement(common, {
          sourceLinks: [...new Set([derivedOfficialSite, primaryListenLink, ...listenLinks.map((row) => row.url)].filter(Boolean))],
        }),
        sourceIp: common.sourceIp,
        userAgent: common.userAgent,
      }),
    );
  };
}

function createCorrectionSubmissionHandler({ store }) {
  return ({ rawBody, common }) => {
    const correctionType = trimString(rawBody?.correctionType, 80) || "metadata";
    const sourceLinks = [
      ...normalizeUrlRows(rawBody?.sourceLinks).map((row) => row.url),
      ...common.verificationSources,
    ].filter(Boolean).slice(0, 20);
    const optionalNotes = trimString(common.notes, 1000);

    ensureValidUrls(sourceLinks, "Source links must be valid http or https URLs.");

    let payload;
    let summary;
    if (common.intakeVersion === 2) {
      if (!CORRECTION_TYPES.has(correctionType)) {
        const error = new Error("Choose a valid correction type.");
        error.statusCode = 400;
        throw error;
      }
      const correctionDetails = normalizeCorrectionDetails(correctionType, rawBody?.correctionDetails, sourceLinks);
      payload = {
        intakeVersion: 2,
        correctionType,
        correctionDetails,
        sourceLinks,
        notes: optionalNotes,
      };
      summary = correctionType === "broken-link"
        ? `${correctionDetails.action === "remove" ? "Remove" : "Replace"} ${correctionDetails.affectedUrl}`
        : correctionType === "metadata"
          ? `${correctionDetails.field}: ${correctionDetails.proposedValue}`
          : correctionType === "status"
            ? `Status: ${correctionDetails.proposedStatus}`
            : correctionType === "credits"
              ? `${correctionDetails.action} ${correctionDetails.name} — ${correctionDetails.role}`
              : correctionType === "creator-page"
                ? `Creator page: ${correctionDetails.creatorPageName} — ${correctionDetails.proposedValue}`
              : correctionType === "artwork"
                ? `Artwork: ${correctionDetails.artworkUrl}`
                : correctionDetails.issue;
    } else {
      const issueDescription = requireText(rawBody?.issueDescription || common.notes, "Correction details are required.", 1000);
      const correctedInformation = requireText(rawBody?.correctedInformation, "Correct information is required.", 1000);
      if (sourceLinks.length === 0) {
        const error = new Error("At least one correction source link is required.");
        error.statusCode = 400;
        throw error;
      }
      payload = {
        correctionType,
        issueDescription,
        correctedInformation,
        sourceLinks,
        notes: optionalNotes,
      };
      summary = issueDescription;
    }

    return createAcceptedResult(
      store.createShowSubmission({
        status: "new",
        submissionType: common.submissionType,
        existingShowId: common.existingShowId,
        showTitle: common.showTitle,
        creatorName: correctionType === "creator-page" ? payload.correctionDetails?.creatorPageName || "" : "",
        contactEmail: common.contactEmail,
        officialSite: "",
        rssOrListenLink: "",
        genres: "",
        notes: optionalNotes || summary,
        payload,
        provenance: withLegalAcknowledgement(common, {
          sourceLinks,
        }),
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
    const categoryScores = normalizeListenerReviewCategoryScores(rawBody?.categoryScores);

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
          ...(common.intakeVersion === 2 ? { intakeVersion: 2 } : {}),
          ratingStars,
          rating,
          categoryScores,
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
        provenance: withLegalAcknowledgement(common),
        sourceIp: common.sourceIp,
        userAgent: common.userAgent,
      }),
    );
  };
}

function createCreatorVerificationSubmissionHandler({ store }) {
  return ({ rawBody, common }) => {
    const role = trimString(rawBody?.role, 80);
    const rawEvidence = rawBody?.verificationEvidence && typeof rawBody.verificationEvidence === "object" && !Array.isArray(rawBody.verificationEvidence)
      ? rawBody.verificationEvidence
      : {};
    const verificationMethod = trimString(rawEvidence.method || rawBody?.verificationMethod, 80);
    const submittedEvidenceEmail = trimString(rawEvidence.email || common.contactEmail, 160).toLowerCase();
    const submittedProofUrl = trimString(rawEvidence.url || rawBody?.proofUrl, 500);
    const submittedEvidenceDescription = trimString(rawEvidence.description || rawBody?.evidenceDescription, 1000);
    const evidenceEmail = ["official-domain-email", "other"].includes(verificationMethod) ? submittedEvidenceEmail : "";
    const proofUrl = ["website", "social-account", "press-kit", "other"].includes(verificationMethod) ? submittedProofUrl : "";
    const evidenceDescription = verificationMethod === "other" ? submittedEvidenceDescription : "";
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

    if (!VERIFICATION_METHODS.has(verificationMethod)) {
      const error = new Error("Verification method is required.");
      error.statusCode = 400;
      throw error;
    }

    if (!requestedUpdates) {
      const error = new Error("Facts to verify or update are required.");
      error.statusCode = 400;
      throw error;
    }

    if (evidenceEmail && !isValidEmail(evidenceEmail)) {
      const error = new Error("Verification email must be valid if provided.");
      error.statusCode = 400;
      throw error;
    }

    if (verificationMethod === "official-domain-email" && !evidenceEmail) {
      const error = new Error("An official-domain email is required for this verification method.");
      error.statusCode = 400;
      throw error;
    }
    if (["website", "social-account", "press-kit"].includes(verificationMethod) && !proofUrl) {
      const error = new Error("An official proof URL is required for this verification method.");
      error.statusCode = 400;
      throw error;
    }
    if (verificationMethod === "other" && (!evidenceDescription || (!proofUrl && !evidenceEmail))) {
      const error = new Error("Describe the evidence and provide either a proof URL or contact email.");
      error.statusCode = 400;
      throw error;
    }

    const verificationEvidence = {
      method: verificationMethod,
      ...(evidenceEmail ? { email: evidenceEmail } : {}),
      ...(proofUrl ? { url: proofUrl } : {}),
      ...(evidenceDescription ? { description: evidenceDescription } : {}),
    };
    const payload = common.intakeVersion === 2
      ? {
          intakeVersion: 2,
          role,
          verificationEvidence,
          requestedUpdates,
          preferredDescription,
          officialLinks: effectiveOfficialLinks,
          notes: common.notes,
        }
      : {
          role,
          verificationMethod,
          proofUrl,
          requestedUpdates,
          preferredDescription,
          officialLinks: effectiveOfficialLinks,
          notes: common.notes,
        };
    const provenance = common.intakeVersion === 2
      ? { verificationEvidence, officialLinks: effectiveOfficialLinks }
      : { proofUrl, officialLinks: effectiveOfficialLinks };

    return createAcceptedResult(
      store.createShowSubmission({
        status: "new",
        submissionType: common.submissionType,
        existingShowId: common.existingShowId,
        showTitle: common.showTitle,
        creatorName: common.creatorName,
        contactEmail: evidenceEmail,
        officialSite: effectiveOfficialSite,
        rssOrListenLink: "",
        genres: "",
        notes: common.notes,
        payload,
        provenance: withLegalAcknowledgement(common, provenance),
        sourceIp: common.sourceIp,
        userAgent: common.userAgent,
      }),
    );
  };
}

function createSubmissionService({
  store,
  knownShowIds = null,
  knownShows = null,
  rateLimiter = null,
  requireLegalAcknowledgement = false,
}) {
  let effectiveKnownShows = new Map(
    Array.isArray(knownShows)
      ? knownShows.filter((show) => show?.id).map((show) => [show.id, show])
      : knownShows instanceof Map
        ? knownShows
        : [],
  );
  let effectiveKnownShowIds = knownShowIds instanceof Set
    ? new Set(knownShowIds)
    : new Set(effectiveKnownShows.keys());
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
    validateCommonSubmissionFields(common, { requireLegalAcknowledgement });

    const creatorPageCorrectionWithoutShow = common.submissionType === "correction"
      && trimString(rawBody?.correctionType, 80) === "creator-page"
      && !common.existingShowId;
    if (common.submissionType !== "show" && !creatorPageCorrectionWithoutShow) {
      ensureKnownShowId(effectiveKnownShowIds, common.submissionType, common.existingShowId);
      const knownShow = effectiveKnownShows.get(common.existingShowId);
      if (knownShow?.title) {
        common.showTitle = trimString(knownShow.title, 160);
      }
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

  function listForMaintainer(filters = {}) {
    const normalizedFilters = normalizeListFilters(filters);
    const result = store.listShowSubmissions(normalizedFilters);

    return {
      ...result,
      items: result.items.map(toMaintainerSubmission),
    };
  }

  function getForMaintainer(id = "") {
    const trimmedId = trimString(id, 80);
    if (!trimmedId) {
      throw createMaintainerNotFoundError();
    }

    const submission = store.getShowSubmission(trimmedId);
    if (!submission) {
      throw createMaintainerNotFoundError();
    }

    return toMaintainerSubmission(submission);
  }

  function reviewForMaintainer(id = "", rawUpdates = {}) {
    const trimmedId = trimString(id, 80);
    if (!trimmedId) {
      throw createMaintainerNotFoundError();
    }

    const updates = normalizeReviewUpdates(rawUpdates);
    const submission = store.updateShowSubmissionReview(trimmedId, updates);
    if (!submission) {
      throw createMaintainerNotFoundError();
    }

    return toMaintainerSubmission(submission);
  }

  function getShowContext(showId = "") {
    const normalizedId = trimString(showId, 120);
    const context = buildShowContext(effectiveKnownShows.get(normalizedId));
    if (!context) {
      const error = new Error("Show not found.");
      error.statusCode = 404;
      throw error;
    }
    return context;
  }

  return {
    submit,
    submitShow,
    getShowContext,
    listForMaintainer,
    getForMaintainer,
    reviewForMaintainer,
    setKnownShowIds(nextKnownShowIds) {
      effectiveKnownShowIds = new Set(nextKnownShowIds || []);
      effectiveKnownShows = new Map(
        [...effectiveKnownShows.entries()].filter(([showId]) => effectiveKnownShowIds.has(showId)),
      );
    },
    setKnownShows(nextKnownShows) {
      effectiveKnownShows = new Map(
        Array.isArray(nextKnownShows)
          ? nextKnownShows.filter((show) => show?.id).map((show) => [show.id, show])
          : nextKnownShows instanceof Map
            ? nextKnownShows
            : [],
      );
      effectiveKnownShowIds = new Set(effectiveKnownShows.keys());
    },
  };
}

module.exports = {
  createSubmissionService,
  MODERATION_STATUSES,
  OPEN_MODERATION_STATUSES,
  PRIORITIES,
  SUBMISSION_TYPES,
};
