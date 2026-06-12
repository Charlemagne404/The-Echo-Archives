import { DEFAULT_SOCIAL_IMAGE } from "../constants.js";
import {
  buildCollectionMap,
  buildShowMap,
  getCollectionShows,
  getPublishedShows,
  loadCollections,
  loadShows,
} from "../data.js";
import { syncCommunityCardBadges } from "../community.js";
import { createCollectionShowCard } from "../render-cards.js";
import { getCollectionShowReason } from "../render-collections.js";
import { createArchiveCollectionHref } from "../urls.js";
import { formatDate, setTextContent, toDisplayTag, updateDocumentMetadata } from "../utils.js";

export async function initializeCollectionPage() {
  const shows = await loadShows();
  const collections = await loadCollections();
  const publishedShows = getPublishedShows(shows);
  const showMap = buildShowMap(publishedShows);
  const collectionMap = buildCollectionMap(collections);

  const collectionId = new URLSearchParams(window.location.search).get("id") || "";
  const collection = collectionMap.get(collectionId);
  const root = document.getElementById("collectionRoot");
  const grid = document.getElementById("collectionShowGrid");
  const archiveSection = document.getElementById("collectionArchiveSection");

  if (!root || !grid || !archiveSection) {
    return;
  }

  if (!collection) {
    updateDocumentMetadata({
      title: "Collection not found - The Echo Archives",
      description: "The requested Echo Archives collection could not be found.",
      path: "/collection.html",
      image: DEFAULT_SOCIAL_IMAGE,
    });
    root.innerHTML = `
      <article class="page-card">
        <h2>Collection not found</h2>
        <p>The requested collection is missing or has not been published yet.</p>
        <div class="collection-directory-actions">
          <a class="collection-action" href="/collections.html">Browse collections</a>
          <a class="collection-secondary-link" href="/index.html#archive">Back to archive</a>
        </div>
      </article>
    `;
    archiveSection.remove();
    return;
  }

  const collectionShows = getCollectionShows(collection, showMap);
  const firstCover = collectionShows[0]?.cover ? `/${collectionShows[0].cover}` : DEFAULT_SOCIAL_IMAGE;
  updateDocumentMetadata({
    title: `${collection.title} - The Echo Archives`,
    description: collection.description,
    path: `/collection.html?id=${encodeURIComponent(collection.id)}`,
    image: firstCover,
  });

  setTextContent("collectionTitle", collection.title);
  setTextContent("collectionDescription", collection.description);
  setTextContent("collectionShowCount", String(collectionShows.length));
  setTextContent("collectionKind", toDisplayTag(collection.kind || "curated"));
  setTextContent("collectionFeatured", collection.featured ? "Yes" : "No");
  setTextContent("collectionLastUpdated", collection.updatedAt ? formatDate(collection.updatedAt) : "Unknown");

  const archiveLink = document.getElementById("collectionArchiveLink");
  if (archiveLink) {
    archiveLink.href = createArchiveCollectionHref(collection.id);
  }

  grid.textContent = "";
  collectionShows.forEach((show) => {
    grid.appendChild(createCollectionShowCard(show, getCollectionShowReason(collection, show.id)));
  });
  void syncCommunityCardBadges(grid, collectionShows);
}
