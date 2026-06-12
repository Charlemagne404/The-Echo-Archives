import { DEFAULT_SOCIAL_IMAGE } from "../constants.js";
import { applyArchiveStats, getArchiveStats, loadCollections, loadShows } from "../data.js";
import { updateDocumentMetadata } from "../utils.js";

export async function initializeAboutPage() {
  const shows = await loadShows();
  const collections = await loadCollections();
  updateDocumentMetadata({
    title: "About - The Echo Archives",
    description: "How The Echo Archives curates fiction podcasts, handles ratings, and keeps the catalog trustworthy.",
    path: "/about.html",
    image: DEFAULT_SOCIAL_IMAGE,
  });
  applyArchiveStats("about", getArchiveStats(shows, collections));
}
