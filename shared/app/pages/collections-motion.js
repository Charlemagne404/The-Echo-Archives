const COLLECTIONS_MOTION_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const SUMMARY_UPDATE_DURATION_MS = 190;
const SURFACE_OPEN_DURATION_MS = 220;
const SURFACE_CLOSE_DURATION_MS = 170;

export function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getMotionDuration(durationMs) {
  return prefersReducedMotion() ? 1 : durationMs;
}

function animateNode(node, keyframes, durationMs, { fill = "both" } = {}) {
  if (!(node instanceof HTMLElement) || typeof node.animate !== "function" || durationMs <= 0) {
    return null;
  }

  return node.animate(keyframes, {
    duration: getMotionDuration(durationMs),
    easing: COLLECTIONS_MOTION_EASING,
    fill,
  });
}

function cleanupAnimation(node, key, animation) {
  animation?.finished
    ?.then(() => {
      if (node[key] !== animation) {
        return;
      }

      node[key] = null;
      animation.cancel();
    })
    .catch(() => {});
}

function clearAnimation(node, key) {
  node[key]?.cancel?.();
  node[key] = null;
}

function clearSurfaceMotion(node) {
  if (!(node instanceof HTMLElement)) {
    return;
  }

  if (node.__collectionsMotionFrame) {
    window.cancelAnimationFrame(node.__collectionsMotionFrame);
    node.__collectionsMotionFrame = 0;
  }

  if (node.__collectionsMotionTimer) {
    window.clearTimeout(node.__collectionsMotionTimer);
    node.__collectionsMotionTimer = 0;
  }

  node.style.transition = "";
}

function cleanupSurfaceStyles(node) {
  if (!(node instanceof HTMLElement)) {
    return;
  }

  node.style.height = "";
  node.style.opacity = "";
  node.style.transform = "";
  node.style.overflow = "";
  node.style.transition = "";
}

export function restartAnimationClass(node, className, durationMs) {
  if (!(node instanceof HTMLElement)) {
    return;
  }

  const timerKey = `__${className}Timer`;
  if (node[timerKey]) {
    window.clearTimeout(node[timerKey]);
  }

  node.classList.remove(className);
  void node.offsetWidth;
  node.classList.add(className);
  node[timerKey] = window.setTimeout(() => {
    node.classList.remove(className);
    node[timerKey] = 0;
  }, getMotionDuration(durationMs));
}

export function syncCollectionsSummary(node, nextText, { skipAnimation = false } = {}) {
  if (!(node instanceof HTMLElement)) {
    return;
  }

  const text = String(nextText ?? "");
  if (node.textContent === text) {
    return;
  }

  node.textContent = text;
  clearAnimation(node, "__collectionsSummaryAnimation");

  if (skipAnimation || prefersReducedMotion()) {
    return;
  }

  node.__collectionsSummaryAnimation = animateNode(
    node,
    [
      { opacity: 0.55, transform: "translateY(7px)" },
      { opacity: 1, transform: "translateY(0)" },
    ],
    SUMMARY_UPDATE_DURATION_MS,
  );
  cleanupAnimation(node, "__collectionsSummaryAnimation", node.__collectionsSummaryAnimation);
}

export function syncCollectionsSurfaceVisibility(
  node,
  shouldShow,
  {
    openDurationMs = SURFACE_OPEN_DURATION_MS,
    closeDurationMs = SURFACE_CLOSE_DURATION_MS,
    enterOffsetY = 12,
  } = {},
) {
  if (!(node instanceof HTMLElement)) {
    return;
  }

  clearSurfaceMotion(node);
  if (prefersReducedMotion()) {
    cleanupSurfaceStyles(node);
    node.hidden = !shouldShow;
    node.dataset.collectionsSurfaceState = shouldShow ? "open" : "closed";
    return;
  }

  if (shouldShow) {
    if (!node.hidden && node.dataset.collectionsSurfaceState !== "closing") {
      cleanupSurfaceStyles(node);
      node.dataset.collectionsSurfaceState = "open";
      return;
    }

    node.hidden = false;
    node.dataset.collectionsSurfaceState = "opening";
    const targetHeight = node.scrollHeight;

    node.style.overflow = "hidden";
    node.style.height = "0px";
    node.style.opacity = "0";
    node.style.transform = `translateY(${enterOffsetY}px)`;

    node.__collectionsMotionFrame = window.requestAnimationFrame(() => {
      node.__collectionsMotionFrame = 0;
      node.style.transition = [
        `height ${getMotionDuration(openDurationMs)}ms ${COLLECTIONS_MOTION_EASING}`,
        `opacity ${getMotionDuration(openDurationMs)}ms ${COLLECTIONS_MOTION_EASING}`,
        `transform ${getMotionDuration(openDurationMs)}ms ${COLLECTIONS_MOTION_EASING}`,
      ].join(", ");
      node.style.height = `${targetHeight}px`;
      node.style.opacity = "1";
      node.style.transform = "translateY(0)";

      node.__collectionsMotionTimer = window.setTimeout(() => {
        node.__collectionsMotionTimer = 0;
        cleanupSurfaceStyles(node);
        node.dataset.collectionsSurfaceState = "open";
      }, getMotionDuration(openDurationMs));
    });
    return;
  }

  if (node.hidden) {
    node.dataset.collectionsSurfaceState = "closed";
    return;
  }

  const startHeight = node.getBoundingClientRect().height || node.scrollHeight;
  node.dataset.collectionsSurfaceState = "closing";
  node.style.overflow = "hidden";
  node.style.height = `${startHeight}px`;
  node.style.opacity = "1";
  node.style.transform = "translateY(0)";

  node.__collectionsMotionFrame = window.requestAnimationFrame(() => {
    node.__collectionsMotionFrame = 0;
    node.style.transition = [
      `height ${getMotionDuration(closeDurationMs)}ms ${COLLECTIONS_MOTION_EASING}`,
      `opacity ${getMotionDuration(closeDurationMs)}ms ${COLLECTIONS_MOTION_EASING}`,
      `transform ${getMotionDuration(closeDurationMs)}ms ${COLLECTIONS_MOTION_EASING}`,
    ].join(", ");
    node.style.height = "0px";
    node.style.opacity = "0";
    node.style.transform = `translateY(${enterOffsetY}px)`;

    node.__collectionsMotionTimer = window.setTimeout(() => {
      node.__collectionsMotionTimer = 0;
      node.hidden = true;
      cleanupSurfaceStyles(node);
      node.dataset.collectionsSurfaceState = "closed";
    }, getMotionDuration(closeDurationMs));
  });
}
