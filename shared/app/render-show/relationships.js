import { getShowCollectionMemberships } from "../render-collections.js";
import { archiveRecord } from "../constants.js";
import { getResponsiveImageSource } from "../images.js";
import { createCollectionHref } from "../urls.js";
import { escapeHtml, formatRouteExpansion, getSimilarReason } from "./utils.js";
import { bucketDiscoveryPosition, getDiscoveryContentProfile } from "../discovery-analytics.js";

const similarityIndexCache = new WeakMap();

export function getShowRelationshipState(show, showMap, collections = [], providedSimilarityIndex = null) {
  const similar = getSimilarShowGroups(show, showMap, collections, providedSimilarityIndex);
  const showValues = showMap instanceof Map ? [...showMap.values()] : [];
  return {
    ...similar,
    memberships: getShowCollectionMemberships(show.id, collections),
    hasMoreFrom: Boolean(globalThis.EchoArchiveEntities?.selectMoreFrom?.(show, showValues)),
    hasEntityRoute: Array.isArray(show?.resolvedEntities) && show.resolvedEntities.some((entity) => entity?.id),
  };
}

function getSimilarShowGroups(show, showMap, collections = [], providedSimilarityIndex = null) {
  const similarityIndex = resolveSimilarityIndex(showMap, collections, providedSimilarityIndex);
  const authoredNeighbors = getEditorialNeighbors(show, showMap, similarityIndex);
  const authoredIds = new Set(authoredNeighbors.map(({ neighbor }) => neighbor.id));
  const computedNeighbors = similarityIndex
    ? similarityIndex.getPublicSimilarityMatches(show.id)
      .filter(({ show: neighbor }) => neighbor && !authoredIds.has(neighbor.id))
      .map(({ show: neighbor, explanation, confidence }) => ({ neighbor, reason: explanation, confidence }))
    : [];

  return { authoredNeighbors, computedNeighbors };
}

export function renderCollectionsSection(show, collections = [], showMap = new Map(), relationshipState = null) {
  const memberships = relationshipState?.memberships || getShowCollectionMemberships(show.id, collections);
  if (memberships.length === 0) {
    return "";
  }
  const visibleMemberships = memberships.slice(0, 3);
  const hiddenMemberships = memberships.slice(3);

  return `
    <section class="detail-section detail-collections-section">
      <div class="detail-section-header">
        <div>
          <h2>Collections</h2>
          <p>Collections that include this show.</p>
        </div>
      </div>
      <div class="detail-collection-route-list">${visibleMemberships.map((collection) => renderCollectionRoute(collection, showMap)).join("")}</div>
      ${hiddenMemberships.length ? `<details class="detail-route-overflow"><summary>${formatRouteExpansion(hiddenMemberships.length)}</summary><div class="detail-route-overflow-grid">${hiddenMemberships.map((collection) => renderCollectionRoute(collection, showMap)).join("")}</div></details>` : ""}
    </section>
  `;
}

export function renderSimilarSection(show, showMap, collections = [], providedSimilarityIndex = null, relationshipState = null) {
  const { authoredNeighbors, computedNeighbors } = relationshipState || getShowRelationshipState(
    show,
    showMap,
    collections,
    providedSimilarityIndex,
  );

  if (authoredNeighbors.length === 0 && computedNeighbors.length === 0) {
    return "";
  }

  return `
    <section class="detail-section detail-similar-section" aria-labelledby="detail-similar-title">
      <div class="detail-section-header">
        <div>
          <h2 id="detail-similar-title">Try next</h2>
          <p>Written routes lead; deterministic archive matches add a varied second path when the catalogue evidence is strong enough.</p>
        </div>
      </div>

      <div class="detail-similar-groups">
        ${authoredNeighbors.length ? renderSimilarGroup("curated", "Curated by the archive", "Editorial picks", "Written relationship notes and curated similarity routes from the archive.", authoredNeighbors) : ""}
        ${computedNeighbors.length ? renderSimilarGroup("computed", "Computed archive matches", "A second signal", "Matches across multiple archive dimensions. These are not authored links.", computedNeighbors) : ""}
      </div>
    </section>
  `;
}

