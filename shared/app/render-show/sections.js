import {
  escapeHtml,
  formatRating,
  getArchivePerspectiveText,
  renderParagraphMarkup,
  toLabel,
} from "./utils.js";

export function renderOfficialSummarySection(show) {
  const summaryText = String(show.description || show.subtitle || "").trim() || "Official summary not cataloged yet.";

  return `
    <section class="detail-section detail-official-summary-section">
      <div class="detail-section-header">
        <div>
          <h2>Official summary</h2>
          <p>The listener-facing setup and premise for the show, kept separate from the archive take.</p>
        </div>
      </div>

      <article class="detail-summary detail-summary-official">
        <p>${escapeHtml(summaryText)}</p>
      </article>
    </section>
  `;
}

export function renderOverviewSection(show) {
  const isFullReview = show.reviewStatus === "full-review";
  const reviewTitle = isFullReview ? "Spoiler-free review summary" : "Archive summary";
  const reviewIntro = isFullReview
    ? "Quick context before you drop into the longer archive notes."
    : "This entry is indexed and recommendation-ready even though the full review has not been published yet.";
  const reviewCopy = isFullReview
    ? renderParagraphMarkup(show.spoilerFreeReviewParagraphs, show.spoilerFreeReview || show.description)
    : `<p>${escapeHtml(getArchivePerspectiveText(show))}</p>`;
  const scoreCard = renderScoreBreakdownCard(show);

  return `
    <section class="detail-section detail-overview-section">
      <div class="detail-section-header">
        <div>
          <h2>${reviewTitle}</h2>
          <p>${reviewIntro}</p>
        </div>
      </div>

      <div class="detail-overview-grid${scoreCard ? "" : " detail-overview-grid-single"}">
        <article class="detail-summary">
          ${reviewCopy}
        </article>
        ${scoreCard}
      </div>
    </section>
  `;
}

export function renderReviewSection(show) {
  if (show.reviewStatus === "full-review") {
    return `
      <section class="detail-section" id="review-notes">
        <div class="detail-section-header">
          <div>
            <h2>Review notes</h2>
            <p>The longer spoiler-free archive read, plus the more personal reaction once the basics are clear.</p>
          </div>
        </div>

        <div class="detail-review-grid">
          <article class="detail-summary">
            <h3>Spoiler-free review</h3>
            ${renderParagraphMarkup(show.spoilerFreeReviewParagraphs, show.spoilerFreeReview || show.description)}
          </article>
          <article class="detail-thoughts">
            <h3>Archive reaction</h3>
            ${renderParagraphMarkup(show.thoughtsParagraphs, show.thoughts || getArchivePerspectiveText(show))}
          </article>
        </div>
      </section>
    `;
  }

  return `
    <section class="detail-section" id="review-notes">
      <div class="detail-section-header">
        <div>
          <h2>Archive note</h2>
          <p>This show is indexed and recommendation-ready, but the long-form archive review has not been published yet.</p>
        </div>
      </div>

      <div class="detail-review-grid detail-review-grid-single">
        <article class="detail-summary">
          <h3>Why it is here</h3>
          <p>${escapeHtml(getArchivePerspectiveText(show))}</p>
        </article>
      </div>
    </section>
  `;
}

export function renderQuoteSection(show) {
  if (!show.quote?.text) {
    return "";
  }

  return `
    <blockquote class="detail-quote">
      &ldquo;${escapeHtml(show.quote.text)}&rdquo;
      <cite>${escapeHtml(show.quote.attribution || "Archive note")}</cite>
    </blockquote>
  `;
}

function renderScoreBreakdownCard(show) {
  const ratingEntries = Object.entries(show.ratings || {}).filter(([key]) => key !== "archive");
  if (ratingEntries.length === 0) {
    return "";
  }

  return `
    <article class="detail-score-card">
      <div class="detail-score-card-header">
        <h3>Score breakdown</h3>
        <p>Where the show wins outright and where it simply stays solid.</p>
      </div>

      <div class="detail-ratings-grid">
        ${ratingEntries
          .map(([key, value]) => {
            const numericValue = Number(value);
            const width = Math.max(0, Math.min(100, numericValue * 10));
            return `
              <article class="detail-rating-card">
                <div class="detail-rating-topline"><span>${escapeHtml(toLabel(key))}</span><span>${formatRating(
                  numericValue,
                )}/10</span></div>
                <div class="detail-rating-bar"><div class="detail-rating-fill" style="width: ${width}%"></div></div>
              </article>
            `;
          })
          .join("")}
      </div>
    </article>
  `;
}
