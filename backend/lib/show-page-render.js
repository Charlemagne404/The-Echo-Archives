const { renderEntityFacts, renderMoreFrom } = require("../../shared/archive-entities");
const { renderCollectionShowCard } = require("../../tools/lib/home-page-prerender");

const {
  derivePublicStatus,
  formatCount,
  formatRouteExpansion,
  getPublicVerificationLabel,
  toPublicLabel,
} = require("../../shared/archive-record");

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toDisplayTag(value = "") {
  return toPublicLabel(value);
}

function formatRating(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "--";
  }

  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
}

function normalizeArchiveRating(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 10) {
    return null;
  }

  return value;
}

function getShowImageSrc(show) {
  const imageSrc = String(show?.imageSrc || "").trim();
  if (imageSrc) {
    return imageSrc;
  }

  const cover = String(show?.cover || "").trim();
  if (!cover) {
    return "/images/TEA-Logo-S.png";
  }

  if (/^(?:https?:)?\/\//i.test(cover) || /^data:image\//i.test(cover)) {
    return cover;
  }

  return `/${cover.replace(/^\/+/, "")}`;
}

function getShowCoverVariants(show) {
  return (Array.isArray(show?.coverVariants) ? show.coverVariants : [])
    .filter((variant) => [320, 640].includes(Number(variant?.width)) && variant?.src)
    .sort((left, right) => Number(left.width) - Number(right.width));
}

function getShowCoverVariantSrc(show, preferredWidth = 640) {
  const variants = getShowCoverVariants(show);
  const exact = variants.find((variant) => Number(variant.width) === preferredWidth);
  const fallback = variants.at(-1);
  return exact?.src || fallback?.src || getShowImageSrc(show);
}

function renderResponsiveCoverAttributes(show, sizes) {
  const variants = getShowCoverVariants(show);
  if (variants.length === 0) {
    return "";
  }

  const srcset = variants
    .map((variant) => `${getShowImageSrc({ cover: variant.src })} ${Number(variant.width)}w`)
    .join(", ");
  return ` srcset="${escapeHtml(srcset)}" sizes="${escapeHtml(sizes)}"`;
}

function parseDisplayDate(value) {
  const text = String(value || "").trim();
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  return new Date(value);
}

