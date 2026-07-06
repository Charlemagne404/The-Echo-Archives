import { DEFAULT_SOCIAL_IMAGE } from "../constants.js";
import { applyArchiveStats, loadArchiveStats } from "../data.js";
import { updateDocumentMetadata } from "../utils.js";

export async function initializeAboutPage() {
  const stats = await loadArchiveStats();
  updateDocumentMetadata({
    title: "About - The Echo Archives",
    description: "Why The Echo Archives exists, how it stays listener-first, and how the archive handles trust, ratings, and support.",
    path: "/about",
    image: DEFAULT_SOCIAL_IMAGE,
  });
  applyArchiveStats("about", stats);
}
