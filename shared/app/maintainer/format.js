import { escapeHtml, formatDate, toDisplayTag, toLabel } from "../utils.js";

const STATUS_TONES = {
  new: "warm",
  "in-review": "accent",
  accepted: "good",
  rejected: "muted",
  "needs-follow-up": "warning",
};

const PRIORITY_TONES = {
  high: "warning",
  normal: "neutral",
  low: "muted",
};

export function getStatusTone(status = "") {
  return STATUS_TONES[status] || "neutral";
}

export function getPriorityTone(priority = "") {
  return PRIORITY_TONES[priority] || "neutral";
}

export function formatStatus(status = "") {
  return toLabel(status);
}

export function formatSubmissionType(value = "") {
  switch (value) {
    case "listener-review":
      return "Listener review";
    case "creator-verification":
      return "Creator verification";
    default:
      return toLabel(value);
  }
}

export function formatPriority(value = "") {
  return toLabel(value);
}

export function formatDateTime(value = "") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value || "Unknown";
  }

  const day = formatDate(value);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  return `${day} at ${time}`;
}

export function summarizeCounts(counts = {}, total = 0) {
  return [
    {
      label: "Matching submissions",
      value: total,
      tone: "neutral",
    },
    {
      label: "New",
      value: counts.status?.new || 0,
      tone: "warm",
    },
    {
      label: "Needs follow-up",
      value: counts.status?.["needs-follow-up"] || 0,
      tone: "warning",
    },
    {
      label: "Accepted",
      value: counts.status?.accepted || 0,
      tone: "good",
    },
  ];
}

export function buildSubmissionPreview(submission) {
  const payload = submission?.payload || {};
  const correctionDetails = payload.correctionDetails || {};
  const verificationEvidence = payload.verificationEvidence || {};

  switch (submission?.submissionType) {
    case "correction":
      return correctionDetails.issue || correctionDetails.proposedValue || correctionDetails.replacementUrl || correctionDetails.affectedUrl || payload.issueDescription || payload.correctedInformation || submission.notes || "Correction awaiting review.";
    case "listener-review":
      return payload.reviewTitle || payload.review || payload.whoWouldLikeThis || "Listener review awaiting moderation.";
    case "creator-verification":
      return payload.requestedUpdates || verificationEvidence.description || payload.preferredDescription || submission.notes || "Verification request awaiting review.";
    default:
      return payload.shortDescription || payload.archiveFitNote || submission.notes || "Show submission awaiting review.";
  }
}

export function formatListLabel(values = []) {
  const normalized = Array.isArray(values) ? values.filter(Boolean) : [];
  if (normalized.length === 0) {
    return "";
  }

  return normalized.map((value) => toDisplayTag(value)).join(" • ");
}

export function renderBadge(label, tone) {
  return `<span class="maintainer-badge is-${escapeHtml(tone)}">${escapeHtml(label)}</span>`;
}

export function renderLabeledLink(label, href) {
  if (!href) {
    return "";
  }

  return `
    <a class="maintainer-text-link" href="${escapeHtml(href)}" target="_blank" rel="noreferrer">
      ${escapeHtml(label)}
    </a>
  `;
}

export function getDetailSections(submission) {
  const payload = submission?.payload || {};
  const provenance = submission?.provenance || {};
  const correctionDetails = payload.correctionDetails || {};
  const verificationEvidence = payload.verificationEvidence || provenance.verificationEvidence || {};

  switch (submission?.submissionType) {
    case "correction":
      return [
        {
          title: "Correction detail",
          rows: [
            ["Type", toDisplayTag(payload.correctionType || "metadata")],
            ["Action", toDisplayTag(correctionDetails.action || "")],
            ["Affected link", correctionDetails.affectedUrl || ""],
            ["Replacement link", correctionDetails.replacementUrl || ""],
            ["Metadata field", toDisplayTag(correctionDetails.field || "")],
            ["Proposed value", correctionDetails.proposedValue || ""],
            ["Proposed status", toDisplayTag(correctionDetails.proposedStatus || "")],
            ["Effective date or context", correctionDetails.effectiveDateOrNote || ""],
            ["Credit name", correctionDetails.name || ""],
            ["Credit role", correctionDetails.role || ""],
            ["Artwork credit", correctionDetails.credit || ""],
            ["Issue", correctionDetails.issue || payload.issueDescription || ""],
            ["Corrected information", payload.correctedInformation || ""],
            ["Optional notes", payload.notes || submission.notes || ""],
          ],
        },
        {
          title: "Sources",
          links: (payload.sourceLinks || provenance.sourceLinks || []).map((href) => ({
            label: "Source",
            href,
          })).concat(correctionDetails.artworkUrl ? [{ label: "Official artwork", href: correctionDetails.artworkUrl }] : []),
        },
      ];
    case "listener-review":
      return [
        {
          title: "Listener review",
          rows: [
            ["Rating", payload.ratingStars ? `${payload.ratingStars}/5 stars (${payload.rating || "--"}/10)` : ""],
            ["Spoiler level", toDisplayTag(payload.spoilerLevel || "spoiler-free")],
            ["Title", payload.reviewTitle || ""],
            ["Review", payload.review || ""],
            ["Who would like this", payload.whoWouldLikeThis || ""],
            ["Best for", formatListLabel(payload.bestFor || [])],
            ["Worked best", formatListLabel(payload.workedBest || [])],
            ["Similar shows", payload.similarShows || ""],
            ["Alias", payload.alias || ""],
          ],
        },
      ];
    case "creator-verification":
      return [
        {
          title: "Verification request",
          rows: [
            ["Creator or network", submission.creatorName || ""],
            ["Role", toDisplayTag(payload.role || "")],
            ["Verification method", toDisplayTag(verificationEvidence.method || payload.verificationMethod || "")],
            ["Evidence email", verificationEvidence.email || submission.contactEmail || ""],
            ["Evidence description", verificationEvidence.description || ""],
            ["Requested updates", payload.requestedUpdates || ""],
            ["Preferred description", payload.preferredDescription || ""],
            ["Optional notes", payload.notes || submission.notes || ""],
          ],
          links: [
            ...(verificationEvidence.url || payload.proofUrl ? [{ label: "Proof URL", href: verificationEvidence.url || payload.proofUrl }] : []),
            ...((payload.officialLinks || provenance.officialLinks || []).map((link) => ({
              label: link.label || "Official link",
              href: link.url,
            }))),
          ],
        },
      ];
    default:
      return [
        {
          title: "Show submission",
          rows: [
            ["Creator or network", submission.creatorName || ""],
            ["Tags", formatListLabel((payload.selectedTags || submission.genres.split(",")).map((value) => String(value || "").trim()))],
            ["Completion", toDisplayTag(payload.completionStatus || "unknown")],
            ["Short description", payload.shortDescription || ""],
            ["Additional notes", payload.verificationNotes || payload.archiveFitNote || submission.notes || ""],
          ],
          links: [
            ...(submission.officialSite ? [{ label: "Official site", href: submission.officialSite }] : []),
            ...(submission.rssOrListenLink ? [{ label: "Primary listen link", href: submission.rssOrListenLink }] : []),
            ...((payload.listenLinks || []).map((link) => ({
              label: link.label || "Listen link",
              href: link.url,
            }))),
          ],
        },
      ];
  }
}
