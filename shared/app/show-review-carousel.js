import { ensureCommunityProfile, fetchCommunityConfig } from "./community/api.js";
import { renderListenerReviewCard } from "./render-show/sections.js";

function getVisibleDotIndexes(totalSlides, currentIndex) {
  if (totalSlides <= 7) return Array.from({ length: totalSlides }, (_unused, index) => index);
  const indexes = new Set([0, totalSlides - 1]);
  for (let index = Math.max(1, currentIndex - 2); index <= Math.min(totalSlides - 2, currentIndex + 2); index += 1) indexes.add(index);
  return [...indexes].sort((left, right) => left - right);
}

function renderDots(totalSlides, currentIndex) {
  const indexes = getVisibleDotIndexes(totalSlides, currentIndex);
  return indexes.map((index, position) => {
    const priorIndex = indexes[position - 1];
    const ellipsis = position > 0 && index - priorIndex > 1 ? '<span class="detail-review-carousel-ellipsis" aria-hidden="true">…</span>' : "";
    return `${ellipsis}<button type="button" class="detail-review-carousel-dot${index === currentIndex ? " is-active" : ""}" data-review-carousel-dot="${index}" aria-label="Show review ${index + 1} of ${totalSlides}" aria-current="${index === currentIndex ? "true" : "false"}"></button>`;
  }).join("");
}

async function fetchReviewPage(showId, page) {
  const response = await fetch(`/api/reviews/shows/${encodeURIComponent(showId)}?page=${page}&pageSize=1`);
  if (!response.ok) throw new Error(`Review page failed with ${response.status}`);
  return response.json();
}

