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
  getCollectionAnchorShow,
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

function getCollectionShowsSummary(collection, collectionShows, anchorShow) {
  const showCount = collectionShows.length;
  if (collection?.kind === "similarity" && anchorShow?.title) {
    return `${showCount} nearby ${showCount === 1 ? "pick" : "picks"} starting from ${anchorShow.title}.`;
  }

  return `${showCount} ${showCount === 1 ? "show" : "shows"} selected for this route.`;
}

function createSignalChip(label, className = "") {
  const chip = document.createElement("span");
  chip.className = `collection-detail-signal-chip${className ? ` ${className}` : ""}`;
  chip.textContent = label;
  return chip;
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

function getCollectionOverviewChipValues(collection, collectionShows, routeTypeLabel) {
  const values = [];
  const seen = new Set();
  const addValue = (value, className = "") => {
    const text = String(value || "").trim();
    const key = normalizeTextValue(text);
    if (!text || seen.has(key)) {
      return;
    }

    seen.add(key);
    values.push({ text, className });
  };

  if (collection?.label) {
    addValue(collection.label, "collection-detail-signal-chip-featured");
  }

  (collection?.intentTags || []).slice(0, 2).forEach((tag) => {
    addValue(toDisplayTag(tag));
  });

  if (shouldShowCommitment(collection, routeTypeLabel)) {
    addValue(collection.commitment);
  }

  getDominantToneSignals(collectionShows)
    .slice(0, 1)
    .forEach((tone) => {
      addValue(toDisplayTag(tone));
    });

  return values;
}

function appendOverviewMetaText(container, text, className = "") {
  const item = document.createElement("span");
  item.className = `collection-detail-meta-text${className ? ` ${className}` : ""}`;
  item.textContent = text;
  container.appendChild(item);
}

function appendOverviewMetaSeparator(container) {
  const separator = document.createElement("span");
  separator.className = "collection-detail-meta-separator";
  separator.setAttribute("aria-hidden", "true");
  separator.textContent = " · ";
  container.appendChild(separator);
}

function populateOverviewMetaLine(container, { showCount, routeTypeLabel, updatedAt, anchorShow }) {
  if (!(container instanceof HTMLElement)) {
    return;
  }

  container.textContent = "";
  appendOverviewMetaText(container, `${showCount} ${showCount === 1 ? "show" : "shows"}`);
  appendOverviewMetaSeparator(container);
  appendOverviewMetaText(container, routeTypeLabel);

  if (anchorShow?.title && anchorShow?.href) {
    appendOverviewMetaSeparator(container);
    const anchor = document.createElement("span");
    anchor.className = "collection-detail-meta-text collection-detail-meta-text-anchor";
    const prefix = document.createElement("span");
    prefix.className = "collection-detail-anchor-prefix";
    prefix.textContent = "Starts with ";
    const link = document.createElement("a");
    link.className = "collection-detail-anchor-link";
    link.href = anchorShow.href;
    link.textContent = anchorShow.title;
    anchor.append(prefix, link);
    container.appendChild(anchor);
  }

  if (updatedAt) {
    appendOverviewMetaSeparator(container);
    appendOverviewMetaText(container, `Updated ${formatDate(updatedAt)}`);
  }
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
  const anchorShow = getCollectionAnchorShow(collection, showMap);
  const collectionTitle = collection.title || "Untitled collection";
  const collectionDescription = collection.description || "Collection description not cataloged yet.";
  const showCount = collectionShows.length;
  const leadCoverShow = anchorShow || collectionShows[0] || null;
  const firstCover = leadCoverShow?.imageSrc || (leadCoverShow?.cover ? resolveImageSrc(leadCoverShow.cover) : DEFAULT_SOCIAL_IMAGE);
  updateDocumentMetadata({
    title: `${collectionTitle} - The Echo Archives`,
    description: collectionDescription,
    path: `/collection?id=${encodeURIComponent(collection.id)}`,
    image: firstCover,
  });

  setTextContent("collectionTitle", collectionTitle);
  setTextContent("collectionDescription", collectionDescription);
  const routeTypeLabel = getCollectionRouteTypeLabel(collection);
  setTextContent("collectionShowsSummary", getCollectionShowsSummary(collection, collectionShows, anchorShow));

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
      anchorShow,
    }));
  }

  const accent = (anchorShow || collectionShows.find((show) => show?.accent?.hex))?.accent?.hex;
  const heroPanel = document.getElementById("collectionHeroPanel");
  if (accent && heroPanel) {
    heroPanel.style.setProperty("--collection-accent", accent);
  }

  const archiveHeroLink = document.getElementById("collectionArchiveHeroLink");
  if (archiveHeroLink) {
    archiveHeroLink.href = createArchiveCollectionHref(collection.id);
  }
  if (shareButton instanceof HTMLButtonElement) {
    bindShareButton(shareButton, {
      title: `${collectionTitle} - The Echo Archives`,
      text: collectionDescription,
      url: window.location.href,
    });
  }

  const overviewMetaLine = document.getElementById("collectionOverviewMetaLine");
  populateOverviewMetaLine(overviewMetaLine, {
    showCount,
    routeTypeLabel,
    updatedAt: collection.updatedAt || "",
    anchorShow: collection.kind === "similarity" ? anchorShow : null,
  });

  const overviewChips = document.getElementById("collectionOverviewChips");
  if (overviewChips instanceof HTMLElement) {
    overviewChips.textContent = "";
    getCollectionOverviewChipValues(collection, collectionShows, routeTypeLabel).forEach(({ text, className }) => {
      overviewChips.appendChild(createSignalChip(text, className));
    });
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
      relatedGrid.appendChild(
        createCollectionDirectoryCard(relatedCollection, getCollectionShows(relatedCollection, showMap), {
          compact: true,
          anchorShow: getCollectionAnchorShow(relatedCollection, showMap),
        }),
      );
    });
  }
  if (relatedEmpty) {
    relatedEmpty.hidden = relatedCollections.length > 0;
  }
  if (relatedSummary) {
    relatedSummary.textContent =
      relatedCollections.length > 0
        ? "Neighboring routes in the archive."
        : "No nearby routes are strong enough to surface here yet.";
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
