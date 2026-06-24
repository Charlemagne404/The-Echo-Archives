import { createArchiveGenreHref } from "../urls.js";
import {
  escapeHtml,
  formatRating,
  formatCompactDate,
  getCreatorNetworkLabel,
  getCompletionNote,
  getHeroFormatNote,
  getHeroFormatValue,
  getHeroRuntimeNote,
  getHeroRuntimeValue,
  getReleaseNote,
  toDisplayTag,
} from "./utils.js";

const HERO_LINK_LABELS = {
  website: "Website",
  apple: "Apple",
  spotify: "Spotify",
  rss: "RSS",
};

const HERO_LINK_ORDER = ["website", "apple", "spotify", "rss"];

export function renderDetailHero(show) {
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
  const primaryLink = getHeroPrimaryListenLink(show);

  return `
    <section class="detail-hero-shell">
      <div class="detail-hero-panel" style="--detail-cover-image: url('${escapeHtml(show.cover)}');">
        ${renderDetailBreadcrumbs(show)}

        <div class="detail-hero-grid">
          <div class="detail-hero-copy">
            <header class="detail-title-group">
              <div class="detail-status-row">
                ${statusChips.join("")}
              </div>
              <h1>${escapeHtml(show.title)}</h1>
              ${show.subtitle ? `<p class="detail-subtitle">${escapeHtml(show.subtitle)}</p>` : ""}
              ${renderHeroKeyTags(show)}
            </header>

            <div class="detail-decision-console" aria-label="Quick listening decision">
              <div class="detail-score-cluster">
                ${renderHeroScoreCard("Archive rating", `${formatRating(show.finalRating)}/10`, "Echo score", "archive")}
                ${renderHeroCommunityMetaCard()}
              </div>

              <div class="detail-meta-grid">
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

              ${renderHeroTrustBar(show)}
            </div>

            <div class="detail-actions">
              ${
                primaryLink
                  ? `<a class="detail-primary-action detail-listen-action" href="${escapeHtml(primaryLink.href)}" target="_blank" rel="noreferrer">Open ${escapeHtml(primaryLink.label)}</a>`
                  : '<a class="detail-primary-action detail-listen-action" href="#facts-links">Find listen links</a>'
              }
              <a class="detail-secondary-action" href="#review-notes">Review notes</a>
              <a class="detail-secondary-action" href="#facts-links">Facts &amp; links</a>
            </div>
          </div>

          <div class="detail-cover-column">
            <div class="detail-cover-card">
              <img src="/${escapeHtml(show.cover)}" alt="${escapeHtml(show.coverAlt)}" />
            </div>
            ${renderHeroCoverNote(show)}
          </div>
        </div>
      </div>

      ${renderBestForStrip(show)}
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

function renderHeroScoreCard(label, value, note = "", type = "") {
  const modifier = type ? ` detail-score-card-${type}` : "";

  return `
    <article class="detail-hero-score-card${modifier}">
      <span class="detail-meta-label">${label}</span>
      <strong class="detail-hero-score-value">${value}</strong>
      ${note ? `<span class="detail-meta-note">${note}</span>` : ""}
    </article>
  `;
}

function renderHeroCommunityMetaCard() {
  return `
    <article class="detail-hero-score-card detail-meta-card-community">
      <span class="detail-meta-label">Community rating</span>
      <strong class="detail-hero-score-value" data-community-hero-rating>--/10</strong>
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

function renderHeroTrustBar(show) {
  const creatorNetwork = getCreatorNetworkLabel(show);
  const verification = getHeroVerificationLabel(show);
  const items = [
    { label: "Creator / network", value: creatorNetwork.text, isEmpty: creatorNetwork.isEmpty },
    verification,
  ].filter(Boolean);

  if (items.length === 0) {
    return "";
  }

  return `
    <div class="detail-hero-trust-bar" aria-label="Archive trust signals">
      ${items
        .map(
          (item) => `
            <article class="detail-hero-trust-item${item.isEmpty ? " is-empty" : ""}">
              <span class="detail-meta-label">${escapeHtml(item.label)}</span>
              <span>${escapeHtml(item.value)}</span>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderHeroCoverNote(show) {
  const releaseStatus = toDisplayTag(show.releaseStatus || "unknown");
  const reviewStatus = toDisplayTag(show.reviewStatus || "unknown");

  return `
    <div class="detail-cover-note" aria-label="Archive status">
      <span>${escapeHtml(reviewStatus)}</span>
      <span>${escapeHtml(releaseStatus)}</span>
    </div>
  `;
}

function getHeroVerificationLabel(show) {
  if (!show.verification?.status) {
    return null;
  }

  const status = toDisplayTag(show.verification.status);
  const verifiedAt = show.verification.verifiedAt ? ` • ${formatCompactDate(show.verification.verifiedAt)}` : "";

  return {
    label: "Fact check",
    value: `${status}${verifiedAt}`,
    isEmpty: false,
  };
}

function getHeroPrimaryListenLink(show) {
  const links = show.listenLinks || {};

  for (const key of HERO_LINK_ORDER) {
    if (links[key]) {
      return {
        key,
        href: links[key],
        label: HERO_LINK_LABELS[key] || toDisplayTag(key),
      };
    }
  }

  return null;
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
