import { renderBadge, renderLabeledLink } from "../maintainer/format.js";
import { escapeHtml } from "./format.js";

function renderRows(rows = []) {
  const filtered = rows.filter(([, value]) => Boolean(value));
  if (!filtered.length) return "";
  return `<dl class="maintainer-detail-grid">${filtered.map(([label, value]) => `
    <div class="maintainer-detail-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(value))}</dd></div>
  `).join("")}</dl>`;
}

export function renderEditorialRecommendations(record = {}) {
  const recommendations = record.metadata?.import?.editorialRecommendations;
  if (!recommendations) return "";
  return `
    <section class="maintainer-detail-section">
      <div class="import-source-card-top"><div><h4>Editorial recommendations</h4><p>These values are staged for your review. They are not verified facts or signed maintainer approvals.</p></div>${renderBadge("Review pending", "warning")}</div>
      ${renderRows([
        ["Genres", (recommendations.genres || []).join(" • ")],
        ["Formats", (recommendations.formats || []).join(" • ")],
        ["Discovery tags", (recommendations.tags || []).join(" • ")],
        ["Release / completion", [recommendations.releaseStatus, recommendations.completionStatus].filter(Boolean).join(" / ")],
        ["Rationale", recommendations.rationale],
      ])}
      <div class="maintainer-link-list">${(recommendations.sources || []).map((source, index) => renderLabeledLink(`Recommendation source ${index + 1}`, source)).join("")}</div>
    </section>
  `;
}
