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
import { renderRouteErrorSurface } from "../route-error.js";
import {
  createCollectionCoverCollage,
  createCollectionDirectoryCard,
  createCollectionHeroTagList,
  getCollectionShowReason,
} from "../render-collections.js";
import { resolveImageSrc } from "../images.js";
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

function getCollectionRouteTypeLabel(collection) {
  return collection?.kind === "similarity" ? "Shows-like route" : "Curated route";
}

function normalizeTextValue(value) {
  return String(value || "").trim().toLowerCase();
}

function shouldShowCommitment(collection, routeTypeLabel) {
  const commitment = String(collection?.commitment || "").trim();
  const normalizedCommitment = normalizeTextValue(commitment);

  if (!normalizedCommitment) {
    return false;
  }

  if (normalizedCommitment === normalizeTextValue(routeTypeLabel)) {
    return false;
  }

  if (collection?.kind === "similarity" && normalizedCommitment.includes("similar")) {
    return false;
  }

  if (collection?.kind === "curated" && normalizedCommitment.includes("curated")) {
    return false;
  }

  return true;
}

function getCollectionOverviewSummary(collection, collectionShows, anchorShow) {
  const showCount = collectionShows.length;
  if (collection?.kind === "similarity" && anchorShow?.title) {
    return `Start with ${anchorShow.title}, then follow this route into ${showCount} nearby archive ${showCount === 1 ? "pick" : "picks"}.`;
  }

  const commitment = String(collection?.commitment || "").trim();
  if (commitment) {
    return `${showCount} ${showCount === 1 ? "show" : "shows"} selected for a ${commitment.toLowerCase()} listening path.`;
  }

  return `${showCount} ${showCount === 1 ? "show" : "shows"} selected for this curated listening route.`;
}

function getCollectionShowsSummary(collection, collectionShows, anchorShow) {
  const showCount = collectionShows.length;
  if (collection?.kind === "similarity" && anchorShow?.title) {
    return `${showCount} nearby ${showCount === 1 ? "pick" : "picks"} for listeners starting from ${anchorShow.title}.`;
  }

  return `${showCount} ${showCount === 1 ? "show" : "shows"} selected for this listening route.`;
}

function getCollectionRouteFocus(collection, anchorShow) {
  if (collection?.label) {
    return collection.label;
  }

  if (collection?.kind === "similarity" && anchorShow?.title) {
    return `Built outward from ${anchorShow.title}.`;
  }

  return getCollectionRouteTypeLabel(collection);
}

function createSignalChip(label) {
  const chip = document.createElement("span");
  chip.className = "collection-detail-signal-chip";
  chip.textContent = label;
  return chip;
}

function populateSignalChips(container, values = []) {
  if (!(container instanceof HTMLElement)) {
    return;
  }

  container.textContent = "";
  values.forEach((value) => {
    container.appendChild(createSignalChip(toDisplayTag(value)));
  });
}

function getDominantToneSignals(collectionShows) {
  const counts = new Map();

  collectionShows.forEach((show) => {
    (show?.tones || []).forEach((tone) => {
      const key = normalizeTextValue(tone);
      if (!key) {
        return;
      }

      const current = counts.get(key) || { label: tone, count: 0 };
      current.count += 1;
      counts.set(key, current);
    });
  });

  const minimumCount = Math.max(2, Math.ceil(collectionShows.length * 0.4));
  return Array.from(counts.values())
    .filter((entry) => entry.count >= minimumCount)
    .sort((left, right) => right.count - left.count || toDisplayTag(left.label).localeCompare(toDisplayTag(right.label)))
    .slice(0, 3)
    .map((entry) => entry.label);
}

function countOverlap(leftValues = [], rightValues = []) {
  const leftSet = new Set(Array.isArray(leftValues) ? leftValues : []);
  let overlap = 0;

  (Array.isArray(rightValues) ? rightValues : []).forEach((value) => {
    if (leftSet.has(value)) {
      overlap += 1;
    }
  });

  return overlap;
}