function formatDate(value) {
  const date = parseDisplayDate(value);
  if (Number.isNaN(date.getTime())) {
    return value || "Not listed yet";
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function createSubmissionHref(submissionType = "", showId = "") {
  const query = new URLSearchParams();
  if (submissionType) {
    query.set("submissionType", submissionType);
  }
  if (showId) {
    query.set("showId", showId);
  }

  const search = query.toString();
  return `/submit${search ? `?${search}` : ""}`;
}

function renderParagraphs(paragraphs, fallbackText = "") {
  const entries = (Array.isArray(paragraphs) ? paragraphs : [])
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);
  const fallback = String(fallbackText || "").trim();
  return (entries.length > 0 ? entries : fallback ? [fallback] : [])
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("");
}

function getArchivePerspectiveText(show) {
  return (
    String(show.archiveTake || "").trim() ||
    String(show.spoilerFreeReview || "").trim() ||
    String(show.thoughts || "").trim() ||
    "The archive review is not finished yet. This show is still listed in the archive."
  );
}

function getSummaryDescriptor(show) {
  const official = show?.officialDescription && typeof show.officialDescription === "object" ? show.officialDescription : {};
  const officialText = String(official.text || "").trim();
  if (officialText) {
    const sourceLabel = String(official.sourceLabel || "Official source").trim();
    return { title: "Official description", description: `From ${sourceLabel}.`, text: officialText, sourceUrl: String(official.sourceUrl || "").trim() };
  }

  const importedSummary = String(show?.metadata?.importOfficialSummary || "").trim();
  const importedSource = Array.isArray(show?.metadata?.objectiveSources)
    ? show.metadata.objectiveSources.find((value) => /^https?:\/\//i.test(String(value || "")))
    : "";
  if (importedSummary && importedSource) {
    return { title: "Official description", description: "From an official listing.", text: importedSummary, sourceUrl: importedSource };
  }

  const archiveSummary = String(show?.description || show?.subtitle || "").trim();
  return archiveSummary
    ? { title: "About this show", description: "A concise spoiler-free setup from the archive.", text: archiveSummary }
    : null;
}

function isSuppressedCatalogValue(value = "") {
  return /^(not[-\s]?verified|unknown|n\/a|none)$/i.test(String(value || "").trim());
}

function normalizeEntityNames(value) {
  const entries = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return [...new Set(entries.map((entry) => String(entry || "").trim()).filter((entry) => entry && !isSuppressedCatalogValue(entry)))];
}

function toEntityLabelFromId(value = "") {
  const normalized = String(value || "").trim();
  return normalized && !isSuppressedCatalogValue(normalized) ? toDisplayTag(normalized) : "";
}

function getCreatorNetworkLabel(show) {
  const creators = normalizeEntityNames(show?.creators);
  const creatorValues = creators.length ? creators : normalizeEntityNames(show?.credits?.creatorName);
  const creator = creatorValues.length ? creatorValues : [toEntityLabelFromId(show?.creatorId)].filter(Boolean);
  const network = normalizeEntityNames(show?.credits?.network)[0] || toEntityLabelFromId(show?.networkId);
  const values = [...creator, network].filter(Boolean);
  const text = [...new Map(values.map((value) => [value.toLocaleLowerCase(), value])).values()].join(" • ");
  return { text: text || "Not listed yet", isEmpty: !text };
}

function getHeroRuntimeValue(show) {
  if (typeof show.length?.totalHours === "number" && show.length.totalHours > 0) {
    return `${formatRating(show.length.totalHours)} ${show.length.totalHours === 1 ? "hour" : "hours"}`;
  }
  if (typeof show.length?.episodes === "number" && show.length.episodes > 0) {
    return formatCount(show.length.episodes, "episode");
  }
  return show.length?.label || "Runtime not listed yet";
}

function getPrimaryListenLink(show) {
  const links = show.listenLinks || {};
  const labels = { start: "Start listening", website: "Website", apple: "Apple", spotify: "Spotify", rss: "RSS" };
  for (const key of ["start", "website", "apple", "spotify", "rss"]) {
    if (links[key]) {
      return { key, href: links[key], label: labels[key] || toDisplayTag(key) };
    }
  }

  return null;
}

function getArchiveTarget(show) {
  if (show.reviewStatus === "full-review") {
    return "#review-notes";
  }

  return [show.archiveTake, show.spoilerFreeReview, show.thoughts].some((value) => String(value || "").trim()) ? "#archive-note" : "";
}

function renderDetailHero(show, reviewData = {}) {
  const coverSrc = getShowImageSrc(show);
  const coverBackground = getShowCoverVariantSrc(show, 640);
  const archiveRating = normalizeArchiveRating(show.finalRating);
  const hasArchiveRating = archiveRating !== null;
  const archiveRatingValue = hasArchiveRating ? `${formatRating(archiveRating)}/10` : "Unrated";
  const archiveRatingNote = hasArchiveRating
    ? "Echo score"
    : show.reviewStatus === "imported" ? "No archive score · not individually reviewed" : "No archive rating yet";
  const listenerReviewScore = getListenerReviewScore(reviewData?.listenerReviewScore);
  const primaryLink = getPrimaryListenLink(show);
  const hasListenLinks = Object.values(show.listenLinks || {}).some((href) => String(href || "").trim());
  const archiveTarget = getArchiveTarget(show);
  const firstTag = Array.isArray(show.tags) ? show.tags[0] : "";
  const firstGenre = Array.isArray(show.genres) ? show.genres[0] : "";
  const statusChips = [
    archiveRating !== null && archiveRating >= 9 ? '<span class="detail-status-chip is-accent">Top rated</span>' : "",
    show.reviewStatus === "imported"
      ? '<span class="detail-status-chip is-imported">Imported</span>'
      : show.reviewStatus ? `<span class="detail-status-chip">${escapeHtml(toDisplayTag(show.reviewStatus))}</span>` : "",
    firstTag ? `<span class="detail-status-chip">${escapeHtml(toDisplayTag(firstTag))}</span>` : "",
  ].filter(Boolean).join("");

  return `
    <section class="detail-hero-shell">
      <div class="detail-hero-panel" style="--detail-cover-image: url('${escapeHtml(coverBackground)}');">
        <div class="detail-breadcrumbs">
          <a href="/">Archive</a>
          ${
            firstGenre
              ? `<span class="detail-breadcrumb-divider">/</span><a href="/?genre=${encodeURIComponent(firstGenre)}#archive">${escapeHtml(toDisplayTag(firstGenre))}</a>`
              : ""
          }
          <span class="detail-breadcrumb-divider">/</span><span>${escapeHtml(show.title)}</span>
        </div>
        <div class="detail-hero-grid">
          <div class="detail-hero-copy">
            <header class="detail-title-group">
              <div class="detail-status-row">${statusChips}</div>
              <h1>${escapeHtml(show.title)}</h1>
              ${show.subtitle ? `<p class="detail-subtitle">${escapeHtml(show.subtitle)}</p>` : ""}
              ${renderHeroKeyTags(show)}
            </header>
            <div class="detail-decision-console" aria-label="Quick listening decision">
              <div class="detail-score-cluster">
                ${hasArchiveRating ? `<article class="detail-hero-score-card detail-score-card-archive"><span class="detail-meta-label">Archive Rating</span><strong class="detail-hero-score-value">${archiveRatingValue}</strong><span class="detail-meta-note">${archiveRatingNote}</span></article>` : ""}
                <article class="detail-hero-score-card detail-score-card-listener"><span class="detail-meta-label">Listener Review Score</span><strong class="detail-hero-score-value">${listenerReviewScore.value}</strong><span class="detail-meta-note">${listenerReviewScore.note}</span></article>
              </div>
              <div class="detail-meta-grid">
                <article class="detail-meta-card"><span class="detail-meta-label">Runtime</span><span class="detail-meta-value">${escapeHtml(getHeroRuntimeValue(show))}</span></article>
                <article class="detail-meta-card"><span class="detail-meta-label">Format</span><span class="detail-meta-value">${escapeHtml(toDisplayTag(show.formats?.[0] || "Not listed"))}</span></article>
                ${derivePublicStatus(show) ? `<article class="detail-meta-card"><span class="detail-meta-label">Status</span><span class="detail-meta-value">${escapeHtml(derivePublicStatus(show))}</span></article>` : ""}
              </div>
            </div>
            <div class="detail-actions">
              ${
                primaryLink
                  ? `<a class="detail-primary-action detail-listen-action" href="${escapeHtml(primaryLink.href)}" target="_blank" rel="noreferrer">${primaryLink.key === "start" ? "Start listening" : `Open ${escapeHtml(primaryLink.label)}`}</a>`
                  : hasListenLinks ? '<a class="detail-primary-action detail-listen-action" href="#facts-links" data-detail-anchor>Find listen links</a>' : ""
              }
              ${archiveTarget ? `<a class="detail-secondary-action" href="${archiveTarget}" data-detail-anchor>${show.reviewStatus === "full-review" ? "Archive review" : "Archive note"}</a>` : ""}
              ${hasListenLinks ? '<a class="detail-secondary-action" href="#facts-links" data-detail-anchor>Facts &amp; links</a>' : ""}
              <button class="detail-secondary-action detail-copy-link-button" data-share-action data-copy-link type="button">Share</button>
            </div>
            <p class="detail-copy-status" data-copy-link-status aria-live="polite"></p>
          </div>
          <div class="detail-cover-column">
            <div class="detail-cover-card">
              <img src="${escapeHtml(coverSrc)}"${renderResponsiveCoverAttributes(show, "(max-width: 959px) 84vw, 320px")} alt="${escapeHtml(show.coverAlt || `${show.title} cover art`)}" width="320" height="320" loading="eager" decoding="async" data-image-loading="eager" data-image-fetch-priority="high" />
            </div>
          </div>
        </div>
      </div>
      ${renderBestForStrip(show)}
    </section>
  `;
}

function getListenerReviewScore(summary = {}) {
  const reviewCount = Number(summary?.reviewCount);
  const averageRating = Number(summary?.averageRating);
  if (!Number.isInteger(reviewCount) || reviewCount < 1 || !Number.isFinite(averageRating) || averageRating < 0 || averageRating > 10) {
    return { value: "--/10", note: "No published listener reviews yet" };
  }
  return {
    value: `${averageRating.toFixed(1)}/10`,
    note: `from ${reviewCount} ${reviewCount === 1 ? "review" : "reviews"}`,
  };
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
  const bestFor = Array.isArray(show.bestFor) ? show.bestFor : [];
  if (bestFor.length === 0) {
    return "";
  }

  return `
    <section class="detail-best-for-strip" aria-label="Best for">
      <span class="detail-best-for-label">Best for</span>
      <div class="detail-best-for-list">
        ${bestFor
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
  const summary = getSummaryDescriptor(show);
  if (!summary) {
    return "";
  }

  return `
    <section class="detail-section detail-official-summary-section">
      <div class="detail-section-header"><div><h2>${escapeHtml(summary.title)}</h2><p>${escapeHtml(summary.description)}</p></div></div>
      <article class="detail-summary detail-summary-official"><p>${escapeHtml(summary.text)}</p>${summary.sourceUrl ? `<a class="detail-official-source" href="${escapeHtml(summary.sourceUrl)}" target="_blank" rel="noreferrer">View source</a>` : ""}</article>
    </section>
  `;
}

function hasArchiveReviewContent(show) {
  return [show.archiveTake, show.spoilerFreeReview, show.thoughts].some((value) => String(value || "").trim());
}

function renderArchiveReviewCard(show) {
  if (!hasArchiveReviewContent(show)) return "";
  const isFullReview = show.reviewStatus === "full-review";
  const reviewCopy = renderParagraphs(show.spoilerFreeReviewParagraphs, show.spoilerFreeReview);
  const reactionCopy = renderParagraphs(show.thoughtsParagraphs, show.thoughts);
  const archiveRating = normalizeArchiveRating(show.finalRating);
  const rating = archiveRating === null ? "Unrated" : `${formatRating(archiveRating)}/10`;
  return `
    <article class="detail-authored-review detail-archive-review">
      <header class="detail-authored-review-header">
        <div><span class="detail-review-kind">${isFullReview ? "Archive review" : "Archive note"}</span><h3>The Echo Archives</h3></div>
        <span class="detail-review-rating">${rating}</span>
      </header>
      ${show.archiveTake ? `<p class="detail-review-verdict"><span>Archive verdict</span>${escapeHtml(show.archiveTake)}</p>` : ""}
      ${reviewCopy ? `<div class="detail-review-prose">${reviewCopy}</div>` : ""}
      ${reactionCopy ? `<div class="detail-review-reaction">${reactionCopy}</div>` : ""}
    </article>
  `;
}

function renderIndexedArchiveNote(show) {
  if (show.reviewStatus === "full-review" || !hasArchiveReviewContent(show)) return "";
  const reviewCopy = renderParagraphs(show.spoilerFreeReviewParagraphs, show.spoilerFreeReview);
  const reactionCopy = renderParagraphs(show.thoughtsParagraphs, show.thoughts);
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

function renderListenerReviewCard(review) {
  const spoilerLevel = String(review?.spoilerLevel || "spoiler-free").trim();
  const hasSpoilers = spoilerLevel !== "spoiler-free";
  const reviewBody = `<div class="detail-review-prose">${renderParagraphs([], review?.body || "")}</div>`;
  const context = [
    Array.isArray(review?.bestFor) && review.bestFor.length ? `<span><b>Best for</b> ${review.bestFor.map(toDisplayTag).join(" • ")}</span>` : "",
    Array.isArray(review?.workedBest) && review.workedBest.length ? `<span><b>Worked best</b> ${review.workedBest.map(toDisplayTag).join(" • ")}</span>` : "",
  ].filter(Boolean).join("");
  return `
    <article class="detail-authored-review detail-listener-review" data-listener-review-id="${escapeHtml(review?.id || "")}">
      <header class="detail-authored-review-header">
        <div><span class="detail-review-kind">Listener review</span><h3>${escapeHtml(review?.title || "Listener review")}</h3><p class="detail-review-byline">${escapeHtml(review?.authorName || "Anonymous listener")} · ${escapeHtml(formatDate(review?.publishedAt || ""))}</p></div>
        <span class="detail-review-rating">${escapeHtml(String(review?.ratingStars || "--"))}/5</span>
      </header>
      <span class="detail-spoiler-label${hasSpoilers ? " is-warning" : ""}">${escapeHtml(toDisplayTag(spoilerLevel))}</span>
      ${hasSpoilers ? `<details class="detail-listener-spoilers"><summary>Reveal spoilers</summary>${reviewBody}</details>` : reviewBody}
      ${context ? `<div class="detail-review-context">${context}</div>` : ""}
      <div class="detail-review-community-actions"><button class="detail-review-helpful${review?.viewerMarkedHelpful ? " is-active" : ""}" type="button" data-review-helpful="${escapeHtml(review?.id || "")}" aria-pressed="${String(Boolean(review?.viewerMarkedHelpful))}">Helpful <span data-review-helpful-count>${Number(review?.helpfulCount || 0)}</span></button></div>
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

function visibleDotIndexes(totalSlides, currentIndex) {
  if (totalSlides <= 7) return Array.from({ length: totalSlides }, (_unused, index) => index);
  const indexes = new Set([0, totalSlides - 1]);
  for (let index = Math.max(1, currentIndex - 2); index <= Math.min(totalSlides - 2, currentIndex + 2); index += 1) indexes.add(index);
  return [...indexes].sort((left, right) => left - right);
}

function renderReviewDots(totalSlides, currentIndex) {
  const indexes = visibleDotIndexes(totalSlides, currentIndex);
  return indexes.map((index, position) => {
    const priorIndex = indexes[position - 1];
    const ellipsis = position > 0 && index - priorIndex > 1 ? '<span class="detail-review-carousel-ellipsis" aria-hidden="true">…</span>' : "";
    return `${ellipsis}<button type="button" class="detail-review-carousel-dot${index === currentIndex ? " is-active" : ""}" data-review-carousel-dot="${index}" aria-label="Show review ${index + 1} of ${totalSlides}" aria-current="${index === currentIndex ? "true" : "false"}"></button>`;
  }).join("");
}

function renderReviewSection(show, reviewData = {}) {
  const reviewPage = getReviewPage(reviewData);
  const isFullReview = show.reviewStatus === "full-review";
  const archiveCard = isFullReview ? renderArchiveReviewCard(show) : "";
  const hasArchive = Boolean(archiveCard);
  const initialListenerReview = reviewPage.reviews[0] || null;
  const totalListenerReviews = Number(reviewPage.pagination?.totalReviews || 0);
  if (!isFullReview && totalListenerReviews === 0) return "";
  const totalSlides = totalListenerReviews + (hasArchive ? 1 : 0);
  const initialCard = hasArchive ? archiveCard : initialListenerReview ? renderListenerReviewCard(initialListenerReview) : "";
  return `
    <section class="detail-section detail-review-section" id="review-notes" tabindex="-1">
      <div class="detail-section-header detail-review-section-header"><div><h2>Reviews</h2><p>Archive Rating is editorial. Listener Review Score averages published written reviews. Community Rating is a quick wider-community rating.</p></div><a class="detail-primary-action detail-primary-action-compact" href="${escapeHtml(createSubmissionHref("listener-review", show.id))}">Write a review</a></div>
      ${totalSlides === 0 ? `<div class="empty-state-card detail-reviews-empty-state"><p>No reviews are published for this show yet. Listener reviews are moderated before appearing here.</p><div class="empty-state-actions"><a class="detail-primary-action detail-primary-action-compact" href="${escapeHtml(createSubmissionHref("listener-review", show.id))}">Submit the first review</a></div></div>` : `
        <div class="detail-review-carousel" data-review-carousel data-show-id="${escapeHtml(show.id)}" data-has-archive="${String(hasArchive)}" data-listener-total="${totalListenerReviews}" data-current-index="0">
          <button type="button" class="detail-review-carousel-arrow is-previous" data-review-carousel-previous aria-label="Previous review" disabled>‹</button>
          <div class="detail-review-carousel-viewport" data-review-carousel-viewport tabindex="0" aria-label="Review carousel"><div data-review-carousel-slide>${initialCard}</div></div>
          <button type="button" class="detail-review-carousel-arrow is-next" data-review-carousel-next aria-label="Next review" ${totalSlides <= 1 ? "disabled" : ""}>›</button>
          <div class="detail-review-carousel-pagination"><div class="detail-review-carousel-dots" data-review-carousel-dots>${renderReviewDots(totalSlides, 0)}</div><p class="detail-review-carousel-status" data-review-carousel-status aria-live="polite">Review 1 of ${totalSlides}</p></div>
        </div>
      `}
    </section>
  `;
}

function renderFirstReviewCta(show, reviewData = {}) {
  const totalListenerReviews = Number(getReviewPage(reviewData).pagination?.totalReviews || 0);
  if (show.reviewStatus === "full-review" || totalListenerReviews > 0) return "";
  return `
    <section class="detail-section detail-first-review-card" aria-label="Listener review invitation">
      <p>Add your take to help listeners find their next show.</p>
      <a class="detail-primary-action detail-primary-action-compact" href="${escapeHtml(createSubmissionHref("listener-review", show.id))}">Be the first to review</a>
    </section>
  `;
}

function renderOverviewSection(show) {
  return renderOfficialSummarySection(show);
}

function renderImportedTransparency(show) {
  if (show.reviewStatus !== "imported") return "";
  return `
    <aside class="detail-imported-disclosure" aria-labelledby="imported-disclosure-title">
      <span class="detail-imported-signal" aria-hidden="true"></span>
      <div>
        <p class="detail-summary-kicker" id="imported-disclosure-title">Imported · source checked by automation</p>
        <p>Factual metadata was assembled from official feeds and directories and has not yet been individually checked by an archive maintainer. Ratings and listener reviews remain separate.</p>
      </div>
    </aside>
  `;
}

function renderCommunityFallback() {
  return `
    <section class="detail-section detail-community-slot detail-community-fallback" aria-busy="true" aria-live="polite">
      <div class="detail-section-header"><div><h2>Community Rating</h2><p>Quick ratings from the wider community. Archive Rating and Listener Review Score are separate.</p></div></div>
      <p class="detail-community-fallback-copy">Loading community rating…</p>
    </section>
  `;
}


function renderFactsLinksCard(show, { inline = false } = {}) {
  const primaryLink = getPrimaryListenLink(show);
  const links = show.listenLinks || {};
  const seasonsEpisodes = [
    typeof show.length?.seasons === "number" && show.length.seasons > 0 ? formatCount(show.length.seasons, "season") : "",
    typeof show.length?.episodes === "number" && show.length.episodes > 0 ? formatCount(show.length.episodes, "episode") : "",
  ].filter(Boolean).join(" • ");
  const creatorNetwork = getCreatorNetworkLabel(show);
  const verificationLabel = getPublicVerificationLabel(show.verification);
  const factCheck = verificationLabel
    ? `<div class="detail-fact-row"><dt>Fact check</dt><dd class="detail-fact-value"><div class="detail-verification-value"><span>${escapeHtml(verificationLabel)}</span><small>Factual metadata only</small></div></dd></div>`
    : "";
  const linkLabels = { start: "Start listening", website: "Website", apple: "Apple", spotify: "Spotify", rss: "RSS" };
  const linkChips = ["start", "website", "apple", "spotify", "rss"]
    .filter((key) => links[key] && links[key] !== primaryLink?.href)
    .map((key) => `<a class="detail-link-chip" href="${escapeHtml(links[key])}" target="_blank" rel="noreferrer">${linkLabels[key]}</a>`)
    .join("");
  const nextRelease = show.releaseDates?.next ? `<div class="detail-fact-row"><dt>Next release</dt><dd class="detail-fact-value">${escapeHtml(formatDate(show.releaseDates.next))}</dd></div>` : "";
  const cadence = String(show.metadata?.schedule?.label || "").trim();
  const cadenceRow = cadence && cadence !== "unknown" ? `<div class="detail-fact-row"><dt>Release cadence</dt><dd class="detail-fact-value">${escapeHtml(toDisplayTag(cadence))}</dd></div>` : "";
  const transcriptCount = Number(show.availability?.transcriptCoverage || 0);
  const transcriptDetails = [
    Array.isArray(show.availability?.transcriptLanguages) ? show.availability.transcriptLanguages.join(" • ") : "",
    Array.isArray(show.availability?.transcriptFormats) ? show.availability.transcriptFormats.join(" • ") : "",
  ].filter(Boolean).join(" • ");
  const transcriptRow = show.availability?.transcripts && show.availability.transcripts !== "unknown"
    ? `<div class="detail-fact-row is-wide"><dt>Transcripts</dt><dd class="detail-fact-value">${escapeHtml(show.availability.transcripts)}${transcriptDetails ? `<small> · ${escapeHtml(transcriptDetails)}</small>` : ""}${transcriptCount > 0 ? `<small> · ${escapeHtml(`${Math.round(transcriptCount * 100)}% observed coverage`)}</small>` : ""}</dd></div>`
    : "";
  const hasLinks = Object.values(links).some((href) => String(href || "").trim());
  const status = derivePublicStatus(show);
  const rows = [
    renderEntityFacts(show) || (!creatorNetwork.isEmpty ? `<div class="detail-fact-row"><dt>Creator / network</dt><dd class="detail-fact-value">${escapeHtml(creatorNetwork.text)}</dd></div>` : ""),
    factCheck,
    hasLinks ? `<div class="detail-fact-row is-wide"><dt>Official / listen links</dt><dd class="detail-fact-value"><div class="detail-link-cluster"><a class="detail-link-primary" href="${escapeHtml(primaryLink.href)}" target="_blank" rel="noreferrer">${primaryLink.key === "start" ? "Start listening" : `Open ${escapeHtml(primaryLink.label)}`}</a>${linkChips ? `<div class="detail-link-chip-row">${linkChips}</div>` : ""}</div></dd></div>` : "",
    status ? `<div class="detail-fact-row is-wide"><dt>Status</dt><dd class="detail-fact-value"><div class="detail-fact-pill-row"><span class="detail-fact-pill">${escapeHtml(status)}</span></div></dd></div>` : "",
    seasonsEpisodes ? `<div class="detail-fact-row"><dt>Seasons / episodes</dt><dd class="detail-fact-value">${escapeHtml(seasonsEpisodes)}</dd></div>` : "",
    show.releaseDates?.first ? `<div class="detail-fact-row"><dt>First release</dt><dd class="detail-fact-value">${escapeHtml(formatDate(show.releaseDates.first))}</dd></div>` : "",
    show.releaseDates?.latest ? `<div class="detail-fact-row"><dt>Latest release</dt><dd class="detail-fact-value">${escapeHtml(formatDate(show.releaseDates.latest))}</dd></div>` : "",
    nextRelease,
    cadenceRow,
    transcriptRow,
    show.length?.label ? `<div class="detail-fact-row is-wide"><dt>Runtime note</dt><dd class="detail-fact-value">${escapeHtml(show.length.label)}</dd></div>` : "",
  ].filter(Boolean);
  if (rows.length === 0) return "";
  return `
    <section class="${inline ? "detail-section detail-facts-links-card detail-facts-links-card--inline" : "detail-side-card detail-facts-links-card"}" id="facts-links" tabindex="-1">
      <div class="detail-side-card-header"><h2>Facts &amp; links</h2></div>
      <dl class="detail-fact-list">
        ${rows.join("")}
      </dl>
    </section>
  `;
}

function renderSimilarSection(show, showMap) {
  const neighbors = (show.similarTo || [])
    .map((id) => ({ neighbor: showMap.get(id), reason: String(show.similarReasons?.[id] || "").trim() }))
    .filter(({ neighbor, reason }) => neighbor && reason)
    .slice(0, 3);
  if (neighbors.length === 0) {
    return "";
  }

  return `
    <section class="detail-section detail-similar-section">
      <div class="detail-section-header"><div><h2>Try next</h2><p>Closest neighboring picks in the archive once you finish this one.</p></div></div>
      <div class="detail-similar-grid">
        ${neighbors
          .map(
            ({ neighbor, reason }) => `
              <article class="detail-similar-card">
                <img src="${escapeHtml(getShowImageSrc(neighbor))}"${renderResponsiveCoverAttributes(neighbor, "(max-width: 959px) 84vw, (max-width: 1120px) 42vw, 320px")} alt="${escapeHtml(neighbor.coverAlt || `${neighbor.title || "Untitled show"} cover art`)}" width="320" height="320" loading="lazy" decoding="async" />
                <div class="detail-card-copy"><h3>${escapeHtml(neighbor.title || "Untitled show")}</h3><p class="detail-similar-reason">${escapeHtml(reason)}</p><a class="detail-archive-link" href="${escapeHtml(neighbor.href || `/shows/${encodeURIComponent(neighbor.id || "")}`)}">Open show</a></div>
              </article>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderCollectionsSection(show, collections = [], showMap = new Map()) {
  const memberships = collections.filter((collection) => Array.isArray(collection.showIds) && collection.showIds.includes(show.id));
  if (memberships.length === 0) {
    return "";
  }
  const visibleMemberships = memberships.slice(0, 3);
  const hiddenMemberships = memberships.slice(3);
  const renderRoute = (collection) => {
    const coverShows = getCollectionCoverShows(collection, showMap);
    const accent = getCollectionAccent(coverShows);
    const accentStyle = accent ? ` style="--collection-accent: ${escapeHtml(accent)}"` : "";
    const art = coverShows.length
      ? `<span class="detail-collection-route-art collection-cover-collage" aria-hidden="true"${accentStyle}>${coverShows.map((coverShow, index) => `<span class="collection-cover-frame" data-cover-index="${index + 1}"><img src="${escapeHtml(getShowImageSrc(coverShow))}"${renderResponsiveCoverAttributes(coverShow, "(max-width: 640px) 116px, 168px")} alt="" width="168" height="168" loading="lazy" decoding="async" /></span>`).join("")}</span>`
      : '<span class="detail-collection-route-art is-empty" aria-hidden="true"></span>';
    return `<a class="detail-collection-route" href="/collections/${encodeURIComponent(collection.id)}">${art}<span class="detail-collection-route-copy"><span class="detail-collection-route-title">${escapeHtml(collection.title)}</span><span class="detail-collection-route-reason">${escapeHtml(collection.showReasons?.[show.id] || "Collection in the archive.")}</span></span></a>`;
  };
  return `
    <section class="detail-section detail-collections-section">
      <div class="detail-section-header"><div><h2>Collections</h2><p>Collections that include this show.</p></div></div>
      <div class="detail-collection-route-list">${visibleMemberships.map(renderRoute).join("")}</div>
      ${hiddenMemberships.length ? `<details class="detail-route-overflow"><summary>${formatRouteExpansion(hiddenMemberships.length)}</summary><div class="detail-route-overflow-grid">${hiddenMemberships.map(renderRoute).join("")}</div></details>` : ""}
    </section>
  `;
}

function getCollectionCoverShows(collection, showMap) {
  const showIds = [...(collection.coverShowIds || []), ...(collection.showIds || [])];
  const seen = new Set();

  return showIds
    .filter((showId) => {
      if (!showId || seen.has(showId)) {
        return false;
      }
      seen.add(showId);
      return true;
    })
    .map((showId) => showMap.get(showId))
    .filter(Boolean)
    .slice(0, 4);
}

function getCollectionAccent(coverShows) {
  const accent = coverShows.find((show) => /^#[0-9a-f]{3,8}$/i.test(String(show?.accent?.hex || "")))?.accent?.hex;
  return String(accent || "");
}

function renderCorrectionSection(show) {
  return `
    <section class="detail-section detail-correction-section" aria-labelledby="detail-correction-title">
      <div class="detail-correction-copy">
        <p class="detail-correction-kicker">Community archive care</p>
        <h2 id="detail-correction-title">Help keep this entry accurate.</h2>
        <p>Spot a metadata issue, missing link, or verification problem? Listener and creator notes go into the manual review queue before anything changes.</p>
      </div>
      <div class="detail-correction-action">
        <p class="detail-correction-action-label">Found something off?</p>
        <p>Send the archive team the exact issue and any source links that make it easier to verify.</p>
        <a class="detail-primary-action detail-primary-action-compact" href="${escapeHtml(createSubmissionHref("correction", show.id))}">Suggest a correction</a>
      </div>
    </section>
  `;
}

function renderCommunityScoreBreakdown(show, scoreSummary = {}) {
  const categories = [
    ["voiceActing", "Voice acting"],
    ["soundDesign", "Sound design"],
    ["story", "Story"],
    ["characters", "Characters"],
    ["ads", "Ad experience"],
    ["length", "Episode length & pacing"],
  ];
  const isFullReview = show.reviewStatus === "full-review";
  const visibleCategories = categories.filter(([key]) => {
    const summary = scoreSummary?.[key] || {};
    return Boolean(summary.isPublic) && Number.isFinite(Number(summary.averageRating));
  });
  const categoriesToRender = isFullReview ? categories : visibleCategories;
  if (categoriesToRender.length === 0) return "";
  return `
    <section class="detail-section detail-community-score-section" aria-labelledby="community-score-breakdown-title">
      <div class="detail-section-header"><div><h2 id="community-score-breakdown-title">Written review score breakdown</h2><p>Category averages use published listener reviews. They are separate from Archive Rating and quick Community Rating.</p></div><a class="detail-primary-action detail-primary-action-compact" href="${escapeHtml(createSubmissionHref("listener-review", show.id))}">Add your scores</a></div>
      <div class="detail-ratings-grid detail-community-ratings-grid">
        ${categoriesToRender.map(([key, label]) => {
          const summary = scoreSummary?.[key] || {};
          const ratingCount = Number(summary.ratingCount || 0);
          const average = Number(summary.averageRating);
          const isPublic = Boolean(summary.isPublic) && Number.isFinite(average);
          const remaining = Math.max(0, 3 - ratingCount);
          const display = isPublic ? `${average.toFixed(1)}/10` : "Building";
          const subline = isPublic ? formatCount(ratingCount, "rating") : remaining > 0 ? `${ratingCount} recorded · ${remaining} more to reveal` : `${ratingCount} recorded`;
          return `<article class="detail-rating-card detail-community-rating-card"><div class="detail-rating-topline"><span>${escapeHtml(label)}</span><span>${display}</span></div><div class="detail-rating-bar"><div class="detail-rating-fill" style="width: ${isPublic ? Math.max(0, Math.min(100, average * 10)) : 0}%"></div></div><p>${escapeHtml(subline)}</p></article>`;
        }).join("")}
      </div>
    </section>
  `;
}

function createShowPageMarkup(show, showMap, collections = [], reviewData = {}) {
  const isFullReview = show.reviewStatus === "full-review";
  const facts = renderFactsLinksCard(show, { inline: !isFullReview });
  return `
    <section class="detail-main podcast-detail detail-main--${isFullReview ? "full" : "indexed"}">
      ${renderDetailHero(show, reviewData)}
      <div class="detail-content-layout">
        <div class="detail-main-stack">
          <div class="detail-main-column">${renderImportedTransparency(show)}${renderOverviewSection(show)}${renderIndexedArchiveNote(show)}${renderReviewSection(show, reviewData)}${renderFirstReviewCta(show, reviewData)}${renderCommunityScoreBreakdown(show, reviewData?.scoreSummary)}${isFullReview ? "" : facts}</div>
        </div>
        ${renderCommunityFallback()}
        ${isFullReview && facts ? `<aside class="detail-side-rail">${facts}</aside>` : ""}
        ${renderMoreFrom(show, [...showMap.values()], (entry) => renderCollectionShowCard(entry))}
        ${renderSimilarSection(show, showMap)}
        ${renderCollectionsSection(show, collections, showMap)}
        ${renderCorrectionSection(show)}
      </div>
    </section>
  `;
}

function createMissingShowPageMarkup() {
  return `
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

function injectShowRootContent(html, content) {
  return html.replace(/<main\b([^>]*\bid="showRoot"[^>]*)>\s*<\/main>/i, `<main$1>${content}</main>`);
}

module.exports = {
  createMissingShowPageMarkup,
  createShowPageMarkup,
  injectShowRootContent,
};
