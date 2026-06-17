import { normalizeReviewParagraphs } from "./data.js";
import { getCollectionShowReason, getShowCollectionMemberships } from "./render-collections.js";
import { createArchiveGenreHref, createCollectionHref, createSubmissionHref } from "./urls.js";
import {
  escapeHtml,
  formatCompactDate,
  formatDate,
  formatRating,
  getRuntimeLabel,
  toDisplayTag,
  toLabel,
} from "./utils.js";

const DETAIL_LINK_LABELS = {
  website: "Website",
  apple: "Apple",
  spotify: "Spotify",
  rss: "RSS",
};

const DETAIL_LINK_ORDER = ["website", "apple", "spotify", "rss"];

export function createShowPageMarkup(show, showMap, collections = []) {
  const statusChips = [];
  if ((show.finalRating || 0) >= 9) {
    statusChips.push('<span class="detail-status-chip is-accent">Top rated</span>');
  }
  if (show.reviewStatus === "full-review") {
    statusChips.push('<span class="detail-status-chip">Full review</span>');
  } else if (show.reviewStatus) {
    statusChips.push(`<span class="detail-status-chip">${escapeHtml(toDisplayTag(show.reviewStatus))}</span>`);
  }
  if (show.tags[0]) {
    statusChips.push(`<span class="detail-status-chip">${escapeHtml(toDisplayTag(show.tags[0]))}</span>`);
  }

  return `
    <section class="detail-main podcast-detail">
      <section class="detail-hero-shell">
        <div class="detail-hero-panel" style="--detail-cover-image: url('${escapeHtml(show.cover)}');">
          ${renderDetailBreadcrumbs(show)}

          <div class="detail-hero-grid">
            <div class="detail-hero-copy">
              <div class="detail-status-row">
                ${statusChips.join("")}
              </div>

              <header class="detail-title-group">
                <h1>${escapeHtml(show.title)}</h1>
                ${show.subtitle ? `<p class="detail-subtitle">${escapeHtml(show.subtitle)}</p>` : ""}
                ${renderHeroKeyTags(show)}
              </header>

              <div class="detail-meta-grid">
                ${renderHeroMetaCard("Archive rating", `${formatRating(show.finalRating)}/10`, "Echo score")}
                ${renderHeroCommunityMetaCard()}
                ${renderHeroMetaCard("Runtime", escapeHtml(getHeroRuntimeValue(show)), escapeHtml(getHeroRuntimeNote(show)))}
                ${renderHeroMetaCard("Format", escapeHtml(getHeroFormatValue(show)), escapeHtml(getHeroFormatNote(show)))}
                ${renderHeroMetaCard(
                  "Completion",
                  escapeHtml(toDisplayTag(show.completionStatus || "unclear")),
                  escapeHtml(getCompletionNote(show)),
                )}
                ${renderHeroMetaCard(
                  "Release status",
                  escapeHtml(toDisplayTag(show.releaseStatus || "unknown")),
                  escapeHtml(getReleaseNote(show)),
                )}
              </div>

              <div class="detail-actions">
                <a class="detail-primary-action" href="#review-notes">Review notes</a>
                <a class="detail-secondary-action" href="#facts-links">Facts &amp; links</a>
              </div>
            </div>

            <div class="detail-cover-column">
              <div class="detail-cover-card">
                <img src="/${escapeHtml(show.cover)}" alt="${escapeHtml(show.coverAlt)}" />
              </div>
            </div>
          </div>
        </div>

        ${renderBestForStrip(show)}
      </section>

      <div class="detail-content-layout">
        <div class="detail-main-stack">
          ${renderOfficialSummarySection(show)}
          <div class="detail-main-column">
            ${renderOverviewSection(show)}
            ${renderReviewSection(show)}
            ${renderQuoteSection(show)}
          </div>
        </div>
        <div class="detail-community-slot"></div>

        <aside class="detail-side-rail">
          ${renderArchiveTakeCard(show)}
          ${renderFactsLinksCard(show)}
        </aside>

        ${renderSimilarSection(show, showMap)}
        ${renderCollectionsSection(show, collections)}
        ${renderCorrectionSection(show)}
      </div>
    </section>
  `;
}

