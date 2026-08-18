import { renderBadge } from "../maintainer/format.js";
import { escapeHtml, toDisplayTag } from "./format.js";

export function renderImportReadiness(candidate) {
  const readiness = candidate.readiness || {};
  const blockers = readiness.blockers || [];
  const warnings = readiness.warnings || [];
  const cover = candidate.coverStage || {};
  const imported = readiness.publicationEligibility?.imported || { eligible: false, blockers: [] };
  const indexed = readiness.publicationEligibility?.indexedOnly || { eligible: false, blockers: [] };
  return `
    <section class="maintainer-detail-section import-readiness-card">
      <div class="import-source-card-top">
        <div>
          <h3>${readiness.ready ? "Review and publish" : "Preparation blockers"}</h3>
          <p>${readiness.ready ? "All factual publication checks passed. Inspect the prepared record, then approve it." : "The importer has named every issue that still prevents publication."}</p>
        </div>
        ${renderBadge(readiness.ready ? "Ready" : `${blockers.length} blockers`, readiness.ready ? "good" : "warning")}
      </div>
      ${blockers.length ? `<ul>${blockers.map((item) => `<li><strong>${escapeHtml(toDisplayTag(item.field || item.code))}:</strong> ${escapeHtml(item.message)}</li>`).join("")}</ul>` : ""}
      ${warnings.length ? `<details><summary>${warnings.length} optional gaps</summary><ul>${warnings.map((item) => `<li>${escapeHtml(item.message || item)}</li>`).join("")}</ul></details>` : ""}
      <div class="import-tier-readiness-grid">
        <article><strong>Imported publication</strong>${renderBadge(imported.eligible ? "Eligible" : "Blocked", imported.eligible ? "good" : "warning")}${imported.blockers.length ? `<ul>${imported.blockers.map((item) => `<li>${escapeHtml(item.message)}</li>`).join("")}</ul>` : `<p>Structured automated evidence meets the higher batch threshold.</p>`}</article>
        <article><strong>Indexed-only publication</strong>${renderBadge(indexed.eligible ? "Eligible" : "Needs factual review", indexed.eligible ? "good" : "neutral")}${indexed.blockers.length ? `<ul>${indexed.blockers.map((item) => `<li>${escapeHtml(item.message)}</li>`).join("")}</ul>` : `<p>The current candidate revision has been checked by a maintainer.</p>`}</article>
      </div>
      ${cover.sourceUrl ? `
        <div class="import-cover-preview">
          <img src="${escapeHtml(cover.sourceUrl)}" alt="Staged cover preview" width="112" height="112" loading="lazy" decoding="async" />
          <p>${escapeHtml(`${cover.width || "?"} x ${cover.height || "?"} · ${cover.contentType || "unknown format"} · ${cover.byteSize || 0} bytes`)}</p>
          <p>${cover.appleQuality ? "Meets Apple cover quality target." : "Echo-publishable; Apple quality target is reported as a warning."}</p>
        </div>
      ` : ""}
    </section>
  `;
}
