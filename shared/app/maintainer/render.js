import { escapeHtml } from "../utils.js";
import {
  buildSubmissionPreview,
  formatDateTime,
  formatPriority,
  formatStatus,
  formatSubmissionType,
  getDetailSections,
  getPriorityTone,
  getStatusTone,
  renderBadge,
  renderLabeledLink,
} from "./format.js";

function renderSummaryCard(card) {
  return `
    <article class="page-card maintainer-summary-card is-${escapeHtml(card.tone || "neutral")}">
      <p class="maintainer-summary-label">${escapeHtml(card.label)}</p>
      <p class="maintainer-summary-value">${escapeHtml(String(card.value))}</p>
    </article>
  `;
}

function renderListItem(submission, isSelected) {
  const showLink = submission.existingShowId
    ? `<a class="maintainer-inline-link" href="/shows/${encodeURIComponent(submission.existingShowId)}" target="_blank" rel="noreferrer">Open show</a>`
    : "";

  return `
    <article class="maintainer-list-item ${isSelected ? "is-selected" : ""}">
      <button
        type="button"
        class="maintainer-list-item-select"
        data-submission-id="${escapeHtml(submission.id)}"
        ${isSelected ? 'aria-current="true"' : ""}
      >
        <span class="maintainer-list-item-top">
          <span class="maintainer-list-item-title">${escapeHtml(submission.showTitle)}</span>
          <span class="maintainer-list-item-badges">
            ${renderBadge(formatStatus(submission.status), getStatusTone(submission.status))}
            ${renderBadge(formatPriority(submission.priority), getPriorityTone(submission.priority))}
          </span>
        </span>
        <span class="maintainer-list-item-meta">
          <span>${escapeHtml(formatSubmissionType(submission.submissionType))}</span>
          <span>${escapeHtml(formatDateTime(submission.submittedAt))}</span>
        </span>
        <span class="maintainer-list-item-preview">${escapeHtml(buildSubmissionPreview(submission))}</span>
      </button>
      ${showLink ? `<div class="maintainer-list-item-link">${showLink}</div>` : ""}
    </article>
  `;
}

function renderDetailRows(rows = []) {
  const filteredRows = rows.filter(([, value]) => Boolean(value));
  if (filteredRows.length === 0) {
    return "";
  }

  return `
    <dl class="maintainer-detail-grid">
      ${filteredRows.map(([label, value]) => `
        <div class="maintainer-detail-row">
          <dt>${escapeHtml(label)}</dt>
          <dd>${escapeHtml(String(value))}</dd>
        </div>
      `).join("")}
    </dl>
  `;
}

function renderDetailLinks(links = []) {
  const filteredLinks = links.filter((link) => link?.href);
  if (filteredLinks.length === 0) {
    return "";
  }

  return `
    <div class="maintainer-link-list">
      ${filteredLinks.map((link) => renderLabeledLink(link.label || "Link", link.href)).join("")}
    </div>
  `;
}

function renderSection(section) {
  return `
    <section class="maintainer-detail-section">
      <h3>${escapeHtml(section.title)}</h3>
      ${renderDetailRows(section.rows || [])}
      ${renderDetailLinks(section.links || [])}
    </section>
  `;
}

function renderSubmissionBasics(submission) {
  const basics = [
    ["Submission type", formatSubmissionType(submission.submissionType)],
    ["Submitted", formatDateTime(submission.submittedAt)],
    ["Existing show ID", submission.existingShowId],
    ["Creator or network", submission.creatorName],
    ["Contact email", submission.contactEmail],
    ["Official site", submission.officialSite],
    ["Listen link", submission.rssOrListenLink],
    ["Source IP", submission.sourceIp],
    ["User agent", submission.userAgent],
  ];

  return renderDetailRows(basics);
}