async function updateHelpful(reviewId, helpful) {
  await ensureCommunityProfile();
  const response = await fetch(`/api/reviews/${encodeURIComponent(reviewId)}/helpful`, {
    method: helpful ? "PUT" : "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Helpful vote failed with ${response.status}`);
  return payload;
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
}

function waitForMotion(durationMs) {
  return new Promise((resolve) => window.setTimeout(resolve, durationMs));
}

function initializeCarousel(carousel) {
  const showId = carousel.dataset.showId || "";
  if (!showId) return;
  const slide = carousel.querySelector("[data-review-carousel-slide]");
  const viewport = carousel.querySelector("[data-review-carousel-viewport]");
  const previous = carousel.querySelector("[data-review-carousel-previous]");
  const next = carousel.querySelector("[data-review-carousel-next]");
  const dots = carousel.querySelector("[data-review-carousel-dots]");
  const status = carousel.querySelector("[data-review-carousel-status]");
  if (!(slide instanceof HTMLElement) || !(viewport instanceof HTMLElement) || !(previous instanceof HTMLButtonElement) || !(next instanceof HTMLButtonElement) || !(dots instanceof HTMLElement) || !(status instanceof HTMLElement)) return;

  const hasArchive = carousel.dataset.hasArchive === "true";
  const archiveMarkup = hasArchive ? slide.innerHTML : "";
  let listenerTotal = Number.parseInt(carousel.dataset.listenerTotal || "", 10) || 0;
  let currentIndex = Number.parseInt(carousel.dataset.currentIndex || "", 10) || 0;
  let writesEnabled = false;
  let pointerStartX = null;
  let busy = false;
  let statusMessage = "";

  const totalSlides = () => listenerTotal + (hasArchive ? 1 : 0);
  const listenerPageForIndex = (index) => index - (hasArchive ? 0 : -1);

  function setHelpfulControls() {
    carousel.querySelectorAll("[data-review-helpful]").forEach((control) => {
      if (control instanceof HTMLButtonElement) {
        control.disabled = !writesEnabled || busy;
        control.title = writesEnabled ? "Mark this listener review helpful" : "Helpful voting is unavailable on this deployment.";
      }
    });
  }

  function renderNavigation() {
    const total = totalSlides();
    previous.disabled = busy || currentIndex <= 0;
    next.disabled = busy || currentIndex >= total - 1;
    dots.innerHTML = renderDots(total, currentIndex);
    status.textContent = statusMessage || `Review ${currentIndex + 1} of ${total}`;
    carousel.dataset.currentIndex = String(currentIndex);
    viewport.setAttribute("aria-busy", String(busy));
    setHelpfulControls();
  }

  async function replaceSlide(markup, direction) {
    if (prefersReducedMotion()) {
      slide.innerHTML = markup;
      return;
    }

    const height = Math.ceil(slide.getBoundingClientRect().height);
    if (height > 0) {
      viewport.style.minHeight = `${height}px`;
    }
    slide.dataset.transitionDirection = direction;
    slide.classList.add("is-review-slide-leaving");
    await waitForMotion(70);
    slide.innerHTML = markup;
    slide.classList.remove("is-review-slide-leaving");
    slide.classList.add("is-review-slide-entering");
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    slide.classList.add("is-review-slide-entering-active");
    await waitForMotion(150);
    slide.classList.remove("is-review-slide-entering", "is-review-slide-entering-active");
    slide.removeAttribute("data-transition-direction");
    viewport.style.minHeight = "";
  }

  async function renderSlide(index) {
    if (index < 0 || index >= totalSlides() || index === currentIndex || busy) return;
    busy = true;
    statusMessage = "";
    renderNavigation();
    try {
      let nextMarkup = "";
      if (hasArchive && index === 0) {
        nextMarkup = archiveMarkup;
      } else {
        const page = listenerPageForIndex(index);
        const payload = await fetchReviewPage(showId, page);
        listenerTotal = Number(payload?.pagination?.totalReviews || listenerTotal);
        const review = Array.isArray(payload?.reviews) ? payload.reviews[0] : null;
        if (!review) throw new Error("That review is no longer available.");
        nextMarkup = renderListenerReviewCard(review);
      }
      await replaceSlide(nextMarkup, index > currentIndex ? "forward" : "backward");
      currentIndex = index;
      statusMessage = "";
    } catch (error) {
      statusMessage = error instanceof Error ? `${error.message} Try another review.` : "Review could not load. Try again.";
    } finally {
      busy = false;
      renderNavigation();
    }
  }

  carousel.addEventListener("click", async (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest("[data-review-carousel-previous]")) {
      await renderSlide(currentIndex - 1);
      return;
    }
    if (target.closest("[data-review-carousel-next]")) {
      await renderSlide(currentIndex + 1);
      return;
    }
    const dot = target.closest("[data-review-carousel-dot]");
    if (dot) {
      await renderSlide(Number.parseInt(dot.getAttribute("data-review-carousel-dot") || "", 10));
      return;
    }
    const helpful = target.closest("[data-review-helpful]");
    if (!(helpful instanceof HTMLButtonElement) || !writesEnabled || busy) return;
    const reviewId = helpful.dataset.reviewHelpful || "";
    if (!reviewId) return;
    busy = true;
    setHelpfulControls();
    try {
      const result = await updateHelpful(reviewId, helpful.getAttribute("aria-pressed") !== "true");
      helpful.classList.toggle("is-active", Boolean(result.viewerMarkedHelpful));
      helpful.setAttribute("aria-pressed", String(Boolean(result.viewerMarkedHelpful)));
      const count = helpful.querySelector("[data-review-helpful-count]");
      if (count) count.textContent = String(result.helpfulCount || 0);
    } catch (error) {
      statusMessage = error instanceof Error ? error.message : "Helpful vote could not be saved.";
    } finally {
      busy = false;
      renderNavigation();
    }
  });

  viewport.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      void renderSlide(currentIndex - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      void renderSlide(currentIndex + 1);
    }
  });
  viewport.addEventListener("pointerdown", (event) => { pointerStartX = event.clientX; });
  viewport.addEventListener("pointerup", (event) => {
    if (pointerStartX === null) return;
    const distance = event.clientX - pointerStartX;
    pointerStartX = null;
    if (Math.abs(distance) >= 44) void renderSlide(distance < 0 ? currentIndex + 1 : currentIndex - 1);
  });
  viewport.addEventListener("pointercancel", () => { pointerStartX = null; });

  void (async () => {
    try {
      const config = await fetchCommunityConfig();
      writesEnabled = Boolean(config.ratings?.writeEnabled);
    } catch (_error) {
      writesEnabled = false;
    } finally {
      renderNavigation();
    }
  })();
  renderNavigation();
}

export function initializeReviewCarousels(root = document) {
  root.querySelectorAll?.("[data-review-carousel]").forEach(initializeCarousel);
}
