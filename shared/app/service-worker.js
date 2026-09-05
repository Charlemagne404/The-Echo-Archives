export function initializeServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  if (document.body.classList.contains("maintainer-page") || document.body.classList.contains("maintainer-import-page") || document.body.classList.contains("maintainer-collection-page")) {
    return;
  }

  const { protocol, hostname } = window.location;
  const isSecureContext = protocol === "https:" || hostname === "localhost" || hostname === "127.0.0.1";
  if (!isSecureContext) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js")
      .then(() => warmVisitedPageCache())
      .catch(() => {
        // The archive should stay fully usable without service worker registration.
      });
  });
}

async function warmVisitedPageCache() {
  await navigator.serviceWorker.ready;
  const controller = await waitForServiceWorkerController();
  if (!controller) {
    return;
  }

  const urls = new Set([window.location.href]);
  const dataUrls = [
    "/data/archive-stats.json",
    ["/data/search-index.json", document.body?.dataset.searchIndexVersion],
    ["/data/collections.json", document.body?.dataset.collectionsVersion],
    ["/data/shows.json", document.body?.dataset.showsVersion],
  ];
  dataUrls.forEach((entry) => {
    if (typeof entry === "string") {
      urls.add(entry);
      return;
    }

    const [pathname, version] = entry;
    if (version) {
      urls.add(`${pathname}?v=${encodeURIComponent(version)}`);
    }
  });
  performance.getEntriesByType("resource").forEach((entry) => {
    try {
      const url = new URL(entry.name, window.location.href);
      if (url.origin === window.location.origin && !url.pathname.startsWith("/api/")) {
        urls.add(url.href);
      }
    } catch (_error) {
      // Ignore malformed third-party performance entries.
    }
  });

  await new Promise((resolve) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(resolve, 8_000);
    channel.port1.addEventListener("message", () => {
      window.clearTimeout(timeout);
      resolve();
    }, { once: true });
    channel.port1.start();
    controller.postMessage(
      { type: "CACHE_VISITED_RESOURCES", urls: [...urls] },
      [channel.port2],
    );
  });
  document.body.dataset.offlineReady = "true";
}

function waitForServiceWorkerController() {
  if (navigator.serviceWorker.controller) {
    return Promise.resolve(navigator.serviceWorker.controller);
  }

  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => resolve(null), 8_000);
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.clearTimeout(timeout);
      resolve(navigator.serviceWorker.controller);
    }, { once: true });
  });
}
