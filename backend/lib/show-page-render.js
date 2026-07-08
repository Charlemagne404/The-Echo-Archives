function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toDisplayTag(value = "") {
  return String(value)
    .split(/[-\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function formatRating(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "--";
  }

  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
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
    return value || "Not cataloged yet";
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
    "Archive perspective is still being expanded. This entry stays live because the show is already useful in the discovery graph."
  );
}

function getCreatorNames(show) {
  const creators = Array.isArray(show.creators) ? show.creators : [];
  const creditedCreator = show.credits?.creatorName ? [show.credits.creatorName] : [];
  return [...creators, ...creditedCreator].map((entry) => String(entry || "").trim()).filter(Boolean);
}

function getNetworkLabel(show) {
  return String(show.credits?.network || show.networkId || "").trim();
}

function getCreatorNetworkLabel(show) {
  const text = [...getCreatorNames(show), getNetworkLabel(show)].filter(Boolean).join(" • ");
  return text || "Not cataloged yet";
}

function getPrimaryListenLink(show) {
  const links = show.listenLinks || {};
  const labels = { website: "Website", apple: "Apple", spotify: "Spotify", rss: "RSS" };
  for (const key of ["website", "apple", "spotify", "rss"]) {
    if (links[key]) {
      return { href: links[key], label: labels[key] || toDisplayTag(key) };
    }
  }

  return null;
}

function renderDetailHero(show) {
  const primaryLink = getPrimaryListenLink(show);
  const firstTag = Array.isArray(show.tags) ? show.tags[0] : "";
  const firstGenre = Array.isArray(show.genres) ? show.genres[0] : "";
  const statusChips = [
    Number(show.finalRating || 0) >= 9 ? '<span class="detail-status-chip is-accent">Top rated</span>' : "",
    show.reviewStatus ? `<span class="detail-status-chip">${escapeHtml(toDisplayTag(show.reviewStatus))}</span>` : "",
    firstTag ? `<span class="detail-status-chip">${escapeHtml(toDisplayTag(firstTag))}</span>` : "",
  ].join("");

  return `
    <section class="detail-hero-shell">
      <div class="detail-hero-panel" style="--detail-cover-image: url('${escapeHtml(show.cover)}');">
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
                <article class="detail-hero-score-card detail-score-card-archive">
                  <span class="detail-meta-label">Archive rating</span>
                  <strong class="detail-hero-score-value">${formatRating(show.finalRating)}/10</strong>
                  <span class="detail-meta-note">Echo score</span>
                </article>
                <article class="detail-hero-score-card detail-meta-card-community">
                  <span class="detail-meta-label">Community rating</span>
                  <strong class="detail-hero-score-value" data-community-hero-rating>--/10</strong>
                  <span class="detail-meta-note" data-community-hero-count>No ratings yet</span>
                </article>
              </div>
              <div class="detail-meta-grid">
                <article class="detail-meta-card"><span class="detail-meta-label">Runtime</span><span class="detail-meta-value">${escapeHtml(show.length?.label || "Runtime being cataloged")}</span></article>
                <article class="detail-meta-card"><span class="detail-meta-label">Format</span><span class="detail-meta-value">${escapeHtml(toDisplayTag(show.formats?.[0] || "Not cataloged"))}</span></article>
                <article class="detail-meta-card"><span class="detail-meta-label">Completion</span><span class="detail-meta-value">${escapeHtml(toDisplayTag(show.completionStatus || "unclear"))}</span></article>
                <article class="detail-meta-card"><span class="detail-meta-label">Release status</span><span class="detail-meta-value">${escapeHtml(toDisplayTag(show.releaseStatus || "unknown"))}</span></article>
              </div>
            </div>
            <div class="detail-actions">
              ${
                primaryLink
                  ? `<a class="detail-primary-action detail-listen-action" href="${escapeHtml(primaryLink.href)}" target="_blank" rel="noreferrer">Open ${escapeHtml(primaryLink.label)}</a>`
                  : '<a class="detail-primary-action detail-listen-action" href="#facts-links">Find listen links</a>'
              }
              <a class="detail-secondary-action" href="#review-notes">Review notes</a>
              <a class="detail-secondary-action" href="#facts-links">Facts &amp; links</a>
              <button class="detail-secondary-action detail-copy-link-button" data-share-action data-copy-link type="button">Share</button>
            </div>
            <p class="detail-copy-status" data-copy-link-status aria-live="polite"></p>
          </div>
          <div class="detail-cover-column">
            <div class="detail-cover-card">
              <img src="/${escapeHtml(show.cover)}" alt="${escapeHtml(show.coverAlt || `${show.title} cover art`)}" width="320" height="320" loading="eager" decoding="async" data-image-loading="eager" data-image-fetch-priority="high" />
            </div>
          </div>
        </div>
      </div>
      ${renderBestForStrip(show)}
    </section>
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
                <span class="detail-best-for-icon" aria-hidden="true"></span>
                <span class="detail-best-for-text">${escapeHtml(toDisplayTag(value))}</span>
              </article>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderOfficialSummarySection(show) {
  const summaryText = String(show.description || show.subtitle || "").trim() || "Official summary not cataloged yet.";
  return `
    <section class="detail-section detail-official-summary-section">
      <div class="detail-section-header"><div><h2>Official summary</h2><p>The listener-facing setup and premise for the show, kept separate from the archive take.</p></div></div>
      <article class="detail-summary detail-summary-official"><p>${escapeHtml(summaryText)}</p></article>
    </section>
  `;
}

function renderReviewSection(show) {
  if (show.reviewStatus === "full-review") {
    return `
      <section class="detail-section" id="review-notes">
        <div class="detail-section-header"><div><h2>Review notes</h2><p>The longer spoiler-free archive read, plus the more personal reaction once the basics are clear.</p></div></div>
        <div class="detail-review-grid">
          <article class="detail-summary"><h3>Spoiler-free review</h3>${renderParagraphs(show.spoilerFreeReviewParagraphs, show.spoilerFreeReview || show.description)}</article>
          <article class="detail-thoughts"><h3>Archive reaction</h3>${renderParagraphs(show.thoughtsParagraphs, show.thoughts || getArchivePerspectiveText(show))}</article>
        </div>
      </section>
    `;
  }

  return `
    <section class="detail-section" id="review-notes">
      <div class="detail-section-header"><div><h2>Archive note</h2><p>Indexed and recommendation-ready, with the longer archive review still unpublished.</p></div></div>
      <div class="detail-review-grid detail-review-grid-single">
        <article class="detail-summary detail-archive-note-summary"><span class="detail-summary-kicker">Why it is here</span><p>${escapeHtml(getArchivePerspectiveText(show))}</p></article>
      </div>
    </section>
  `;
}

function renderOverviewSection(show) {
  if (show.reviewStatus !== "full-review") {
    return "";
  }

  return `
    <section class="detail-section detail-overview-section">
      <div class="detail-section-header">
        <div>
          <h2>Spoiler-free review summary</h2>
          <p>Quick context before you drop into the longer archive notes.</p>
        </div>
      </div>
      <div class="detail-overview-grid detail-overview-grid-single">
        <article class="detail-summary">
          ${renderParagraphs(show.spoilerFreeReviewParagraphs, show.spoilerFreeReview || show.description)}
        </article>
      </div>
    </section>
  `;
}

function renderListenerReviewsSection(show) {
  return `
    <section class="detail-section detail-listener-reviews-section" id="listener-reviews">
      <div class="detail-section-header"><div><h2>Listener reviews</h2><p>Community reviews stay separate from archive ratings and creator verification.</p></div></div>
      <div class="empty-state-card detail-reviews-empty-state">
        <p>No listener reviews are published for this show yet. The archive rating above is editorial; this section stays reserved for moderated listener response.</p>
        <div class="empty-state-actions">
          <a class="detail-primary-action detail-primary-action-compact" href="${escapeHtml(createSubmissionHref("listener-review", show.id))}">Submit the first review</a>
          <a class="detail-secondary-action" href="#review-notes">Read archive notes</a>
        </div>
      </div>
    </section>
  `;
}

function renderFactsLinksCard(show) {
  const primaryLink = getPrimaryListenLink(show);
  const links = show.listenLinks || {};
  const seasonsEpisodes = [
    typeof show.length?.seasons === "number" ? `${show.length.seasons} seasons` : "",
    typeof show.length?.episodes === "number" ? `${show.length.episodes} episodes` : "",
  ].filter(Boolean).join(" • ") || "Not cataloged yet";
  const factCheck = show.verification?.status
    ? `<div class="detail-fact-row"><dt>Fact check</dt><dd class="detail-fact-value"><div class="detail-verification-value"><span>${escapeHtml(toDisplayTag(show.verification.status))}</span><small>Factual metadata only</small></div></dd></div>`
    : "";
  const linkLabels = { website: "Website", apple: "Apple", spotify: "Spotify", rss: "RSS" };
  const linkChips = ["website", "apple", "spotify", "rss"]
    .map((key) =>
      links[key]
        ? `<a class="detail-link-chip" href="${escapeHtml(links[key])}" target="_blank" rel="noreferrer">${linkLabels[key]}</a>`
        : `<span class="detail-link-chip is-disabled" aria-disabled="true">${linkLabels[key]}</span>`,
    )
    .join("");
  return `
    <section class="detail-side-card detail-facts-links-card" id="facts-links">
      <div class="detail-side-card-header"><h2>Facts &amp; links</h2></div>
      <dl class="detail-fact-list">
        <div class="detail-fact-row"><dt>Creator / network</dt><dd class="detail-fact-value">${escapeHtml(getCreatorNetworkLabel(show))}</dd></div>
        ${factCheck}
        <div class="detail-fact-row"><dt>Official / listen links</dt><dd class="detail-fact-value">${
          primaryLink
            ? `<div class="detail-link-cluster"><a class="detail-link-primary" href="${escapeHtml(primaryLink.href)}" target="_blank" rel="noreferrer">Open ${escapeHtml(primaryLink.label)}</a><div class="detail-link-chip-row">${linkChips}</div></div>`
            : '<p class="detail-link-status is-empty">Links being verified</p>'
        }</dd></div>
        <div class="detail-fact-row"><dt>Status</dt><dd class="detail-fact-value">${escapeHtml(toDisplayTag(show.releaseStatus || "unknown"))} • ${escapeHtml(toDisplayTag(show.completionStatus || "unclear"))}</dd></div>
        <div class="detail-fact-row"><dt>Seasons / episodes</dt><dd class="detail-fact-value">${escapeHtml(seasonsEpisodes)}</dd></div>
        <div class="detail-fact-row"><dt>First release</dt><dd class="detail-fact-value">${escapeHtml(formatDate(show.releaseDates?.first))}</dd></div>
        <div class="detail-fact-row"><dt>Latest release</dt><dd class="detail-fact-value">${escapeHtml(formatDate(show.releaseDates?.latest))}</dd></div>
      </dl>
    </section>
  `;
}

function renderSimilarSection(show, showMap) {
  const neighbors = (show.similarTo || [])
    .map((id) => showMap.get(id))
    .filter(Boolean)
    .slice(0, 3);
  if (neighbors.length === 0) {
    return "";
  }

  return `
    <section class="detail-section detail-similar-section">
      <div class="detail-section-header"><div><h2>Start next</h2><p>Closest neighboring picks in the archive once you finish this one.</p></div></div>
      <div class="detail-similar-grid">
        ${neighbors
          .map(
            (neighbor) => `
              <article class="detail-similar-card">
                <img src="${escapeHtml(getShowImageSrc(neighbor))}" alt="${escapeHtml(neighbor.coverAlt || `${neighbor.title || "Untitled show"} cover art`)}" width="320" height="320" loading="lazy" decoding="async" />
                <div class="detail-card-copy"><h3>${escapeHtml(neighbor.title || "Untitled show")}</h3><p>${escapeHtml(neighbor.archiveTake || neighbor.description || "Description not cataloged yet.")}</p><a class="detail-archive-link" href="${escapeHtml(neighbor.href || `/show?id=${neighbor.id || ""}`)}">Open show</a></div>
              </article>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderCollectionsSection(show, collections = []) {
  const memberships = collections.filter((collection) => Array.isArray(collection.showIds) && collection.showIds.includes(show.id));
  return `
    <section class="detail-section detail-collections-section">
      <div class="detail-section-header"><div><h2>Discovery routes</h2><p>Curated listening paths already connected to this show in the archive.</p></div></div>
      ${
        memberships.length > 0
          ? `<div class="detail-collection-route-list">${memberships
              .map((collection) => `<a class="detail-collection-route" href="/collection?id=${encodeURIComponent(collection.id)}"><span class="detail-collection-route-title">${escapeHtml(collection.title)}</span><span class="detail-collection-route-reason">${escapeHtml(collection.showReasons?.[show.id] || "Curated route in the archive.")}</span></a>`)
              .join("")}</div>`
          : '<p class="detail-side-note">No collection routes have been published for this show yet.</p>'
      }
    </section>
  `;
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

function createShowPageMarkup(show, showMap, collections = []) {
  return `
    <section class="detail-main podcast-detail">
      ${renderDetailHero(show)}
      <div class="detail-content-layout">
        <div class="detail-main-stack">
          ${renderOfficialSummarySection(show)}
          <div class="detail-main-column">${renderOverviewSection(show)}${renderReviewSection(show)}${renderListenerReviewsSection(show)}</div>
        </div>
        <div class="detail-community-slot"></div>
        <aside class="detail-side-rail">
          <section class="detail-side-card detail-archive-take-card"><div class="detail-side-card-header"><h2>Archive take</h2></div><p>${escapeHtml(getArchivePerspectiveText(show))}</p></section>
          ${renderFactsLinksCard(show)}
        </aside>
        ${renderSimilarSection(show, showMap)}
        ${renderCollectionsSection(show, collections)}
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
