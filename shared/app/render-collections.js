import { getCollectionShows } from "./data.js";
import { createArchiveCollectionHref, createCollectionHref } from "./urls.js";

export function createCollectionCard(collection, index, showMap, { isClone = false } = {}) {
  const collectionShows = getCollectionShows(collection, showMap);
  const coverShow = collectionShows[0];
  const card = document.createElement("a");
  card.className = "collection-card";
  card.href = createCollectionHref(collection.id);
  card.setAttribute("aria-label", `Browse the ${collection.title} collection`);
  card.dataset.collectionId = collection.id;
  if (isClone) {
    card.dataset.collectionClone = "true";
    card.tabIndex = -1;
    card.setAttribute("aria-hidden", "true");
  }

  if (coverShow?.cover) {
    card.style.setProperty("--collection-cover-image", `url("/${coverShow.cover}")`);
  }

  const badge = document.createElement("span");
  badge.className = "collection-card-badge";
  badge.textContent = index % 2 === 0 ? "Featured route" : "Archive collection";

  const title = document.createElement("h3");
  title.textContent = collection.title;

  const footer = document.createElement("div");
  footer.className = "collection-card-footer";

  const count = document.createElement("p");
  count.className = "collection-card-count";
  count.textContent = `${collectionShows.length} ${collectionShows.length === 1 ? "show" : "shows"}`;

  const cta = document.createElement("span");
  cta.className = "collection-card-cta";
  cta.textContent = "Browse";

  footer.append(count, cta);
  card.append(badge, title, footer);
  return card;
}

export function initializeCollectionCarousel({
  featuredCollections,
  collectionCarousel,
  collectionViewport,
  collectionGrid,
  collectionPrev,
  collectionNext,
}) {
  const originalsPerSet = featuredCollections.length;
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const autoScrollSpeedPxPerSecond = 28;
  const manualScrollDurationMs = 420;
  let autoScrollTimer = 0;
  let manualScrollFrame = 0;
  let normalizeFrame = 0;
  let lastAutoScrollAt = 0;
  let stepSize = 0;
  let middleStart = 0;
  let setWidth = 0;
  let paused = false;

  const cards = Array.from(collectionGrid.querySelectorAll(".collection-card"));

  function setViewportScroll(left) {
    const previousBehavior = collectionViewport.style.scrollBehavior;
    collectionViewport.style.scrollBehavior = "auto";
    collectionViewport.scrollLeft = left;
    collectionViewport.style.scrollBehavior = previousBehavior;
  }

  function getRelativeProgress(left) {
    if (!setWidth) {
      return 0;
    }

    return ((left - middleStart) % setWidth + setWidth) % setWidth;
  }

  function measure({ preservePosition = true } = {}) {
    const relativeProgress = preservePosition ? getRelativeProgress(collectionViewport.scrollLeft) : 0;
    const middleCards = cards.slice(originalsPerSet, originalsPerSet * 2);
    const firstMiddleCard = middleCards[0];
    const secondMiddleCard = middleCards[1];
    const nextSetFirstCard = cards[originalsPerSet * 2];

    if (!firstMiddleCard || !nextSetFirstCard) {
      return;
    }

    middleStart = firstMiddleCard.offsetLeft;
    setWidth = nextSetFirstCard.offsetLeft - middleStart;
    stepSize = secondMiddleCard ? secondMiddleCard.offsetLeft - firstMiddleCard.offsetLeft : setWidth;
    setViewportScroll(middleStart + relativeProgress);
  }

  function normalizeLoopPosition() {
    if (!setWidth) {
      return;
    }

    const maxScrollLeft = Math.max(collectionGrid.scrollWidth - collectionViewport.clientWidth, 0);
    if (collectionViewport.scrollLeft <= 1) {
      setViewportScroll(collectionViewport.scrollLeft + setWidth);
    } else if (collectionViewport.scrollLeft >= maxScrollLeft - 1) {
      setViewportScroll(collectionViewport.scrollLeft - setWidth);
    }
  }

  function queueNormalize() {
    if (normalizeFrame) {
      return;
    }

    normalizeFrame = window.requestAnimationFrame(() => {
      normalizeFrame = 0;
      normalizeLoopPosition();
    });
  }

  function stopManualScroll() {
    if (manualScrollFrame) {
      window.cancelAnimationFrame(manualScrollFrame);
      manualScrollFrame = 0;
    }
  }

  function animateManualScroll(direction) {
    stopManualScroll();
    normalizeLoopPosition();

    const startLeft = collectionViewport.scrollLeft;
    const targetLeft = startLeft + stepSize * direction;
    const startedAt = window.performance.now();

    const tick = (timestamp) => {
      const progress = Math.min((timestamp - startedAt) / manualScrollDurationMs, 1);
      const eased = 1 - (1 - progress) ** 3;
      setViewportScroll(startLeft + (targetLeft - startLeft) * eased);
      normalizeLoopPosition();

      if (progress < 1) {
        manualScrollFrame = window.requestAnimationFrame(tick);
        return;
      }

      manualScrollFrame = 0;
    };

    manualScrollFrame = window.requestAnimationFrame(tick);
  }

  function stopAutoScroll() {
    if (autoScrollTimer) {
      window.clearInterval(autoScrollTimer);
      autoScrollTimer = 0;
    }
    lastAutoScrollAt = 0;
  }

  function startAutoScroll() {
    stopAutoScroll();
    if (prefersReducedMotion || paused) {
      return;
    }

    lastAutoScrollAt = window.performance.now();
    autoScrollTimer = window.setInterval(() => {
      const now = window.performance.now();
      const elapsedMs = Math.min(now - lastAutoScrollAt, 32);
      lastAutoScrollAt = now;
      setViewportScroll(collectionViewport.scrollLeft + (autoScrollSpeedPxPerSecond * elapsedMs) / 1000);
      normalizeLoopPosition();
    }, 16);
  }

  function pauseCarousel() {
    paused = true;
    stopAutoScroll();
  }

  function resumeCarousel() {
    paused = false;
    if (collectionCarousel.matches(":hover") || collectionCarousel.matches(":focus-within")) {
      return;
    }

    startAutoScroll();
  }

  const handlePointerEnter = () => {
    pauseCarousel();
  };
  const handlePointerLeave = () => {
    resumeCarousel();
  };
  const handleFocusIn = () => {
    pauseCarousel();
  };
  const handleFocusOut = (event) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && collectionCarousel.contains(nextTarget)) {
      return;
    }

    resumeCarousel();
  };
  const handleViewportScroll = () => {
    queueNormalize();
  };
  const handlePrevClick = () => {
    pauseCarousel();
    animateManualScroll(-1);
  };
  const handleNextClick = () => {
    pauseCarousel();
    animateManualScroll(1);
  };

  measure({ preservePosition: false });
  collectionCarousel.addEventListener("mouseenter", handlePointerEnter);
  collectionCarousel.addEventListener("mouseleave", handlePointerLeave);
  collectionCarousel.addEventListener("focusin", handleFocusIn);
  collectionCarousel.addEventListener("focusout", handleFocusOut);
  collectionViewport.addEventListener("scroll", handleViewportScroll, { passive: true });
  collectionPrev.addEventListener("click", handlePrevClick);
  collectionNext.addEventListener("click", handleNextClick);
  startAutoScroll();

  return {
    refresh() {
      measure();
    },
    destroy() {
      stopAutoScroll();
      stopManualScroll();
      if (normalizeFrame) {
        window.cancelAnimationFrame(normalizeFrame);
        normalizeFrame = 0;
      }
      collectionCarousel.removeEventListener("mouseenter", handlePointerEnter);
      collectionCarousel.removeEventListener("mouseleave", handlePointerLeave);
      collectionCarousel.removeEventListener("focusin", handleFocusIn);
      collectionCarousel.removeEventListener("focusout", handleFocusOut);
      collectionViewport.removeEventListener("scroll", handleViewportScroll);
      collectionPrev.removeEventListener("click", handlePrevClick);
      collectionNext.removeEventListener("click", handleNextClick);
    },
  };
}