function getRelatedCollections(collection, collections = []) {
  return collections
    .filter((candidate) => candidate.id && candidate.id !== collection.id)
    .map((candidate) => {
      const sharedIntentCount = countOverlap(collection.intentTags, candidate.intentTags);
      const sharedShowCount = countOverlap(collection.showIds, candidate.showIds);
      const sameKind = Number(candidate.kind === collection.kind);
      const score = sharedIntentCount * 4 + sharedShowCount * 3 + sameKind;

      return {
        candidate,
        sharedIntentCount,
        sharedShowCount,
        sameKind,
        score,
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      return (
        right.score - left.score ||
        right.sharedShowCount - left.sharedShowCount ||
        right.sharedIntentCount - left.sharedIntentCount ||
        right.sameKind - left.sameKind ||
        left.candidate.order - right.candidate.order ||
        String(left.candidate.title || "").localeCompare(String(right.candidate.title || ""))
      );
    })
    .slice(0, 3)
    .map((entry) => entry.candidate);
}

export async function initializeCollectionPage() {
  const collectionId = new URLSearchParams(window.location.search).get("id") || "";
  const root = document.getElementById("collectionRoot");
  const grid = document.getElementById("collectionShowGrid");
  const archiveSection = document.getElementById("collectionArchiveSection");
  const relatedSection = document.getElementById("collectionRelatedSection");
  const heroArt = document.getElementById("collectionHeroArt");
  const shareButton = document.getElementById("collectionCopyLink");

  if (!root || !grid || !archiveSection || !relatedSection) {
    return;
  }

  grid.textContent = "";
  for (let index = 0; index < 6; index += 1) {
    grid.appendChild(createCollectionLoadingCard());
  }

  const [shows, collections] = await loadCollectionPageData({ root, grid });
  if (!shows || !collections) {
    archiveSection.hidden = true;
    relatedSection.hidden = true;
    return;
  }
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
    relatedSection.remove();
    return;
  }

  const collectionShows = getCollectionShows(collection, showMap);
  const anchorShow = collection.anchorShowId ? showMap.get(collection.anchorShowId) : null;
  const collectionTitle = collection.title || "Untitled collection";
  const collectionDescription = collection.description || "Collection description not cataloged yet.";
  const firstCover = collectionShows[0]?.imageSrc || (collectionShows[0]?.cover ? resolveImageSrc(collectionShows[0].cover) : DEFAULT_SOCIAL_IMAGE);
  updateDocumentMetadata({
    title: `${collectionTitle} - The Echo Archives`,
    description: collectionDescription,
    path: `/collection?id=${encodeURIComponent(collection.id)}`,
    image: firstCover,
  });

  setTextContent("collectionTitle", collectionTitle);
  setTextContent("collectionDescription", collectionDescription);
  setTextContent("collectionOverviewSummary", getCollectionOverviewSummary(collection, collectionShows, anchorShow));
  setTextContent("collectionShowCount", `${collectionShows.length} ${collectionShows.length === 1 ? "show" : "shows"}`);
  const routeTypeLabel = getCollectionRouteTypeLabel(collection);
  setTextContent("collectionKind", routeTypeLabel);
  setTextContent("collectionLastUpdated", collection.updatedAt ? formatDate(collection.updatedAt) : "Unknown");
  setTextContent("collectionShowsSummary", getCollectionShowsSummary(collection, collectionShows, anchorShow));
  setTextContent("collectionRouteFocus", getCollectionRouteFocus(collection, anchorShow));

  const heroTags = document.getElementById("collectionHeroTags");
  if (heroTags) {
    heroTags.textContent = "";
    heroTags.appendChild(createCollectionHeroTagList(collection, 4));
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
  const relatedArchiveLink = document.getElementById("collectionRelatedArchiveLink");
  if (relatedArchiveLink) {
    relatedArchiveLink.href = createArchiveCollectionHref(collection.id);
  }
  if (shareButton instanceof HTMLButtonElement) {
    bindShareButton(shareButton, {
      title: `${collectionTitle} - The Echo Archives`,
      text: collectionDescription,
      url: window.location.href,
    });
  }

  const commitmentFact = document.getElementById("collectionCommitmentFact");
  const commitmentValue = String(collection.commitment || "").trim();
  const showCommitment = shouldShowCommitment(collection, routeTypeLabel);
  if (commitmentFact) {
    commitmentFact.hidden = !showCommitment;
  }
  if (showCommitment) {
    setTextContent("collectionCommitment", commitmentValue);
  }

  const intentSignalsGroup = document.getElementById("collectionIntentSignalsGroup");
  const intentSignals = document.getElementById("collectionIntentSignals");
  const visibleIntentTags = (collection.intentTags || []).slice(0, 4);
  if (intentSignalsGroup) {
    intentSignalsGroup.hidden = visibleIntentTags.length === 0;
  }
  populateSignalChips(intentSignals, visibleIntentTags);

  const toneSignalsGroup = document.getElementById("collectionToneSignalsGroup");
  const toneSignals = document.getElementById("collectionToneSignals");
  const dominantTones = getDominantToneSignals(collectionShows);
  if (toneSignalsGroup) {
    toneSignalsGroup.hidden = dominantTones.length === 0;
  }
  populateSignalChips(toneSignals, dominantTones);

  const anchorRoute = document.getElementById("collectionAnchorRoute");
  const anchorLink = document.getElementById("collectionAnchorLink");
  if (anchorRoute && anchorLink) {
    const shouldShowAnchor = collection.kind === "similarity" && Boolean(anchorShow?.title && anchorShow?.href);
    anchorRoute.hidden = !shouldShowAnchor;
    if (shouldShowAnchor) {
      anchorLink.textContent = anchorShow.title;
      anchorLink.href = anchorShow.href || "/";
    }
  }

  grid.textContent = "";
  collectionShows.forEach((show) => {
    grid.appendChild(createCollectionShowCard(show, getCollectionShowReason(collection, show.id)));
  });
  void syncCommunityCardBadges(grid, collectionShows);

  const relatedCollections = getRelatedCollections(collection, collections);
  const relatedGrid = document.getElementById("collectionRelatedGrid");
  const relatedEmpty = document.getElementById("collectionRelatedEmpty");
  const relatedSummary = document.getElementById("collectionRelatedSummary");
  if (relatedGrid) {
    relatedGrid.textContent = "";
    relatedCollections.forEach((relatedCollection) => {
      relatedGrid.appendChild(createCollectionDirectoryCard(relatedCollection, getCollectionShows(relatedCollection, showMap)));
    });
  }
  if (relatedEmpty) {
    relatedEmpty.hidden = relatedCollections.length > 0;
  }
  if (relatedSummary) {
    relatedSummary.textContent =
      relatedCollections.length > 0
        ? "More archive routes that overlap this one in signal, included shows, or listening shape."
        : "No adjacent routes are strong enough to suggest yet, but the wider archive is still open.";
  }
}

async function loadCollectionPageData({ root, grid }) {
  try {
    return await Promise.all([loadShows(), loadCollections()]);
  } catch (_error) {
    renderRouteErrorSurface(root, {
      title: "Collection data did not load",
      explanation: "This collection needs the public catalog before its show list and archive links can be shown.",
      primaryAction: { href: "/collections", label: "Browse collections" },
      secondaryAction: { href: "/", label: "Back to archive" },
      onRetry: () => window.location.reload(),
    });
    if (grid) grid.textContent = "";
    return [null, null];
  }
}