function renderDetailBreadcrumbs(show) {
  const parts = ['<a href="/index.html">Archive</a>'];

  if (show.genres[0]) {
    parts.push('<span class="detail-breadcrumb-divider">/</span>');
    parts.push(
      `<a href="${escapeHtml(createArchiveGenreHref(show.genres[0]))}">${escapeHtml(toDisplayTag(show.genres[0]))}</a>`,
    );
  }

  parts.push('<span class="detail-breadcrumb-divider">/</span>');
  parts.push(`<span>${escapeHtml(show.title)}</span>`);

  return `<div class="detail-breadcrumbs">${parts.join("")}</div>`;
}

function renderHeroMetaCard(label, value, note = "") {
  return `
    <article class="detail-meta-card">
      <span class="detail-meta-label">${label}</span>
      <span class="detail-meta-value">${value}</span>
      ${note ? `<span class="detail-meta-note">${note}</span>` : ""}
    </article>
  `;
}

function renderHeroCommunityMetaCard() {
  return `
    <article class="detail-meta-card detail-meta-card-community">
      <span class="detail-meta-label">Community rating</span>
      <span class="detail-meta-value" data-community-hero-rating>--/10</span>
      <span class="detail-meta-note" data-community-hero-count>No ratings yet</span>
    </article>
  `;
}

function renderHeroKeyTags(show) {
  const tags = Array.isArray(show.tags) ? show.tags.slice(0, 4) : [];
  if (tags.length === 0) {
    return "";
  }

  return `
    <div class="detail-hero-tag-row" aria-label="Key tags">
      <span class="detail-hero-tag-label">Key tags</span>
      <div class="detail-hero-tag-list">
        ${tags.map((value) => `<span class="detail-tag">${escapeHtml(toDisplayTag(value))}</span>`).join("")}
      </div>
    </div>
  `;
}

