import { formatDateTime, renderBadge } from "../maintainer/format.js";
import { escapeHtml, formatSourceType, formatStatus, getImportStatusTone, toDisplayTag } from "./format.js";

function renderRows(rows = []) {
  return `
    <dl class="maintainer-detail-grid">
      ${rows.filter(([, value]) => Boolean(value)).map(([label, value]) => `
        <div class="maintainer-detail-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(value))}</dd></div>
      `).join("")}
    </dl>
  `;
}

export function renderImportDiscoveryWorkspace({ sources = [], runs = [], podcastIndexEnabled = false } = {}) {
  const sourceCards = sources.length
    ? sources.map((source) => `
      <article class="import-search-card">
        <div class="import-search-card-top"><div><h3>${escapeHtml(source.name)}</h3><p>${escapeHtml(formatSourceType(source.sourceType === "apple-search" ? "apple" : "podcast-index"))} search · ${escapeHtml(source.query)}</p></div><div class="maintainer-detail-badges">${renderBadge(source.enabled ? "Enabled" : "Paused", source.enabled ? "good" : "muted")}${renderBadge(toDisplayTag(source.lastStatus || "idle"), "neutral")}</div></div>
        ${renderRows([["Cadence", `Every ${source.intervalMinutes} min`], ["Items remembered", source.itemCount], ["Last checked", source.lastCheckedAt ? formatDateTime(source.lastCheckedAt) : "Not yet run"], ["Next run", source.nextRunAt ? formatDateTime(source.nextRunAt) : "Not scheduled"], ["Last error", source.lastError]])}
        <div class="maintainer-toolbar-actions"><button type="button" class="maintainer-primary-button" data-discovery-source-id="${escapeHtml(source.id)}" data-discovery-action="run">Run now</button><button type="button" class="maintainer-ghost-button" data-discovery-source-id="${escapeHtml(source.id)}" data-discovery-action="toggle">${source.enabled ? "Pause" : "Enable"}</button></div>
      </article>
    `).join("")
    : '<div class="maintainer-empty-state"><h3>No discovery sources configured.</h3><p>Add a focused Apple or Podcast Index search source. Previously seen results stay recorded.</p></div>';
  const runRows = runs.length
    ? runs.map((run) => `
      <article class="import-match-card"><div class="import-match-card-top"><strong>${escapeHtml(run.sourceName || run.sourceId)}</strong>${renderBadge(formatStatus(run.status), getImportStatusTone(run.status))}</div><p>${escapeHtml(formatDateTime(run.createdAt))} · ${escapeHtml(String(run.summary?.found || 0))} found · ${escapeHtml(String(run.summary?.candidateIds?.length || 0))} candidates linked</p>${run.error ? `<p>${escapeHtml(run.error)}</p>` : ""}</article>
    `).join("")
    : '<p class="maintainer-panel-meta">No discovery runs yet.</p>';
  return `<div class="maintainer-detail-stack"><p class="maintainer-panel-meta">${podcastIndexEnabled ? "Apple and Podcast Index sources are available." : "Apple sources are available. Podcast Index sources require configured credentials."}</p><div class="import-source-grid">${sourceCards}</div><section class="maintainer-detail-section"><h3>Recent discovery runs</h3><div class="import-match-list">${runRows}</div></section></div>`;
}
