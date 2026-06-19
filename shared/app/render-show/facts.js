import { createSubmissionHref } from "../urls.js";
import {
  escapeHtml,
  getArchivePerspectiveText,
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

export function renderArchiveTakeCard(show) {
  const archiveTake = getArchivePerspectiveText(show);
  const note =
    show.reviewStatus === "full-review"
      ? ""
      : "Full review not published yet. This page stays live so the archive can still recommend the show now.";

  return `
    <section class="detail-side-card detail-archive-take-card">
      <div class="detail-side-card-header">
        <h2>Archive take</h2>
      </div>
      <p>${escapeHtml(archiveTake)}</p>
      ${note ? `<p class="detail-side-note">${escapeHtml(note)}</p>` : ""}
    </section>
  `;
}

export function renderFactsLinksCard(show) {
  const creatorNetwork = getCreatorNetworkLabel(show);
  const seasonsEpisodes = getSeasonsEpisodesLabel(show);
  const firstRelease = getKnownDateLabel(getShowDateValue(show, "first"));
  const latestRelease = getKnownDateLabel(getShowDateValue(show, "latest"));

  return `
    <section class="detail-side-card detail-facts-links-card" id="facts-links">
      <div class="detail-side-card-header">
        <h2>Facts &amp; links</h2>
      </div>

      <dl class="detail-fact-list">
        ${renderFactRow("Creator / network", creatorNetwork.text, { isEmpty: creatorNetwork.isEmpty })}
        ${renderFactRow("Official / listen links", renderListenLinkCluster(show), { html: true })}
        ${renderFactRow("Status", renderStatusPills(show), { html: true })}
        ${renderFactRow("Seasons / episodes", seasonsEpisodes.text, { isEmpty: seasonsEpisodes.isEmpty })}
        ${renderFactRow("First release", firstRelease.text, { isEmpty: firstRelease.isEmpty })}
        ${renderFactRow("Latest release", latestRelease.text, { isEmpty: latestRelease.isEmpty })}
      </dl>
    </section>
  `;
}

export function renderCorrectionSection(show) {
  return `
    <section class="detail-section detail-correction-section">
      <div class="detail-section-header">
        <div>
          <h2>Help keep the archive accurate.</h2>
          <p>Spot a metadata issue, missing link, or verification problem? Send it into the review queue.</p>
        </div>
      </div>
      <p>Use this when factual details need correction or an official source should be checked against the current entry.</p>
      <a class="detail-primary-action detail-primary-action-compact" href="${escapeHtml(
        createSubmissionHref("correction", show.id),
      )}">Suggest a correction</a>
    </section>
  `;
}

function renderFactRow(label, value, { html = false, isEmpty = false } = {}) {
  const content = html ? value : escapeHtml(value);
  const classes = `detail-fact-value${isEmpty ? " is-empty" : ""}`;

  return `
    <div class="detail-fact-row">
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

  return `
    <div class="detail-link-cluster">
      ${
        primaryLink
          ? `<a class="detail-link-primary" href="${escapeHtml(primaryLink.href)}" target="_blank" rel="noreferrer">Open ${escapeHtml(
              primaryLink.label,
            )}</a>`
          : '<p class="detail-link-status is-empty">Links being verified</p>'
      }
      <div class="detail-link-chip-row">
        ${DETAIL_LINK_ORDER.map((key) => renderListenLinkChip(key, links[key])).join("")}
      </div>
    </div>
  `;
}

function renderListenLinkChip(key, href) {
  const label = DETAIL_LINK_LABELS[key] || toLabel(key);
  if (href) {
    return `<a class="detail-link-chip" href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`;
  }

  return `<span class="detail-link-chip is-disabled" aria-disabled="true">${escapeHtml(label)}</span>`;
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
