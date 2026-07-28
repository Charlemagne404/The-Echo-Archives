import { createSubmissionHref } from "../urls.js";
import {
  escapeHtml,
  formatRating,
  getSummaryDescriptor,
  normalizeArchiveRating,
  renderParagraphMarkup,
  toLabel,
} from "./utils.js";

const CATEGORY_ORDER = [
  ["voiceActing", "Voice acting"],
  ["soundDesign", "Sound design"],
  ["story", "Story"],
  ["characters", "Characters"],
  ["ads", "Ad experience"],
  ["length", "Episode length & pacing"],
];

export function renderOfficialSummarySection(show) {
  const summary = getSummaryDescriptor(show);
  if (!summary) return "";
  return `
    <section class="detail-section detail-official-summary-section">
      <div class="detail-section-header"><div><h2>${escapeHtml(summary.title)}</h2><p>${escapeHtml(summary.description)}</p></div></div>
      <article class="detail-summary detail-summary-official"><p>${escapeHtml(summary.text)}</p>${summary.sourceUrl ? `<a class="detail-official-source" href="${escapeHtml(summary.sourceUrl)}" target="_blank" rel="noreferrer">View source</a>` : ""}</article>
    </section>
  `;
}

export function renderOverviewSection(show) {
  return renderOfficialSummarySection(show);
}

function hasArchiveReviewContent(show) {
  return [show.archiveTake, show.spoilerFreeReview, show.thoughts].some((value) => String(value || "").trim());
}

function renderArchiveReviewCard(show) {
  if (!hasArchiveReviewContent(show)) return "";
  const isFullReview = show.reviewStatus === "full-review";
  const reviewCopy = renderParagraphMarkup(show.spoilerFreeReviewParagraphs, show.spoilerFreeReview);
  const reactionCopy = renderParagraphMarkup(show.thoughtsParagraphs, show.thoughts);
  const archiveRating = normalizeArchiveRating(show.finalRating);
  const rating = archiveRating === null ? "Unrated" : `${formatRating(archiveRating)}/10`;
  return `
    <article class="detail-authored-review detail-archive-review">
      <header class="detail-authored-review-header"><div><span class="detail-review-kind">${isFullReview ? "Archive review" : "Archive note"}</span><h3>The Echo Archives</h3></div><span class="detail-review-rating">${rating}</span></header>
      ${show.archiveTake ? `<p class="detail-review-verdict"><span>Archive verdict</span>${escapeHtml(show.archiveTake)}</p>` : ""}
      ${reviewCopy ? `<div class="detail-review-prose">${reviewCopy}</div>` : ""}
      ${reactionCopy ? `<div class="detail-review-reaction">${reactionCopy}</div>` : ""}
    </article>
  `;
}

export function renderIndexedArchiveNote(show) {
  if (show.reviewStatus === "full-review" || !hasArchiveReviewContent(show)) return "";
  const reviewCopy = renderParagraphMarkup(show.spoilerFreeReviewParagraphs, show.spoilerFreeReview);
  const reactionCopy = renderParagraphMarkup(show.thoughtsParagraphs, show.thoughts);
  const content = [
    show.archiveTake ? `<p>${escapeHtml(show.archiveTake)}</p>` : "",
    reviewCopy,
    reactionCopy,
  ].filter(Boolean).join("");
  return `
    <section class="detail-section detail-indexed-archive-note" id="archive-note" tabindex="-1" aria-labelledby="indexed-archive-note-title">
      <article class="detail-summary detail-archive-note-summary"><p class="detail-summary-kicker" id="indexed-archive-note-title">Archive note</p>${content}</article>
    </section>
  `;
}

