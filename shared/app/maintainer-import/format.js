import { escapeHtml, toDisplayTag, toLabel } from "../utils.js";
import { formatDateTime, renderBadge, renderLabeledLink } from "../maintainer/format.js";

const STATUS_TONES = {
  discovered: "neutral",
  hydrated: "accent",
  "needs-review": "warning",
  drafted: "warm",
  published: "good",
  duplicate: "muted",
  rejected: "muted",
};

const SCOPE_TONES = {
  "in-scope": "good",
  borderline: "warning",
  "out-of-scope": "muted",
};

export function getImportStatusTone(status = "") {
  return STATUS_TONES[status] || "neutral";
}

export function getScopeTone(scopeStatus = "") {
  return SCOPE_TONES[scopeStatus] || "neutral";
}

export function formatStatus(status = "") {
  return toLabel(status);
}

export function formatScopeStatus(scopeStatus = "") {
  return toLabel(scopeStatus);
}

export function formatSourceType(sourceType = "") {
  switch (sourceType) {
    case "podcast-index":
      return "Podcast Index";
    case "rss":
      return "RSS";
    case "apple":
      return "Apple";
    default:
      return toLabel(sourceType);
  }
}

export function formatConfidence(value) {
  if (!Number.isFinite(Number(value))) {
    return "";
  }

  return `${Math.round(Number(value) * 100)}%`;
}

export function summarizeImportCounts(counts = {}, total = 0) {
  return [
    {
      label: "Matching candidates",
      value: total,
      tone: "neutral",
    },
    {
      label: "Hydrated",
      value: counts.status?.hydrated || 0,
      tone: "accent",
    },
    {
      label: "Needs review",
      value: counts.status?.["needs-review"] || 0,
      tone: "warning",
    },
    {
      label: "Drafted",
      value: counts.status?.drafted || 0,
      tone: "warm",
    },
  ];
}

export function buildImportPreview(candidate) {
  return (
    candidate?.aiSuggestions?.shortDescription?.value ||
    candidate?.objective?.description ||
    candidate?.seedQuery ||
    "Imported candidate awaiting metadata hydration."
  );
}

export function renderSuggestionList(title, suggestions = []) {
  const rows = Array.isArray(suggestions) ? suggestions.filter((item) => item?.value) : [];
  if (rows.length === 0) {
    return "";
  }

  return `
    <section class="maintainer-detail-section">
      <h3>${escapeHtml(title)}</h3>
      <div class="import-suggestion-list">
        ${rows
          .map(
            (item) => `
              <article class="import-suggestion-chip">
                <strong>${escapeHtml(item.value)}</strong>
                ${item.confidence ? `<span>${escapeHtml(formatConfidence(item.confidence))}</span>` : ""}
              </article>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

export { escapeHtml, formatDateTime, renderBadge, renderLabeledLink, toDisplayTag };
