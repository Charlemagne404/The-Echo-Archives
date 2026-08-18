import { alignCardToViewportCenter, getCenteredScrollLeft, getLoopProgress, getNearestCardIndex, getWrappedIndex } from "./collection-carousel-centering.js";
import { createCollectionFocusController } from "./collection-carousel-focus.js";
import { createCollectionCarouselInputController } from "./collection-carousel-input.js";
import { addMediaQueryListener } from "./utils.js";

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
  let focusSyncFrame = 0;
  let lastFrameAt = 0;
  let middleStart = 0;
  let setWidth = 0;
  let middleCards = [];
  let paused = false;
  let directionalPulseTimeout = 0;
  let autoScrollPosition = null;
  const cards = Array.from(collectionGrid.querySelectorAll(".collection-card"));
  const collectionFocusController = createCollectionFocusController({ collectionViewport, cards, sheenShiftPx });
  function setViewportScroll(left) {
    collectionViewport.scrollLeft = left;
  }

  function getCurrentScrollPosition() {
    return autoScrollPosition ?? collectionViewport.scrollLeft;
  }

  function getRelativeProgress(left) {
    return getLoopProgress(left, middleStart, setWidth);
  }

  const { getInteractionCard, setInteractionCard, syncCollectionFocus } = collectionFocusController;

  function measure({ preservePosition = true } = {}) {
    const relativeProgress = preservePosition ? getRelativeProgress(getCurrentScrollPosition()) : 0;
    middleCards = cards.slice(originalsPerSet, originalsPerSet * 2);
    const firstMiddleCard = middleCards[0];
    const nextSetFirstCard = cards[originalsPerSet * 2];

    if (!firstMiddleCard || !nextSetFirstCard) {
      return;
    }

    middleStart = firstMiddleCard.offsetLeft;
    setWidth = nextSetFirstCard.offsetLeft - middleStart;
    autoScrollPosition = middleStart + relativeProgress;
    setViewportScroll(autoScrollPosition);
    syncCollectionFocus();
  }

  function normalizeLoopPosition(left = getCurrentScrollPosition()) {
    if (!setWidth) {
      return left;
    }

    const normalizedLeft = middleStart + getRelativeProgress(left);
    if (Math.abs(left - normalizedLeft) > 0.5) {
      setViewportScroll(normalizedLeft);
    }

    return normalizedLeft;
  }

  function queueFocusSync() {
    if (focusSyncFrame) {
      return;
    }

    focusSyncFrame = window.requestAnimationFrame(() => {
      focusSyncFrame = 0;
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
    autoScrollPosition = null;
    normalizeLoopPosition(collectionViewport.scrollLeft);
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
      queueFocusSync();

      if (progress < 1) {
        manualScrollFrame = window.requestAnimationFrame(tick);
        return;
      }

      setViewportScroll(targetLeft);
      alignCardToViewportCenter(targetCard, collectionViewport, setViewportScroll);
      setViewportScroll(getCenteredScrollLeft(targetEquivalentCard, collectionViewport));
      alignCardToViewportCenter(targetEquivalentCard, collectionViewport, setViewportScroll);
      autoScrollPosition = normalizeLoopPosition(collectionViewport.scrollLeft);
      queueFocusSync();
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
      queueFocusSync();
      return;
    }

    const elapsedMs = Math.min(timestamp - lastFrameAt, 32);
    lastFrameAt = timestamp;
    if (!prefersReducedMotion && !paused) {
      const currentPosition = getCurrentScrollPosition();
      autoScrollPosition = normalizeLoopPosition(currentPosition + (autoScrollSpeedPxPerSecond * elapsedMs) / 1000);
      setViewportScroll(autoScrollPosition);
    }
    queueFocusSync();
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
  const handleFocusIn = (event) => {
    pauseCarousel();
    const card = event.target instanceof Element ? event.target.closest(".collection-card") : null;
    setInteractionCard(card instanceof HTMLAnchorElement ? card : null);
  };
  const handleFocusOut = (event) => {
    const currentCard = event.target instanceof Element ? event.target.closest(".collection-card") : null;
    const nextCard = event.relatedTarget instanceof Element ? event.relatedTarget.closest(".collection-card") : null;
    if (currentCard && currentCard !== nextCard && getInteractionCard() === currentCard) {
      setInteractionCard(nextCard instanceof HTMLAnchorElement ? nextCard : null);
    }

    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && collectionCarousel.contains(nextTarget)) {
      return;
    }

    setInteractionCard(null);
    if (!collectionInputController.isNativeScrollPending()) {
      resumeCarousel();
    }
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
    if (!(card instanceof HTMLAnchorElement) || getInteractionCard() !== card) {
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
    autoScrollPosition = collectionViewport.scrollLeft;
    syncCollectionFocus();
  };

  const collectionInputController = createCollectionCarouselInputController({
    collectionCarousel,
    collectionViewport,
    getAutoScrollPosition: () => autoScrollPosition,
    setAutoScrollPosition: (position) => { autoScrollPosition = position; },
    pauseCarousel,
    resumeCarousel,
    normalizeScrollPosition: normalizeLoopPosition,
    queueFocusSync,
    onNativeScrollSettled: (position) => { autoScrollPosition = position; },
  });
  const resizeObserver = "ResizeObserver" in window
    ? new ResizeObserver(() => {
      if (!collectionInputController.isNativeScrollPending()) {
        measure();
      }
    })
    : null;
  measure({ preservePosition: false });
  collectionCarousel.addEventListener("mouseenter", handlePointerEnter);
  collectionCarousel.addEventListener("mouseleave", handlePointerLeave);
  collectionCarousel.addEventListener("pointerdown", collectionInputController.handlePointerDown);
  window.addEventListener("pointerup", collectionInputController.handlePointerEnd, { passive: true });
  window.addEventListener("pointercancel", collectionInputController.handlePointerEnd, { passive: true });
  collectionGrid.addEventListener("pointerover", handleCardPointerOver);
  collectionGrid.addEventListener("pointerout", handleCardPointerOut);
  collectionCarousel.addEventListener("focusin", handleFocusIn);
  collectionCarousel.addEventListener("focusout", handleFocusOut);
  collectionViewport.addEventListener("scroll", collectionInputController.handleViewportScroll, { passive: true });
  collectionViewport.addEventListener("scrollend", collectionInputController.handleViewportScrollEnd, { passive: true });
  collectionPrev.addEventListener("click", handlePrevClick);
  collectionNext.addEventListener("click", handleNextClick);
  const removeReducedMotionListener = addMediaQueryListener(reducedMotionQuery, handleReducedMotionChange);
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
      collectionInputController.destroy();
      if (focusSyncFrame) {
        window.cancelAnimationFrame(focusSyncFrame);
        focusSyncFrame = 0;
      }
      collectionCarousel.removeEventListener("mouseenter", handlePointerEnter);
      collectionCarousel.removeEventListener("mouseleave", handlePointerLeave);
      collectionCarousel.removeEventListener("pointerdown", collectionInputController.handlePointerDown);
      window.removeEventListener("pointerup", collectionInputController.handlePointerEnd);
      window.removeEventListener("pointercancel", collectionInputController.handlePointerEnd);
      collectionGrid.removeEventListener("pointerover", handleCardPointerOver);
      collectionGrid.removeEventListener("pointerout", handleCardPointerOut);
      collectionCarousel.removeEventListener("focusin", handleFocusIn);
      collectionCarousel.removeEventListener("focusout", handleFocusOut);
      collectionViewport.removeEventListener("scroll", collectionInputController.handleViewportScroll);
      collectionViewport.removeEventListener("scrollend", collectionInputController.handleViewportScrollEnd);
      collectionPrev.removeEventListener("click", handlePrevClick);
      collectionNext.removeEventListener("click", handleNextClick);
      removeReducedMotionListener();
      resizeObserver?.disconnect();
    },
  };
}
