const GENERATED_ROUTE_MIN_MEMBERS = 4;
const GENERATED_ROUTE_MIN_REASON_LENGTH = 28;
const GENERATED_ROUTE_MIN_DISCOVERY_GROUPS = 3;

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeUrl(value = "") {
  return cleanText(value).toLowerCase().replace(/[?#].*$/, "").replace(/\/+$/, "");
}

function getIdentityKeys(show = {}) {
  return ["rss", "apple", "spotify"]
    .map((key) => {
      const value = normalizeUrl(show.listenLinks?.[key]);
      return value ? `${key}:${value}` : "";
    })
    .filter(Boolean);
}

function toDisplayValue(value = "") {
  return cleanText(value)
    .replace(/[-_]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => (/^[A-Z0-9]{2,}$/.test(part) ? part : `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`))
    .join(" ");
}

function isUsefulAuthoredReason(value = "") {
  const reason = cleanText(value);
  if (reason.length < GENERATED_ROUTE_MIN_REASON_LENGTH) return false;
  return !/^(?:editorial inclusion|explicit catalog similarity link|similar show|included in )\.?$/i.test(reason);
}

function hasRichDiscoveryProfile(show = {}) {
  const groups = ["genres", "formats", "tones", "themes", "tags", "bestFor"]
    .filter((field) => Array.isArray(show[field]) && show[field].some((value) => cleanText(value)));
  return groups.length >= GENERATED_ROUTE_MIN_DISCOVERY_GROUPS;
}

function buildGeneratedDescription(anchor, memberCount) {
  const genres = (Array.isArray(anchor.genres) ? anchor.genres : []).slice(0, 2).map(toDisplayValue).filter(Boolean);
  const tones = (Array.isArray(anchor.tones) ? anchor.tones : []).slice(0, 2).map(toDisplayValue).filter(Boolean);
  const genreText = genres.length ? `${genres.join(" and ")} ` : "";
  const toneText = tones.length ? ` with ${tones.join(" and ").toLowerCase()} energy` : "";
  return `Find ${genreText}audio dramas${toneText} after ${anchor.title}. This route starts with ${memberCount} authored archive matches, each explained for the listener.`;
}

function buildGeneratedSimilarityCollections({ shows = [], collections = [] } = {}) {
  const records = Array.isArray(shows) ? shows : [];
  const publicShows = records.filter((show) => show && (show.status === undefined || show.status === "published"));
  const showById = new Map(publicShows.map((show) => [cleanText(show.id), show]));
  const authoredCollections = Array.isArray(collections) ? collections : [];
  const existingIds = new Set(authoredCollections.map((collection) => cleanText(collection?.id)).filter(Boolean));
  const existingAnchors = new Set(
    authoredCollections
      .filter((collection) => collection?.kind === "similarity")
      .map((collection) => cleanText(collection.anchorShowId))
      .filter(Boolean),
  );

  return publicShows
    .map((anchor, sourceIndex) => {
      const anchorId = cleanText(anchor.id);
      const collectionId = `shows-like-${anchorId}`;
      if (!anchorId || existingAnchors.has(anchorId) || existingIds.has(collectionId) || !hasRichDiscoveryProfile(anchor)) {
        return null;
      }

      const anchorIdentityKeys = new Set(getIdentityKeys(anchor));
      const seen = new Set();
      const members = (Array.isArray(anchor.similarTo) ? anchor.similarTo : [])
        .map((showId) => {
          const id = cleanText(showId);
          const target = showById.get(id);
          const reason = cleanText(anchor.similarReasons?.[id]);
          if (!target || id === anchorId || seen.has(id) || !isUsefulAuthoredReason(reason)) return null;
          if (getIdentityKeys(target).some((key) => anchorIdentityKeys.has(key))) return null;
          seen.add(id);
          return { id, reason };
        })
        .filter(Boolean);

      if (members.length < GENERATED_ROUTE_MIN_MEMBERS) return null;

      const showIds = members.map((member) => member.id);
      const latestDate = [anchor, ...showIds.map((id) => showById.get(id))]
        .map((show) => cleanText(show?.updatedAt || show?.createdAt))
        .filter(Boolean)
        .sort()
        .at(-1) || cleanText(anchor.updatedAt || anchor.createdAt);

      return {
        id: collectionId,
        title: `Shows like ${anchor.title}`,
        description: buildGeneratedDescription(anchor, members.length),
        descriptionProvenance: "generated",
        generatedFrom: "authored-similarTo",
        label: "Authored similarity route",
        kind: "similarity",
        anchorShowId: anchorId,
        intentTags: [...new Set([
          ...(Array.isArray(anchor.bestFor) ? anchor.bestFor : []),
          ...(Array.isArray(anchor.tones) ? anchor.tones : []),
        ].map(cleanText).filter(Boolean))].slice(0, 3),
        commitment: "Similar shows",
        coverShowIds: showIds.slice(0, 4),
        showIds,
        showReasons: Object.fromEntries(members.map((member) => [member.id, member.reason])),
        featured: false,
        order: 500 + sourceIndex,
        createdAt: cleanText(anchor.createdAt),
        updatedAt: latestDate,
      };
    })
    .filter(Boolean);
}

module.exports = {
  buildGeneratedSimilarityCollections,
  GENERATED_ROUTE_MIN_MEMBERS,
};
