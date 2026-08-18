const nativeScrollSettleDelayMs = 160;

export function createCollectionCarouselInputController({
  collectionCarousel,
  collectionViewport,
  getAutoScrollPosition,
  setAutoScrollPosition,
  pauseCarousel,
  resumeCarousel,
  normalizeScrollPosition,
  queueFocusSync,
  onNativeScrollSettled,
}) {
  let activePointerId = null;
  let nativeScrollPending = false;
  let nativeScrollSettleTimer = 0;

  function clearNativeScrollSettleTimer() {
    if (nativeScrollSettleTimer) {
      window.clearTimeout(nativeScrollSettleTimer);
      nativeScrollSettleTimer = 0;
    }
  }

  function finishNativeScroll() {
    nativeScrollSettleTimer = 0;
    if (activePointerId !== null) {
      return;
    }

    nativeScrollPending = false;
    delete collectionCarousel.dataset.collectionTouching;
    onNativeScrollSettled(normalizeScrollPosition(collectionViewport.scrollLeft));
    queueFocusSync();
    resumeCarousel();
  }

  function scheduleNativeScrollSettle() {
    if (!nativeScrollPending) {
      resumeCarousel();
      return;
    }

    clearNativeScrollSettleTimer();
    nativeScrollSettleTimer = window.setTimeout(finishNativeScroll, nativeScrollSettleDelayMs);
  }

  function handlePointerDown(event) {
    pauseCarousel();
    activePointerId = event.pointerId;

    if (event.pointerType !== "touch" || !(event.target instanceof Node) || !collectionViewport.contains(event.target)) {
      return;
    }

    clearNativeScrollSettleTimer();
    nativeScrollPending = true;
    setAutoScrollPosition(collectionViewport.scrollLeft);
    collectionCarousel.dataset.collectionTouching = "true";
  }

  function handlePointerEnd(event) {
    if (activePointerId === null || event.pointerId !== activePointerId) {
      return;
    }

    activePointerId = null;
    if (nativeScrollPending) {
      scheduleNativeScrollSettle();
      return;
    }

    resumeCarousel();
  }

  function handleViewportScroll() {
    const actualScrollLeft = collectionViewport.scrollLeft;
    if (nativeScrollPending) {
      setAutoScrollPosition(actualScrollLeft);
      scheduleNativeScrollSettle();
    } else {
      const autoScrollPosition = getAutoScrollPosition();
      if (autoScrollPosition === null || Math.abs(actualScrollLeft - autoScrollPosition) > 1.25) {
        setAutoScrollPosition(actualScrollLeft);
      }
    }

    queueFocusSync();
  }

  function handleViewportScrollEnd() {
    if (nativeScrollPending && activePointerId === null) {
      clearNativeScrollSettleTimer();
      finishNativeScroll();
    }
  }

  return {
    isNativeScrollPending: () => nativeScrollPending,
    handlePointerDown,
    handlePointerEnd,
    handleViewportScroll,
    handleViewportScrollEnd,
    destroy() {
      clearNativeScrollSettleTimer();
      delete collectionCarousel.dataset.collectionTouching;
    },
  };
}
