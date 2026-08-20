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

  const FALLBACK_SHOW_TITLE = "Untitled show";
  const FALLBACK_SHOW_DESCRIPTION = "No description yet.";
  const FALLBACK_SHOW_COVER = "images/TEA-Logo-S.png";
  const FALLBACK_COLLECTION_TITLE = "Untitled collection";
  const FALLBACK_COLLECTION_DESCRIPTION = "No collection description yet.";

  function createShowHref(id) {
    return `/shows/${encodeURIComponent(id)}`;
  }

  function normalizeDisplayText(value, fallback = "") {
    const normalized = String(value || "").trim();
    return normalized || fallback;
  }

  function normalizeCoverPath(value) {
    const normalized = normalizeDisplayText(value, FALLBACK_SHOW_COVER);
    if (/^(?:https?:)?\/\//i.test(normalized) || /^data:image\//i.test(normalized)) {
      return normalized;
    }

    return normalized.replace(/^\/+/, "") || FALLBACK_SHOW_COVER;
  }

  function createImageSrc(value) {
    const normalized = normalizeCoverPath(value);
    if (/^(?:https?:)?\/\//i.test(normalized) || /^data:image\//i.test(normalized)) {
      return normalized;
    }

    return `/${normalized}`;
  }

  function normalizeCoverVariants(value) {
    if (!Array.isArray(value)) {
      return [];
    }

    const variants = new Map();
    value.forEach((entry) => {
      const width = Number(entry?.width);
      const src = normalizeDisplayText(entry?.src);
      if (![320, 640].includes(width) || !src) {
        return;
      }

      variants.set(width, {
        src: /^(?:https?:)?\/\//i.test(src) || /^data:image\//i.test(src)
          ? src
          : `/${src.replace(/^\/+/, "")}`,
        width,
      });
    });

    return [...variants.values()].sort((left, right) => left.width - right.width);
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

  function uniqueDisplayValues(value) {
    const seen = new Set();
    return (Array.isArray(value) ? value : typeof value === "string" ? [value] : [])
      .map((entry) => String(entry || "").trim())
      .filter((entry) => {
        const key = entry.toLocaleLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function formatCount(value, singular, plural = `${singular}s`) {
    const count = Number(value);
    if (!Number.isFinite(count)) return "";
    return `${count} ${Math.abs(count) === 1 ? singular : plural}`;
  }

  function formatRouteExpansion(value) {
    const count = Number(value);
    if (!Number.isFinite(count) || count < 1) return "Show all collections";
    return `Show ${count} more`;
  }

  function toPublicLabel(value) {
    const normalized = String(value || "").trim();
    const key = normalized.toLowerCase().replace(/[\s_]+/g, "-");
    const labels = {
      ai: "AI",
      "sci-fi": "Sci-Fi",
      "science-fiction": "Sci-Fi",
      indie: "Independent",
      independent: "Independent",
    };
    if (labels[key]) return labels[key];
    return normalized
      .split(/[-\s]+/)
      .filter(Boolean)
      .map((part) => (/^[A-Z0-9]{2,}$/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()))
      .join(" ");
  }

  function derivePublicStatus(show = {}) {
    const release = String(show.releaseStatus || "").trim().toLowerCase();
    const completion = String(show.completionStatus || "").trim().toLowerCase();
    if (completion === "finished" || release === "completed") return "Completed";
    if (completion === "cancelled") return "Cancelled";
    if (release === "hiatus") return "On hiatus";
    if (completion === "ongoing" || release === "active") return "Ongoing";
    if (release === "inactive") return "Inactive";
    return release || completion ? "Status not confirmed" : "";
  }

  function getPublicVerificationLabel(verification = {}) {
    const rawStatus = String(verification?.status || "").trim().toLowerCase().replace(/[\s_]+/g, "-");
    if (rawStatus.includes("draft") || rawStatus.includes("needs-review")) return "Needs review";
    if (rawStatus.includes("creator") && rawStatus.includes("verified")) return "Creator verified";
    if (rawStatus.includes("automated") && rawStatus.includes("source")) return "Automatically source checked";
    if (rawStatus.includes("partial")) return "Partially checked";
    if (rawStatus.includes("verified") || rawStatus.includes("checked") || rawStatus.includes("source")) return "Source checked";
    if (rawStatus && !/^(unknown|unclear|none|not-verified)$/.test(rawStatus)) return "Needs review";
    return "";
  }

  function hasArchiveReviewContent(show = {}) {
    return [show.archiveTake, show.spoilerFreeReview, show.thoughts].some((value) => String(value || "").trim());
  }

  function hasPublicRecommendations(show = {}) {
    const ids = Array.isArray(show.similarTo) ? show.similarTo : [];
    const reasons = show.similarReasons && typeof show.similarReasons === "object" ? show.similarReasons : {};
    return ids.some((id) => String(reasons[id] || "").trim());
  }

  function getPublicContentProfile(show = {}) {
    const reviewed = show.reviewStatus === "full-review" && hasArchiveReviewContent(show);
    const recommendations = hasPublicRecommendations(show);
    const imported = show.reviewStatus === "imported";
    return { imported, reviewed, recommendations, sparse: !reviewed && !recommendations };
  }

  function getCardDiscoveryMetadata(show = {}, maxItems = 2) {
    const limit = Math.max(1, Number(maxItems) || 2);
    const tags = uniqueDisplayValues(show.tags);
    const genres = uniqueDisplayValues(show.genres);
    const imported = String(show.reviewStatus || "").trim().toLowerCase() === "imported";

    if (imported) {
      const sourceGenres = genres
        .filter((genre) => normalizeTagValue(genre) !== "drama")
        .slice(0, limit);

      if (sourceGenres.length > 0) {
        return {
          kind: "source-genre",
          values: sourceGenres,
          text: `Genre: ${sourceGenres.map(toPublicLabel).join(" • ")}`,
        };
      }

      return {
        kind: "source-genre",
        values: [],
        text: genres.length > 0 ? "Genre not yet reviewed" : "",
      };
    }

    if (tags.length > 0) {
      const values = tags.slice(0, limit);
      return {
        kind: "tag",
        values,
        text: values.map(toPublicLabel).join(" • "),
      };
    }

    const values = genres.slice(0, limit);
    return {
      kind: values.length > 0 ? "genre" : "none",
      values,
      text: values.length > 0 ? `Genre: ${values.map(toPublicLabel).join(" • ")}` : "",
    };
  }

  function getReviewStatusLabel(value = "") {
    switch (String(value || "").trim()) {
      case "full-review": return "Full review";
      case "indexed-only": return "Indexed entry";
      case "imported": return "Imported";
      case "planned": return "Review planned";
      case "spotlight": return "Spotlight";
      default: return toPublicLabel(value);
    }
  }

  function getWebPageDates(show = {}) {
    const datePublished = String(show.createdAt || "").trim();
    const dateModified = String(show.updatedAt || datePublished || "").trim();
    return { datePublished, dateModified };
  }

  function getCatalogPublicationDate(show = {}) {
    return String(show.createdAt || show.metadata?.import?.importedAt || "").trim();
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

    function normalizeRatingValue(entryValue) {
      if (typeof entryValue === "number" && Number.isFinite(entryValue)) {
        return entryValue >= 0 && entryValue <= 10 ? entryValue : undefined;
      }

      const parsed =
        typeof entryValue === "string" && entryValue.trim() ? Number.parseFloat(entryValue.trim()) : Number.NaN;
      return Number.isFinite(parsed) && parsed >= 0 && parsed <= 10 ? parsed : undefined;
    }

    return Object.fromEntries(
      Object.entries(value)
        .map(([key, entryValue]) => {
          return [String(key || "").trim(), normalizeRatingValue(entryValue)];
        })
        .filter(([key, entryValue]) => key && entryValue !== undefined),
    );
  }

  function normalizeCollectionRecord(record) {
    const source = record && typeof record === "object" ? record : {};
    const order = normalizeOptionalNumber(source.order);
    const anchorShowId = normalizeDisplayText(source.anchorShowId);
    const publicAutomation = source.automation && typeof source.automation === "object" && !Array.isArray(source.automation)
      ? Object.fromEntries(Object.entries(source.automation).filter(([key]) => key !== "approvedCandidateId"))
      : source.automation;

    return {
      ...source,
      ...(publicAutomation ? { automation: publicAutomation } : {}),
      id: normalizeDisplayText(source.id),
      title: normalizeDisplayText(source.title, FALLBACK_COLLECTION_TITLE),
      description: normalizeDisplayText(source.description, FALLBACK_COLLECTION_DESCRIPTION),
      ...(anchorShowId ? { anchorShowId } : {}),
      showIds: normalizeStringArray(source.showIds),
      coverShowIds: normalizeStringArray(source.coverShowIds),
      intentTags: normalizeStringArray(source.intentTags).map(normalizeTagValue),
      showReasons: normalizeKeyedTextMap(source.showReasons),
      label: typeof source.label === "string" ? source.label.trim() : "",
      commitment: typeof source.commitment === "string" ? source.commitment.trim() : "",
      order: order === undefined ? Number.MAX_SAFE_INTEGER : order,
    };
  }

  function deriveExplicitSourceFormats(metadata = {}) {
    const source = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
    const sourceLabels = normalizeStringArray([
      ...(Array.isArray(source.sourceCategories) ? source.sourceCategories : []),
      ...(Array.isArray(source.sourceKeywords) ? source.sourceKeywords : []),
    ]).map((value) => String(value).trim().toLowerCase().replace(/[\s_]+/g, "-"));
    return sourceLabels.some((value) => value === "full-cast" || value === "fullcast") ? ["full-cast"] : [];
  }

  function normalizeShowRecord(record) {
    const source = record && typeof record === "object" ? record : {};
    const id = normalizeDisplayText(source.id);
    const title = normalizeDisplayText(source.title, FALLBACK_SHOW_TITLE);
    const description = normalizeDisplayText(source.description, FALLBACK_SHOW_DESCRIPTION);
    const cover = normalizeCoverPath(source.cover);
    const coverAlt = normalizeDisplayText(source.coverAlt, `${title} cover art`);
    const status = normalizeDisplayText(source.status);
    const reviewStatus = normalizeDisplayText(source.reviewStatus);
    const releaseStatus = normalizeDisplayText(source.releaseStatus);
    const completionStatus = normalizeDisplayText(source.completionStatus);
    const tags = normalizeStringArray(source.tags);
    const genres = normalizeStringArray(source.genres);
    const tones = normalizeStringArray(source.tones);
    const bestFor = normalizeStringArray(source.bestFor);
    const similarTo = normalizeStringArray(source.similarTo);
    const aliases = normalizeStringArray(source.aliases);
    const themes = normalizeStringArray(source.themes);
    const contentNotes = normalizeStringArray(source.contentNotes);
    const languages = normalizeStringArray(source.languages);
    const transcriptLanguages = normalizeStringArray(source.transcriptLanguages);
    const cast = normalizeStringArray(source.cast);
    const creators = uniqueDisplayValues(source.creators);
    const similarReasons = normalizeKeyedTextMap(source.similarReasons);
    const listenLinks = normalizeUrlMap(source.listenLinks);
    const officialLinks = normalizeUrlMap(source.officialLinks);
    const facts = normalizeStructuredObject(source.facts);
    const credits = normalizeStructuredObject(source.credits);
    const availability = normalizeStructuredObject(source.availability);
    const content = normalizeStructuredObject(source.content);
    const verification = normalizeStructuredObject(source.verification);
    const metadata = normalizeStructuredObject(source.metadata);
    const formats = normalizeStringArray([
      ...(Array.isArray(source.formats) ? source.formats : []),
      ...(reviewStatus === "imported" ? deriveExplicitSourceFormats(metadata) : []),
    ]);
    const rawOfficialDescription = source.officialDescription && typeof source.officialDescription === "object" && !Array.isArray(source.officialDescription)
      ? source.officialDescription
      : {};
    const officialDescription = {
      text: typeof rawOfficialDescription.text === "string" ? rawOfficialDescription.text.trim() : "",
      sourceLabel: typeof rawOfficialDescription.sourceLabel === "string" ? rawOfficialDescription.sourceLabel.trim() : "",
      sourceUrl: typeof rawOfficialDescription.sourceUrl === "string" ? rawOfficialDescription.sourceUrl.trim() : "",
      verifiedAt: typeof rawOfficialDescription.verifiedAt === "string" ? rawOfficialDescription.verifiedAt.trim() : "",
    };
    const popularity = normalizePopularity(source.popularity);
    const releaseDates = normalizeStructuredObject(source.releaseDates);
    const ratings = normalizeRatings(source.ratings);
    const spoilerFreeReviewParagraphs = normalizeReviewParagraphs(
      source.spoilerFreeReviewParagraphs ?? source.spoilerFreeReview,
    );
    const thoughtsParagraphs = normalizeReviewParagraphs(source.thoughtsParagraphs ?? source.thoughts);
    const spoilerFreeReview =
      typeof source.spoilerFreeReview === "string"
        ? source.spoilerFreeReview.trim()
        : joinReviewParagraphs(spoilerFreeReviewParagraphs);
    const thoughts =
      typeof source.thoughts === "string" ? source.thoughts.trim() : joinReviewParagraphs(thoughtsParagraphs);
    const archiveRating = ratings.archive;

    return {
      ...source,
      id,
      title,
      description,
      cover,
      coverAlt,
      coverVariants: normalizeCoverVariants(source.coverVariants),
      status,
      reviewStatus,
      releaseStatus,
      completionStatus,
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
      officialDescription,
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
      href: createShowHref(id),
      hasPage: status === "published",
      image: cover,
      imageSrc: createImageSrc(cover),
      imageAlt: coverAlt,
      summary: description,
      finalRating: Number.isFinite(archiveRating) ? archiveRating : null,
      searchText: "",
      tagTokens: tags.map((tag) => normalizeTagValue(tag)),
      bestForTokens: bestFor.map((tag) => normalizeTagValue(tag)),
    };
  }

  return {
    DEPRECATED_SHOW_FIELDS,
    createShowHref,
    deriveExplicitSourceFormats,
    normalizeCollectionRecord,
    normalizeCoverVariants,
    normalizePopularity,
    normalizeKeyedTextMap,
    normalizeReviewParagraphs,
    normalizeShowRecord,
    normalizeStringArray,
    uniqueDisplayValues,
    formatCount,
    formatRouteExpansion,
    toPublicLabel,
    derivePublicStatus,
    getPublicVerificationLabel,
    getPublicContentProfile,
    getReviewStatusLabel,
    getWebPageDates,
    getCatalogPublicationDate,
    getCardDiscoveryMetadata,
    normalizeStructuredObject,
    normalizeTagValue,
    normalizeUrlMap,
  };
});
