import { DEFAULT_SOCIAL_IMAGE } from "../constants.js";
import { applyArchiveStats, loadArchiveStats } from "../data.js";
import { updateDocumentMetadata } from "../utils.js";

export async function initializeAboutPage() {
  updateDocumentMetadata({
    title: "About Our Audio Drama Archive | The Echo Archives",
    description: "How The Echo Archives reviews shows and keeps editorial ratings, listener ratings, and factual checks separate.",
    path: "/about",
    image: DEFAULT_SOCIAL_IMAGE,
  });
  void loadArchiveStats()
    .then((stats) => applyArchiveStats("about", stats))
    .catch(() => {});
}
