export function initializeCollectionCarousel({
  featuredCollections,
  collectionCarousel,
  collectionViewport,
  collectionGrid,
  collectionPrev,
  collectionNext,
}) {
  const originalsPerSet = featuredCollections.length;
  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const autoScrollSpeedPxPerSecond = 28;
  const manualScrollDurationMs = 420;
  let prefersReducedMotion = reducedMotionQuery.matches;
  let autoScrollFrame = 0;
  let manualScrollFrame = 0;
  let normalizeFrame = 0;
  let lastFrameAt = 0;
  let stepSize = 0;
  let middleStart = 0;
  let setWidth = 0;
  let paused = false;
  let interactionCard = null;

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

  function syncCollectionFocus() {
    const viewportRect = collectionViewport.getBoundingClientRect();
    const viewportCenter = viewportRect.left + viewportRect.width / 2;
    const maxDistance = Math.max(viewportRect.width / 2, 1);
    let strongestCard = null;
    let strongestFocus = -1;

    cards.forEach((card) => {
      const cardRect = card.getBoundingClientRect();
      const cardCenter = cardRect.left + cardRect.width / 2;
      const distance = Math.abs(cardCenter - viewportCenter);
      const focusValue = Math.max(0, 1 - distance / maxDistance);
      card.style.setProperty("--collection-focus", focusValue.toFixed(4));
      if (focusValue > strongestFocus) {
        strongestFocus = focusValue;
        strongestCard = card;
      }
    });

    cards.forEach((card) => {
      card.classList.toggle("is-center-weighted", card === strongestCard && strongestFocus > 0);
    });
  }

  function setInteractionCard(card) {
    if (interactionCard === card) {
      return;
    }

    interactionCard?.classList.remove("is-interaction-boosted");
    interactionCard = card instanceof HTMLAnchorElement ? card : null;
    interactionCard?.classList.add("is-interaction-boosted");
    syncCollectionFocus();
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
    syncCollectionFocus();
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
      syncCollectionFocus();
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
      syncCollectionFocus();

      if (progress < 1) {
        manualScrollFrame = window.requestAnimationFrame(tick);
        return;
      }

      manualScrollFrame = 0;
    };

    manualScrollFrame = window.requestAnimationFrame(tick);
  }

  function stopAutoScrollLoop() {
    if (autoScrollFrame) {
      window.cancelAnimationFrame(autoScrollFrame);
      autoScrollFrame = 0;
    }
    lastFrameAt = 0;
  }

  function tickAutoScroll(timestamp) {
    autoScrollFrame = window.requestAnimationFrame(tickAutoScroll);
    if (!lastFrameAt) {
      lastFrameAt = timestamp;
      syncCollectionFocus();
      return;
    }

    const elapsedMs = Math.min(timestamp - lastFrameAt, 32);
    lastFrameAt = timestamp;
    if (!prefersReducedMotion && !paused) {
      setViewportScroll(collectionViewport.scrollLeft + (autoScrollSpeedPxPerSecond * elapsedMs) / 1000);
      normalizeLoopPosition();
    }
    syncCollectionFocus();
  }

  function startAutoScrollLoop() {
    if (autoScrollFrame) {
      return;
    }

    lastFrameAt = 0;
    autoScrollFrame = window.requestAnimationFrame(tickAutoScroll);
  }

  function pauseCarousel() {
    paused = true;
    lastFrameAt = 0;
  }

  function resumeCarousel() {
    paused = false;
    if (collectionCarousel.matches(":hover") || collectionCarousel.matches(":focus-within")) {
      return;
    }
    lastFrameAt = 0;
  }

  const handlePointerEnter = () => {
    pauseCarousel();
  };
  const handlePointerLeave = () => {
    setInteractionCard(null);
    resumeCarousel();
  };
  const handleFocusIn = (event) => {
    pauseCarousel();
    const card = event.target instanceof Element ? event.target.closest(".collection-card") : null;
    setInteractionCard(card instanceof HTMLAnchorElement ? card : null);
  };
  const handleFocusOut = (event) => {
    const currentCard = event.target instanceof Element ? event.target.closest(".collection-card") : null;
    const nextCard = event.relatedTarget instanceof Element ? event.relatedTarget.closest(".collection-card") : null;
    if (currentCard && currentCard !== nextCard && interactionCard === currentCard) {
      setInteractionCard(nextCard instanceof HTMLAnchorElement ? nextCard : null);
    }

    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && collectionCarousel.contains(nextTarget)) {
      return;
    }

    setInteractionCard(null);
    resumeCarousel();
  };
  const handleViewportScroll = () => {
    queueNormalize();
  };
  const handleCardPointerOver = (event) => {
    const card = event.target instanceof Element ? event.target.closest(".collection-card") : null;
    if (!(card instanceof HTMLAnchorElement) || !collectionGrid.contains(card)) {
      return;
    }

    setInteractionCard(card);
  };
  const handleCardPointerOut = (event) => {
    const card = event.target instanceof Element ? event.target.closest(".collection-card") : null;
    if (!(card instanceof HTMLAnchorElement) || interactionCard !== card) {
      return;
    }

    const nextCard = event.relatedTarget instanceof Element ? event.relatedTarget.closest(".collection-card") : null;
    if (nextCard === card) {
      return;
    }

    setInteractionCard(nextCard instanceof HTMLAnchorElement ? nextCard : null);
  };
  const handlePrevClick = () => {
    pauseCarousel();
    animateManualScroll(-1);
  };
  const handleNextClick = () => {
    pauseCarousel();
    animateManualScroll(1);
  };
  const handleReducedMotionChange = (event) => {
    prefersReducedMotion = event.matches;
    lastFrameAt = 0;
    syncCollectionFocus();
  };

  measure({ preservePosition: false });
  collectionCarousel.addEventListener("mouseenter", handlePointerEnter);
  collectionCarousel.addEventListener("mouseleave", handlePointerLeave);
  collectionGrid.addEventListener("pointerover", handleCardPointerOver);
  collectionGrid.addEventListener("pointerout", handleCardPointerOut);
  collectionCarousel.addEventListener("focusin", handleFocusIn);
  collectionCarousel.addEventListener("focusout", handleFocusOut);
  collectionViewport.addEventListener("scroll", handleViewportScroll, { passive: true });
  collectionPrev.addEventListener("click", handlePrevClick);
  collectionNext.addEventListener("click", handleNextClick);
  reducedMotionQuery.addEventListener?.("change", handleReducedMotionChange);
  startAutoScrollLoop();

  return {
    refresh() {
      measure();
    },
    destroy() {
      stopAutoScrollLoop();
      stopManualScroll();
      if (normalizeFrame) {
        window.cancelAnimationFrame(normalizeFrame);
        normalizeFrame = 0;
      }
      collectionCarousel.removeEventListener("mouseenter", handlePointerEnter);
      collectionCarousel.removeEventListener("mouseleave", handlePointerLeave);
      collectionGrid.removeEventListener("pointerover", handleCardPointerOver);
      collectionGrid.removeEventListener("pointerout", handleCardPointerOut);
      collectionCarousel.removeEventListener("focusin", handleFocusIn);
      collectionCarousel.removeEventListener("focusout", handleFocusOut);
      collectionViewport.removeEventListener("scroll", handleViewportScroll);
      collectionPrev.removeEventListener("click", handlePrevClick);
      collectionNext.removeEventListener("click", handleNextClick);
      reducedMotionQuery.removeEventListener?.("change", handleReducedMotionChange);
    },
  };
}
