import { createSubmissionHref } from "../urls.js";
import {
  escapeHtml,
  formatDate,
  getCreatorNetworkLabel,
  getKnownDateLabel,
  getSeasonsEpisodesLabel,
  getShowDateValue,
  toDisplayTag,
  toLabel,
} from "./utils.js";

const DETAIL_LINK_LABELS = {
  website: "Website",
  apple: "Apple",
  spotify: "Spotify",
  rss: "RSS",
};

const DETAIL_LINK_ORDER = ["website", "apple", "spotify", "rss"];

export function renderFactsLinksCard(show, { inline = false } = {}) {
  const creatorNetwork = getCreatorNetworkLabel(show);
  const seasonsEpisodes = getSeasonsEpisodesLabel(show);
  const firstRelease = getKnownDateLabel(getShowDateValue(show, "first"));
  const latestRelease = getKnownDateLabel(getShowDateValue(show, "latest"));

  return `
    <section class="${inline ? "detail-section detail-facts-links-card detail-facts-links-card--inline" : "detail-side-card detail-facts-links-card"}" id="facts-links">
      <div class="detail-side-card-header">
        <h2>Facts &amp; links</h2>
      </div>

      <dl class="detail-fact-list">
        ${renderFactRow("Creator / network", creatorNetwork.text, { isEmpty: creatorNetwork.isEmpty })}
        ${renderVerificationRow(show)}
        ${renderFactRow("Official / listen links", renderListenLinkCluster(show), { html: true, wide: true })}
        ${renderFactRow("Status", renderStatusPills(show), { html: true, wide: true })}
        ${renderFactRow("Seasons / episodes", seasonsEpisodes.text, { isEmpty: seasonsEpisodes.isEmpty })}
        ${renderFactRow("First release", firstRelease.text, { isEmpty: firstRelease.isEmpty })}
        ${renderFactRow("Latest release", latestRelease.text, { isEmpty: latestRelease.isEmpty })}
        ${show.length?.label ? renderFactRow("Runtime note", show.length.label, { wide: true }) : ""}
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

  const status = toDisplayTag(verification.status);
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
  const chips = [
    { label: toDisplayTag(show.reviewStatus || "unknown"), accent: show.reviewStatus === "full-review" },
    { label: toDisplayTag(show.releaseStatus || "unknown") },
    { label: toDisplayTag(show.completionStatus || "unclear") },
  ];

  return `
    <div class="detail-fact-pill-row">
      ${chips
        .map(
          (chip) => `<span class="detail-fact-pill${chip.accent ? " is-accent" : ""}">${escapeHtml(chip.label)}</span>`,
        )
        .join("")}
    </div>
  `;
}

function renderListenLinkCluster(show) {
  const links = show.listenLinks || {};
  const primaryLink = getPrimaryListenLink(show);
  const alternateLinks = DETAIL_LINK_ORDER.filter((key) => key !== primaryLink?.key && links[key]);

  return `
    <div class="detail-link-cluster">
      ${
        primaryLink
          ? `<a class="detail-link-primary" href="${escapeHtml(primaryLink.href)}" target="_blank" rel="noreferrer">Open ${escapeHtml(
              primaryLink.label,
            )}</a>`
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
