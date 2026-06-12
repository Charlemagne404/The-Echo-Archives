import { DEFAULT_SOCIAL_IMAGE } from "../constants.js";
import { buildShowMap, loadCollections, loadShows } from "../data.js";
import { initializeDetailRatingPage } from "../community.js";
import { createShowPageMarkup } from "../render-show.js";
import { updateDocumentMetadata } from "../utils.js";

export async function initializeShowPage() {
  const shows = await loadShows();
  const collections = await loadCollections();
  const showMap = buildShowMap(shows);
  const showRoot = document.getElementById("showRoot");

  if (!showRoot) {
    return;
  }

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
    path: `/show.html?id=${encodeURIComponent(show.id)}`,
    image: `/${show.cover}`,
  });

  showRoot.innerHTML = createShowPageMarkup(show, showMap, collections);
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
    path: "/show.html",
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
        <a class="detail-primary-action" href="/index.html#browse">Back to the archive</a>
      </section>
    </section>
  `;
}
