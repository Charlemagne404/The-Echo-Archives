import { getShowCollectionMemberships } from "../render-collections.js";
import { getResponsiveImageSource } from "../images.js";
import { createCollectionHref } from "../urls.js";
import { escapeHtml, formatRouteExpansion, getSimilarReason } from "./utils.js";
import { bucketDiscoveryPosition, getDiscoveryContentProfile } from "../discovery-analytics.js";

const similarityIndexCache = new WeakMap();

export function renderCollectionsSection(show, collections = [], showMap = new Map()) {
  const memberships = getShowCollectionMemberships(show.id, collections);
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

export function renderSimilarSection(show, showMap, collections = [], providedSimilarityIndex = null) {
  const authoredNeighbors = (show.similarTo || [])
    .map((id) => {
      const neighbor = showMap.get(id);
      const reason = getSimilarReason(show, id);
      if (!neighbor || !reason) {
        return null;
      }

      return {
        neighbor,
        reason,
      };
    })
    .filter(Boolean)
    .slice(0, 3);

  const authoredIds = new Set((Array.isArray(show.similarTo) ? show.similarTo : []).map((id) => String(id || "").trim()).filter(Boolean));
  const similarityIndex = resolveSimilarityIndex(showMap, collections, providedSimilarityIndex);
  const computedNeighbors = similarityIndex
    ? similarityIndex.getPublicSimilarityMatches(show.id)
      .filter(({ show: neighbor }) => neighbor && !authoredIds.has(neighbor.id))
      .map(({ show: neighbor, explanation }) => ({ neighbor, reason: explanation }))
    : [];

  if (authoredNeighbors.length === 0 && computedNeighbors.length === 0) {
    return "";
  }

  return `
    <section class="detail-section detail-similar-section" aria-labelledby="detail-similar-title">
      <div class="detail-section-header">
        <div>
          <h2 id="detail-similar-title">Try next</h2>
          <p>Curated picks lead; high-confidence archive matches appear separately when the metadata supports them.</p>
        </div>
      </div>

      <div class="detail-similar-groups">
        ${authoredNeighbors.length ? renderSimilarGroup("curated", "Curated by the archive", "Editorial picks", "Written relationship notes from the archive.", authoredNeighbors) : ""}
        ${computedNeighbors.length ? renderSimilarGroup("computed", "Computed archive matches", "A second signal", "Matches across multiple archive dimensions. These are not authored links.", computedNeighbors) : ""}
      </div>
    </section>
  `;
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
  return `
    <section class="detail-similar-group detail-similar-group--${source}" data-recommendation-source="${source}" aria-labelledby="detail-similar-${source}-title">
      <div class="detail-similar-group-heading">
        <p class="detail-similar-kicker">${escapeHtml(kicker)}</p>
        <h3 id="detail-similar-${source}-title">${escapeHtml(title)}</h3>
        <p>${escapeHtml(description)}</p>
      </div>
      <div class="detail-similar-grid">
        ${neighbors.map(({ neighbor, reason }, index) => {
          const coverSource = getResponsiveImageSource(neighbor, "(max-width: 959px) 84vw, (max-width: 1120px) 42vw, 320px");
          return `
          <article class="detail-similar-card" data-recommendation-source="${source}">
            <img src="${escapeHtml(coverSource.src)}"${coverSource.srcset ? ` srcset="${escapeHtml(coverSource.srcset)}" sizes="${escapeHtml(coverSource.sizes)}"` : ""} alt="${escapeHtml(neighbor.imageAlt || neighbor.coverAlt || `${neighbor.title || "Untitled show"} cover art`)}" width="320" height="320" loading="lazy" decoding="async" />
            <div class="detail-card-copy">
              <h4>${escapeHtml(neighbor.title || "Untitled show")}</h4>
              <p class="detail-similar-reason">${escapeHtml(reason)}</p>
              <a class="detail-archive-link" href="${escapeHtml(neighbor.href || "/")}" data-discovery-show-id="${escapeHtml(neighbor.id || "")}" data-discovery-surface="show_similar" data-discovery-browse-state="default" data-discovery-result-type="similar_show" data-discovery-recommendation-source="${recommendationSource}" data-discovery-result-position-bucket="${bucketDiscoveryPosition(index + 1)}" data-discovery-content-profile="${getDiscoveryContentProfile(neighbor.reviewStatus)}">Open show</a>
            </div>
          </article>
        `;
        }).join("")}
      </div>
    </section>
  `;
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
