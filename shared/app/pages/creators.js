import { DEFAULT_SOCIAL_IMAGE } from "../constants.js";
import { loadCollections, loadShows } from "../data.js";
import { setChatOpen } from "../chat.js";
import { formatDate, formatRating, toDisplayTag, updateDocumentMetadata } from "../utils.js";

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
  applyCreatorSpotlight(selectFeaturedShow(shows));
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
  setText("creatorsCreatorCount", String(stats.creatorCount));
  setText("creatorsShowCount", String(stats.showCount));
  setText("creatorsMetadataCount", String(stats.metadataCheckedCount));
  setText("creatorsReviewCount", String(stats.fullReviewCount));
  setText("creatorsLastUpdated", stats.lastUpdatedLabel);
}

function hasMetadataVerification(show) {
  return Boolean(show.verification?.status || show.verification?.verifiedAt || show.metadata?.objectiveVerifiedAt);
}

function selectFeaturedShow(shows) {
  const publishedShows = getPublishedShows(shows);
  const candidates = publishedShows
    .filter((show) => show.image && show.creators.length > 0)
    .sort((left, right) => {
      const leftScore = getFeaturedScore(left);
      const rightScore = getFeaturedScore(right);
      return rightScore - leftScore;
    });

  return candidates[0] || null;
}

function getFeaturedScore(show) {
  let score = 0;

  if (show.reviewStatus === "full-review") {
    score += 40;
  }

  if (show.featured) {
    score += 20;
  }

  if (hasMetadataVerification(show)) {
    score += 12;
  }

  if (Number.isFinite(show.finalRating)) {
    score += show.finalRating;
  }

  return score;
}

function applyCreatorSpotlight(show) {
  if (!show) {
    return;
  }

  const firstReleaseYear = getReleaseYear(show);
  const tags = show.tags.slice(0, 3).map((tag) => toDisplayTag(tag));
  const verificationDate = show.verification?.verifiedAt || show.metadata?.objectiveVerifiedAt || "";

  const cover = document.getElementById("creatorSpotlightCover");
  if (cover instanceof HTMLImageElement) {
    cover.src = `/${String(show.image).replace(/^\/+/, "")}`;
    cover.alt = show.imageAlt || `${show.title} cover art`;
  }

  setText("creatorSpotlightTitle", show.title);
  setText("creatorSpotlightCreator", show.creators.join(", "));
  setText(
    "creatorSpotlightDescription",
    show.summary || show.subtitle || "Archive spotlight uses sourced metadata first and adds creator context only when it can be verified.",
  );
  setText("creatorSpotlightRating", Number.isFinite(show.finalRating) ? `${formatRating(show.finalRating)}/10` : "Unrated");
  setText("creatorSpotlightCompletion", toDisplayTag(show.completionStatus || "unknown"));
  setText("creatorSpotlightYear", firstReleaseYear || "Unknown");
  setText(
    "creatorSpotlightVerification",
    verificationDate ? `Metadata checked ${formatDate(verificationDate)}` : "Metadata status still being verified",
  );
  setText(
    "creatorSpotlightPlaceholderName",
    `${show.creators[0]} profile space`,
  );
  setText(
    "creatorSpotlightPlaceholderCopy",
    "Echo Archives only adds creator portraits, direct quotes, or interview excerpts when they come from an official or verified source.",
  );

  const openLink = document.getElementById("creatorSpotlightOpenLink");
  if (openLink instanceof HTMLAnchorElement) {
    openLink.href = show.href;
  }

  const correctionLink = document.getElementById("creatorSpotlightCorrectionLink");
  if (correctionLink instanceof HTMLAnchorElement) {
    correctionLink.href = `/submit.html?submissionType=correction&showId=${encodeURIComponent(show.id)}`;
  }

  const tagRow = document.getElementById("creatorSpotlightTags");
  if (tagRow) {
    tagRow.textContent = "";

    tags.forEach((tag) => {
      const chip = document.createElement("span");
      chip.textContent = tag;
      tagRow.appendChild(chip);
    });
  }
}

function getReleaseYear(show) {
  const candidate = show.releaseDates?.first || show.firstReleasedAt || "";

  if (!candidate) {
    return "";
  }

  const date = new Date(candidate);
  return Number.isNaN(date.getTime()) ? "" : String(date.getFullYear());
}

function initializeCreatorFaq() {
  document.querySelectorAll(".creator-faq-toggle").forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    button.addEventListener("click", () => {
      const panelId = button.getAttribute("aria-controls");
      if (!panelId) {
        return;
      }

      const panel = document.getElementById(panelId);
      if (!panel) {
        return;
      }

      const isExpanded = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", String(!isExpanded));
      panel.hidden = isExpanded;
    });
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
