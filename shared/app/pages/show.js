import { DEFAULT_SOCIAL_IMAGE, socialPreview } from "../constants.js";
import { buildShowMap, fetchJson, loadCollections, loadShows, normalizeShowRecord } from "../data.js";
import { initializeDetailRatingPage, syncCommunityCardBadges } from "../community.js";
import { initializeManagedImages } from "../images.js";
import { createShowPageMarkup } from "../render-show.js";
import { initializeReviewCarousels } from "../show-review-carousel.js";
import { initializeShowDetailMotion } from "../show-detail-motion.js";
import { renderRouteErrorSurface } from "../route-error.js";
import { bindShareButton } from "../share.js";
import { buildShowStructuredData } from "../structured-data.js";
import { buildShowSeoDescription, buildShowSeoTitle } from "../seo.js";
import { createShowHref, getShowIdFromLocation } from "../urls.js";
import { updateDocumentMetadata } from "../utils.js";

export async function initializeShowPage() {
  const showRoot = document.getElementById("showRoot");

  if (!showRoot) {
    return;
  }

  const hasServerRenderedContent = showRoot.children.length > 0;
  const bootstrapShow = hasServerRenderedContent ? readShowBootstrap() : null;
  if (bootstrapShow) {
    applyShowMetadata(bootstrapShow);
    await hydrateShowPage(showRoot, bootstrapShow);
    return;
  }

  if (!hasServerRenderedContent) {
    showRoot.innerHTML = createShowLoadingMarkup();
  }

  const [shows, collections] = await loadShowPageData(showRoot);
  if (!shows || !collections) return;
  const showMap = buildShowMap(shows);

  const showId = getShowIdFromLocation();
  const show = showMap.get(showId);

  if (!show) {
    renderMissingShowPage(showRoot);
    return;
  }

  applyShowMetadata(show);

  const reviewData = await loadPublicListenerReviews(show.id);
  showRoot.innerHTML = createShowPageMarkup(show, showMap, collections, reviewData);
  await hydrateShowPage(showRoot, show);
}

async function loadPublicListenerReviews(showId) {
  try {
    const payload = await fetchJson(`/api/reviews/shows/${encodeURIComponent(showId)}`);
    return payload && typeof payload === "object" ? payload : { reviews: [], pagination: { page: 1, totalReviews: 0 }, scoreSummary: {} };
  } catch (_error) {
    return { reviews: [], pagination: { page: 1, totalReviews: 0 }, scoreSummary: {} };
  }
}

function readShowBootstrap() {
  const node = document.getElementById("showBootstrap");
  if (!(node instanceof HTMLScriptElement) || node.type !== "application/json") {
    return null;
  }

  try {
    const show = normalizeShowRecord(JSON.parse(node.textContent || "null"));
    const requestedId = getShowIdFromLocation();
    if (!show.id || show.id !== requestedId || show.status !== "published") {
      return null;
    }
    return show;
  } catch (_error) {
    return null;
  }
}

function applyShowMetadata(show) {
  document.body.style.setProperty("--detail-accent", show.accent?.hex || "#e54838");
  document.body.style.setProperty("--detail-accent-rgb", show.accent?.rgb || "229, 72, 56");
  updateDocumentMetadata({
    title: buildShowSeoTitle(show),
    description: buildShowSeoDescription(show),
    path: createShowHref(show.id),
    image: socialPreview("show", show).path,
    imageAlt: socialPreview("show", show).alt,
    structuredData: buildShowStructuredData(show),
  });
}

async function loadShowPageData(showRoot) {
  try {
    return await Promise.all([loadShows(), loadCollections()]);
  } catch (_error) {
    renderRouteErrorSurface(showRoot, {
      title: "Show data did not load",
      explanation: "This show page needs the public catalog before ratings, links, and related routes can be shown.",
      primaryAction: { href: "/", label: "Back to archive" },
      secondaryAction: { href: "/collections", label: "Browse collections" },
      onRetry: () => window.location.reload(),
    });
    return [null, null];
  }
}

async function hydrateShowPage(showRoot, show) {
  initializeManagedImages(showRoot);
  const moreFrom = showRoot.querySelector(".detail-more-from");
  if (moreFrom) {
    const cards = Array.from(moreFrom.querySelectorAll("[data-podcast-id]")).map((node) => ({ id: node.dataset.podcastId }));
    void syncCommunityCardBadges(moreFrom, cards);
  }
  const shareButton = showRoot.querySelector("[data-share-action]");
  if (shareButton instanceof HTMLButtonElement) {
    bindShareButton(shareButton, {
      title: `${show.title} - The Echo Archives`,
      text: show.description,
      url: document.querySelector('link[rel="canonical"]')?.href || window.location.href,
    });
  }
  const detailRoot = showRoot.querySelector(".podcast-detail");
  if (detailRoot) {
    detailRoot.dataset.podcastId = show.id;
    detailRoot.dataset.podcastTitle = show.title;
    await initializeDetailRatingPage(show);
  }
  initializeMobileTextDisclosures(showRoot);
  initializeReviewCarousels(showRoot);
  initializeMobileBackToTop();
  initializeShowDetailMotion(showRoot);
}

