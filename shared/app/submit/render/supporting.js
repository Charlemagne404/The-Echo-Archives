import { escapeAttribute, escapeHtml, iconMarkup } from "../utils.js";

export function renderOptionalDisclosure({ id, title, summary = "", open = false, content = "" }) {
  return `
    <details id="${escapeAttribute(id)}" class="submit-disclosure" data-draft-disclosure="${escapeAttribute(id)}" ${open ? "open" : ""}>
      <summary class="submit-disclosure-summary">
        <span>
          <strong>${escapeHtml(title)}</strong>
          ${summary ? `<span>${escapeHtml(summary)}</span>` : ""}
        </span>
        <span class="submit-disclosure-icon" aria-hidden="true">${iconMarkup("chevron-down")}</span>
      </summary>
      <div class="submit-disclosure-content">${content}</div>
    </details>
  `;
}

export function renderShowContext(context = {}) {
  if (!context.selectedShow) {
    return "";
  }

  const status = context.showContextStatus || "idle";
  if (status === "loading") {
    return `<div class="submit-current-show" data-state="loading" role="status">Loading current archive details…</div>`;
  }
  if (status === "error") {
    return `<div class="submit-current-show" data-state="error" role="status">${escapeHtml(context.showContextMessage || "Current details could not be loaded. You can still submit for the selected show.")}</div>`;
  }

  const show = context.showContext;
  if (!show) {
    return "";
  }
  const creators = Array.isArray(show.creators) ? show.creators.filter(Boolean).join(", ") : "";
  const links = [...(show.listenLinks || []), ...(show.officialLinks || [])]
    .filter((link, index, rows) => link?.url && rows.findIndex((entry) => entry.url === link.url) === index);

  return `
    <section class="submit-current-show" aria-labelledby="submitCurrentShowTitle">
      <div class="submit-current-show-heading">
        <span class="submit-current-show-icon" aria-hidden="true">${iconMarkup("archive")}</span>
        <div>
          <span class="submit-current-show-kicker">Current archive data</span>
          <h3 id="submitCurrentShowTitle">${escapeHtml(show.title || context.selectedShow.title)}</h3>
        </div>
      </div>
      <dl class="submit-current-show-facts">
        ${creators ? `<div><dt>Creator</dt><dd>${escapeHtml(creators)}</dd></div>` : ""}
        ${show.completionStatus ? `<div><dt>Status</dt><dd>${escapeHtml(show.completionStatus)}</dd></div>` : ""}
      </dl>
      ${show.officialDescription ? `<p class="submit-current-show-description">${escapeHtml(show.officialDescription)}</p>` : ""}
      ${links.length > 0 ? `<div class="submit-current-show-links" aria-label="Current official and listening links">${links.map((link) => `<a href="${escapeAttribute(link.url)}" target="_blank" rel="noreferrer">${escapeHtml(link.label || "Current link")}</a>`).join("")}</div>` : ""}
    </section>
  `;
}
