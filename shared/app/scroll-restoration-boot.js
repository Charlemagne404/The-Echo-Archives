(() => {
  window.__echoScrollBootInstalled = true;
  const isHomePage = window.location.pathname === "/" || window.location.pathname === "/index.html";
  let homeRailsPlaced = !isHomePage;

  const placePrerenderedHomeRails = () => {
    if (homeRailsPlaced) {
      return;
    }

    const archiveGrid = document.getElementById("podcast-grid");
    const collectionsSection = document.getElementById("collections");
    const favoriteRoutesSection = document.getElementById("favoriteRoutes");
    if (
      !(archiveGrid instanceof HTMLElement) ||
      archiveGrid.dataset.homePrerendered !== "true" ||
      !(collectionsSection instanceof HTMLElement) ||
      !(favoriteRoutesSection instanceof HTMLElement)
    ) {
      homeRailsPlaced = true;
      return;
    }

    const archiveCardShells = Array.from(archiveGrid.children).filter(
      (node) => node instanceof HTMLElement && node.classList.contains("podcast-card-shell"),
    );
    if (archiveCardShells.length === 0) {
      homeRailsPlaced = true;
      return;
    }

    const gridRowSize = window.matchMedia("(max-width: 1180px)").matches ? 2 : 6;
    const collectionInsertIndex = collectionsSection.hidden ? -1 : Math.min(archiveCardShells.length, gridRowSize * 2);
    const favoriteRoutesInsertIndex = favoriteRoutesSection.hidden
      ? -1
      : Math.min(
          archiveCardShells.length,
          (collectionInsertIndex >= 0 ? collectionInsertIndex : 0) + gridRowSize * 2,
        );
    const orderedNodes = [];

    archiveCardShells.forEach((shell, index) => {
      if (index === collectionInsertIndex) {
        orderedNodes.push(collectionsSection);
      }
      if (index === favoriteRoutesInsertIndex) {
        orderedNodes.push(favoriteRoutesSection);
      }
      orderedNodes.push(shell);
    });

    if (collectionInsertIndex >= archiveCardShells.length && collectionInsertIndex >= 0) {
      orderedNodes.push(collectionsSection);
    }
    if (favoriteRoutesInsertIndex >= archiveCardShells.length && favoriteRoutesInsertIndex >= 0) {
      orderedNodes.push(favoriteRoutesSection);
    }

    const currentNodes = Array.from(archiveGrid.children);
    if (currentNodes.length !== orderedNodes.length || !currentNodes.every((node, index) => node === orderedNodes[index])) {
      archiveGrid.replaceChildren(...orderedNodes);
    }
    homeRailsPlaced = true;
  };

  if (isHomePage && document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", placePrerenderedHomeRails, { once: true });
  } else {
    placePrerenderedHomeRails();
  }

  const storageKey = `echo-scroll:${window.location.pathname}${window.location.search}${window.location.hash}`;

  let saved;
  try {
    saved = JSON.parse(window.sessionStorage.getItem(storageKey) || "null");
  } catch (_error) {
    saved = null;
  }

  if (!Number.isFinite(saved?.y)) {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "auto";
    }
    return;
  }

  if ("scrollRestoration" in window.history) {
    // The boot script owns restoration for this route. Native history
    // restoration would race it while the page is still being hydrated.
    window.history.scrollRestoration = "manual";
  }

  // Do not let late card/image layout changes move the viewport after the
  // saved position has been applied. This stays in effect for the lifetime
  // of the page, which also covers client-side hydration after load.
  document.documentElement.style.setProperty("overflow-anchor", "none");

  let finished = false;
  let pageLoaded = document.readyState === "complete";
  const cancel = () => {
    if (finished) {
      return;
    }

    finished = true;
    window.__echoScrollBootState = "cancelled";
    cleanup();
  };
  const cleanup = () => {
    ["pointerdown", "wheel", "touchstart", "keydown"].forEach((eventName) => {
      window.removeEventListener(eventName, cancel);
    });
    window.removeEventListener("load", handleLoad);
  };
  const finish = () => {
    if (finished) {
      return;
    }

    const maxScrollY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const targetY = Math.min(saved.y, maxScrollY);
    window.scrollTo({
      top: targetY,
      left: Number.isFinite(saved.x) ? saved.x : 0,
      behavior: "auto",
    });
    finished = true;
    window.__echoScrollBootState = "restored";
    cleanup();
  };
  const tryRestore = () => {
    if (finished) {
      return;
    }

    const maxScrollY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    if (homeRailsPlaced && (maxScrollY >= saved.y || pageLoaded)) {
      finish();
      return;
    }

    window.requestAnimationFrame(tryRestore);
  };

  ["pointerdown", "wheel", "touchstart", "keydown"].forEach((eventName) => {
    window.addEventListener(eventName, cancel, { passive: true });
  });
  const handleLoad = () => {
    pageLoaded = true;
    placePrerenderedHomeRails();
    tryRestore();
  };
  if (!pageLoaded) {
    window.addEventListener("load", handleLoad, { once: true });
  }
  window.requestAnimationFrame(tryRestore);
})();
