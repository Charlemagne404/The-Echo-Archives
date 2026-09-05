const HORIZONTAL_SCROLL_SELECTOR = [
  ".site-mobile-primary-nav",
  ".home-hero-actions",
  ".quick-filters",
].join(", ");
const SCROLL_EPSILON_PX = 2;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function initializeHorizontalScrollAffordances(root = document) {
  const scrollers = Array.from(root.querySelectorAll(HORIZONTAL_SCROLL_SELECTOR));
  return scrollers.map((scroller) => createHorizontalScrollAffordance(scroller));
}

export function createHorizontalScrollAffordance(scroller) {
  if (!(scroller instanceof HTMLElement)) {
    return () => {};
  }

  const cueHost = scroller.parentElement || scroller;
  const hadCueHostClass = cueHost.classList.contains("horizontal-scroll-cue-host");
  const cue = document.createElement("span");
  cue.className = "horizontal-scroll-cue";
  cue.setAttribute("aria-hidden", "true");
  cue.innerHTML = `
    <span class="horizontal-scroll-cue-track">
      <span class="horizontal-scroll-cue-thumb"></span>
    </span>
    <span class="horizontal-scroll-cue-arrow">›</span>
  `;
  cueHost.classList.add("horizontal-scroll-cue-host");
  cueHost.appendChild(cue);

  let syncFrame = 0;

  const sync = () => {
    syncFrame = 0;
    const scrollableWidth = Math.max(scroller.scrollWidth - scroller.clientWidth, 0);
    const isScrollable = scrollableWidth > SCROLL_EPSILON_PX;
    scroller.dataset.horizontalScrollable = String(isScrollable);
    cue.hidden = !isScrollable;

    if (!isScrollable) {
      return;
    }

    const progress = clamp(scroller.scrollLeft / scrollableWidth, 0, 1);
    const visibleRatio = clamp(scroller.clientWidth / Math.max(scroller.scrollWidth, 1), 0.24, 0.58);
    const travelRatio = 1 - visibleRatio;
    cue.style.setProperty("--horizontal-scroll-thumb-size", `${visibleRatio * 100}%`);
    cue.style.setProperty("--horizontal-scroll-thumb-offset", `${progress * travelRatio * 100}%`);
    scroller.dataset.horizontalScrollStart = String(progress <= 0.01);
    scroller.dataset.horizontalScrollEnd = String(progress >= 0.99);
  };

  const queueSync = () => {
    if (syncFrame) {
      return;
    }

    syncFrame = window.requestAnimationFrame(sync);
  };

  const resizeObserver = "ResizeObserver" in window
    ? new ResizeObserver(queueSync)
    : null;
  const mutationObserver = "MutationObserver" in window
    ? new MutationObserver(queueSync)
    : null;

  scroller.addEventListener("scroll", queueSync, { passive: true });
  resizeObserver?.observe(scroller);
  mutationObserver?.observe(scroller, { childList: true, subtree: true });
  queueSync();

  return () => {
    scroller.removeEventListener("scroll", queueSync);
    resizeObserver?.disconnect();
    mutationObserver?.disconnect();
    if (syncFrame) {
      window.cancelAnimationFrame(syncFrame);
    }
    cue.remove();
    if (!hadCueHostClass) {
      cueHost.classList.remove("horizontal-scroll-cue-host");
    }
    delete scroller.dataset.horizontalScrollable;
    delete scroller.dataset.horizontalScrollStart;
    delete scroller.dataset.horizontalScrollEnd;
  };
}