export function renderListenerReviewCard(review) {
  const spoilerLevel = String(review?.spoilerLevel || "spoiler-free").trim();
  const hasSpoilers = spoilerLevel !== "spoiler-free";
  const body = `<div class="detail-review-prose">${renderParagraphMarkup([], review?.body || "")}</div>`;
  const context = [
    Array.isArray(review?.bestFor) && review.bestFor.length ? `<span><b>Best for</b> ${review.bestFor.map(toLabel).join(" • ")}</span>` : "",
    Array.isArray(review?.workedBest) && review.workedBest.length ? `<span><b>Worked best</b> ${review.workedBest.map(toLabel).join(" • ")}</span>` : "",
  ].filter(Boolean).join("");
  const date = review?.publishedAt ? new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric" }).format(new Date(review.publishedAt)) : "Recently published";
  const helpfulCount = Number(review?.helpfulCount || 0);
  const markedHelpful = Boolean(review?.viewerMarkedHelpful);
  return `
    <article class="detail-authored-review detail-listener-review" data-listener-review-id="${escapeHtml(review?.id || "")}">
      <header class="detail-authored-review-header"><div><span class="detail-review-kind">Listener review</span><h3>${escapeHtml(review?.title || "Listener review")}</h3><p class="detail-review-byline">${escapeHtml(review?.authorName || "Anonymous listener")} · ${escapeHtml(date)}</p></div><span class="detail-review-rating">${escapeHtml(String(review?.ratingStars || "--"))}/5</span></header>
      <span class="detail-spoiler-label${hasSpoilers ? " is-warning" : ""}">${escapeHtml(toLabel(spoilerLevel))}</span>
      ${hasSpoilers ? `<details class="detail-listener-spoilers"><summary>Reveal spoilers</summary>${body}</details>` : body}
      ${context ? `<div class="detail-review-context">${context}</div>` : ""}
      <div class="detail-review-community-actions"><button class="detail-review-helpful${markedHelpful ? " is-active" : ""}" type="button" data-review-helpful="${escapeHtml(review?.id || "")}" aria-pressed="${String(markedHelpful)}">Helpful <span data-review-helpful-count>${helpfulCount}</span></button></div>
    </article>
  `;
}

function getReviewPage(reviewData) {
  if (Array.isArray(reviewData)) {
    return { reviews: reviewData, pagination: { page: 1, totalReviews: reviewData.length, totalPages: reviewData.length || 1 } };
  }
  return {
    reviews: Array.isArray(reviewData?.reviews) ? reviewData.reviews : [],
    pagination: reviewData?.pagination || { page: 1, totalReviews: 0, totalPages: 1 },
  };
}

function getVisibleDotIndexes(totalSlides, currentIndex) {
  if (totalSlides <= 7) return Array.from({ length: totalSlides }, (_unused, index) => index);
  const middle = new Set([0, totalSlides - 1]);
  for (let index = Math.max(1, currentIndex - 2); index <= Math.min(totalSlides - 2, currentIndex + 2); index += 1) middle.add(index);
  return [...middle].sort((left, right) => left - right);
}

function renderDots(totalSlides, currentIndex) {
  const indexes = getVisibleDotIndexes(totalSlides, currentIndex);
  return indexes.map((index, position) => {
    const previous = indexes[position - 1];
    const ellipsis = position > 0 && index - previous > 1 ? '<span class="detail-review-carousel-ellipsis" aria-hidden="true">…</span>' : "";
    return `${ellipsis}<button type="button" class="detail-review-carousel-dot${index === currentIndex ? " is-active" : ""}" data-review-carousel-dot="${index}" aria-label="Show review ${index + 1} of ${totalSlides}" aria-current="${index === currentIndex ? "true" : "false"}"></button>`;
  }).join("");
}

export function renderReviewSection(show, reviewData = {}) {
  const reviewPage = getReviewPage(reviewData);
  const isFullReview = show.reviewStatus === "full-review";
  const archiveCard = isFullReview ? renderArchiveReviewCard(show) : "";
  const hasArchive = Boolean(archiveCard);
  const initialListenerReview = reviewPage.reviews[0] || null;
  const totalListenerReviews = Number(reviewPage.pagination?.totalReviews || 0);
  if (!isFullReview && totalListenerReviews === 0) return "";
  const totalSlides = totalListenerReviews + (hasArchive ? 1 : 0);
  const initialIndex = hasArchive ? 0 : 0;
  const initialCard = hasArchive ? archiveCard : initialListenerReview ? renderListenerReviewCard(initialListenerReview) : "";
  const empty = totalSlides === 0;
  return `
    <section class="detail-section detail-review-section" id="review-notes" tabindex="-1">
      <div class="detail-section-header detail-review-section-header"><div><h2>Reviews</h2><p>Archive editorial and moderated listener response, clearly credited.</p></div><a class="detail-primary-action detail-primary-action-compact" href="${escapeHtml(createSubmissionHref("listener-review", show.id))}">Write a review</a></div>
      ${empty ? `<div class="empty-state-card detail-reviews-empty-state"><p>No reviews are published for this show yet. Listener reviews are moderated before appearing here.</p><div class="empty-state-actions"><a class="detail-primary-action detail-primary-action-compact" href="${escapeHtml(createSubmissionHref("listener-review", show.id))}">Submit the first review</a></div></div>` : `
        <div class="detail-review-carousel" data-review-carousel data-show-id="${escapeHtml(show.id)}" data-has-archive="${String(hasArchive)}" data-listener-total="${totalListenerReviews}" data-current-index="${initialIndex}">
          <button type="button" class="detail-review-carousel-arrow is-previous" data-review-carousel-previous aria-label="Previous review" ${initialIndex === 0 ? "disabled" : ""}>‹</button>
          <div class="detail-review-carousel-viewport" data-review-carousel-viewport tabindex="0" aria-label="Review carousel"><div data-review-carousel-slide>${initialCard}</div></div>
          <button type="button" class="detail-review-carousel-arrow is-next" data-review-carousel-next aria-label="Next review" ${totalSlides <= 1 ? "disabled" : ""}>›</button>
          <div class="detail-review-carousel-pagination"><div class="detail-review-carousel-dots" data-review-carousel-dots>${renderDots(totalSlides, initialIndex)}</div><p class="detail-review-carousel-status" data-review-carousel-status aria-live="polite">Review ${initialIndex + 1} of ${totalSlides}</p></div>
        </div>
      `}
    </section>
  `;
}

