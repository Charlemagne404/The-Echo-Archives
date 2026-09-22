const REVIEWER_STORAGE_KEY = "echo-maintainer-reviewed-by";
export const MAINTAINER_SELECTED_ITEM_PARAM = "item";

const MAINTAINER_FILTER_KEYS = [
  "q",
  "status",
  "submissionType",
  "priority",
  "includeClosed",
  "page",
  "pageSize",
];

const VIEW_STATE_COPY = {
  loading: {
    title: "Loading maintainer workspace",
    message: "Checking the protected session and loading current data…",
  },
  error: {
    title: "Maintainer workspace unavailable",
    message: "The protected workspace could not be loaded. Check the connection and try again.",
  },
};

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

export function readSelectedSubmissionId() {
  return (new URLSearchParams(window.location.search).get(MAINTAINER_SELECTED_ITEM_PARAM) || "").trim();
}

export function resolveSelectedSubmissionId(items = [], requestedId = "") {
  const normalizedRequestedId = String(requestedId || "").trim();
  const visibleItems = Array.isArray(items) ? items : [];
  const requestedItem = visibleItems.find((item) => String(item?.id || "").trim() === normalizedRequestedId);
  return String(requestedItem?.id || visibleItems[0]?.id || "").trim();
}

export function areMaintainerFiltersEqual(first = {}, second = {}) {
  return MAINTAINER_FILTER_KEYS.every((key) => first[key] === second[key]);
}

function buildMaintainerPageUrl(params) {
  const nextSearch = params.toString();
  return `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash || ""}`;
}

function writeMaintainerPageUrl(nextUrl, mode = "replace") {
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash || ""}`;
  if (nextUrl === currentUrl) {
    return false;
  }

  const method = mode === "push" ? "pushState" : "replaceState";
  window.history[method]({}, "", nextUrl);
  return true;
}

export function syncFiltersToUrl(filters, { selectedId = "" } = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === "" || value === false || value === null || value === undefined) {
      return;
    }
    params.set(key, String(value));
  });

  const normalizedSelectedId = String(selectedId || "").trim();
  if (normalizedSelectedId) {
    params.set(MAINTAINER_SELECTED_ITEM_PARAM, normalizedSelectedId);
  }

  return writeMaintainerPageUrl(buildMaintainerPageUrl(params));
}

export function syncSelectedSubmissionToUrl(selectedId = "", { mode = "replace" } = {}) {
  const params = new URLSearchParams(window.location.search);
  const normalizedSelectedId = String(selectedId || "").trim();
  if (normalizedSelectedId) {
    params.set(MAINTAINER_SELECTED_ITEM_PARAM, normalizedSelectedId);
  } else {
    params.delete(MAINTAINER_SELECTED_ITEM_PARAM);
  }

  return writeMaintainerPageUrl(buildMaintainerPageUrl(params), mode);
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

export function getMaintainerViewElements(appShell = null) {
  return {
    statePanel: document.getElementById("maintainerStatePanel"),
    stateTitle: document.getElementById("maintainerStateTitle"),
    stateMessage: document.getElementById("maintainerStateMessage"),
    retryButton: document.getElementById("maintainerRetryButton"),
    authPanel: document.getElementById("maintainerAuthPanel"),
    authStatus: document.getElementById("maintainerAuthStatus"),
    appShell,
  };
}

export function setMaintainerViewState(view, state, { message = "", retry = state === "error" } = {}) {
  const copy = VIEW_STATE_COPY[state] || VIEW_STATE_COPY.loading;
  const showStatePanel = state === "loading" || state === "error";
  const showAuthPanel = state === "authRequired";
  const showAppShell = state === "ready";

  document.body.dataset.maintainerState = state;
  if (view.statePanel) view.statePanel.hidden = !showStatePanel;
  if (view.authPanel) view.authPanel.hidden = !showAuthPanel;
  if (view.appShell) view.appShell.hidden = !showAppShell;
  if (view.stateTitle && showStatePanel) view.stateTitle.textContent = copy.title;
  if (view.stateMessage && showStatePanel) view.stateMessage.textContent = message || copy.message;
  if (view.retryButton) view.retryButton.hidden = !(showStatePanel && retry);
  if (view.authStatus && showAuthPanel) {
    view.authStatus.textContent = message || "Sign in to continue.";
  }
}

export function setMaintainerControlBusy(control, busy) {
  if (!(control instanceof HTMLElement)) return;
  control.dataset.maintainerBusy = busy ? "true" : "false";
  control.setAttribute("aria-busy", busy ? "true" : "false");
  if ("disabled" in control) control.disabled = busy;
}

export async function runMaintainerAction({ control = null, region = null, action }) {
  if (
    (control instanceof HTMLElement && control.dataset.maintainerBusy === "true")
    || (region instanceof HTMLElement && region.getAttribute("aria-busy") === "true")
  ) {
    return { skipped: true, value: undefined };
  }

  setMaintainerControlBusy(control, true);
  if (region instanceof HTMLElement) region.setAttribute("aria-busy", "true");
  try {
    return { skipped: false, value: await action() };
  } finally {
    setMaintainerControlBusy(control, false);
    if (region instanceof HTMLElement) region.removeAttribute("aria-busy");
  }
}

export function isAbortError(error) {
  return error instanceof DOMException && error.name === "AbortError";
}

export function focusMaintainerWorkspace() {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  window.requestAnimationFrame(() => {
    document.getElementById("maintainerWorkspaceTitle")?.focus({ preventScroll: true });
  });
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

export async function initializeAuthFlow({ createMaintainerSession, destroyMaintainerSession, onAuthenticated, onLoggedOut = null }) {
  const authPanel = document.getElementById("maintainerAuthPanel");
  const authForm = document.getElementById("maintainerAuthForm");
  const passphraseInput = document.getElementById("maintainerPassphrase");
  const authStatus = document.getElementById("maintainerAuthStatus");
  const submitButton = authForm?.querySelector('button[type="submit"]') || null;
  const logoutButtons = [
    document.getElementById("maintainerLogoutButton"),
    document.getElementById("maintainerReportLogoutButton"),
  ].filter(Boolean);

  authForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!(passphraseInput instanceof HTMLInputElement)) {
      return;
    }

    await runMaintainerAction({
      control: submitButton,
      region: authForm,
      action: async () => {
        authStatus.textContent = "Unlocking…";
        try {
          await createMaintainerSession(passphraseInput.value);
          passphraseInput.value = "";
          authStatus.textContent = "Unlocked.";
          await onAuthenticated();
        } catch (error) {
          authStatus.textContent = error instanceof Error ? error.message : "Maintainer sign-in failed.";
          passphraseInput.focus();
        }
      },
    });
  });

  logoutButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      await runMaintainerAction({
        control: button,
        action: async () => {
          try {
            await destroyMaintainerSession();
            setAuthState({ authPanel, statusNode: authStatus, signedIn: false });
            button.hidden = true;
            [document.getElementById("maintainerRefreshButton"), document.getElementById("maintainerPrintButton")].forEach((node) => {
              if (node) node.hidden = true;
            });
            [document.getElementById("maintainerAppShell"), document.getElementById("maintainerReportShell")].forEach((node) => {
              if (node) node.hidden = true;
            });
            if (typeof onLoggedOut === "function") await onLoggedOut();
            window.requestAnimationFrame(() => passphraseInput?.focus());
          } catch (error) {
            authStatus.textContent = error instanceof Error ? error.message : "Maintainer sign-out failed.";
          }
        },
      });
    });
  });

  return { authPanel, authStatus, logoutButtons };
}
