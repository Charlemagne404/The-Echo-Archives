import { formatDateTime, renderBadge, renderLabeledLink } from "../maintainer/format.js";
import {
  buildImportPreview,
  escapeHtml,
  formatConfidence,
  formatScopeStatus,
  formatSourceType,
  formatStatus,
  getImportStatusTone,
  getScopeTone,
  renderSuggestionList,
  summarizeImportCounts,
  toDisplayTag,
} from "./format.js";

function renderSummaryCard(card) {
  return `
    <article class="page-card maintainer-summary-card is-${escapeHtml(card.tone || "neutral")}">
      <p class="maintainer-summary-label">${escapeHtml(card.label)}</p>
      <p class="maintainer-summary-value">${escapeHtml(String(card.value))}</p>
    </article>
  `;
}

function renderRows(rows = []) {
  const filtered = rows.filter(([, value]) => Boolean(value));
  if (filtered.length === 0) {
    return "";
  }

  return `
    <dl class="maintainer-detail-grid">
      ${filtered
        .map(
          ([label, value]) => `
            <div class="maintainer-detail-row">
              <dt>${escapeHtml(label)}</dt>
              <dd>${escapeHtml(String(value))}</dd>
            </div>
          `,
        )
        .join("")}
    </dl>
  `;
}

function renderListItem(candidate, isSelected) {
  const preview = buildImportPreview(candidate);

  return `
    <button
      type="button"
      class="maintainer-list-item ${isSelected ? "is-selected" : ""}"
      data-import-candidate-id="${escapeHtml(candidate.id)}"
    >
      <span class="maintainer-list-item-top">
        <span class="maintainer-list-item-title">${escapeHtml(candidate.title || candidate.seedQuery || candidate.id)}</span>
        <span class="maintainer-list-item-badges">
          ${renderBadge(formatStatus(candidate.status), getImportStatusTone(candidate.status))}
          ${renderBadge(formatScopeStatus(candidate.scopeStatus), getScopeTone(candidate.scopeStatus))}
          ${candidate.hasDuplicateMatch ? renderBadge("Duplicate match", "muted") : ""}
        </span>
      </span>
      <span class="maintainer-list-item-meta">
        <span>${escapeHtml(formatSourceType(candidate.primarySourceType || "title"))}</span>
        <span>${escapeHtml(formatDateTime(candidate.updatedAt || candidate.createdAt))}</span>
      </span>
      <span class="maintainer-list-item-preview">${escapeHtml(preview)}</span>
    </button>
  `;
}

function renderSourceSnapshot(source) {
  const normalized = source.normalized || {};
  const rows = [
    ["Source", formatSourceType(source.sourceType)],
    ["Fetched", formatDateTime(source.fetchedAt)],
    ["Key", source.sourceKey],
    ["Title", normalized.title],
    ["Creator", normalized.creatorName],
    ["Language", normalized.language],
    ["Episodes", normalized.episodeCount],
    ["Latest release", normalized.latestPublicationDate ? normalized.latestPublicationDate.slice(0, 10) : ""],
  ];

  return `
    <article class="import-source-card">
      <div class="import-source-card-top">
        <div>
          <h4>${escapeHtml(formatSourceType(source.sourceType))}</h4>
          <p>${escapeHtml(source.sourceUrl || source.sourceKey || "No source URL captured.")}</p>
        </div>
        <div class="maintainer-detail-badges">
          ${renderBadge(toDisplayTag(source.fetchStatus || "fetched"), "neutral")}
        </div>
      </div>
      ${renderRows(rows)}
      ${source.sourceUrl ? `<div class="maintainer-link-list">${renderLabeledLink("Open source", source.sourceUrl)}</div>` : ""}
      ${normalized.description ? `<p class="import-source-description">${escapeHtml(normalized.description)}</p>` : ""}
    </article>
  `;
}

