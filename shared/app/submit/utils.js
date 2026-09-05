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

export function iconMarkup(name) {
  switch (name) {
    case "mode-show":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path class="icon-accent" d="M4.9 16.1C1 12.2 1 5.8 4.9 1.9M7.8 4.7a6.14 6.14 0 0 0-.8 7.5M16.2 4.8c2 2 2.26 5.11.8 7.47M19.1 1.9a9.96 9.96 0 0 1 0 14.1" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/><circle class="icon-accent-fill" cx="12" cy="9" r="2"/><path d="M9.5 18h5M8 22l4-11 4 11" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/></svg>`;
    case "mode-correction":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.75 19.25h3.5L18 9.5 14.5 6 4.75 15.75v3.5ZM13.75 6.75 17.25 10.25" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/></svg>`;
    case "mode-review":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.25 5.75h13.5a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5h-7.2l-4.3 3.3v-3.3h-2a1.5 1.5 0 0 1-1.5-1.5v-8.5a1.5 1.5 0 0 1 1.5-1.5Z M8.25 10.25h5.5M8.25 13.5h3.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/><path class="icon-accent-fill" d="m16.9 10.2.72 1.48 1.63.24-1.18 1.15.28 1.62-1.45-.77-1.45.77.28-1.62-1.18-1.15 1.63-.24.72-1.48Z"/></svg>`;
    case "mode-creator":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.75c2.15 1.65 4.55 2.5 6.75 2.5v5.5c0 4.25-2.7 7.35-6.75 8.5-4.05-1.15-6.75-4.25-6.75-8.5v-5.5c2.2 0 4.6-.85 6.75-2.5Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/><path class="icon-accent" d="m9 11.85 2 2 4.1-4.1" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.05"/><circle class="icon-badge" cx="18.5" cy="17.75" r="3.1"/><path class="icon-badge-check" d="m17.1 17.75.95.95 1.85-1.85" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.3"/></svg>`;
    case "antenna":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.25V14M8.5 20.25h7M9.25 14h5.5M12 13.75c0-5.4 2.45-8.75 6.75-8.75M12 13.75C12 8.35 9.55 5 5.25 5M8.25 8.25a5.25 5.25 0 0 0-3 4.7M15.75 8.25a5.25 5.25 0 0 1 3 4.7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/></svg>`;
    case "pencil":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.75 19.25h3.5L18 9.5 14.5 6 4.75 15.75v3.5ZM13.75 6.75 17.25 10.25" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/></svg>`;
    case "review":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.25 6.75h13.5v8H11l-3.5 3v-3H5.25z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/><path d="m16.65 16.75.45 1.35 1.4.02-1.13.83.42 1.34-1.14-.82-1.13.82.42-1.34-1.13-.83 1.39-.02.45-1.35Z" fill="currentColor" stroke="none"/></svg>`;
    case "shield":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.75 5.75 7.5v4.25c0 3.88 2.42 6.97 6.25 7.5 3.83-.53 6.25-3.62 6.25-7.5V7.5L12 4.75Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/><path d="m9 12.25 2 2 4.25-4.25" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/></svg>`;
    case "document":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4.75h6l4 4v10.5H8z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/><path d="M14 4.75v4h4M10.25 12h5.5M10.25 15.25h5.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/></svg>`;
    case "clipboard":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.25 5.75h5.5a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5h-5.5a1.5 1.5 0 0 1-1.5-1.5v-10a1.5 1.5 0 0 1 1.5-1.5Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/><path d="M10.5 5.75a1.5 1.5 0 1 1 3 0M10 10.5h4M10 13.5h4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/></svg>`;
    case "info":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 18.25a6.25 6.25 0 1 0 0-12.5 6.25 6.25 0 0 0 0 12.5ZM12 10.5v4M12 8.25h.01" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/></svg>`;
    case "question":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 18.25a6.25 6.25 0 1 0 0-12.5 6.25 6.25 0 0 0 0 12.5Zm-1.5-7a1.5 1.5 0 1 1 2.45 1.15c-.7.57-.95.92-.95 1.6M12 16.25h.01" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/></svg>`;
    case "magnify":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.75 18.5a7.75 7.75 0 1 1 5.48-2.27l3.02 3.02" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/></svg>`;
    case "check":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5.75 12.25 4.25 4.25 8.5-8.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9"/></svg>`;
    case "close":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"/></svg>`;
    case "plus":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5.5v13M5.5 12h13" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"/></svg>`;
    case "chevron-down":
      return `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5.25 7.5 4.75 5 4.75-5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/></svg>`;
    case "arrow-right":
      return `<svg viewBox="0 0 28 12" aria-hidden="true"><path d="M2 6h18.5M16 2.25 21.5 6 16 9.75" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.45"/></svg>`;
    case "clock":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 18.25a6.25 6.25 0 1 0 0-12.5 6.25 6.25 0 0 0 0 12.5Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/><path d="M12 9v3.25l2.25 1.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/></svg>`;
    case "archive":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.75 8.5h10.5v8.75H6.75zM5.75 8.5h12.5V5.75H5.75zM10 12h4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/></svg>`;
    case "link":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14 8.25 15.75a2.75 2.75 0 1 1-3.89-3.89L6.1 10.1a2.75 2.75 0 0 1 3.9 0M14 10l1.75-1.75a2.75 2.75 0 1 1 3.89 3.89L17.9 13.9a2.75 2.75 0 0 1-3.9 0M9.5 14.5l5-5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/></svg>`;
    case "spotify":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#1ed760"/><path d="M7.6 9.2c3.38-1 6.98-.66 10.32.9" fill="none" stroke="#08110d" stroke-linecap="round" stroke-width="1.85"/><path d="M8.35 12c2.78-.72 5.6-.42 8.08.82" fill="none" stroke="#08110d" stroke-linecap="round" stroke-width="1.65"/><path d="M9.05 14.65c2.16-.46 4.16-.2 5.98.72" fill="none" stroke="#08110d" stroke-linecap="round" stroke-width="1.5"/></svg>`;
    case "apple-podcasts":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5.5" fill="#b150e2"/><circle cx="12" cy="8.35" r="1.6" fill="#fff"/><path d="M12 10.95c-1.3 0-2.35 1.08-2.35 2.42 0 .94.45 1.66 1.12 2.12l-.56 2.73a.82.82 0 0 0 1.61.34l.18-.84.18.84a.82.82 0 0 0 1.61-.34l-.56-2.73c.67-.46 1.12-1.18 1.12-2.12 0-1.34-1.05-2.42-2.35-2.42Z" fill="#fff"/><path d="M8.4 10.55a3.95 3.95 0 0 1 7.2 0M6.65 9.3a6 6 0 0 1 10.7 0" fill="none" stroke="#fff" stroke-linecap="round" stroke-width="1.35"/></svg>`;
    case "rss":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5.25" fill="#f68b1f"/><circle cx="7.25" cy="16.75" r="1.75" fill="#fff"/><path d="M6.5 11.6a5.9 5.9 0 0 1 5.9 5.9M6.5 7a10.5 10.5 0 0 1 10.5 10.5" fill="none" stroke="#fff" stroke-linecap="round" stroke-width="1.8"/></svg>`;
    case "globe":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#0f141a"/><circle cx="12" cy="12" r="7.2" fill="none" stroke="#ffffff" stroke-width="1.45"/><path d="M4.8 12h14.4M12 4.8a11 11 0 0 1 0 14.4M12 4.8a11 11 0 0 0 0 14.4" fill="none" stroke="#ffffff" stroke-linecap="round" stroke-width="1.2"/></svg>`;
    case "youtube":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6.3" width="18" height="11.4" rx="3.2" fill="#ff0033"/><path d="m10.3 9.45 5 2.55-5 2.55z" fill="#fff"/></svg>`;
    case "team":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.25 12a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5Zm7.5-1.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5ZM5.25 18c.55-2.1 2.44-3.5 5-3.5s4.45 1.4 5 3.5M14.5 18c.33-1.28 1.41-2.15 2.95-2.15 1.44 0 2.41.73 2.8 1.9" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/></svg>`;
    case "star":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 4.75 2.3 4.66 5.14.75-3.72 3.62.88 5.12L12 16.55 7.4 18.9l.88-5.12-3.72-3.62 5.14-.75L12 4.75Z"/></svg>`;
    case "star-badge":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 18.25a6.25 6.25 0 1 0 0-12.5 6.25 6.25 0 0 0 0 12.5Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/><path d="m12 8.2 1.2 2.45 2.7.39-1.95 1.9.46 2.68L12 14.34l-2.41 1.28.46-2.68-1.95-1.9 2.7-.39L12 8.2Z" fill="currentColor" stroke="none"/></svg>`;
    case "tag":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.25 8.5 12 4.75h6.25v6.25L13.5 15.75 7.25 8.5Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/><path d="M14.5 8.5h.01" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9"/></svg>`;
    case "spark":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 5.25 1.45 4.3 4.3 1.45-4.3 1.45L12 16.75l-1.45-4.3-4.3-1.45 4.3-1.45L12 5.25ZM18.25 4l.45 1.3L20 5.75l-1.3.45-.45 1.3-.45-1.3L16.5 5.75l1.3-.45.45-1.3ZM18.25 15.25l.45 1.3 1.3.45-1.3.45-.45 1.3-.45-1.3-1.3-.45 1.3-.45.45-1.3Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6"/></svg>`;
    case "image":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.25 6.25h11.5v11.5H6.25zM9.25 10.25h.01M7.75 15.75l3.25-3 2.25 2 2-1.75 1.5 1.75" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/></svg>`;
    default:
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6.25" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>`;
  }
}
