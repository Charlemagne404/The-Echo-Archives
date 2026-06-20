const REVIEWER_STORAGE_KEY = "echo-maintainer-reviewed-by";

export const FILTER_OPTIONS = {
  status: [
    ["", "All open"],
    ["new", "New"],
    ["in-review", "In Review"],
    ["needs-follow-up", "Needs Follow-up"],
    ["accepted", "Accepted"],
    ["rejected", "Rejected"],
  ],
  submissionType: [
    ["", "All types"],
    ["show", "Show"],
    ["correction", "Correction"],
    ["listener-review", "Listener review"],
    ["creator-verification", "Creator verification"],
  ],
  priority: [
    ["", "All priorities"],
    ["high", "High"],
    ["normal", "Normal"],
    ["low", "Low"],
  ],
};

export function getStoredReviewer() {
  return window.localStorage.getItem(REVIEWER_STORAGE_KEY) || "";
}

export function setStoredReviewer(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    window.localStorage.removeItem(REVIEWER_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(REVIEWER_STORAGE_KEY, trimmed);
}

export function readFilters(defaultPageSize = 20) {
  const params = new URLSearchParams(window.location.search);
  return {
    q: params.get("q") || "",
    status: params.get("status") || "",
    submissionType: params.get("submissionType") || "",
    priority: params.get("priority") || "",
    includeClosed: ["1", "true"].includes((params.get("includeClosed") || "").toLowerCase()),
    page: Math.max(1, Number.parseInt(params.get("page") || "1", 10) || 1),
    pageSize: Math.max(1, Number.parseInt(params.get("pageSize") || String(defaultPageSize), 10) || defaultPageSize),
  };
}

export function syncFiltersToUrl(filters) {
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

export function renderSelectOptions(select, options, currentValue) {
  if (!(select instanceof HTMLSelectElement)) {
    return;
  }

  select.innerHTML = options.map(([value, label]) => `
    <option value="${value}" ${currentValue === value ? "selected" : ""}>${label}</option>
  `).join("");
}

export function setAuthState({ authPanel, appShell = null, statusNode, signedIn }) {
  if (authPanel) {
    authPanel.hidden = signedIn;
  }
  if (appShell) {
    appShell.hidden = !signedIn;
  }
  if (!signedIn && statusNode) {
    statusNode.textContent = "Sign in to continue.";
  }
}

export function buildFilterSummary(filters, total, formatStatus, formatSubmissionType) {
  const parts = [];
  if (filters.q) {
    parts.push(`search "${filters.q}"`);
  }
  if (filters.status) {
    parts.push(`status ${formatStatus(filters.status)}`);
  } else if (!filters.includeClosed) {
    parts.push("open statuses only");
  }
  if (filters.submissionType) {
    parts.push(`type ${formatSubmissionType(filters.submissionType)}`);
  }
  if (filters.priority) {
    parts.push(`priority ${filters.priority}`);
  }
  return parts.length > 0 ? `${total} matching submissions for ${parts.join(", ")}.` : `${total} matching submissions.`;
}

export async function initializeAuthFlow({ createMaintainerSession, destroyMaintainerSession, onAuthenticated }) {
  const authPanel = document.getElementById("maintainerAuthPanel");
  const authForm = document.getElementById("maintainerAuthForm");
  const passphraseInput = document.getElementById("maintainerPassphrase");
  const authStatus = document.getElementById("maintainerAuthStatus");
  const logoutButtons = [
    document.getElementById("maintainerLogoutButton"),
    document.getElementById("maintainerReportLogoutButton"),
  ].filter(Boolean);

  authForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!(passphraseInput instanceof HTMLInputElement)) {
      return;
    }

    authStatus.textContent = "Unlocking…";
    try {
      await createMaintainerSession(passphraseInput.value);
      passphraseInput.value = "";
      authStatus.textContent = "Unlocked.";
      await onAuthenticated();
    } catch (error) {
      authStatus.textContent = error instanceof Error ? error.message : "Maintainer sign-in failed.";
    }
  });

  logoutButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      await destroyMaintainerSession();
      setAuthState({ authPanel, statusNode: authStatus, signedIn: false });
      button.hidden = true;
      [document.getElementById("maintainerRefreshButton"), document.getElementById("maintainerPrintButton")].forEach((node) => {
        if (node) {
          node.hidden = true;
        }
      });
      [document.getElementById("maintainerAppShell"), document.getElementById("maintainerReportShell")].forEach((node) => {
        if (node) {
          node.hidden = true;
        }
      });
    });
  });

  return { authPanel, authStatus, logoutButtons };
}
