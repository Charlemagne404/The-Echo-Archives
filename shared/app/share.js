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
  const statusNode =
    button.parentElement?.querySelector("[data-copy-link-status]") ||
    button.closest(".hero-copy, .detail-hero-copy, .collection-detail-hero-copy, .detail-section, .page-card")?.querySelector(
      "[data-copy-link-status]",
    );
  let resetTimer = 0;

  const reset = () => {
    button.textContent = defaultLabel;
    if (statusNode instanceof HTMLElement) {
      statusNode.textContent = "";
    }
  };

  button.addEventListener("click", async () => {
    const text = String(getText() || "").trim();
    if (!text) {
      return;
    }

    window.clearTimeout(resetTimer);
    const copied = await writeText(text);
    button.textContent = copied ? successLabel : failureLabel;
    if (statusNode instanceof HTMLElement) {
      statusNode.textContent = copied ? "Link copied to clipboard." : "Copy the current page URL manually.";
    }

    resetTimer = window.setTimeout(reset, resetDelayMs);
  });
}
