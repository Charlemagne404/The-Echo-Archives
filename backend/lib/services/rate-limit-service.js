function normalizeClientIp(value = "") {
  const normalized = String(value || "").trim();
  return normalized || "unknown";
}

function createRateLimitError(scope, retryAfterSeconds) {
  const error = new Error(`Too many ${scope} requests from this address. Try again later.`);
  error.statusCode = 429;
  error.retryAfterSeconds = retryAfterSeconds;
  return error;
}

function createRateLimitService({
  store,
  policies = {},
}) {
  function check(scope, clientIp) {
    const policy = policies[scope];
    if (!policy || !store) {
      return;
    }

    const result = store.consume({
      scope,
      clientIp: normalizeClientIp(clientIp),
      windowMs: policy.windowMs,
      maxEvents: policy.max,
      createdAtMs: Date.now(),
    });

    if (!result.allowed) {
      throw createRateLimitError(scope, result.retryAfterSeconds);
    }
  }

  return {
    check,
  };
}

module.exports = {
  createRateLimitService,
};
