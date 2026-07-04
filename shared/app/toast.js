const TOAST_AUTO_DISMISS_MS = 4000;

let toastStack = null;
let liveRegion = null;
let activeToast = null;
let dismissTimer = 0;

function ensureToastSurface() {
  if (toastStack instanceof HTMLElement && liveRegion instanceof HTMLElement) {
    return;
  }

  toastStack = document.createElement("div");
  toastStack.className = "archive-toast-stack";
  toastStack.setAttribute("aria-live", "polite");
  toastStack.setAttribute("aria-atomic", "true");

  liveRegion = document.createElement("div");
  liveRegion.className = "archive-toast-live";
  liveRegion.setAttribute("aria-live", "polite");
  liveRegion.setAttribute("aria-atomic", "true");

  toastStack.appendChild(liveRegion);
  document.body.appendChild(toastStack);
}

function clearToast() {
  if (dismissTimer) {
    window.clearTimeout(dismissTimer);
    dismissTimer = 0;
  }

  if (activeToast instanceof HTMLElement) {
    activeToast.remove();
  }

  activeToast = null;
}

export function showToast({ message, tone = "info", label = "" } = {}) {
  const normalizedMessage = String(message || "").trim();
  if (!normalizedMessage) {
    return;
  }

  ensureToastSurface();
  clearToast();

  const resolvedLabel =
    String(label || "").trim() ||
    (tone === "success" ? "Success" : tone === "error" ? "Error" : "Archive update");

  const toast = document.createElement("section");
  toast.className = "archive-toast";
  toast.dataset.tone = tone;
  toast.setAttribute("role", "status");

  const content = document.createElement("div");
  content.className = "archive-toast-content";

  const labelNode = document.createElement("p");
  labelNode.className = "archive-toast-label";
  labelNode.textContent = resolvedLabel;

  const messageNode = document.createElement("p");
  messageNode.className = "archive-toast-message";
  messageNode.textContent = normalizedMessage;

  const dismissButton = document.createElement("button");
  dismissButton.type = "button";
  dismissButton.className = "archive-toast-dismiss";
  dismissButton.setAttribute("aria-label", "Dismiss notification");
  dismissButton.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6 18 18M18 6 6 18"></path>
    </svg>
  `;
  dismissButton.addEventListener("click", clearToast);

  content.append(labelNode, messageNode);
  toast.append(content, dismissButton);
  toastStack.appendChild(toast);
  activeToast = toast;

  if (liveRegion instanceof HTMLElement) {
    liveRegion.textContent = `${resolvedLabel}. ${normalizedMessage}`;
  }

  dismissTimer = window.setTimeout(clearToast, TOAST_AUTO_DISMISS_MS);
}
