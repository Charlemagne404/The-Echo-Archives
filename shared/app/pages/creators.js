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
  applyCreatorSpotlight(selectCreatorSpotlight(shows));
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
  setText("creatorsReviewCount", formatInteger(stats.fullReviewCount));
  setText("creatorsLastUpdated", stats.lastUpdatedLabel);
}

function formatInteger(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function hasMetadataVerification(show) {
  return Boolean(show.verification?.status || show.verification?.verifiedAt || show.metadata?.objectiveVerifiedAt);
}

function selectCreatorSpotlight(shows) {
  const publishedShows = getPublishedShows(shows);
  const pinnedShow = publishedShows.find((show) => show.id === "impact-winter");
  if (pinnedShow) {
    return pinnedShow;
  }

  const candidates = publishedShows
    .filter((show) => show.cover && show.creators.length > 0)
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
  const tags = show.tags.slice(0, 2).map((tag) => toDisplayTag(tag));
  const verificationDate = show.verification?.verifiedAt || show.metadata?.objectiveVerifiedAt || "";
  const creatorName = show.credits?.creatorName && show.credits.creatorName !== "Not verified"
    ? show.credits.creatorName
    : show.creators[0] || "Creator";
  const spotlightDescription =
    show.description ||
    show.summary ||
    show.subtitle ||
    "Archive spotlight uses sourced metadata first and adds creator context only when it can be verified.";

  const cover = document.getElementById("creatorSpotlightCover");
  if (cover instanceof HTMLImageElement) {
    cover.src = `/${String(show.cover).replace(/^\/+/, "")}`;
    cover.alt = show.coverAlt || `${show.title} cover art`;
  }

  setText("creatorSpotlightTitle", show.title);
  setText("creatorSpotlightCreator", creatorName);
  setText("creatorSpotlightDescription", spotlightDescription);
  setText("creatorSpotlightRating", Number.isFinite(show.finalRating) ? `${formatRating(show.finalRating)}/10` : "Unrated");
  setText("creatorSpotlightCompletion", toDisplayTag(show.completionStatus || "unknown"));
  setText("creatorSpotlightYear", firstReleaseYear || "Unknown");
  setText(
    "creatorSpotlightVerification",
    verificationDate ? `Metadata checked ${formatDate(verificationDate)}` : "Metadata status still being verified",
  );
  setText(
    "creatorSpotlightPlaceholderName",
    creatorName,
  );
  setText(
    "creatorSpotlightPlaceholderCopy",
    "This entry is metadata-checked only. Echo Archives adds creator portraits, direct quotes, or interview excerpts only when they come from an official or verified source.",
  );

  const coverLink = document.getElementById("creatorSpotlightCoverLink");
  if (coverLink instanceof HTMLAnchorElement) {
    coverLink.href = show.href;
    coverLink.setAttribute("aria-label", `Open ${show.title} show page`);
  }

  const openLink = document.getElementById("creatorSpotlightOpenLink");
  if (openLink instanceof HTMLAnchorElement) {
    openLink.href = show.href;
  }

  const tagRow = document.getElementById("creatorSpotlightTags");
  if (tagRow) {
    tagRow.textContent = "";
    tagRow.hidden = tags.length === 0;

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
  const items = Array.from(document.querySelectorAll(".creator-faq-item"));

  function setFaqItemExpanded(item, expanded) {
    if (!(item instanceof HTMLElement)) {
      return;
    }

    const button = item.querySelector(".creator-faq-toggle");
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    const panelId = button.getAttribute("aria-controls");
    if (!panelId) {
      return;
    }

    const panel = document.getElementById(panelId);
    if (!panel) {
      return;
    }

    button.setAttribute("aria-expanded", String(expanded));
    panel.hidden = !expanded;
    item.classList.toggle("is-open", expanded);
  }

  items.forEach((item) => {
    if (!(item instanceof HTMLElement)) {
      return;
    }

    const button = item.querySelector(".creator-faq-toggle");
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    setFaqItemExpanded(item, button.getAttribute("aria-expanded") === "true");

    button.addEventListener("click", () => {
      const shouldExpand = button.getAttribute("aria-expanded") !== "true";

      items.forEach((otherItem) => {
        if (otherItem !== item) {
          setFaqItemExpanded(otherItem, false);
        }
      });

      setFaqItemExpanded(item, shouldExpand);
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