export function renderShowContinuationSection(show, relationshipState = null) {
  if (!relationshipState) return "";
  if (
    relationshipState.authoredNeighbors.length > 0 ||
    relationshipState.computedNeighbors.length > 0 ||
    relationshipState.memberships.length > 0 ||
    relationshipState.hasMoreFrom ||
    relationshipState.hasEntityRoute
  ) {
    return "";
  }

  const routes = archiveRecord.getShowContinuationRoutes(show);
  return `
    <section class="detail-section detail-continuation-section" aria-labelledby="detail-continuation-title">
      <div class="detail-section-header">
        <div>
          <p class="detail-continuation-kicker">Archive navigation</p>
          <h2 id="detail-continuation-title">Continue exploring</h2>
          <p>The archive does not have enough relationship data to make a “Try next” recommendation for this show yet. These links browse verified catalogue routes; they are not recommendations.</p>
        </div>
      </div>
      <nav class="detail-continuation-links" aria-label="Continue exploring the archive">
        ${routes.map((route) => `<a class="detail-archive-link detail-continuation-link" href="${escapeHtml(route.href)}">${escapeHtml(route.label)}</a>`).join("")}
      </nav>
    </section>
  `;
}

function getEditorialNeighbors(show, showMap, similarityIndex) {
  if (similarityIndex?.getEditorialSimilarityMatches) {
    return similarityIndex
      .getEditorialSimilarityMatches(show.id, { limit: 24 })
      .map(({ show: neighbor, reason }) => ({ neighbor, reason }))
      .filter(({ neighbor, reason }) => neighbor && reason);
  }

  const matches = [];
  const seen = new Set();
  const addMatch = (neighbor, reason) => {
    if (!neighbor || seen.has(neighbor.id) || !String(reason || "").trim()) return;
    seen.add(neighbor.id);
    matches.push({ neighbor, reason: String(reason).trim() });
  };

  (Array.isArray(show.similarTo) ? show.similarTo : []).forEach((id) => {
    const neighbor = showMap.get(id);
    addMatch(neighbor, getSimilarReason(show, id));
  });
  [...showMap.values()]
    .filter((candidate) => candidate.id !== show.id && Array.isArray(candidate.similarTo) && candidate.similarTo.includes(show.id))
    .sort((left, right) => String(left.title || left.id).localeCompare(String(right.title || right.id), "en") || left.id.localeCompare(right.id, "en"))
    .forEach((neighbor) => addMatch(neighbor, getSimilarReason(neighbor, show.id)));

  return matches;
}

function resolveSimilarityIndex(showMap, collections, providedIndex = null) {
  if (providedIndex) return providedIndex;
  if (!showMap || typeof showMap !== "object" || typeof globalThis.EchoArchiveSimilarity?.createSimilarityIndex !== "function") {
    return null;
  }

  const cached = similarityIndexCache.get(showMap);
  if (cached?.collections === collections) return cached.index;

  const index = globalThis.EchoArchiveSimilarity.createSimilarityIndex({ shows: [...showMap.values()], collections });
  similarityIndexCache.set(showMap, { collections, index });
  return index;
}

function renderSimilarGroup(source, kicker, title, description, neighbors) {
  const recommendationSource = source === "curated" ? "authored_similarity" : "computed_similarity";
  const visibleLimit = source === "curated" ? 3 : 2;
  const visibleNeighbors = neighbors.slice(0, visibleLimit);
  const hiddenNeighbors = neighbors.slice(visibleLimit);
  return `
    <section class="detail-similar-group detail-similar-group--${source}" data-recommendation-source="${source}" aria-labelledby="detail-similar-${source}-title">
      <div class="detail-similar-group-heading">
        <p class="detail-similar-kicker">${escapeHtml(kicker)}</p>
        <h3 id="detail-similar-${source}-title">${escapeHtml(title)}</h3>
        <p>${escapeHtml(description)}</p>
      </div>
      <div class="detail-similar-grid">
        ${renderSimilarCards(source, recommendationSource, visibleNeighbors, 0)}
      </div>
      ${hiddenNeighbors.length ? `<details class="detail-route-overflow detail-similar-overflow"><summary>${formatRouteExpansion(hiddenNeighbors.length)}</summary><div class="detail-route-overflow-grid detail-similar-overflow-grid">${renderSimilarCards(source, recommendationSource, hiddenNeighbors, visibleNeighbors.length)}</div></details>` : ""}
    </section>
  `;
}

