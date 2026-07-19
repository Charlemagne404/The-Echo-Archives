import { getShowCollectionMemberships } from "../render-collections.js";
import { getResponsiveImageSource } from "../images.js";
import { createCollectionHref } from "../urls.js";
import { escapeHtml, getSimilarReason } from "./utils.js";

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
          <h2>Discovery routes</h2>
          <p>Curated listening paths already connected to this show in the archive.</p>
        </div>
      </div>
      <div class="detail-collection-route-list">${visibleMemberships.map((collection) => renderCollectionRoute(collection, showMap)).join("")}</div>
      ${hiddenMemberships.length ? `<details class="detail-route-overflow"><summary>Show all routes <span>${hiddenMemberships.length}</span></summary><div class="detail-route-overflow-grid">${hiddenMemberships.map((collection) => renderCollectionRoute(collection, showMap)).join("")}</div></details>` : ""}
    </section>
  `;
}

export function renderSimilarSection(show, showMap) {
  const neighbors = (show.similarTo || [])
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
  if (neighbors.length === 0) {
    return "";
  }

  return `
    <section class="detail-section detail-similar-section">
      <div class="detail-section-header">
        <div>
          <h2>Try next</h2>
          <p>Closest neighboring picks in the archive once you finish this one.</p>
        </div>
      </div>

      <div class="detail-similar-grid">
        ${neighbors
          .map(
            ({ neighbor, reason }) => {
              const coverSource = getResponsiveImageSource(neighbor, "(max-width: 959px) 84vw, (max-width: 1120px) 42vw, 320px");
              return `
              <article class="detail-similar-card">
                <img src="${escapeHtml(coverSource.src)}"${coverSource.srcset ? ` srcset="${escapeHtml(coverSource.srcset)}" sizes="${escapeHtml(coverSource.sizes)}"` : ""} alt="${escapeHtml(neighbor.imageAlt || neighbor.coverAlt || `${neighbor.title || "Untitled show"} cover art`)}" width="320" height="320" loading="lazy" decoding="async" />
                <div class="detail-card-copy">
                  <h3>${escapeHtml(neighbor.title || "Untitled show")}</h3>
                  <p class="detail-similar-reason">${escapeHtml(reason)}</p>
                  <a class="detail-archive-link" href="${escapeHtml(neighbor.href || "/")}">Open show</a>
                </div>
              </article>
            `;
            },
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderCollectionRoute(collection, showMap) {
  return `
    <a class="detail-collection-route" href="${escapeHtml(createCollectionHref(collection.id))}">
      ${renderCollectionRouteArt(collection, showMap)}
      <span class="detail-collection-route-copy">
        <span class="detail-collection-route-title">${escapeHtml(collection.title)}</span>
        <span class="detail-collection-route-reason">${escapeHtml(collection.reason || "Curated route in the archive.")}</span>
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
