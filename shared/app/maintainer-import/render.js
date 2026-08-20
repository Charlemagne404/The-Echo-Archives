import { formatDateTime, renderBadge, renderLabeledLink } from "../maintainer/format.js";
import { renderQuickDetailsEditor } from "./details-editor.js";
import { renderExternalVerificationWorkspace } from "./external-verification.js";
import { renderImportReadiness } from "./readiness.js";
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
function renderListItem(candidate, isSelected, isBatchSelected = false) {
  const preview = buildImportPreview(candidate);
  const importedEligible = Boolean(candidate.status === "ready" && candidate.readiness?.publicationEligibility?.imported?.eligible);
  const importedExclusion = candidate.status === "ready" && !importedEligible
    ? candidate.readiness?.publicationEligibility?.imported?.blockers?.[0]?.message || "Imported eligibility checks are incomplete."
    : "";
  return `
    <article class="maintainer-list-item ${isSelected ? "is-selected" : ""}">
      ${importedEligible ? `<label class="maintainer-import-batch-check"><input type="checkbox" data-import-batch-select="${escapeHtml(candidate.id)}" ${isBatchSelected ? "checked" : ""} /><span>Select for Imported batch</span></label>` : ""}
      <button
        type="button"
        class="maintainer-list-item-select"
        data-import-candidate-id="${escapeHtml(candidate.id)}"
        ${isSelected ? 'aria-current="true"' : ""}
      >
        <span class="maintainer-list-item-top">
          <span class="maintainer-list-item-title">${escapeHtml(candidate.title || candidate.seedQuery || candidate.id)}</span>
          <span class="maintainer-list-item-badges">
            ${renderBadge(formatStatus(candidate.status), getImportStatusTone(candidate.status))}
            ${renderBadge(formatScopeStatus(candidate.scopeStatus), getScopeTone(candidate.scopeStatus))}
            ${candidate.hasDuplicateMatch ? renderBadge("Duplicate match", "muted") : ""}
            ${importedEligible ? renderBadge("Imported eligible", "good") : ""}
            ${importedExclusion ? renderBadge("Imported excluded", "warning") : ""}
          </span>
        </span>
        <span class="maintainer-list-item-meta">
          <span>${escapeHtml(formatSourceType(candidate.primarySourceType || "title"))}</span>
          <span>${escapeHtml(formatDateTime(candidate.updatedAt || candidate.createdAt))}</span>
        </span>
        <span class="maintainer-list-item-preview">${escapeHtml(preview)}${importedExclusion ? `<br /><strong>Batch exclusion:</strong> ${escapeHtml(importedExclusion)}` : ""}</span>
      </button>
    </article>
  `;
}
function renderSourceSnapshot(source) {
  const normalized = source.normalized || {};
  const rows = [
    ["Source", formatSourceType(source.sourceType)],
    ["Fetched", formatDateTime(source.fetchedAt)],
    ["Key", source.sourceKey],
    ["Title", normalized.title],
    ["Subtitle", normalized.subtitle],
    ["Creator", normalized.creatorName],
    ["Network", normalized.networkName],
    ["Language", normalized.language],
    ["RSS", normalized.rssUrl],
    ["Episodes", normalized.episodeCount],
    ["Full / bonus / trailer", normalized.episodeCounts ? `${normalized.episodeCounts.full || 0} / ${normalized.episodeCounts.bonus || 0} / ${normalized.episodeCounts.trailer || 0}` : ""],
    ["Avg episode", normalized.avgEpisodeMinutes ? `${normalized.avgEpisodeMinutes} min` : ""],
    ["Median / range", normalized.medianEpisodeMinutes ? `${normalized.medianEpisodeMinutes} min / ${normalized.minEpisodeMinutes || "?"}-${normalized.maxEpisodeMinutes || "?"} min` : ""],
    ["Seasons", normalized.seasonCount],
    ["Transcripts", normalized.transcripts?.episodeCount ? `${normalized.transcripts.episodeCount} episodes (${Math.round((normalized.transcripts.coverage || 0) * 100)}%)` : ""],
    ["People", (normalized.people || []).map((person) => `${person.name} (${person.role})`).join(" • ")],
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
    ["Subtitle", objective.subtitle],
    ["Creator", objective.creatorName || candidate.creatorName],
    ["Network", objective.networkName],
    ["Description", objective.description],
    ["Language", objective.languageDisplay || objective.language],
    ["Categories", (objective.categories || []).join(" • ")],
    ["Mapped genres", (candidate.preparedRecord?.genres || []).join(" • ")],
    ["Publisher keywords", (objective.keywords || []).join(" • ")],
    ["Approved discovery tags", (candidate.preparedRecord?.tags || []).join(" • ")],
    ["RSS", objective.rssUrl],
    ["Apple", objective.appleUrl],
    ["Spotify", objective.spotifyUrl],
    ["Website", objective.websiteUrl],
    ["Patreon", objective.patreonUrl],
    ["Discord", objective.discordUrl],
    ["YouTube", objective.youtubeUrl],
    ["Artwork", objective.artworkUrl],
    ["Episode count", objective.episodeCount],
    ["Season count", objective.seasonCount],
    ["Average episode length", objective.avgEpisodeMinutes ? `${objective.avgEpisodeMinutes} min` : ""],
    ["Feed type", objective.feedType],
    ["First release", objective.firstPublicationDate ? objective.firstPublicationDate.slice(0, 10) : ""],
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
        ${objective.spotifyUrl ? renderLabeledLink("Open Spotify", objective.spotifyUrl) : ""}
        ${objective.websiteUrl ? renderLabeledLink("Open website", objective.websiteUrl) : ""}
        ${objective.patreonUrl ? renderLabeledLink("Open Patreon", objective.patreonUrl) : ""}
        ${objective.discordUrl ? renderLabeledLink("Open Discord", objective.discordUrl) : ""}
        ${objective.youtubeUrl ? renderLabeledLink("Open YouTube", objective.youtubeUrl) : ""}
      </div>
    </section>
  `;
}

function renderConflicts(candidate) {
  const conflicts = candidate.conflicts || [];
  if (!conflicts.length) return "";
  return `
    <section class="maintainer-detail-section">
      <h3>Source conflicts</h3>
      ${conflicts.map((conflict) => `
        <article class="import-match-card">
          <strong>${escapeHtml(toDisplayTag(conflict.fieldName))}</strong>
          <p>${escapeHtml(conflict.message)}</p>
          ${(conflict.options || []).map((option) => `<pre>${escapeHtml(JSON.stringify(option, null, 2))}</pre>`).join("")}
        </article>
      `).join("")}
    </section>
  `;
}

function renderFieldEvidence(candidate) {
  const evidence = candidate.fieldEvidence || [];
  if (!evidence.length) return "";
  const groups = new Map();
  evidence.forEach((item) => {
    const key = item.fieldName;
    const group = groups.get(key) || [];
    if (!group.some((entry) => entry.normalizedValue === item.normalizedValue && entry.sourceType === item.sourceType)) group.push(item);
    groups.set(key, group);
  });
  return `
    <section class="maintainer-detail-section">
      <h3>Field provenance</h3>
      <div class="import-source-grid">
        ${[...groups.entries()].map(([fieldName, items]) => {
          const selected = candidate.provenance?.fields?.[fieldName];
          return `
            <article class="import-source-card">
              <div class="import-source-card-top">
                <h4>${escapeHtml(toDisplayTag(fieldName))}</h4>
                ${selected?.confidence ? renderBadge(formatConfidence(selected.confidence), selected.confidence >= 0.9 ? "good" : "neutral") : ""}
              </div>
              <p class="maintainer-panel-meta">${escapeHtml(selected?.method ? toDisplayTag(selected.method) : "Evidence collected")}</p>
              ${items.slice(0, 6).map((item) => `
                <div class="import-evidence-row">
                  <div><strong>${escapeHtml(formatSourceType(item.sourceType))}</strong> · ${escapeHtml(formatConfidence(item.confidence))}</div>
                  <p>${escapeHtml(typeof item.value === "string" ? item.value : JSON.stringify(item.value))}</p>
                  ${items.length > 1 ? `<button class="maintainer-ghost-button" type="button" data-import-evidence-id="${item.id}" data-import-evidence-field="${escapeHtml(fieldName)}">Select and lock</button>` : ""}
                </div>
              `).join("")}
            </article>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderPreparedRecord(candidate) {
  const record = candidate.preparedRecord || {};
  if (!record.id) return "";
  return `
    <section class="maintainer-detail-section">
      <h3>Prepared publication record</h3>
      ${renderRows([
        ["Mode", candidate.mode],
        ["Show ID", record.id],
        ["Review state", record.reviewStatus],
        ["Mapped genres", (record.genres || []).join(" • ")],
        ["Approved discovery tags", (record.tags || []).join(" • ")],
        ["Release / completion", `${record.releaseStatus} / ${record.completionStatus}`],
        ["Listen links", Object.values(record.listenLinks || {}).filter(Boolean).length],
        ["Update changes", candidate.readiness?.updateDiff?.length || ""],
      ])}
      <p>${escapeHtml(record.description || "")}</p>
      <details class="maintainer-raw-data"><summary>Preview complete JSON</summary><pre>${escapeHtml(JSON.stringify(record, null, 2))}</pre></details>
    </section>
  `;
}

export function renderImportSummaryCards(counts = {}, total = 0) {
  return summarizeImportCounts(counts, total).map(renderSummaryCard).join("");
}

export function renderImportQueueList({ items = [], selectedId = "", selectedBatchIds = new Set() }) {
  if (items.length === 0) {
    return `
      <div class="maintainer-empty-state">
        <h3>No import candidates match this view.</h3>
        <p>Seed new titles or widen the filters.</p>
      </div>
    `;
  }

  return items.map((candidate) => renderListItem(candidate, candidate.id === selectedId, selectedBatchIds.has(candidate.id))).join("");
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
  const importedEligible = Boolean(candidate.readiness?.publicationEligibility?.imported?.eligible);
  const indexedEligible = Boolean(candidate.readiness?.publicationEligibility?.indexedOnly?.eligible);
  const factsCurrent = Boolean(candidate.factsReviewedAt && Number(candidate.factsReviewedRevision) === Number(candidate.inputRevision));
  const isPublishedImported = candidate.status === "published" && candidate.preparedRecord?.reviewStatus === "imported";

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
        ${["rejected", "duplicate"].includes(candidate.status)
          ? '<button type="button" class="maintainer-primary-button" data-import-action="reopen">Reopen for preparation</button>'
          : `
            <button type="button" class="maintainer-ghost-button" data-import-action="hydrate">Re-run preparation</button>
            ${candidate.status === "failed" ? '<button type="button" class="maintainer-ghost-button" data-import-action="retry">Retry failed import</button>' : ""}
            <button type="button" class="maintainer-ghost-button" data-import-action="reject">Reject</button>
            <button type="button" class="maintainer-ghost-button" data-import-action="duplicate">Mark duplicate</button>
          `}
        ${candidate.status === "ready" && importedEligible ? '<button type="button" class="maintainer-primary-button" data-import-action="publish-imported">Publish as Imported</button>' : ""}
        ${candidate.status === "ready" && indexedEligible ? '<button type="button" class="maintainer-primary-button" data-import-action="publish-indexed">Publish as indexed-only</button>' : ""}
        ${["ready", "published"].includes(candidate.status) && !factsCurrent ? '<button type="button" class="maintainer-ghost-button" data-import-action="facts-review">Confirm factual review</button>' : ""}
        ${isPublishedImported && factsCurrent ? '<button type="button" class="maintainer-primary-button" data-import-action="promote">Promote to indexed-only</button>' : ""}
      </div>

      ${renderRows([
        ["Candidate ID", candidate.id],
        ["Seed query", candidate.seedQuery],
        ["Primary source", formatSourceType(candidate.primarySourceType || "title")],
        ["Primary source key", candidate.primarySourceKey],
        ["Primary source URL", candidate.primarySourceUrl],
        ["Import mode", candidate.mode],
        ["Discovery source", candidate.discoverySourceId],
        ["Discovery run", candidate.discoveryRunId],
        ["Existing show ID", candidate.existingShowId],
        ["Published show ID", candidate.publishedShowId],
        ["Factual review", factsCurrent ? `Current revision · ${formatDateTime(candidate.factsReviewedAt)}` : "Not confirmed for this revision"],
      ])}

      <form id="maintainerImportReviewForm" class="maintainer-review-form" data-import-candidate-id="${escapeHtml(candidate.id)}">
        ${renderExternalVerificationWorkspace(candidate)}
        ${renderQuickDetailsEditor(candidate)}
        <div class="maintainer-review-grid">
          <label class="maintainer-field">
            <span>Status</span>
            <select name="status">
              ${["queued", "processing", "ready", "needs-review", "failed", "published", "duplicate", "rejected"]
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

      ${renderImportReadiness(candidate)}
      ${renderPreparedRecord(candidate)}
      ${renderObjectiveSection(candidate)}
      ${renderDedupeMatches(candidate)}
      ${renderConflicts(candidate)}
      ${renderFieldEvidence(candidate)}

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
          provenance: candidate.provenance,
          dedupe: candidate.dedupe,
          readiness: candidate.readiness,
          sourceHealth: candidate.sourceHealth,
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

  const groups = ["queued", "processing", "ready", "needs-review", "failed", "published", "duplicate", "rejected"]
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