function renderBestForStrip(show) {
  if (!Array.isArray(show.bestFor) || show.bestFor.length === 0) {
    return "";
  }

  return `
    <section class="detail-best-for-strip" aria-label="Best for">
      <span class="detail-best-for-label">Best for</span>
      <div class="detail-best-for-list">
        ${show.bestFor
          .map(
            (value) => `
              <article class="detail-best-for-item">
                <span class="detail-best-for-icon" aria-hidden="true">${getBestForIconMarkup(value)}</span>
                <span class="detail-best-for-text">${escapeHtml(toDisplayTag(value))}</span>
              </article>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function getBestForIconMarkup(value) {
  const iconMap = {
    "long-walks":
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4.5c1.1 0 2 .9 2 2S9.1 8.5 8 8.5 6 7.6 6 6.5s.9-2 2-2Zm7 0c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2Zm-6.25 6.5 2.1 2.5L9.1 19.5H6.9l1.65-5.15-1.95-2.1 2.15-1.25Zm6.6 0 2.15 1.25-1.95 2.1 1.65 5.15H14.9l-1.75-6 2.2-2.5Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6"/></svg>',
    "headphones-on":
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.75 13.5a7.25 7.25 0 1 1 14.5 0v4.25a1.5 1.5 0 0 1-1.5 1.5h-1.25a1.5 1.5 0 0 1-1.5-1.5v-3a1.5 1.5 0 0 1 1.5-1.5h2.75m-13.5 0H7.5a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5H6.25a1.5 1.5 0 0 1-1.5-1.5V13.5Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6"/></svg>',
    "serious-sci-fi":
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.75 14.2 9l5.55.45-4.25 3.65 1.3 5.4L12 15.6 7.2 18.5l1.3-5.4-4.25-3.65L9.8 9 12 3.75Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6"/></svg>',
    worldbuilding:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.75c4.56 0 8.25 3.69 8.25 8.25S16.56 20.25 12 20.25 3.75 16.56 3.75 12 7.44 3.75 12 3.75Zm0 0c2.1 2.2 3.25 5.15 3.25 8.25S14.1 18.05 12 20.25m0-16.5c-2.1 2.2-3.25 5.15-3.25 8.25S9.9 18.05 12 20.25m-7.9-5.25h15.8M4.1 9h15.8" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.55"/></svg>',
    "binge-listening":
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6.5v11l8.75-5.5L6 6.5Z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.7"/><path d="M17.5 7.5v9" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.7"/></svg>',
    "late-night":
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.8 15.9a6.8 6.8 0 0 1-8.7-8.7 7 7 0 1 0 8.7 8.7Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/></svg>',
    "easy-entry":
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6.75h9v10.5H9m0-10.5-3 3m3-3 3 3m-3 7.5-3-3m3 3 3-3" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.65"/></svg>',
    "funny-space-disasters":
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.25 15.75 15.9 8.1m-4.1-.35 4.45-1.2-1.2 4.45m-6.8 4.75-1.55 1.55m8.35-8.35 1.55-1.55m-9.1 4.3c-1.95 1.95-2.15 4.9-.45 6.6 1.7 1.7 4.65 1.5 6.6-.45l2.15-2.15-6.15-6.15-2.15 2.15Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.55"/></svg>',
    "cold-isolation-horror":
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.75v16.5M6.55 6.55l10.9 10.9M3.75 12h16.5M6.55 17.45l10.9-10.9" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.55"/></svg>',
    "short-under-five-hours":
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5.25v6l3.75 2.25M12 20.25a8.25 8.25 0 1 0 0-16.5 8.25 8.25 0 0 0 0 16.5Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.65"/></svg>',
  };

  return (
    iconMap[value] ||
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5 19.5 12 12 19.5 4.5 12 12 4.5Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6"/></svg>'
  );
}

function renderOfficialSummarySection(show) {
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

function renderArchiveTakeCard(show) {
  const archiveTake = getArchivePerspectiveText(show);
  const note =
    show.reviewStatus === "full-review"
      ? ""
      : "Full review not published yet. This page stays live so the archive can still recommend the show now.";

  return `
    <section class="detail-side-card detail-archive-take-card">
      <div class="detail-side-card-header">
        <h2>Archive take</h2>
      </div>
      <p>${escapeHtml(archiveTake)}</p>
      ${note ? `<p class="detail-side-note">${escapeHtml(note)}</p>` : ""}
    </section>
  `;
}

function renderFactsLinksCard(show) {
  const creatorNetwork = getCreatorNetworkLabel(show);
  const seasonsEpisodes = getSeasonsEpisodesLabel(show);
  const firstRelease = getKnownDateLabel(getShowDateValue(show, "first"));
  const latestRelease = getKnownDateLabel(getShowDateValue(show, "latest"));

  return `
    <section class="detail-side-card detail-facts-links-card" id="facts-links">
      <div class="detail-side-card-header">
        <h2>Facts &amp; links</h2>
      </div>

      <dl class="detail-fact-list">
        ${renderFactRow("Creator / network", creatorNetwork.text, { isEmpty: creatorNetwork.isEmpty })}
        ${renderFactRow("Official / listen links", renderListenLinkCluster(show), { html: true })}
        ${renderFactRow("Status", renderStatusPills(show), { html: true })}
        ${renderFactRow("Seasons / episodes", seasonsEpisodes.text, { isEmpty: seasonsEpisodes.isEmpty })}
        ${renderFactRow("First release", firstRelease.text, { isEmpty: firstRelease.isEmpty })}
        ${renderFactRow("Latest release", latestRelease.text, { isEmpty: latestRelease.isEmpty })}
      </dl>
    </section>
  `;
}

function renderFactRow(label, value, { html = false, isEmpty = false } = {}) {
  const content = html ? value : escapeHtml(value);
  const classes = `detail-fact-value${isEmpty ? " is-empty" : ""}`;

  return `
    <div class="detail-fact-row">
      <dt>${escapeHtml(label)}</dt>
      <dd class="${classes}">${content}</dd>
    </div>
  `;
}

function renderStatusPills(show) {
  const chips = [
    { label: toDisplayTag(show.reviewStatus || "unknown"), accent: show.reviewStatus === "full-review" },
    { label: toDisplayTag(show.releaseStatus || "unknown") },
    { label: toDisplayTag(show.completionStatus || "unclear") },
  ];

  return `
    <div class="detail-fact-pill-row">
      ${chips
        .map(
          (chip) => `<span class="detail-fact-pill${chip.accent ? " is-accent" : ""}">${escapeHtml(chip.label)}</span>`,
        )
        .join("")}
    </div>
  `;
}

function renderListenLinkCluster(show) {
  const links = show.listenLinks || {};
  const primaryLink = getPrimaryListenLink(show);

  return `
    <div class="detail-link-cluster">
      ${
        primaryLink
          ? `<a class="detail-link-primary" href="${escapeHtml(primaryLink.href)}" target="_blank" rel="noreferrer">Open ${escapeHtml(
              primaryLink.label,
            )}</a>`
          : '<p class="detail-link-status is-empty">Links being verified</p>'
      }
      <div class="detail-link-chip-row">
        ${DETAIL_LINK_ORDER.map((key) => renderListenLinkChip(key, links[key])).join("")}
      </div>
    </div>
  `;
}

function renderListenLinkChip(key, href) {
  const label = DETAIL_LINK_LABELS[key] || toLabel(key);
  if (href) {
    return `<a class="detail-link-chip" href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`;
  }

  return `<span class="detail-link-chip is-disabled" aria-disabled="true">${escapeHtml(label)}</span>`;
}

function getPrimaryListenLink(show) {
  const links = show.listenLinks || {};

  for (const key of DETAIL_LINK_ORDER) {
    if (links[key]) {
      return {
        key,
        href: links[key],
        label: DETAIL_LINK_LABELS[key] || toLabel(key),
      };
    }
  }

  return null;
}

function renderCollectionsSection(show, collections = []) {
  const memberships = getShowCollectionMemberships(show.id, collections);

  return `
    <section class="detail-section detail-collections-section">
      <div class="detail-section-header">
        <div>
          <h2>Discovery routes</h2>
          <p>Curated listening paths already connected to this show in the archive.</p>
        </div>
      </div>
      ${
        memberships.length > 0
          ? `<div class="detail-collection-route-list">${memberships
              .map(
                (collection) => `
                  <a class="detail-collection-route" href="${escapeHtml(createCollectionHref(collection.id))}">
                    <span class="detail-collection-route-title">${escapeHtml(collection.title)}</span>
                    ${
                      collection.reason
                        ? `<span class="detail-collection-route-reason">${escapeHtml(collection.reason)}</span>`
                        : `<span class="detail-collection-route-reason">Curated route in the archive.</span>`
                    }
                  </a>
                `,
              )
              .join("")}</div>`
          : '<p class="detail-side-note">No collection routes have been published for this show yet.</p>'
      }
    </section>
  `;
}

function renderCorrectionSection(show) {
  return `
    <section class="detail-section detail-correction-section">
      <div class="detail-section-header">
        <div>
          <h2>Help keep the archive accurate.</h2>
          <p>Spot a metadata issue, missing link, or verification problem? Send it into the review queue.</p>
        </div>
      </div>
      <p>Use this when factual details need correction or an official source should be checked against the current entry.</p>
      <a class="detail-primary-action detail-primary-action-compact" href="${escapeHtml(
        createSubmissionHref("correction", show.id),
      )}">Suggest a correction</a>
    </section>
  `;
}

function renderOverviewSection(show) {
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

function renderQuoteSection(show) {
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

function renderParagraphMarkup(paragraphs, fallbackText) {
  const normalized = normalizeReviewParagraphs(paragraphs);
  const fallback = String(fallbackText || "").trim();
  const entries = normalized.length > 0 ? normalized : fallback ? [fallback] : [];

  return entries.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("");
}

function renderReviewSection(show) {
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

function renderSimilarSection(show, showMap) {
  const neighbors = show.similarTo.map((id) => showMap.get(id)).filter(Boolean);
  if (neighbors.length === 0) {
    return "";
  }

  return `
    <section class="detail-section detail-similar-section">
      <div class="detail-section-header">
        <div>
          <h2>Start next</h2>
          <p>Closest neighboring picks in the archive once you finish this one.</p>
        </div>
      </div>

      <div class="detail-similar-grid">
        ${neighbors
          .map(
            (neighbor) => `
              <article class="detail-similar-card">
                <img src="/${escapeHtml(neighbor.cover)}" alt="${escapeHtml(neighbor.coverAlt)}" />
                <div class="detail-card-copy">
                  <h3>${escapeHtml(neighbor.title)}</h3>
                  ${
                    getSimilarReason(show, neighbor.id)
                      ? `<p class="detail-similar-reason">${escapeHtml(getSimilarReason(show, neighbor.id))}</p>`
                      : ""
                  }
                  <p>${escapeHtml(neighbor.archiveTake || neighbor.description)}</p>
                  <a class="detail-archive-link" href="${escapeHtml(neighbor.href)}">Open show</a>
                </div>
              </article>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function getHeroRuntimeValue(show) {
  if (typeof show.length?.totalHours === "number") {
    const hours = formatRating(show.length.totalHours);
    return `${hours} ${show.length.totalHours === 1 ? "hour" : "hours"}`;
  }

  return getRuntimeLabel(show);
}

function getHeroRuntimeNote(show) {
  if (show.length?.label) {
    return show.length.label;
  }

  return "Runtime being cataloged";
}

function getHeroFormatValue(show) {
  if (show.formats[0]) {
    return toDisplayTag(show.formats[0]);
  }

  return "Not cataloged";
}

function getHeroFormatNote(show) {
  if (show.formats.length > 1) {
    return show.formats
      .slice(1, 3)
      .map((format) => toDisplayTag(format))
      .join(" • ");
  }

  return show.formats[0] ? "Archive format" : "Format being cataloged";
}

function getCompletionNote(show) {
  const seasonsLabel = typeof show.length?.seasons === "number" ? `${show.length.seasons} seasons` : "";
  const episodesLabel = typeof show.length?.episodes === "number" ? `${show.length.episodes} episodes` : "";
  return [seasonsLabel, episodesLabel].filter(Boolean).join(" • ") || "Archive completion";
}

function getReleaseNote(show) {
  const firstKnownDate = getShowDateValue(show, "first");
  if (firstKnownDate) {
    return formatCompactDate(firstKnownDate);
  }

  return "Catalog state";
}

function getFullFormatLabel(show) {
  if (show.formats.length > 0) {
    return show.formats.map((format) => toDisplayTag(format)).join(" • ");
  }

  return "Not cataloged yet";
}

function getCreatorNetworkLabel(show) {
  const creator = Array.isArray(show.creators) && show.creators.length > 0
    ? show.creators.join(", ")
    : show.creatorId
      ? toLabel(show.creatorId)
      : "";
  const network = typeof show.credits?.network === "string" && show.credits.network
    ? show.credits.network
    : show.networkId
      ? toLabel(show.networkId)
      : "";
  const text = [creator, network].filter(Boolean).join(" • ");

  if (!text) {
    return { text: "Not cataloged yet", isEmpty: true };
  }

  return { text, isEmpty: false };
}

function getSeasonsEpisodesLabel(show) {
  const seasons = typeof show.length?.seasons === "number" ? `${show.length.seasons} seasons` : "";
  const episodes = typeof show.length?.episodes === "number" ? `${show.length.episodes} episodes` : "";
  const text = [seasons, episodes].filter(Boolean).join(" • ");

  if (!text) {
    return { text: "Not cataloged yet", isEmpty: true };
  }

  return { text, isEmpty: false };
}

function getAverageEpisodeLabel(show) {
  if (typeof show.length?.avgEpisodeMinutes === "number") {
    return {
      text: `${show.length.avgEpisodeMinutes} minutes`,
      isEmpty: false,
    };
  }

  return { text: "Not cataloged yet", isEmpty: true };
}

function getArchivePerspectiveText(show) {
  const archiveTake = String(show.archiveTake || "").trim();
  if (archiveTake) {
    return archiveTake;
  }

  const spoilerFree = String(show.spoilerFreeReview || "").trim();
  if (spoilerFree) {
    return spoilerFree;
  }

  const thoughts = String(show.thoughts || "").trim();
  if (thoughts) {
    return thoughts;
  }

  return "Archive perspective is still being expanded. This entry stays live because the show is already useful in the discovery graph.";
}

function getShowDateValue(show, kind) {
  if (kind === "first") {
    return show.releaseDates?.first || "";
  }

  return show.releaseDates?.latest || "";
}

function getKnownDateLabel(value) {
  if (!value) {
    return { text: "Not cataloged yet", isEmpty: true };
  }

  return { text: formatDate(value), isEmpty: false };
}

function getSimilarReason(show, neighborId) {
  const reason = show?.similarReasons?.[neighborId];
  return typeof reason === "string" && reason.trim() ? reason.trim() : "";
}
