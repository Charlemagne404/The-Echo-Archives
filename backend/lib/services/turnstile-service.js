function createTurnstileError(message = "Rating verification failed.", statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function createTurnstileService({
  enabled = false,
  secretKey = "",
  endpoint = "https://challenges.cloudflare.com/turnstile/v0/siteverify",
  timeoutMs = 5000,
  fetchImpl = globalThis.fetch,
} = {}) {
  async function verify(token, remoteIp = "") {
    if (!enabled) {
      return {
        success: true,
        skipped: true,
      };
    }

    if (!secretKey) {
      throw createTurnstileError("Rating verification is not configured.");
    }

    if (!token || typeof token !== "string") {
      throw createTurnstileError("Complete the rating verification before saving.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let result;

    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          secret: secretKey,
          response: token,
          remoteip: remoteIp || undefined,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Turnstile request failed with ${response.status}`);
      }
      result = await response.json();
    } catch (_error) {
      throw createTurnstileError("Rating verification is temporarily unavailable. Try again shortly.", 503);
    } finally {
      clearTimeout(timeout);
    }
    if (!result?.success) {
      throw createTurnstileError("Rating verification failed. Refresh the check and try again.");
    }

    return result;
  }

  return {
    enabled,
    verify,
  };
}

module.exports = {
  createTurnstileService,
};
