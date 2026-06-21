function createTurnstileError(message = "Rating verification failed.") {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function createTurnstileService({
  enabled = false,
  secretKey = "",
  endpoint = "https://challenges.cloudflare.com/turnstile/v0/siteverify",
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
    });

    if (!response.ok) {
      throw createTurnstileError("Rating verification could not be checked.");
    }

    const result = await response.json();
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