function renderPublishedListenerReviewEditor(submission, publicReview = null) {
  if (submission.submissionType !== "listener-review") return "";
  const payload = submission.payload || {};
  const review = publicReview || {};
  const commaList = (values) => (Array.isArray(values) ? values.join(", ") : "");
  const canPublish = submission.status === "accepted";
  const categories = [
    ["voiceActing", "Voice acting"],
    ["soundDesign", "Sound design"],
    ["story", "Story"],
    ["characters", "Characters"],
    ["ads", "Ads"],
    ["length", "Length"],
  ];
  return `
    <form id="maintainerListenerReviewForm" class="maintainer-review-form" data-submission-id="${escapeHtml(submission.id)}">
      <div class="maintainer-detail-section">
        <h3>Public listener review</h3>
        <p class="maintainer-panel-meta">Edit the public-safe copy here. Contact details and internal notes are never published.</p>
        <div class="maintainer-review-grid">
          <label class="maintainer-field"><span>Name or alias</span><input name="authorName" maxlength="120" value="${escapeHtml(review.authorName || payload.alias || "Anonymous listener")}" /></label>
          <label class="maintainer-field"><span>Rating</span><select name="ratingStars">${[1, 2, 3, 4, 5].map((value) => `<option value="${value}" ${Number(review.ratingStars || payload.ratingStars) === value ? "selected" : ""}>${value}/5</option>`).join("")}</select></label>
          <label class="maintainer-field"><span>Spoiler level</span><select name="spoilerLevel">${[["spoiler-free", "Spoiler-free"], ["light-spoilers", "Mild spoilers"], ["full-spoilers", "Full spoilers"]].map(([value, label]) => `<option value="${value}" ${(review.spoilerLevel || payload.spoilerLevel || "spoiler-free") === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
        </div>
        <div class="maintainer-review-grid maintainer-review-grid--categories">
          ${categories.map(([key, label]) => {
            const value = Number(review.categoryScores?.[key] ?? payload.categoryScores?.[key]) || "";
            const name = `category${key[0].toUpperCase()}${key.slice(1)}`;
            return `<label class="maintainer-field"><span>${label} (1–10)</span><select name="${name}"><option value="">Not rated</option>${Array.from({ length: 10 }, (_unused, index) => index + 1).map((score) => `<option value="${score}" ${value === score ? "selected" : ""}>${score}/10</option>`).join("")}</select></label>`;
          }).join("")}
        </div>
        <label class="maintainer-field"><span>Title</span><input name="title" maxlength="80" value="${escapeHtml(review.title || payload.reviewTitle || "")}" /></label>
        <label class="maintainer-field"><span>Review text</span><textarea name="body" rows="7" maxlength="4000">${escapeHtml(review.body || payload.review || "")}</textarea></label>
        <div class="maintainer-review-grid">
          <label class="maintainer-field"><span>Best for</span><input name="bestFor" value="${escapeHtml(commaList(review.bestFor || payload.bestFor))}" /></label>
          <label class="maintainer-field"><span>Worked best</span><input name="workedBest" value="${escapeHtml(commaList(review.workedBest || payload.workedBest))}" /></label>
        </div>
        <div class="maintainer-review-actions">
          <button class="maintainer-secondary-button" type="submit" name="listenerReviewAction" value="save">Save public draft</button>
          <button class="maintainer-primary-button" type="submit" name="listenerReviewAction" value="publish" ${canPublish ? "" : "disabled"}>${review.published ? "Update published review" : "Publish review"}</button>
          ${review.published ? `<button class="maintainer-secondary-button" type="submit" name="listenerReviewAction" value="unpublish">Unpublish</button>` : ""}
          <p class="maintainer-panel-meta">${review.publishedAt ? `Published ${escapeHtml(formatDateTime(review.publishedAt))}` : canPublish ? "Accept the submission, then publish when ready." : "Set the submission status to Accepted before publishing."}</p>
        </div>
      </div>
    </form>
  `;
}

export function renderSummaryCards(cards = []) {
  return cards.map(renderSummaryCard).join("");
}

export function renderQueueList({ items = [], selectedId = "" }) {
  if (items.length === 0) {
    return `
      <div class="maintainer-empty-state">
        <h3>No submissions match this view.</h3>
        <p>Try widening the filters or including closed moderation states.</p>
      </div>
    `;
  }

  return items.map((submission) => renderListItem(submission, submission.id === selectedId)).join("");
}

export function renderDetailPane({ submission = null, storedReviewer = "", publicReview = null }) {
  if (!submission) {
    return `
      <div class="maintainer-empty-state">
        <h3>No submission selected.</h3>
        <p>Choose a row from the queue to inspect and update it.</p>
      </div>
    `;
  }

  const reviewedBy = submission.reviewedBy || storedReviewer || "";
  const showLink = submission.existingShowId
    ? renderLabeledLink("Open matching show page", `/shows/${encodeURIComponent(submission.existingShowId)}`)
    : "";

  return `
    <div class="maintainer-detail-stack">
      <div class="maintainer-detail-header">
        <div>
          <h3>${escapeHtml(submission.showTitle)}</h3>
          <p>${escapeHtml(buildSubmissionPreview(submission))}</p>
        </div>
        <div class="maintainer-detail-badges">
          ${renderBadge(formatSubmissionType(submission.submissionType), "neutral")}
          ${renderBadge(formatStatus(submission.status), getStatusTone(submission.status))}
          ${renderBadge(formatPriority(submission.priority), getPriorityTone(submission.priority))}
        </div>
      </div>

      ${showLink ? `<div class="maintainer-link-list">${showLink}</div>` : ""}
      ${renderSubmissionBasics(submission)}

      <form id="maintainerReviewForm" class="maintainer-review-form" data-submission-id="${escapeHtml(submission.id)}">
        <div class="maintainer-review-grid">
          <label class="maintainer-field">
            <span>Status</span>
            <select id="maintainerReviewStatus" name="status">
              ${["new", "in-review", "needs-follow-up", "accepted", "rejected"].map((value) => `
                <option value="${value}" ${submission.status === value ? "selected" : ""}>${escapeHtml(formatStatus(value))}</option>
              `).join("")}
            </select>
          </label>
          <label class="maintainer-field">
            <span>Priority</span>
            <select id="maintainerReviewPriority" name="priority">
              ${["high", "normal", "low"].map((value) => `
                <option value="${value}" ${submission.priority === value ? "selected" : ""}>${escapeHtml(formatPriority(value))}</option>
              `).join("")}
            </select>
          </label>
          <label class="maintainer-field">
            <span>Reviewed by</span>
            <input id="maintainerReviewedBy" name="reviewedBy" type="text" value="${escapeHtml(reviewedBy)}" placeholder="Initials or maintainer name" />
          </label>
        </div>
        <label class="maintainer-field">
          <span>Review notes</span>
          <textarea id="maintainerReviewNotes" name="reviewNotes" rows="7" placeholder="Internal notes for what changed, what needs checking, or why this was rejected.">${escapeHtml(submission.reviewNotes || "")}</textarea>
        </label>
        <div class="maintainer-review-actions">
          <button class="maintainer-primary-button" type="submit">Save review state</button>
          <p class="maintainer-panel-meta">${escapeHtml(submission.reviewedAt ? `Last reviewed ${formatDateTime(submission.reviewedAt)}` : "No review timestamp yet.")}</p>
        </div>
      </form>

      ${submission.submissionType === "show" && submission.status !== "rejected" ? `
        <section class="maintainer-detail-section">
          <h3>Import preparation</h3>
          <p class="maintainer-panel-meta">Send this submitted factual information into the protected import lane. It will still be enriched, deduplicated, and require separate publication approval.</p>
          <div class="maintainer-toolbar-actions">
            <button class="maintainer-ghost-button" type="button" data-submission-import="true">Prepare import candidate</button>
          </div>
        </section>
      ` : ""}

      ${renderPublishedListenerReviewEditor(submission, publicReview)}

      ${getDetailSections(submission).map(renderSection).join("")}

      <details class="maintainer-raw-data">
        <summary>Raw payload and provenance</summary>
        <pre>${escapeHtml(JSON.stringify({ payload: submission.payload, provenance: submission.provenance }, null, 2))}</pre>
      </details>
    </div>
  `;
}

export function renderReportContent({ counts = {}, items = [], total = 0, filterSummary = "" }) {
  if (items.length === 0) {
    return `
      <article class="page-card maintainer-report-card">
        <h2>No matching submissions</h2>
        <p>${escapeHtml(filterSummary || "This report is empty for the current filters.")}</p>
      </article>
    `;
  }

  const groups = ["new", "in-review", "needs-follow-up", "accepted", "rejected"].map((status) => ({
    status,
    items: items.filter((submission) => submission.status === status),
  })).filter((group) => group.items.length > 0);

  return `
    <article class="page-card maintainer-report-card">
      <div class="maintainer-report-summary">
        <div>
          <p class="maintainer-kicker">Snapshot summary</p>
          <h2>${escapeHtml(String(total))} matching submissions</h2>
        </div>
        <p>${escapeHtml(filterSummary)}</p>
      </div>
      <div class="maintainer-report-counts">
        ${Object.entries(counts.status || {}).map(([status, count]) => `
          <span>${escapeHtml(formatStatus(status))}: ${escapeHtml(String(count))}</span>
        `).join("")}
      </div>
    </article>
    ${groups.map((group) => `
      <section class="page-card maintainer-report-card">
        <div class="maintainer-report-group-heading">
          <h2>${escapeHtml(formatStatus(group.status))}</h2>
          <p>${escapeHtml(String(group.items.length))} submissions</p>
        </div>
        <div class="maintainer-report-group">
          ${group.items.map((submission) => `
            <article class="maintainer-report-entry">
              <div class="maintainer-report-entry-top">
                <div>
                  <h3>${escapeHtml(submission.showTitle)}</h3>
                  <p>${escapeHtml(formatSubmissionType(submission.submissionType))} · ${escapeHtml(formatDateTime(submission.submittedAt))}</p>
                </div>
                <div class="maintainer-detail-badges">
                  ${renderBadge(formatPriority(submission.priority), getPriorityTone(submission.priority))}
                </div>
              </div>
              <p class="maintainer-report-preview">${escapeHtml(buildSubmissionPreview(submission))}</p>
              ${renderSubmissionBasics(submission)}
              ${getDetailSections(submission).map(renderSection).join("")}
              ${submission.reviewNotes ? `<div class="maintainer-report-notes"><strong>Review notes:</strong> ${escapeHtml(submission.reviewNotes)}</div>` : ""}
            </article>
          `).join("")}
        </div>
      </section>
    `).join("")}
  `;
}
