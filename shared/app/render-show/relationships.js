import { getShowCollectionMemberships } from "../render-collections.js";
import { getResponsiveImageSource } from "../images.js";
import { createCollectionHref } from "../urls.js";
import { escapeHtml, getSimilarReason } from "./utils.js";

export function renderCollectionsSection(show, collections = []) {
  const memberships = getShowCollectionMemberships(show.id, collections);

  return `
    <section class="detail-section detail-collections-section">
      <div class="detail-section-header">
        <div>
          <h2>Discovery routes</h2>
          <p>Curated listening paths already connected to this show in the archive.</p>
        </div>
      </div>
      ${
        memberships.length > 0
          ? `<div class="detail-collection-route-list">${memberships
              .map(
                (collection) => `
                  <a class="detail-collection-route" href="${escapeHtml(createCollectionHref(collection.id))}">
                    <span class="detail-collection-route-title">${escapeHtml(collection.title)}</span>
                    ${
                      collection.reason
                        ? `<span class="detail-collection-route-reason">${escapeHtml(collection.reason)}</span>`
                        : `<span class="detail-collection-route-reason">Curated route in the archive.</span>`
                    }
                  </a>
                `,
              )
              .join("")}</div>`
          : '<p class="detail-side-note">No collection routes have been published for this show yet.</p>'
      }
    </section>
  `;
}

export function renderSimilarSection(show, showMap) {
  const neighbors = show.similarTo
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
    .filter(Boolean);
  if (neighbors.length === 0) {
    return "";
  }

  return `
    <section class="detail-section detail-similar-section">
      <div class="detail-section-header">
        <div>
          <h2>Start next</h2>
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
                  <p>${escapeHtml(neighbor.archiveTake || neighbor.description || "Description not cataloged yet.")}</p>
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
