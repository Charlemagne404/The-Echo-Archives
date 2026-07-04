(function (root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.EchoArchiveRecord = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const DEPRECATED_SHOW_FIELDS = [
    "creatorName",
    "networkName",
    "firstRelease",
    "firstReleasedAt",
    "latestRelease",
    "lastReleasedAt",
    "reviewFile",
  ];

  function createShowHref(id) {
    return `/show?id=${encodeURIComponent(id)}`;
  }

  function normalizeTagValue(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\./g, "")
      .replace(/\s+/g, "-");
  }

  function normalizeStringArray(value) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.map((entry) => String(entry || "").trim()).filter(Boolean);
  }

  function normalizeKeyedTextMap(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(value)
        .map(([key, text]) => [String(key || "").trim(), String(text || "").trim()])
        .filter(([key, text]) => key && text),
    );
  }

  function normalizeUrlMap(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(value)
        .map(([key, href]) => [String(key || "").trim(), String(href || "").trim()])
        .filter(([key, href]) => key && href),
    );
  }

  function normalizeStructuredValue(value) {
    if (typeof value === "string") {
      const normalized = value.trim();
      return normalized ? normalized : undefined;
    }

    if (typeof value === "number") {
      return Number.isFinite(value) ? value : undefined;
    }

    if (typeof value === "boolean") {
      return value;
    }

    if (Array.isArray(value)) {
      const normalized = value
        .map((entry) => normalizeStructuredValue(entry))
        .filter((entry) => entry !== undefined);
      return normalized.length > 0 ? normalized : undefined;
    }

    if (!value || typeof value !== "object") {
      return undefined;
    }

    const normalizedEntries = Object.entries(value)
      .map(([key, entryValue]) => [String(key || "").trim(), normalizeStructuredValue(entryValue)])
      .filter(([key, entryValue]) => key && entryValue !== undefined);

    if (normalizedEntries.length === 0) {
      return undefined;
    }

    return Object.fromEntries(normalizedEntries);
  }

  function normalizeStructuredObject(value) {
    const normalized = normalizeStructuredValue(value);
    if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
      return {};
    }

    return normalized;
  }

  function normalizeOptionalNumber(value) {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : undefined;
    }

    if (typeof value !== "string" || !value.trim()) {
      return undefined;
    }

    const parsed = Number.parseFloat(value.trim());
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  function normalizePopularity(value) {
    const normalized = normalizeStructuredObject(value);
    const score = normalizeOptionalNumber(value?.score);

    if (score !== undefined) {
      normalized.score = score;
    } else {
      delete normalized.score;
    }

    return normalized;
  }

  function normalizeReviewParagraphs(value) {
    if (Array.isArray(value)) {
      return value.map((entry) => String(entry || "").trim()).filter(Boolean);
    }

    if (typeof value !== "string") {
      return [];
    }

    return String(value)
      .split(/\n\s*\n+/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  function joinReviewParagraphs(paragraphs) {
    return normalizeReviewParagraphs(paragraphs).join(" ");
  }

  function normalizeRatings(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(value)
        .map(([key, entryValue]) => {
          if (typeof entryValue === "number" && Number.isFinite(entryValue)) {
            return [String(key || "").trim(), entryValue];
          }

          const parsed =
            typeof entryValue === "string" && entryValue.trim() ? Number.parseFloat(entryValue.trim()) : Number.NaN;
          return [String(key || "").trim(), Number.isFinite(parsed) ? parsed : undefined];
        })
        .filter(([key, entryValue]) => key && entryValue !== undefined),
    );
  }

  function normalizeCollectionRecord(record) {
    const order = normalizeOptionalNumber(record.order);

    return {
      ...record,
      showIds: Array.isArray(record.showIds) ? record.showIds.filter(Boolean) : [],
      coverShowIds: normalizeStringArray(record.coverShowIds),
      intentTags: normalizeStringArray(record.intentTags).map(normalizeTagValue),
      showReasons: normalizeKeyedTextMap(record.showReasons),
      label: typeof record.label === "string" ? record.label.trim() : "",
      commitment: typeof record.commitment === "string" ? record.commitment.trim() : "",
      order: order === undefined ? 0 : order,
    };
  }

  function normalizeShowRecord(record) {
    const tags = normalizeStringArray(record.tags);
    const genres = normalizeStringArray(record.genres);
    const tones = normalizeStringArray(record.tones);
    const formats = normalizeStringArray(record.formats);
    const bestFor = normalizeStringArray(record.bestFor);
    const similarTo = normalizeStringArray(record.similarTo);
    const aliases = normalizeStringArray(record.aliases);
    const themes = normalizeStringArray(record.themes);
    const contentNotes = normalizeStringArray(record.contentNotes);
    const languages = normalizeStringArray(record.languages);
    const transcriptLanguages = normalizeStringArray(record.transcriptLanguages);
    const cast = normalizeStringArray(record.cast);
    const creators = normalizeStringArray(record.creators);
    const similarReasons = normalizeKeyedTextMap(record.similarReasons);
    const listenLinks = normalizeUrlMap(record.listenLinks);
    const officialLinks = normalizeUrlMap(record.officialLinks);
    const facts = normalizeStructuredObject(record.facts);
    const credits = normalizeStructuredObject(record.credits);
    const availability = normalizeStructuredObject(record.availability);
    const content = normalizeStructuredObject(record.content);
    const verification = normalizeStructuredObject(record.verification);
    const metadata = normalizeStructuredObject(record.metadata);
    const popularity = normalizePopularity(record.popularity);
    const releaseDates = normalizeStructuredObject(record.releaseDates);
    const ratings = normalizeRatings(record.ratings);
    const spoilerFreeReviewParagraphs = normalizeReviewParagraphs(
      record.spoilerFreeReviewParagraphs ?? record.spoilerFreeReview,
    );
    const thoughtsParagraphs = normalizeReviewParagraphs(record.thoughtsParagraphs ?? record.thoughts);
    const spoilerFreeReview =
      typeof record.spoilerFreeReview === "string"
        ? record.spoilerFreeReview.trim()
        : joinReviewParagraphs(spoilerFreeReviewParagraphs);
    const thoughts =
      typeof record.thoughts === "string" ? record.thoughts.trim() : joinReviewParagraphs(thoughtsParagraphs);
    const archiveRating = ratings.archive;

    return {
      ...record,
      tags,
      genres,
      tones,
      formats,
      bestFor,
      similarTo,
      aliases,
      themes,
      contentNotes,
      languages,
      transcriptLanguages,
      cast,
      creators,
      similarReasons,
      listenLinks,
      officialLinks,
      facts,
      credits,
      availability,
      content,
      verification,
      metadata,
      popularity,
      releaseDates: {
        ...releaseDates,
        first: typeof releaseDates.first === "string" ? releaseDates.first : "",
        latest: typeof releaseDates.latest === "string" ? releaseDates.latest : "",
      },
      ratings,
      spoilerFreeReview,
      spoilerFreeReviewParagraphs,
      thoughts,
      thoughtsParagraphs,
      href: createShowHref(record.id),
      hasPage: record.status === "published",
      image: record.cover || "",
      imageAlt: record.coverAlt || `${record.title} cover art`,
      summary: record.description || "",
      finalRating: Number.isFinite(archiveRating) ? archiveRating : null,
      searchText: "",
      tagTokens: tags.map((tag) => normalizeTagValue(tag)),
      bestForTokens: bestFor.map((tag) => normalizeTagValue(tag)),
    };
  }

  return {
    DEPRECATED_SHOW_FIELDS,
    createShowHref,
    normalizeCollectionRecord,
    normalizePopularity,
    normalizeKeyedTextMap,
    normalizeReviewParagraphs,
    normalizeShowRecord,
    normalizeStringArray,
    normalizeStructuredObject,
    normalizeTagValue,
    normalizeUrlMap,
  };
});