function renderSimilarCards(source, recommendationSource, neighbors, offset = 0) {
  return neighbors.map(({ neighbor, reason, confidence }, index) => {
    const coverSource = getResponsiveImageSource(neighbor, "(max-width: 959px) 84vw, (max-width: 1120px) 42vw, 320px");
    const confidenceLabel = confidence === "limited-metadata"
      ? '<span class="detail-similar-confidence">Limited metadata</span>'
      : "";
    return `
      <article class="detail-similar-card" data-recommendation-source="${source}"${confidence ? ` data-recommendation-confidence="${confidence}"` : ""}>
        <img src="${escapeHtml(coverSource.src)}"${coverSource.srcset ? ` srcset="${escapeHtml(coverSource.srcset)}" sizes="${escapeHtml(coverSource.sizes)}"` : ""} alt="${escapeHtml(neighbor.imageAlt || neighbor.coverAlt || `${neighbor.title || "Untitled show"} cover art`)}" width="320" height="320" loading="lazy" decoding="async" />
        <div class="detail-card-copy">
          <h4>${escapeHtml(neighbor.title || "Untitled show")}</h4>
          ${confidenceLabel}
          <p class="detail-similar-reason">${escapeHtml(reason)}</p>
          <a class="detail-archive-link" href="${escapeHtml(neighbor.href || "/")}" data-discovery-show-id="${escapeHtml(neighbor.id || "")}" data-discovery-surface="show_similar" data-discovery-browse-state="default" data-discovery-result-type="similar_show" data-discovery-recommendation-source="${recommendationSource}" data-discovery-result-position-bucket="${bucketDiscoveryPosition(offset + index + 1)}" data-discovery-content-profile="${getDiscoveryContentProfile(neighbor.reviewStatus)}">Open show</a>
        </div>
      </article>
    `;
  }).join("");
}

function renderCollectionRoute(collection, showMap) {
  return `
    <a class="detail-collection-route" href="${escapeHtml(createCollectionHref(collection.id))}" data-discovery-collection-id="${escapeHtml(collection.id || "")}" data-discovery-collection-kind="${escapeHtml(collection.kind || "curated")}" data-discovery-surface="show_page_membership">
      ${renderCollectionRouteArt(collection, showMap)}
      <span class="detail-collection-route-copy">
        <span class="detail-collection-route-title">${escapeHtml(collection.title)}</span>
        <span class="detail-collection-route-reason">${escapeHtml(collection.reason || "Collection in the archive.")}</span>
      </span>
    </a>
  `;
}

function renderCollectionRouteArt(collection, showMap) {
  const coverShows = getCollectionCoverShows(collection, showMap);
  if (coverShows.length === 0) {
    return '<span class="detail-collection-route-art is-empty" aria-hidden="true"></span>';
  }

  const accent = getCollectionAccent(coverShows);
  const accentStyle = accent ? ` style="--collection-accent: ${escapeHtml(accent)}"` : "";

  return `
    <span class="detail-collection-route-art collection-cover-collage" aria-hidden="true"${accentStyle}>
      ${coverShows
        .map((coverShow, index) => {
          const source = getResponsiveImageSource(coverShow, "(max-width: 640px) 116px, 168px");
          return `<span class="collection-cover-frame" data-cover-index="${index + 1}"><img src="${escapeHtml(source.src)}"${source.srcset ? ` srcset="${escapeHtml(source.srcset)}" sizes="(max-width: 640px) 116px, 168px"` : ""} alt="" width="168" height="168" loading="lazy" decoding="async" /></span>`;
        })
        .join("")}
    </span>
  `;
}

function getCollectionCoverShows(collection, showMap) {
  const showIds = [...(collection.coverShowIds || []), ...(collection.showIds || [])];
  const seen = new Set();

  return showIds
    .filter((showId) => {
      if (!showId || seen.has(showId)) {
        return false;
      }
      seen.add(showId);
      return true;
    })
    .map((showId) => showMap.get(showId))
    .filter(Boolean)
    .slice(0, 4);
}

function getCollectionAccent(coverShows) {
  const accent = coverShows.find((show) => /^#[0-9a-f]{3,8}$/i.test(String(show?.accent?.hex || "")))?.accent?.hex;
  return String(accent || "");
}
