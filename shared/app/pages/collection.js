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
import {
  createCollectionCoverCollage,
  createCollectionIntentTagList,
  getCollectionShowReason,
} from "../render-collections.js";
import { bindShareButton } from "../share.js";
import { createArchiveCollectionHref } from "../urls.js";
import { formatDate, setTextContent, toDisplayTag, updateDocumentMetadata } from "../utils.js";

function createCollectionLoadingCard() {
  const shell = document.createElement("article");
  shell.className = "archive-skeleton-card";
  shell.setAttribute("aria-hidden", "true");
  shell.innerHTML = `
    <div class="archive-skeleton-block archive-skeleton-cover"></div>
    <div class="archive-skeleton-copy">
      <span class="archive-skeleton-block archive-skeleton-title"></span>
      <span class="archive-skeleton-block archive-skeleton-line"></span>
      <span class="archive-skeleton-block archive-skeleton-rating"></span>
    </div>
  `;
  return shell;
}

export async function initializeCollectionPage() {
  const collectionId = new URLSearchParams(window.location.search).get("id") || "";
  const root = document.getElementById("collectionRoot");
  const grid = document.getElementById("collectionShowGrid");
  const archiveSection = document.getElementById("collectionArchiveSection");
  const heroArt = document.getElementById("collectionHeroArt");
  const shareButton = document.getElementById("collectionCopyLink");

  if (!root || !grid || !archiveSection) {
    return;
  }

  grid.textContent = "";
  for (let index = 0; index < 6; index += 1) {
    grid.appendChild(createCollectionLoadingCard());
  }

  const [shows, collections] = await Promise.all([loadShows(), loadCollections()]);
  const publishedShows = getPublishedShows(shows);
  const showMap = buildShowMap(publishedShows);
  const collectionMap = buildCollectionMap(collections);
  const collection = collectionMap.get(collectionId);

  if (!collection) {
    updateDocumentMetadata({
      title: "Collection not found - The Echo Archives",
      description: "The requested Echo Archives collection could not be found.",
      path: "/collection",
      image: DEFAULT_SOCIAL_IMAGE,
    });
    setTextContent("collectionTitle", "Collection not found");
    setTextContent("collectionDescription", "The requested collection is missing or has not been published yet.");
    root.innerHTML = `
      <article class="page-card">
        <h2>Collection not found</h2>
        <p>The requested collection is missing or has not been published yet.</p>
        <div class="collection-directory-actions">
          <a class="collection-action" href="/collections">Browse collections</a>
          <a class="collection-secondary-link" href="/#archive">Back to archive</a>
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
    path: `/collection?id=${encodeURIComponent(collection.id)}`,
    image: firstCover,
  });

  setTextContent("collectionTitle", collection.title);
  setTextContent("collectionDescription", collection.description);
  setTextContent("collectionShowCount", String(collectionShows.length));
  setTextContent("collectionCommitment", collection.commitment || "Curated");
  setTextContent("collectionKind", toDisplayTag(collection.kind || "curated"));
  setTextContent("collectionLastUpdated", collection.updatedAt ? formatDate(collection.updatedAt) : "Unknown");
  setTextContent(
    "collectionShowsSummary",
    `${collectionShows.length} ${collectionShows.length === 1 ? "show" : "shows"} selected for this route.`,
  );

  const heroTags = document.getElementById("collectionHeroTags");
  if (heroTags) {
    heroTags.textContent = "";
    heroTags.appendChild(createCollectionIntentTagList(collection, 5));
  }

  if (heroArt) {
    heroArt.textContent = "";
    heroArt.appendChild(createCollectionCoverCollage(collection, collectionShows, {
      className: "collection-cover-collage collection-detail-collage",
      loading: "eager",
    }));
  }

  const accent = collectionShows.find((show) => show?.accent?.hex)?.accent?.hex;
  const heroPanel = document.getElementById("collectionHeroPanel");
  if (accent && heroPanel) {
    heroPanel.style.setProperty("--collection-accent", accent);
  }

  const archiveLink = document.getElementById("collectionArchiveLink");
  const archiveHeroLink = document.getElementById("collectionArchiveHeroLink");
  if (archiveLink) {
    archiveLink.href = createArchiveCollectionHref(collection.id);
  }
  if (archiveHeroLink) {
    archiveHeroLink.href = createArchiveCollectionHref(collection.id);
  }
  if (shareButton instanceof HTMLButtonElement) {
    bindShareButton(shareButton, {
      title: `${collection.title} - The Echo Archives`,
      text: collection.description,
      url: window.location.href,
    });
  }

  grid.textContent = "";
  collectionShows.forEach((show) => {
    grid.appendChild(createCollectionShowCard(show, getCollectionShowReason(collection, show.id)));
  });
  void syncCommunityCardBadges(grid, collectionShows);
}