function initializeMobileTextDisclosures(showRoot) {
  if (showRoot.dataset.mobileTextDisclosuresInitialized === "true") return;
  showRoot.dataset.mobileTextDisclosuresInitialized = "true";
  const mobileQuery = window.matchMedia("(max-width: 640px)");

  function syncDisclosure(wrapper) {
    const content = wrapper.querySelector("[data-mobile-expandable-content]");
    const button = wrapper.querySelector("[data-mobile-expand-toggle]");
    if (!(content instanceof HTMLElement) || !(button instanceof HTMLButtonElement)) return;
    const threshold = Number.parseInt(wrapper.dataset.mobileExpandThreshold || "0", 10) || 0;
    const shouldCollapse = mobileQuery.matches && content.textContent.trim().length >= threshold;
    const collapsed = shouldCollapse;
    wrapper.dataset.mobileExpandReady = "true";
    wrapper.dataset.mobileExpandState = collapsed ? "collapsed" : "expanded";
    button.hidden = !shouldCollapse;
    button.setAttribute("aria-expanded", String(!collapsed));
    button.textContent = collapsed
      ? wrapper.dataset.mobileExpandLabel || "Read more"
      : wrapper.dataset.mobileCollapseLabel || "Show less";
    if (wrapper.dataset.mobileExpandMode === "disclosure") {
      content.setAttribute("aria-hidden", String(collapsed));
    } else {
      content.removeAttribute("aria-hidden");
    }
  }

  function syncAllDisclosures() {
    showRoot.querySelectorAll("[data-mobile-expandable]").forEach(syncDisclosure);
  }

  showRoot.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-mobile-expand-toggle]") : null;
    if (!(target instanceof HTMLButtonElement)) return;
    const wrapper = target.closest("[data-mobile-expandable]");
    if (!(wrapper instanceof HTMLElement) || !mobileQuery.matches) return;
    const content = wrapper.querySelector("[data-mobile-expandable-content]");
    if (!(content instanceof HTMLElement)) return;
    const expanded = wrapper.dataset.mobileExpandState !== "expanded";
    wrapper.dataset.mobileExpandState = expanded ? "expanded" : "collapsed";
    target.setAttribute("aria-expanded", String(expanded));
    target.textContent = expanded
      ? wrapper.dataset.mobileCollapseLabel || "Show less"
      : wrapper.dataset.mobileExpandLabel || "Read more";
    if (wrapper.dataset.mobileExpandMode === "disclosure") {
      content.setAttribute("aria-hidden", String(!expanded));
    }
  });

  mobileQuery.addEventListener("change", syncAllDisclosures);
  syncAllDisclosures();
}

function initializeMobileBackToTop() {
  const backToTop = document.querySelector(".detail-page #backToTop");
  if (!(backToTop instanceof HTMLElement) || backToTop.dataset.mobileScrollBehaviorInitialized === "true") return;
  backToTop.dataset.mobileScrollBehaviorInitialized = "true";
  const mobileQuery = window.matchMedia("(max-width: 640px)");
  let previousY = window.scrollY;
  let hideTimer = 0;

  function hideButton() {
    backToTop.classList.add("is-mobile-reading-hidden");
  }

  function revealBriefly() {
    backToTop.classList.remove("is-mobile-reading-hidden");
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      hideButton();
      hideTimer = 0;
    }, 1800);
  }

  function syncScrollDirection() {
    const currentY = window.scrollY;
    if (!mobileQuery.matches || currentY <= 420) {
      window.clearTimeout(hideTimer);
      hideTimer = 0;
      backToTop.classList.remove("is-mobile-reading-hidden");
    } else if (currentY < previousY - 2) {
      revealBriefly();
    } else if (currentY > previousY + 2) {
      window.clearTimeout(hideTimer);
      hideTimer = 0;
      hideButton();
    } else if (!hideTimer) {
      hideButton();
    }
    previousY = currentY;
  }

  mobileQuery.addEventListener("change", syncScrollDirection);
  window.addEventListener("scroll", syncScrollDirection, { passive: true });
  syncScrollDirection();
}

function renderMissingShowPage(showRoot) {
  updateDocumentMetadata({
    title: "Show not found - The Echo Archives",
    description: "The requested Echo Archives show page could not be found.",
    path: window.location.pathname,
    image: DEFAULT_SOCIAL_IMAGE,
  });
  showRoot.innerHTML = `
    <section class="detail-main podcast-detail">
      <section class="detail-section detail-empty-state">
        <div class="detail-section-header">
          <div>
            <h1>Show not found</h1>
            <p>The requested archive entry is missing or has not been published yet.</p>
          </div>
        </div>
        <a class="detail-primary-action" href="/#browse">Back to the archive</a>
      </section>
    </section>
  `;
}

function createShowLoadingMarkup() {
  return `
    <section class="detail-main podcast-detail detail-loading-shell" aria-hidden="true">
      <section class="detail-hero-shell">
        <div class="detail-hero-panel">
          <div class="detail-hero-grid">
            <div class="detail-hero-copy">
              <span class="archive-skeleton-block archive-skeleton-chip"></span>
              <span class="archive-skeleton-block archive-skeleton-heading"></span>
              <span class="archive-skeleton-block archive-skeleton-line"></span>
              <span class="archive-skeleton-block archive-skeleton-line archive-skeleton-line-short"></span>
            </div>
            <div class="detail-cover-column">
              <div class="archive-skeleton-block detail-skeleton-cover"></div>
            </div>
          </div>
        </div>
      </section>
      <div class="detail-content-layout">
        <div class="detail-main-stack">
          <section class="detail-section detail-loading-card">
            <span class="archive-skeleton-block archive-skeleton-title"></span>
            <span class="archive-skeleton-block archive-skeleton-line"></span>
            <span class="archive-skeleton-block archive-skeleton-line"></span>
            <span class="archive-skeleton-block archive-skeleton-line archive-skeleton-line-short"></span>
          </section>
        </div>
        <aside class="detail-side-rail">
          <section class="detail-side-card detail-loading-card">
            <span class="archive-skeleton-block archive-skeleton-title"></span>
            <span class="archive-skeleton-block archive-skeleton-line"></span>
            <span class="archive-skeleton-block archive-skeleton-line archive-skeleton-line-short"></span>
          </section>
        </aside>
      </div>
    </section>
  `;
}
