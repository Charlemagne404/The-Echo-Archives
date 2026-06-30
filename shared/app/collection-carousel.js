import { alignCardToViewportCenter, getCenteredScrollLeft, getLoopProgress, getNearestCardIndex, getWrappedIndex } from "./collection-carousel-centering.js";

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
  const directionalPulseDurationMs = 260;
  const sheenShiftPx = 10;
  let prefersReducedMotion = reducedMotionQuery.matches;
  let autoScrollFrame = 0;
  let manualScrollFrame = 0;
  let normalizeFrame = 0;
  let lastFrameAt = 0;
  let middleStart = 0;
  let setWidth = 0;
  let middleCards = [];
  let paused = false;
  let interactionCard = null;
  let directionalPulseTimeout = 0;
  const resizeObserver = "ResizeObserver" in window
    ? new ResizeObserver(() => {
      measure();
    })
    : null;

  const cards = Array.from(collectionGrid.querySelectorAll(".collection-card"));

  function setViewportScroll(left) {
    const previousBehavior = collectionViewport.style.scrollBehavior;
    collectionViewport.style.scrollBehavior = "auto";
    collectionViewport.scrollLeft = left;
    collectionViewport.style.scrollBehavior = previousBehavior;
  }

  function getRelativeProgress(left) {
    return getLoopProgress(left, middleStart, setWidth);
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
      const signedDistance = cardCenter - viewportCenter;
      const focusValue = Math.max(0, 1 - Math.abs(signedDistance) / maxDistance);
      const focusWeight = focusValue ** 1.65;
      const offsetRatio = Math.max(-1, Math.min(1, signedDistance / maxDistance));
      card.style.setProperty("--collection-focus", focusValue.toFixed(4));
      card.style.setProperty("--collection-focus-weight", focusWeight.toFixed(4));
      [
        ["--collection-offset-from-center", offsetRatio.toFixed(4)],
        ["--collection-sheen-shift", `${(offsetRatio * sheenShiftPx).toFixed(2)}px`],
      ]
        .forEach(([name, value]) => card.style.setProperty(name, value));
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
    middleCards = cards.slice(originalsPerSet, originalsPerSet * 2);
    const firstMiddleCard = middleCards[0];
    const nextSetFirstCard = cards[originalsPerSet * 2];

    if (!firstMiddleCard || !nextSetFirstCard) {
      return;
    }

    middleStart = firstMiddleCard.offsetLeft;
    setWidth = nextSetFirstCard.offsetLeft - middleStart;
    setViewportScroll(middleStart + relativeProgress);
    syncCollectionFocus();
  }

  function normalizeLoopPosition() {
    if (!setWidth) {
      return;
    }

    const normalizedLeft = middleStart + getRelativeProgress(collectionViewport.scrollLeft);
    if (Math.abs(collectionViewport.scrollLeft - normalizedLeft) > 0.5) {
      setViewportScroll(normalizedLeft);
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

  function clearDirectionalPulse() {
    if (directionalPulseTimeout) {
      window.clearTimeout(directionalPulseTimeout);
      directionalPulseTimeout = 0;
    }

    delete collectionCarousel.dataset.collectionDirection;
    delete collectionCarousel.dataset.collectionInteraction;
  }

  function triggerDirectionalPulse(direction) {
    if (prefersReducedMotion) {
      clearDirectionalPulse();
      return;
    }

    collectionCarousel.dataset.collectionDirection = direction;
    collectionCarousel.dataset.collectionInteraction = "active";

    if (directionalPulseTimeout) {
      window.clearTimeout(directionalPulseTimeout);
    }

    directionalPulseTimeout = window.setTimeout(() => {
      directionalPulseTimeout = 0;
      delete collectionCarousel.dataset.collectionInteraction;
      delete collectionCarousel.dataset.collectionDirection;
    }, directionalPulseDurationMs);
  }

  function animateManualScroll(direction) {
    stopManualScroll();
    normalizeLoopPosition();
    const currentLinearIndex = getNearestCardIndex(cards, collectionViewport);
    const currentEquivalentIndex = originalsPerSet + getWrappedIndex(currentLinearIndex, originalsPerSet);
    const currentEquivalentCard = cards[currentEquivalentIndex];
    const targetCard = cards[currentEquivalentIndex + direction];
    const targetEquivalentCard = cards[originalsPerSet + getWrappedIndex(currentLinearIndex + direction, originalsPerSet)];

    if (!currentEquivalentCard || !targetCard || !targetEquivalentCard) {
      return;
    }

    setViewportScroll(getCenteredScrollLeft(currentEquivalentCard, collectionViewport));
    alignCardToViewportCenter(currentEquivalentCard, collectionViewport, setViewportScroll);

    const startLeft = collectionViewport.scrollLeft;
    const targetLeft = getCenteredScrollLeft(targetCard, collectionViewport);
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

      setViewportScroll(targetLeft);
      alignCardToViewportCenter(targetCard, collectionViewport, setViewportScroll);
      setViewportScroll(getCenteredScrollLeft(targetEquivalentCard, collectionViewport));
      alignCardToViewportCenter(targetEquivalentCard, collectionViewport, setViewportScroll);
      normalizeLoopPosition();
      syncCollectionFocus();
      manualScrollFrame = 0;
      resumeCarousel();
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

  const handlePointerEnter = () => pauseCarousel();
  const handlePointerLeave = () => { setInteractionCard(null); resumeCarousel(); };
  const handlePointerDown = () => pauseCarousel();
  const handlePointerUp = () => resumeCarousel();
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
    triggerDirectionalPulse("prev");
    animateManualScroll(-1);
  };
  const handleNextClick = () => {
    pauseCarousel();
    triggerDirectionalPulse("next");
    animateManualScroll(1);
  };
  const handleReducedMotionChange = (event) => {
    prefersReducedMotion = event.matches;
    if (prefersReducedMotion) {
      clearDirectionalPulse();
    }
    lastFrameAt = 0;
    syncCollectionFocus();
  };

  measure({ preservePosition: false });
  collectionCarousel.addEventListener("mouseenter", handlePointerEnter);
  collectionCarousel.addEventListener("mouseleave", handlePointerLeave);
  collectionCarousel.addEventListener("pointerdown", handlePointerDown);
  collectionCarousel.addEventListener("pointerup", handlePointerUp);
  collectionCarousel.addEventListener("pointercancel", handlePointerUp);
  collectionGrid.addEventListener("pointerover", handleCardPointerOver);
  collectionGrid.addEventListener("pointerout", handleCardPointerOut);
  collectionCarousel.addEventListener("focusin", handleFocusIn);
  collectionCarousel.addEventListener("focusout", handleFocusOut);
  collectionViewport.addEventListener("scroll", handleViewportScroll, { passive: true });
  collectionPrev.addEventListener("click", handlePrevClick);
  collectionNext.addEventListener("click", handleNextClick);
  reducedMotionQuery.addEventListener?.("change", handleReducedMotionChange);
  resizeObserver?.observe(collectionCarousel);
  resizeObserver?.observe(collectionViewport);
  startAutoScrollLoop();

  return {
    refresh() {
      measure();
    },
    destroy() {
      stopAutoScrollLoop();
      stopManualScroll();
      clearDirectionalPulse();
      if (normalizeFrame) {
        window.cancelAnimationFrame(normalizeFrame);
        normalizeFrame = 0;
      }
      collectionCarousel.removeEventListener("mouseenter", handlePointerEnter);
      collectionCarousel.removeEventListener("mouseleave", handlePointerLeave);
      collectionCarousel.removeEventListener("pointerdown", handlePointerDown);
      collectionCarousel.removeEventListener("pointerup", handlePointerUp);
      collectionCarousel.removeEventListener("pointercancel", handlePointerUp);
      collectionGrid.removeEventListener("pointerover", handleCardPointerOver);
      collectionGrid.removeEventListener("pointerout", handleCardPointerOut);
      collectionCarousel.removeEventListener("focusin", handleFocusIn);
      collectionCarousel.removeEventListener("focusout", handleFocusOut);
      collectionViewport.removeEventListener("scroll", handleViewportScroll);
      collectionPrev.removeEventListener("click", handlePrevClick);
      collectionNext.removeEventListener("click", handleNextClick);
      reducedMotionQuery.removeEventListener?.("change", handleReducedMotionChange);
      resizeObserver?.disconnect();
    },
  };
}
