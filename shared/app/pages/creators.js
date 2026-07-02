import { DEFAULT_SOCIAL_IMAGE } from "../constants.js";
import { loadCollections, loadShows } from "../data.js";
import { setChatOpen } from "../chat.js";
import { formatDate, updateDocumentMetadata } from "../utils.js";
import { initializeAccordionList } from "./accordion.js";

export async function initializeForCreatorsPage() {
  const [shows, collections] = await Promise.all([loadShows(), loadCollections()]);

  updateDocumentMetadata({
    title: "For Creators - The Echo Archives",
    description:
      "How creators can submit shows, correct metadata, request verification, and understand the standards behind The Echo Archives.",
    path: "/for-creators.html",
    image: DEFAULT_SOCIAL_IMAGE,
  });

  applyCreatorStats(buildCreatorStats(shows, collections));
  initializeCreatorFaq();
  initializeCreatorChatLaunchers();
}

export function initializeCreatorStandardsPage() {
  updateDocumentMetadata({
    title: "Creator Standards - The Echo Archives",
    description:
      "The standards and trust rules The Echo Archives uses when handling creator submissions, verification, and metadata updates.",
    path: "/creator-standards.html",
    image: DEFAULT_SOCIAL_IMAGE,
  });

  initializeCreatorChatLaunchers();
}

function getPublishedShows(shows) {
  return shows.filter((show) => show.status === "published");
}

function buildCreatorStats(shows, collections) {
  const publishedShows = getPublishedShows(shows);
  const creatorNames = new Set();
  const metadataCheckedCount = publishedShows.filter((show) => hasMetadataVerification(show)).length;
  const fullReviewCount = publishedShows.filter((show) => show.reviewStatus === "full-review").length;
  const latestUpdatedAt = [
    ...publishedShows.map((show) => show.updatedAt),
    ...collections.map((collection) => collection.updatedAt),
  ]
    .filter(Boolean)
    .sort()
    .at(-1);

  publishedShows.forEach((show) => {
    show.creators.forEach((creator) => {
      if (creator) {
        creatorNames.add(creator);
      }
    });
  });

  return {
    creatorCount: creatorNames.size,
    showCount: publishedShows.length,
    metadataCheckedCount,
    fullReviewCount,
    lastUpdatedLabel: latestUpdatedAt ? formatDate(latestUpdatedAt) : "Unknown",
  };
}

function applyCreatorStats(stats) {
  setText("creatorsCreatorCount", formatInteger(stats.creatorCount));
  setText("creatorsShowCount", formatInteger(stats.showCount));
  setText("creatorsMetadataCount", formatInteger(stats.metadataCheckedCount));
  setText("creatorsMetadataContext", buildMetadataContext(stats));
  setText("creatorsReviewCount", formatInteger(stats.fullReviewCount));
  setText("creatorsLastUpdated", stats.lastUpdatedLabel);
}

function formatInteger(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function hasMetadataVerification(show) {
  return Boolean(show.verification?.status || show.verification?.verifiedAt || show.metadata?.objectiveVerifiedAt);
}

function buildMetadataContext(stats) {
  if (stats.showCount === 0) {
    return "No published records yet.";
  }

  if (stats.metadataCheckedCount === stats.showCount) {
    return "All published records currently have sourced metadata.";
  }

  return `${formatInteger(stats.metadataCheckedCount)} of ${formatInteger(stats.showCount)} published records currently have sourced metadata.`;
}

function initializeCreatorFaq() {
  initializeAccordionList({
    itemSelector: ".creator-faq-item",
    buttonSelector: ".creator-faq-toggle",
  });
}

function initializeCreatorChatLaunchers() {
  document.querySelectorAll("[data-open-chat]").forEach((button) => {
    if (!(button instanceof HTMLButtonElement || button instanceof HTMLAnchorElement)) {
      return;
    }

    button.addEventListener("click", (event) => {
      event.preventDefault();
      setChatOpen(true);
    });
  });
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) {
    node.textContent = value;
  }
}
