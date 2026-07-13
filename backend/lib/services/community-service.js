const crypto = require("node:crypto");

function isValidProfileId(value) {
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value.trim());
}

function sanitizePodcastIds(value = "") {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeSecret(value = "") {
  return String(value || "").trim();
}

function hashValue(secret, value) {
  return crypto
    .createHmac("sha256", normalizeSecret(secret) || "echo-community-dev-voter-secret")
    .update(String(value || ""))
    .digest("hex");
}

function getDailySalt(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function createAbuseHash({ secret, sourceIp = "", userAgent = "", date = new Date() }) {
  return hashValue(secret, `${getDailySalt(date)}\n${sourceIp || "unknown"}\n${userAgent || ""}`);
}

function createCommunityService({
  store,
  rateLimiter = null,
  turnstile = null,
  voterHashSecret = "",
  abuseRetentionDays = 30,
  maxSummaryIds = 100,
}) {
  const abuseRetentionMs = Math.max(1, abuseRetentionDays) * 24 * 60 * 60 * 1000;

  function createAnonymousProfile(existingProfileId, userAgent) {
    return {
      profileId: store.ensureProfile(isValidProfileId(existingProfileId) ? existingProfileId : null, userAgent),
    };
  }

  function createDeviceProfile({ voterSecret, userAgent, sourceIp = "" }) {
    const abuseHash = createAbuseHash({ secret: voterHashSecret, sourceIp, userAgent });
    const profileId = store.ensureDeviceProfile({
      voterHash: hashValue(voterHashSecret, voterSecret),
      userAgent,
      abuseHash,
    });

    return {
      profileId,
      abuseHash,
    };
  }

  function getRatingSummaries({ podcastIds, profileId, voterSecret }) {
    const ids = Array.from(
      new Set(Array.isArray(podcastIds) ? podcastIds : sanitizePodcastIds(podcastIds)),
    ).slice(0, Math.max(1, maxSummaryIds));
    const resolvedProfileId = voterSecret
      ? store.findDeviceProfileId(hashValue(voterHashSecret, voterSecret))
      : isValidProfileId(profileId)
        ? store.findProfileId(profileId)
        : null;

    return {
      profileId: resolvedProfileId,
      summaries: store.listRatingSummaries(ids, resolvedProfileId),
    };
  }

  async function submitRating({
    podcastId,
    rating,
    profileId,
    voterSecret,
    turnstileToken,
    userAgent,
    source = "web",
    sourceIp = "",
  }) {
    const abuseHash = createAbuseHash({ secret: voterHashSecret, sourceIp, userAgent });
    rateLimiter?.check("community", abuseHash);
    await turnstile?.verify(turnstileToken, sourceIp);

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

    const resolvedProfileId = voterSecret
      ? store.ensureDeviceProfile({
          voterHash: hashValue(voterHashSecret, voterSecret),
          userAgent,
          abuseHash,
        })
      : store.ensureProfile(isValidProfileId(profileId) ? profileId : null, userAgent);
    store.recordAbuseEvent({
      scope: "community-rating",
      abuseHash,
      retentionMs: abuseRetentionMs,
    });
    store.upsertRating({
      podcastId,
      profileId: resolvedProfileId,
      rating: normalizedRating,
      source,
      abuseHash,
    });

    return {
      profileId: resolvedProfileId,
      podcast,
      summary: store.listRatingSummaries([podcastId], resolvedProfileId)[podcastId],
    };
  }

  async function removeRating({
    podcastId,
    profileId,
    voterSecret,
    turnstileToken,
    userAgent,
    source = "web",
    sourceIp = "",
  }) {
    const abuseHash = createAbuseHash({ secret: voterHashSecret, sourceIp, userAgent });
    rateLimiter?.check("community", abuseHash);
    await turnstile?.verify(turnstileToken, sourceIp);

    const podcast = store.getPodcast(podcastId);
    if (!podcast) {
      const error = new Error("Unknown podcast.");
      error.statusCode = 404;
      throw error;
    }

    if (!voterSecret && !isValidProfileId(profileId)) {
      const error = new Error("A valid profile id is required to remove a rating.");
      error.statusCode = 400;
      throw error;
    }

    const resolvedProfileId = voterSecret
      ? store.ensureDeviceProfile({
          voterHash: hashValue(voterHashSecret, voterSecret),
          userAgent,
          abuseHash,
        })
      : store.ensureProfile(profileId, userAgent);
    store.recordAbuseEvent({
      scope: "community-rating",
      abuseHash,
      retentionMs: abuseRetentionMs,
    });
    store.deleteRating({
      podcastId,
      profileId: resolvedProfileId,
      source,
      abuseHash,
    });

    return {
      profileId: resolvedProfileId,
      podcast,
      summary: store.listRatingSummaries([podcastId], resolvedProfileId)[podcastId],
    };
  }

  return {
    createAnonymousProfile,
    createDeviceProfile,
    getRatingSummaries,
    submitRating,
    removeRating,
  };
}

module.exports = {
  createAbuseHash,
  createCommunityService,
  hashValue,
};
