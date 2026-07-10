import { createSubmissionHref } from "../urls.js";
import {
  escapeHtml,
  formatRating,
  getArchivePerspectiveText,
  getCreatorNames,
  getNetworkLabel,
  getOfficialSummaryText,
  renderParagraphMarkup,
  toLabel,
} from "./utils.js";

const OFFICIAL_LINK_LABELS = {
  website: "Official site",
  patreon: "Patreon",
  discord: "Discord",
  youtube: "YouTube",
  instagram: "Instagram",
  twitter: "Twitter",
  x: "X",
  tiktok: "TikTok",
  facebook: "Facebook",
  merch: "Merch",
  support: "Support",
};

export function renderOfficialSummarySection(show) {
  const summaryText = getOfficialSummaryText(show);

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

export function renderCreatorLinksSection(show) {
  const creators = getCreatorNames(show);
  const network = getNetworkLabel(show);
  const officialLinks = getOfficialLinks(show);
  const hasIdentity = creators.length > 0 || Boolean(network);

  if (!hasIdentity && officialLinks.length === 0) {
    return "";
  }

  return `
    <section class="detail-section detail-creator-links-section" id="creator-links">
      <div class="detail-section-header">
        <div>
          <h2>Creator &amp; official links</h2>
          <p>Official presence stays separate from listen links, archive ratings, and community feedback.</p>
        </div>
      </div>

      <div class="detail-creator-links-grid${hasIdentity && officialLinks.length > 0 ? "" : " detail-creator-links-grid-single"}">
        ${
          hasIdentity
            ? `
              <article class="detail-summary detail-creator-links-card">
                <h3>Who made it</h3>
                <div class="detail-creator-identity-list">
                  ${
                    creators.length > 0
                      ? `
                        <div class="detail-creator-identity-row">
                          <span class="detail-creator-identity-label">Creator</span>
                          <span class="detail-creator-identity-value">${escapeHtml(creators.join(", "))}</span>
                        </div>
                      `
                      : ""
                  }
                  ${
                    network
                      ? `
                        <div class="detail-creator-identity-row">
                          <span class="detail-creator-identity-label">Network</span>
                          <span class="detail-creator-identity-value">${escapeHtml(network)}</span>
                        </div>
                      `
                      : ""
                  }
                </div>
              </article>
            `
            : ""
        }
        ${
          officialLinks.length > 0
            ? `
              <article class="detail-summary detail-creator-links-card">
                <h3>Official presence</h3>
                <div class="detail-link-chip-row">
                  ${officialLinks
                    .map(
                      ({ href, label }) =>
                        `<a class="detail-link-chip" href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`,
                    )
                    .join("")}
                </div>
              </article>
            `
            : ""
        }
      </div>
    </section>
  `;
}

export function renderOverviewSection(show) {
  const isFullReview = show.reviewStatus === "full-review";
  if (!isFullReview) {
    return "";
  }

  const reviewTitle = isFullReview ? "Spoiler-free review summary" : "Archive summary";
  const reviewIntro = "Quick context before you drop into the longer archive notes.";
  const reviewCopy = renderParagraphMarkup(show.spoilerFreeReviewParagraphs, show.spoilerFreeReview || show.description);
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
          <p>Indexed and recommendation-ready, with the longer archive review still unpublished.</p>
        </div>
      </div>

      <div class="detail-review-grid detail-review-grid-single">
        <article class="detail-summary detail-archive-note-summary">
          <span class="detail-summary-kicker">Why it is here</span>
          <p>${escapeHtml(getArchivePerspectiveText(show))}</p>
        </article>
      </div>
    </section>
  `;
}

export function renderListenerReviewsSection(show) {
  return `
    <section class="detail-section detail-listener-reviews-section" id="listener-reviews">
      <div class="detail-section-header">
        <div>
          <h2>Listener reviews</h2>
          <p>Community reviews stay separate from archive ratings and creator verification.</p>
        </div>
      </div>

      <div class="empty-state-card detail-reviews-empty-state">
        <p>No listener reviews are published for this show yet. The archive rating above is editorial; this section stays reserved for moderated listener response.</p>
        <div class="empty-state-actions">
          <a class="detail-primary-action detail-primary-action-compact" href="${escapeHtml(
            createSubmissionHref("listener-review", show.id),
          )}">Submit the first review</a>
          <a class="detail-secondary-action" href="#review-notes">Read archive notes</a>
        </div>
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
  const ratingEntries = Object.entries(show.ratings || {}).filter((entry) => {
    const [key, value] = entry;
    const numericValue = Number(value);
    return key !== "archive" && Number.isFinite(numericValue) && numericValue >= 0 && numericValue <= 10;
  });
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

function getOfficialLinks(show) {
  const officialLinks = show?.officialLinks && typeof show.officialLinks === "object" ? show.officialLinks : {};
  const orderedKeys = [
    "website",
    "patreon",
    "discord",
    "youtube",
    "instagram",
    "twitter",
    "x",
    "tiktok",
    "facebook",
    "merch",
    "support",
  ];

  const seen = new Set();
  const entries = [];

  orderedKeys.forEach((key) => {
    const href = String(officialLinks[key] || "").trim();
    if (!href) {
      return;
    }

    seen.add(key);
    entries.push({
      href,
      label: OFFICIAL_LINK_LABELS[key] || toLabel(key),
    });
  });

  Object.entries(officialLinks).forEach(([key, rawHref]) => {
    if (seen.has(key)) {
      return;
    }

    const href = String(rawHref || "").trim();
    if (!href) {
      return;
    }

    entries.push({
      href,
      label: OFFICIAL_LINK_LABELS[key] || toLabel(key),
    });
  });

  return entries;
}
