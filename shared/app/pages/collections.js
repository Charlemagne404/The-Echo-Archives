import { DEFAULT_SOCIAL_IMAGE } from "../constants.js";
import {
  buildShowMap,
  getCollectionShows,
  getPublishedShows,
  loadCollections,
  loadShows,
} from "../data.js";
import {
  createCollectionDirectoryCard,
  createCollectionDirectoryDivider,
} from "../render-collections.js";
import { formatDate, setTextContent, updateDocumentMetadata } from "../utils.js";

export async function initializeCollectionsPage() {
  const shows = await loadShows();
  const collections = await loadCollections();
  updateDocumentMetadata({
    title: "Collections - The Echo Archives",
    description: "Browse every curated discovery collection in The Echo Archives.",
    path: "/collections.html",
    image: DEFAULT_SOCIAL_IMAGE,
  });
  const publishedShows = getPublishedShows(shows);
  const showMap = buildShowMap(publishedShows);
  const directoryRoot = document.getElementById("collectionsDirectory");

  if (!directoryRoot) {
    return;
  }

  const featuredCount = collections.filter((collection) => collection.featured).length;
  const coveredShowIds = new Set(collections.flatMap((collection) => collection.showIds));
  const latestUpdatedAt = collections
    .map((collection) => collection.updatedAt)
    .filter(Boolean)
    .sort()
    .at(-1);

  setTextContent("collectionsCount", String(collections.length));
  setTextContent("collectionsFeaturedCount", String(featuredCount));
  setTextContent("collectionsShowReach", String(coveredShowIds.size));
  setTextContent("collectionsLastUpdated", latestUpdatedAt ? formatDate(latestUpdatedAt) : "Unknown");

  const featuredCollections = collections.filter((collection) => collection.featured);
  const standardCollections = collections.filter((collection) => !collection.featured);

  directoryRoot.textContent = "";

  featuredCollections.forEach((collection) => {
    directoryRoot.appendChild(createCollectionDirectoryCard(collection, getCollectionShows(collection, showMap)));
  });

  if (featuredCollections.length > 0 && standardCollections.length > 0) {
    directoryRoot.appendChild(createCollectionDirectoryDivider());
  }

  standardCollections.forEach((collection) => {
    directoryRoot.appendChild(createCollectionDirectoryCard(collection, getCollectionShows(collection, showMap)));
  });
}
