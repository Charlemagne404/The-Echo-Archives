import { showToast } from "./toast.js";

async function fallbackCopyText(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  try {
    return document.execCommand("copy");
  } finally {
    textarea.remove();
  }
}

async function writeText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_error) {
      // Fall back to legacy copy below.
    }
  }

  return fallbackCopyText(text);
}

function canUseNativeShare() {
  return typeof navigator.share === "function" && window.matchMedia?.("(pointer: coarse)")?.matches === true;
}

function updateInlineStatus(button, message = "", tone = "") {
  const statusNode =
    button.parentElement?.querySelector("[data-copy-link-status]") ||
    button.closest(".hero-copy, .detail-hero-copy, .collection-detail-hero-copy, .detail-section, .page-card")?.querySelector(
      "[data-copy-link-status]",
    );

  if (statusNode instanceof HTMLElement) {
    statusNode.textContent = message;
    statusNode.dataset.state = tone;
    if (tone === "success") {
      statusNode.classList.remove("is-detail-feedback-active");
      void statusNode.offsetWidth;
      statusNode.classList.add("is-detail-feedback-active");
    } else {
      statusNode.classList.remove("is-detail-feedback-active");
    }
  }
}

export function bindCopyLinkButton(
  button,
  {
    getText = () => window.location.href,
    successLabel = "Copied",
    failureLabel = "Copy failed",
    resetDelayMs = 1800,
  } = {},
) {
  if (!(button instanceof HTMLButtonElement) || button.dataset.copyLinkBound === "true") {
    return;
  }

  button.dataset.copyLinkBound = "true";
  const defaultLabel = button.textContent || "Copy link";
  let resetTimer = 0;

  const reset = () => {
    button.textContent = defaultLabel;
    updateInlineStatus(button, "");
  };

  button.addEventListener("click", async () => {
    const text = String(getText() || "").trim();
    if (!text) {
      return;
    }

    window.clearTimeout(resetTimer);
    const copied = await writeText(text);
    button.textContent = copied ? successLabel : failureLabel;
    const statusMessage = copied ? "Link copied to clipboard." : "Copy the current page URL manually.";
    updateInlineStatus(button, statusMessage, copied ? "success" : "error");
    showToast({
      message: statusMessage,
      tone: copied ? "success" : "error",
      label: copied ? "Link ready" : "Copy failed",
    });

    resetTimer = window.setTimeout(reset, resetDelayMs);
  });
}

export function bindShareButton(
  button,
  {
    title = document.title,
    text = "",
    url = window.location.href,
    shareSuccessMessage = "Shared from the archive.",
    copySuccessMessage = "Link copied to clipboard.",
    copyFailureMessage = "Copy the current page URL manually.",
  } = {},
) {
  if (!(button instanceof HTMLButtonElement) || button.dataset.shareBound === "true") {
    return;
  }

  button.dataset.shareBound = "true";

  button.addEventListener("click", async () => {
    const normalizedUrl = String(url || window.location.href).trim();
    if (!normalizedUrl) {
      return;
    }

    if (canUseNativeShare()) {
      try {
        await navigator.share({
          title: String(title || document.title).trim(),
          text: String(text || "").trim(),
          url: normalizedUrl,
        });
        updateInlineStatus(button, shareSuccessMessage, "success");
        showToast({
          message: shareSuccessMessage,
          tone: "success",
          label: "Share ready",
        });
        return;
      } catch (error) {
        if (error?.name === "AbortError") {
          updateInlineStatus(button, "");
          return;
        }
      }
    }

    const copied = await writeText(normalizedUrl);
    const message = copied ? copySuccessMessage : copyFailureMessage;
    updateInlineStatus(button, message, copied ? "success" : "error");
    showToast({
      message,
      tone: copied ? "success" : "error",
      label: copied ? "Link ready" : "Copy failed",
    });
  });
}