export function createCollectionDirectoryCard(collection, shows) {
  const article = document.createElement("article");
  article.className = "page-card collection-directory-card";

  const kicker = document.createElement("p");
  kicker.className = "page-card-kicker";
  kicker.textContent = collection.featured ? "Featured collection" : "Collection";

  const title = document.createElement("h2");
  title.textContent = collection.title;

  const description = document.createElement("p");
  description.textContent = collection.description;

  const meta = document.createElement("p");
  meta.className = "collection-directory-meta";
  meta.textContent = `${shows.length} shows • ${collection.kind || "curated"}`;

  const actions = document.createElement("div");
  actions.className = "collection-directory-actions";

  const collectionLink = document.createElement("a");
  collectionLink.className = "collection-action";
  collectionLink.href = createCollectionHref(collection.id);
  collectionLink.textContent = "Open collection";

  const archiveLink = document.createElement("a");
  archiveLink.className = "collection-secondary-link";
  archiveLink.href = createArchiveCollectionHref(collection.id);
  archiveLink.textContent = "Browse in archive";

  actions.append(collectionLink, archiveLink);
  article.append(kicker, title, description, meta, actions);
  return article;
}

export function createCollectionDirectoryDivider() {
  const divider = document.createElement("div");
  divider.className = "collection-directory-divider";
  divider.setAttribute("aria-hidden", "true");

  const label = document.createElement("span");
  label.className = "collection-directory-divider-label";
  label.textContent = "More collections";

  divider.appendChild(label);
  return divider;
}

export function getCollectionShowReason(collection, showId) {
  const reason = collection?.showReasons?.[showId];
  return typeof reason === "string" && reason.trim() ? reason.trim() : "";
}

export function getShowCollectionMemberships(showId, collections = []) {
  return collections
    .filter((collection) => Array.isArray(collection.showIds) && collection.showIds.includes(showId))
    .sort((left, right) => Number(Boolean(right.featured)) - Number(Boolean(left.featured)))
    .map((collection) => ({
      id: collection.id,
      title: collection.title,
      reason: getCollectionShowReason(collection, showId),
      featured: Boolean(collection.featured),
    }));
}
