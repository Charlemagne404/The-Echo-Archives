function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
}

function restartArrivalMotion(target) {
  if (prefersReducedMotion()) {
    return;
  }

  target.classList.remove("is-detail-anchor-arrived");
  void target.offsetWidth;
  target.classList.add("is-detail-anchor-arrived");
  window.setTimeout(() => target.classList.remove("is-detail-anchor-arrived"), 680);
}

function initializeDetailAnchorNavigation(root) {
  root.querySelectorAll("[data-detail-anchor]").forEach((link) => {
    if (!(link instanceof HTMLAnchorElement) || link.dataset.detailAnchorBound === "true") {
      return;
    }

    link.dataset.detailAnchorBound = "true";
    link.addEventListener("click", (event) => {
      const href = link.getAttribute("href") || "";
      if (!href.startsWith("#")) {
        return;
      }

      const target = document.getElementById(href.slice(1));
      if (!(target instanceof HTMLElement)) {
        return;
      }

      event.preventDefault();
      window.history.pushState(null, "", href);
      target.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
      window.setTimeout(() => {
        target.focus({ preventScroll: true });
        restartArrivalMotion(target);
      }, prefersReducedMotion() ? 0 : 260);
    });
  });
}

function initializeRouteOverflowMotion(root) {
  root.querySelectorAll(".detail-route-overflow").forEach((details) => {
    if (!(details instanceof HTMLDetailsElement) || details.dataset.routeMotionBound === "true") {
      return;
    }

    details.dataset.routeMotionBound = "true";
    details.addEventListener("toggle", () => {
      if (!details.open || prefersReducedMotion()) {
        return;
      }

      details.classList.remove("is-route-overflow-revealing");
      void details.offsetWidth;
      details.classList.add("is-route-overflow-revealing");
      window.setTimeout(() => details.classList.remove("is-route-overflow-revealing"), 240);
    });
  });
}

export function initializeShowDetailMotion(root = document) {
  initializeDetailAnchorNavigation(root);
  initializeRouteOverflowMotion(root);
  if (root instanceof HTMLElement) {
    root.dataset.detailMotionReady = "true";
  }
}
