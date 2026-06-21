import { fetchCommunityConfig } from "./api.js";

const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let turnstileScriptPromise = null;

async function configureRatingVerification(widget) {
  let config;
  try {
    config = await fetchCommunityConfig();
  } catch (_error) {
    widget.verificationStatus.textContent = "Rating verification is unavailable.";
    return;
  }

  if (!config.turnstile.enabled) {
    return;
  }

  widget.turnstileEnabled = true;
  widget.verification.hidden = false;
  widget.verificationStatus.textContent = "Complete the listener check before saving a rating.";

  if (!config.turnstile.siteKey) {
    widget.verificationStatus.textContent = "Rating verification is not configured.";
    return;
  }

  await loadTurnstileScript();

  if (!globalThis.turnstile?.render) {
    widget.verificationStatus.textContent = "Rating verification could not load.";
    return;
  }

  widget.turnstileWidgetId = globalThis.turnstile.render(widget.verificationSlot, {
    sitekey: config.turnstile.siteKey,
    theme: "dark",
    callback(token) {
      widget.turnstileToken = token;
      widget.verificationStatus.textContent = "Rating check complete.";
    },
    "expired-callback"() {
      widget.turnstileToken = "";
      widget.verificationStatus.textContent = "Rating check expired. Complete it again before saving.";
    },
    "error-callback"() {
      widget.turnstileToken = "";
      widget.verificationStatus.textContent = "Rating check failed to load. Try again.";
    },
  });
}

function loadTurnstileScript() {
  if (globalThis.turnstile?.render) {
    return Promise.resolve();
  }

  if (!turnstileScriptPromise) {
    turnstileScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = TURNSTILE_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", reject, { once: true });
      document.head.appendChild(script);
    });
  }

  return turnstileScriptPromise;
}

async function getRatingVerificationToken(widget) {
  await widget.verificationPromise;

  if (!widget.turnstileEnabled) {
    return "";
  }

  if (!widget.turnstileToken) {
    throw new Error("Complete the rating check before saving.");
  }

  return widget.turnstileToken;
}

function resetRatingVerification(widget) {
  if (!widget.turnstileEnabled) {
    return;
  }

  widget.turnstileToken = "";
  if (widget.turnstileWidgetId !== null && globalThis.turnstile?.reset) {
    globalThis.turnstile.reset(widget.turnstileWidgetId);
  }
  widget.verificationStatus.textContent = "Complete the listener check before saving a rating.";
}

export {
  configureRatingVerification,
  getRatingVerificationToken,
  resetRatingVerification,
};
