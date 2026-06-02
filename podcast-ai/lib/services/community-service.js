function isValidProfileId(value) {
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value.trim());
}

function sanitizePodcastIds(value = "") {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function createCommunityService({
  store,
  writeThrottleWindowMs = 10 * 60 * 1000,
  maxWritesPerWindow = 20,
}) {
  const recentWritesByIp = new Map();

  function checkWriteThrottle(sourceIp) {
    if (!sourceIp) {
      return;
    }

    const now = Date.now();
    const recent = (recentWritesByIp.get(sourceIp) || []).filter(
      (timestamp) => now - timestamp < writeThrottleWindowMs,
    );

    if (recent.length >= maxWritesPerWindow) {
      const error = new Error("Too many rating actions from this address. Try again later.");
      error.statusCode = 429;
      throw error;
    }

    recent.push(now);
    recentWritesByIp.set(sourceIp, recent);
  }

  function createAnonymousProfile(existingProfileId, userAgent) {
    return {
      profileId: store.ensureProfile(isValidProfileId(existingProfileId) ? existingProfileId : null, userAgent),
    };
  }

  function getRatingSummaries({ podcastIds, profileId, userAgent }) {
    const ids = Array.isArray(podcastIds) ? podcastIds : sanitizePodcastIds(podcastIds);
    const resolvedProfileId = isValidProfileId(profileId)
      ? store.ensureProfile(profileId, userAgent)
      : null;

    return {
      profileId: resolvedProfileId,
      summaries: store.listRatingSummaries(ids, resolvedProfileId),
    };
  }

  function submitRating({ podcastId, rating, profileId, userAgent, source = "web", sourceIp = "" }) {
    checkWriteThrottle(sourceIp);

    const normalizedRating = Number.parseInt(String(rating), 10);
    if (!Number.isInteger(normalizedRating) || normalizedRating < 1 || normalizedRating > 10) {
      const error = new Error("Rating must be an integer between 1 and 10.");
      error.statusCode = 400;
      throw error;
    }

    const podcast = store.getPodcast(podcastId);
    if (!podcast) {
      const error = new Error("Unknown podcast.");
      error.statusCode = 404;
      throw error;
    }

    const resolvedProfileId = store.ensureProfile(isValidProfileId(profileId) ? profileId : null, userAgent);
    store.upsertRating({
      podcastId,
      profileId: resolvedProfileId,
      rating: normalizedRating,
      source,
    });

    return {
      profileId: resolvedProfileId,
      podcast,
      summary: store.listRatingSummaries([podcastId], resolvedProfileId)[podcastId],
    };
  }

  function removeRating({ podcastId, profileId, userAgent, source = "web", sourceIp = "" }) {
    checkWriteThrottle(sourceIp);

    const podcast = store.getPodcast(podcastId);
    if (!podcast) {
      const error = new Error("Unknown podcast.");
      error.statusCode = 404;
      throw error;
    }

    if (!isValidProfileId(profileId)) {
      const error = new Error("A valid profile id is required to remove a rating.");
      error.statusCode = 400;
      throw error;
    }

    const resolvedProfileId = store.ensureProfile(profileId, userAgent);
    store.deleteRating({
      podcastId,
      profileId: resolvedProfileId,
      source,
    });

    return {
      profileId: resolvedProfileId,
      podcast,
      summary: store.listRatingSummaries([podcastId], resolvedProfileId)[podcastId],
    };
  }

  return {
    createAnonymousProfile,
    getRatingSummaries,
    submitRating,
    removeRating,
  };
}

module.exports = {
  createCommunityService,
};