function renderDedupeMatches(candidate) {
  const matches = candidate?.dedupe?.allMatches || [];
  if (matches.length === 0) {
    return "";
  }

  return `
    <section class="maintainer-detail-section">
      <h3>Duplicate checks</h3>
      <div class="import-match-list">
        ${matches
          .map(
            (match) => `
              <article class="import-match-card">
                <div class="import-match-card-top">
                  <strong>${escapeHtml(match.title || match.id)}</strong>
                  ${match.confidence ? `<span>${escapeHtml(formatConfidence(match.confidence))}</span>` : ""}
                </div>
                <p>${escapeHtml(`${toDisplayTag(match.kind)} via ${toDisplayTag(match.matchType)}`)}</p>
              </article>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderObjectiveSection(candidate) {
  const objective = candidate.objective || {};
  const rows = [
    ["Title", objective.title || candidate.title],
    ["Creator", objective.creatorName || candidate.creatorName],
    ["Description", objective.description],
    ["Language", objective.languageDisplay || objective.language],
    ["Categories", (objective.categories || []).join(" • ")],
    ["RSS", objective.rssUrl],
    ["Apple", objective.appleUrl],
    ["Website", objective.websiteUrl],
    ["Artwork", objective.artworkUrl],
    ["Episode count", objective.episodeCount],
    ["Latest release", objective.latestPublicationDate ? objective.latestPublicationDate.slice(0, 10) : ""],
    ["Research gaps", (objective.researchGaps || []).join(" • ")],
  ];

  return `
    <section class="maintainer-detail-section">
      <h3>Objective metadata</h3>
      ${renderRows(rows)}
      <div class="maintainer-link-list">
        ${objective.rssUrl ? renderLabeledLink("Open RSS", objective.rssUrl) : ""}
        ${objective.appleUrl ? renderLabeledLink("Open Apple page", objective.appleUrl) : ""}
        ${objective.websiteUrl ? renderLabeledLink("Open website", objective.websiteUrl) : ""}
      </div>
    </section>
  `;
}

function renderSuggestionSection(candidate) {
  const suggestions = candidate.aiSuggestions || {};
  const shortDescription = suggestions.shortDescription?.value
    ? `
      <section class="maintainer-detail-section">
        <h3>AI draft short description</h3>
        <p>${escapeHtml(suggestions.shortDescription.value)}</p>
        ${suggestions.shortDescription.confidence ? `<p class="maintainer-panel-meta">Confidence ${escapeHtml(formatConfidence(suggestions.shortDescription.confidence))}</p>` : ""}
      </section>
    `
    : "";

  return [
    shortDescription,
    renderSuggestionList("Suggested tags", suggestions.tags),
    renderSuggestionList("Suggested tones", suggestions.tones),
    renderSuggestionList("Suggested formats", suggestions.formats),
    renderSuggestionList("Suggested similar shows", suggestions.similarShowIds),
    suggestions.completionStatus?.value
      ? `
        <section class="maintainer-detail-section">
          <h3>Suggested completion status</h3>
          <p>${escapeHtml(suggestions.completionStatus.value)}</p>
          ${suggestions.completionStatus.confidence ? `<p class="maintainer-panel-meta">Confidence ${escapeHtml(formatConfidence(suggestions.completionStatus.confidence))}</p>` : ""}
        </section>
      `
      : "",
  ]
    .filter(Boolean)
    .join("");
}

export function renderImportSummaryCards(counts = {}, total = 0) {
  return summarizeImportCounts(counts, total).map(renderSummaryCard).join("");
}

export function renderImportQueueList({ items = [], selectedId = "" }) {
  if (items.length === 0) {
    return `
      <div class="maintainer-empty-state">
        <h3>No import candidates match this view.</h3>
        <p>Seed new titles or widen the filters.</p>
      </div>
    `;
  }

  return items.map((candidate) => renderListItem(candidate, candidate.id === selectedId)).join("");
}

export function renderImportSearchResults(results = []) {
  if (!Array.isArray(results) || results.length === 0) {
    return `
      <div class="maintainer-empty-state">
        <h3>No external results yet.</h3>
        <p>Search Apple or Podcast Index to add machine-found candidates.</p>
      </div>
    `;
  }

  return `
    <div class="import-search-results">
      ${results
        .map(
          (result, index) => `
            <article class="import-search-card">
              <div class="import-search-card-top">
                <div>
                  <h3>${escapeHtml(result.title || "Untitled result")}</h3>
                  <p>${escapeHtml(result.creatorName || "Creator unknown")}</p>
                </div>
                <div class="maintainer-detail-badges">
                  ${renderBadge(formatSourceType(result.sourceType || "unknown"), "neutral")}
                </div>
              </div>
              <p class="maintainer-list-item-preview">${escapeHtml(result.objective?.description || "No description returned by this source.")}</p>
              <div class="maintainer-link-list">
                ${result.sourceUrl ? renderLabeledLink("Open source", result.sourceUrl) : ""}
                ${result.objective?.rssUrl ? renderLabeledLink("Open RSS", result.objective.rssUrl) : ""}
              </div>
              <div class="maintainer-toolbar-actions">
                <button type="button" class="maintainer-primary-button" data-import-add-result-index="${index}">Add candidate</button>
              </div>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

export function renderImportDetailPane({ candidate = null, storedReviewer = "" }) {
  if (!candidate) {
    return `
      <div class="maintainer-empty-state">
        <h3>No candidate selected.</h3>
        <p>Choose an import candidate from the queue to inspect it.</p>
      </div>
    `;
  }

  const reviewedBy = candidate.reviewedBy || storedReviewer || "";
  const preview = buildImportPreview(candidate);

  return `
    <div class="maintainer-detail-stack">
      <div class="maintainer-detail-header">
        <div>
          <h3>${escapeHtml(candidate.title || candidate.seedQuery || candidate.id)}</h3>
          <p>${escapeHtml(preview)}</p>
        </div>
        <div class="maintainer-detail-badges">
          ${renderBadge(formatStatus(candidate.status), getImportStatusTone(candidate.status))}
          ${renderBadge(formatScopeStatus(candidate.scopeStatus), getScopeTone(candidate.scopeStatus))}
          ${candidate.hasDuplicateMatch ? renderBadge("Duplicate match", "muted") : ""}
        </div>
      </div>

      <div class="import-action-row">
        <button type="button" class="maintainer-ghost-button" data-import-action="hydrate">Hydrate</button>
        <button type="button" class="maintainer-ghost-button" data-import-action="reject">Reject</button>
        <button type="button" class="maintainer-ghost-button" data-import-action="duplicate">Mark duplicate</button>
        <button type="button" class="maintainer-primary-button" data-import-action="draft">Write draft</button>
        <button type="button" class="maintainer-primary-button" data-import-action="publish" ${candidate.draftedShowId ? "" : "disabled"}>Publish</button>
      </div>

      ${renderRows([
        ["Candidate ID", candidate.id],
        ["Seed query", candidate.seedQuery],
        ["Primary source", formatSourceType(candidate.primarySourceType || "title")],
        ["Primary source key", candidate.primarySourceKey],
        ["Primary source URL", candidate.primarySourceUrl],
        ["Draft show ID", candidate.draftedShowId],
        ["Published show ID", candidate.publishedShowId],
      ])}

      <form id="maintainerImportReviewForm" class="maintainer-review-form" data-import-candidate-id="${escapeHtml(candidate.id)}">
        <div class="maintainer-review-grid">
          <label class="maintainer-field">
            <span>Status</span>
            <select name="status">
              ${["discovered", "hydrated", "needs-review", "drafted", "published", "duplicate", "rejected"]
                .map(
                  (value) => `
                    <option value="${value}" ${candidate.status === value ? "selected" : ""}>${escapeHtml(formatStatus(value))}</option>
                  `,
                )
                .join("")}
            </select>
          </label>
          <label class="maintainer-field">
            <span>Scope</span>
            <select name="scopeStatus">
              ${["in-scope", "borderline", "out-of-scope"]
                .map(
                  (value) => `
                    <option value="${value}" ${candidate.scopeStatus === value ? "selected" : ""}>${escapeHtml(formatScopeStatus(value))}</option>
                  `,
                )
                .join("")}
            </select>
          </label>
          <label class="maintainer-field">
            <span>Reviewed by</span>
            <input name="reviewedBy" type="text" value="${escapeHtml(reviewedBy)}" placeholder="Initials or maintainer name" />
          </label>
        </div>
        <div class="maintainer-review-grid">
          <label class="maintainer-field">
            <span>Duplicate of show ID</span>
            <input name="duplicateOfShowId" type="text" value="${escapeHtml(candidate.duplicateOfShowId || "")}" placeholder="existing-show-id" />
          </label>
          <label class="maintainer-field">
            <span>Duplicate of candidate ID</span>
            <input name="duplicateOfCandidateId" type="text" value="${escapeHtml(candidate.duplicateOfCandidateId || "")}" placeholder="candidate-id" />
          </label>
        </div>
        <label class="maintainer-field">
          <span>Review notes</span>
          <textarea name="reviewNotes" rows="7" placeholder="Internal import notes, duplicate reasoning, or publish blockers.">${escapeHtml(candidate.reviewNotes || "")}</textarea>
        </label>
        <div class="maintainer-review-actions">
          <button class="maintainer-primary-button" type="submit">Save review state</button>
          <p class="maintainer-panel-meta">${escapeHtml(candidate.reviewedAt ? `Last reviewed ${formatDateTime(candidate.reviewedAt)}` : "No review timestamp yet.")}</p>
        </div>
      </form>

      ${renderObjectiveSection(candidate)}
      ${renderDedupeMatches(candidate)}
      ${renderSuggestionSection(candidate)}

      <section class="maintainer-detail-section">
        <h3>Source snapshots</h3>
        <div class="import-source-grid">
          ${(candidate.sources || []).map(renderSourceSnapshot).join("") || '<p class="maintainer-panel-meta">No source snapshots captured yet.</p>'}
        </div>
      </section>

      <details class="maintainer-raw-data">
        <summary>Raw candidate payload</summary>
        <pre>${escapeHtml(JSON.stringify({
          objective: candidate.objective,
          aiSuggestions: candidate.aiSuggestions,
          provenance: candidate.provenance,
          dedupe: candidate.dedupe,
        }, null, 2))}</pre>
      </details>
    </div>
  `;
}

export function renderImportReportContent({ counts = {}, items = [], total = 0, filterSummary = "" }) {
  if (items.length === 0) {
    return `
      <article class="page-card maintainer-report-card">
        <h2>No matching import candidates</h2>
        <p>${escapeHtml(filterSummary || "This report is empty for the current filters.")}</p>
      </article>
    `;
  }

  const groups = ["discovered", "hydrated", "needs-review", "drafted", "published", "duplicate", "rejected"]
    .map((status) => ({
      status,
      items: items.filter((candidate) => candidate.status === status),
    }))
    .filter((group) => group.items.length > 0);

  return `
    <article class="page-card maintainer-report-card">
      <div class="maintainer-report-summary">
        <div>
          <p class="maintainer-kicker">Snapshot summary</p>
          <h2>${escapeHtml(String(total))} matching candidates</h2>
        </div>
        <p>${escapeHtml(filterSummary)}</p>
      </div>
      <div class="maintainer-report-counts">
        ${Object.entries(counts.status || {})
          .map(([status, count]) => `<span>${escapeHtml(formatStatus(status))}: ${escapeHtml(String(count))}</span>`)
          .join("")}
      </div>
    </article>
    ${groups
      .map(
        (group) => `
          <section class="page-card maintainer-report-card">
            <div class="maintainer-report-group-heading">
              <h2>${escapeHtml(formatStatus(group.status))}</h2>
              <p>${escapeHtml(String(group.items.length))} candidates</p>
            </div>
            <div class="maintainer-report-group">
              ${group.items
                .map(
                  (candidate) => `
                    <article class="maintainer-report-entry">
                      <div class="maintainer-report-entry-top">
                        <div>
                          <h3>${escapeHtml(candidate.title || candidate.seedQuery || candidate.id)}</h3>
                          <p>${escapeHtml(formatSourceType(candidate.primarySourceType || "title"))} · ${escapeHtml(formatDateTime(candidate.updatedAt || candidate.createdAt))}</p>
                        </div>
                        <div class="maintainer-detail-badges">
                          ${renderBadge(formatScopeStatus(candidate.scopeStatus), getScopeTone(candidate.scopeStatus))}
                        </div>
                      </div>
                      <p class="maintainer-report-preview">${escapeHtml(buildImportPreview(candidate))}</p>
                      ${renderRows([
                        ["Candidate ID", candidate.id],
                        ["Draft show ID", candidate.draftedShowId],
                        ["Published show ID", candidate.publishedShowId],
                        ["Review notes", candidate.reviewNotes],
                      ])}
                    </article>
                  `,
                )
                .join("")}
            </div>
          </section>
        `,
      )
      .join("")}
  `;
}
