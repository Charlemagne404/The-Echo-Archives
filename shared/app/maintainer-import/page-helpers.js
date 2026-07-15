import {
  focusMaintainerWorkspace,
  getMaintainerViewElements,
  getStoredReviewer,
  initializeAuthFlow,
  isAbortError,
  renderSelectOptions,
  runMaintainerAction,
  setAuthState,
  setMaintainerViewState,
  setStoredReviewer,
} from "../maintainer/page-helpers.js";
import { formatScopeStatus, formatSourceType, formatStatus } from "./format.js";

export const IMPORT_FILTER_OPTIONS = {
  status: [
    ["", "All open"],
    ["queued", "Queued"],
    ["processing", "Processing"],
    ["ready", "Ready"],
    ["needs-review", "Needs review"],
    ["failed", "Failed"],
    ["published", "Published"],
    ["duplicate", "Duplicate"],
    ["rejected", "Rejected"],
  ],
  scopeStatus: [
    ["", "All scope states"],
    ["in-scope", "In scope"],
    ["borderline", "Borderline"],
    ["out-of-scope", "Out of scope"],
  ],
  sourceType: [
    ["", "All sources"],
    ["title", "Title query"],
    ["apple", "Apple"],
    ["rss", "RSS"],
    ["podcast-index", "Podcast Index"],
    ["website", "Website"],
  ],
  duplicateState: [
    ["", "Any duplicate state"],
    ["duplicates", "Has duplicate match"],
    ["clear", "No duplicate match"],
  ],
};

export function readImportFilters(defaultPageSize = 20) {
  const params = new URLSearchParams(window.location.search);
  return {
    q: params.get("q") || "",
    status: params.get("status") || "",
    scopeStatus: params.get("scopeStatus") || "",
    sourceType: params.get("sourceType") || "",
    duplicateState: params.get("duplicateState") || "",
    includeClosed: ["1", "true"].includes((params.get("includeClosed") || "").toLowerCase()),
    page: Math.max(1, Number.parseInt(params.get("page") || "1", 10) || 1),
    pageSize: Math.max(1, Number.parseInt(params.get("pageSize") || String(defaultPageSize), 10) || defaultPageSize),
  };
}

export function syncImportFiltersToUrl(filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === "" || value === false || value === null || value === undefined) {
      return;
    }
    params.set(key, String(value));
  });

  const nextSearch = params.toString();
  const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}`;
  window.history.replaceState({}, "", nextUrl);
}

export function buildImportFilterSummary(filters, total) {
  const parts = [];
  if (filters.q) {
    parts.push(`search "${filters.q}"`);
  }
  if (filters.status) {
    parts.push(`status ${formatStatus(filters.status)}`);
  } else if (!filters.includeClosed) {
    parts.push("open statuses only");
  }
  if (filters.scopeStatus) {
    parts.push(`scope ${formatScopeStatus(filters.scopeStatus)}`);
  }
  if (filters.sourceType) {
    parts.push(`source ${formatSourceType(filters.sourceType)}`);
  }
  if (filters.duplicateState) {
    parts.push(filters.duplicateState === "duplicates" ? "with duplicate matches" : "without duplicate matches");
  }

  return parts.length > 0 ? `${total} matching candidates for ${parts.join(", ")}.` : `${total} matching candidates.`;
}

export {
  focusMaintainerWorkspace,
  getMaintainerViewElements,
  getStoredReviewer,
  initializeAuthFlow,
  isAbortError,
  renderSelectOptions,
  runMaintainerAction,
  setAuthState,
  setMaintainerViewState,
  setStoredReviewer,
};
