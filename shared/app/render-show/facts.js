import { createSubmissionHref } from "../urls.js";
import {
  escapeHtml,
  formatDate,
  getCreatorNetworkLabel,
  getKnownDateLabel,
  getPublicStatus,
  getPublicVerificationLabel,
  getSeasonsEpisodesLabel,
  getShowDateValue,
  toDisplayTag,
  toLabel,
} from "./utils.js";

const DETAIL_LINK_LABELS = {
  start: "Start listening",
  website: "Website",
  apple: "Apple",
  spotify: "Spotify",
  rss: "RSS",
};

const DETAIL_LINK_ORDER = ["start", "website", "apple", "spotify", "rss"];

export function renderFactsLinksCard(show, { inline = false } = {}) {
  const creatorNetwork = getCreatorNetworkLabel(show);
  const seasonsEpisodes = getSeasonsEpisodesLabel(show);
  const firstRelease = getKnownDateLabel(getShowDateValue(show, "first"));
  const latestRelease = getKnownDateLabel(getShowDateValue(show, "latest"));
  const nextRelease = show.releaseDates?.next ? formatDate(show.releaseDates.next) : "";
  const cadence = String(show.metadata?.schedule?.label || "").trim();
  const transcriptCoverage = Number(show.availability?.transcriptCoverage || 0);
  const transcriptDetails = [
    Array.isArray(show.availability?.transcriptLanguages) ? show.availability.transcriptLanguages.join(" • ") : "",
    Array.isArray(show.availability?.transcriptFormats) ? show.availability.transcriptFormats.join(" • ") : "",
  ].filter(Boolean).join(" • ");
  const transcripts = String(show.availability?.transcripts || "").trim();

  const rows = [
    globalThis.EchoArchiveEntities.renderEntityFacts(show) || (!creatorNetwork.isEmpty ? renderFactRow("Creator / network", creatorNetwork.text) : ""),
    renderVerificationRow(show),
    hasListenLinks(show) ? renderFactRow("Official / listen links", renderListenLinkCluster(show), { html: true, wide: true }) : "",
    getPublicStatus(show) ? renderFactRow("Status", renderStatusPills(show), { html: true, wide: true }) : "",
    !seasonsEpisodes.isEmpty ? renderFactRow("Seasons / episodes", seasonsEpisodes.text) : "",
    !firstRelease.isEmpty ? renderFactRow("First release", firstRelease.text) : "",
    !latestRelease.isEmpty ? renderFactRow("Latest release", latestRelease.text) : "",
    nextRelease ? renderFactRow("Next release", nextRelease) : "",
    cadence && cadence !== "unknown" ? renderFactRow("Release cadence", toDisplayTag(cadence)) : "",
    transcripts && transcripts !== "unknown" ? renderFactRow("Transcripts", `${transcripts}${transcriptDetails ? ` · ${transcriptDetails}` : ""}${transcriptCoverage > 0 ? ` · ${Math.round(transcriptCoverage * 100)}% observed coverage` : ""}`, { wide: true }) : "",
    show.length?.label ? renderFactRow("Runtime note", show.length.label, { wide: true }) : "",
  ].filter(Boolean);
  if (rows.length === 0) return "";

  return `
    <section class="${inline ? "detail-section detail-facts-links-card detail-facts-links-card--inline" : "detail-side-card detail-facts-links-card"}" id="facts-links" tabindex="-1">
      <div class="detail-side-card-header">
        <h2>Facts &amp; links</h2>
      </div>

      <dl class="detail-fact-list">
        ${rows.join("")}
      </dl>
    </section>
  `;
}

export function renderCorrectionSection(show) {
  return `
    <section class="detail-section detail-correction-section" aria-labelledby="detail-correction-title">
      <div class="detail-correction-copy">
        <p class="detail-correction-kicker">Community archive care</p>
        <h2 id="detail-correction-title">Help keep this entry accurate.</h2>
        <p>
          Spot a metadata issue, missing link, or verification problem?
          Listener and creator notes go into the manual review queue before anything changes.
        </p>
        <ul class="detail-correction-list" aria-label="Correction review notes">
          <li>Facts, credits, links, and status details</li>
          <li>Official sources checked against the current entry</li>
          <li>Corrections never affect editorial ratings</li>
        </ul>
      </div>
      <div class="detail-correction-action">
        <p class="detail-correction-action-label">Found something off?</p>
        <p>Send the archive team the exact issue and any source links that make it easier to verify.</p>
        <a class="detail-primary-action detail-primary-action-compact" href="${escapeHtml(
          createSubmissionHref("correction", show.id),
        )}">Suggest a correction</a>
      </div>
    </section>
  `;
}

function renderVerificationRow(show) {
  const verification = show.verification || {};
  if (!verification.status) {
    return "";
  }

  const status = getPublicVerificationLabel(show);
  if (!status) return "";
  const verifiedAt = verification.verifiedAt ? `Checked ${formatDate(verification.verifiedAt)}` : "";
  const note = "Factual metadata only";

  return renderFactRow(
    "Fact check",
    `
      <div class="detail-verification-value">
        <span>${escapeHtml(status)}</span>
        ${verifiedAt ? `<small>${escapeHtml(verifiedAt)}</small>` : ""}
        <small>${escapeHtml(note)}</small>
      </div>
    `,
    { html: true },
  );
}

function renderFactRow(label, value, { html = false, isEmpty = false, wide = false } = {}) {
  const content = html ? value : escapeHtml(value);
  const classes = `detail-fact-value${isEmpty ? " is-empty" : ""}`;

  return `
    <div class="detail-fact-row${wide ? " is-wide" : ""}">
      <dt>${escapeHtml(label)}</dt>
      <dd class="${classes}">${content}</dd>
    </div>
  `;
}

function renderStatusPills(show) {
  return `
    <div class="detail-fact-pill-row">
      <span class="detail-fact-pill">${escapeHtml(getPublicStatus(show))}</span>
    </div>
  `;
}

function hasListenLinks(show) {
  return Object.values(show?.listenLinks || {}).some((href) => String(href || "").trim());
}

function renderListenLinkCluster(show) {
  const links = show.listenLinks || {};
  const primaryLink = getPrimaryListenLink(show);
  const alternateLinks = DETAIL_LINK_ORDER.filter((key) => key !== primaryLink?.key && links[key] && links[key] !== primaryLink?.href);

  return `
    <div class="detail-link-cluster">
      ${
        primaryLink
          ? `<a class="detail-link-primary" href="${escapeHtml(primaryLink.href)}" target="_blank" rel="noreferrer">${primaryLink.key === "start" ? "Start listening" : `Open ${escapeHtml(primaryLink.label)}`}</a>`
          : '<p class="detail-link-status is-empty">Links being verified</p>'
      }
      ${alternateLinks.length ? `<div class="detail-link-chip-row">${alternateLinks.map((key) => renderListenLinkChip(key, links[key])).join("")}</div>` : ""}
    </div>
  `;
}

function renderListenLinkChip(key, href) {
  const label = DETAIL_LINK_LABELS[key] || toLabel(key);
  return `<a class="detail-link-chip" href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`;
}

function getPrimaryListenLink(show) {
  const links = show.listenLinks || {};

  for (const key of DETAIL_LINK_ORDER) {
    if (links[key]) {
      return {
        key,
        href: links[key],
        label: DETAIL_LINK_LABELS[key] || toLabel(key),
      };
    }
  }

  return null;
}
