import { DEFAULT_SOCIAL_IMAGE } from "../constants.js";
import { buildShowMap, loadCollections, loadShows } from "../data.js";
import { initializeDetailRatingPage } from "../community.js";
import { initializeManagedImages } from "../images.js";
import { createShowPageMarkup } from "../render-show.js";
import { bindShareButton } from "../share.js";
import { updateDocumentMetadata } from "../utils.js";

export async function initializeShowPage() {
  const showRoot = document.getElementById("showRoot");

  if (!showRoot) {
    return;
  }

  showRoot.innerHTML = createShowLoadingMarkup();

  const [shows, collections] = await Promise.all([loadShows(), loadCollections()]);
  const showMap = buildShowMap(shows);

  const params = new URLSearchParams(window.location.search);
  const showId = params.get("id") || "";
  const show = showMap.get(showId);

  if (!show) {
    renderMissingShowPage(showRoot);
    return;
  }

  document.body.style.setProperty("--detail-accent", show.accent?.hex || "#e54838");
  document.body.style.setProperty("--detail-accent-rgb", show.accent?.rgb || "229, 72, 56");
  updateDocumentMetadata({
    title: `${show.title} - The Echo Archives`,
    description: show.description,
    path: `/show?id=${encodeURIComponent(show.id)}`,
    image: `/${show.cover}`,
  });

  showRoot.innerHTML = createShowPageMarkup(show, showMap, collections);
  initializeManagedImages(showRoot);
  const shareButton = showRoot.querySelector("[data-share-action]");
  if (shareButton instanceof HTMLButtonElement) {
    bindShareButton(shareButton, {
      title: `${show.title} - The Echo Archives`,
      text: show.description,
      url: window.location.href,
    });
  }
  const detailRoot = showRoot.querySelector(".podcast-detail");
  if (detailRoot) {
    detailRoot.dataset.podcastId = show.id;
    detailRoot.dataset.podcastTitle = show.title;
    await initializeDetailRatingPage(show);
  }
}

function renderMissingShowPage(showRoot) {
  updateDocumentMetadata({
    title: "Show not found - The Echo Archives",
    description: "The requested Echo Archives show page could not be found.",
    path: "/show",
    image: DEFAULT_SOCIAL_IMAGE,
  });
  showRoot.innerHTML = `
    <section class="detail-main podcast-detail">
      <section class="detail-section detail-empty-state">
        <div class="detail-section-header">
          <div>
            <h1>Show not found</h1>
            <p>The requested archive entry is missing or has not been published yet.</p>
          </div>
        </div>
        <a class="detail-primary-action" href="/#browse">Back to the archive</a>
      </section>
    </section>
  `;
}

function createShowLoadingMarkup() {
  return `
    <section class="detail-main podcast-detail detail-loading-shell" aria-hidden="true">
      <section class="detail-hero-shell">
        <div class="detail-hero-panel">
          <div class="detail-hero-grid">
            <div class="detail-hero-copy">
              <span class="archive-skeleton-block archive-skeleton-chip"></span>
              <span class="archive-skeleton-block archive-skeleton-heading"></span>
              <span class="archive-skeleton-block archive-skeleton-line"></span>
              <span class="archive-skeleton-block archive-skeleton-line archive-skeleton-line-short"></span>
            </div>
            <div class="detail-cover-column">
              <div class="archive-skeleton-block detail-skeleton-cover"></div>
            </div>
          </div>
        </div>
      </section>
      <div class="detail-content-layout">
        <div class="detail-main-stack">
          <section class="detail-section detail-loading-card">
            <span class="archive-skeleton-block archive-skeleton-title"></span>
            <span class="archive-skeleton-block archive-skeleton-line"></span>
            <span class="archive-skeleton-block archive-skeleton-line"></span>
            <span class="archive-skeleton-block archive-skeleton-line archive-skeleton-line-short"></span>
          </section>
        </div>
        <aside class="detail-side-rail">
          <section class="detail-side-card detail-loading-card">
            <span class="archive-skeleton-block archive-skeleton-title"></span>
            <span class="archive-skeleton-block archive-skeleton-line"></span>
            <span class="archive-skeleton-block archive-skeleton-line archive-skeleton-line-short"></span>
          </section>
        </aside>
      </div>
    </section>
  `;
}
