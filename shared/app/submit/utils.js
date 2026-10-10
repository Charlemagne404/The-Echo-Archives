export function normalizeLinkTypeClass(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "other";
}

export function toSubmitFieldKey(value = "") {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "Field";
  }

  const segments = normalized
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);

  if (segments.length === 0) {
    return "Field";
  }

  return segments
    .map((segment) => `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`)
    .join("");
}

export function buildSubmitControlId(value = "", suffix = "") {
  return `submit${toSubmitFieldKey(value)}${suffix}`;
}

export function getLinkTypeIcon(value = "") {
  switch (String(value || "").trim().toLowerCase()) {
    case "spotify":
      return "spotify";
    case "apple podcasts":
      return "apple-podcasts";
    case "rss feed":
      return "rss";
    case "official website":
    case "website":
      return "globe";
    case "youtube":
      return "youtube";
    default:
      return "link";
  }
}

export function normalizeLinkRows(rows, plain) {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .map((row) => ({
      label: plain ? "" : String(row?.label || "").trim(),
      url: String(row?.url || "").trim(),
    }))
    .filter((row) => row.url);
}

export function pickNextLinkOption(rows, options) {
  const normalizedOptions = Array.isArray(options) ? options.filter(Boolean) : [];
  if (normalizedOptions.length === 0) {
    return "Website";
  }

  const usedLabels = new Set(
    (Array.isArray(rows) ? rows : [])
      .map((row) => String(row?.label || "").trim())
      .filter(Boolean),
  );

  return normalizedOptions.find((option) => !usedLabels.has(option)) || normalizedOptions[0];
}

export function pickPrimaryListenLink(rows) {
  const primary = rows.find((row) => row.label.toLowerCase() === "rss feed") || rows[0];
  return primary?.url || "";
}

export function findPrimaryOfficialSite(rows) {
  const primary = rows.find((row) => row.label.toLowerCase().includes("website"));
  return primary?.url || "";
}

export function normalizeOption(option) {
  if (typeof option === "string") {
    return {
      value: option,
      label: option,
    };
  }

  return {
    value: String(option.value || "").trim(),
    label: String(option.label || option.value || "").trim(),
  };
}

export function isValidHttpUrl(value = "") {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_error) {
    return false;
  }
}

export function isValidEmail(value = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

export function toDisplayLabel(value) {
  return String(value || "")
    .split(/[\s-]+/)
    .map((segment) => segment ? `${segment[0].toUpperCase()}${segment.slice(1)}` : "")
    .join(" ")
    .replace("Sci Fi", "Sci-fi")
    .replace("Full Cast", "Full-cast");
}

export function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeAttribute(value) {
  return escapeHtml(value).replace(/\n/g, "&#10;");
}

export function getShowContributorLabel(show) {
  if (Array.isArray(show?.creators) && show.creators.length > 0) {
    return show.creators.join(", ");
  }

  if (show?.creatorId) {
    return toDisplayLabel(show.creatorId);
  }

  if (Array.isArray(show?.genres) && show.genres.length > 0) {
    return show.genres.join(" • ");
  }

  return "Archive entry";
}

const SUBMIT_ICON_SYMBOLS = Object.freeze({
  "mode-show": "radio-tower",
  "mode-correction": "file-pen-line",
  "mode-review": "star",
  "mode-creator": "badge-check",
  antenna: "radio-tower",
  pencil: "pencil-line",
  review: "message-square-text",
  shield: "shield-check",
  document: "file-text",
  clipboard: "clipboard-list",
  info: "info",
  question: "circle-question-mark",
  magnify: "search",
  check: "check",
  close: "x",
  plus: "plus",
  "chevron-down": "chevron-down",
  "arrow-right": "arrow-right",
  clock: "clock",
  archive: "archive",
  link: "link-2",
  spotify: "brand-spotify",
  "apple-podcasts": "brand-apple-podcasts",
  rss: "rss",
  globe: "globe",
  youtube: "brand-youtube",
  team: "users-round",
  star: "star",
  "star-badge": "award",
  tag: "tag",
  spark: "sparkles",
  image: "image",
  circle: "circle",
});

export function iconMarkup(name) {
  const symbol = SUBMIT_ICON_SYMBOLS[name] || SUBMIT_ICON_SYMBOLS.circle;
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="/images/submit-icons.svg#${symbol}"></use></svg>`;
}
