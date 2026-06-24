const RESULTS_MOTION_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const SUMMARY_UPDATE_DURATION_MS = 190;
const SURFACE_OPEN_DURATION_MS = 240;
const SURFACE_CLOSE_DURATION_MS = 170;

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getMotionDuration(durationMs) {
  return prefersReducedMotion() ? 1 : durationMs;
}

function clearSurfaceMotion(node) {
  if (!(node instanceof HTMLElement)) {
    return;
  }

  if (node.__resultsMotionFrame) {
    window.cancelAnimationFrame(node.__resultsMotionFrame);
    node.__resultsMotionFrame = 0;
  }

  if (node.__resultsMotionTimer) {
    window.clearTimeout(node.__resultsMotionTimer);
    node.__resultsMotionTimer = 0;
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

export function syncResultsSummary(node, nextText, { skipAnimation = false } = {}) {
  if (!(node instanceof HTMLElement)) {
    return;
  }

  const text = String(nextText ?? "");
  if (node.textContent === text) {
    return;
  }

  node.textContent = text;
  node.__resultsSummaryAnimation?.cancel?.();
  node.__resultsSummaryAnimation = null;

  if (skipAnimation || prefersReducedMotion() || typeof node.animate !== "function") {
    return;
  }

  node.__resultsSummaryAnimation = node.animate(
    [
      { opacity: 0.55, transform: "translateY(7px)" },
      { opacity: 1, transform: "translateY(0)" },
    ],
    {
      duration: getMotionDuration(SUMMARY_UPDATE_DURATION_MS),
      easing: RESULTS_MOTION_EASING,
      fill: "both",
    },
  );

  node.__resultsSummaryAnimation.finished
    ?.then(() => {
      if (node.__resultsSummaryAnimation) {
        node.__resultsSummaryAnimation.cancel();
        node.__resultsSummaryAnimation = null;
      }
    })
    .catch(() => {});
}

export function syncResultsSurfaceVisibility(
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
    node.dataset.resultsSurfaceState = shouldShow ? "open" : "closed";
    return;
  }

  if (shouldShow) {
    if (!node.hidden && node.dataset.resultsSurfaceState !== "closing") {
      node.dataset.resultsSurfaceState = "open";
      return;
    }

    node.hidden = false;
    node.dataset.resultsSurfaceState = "opening";
    const targetHeight = node.scrollHeight;

    node.style.overflow = "hidden";
    node.style.height = "0px";
    node.style.opacity = "0";
    node.style.transform = `translateY(${enterOffsetY}px)`;

    node.__resultsMotionFrame = window.requestAnimationFrame(() => {
      node.__resultsMotionFrame = 0;
      node.style.transition = [
        `height ${getMotionDuration(openDurationMs)}ms ${RESULTS_MOTION_EASING}`,
        `opacity ${getMotionDuration(openDurationMs)}ms ${RESULTS_MOTION_EASING}`,
        `transform ${getMotionDuration(openDurationMs)}ms ${RESULTS_MOTION_EASING}`,
      ].join(", ");
      node.style.height = `${targetHeight}px`;
      node.style.opacity = "1";
      node.style.transform = "translateY(0)";

      node.__resultsMotionTimer = window.setTimeout(() => {
        node.__resultsMotionTimer = 0;
        cleanupSurfaceStyles(node);
        node.dataset.resultsSurfaceState = "open";
      }, getMotionDuration(openDurationMs));
    });
    return;
  }

  if (node.hidden) {
    node.dataset.resultsSurfaceState = "closed";
    return;
  }

  const startHeight = node.getBoundingClientRect().height || node.scrollHeight;
  node.dataset.resultsSurfaceState = "closing";
  node.style.overflow = "hidden";
  node.style.height = `${startHeight}px`;
  node.style.opacity = "1";
  node.style.transform = "translateY(0)";

  node.__resultsMotionFrame = window.requestAnimationFrame(() => {
    node.__resultsMotionFrame = 0;
    node.style.transition = [
      `height ${getMotionDuration(closeDurationMs)}ms ${RESULTS_MOTION_EASING}`,
      `opacity ${getMotionDuration(closeDurationMs)}ms ${RESULTS_MOTION_EASING}`,
      `transform ${getMotionDuration(closeDurationMs)}ms ${RESULTS_MOTION_EASING}`,
    ].join(", ");
    node.style.height = "0px";
    node.style.opacity = "0";
    node.style.transform = `translateY(${enterOffsetY}px)`;

    node.__resultsMotionTimer = window.setTimeout(() => {
      node.__resultsMotionTimer = 0;
      node.hidden = true;
      cleanupSurfaceStyles(node);
      node.dataset.resultsSurfaceState = "closed";
    }, getMotionDuration(closeDurationMs));
  });
}
