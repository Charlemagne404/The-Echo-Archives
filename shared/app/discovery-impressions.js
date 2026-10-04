import { trackDiscoveryEvents } from "./discovery-analytics.js";

export function initializeShowCardImpressions() {
  if (typeof IntersectionObserver !== "function" || typeof MutationObserver !== "function" || !document.body) return;

  const minimumVisibleRatio = 0.5;
  const visibleDurationMs = 600;
  const maximumBatchSize = 50;
  const seenCards = new Set();
  const observedAnchors = new WeakSet();
  const intersectingAnchors = new Set();
  const pendingTimers = new Map();
  let queuedEvents = [];
  let flushTimer = 0;

  const flush = () => {
    if (flushTimer) {
      window.clearTimeout(flushTimer);
      flushTimer = 0;
    }
    if (!queuedEvents.length) return;
    const batch = queuedEvents.splice(0, maximumBatchSize);
    trackDiscoveryEvents(batch);
    if (queuedEvents.length) flushTimer = window.setTimeout(flush, 0);
  };

  const scheduleFlush = () => {
    if (!flushTimer) flushTimer = window.setTimeout(flush, 250);
  };

  const trackVisibleAnchor = (anchor) => {
    if (!anchor.isConnected || !intersectingAnchors.has(anchor) || anchor.dataset.impressionTracked === "true") return;
    const showId = anchor.dataset.discoveryShowId || "";
    const surface = anchor.dataset.discoverySurface || "unknown_internal";
    if (!showId) return;
    const collectionId = anchor.dataset.discoveryCollectionId || "";
    const entityId = anchor.dataset.discoveryEntityId || "";
    const cardKey = [showId, surface, collectionId, entityId].join("\u0000");
    if (seenCards.has(cardKey)) return;
    seenCards.add(cardKey);
    anchor.dataset.impressionTracked = "true";
    const properties = {
      show_id: showId,
      discovery_surface: surface,
      browse_state: anchor.dataset.discoveryBrowseState || "unknown",
      result_position_bucket: anchor.dataset.discoveryResultPositionBucket || "unknown",
    };
    if (collectionId) properties.collection_id = collectionId;
    if (entityId) properties.entity_id = entityId;
    queuedEvents.push({ eventName: "Show Card Impression", properties });
    if (queuedEvents.length >= maximumBatchSize) flush();
    else scheduleFlush();
  };

  const scheduleImpressionCheck = (anchor, delayMs) => {
    if (pendingTimers.has(anchor)) return;
    const timer = window.setTimeout(() => {
      pendingTimers.delete(anchor);
      if (!anchor.isConnected || !intersectingAnchors.has(anchor) || anchor.dataset.impressionTracked === "true") return;
      const surface = anchor.dataset.discoverySurface || "unknown_internal";
      if (surface === "home_archive_grid" && document.body?.dataset.homePopularityReady === "false") return;
      trackVisibleAnchor(anchor);
    }, delayMs);
    pendingTimers.set(anchor, timer);
  };

  document.addEventListener("echo:home-popularity-ready", () => {
    if (document.body?.dataset.homePopularityReady !== "true") return;
    intersectingAnchors.forEach((anchor) => scheduleImpressionCheck(anchor, 0));
  });

  const intersectionObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const anchor = entry.target;
      const isVisible = document.visibilityState !== "hidden" &&
        entry.isIntersecting && entry.intersectionRatio >= minimumVisibleRatio;
      if (!isVisible) {
        intersectingAnchors.delete(anchor);
        const timer = pendingTimers.get(anchor);
        if (timer) window.clearTimeout(timer);
        pendingTimers.delete(anchor);
        continue;
      }

      intersectingAnchors.add(anchor);
      scheduleImpressionCheck(anchor, visibleDurationMs);
    }
  }, { threshold: [minimumVisibleRatio] });

  const observeAnchor = (anchor) => {
    if (!(anchor instanceof HTMLAnchorElement) || observedAnchors.has(anchor) || !anchor.dataset.discoveryShowId) return;
    observedAnchors.add(anchor);
    intersectionObserver.observe(anchor);
  };

  const observeSubtree = (root) => {
    if (!(root instanceof Element)) return;
    if (root.matches("a[data-discovery-show-id]")) observeAnchor(root);
    root.querySelectorAll("a[data-discovery-show-id]").forEach(observeAnchor);
  };

  observeSubtree(document.body);
  const mutationObserver = new MutationObserver((records) => {
    records.forEach((record) => record.addedNodes.forEach(observeSubtree));
  });
  mutationObserver.observe(document.body, { childList: true, subtree: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden") return;
    for (const [anchor, timer] of pendingTimers) {
      window.clearTimeout(timer);
      pendingTimers.delete(anchor);
    }
    intersectingAnchors.clear();
    flush();
  });
  window.addEventListener("pagehide", flush);
}