export function renderFirstReviewCta(show, reviewData = {}) {
  const totalListenerReviews = Number(getReviewPage(reviewData).pagination?.totalReviews || 0);
  if (show.reviewStatus === "full-review" || totalListenerReviews > 0) return "";
  return `
    <section class="detail-section detail-first-review-card" aria-label="Listener review invitation">
      <p>Add your take to help listeners find their next show.</p>
      <a class="detail-primary-action detail-primary-action-compact" href="${escapeHtml(createSubmissionHref("listener-review", show.id))}">Be the first to review</a>
    </section>
  `;
}

export function renderCommunityScoreBreakdown(show, scoreSummary = {}) {
  const isFullReview = show.reviewStatus === "full-review";
  const visibleCategories = CATEGORY_ORDER.filter(([key]) => {
    const summary = scoreSummary?.[key] || {};
    return Boolean(summary.isPublic) && Number.isFinite(Number(summary.averageRating));
  });
  const categoriesToRender = isFullReview ? CATEGORY_ORDER : visibleCategories;
  if (categoriesToRender.length === 0) return "";
  return `
    <section class="detail-section detail-community-score-section" aria-labelledby="community-score-breakdown-title">
      <div class="detail-section-header"><div><h2 id="community-score-breakdown-title">Community score breakdown</h2><p>Category averages come only from published listener reviews. Archive ratings stay editorially separate.</p></div><a class="detail-primary-action detail-primary-action-compact" href="${escapeHtml(createSubmissionHref("listener-review", show.id))}">Add your scores</a></div>
      <div class="detail-ratings-grid detail-community-ratings-grid">
        ${categoriesToRender.map(([key, label]) => {
          const summary = scoreSummary?.[key] || {};
          const ratingCount = Number(summary.ratingCount || 0);
          const average = Number(summary.averageRating);
          const isPublic = Boolean(summary.isPublic) && Number.isFinite(average);
          const remaining = Math.max(0, 3 - ratingCount);
          const display = isPublic ? `${average.toFixed(1)}/10` : "Building";
          const subline = isPublic ? `${ratingCount} ${ratingCount === 1 ? "rating" : "ratings"}` : remaining > 0 ? `${ratingCount} recorded · ${remaining} more to reveal` : `${ratingCount} recorded`;
          return `<article class="detail-rating-card detail-community-rating-card"><div class="detail-rating-topline"><span>${escapeHtml(label)}</span><span>${display}</span></div><div class="detail-rating-bar"><div class="detail-rating-fill" style="width: ${isPublic ? Math.max(0, Math.min(100, average * 10)) : 0}%"></div></div><p>${escapeHtml(subline)}</p></article>`;
        }).join("")}
      </div>
    </section>
  `;
}

export function renderCommunityFallback() {
  return `
    <section class="detail-section detail-community-slot detail-community-fallback" aria-labelledby="community-rating-title">
      <div class="detail-section-header"><div><h2 id="community-rating-title">Listener rating</h2><p>Community ratings stay separate from archive scores and written listener reviews.</p></div></div>
      <p class="detail-community-fallback-copy">The rating control becomes available when this page finishes loading.</p>
    </section>
  `;
}
