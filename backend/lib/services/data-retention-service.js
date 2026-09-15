function createDataRetentionService({
  communityStore,
  rateLimitStore,
  submissionStore,
  analyticsStore = null,
  policy,
}) {
  function run({ now = new Date() } = {}) {
    const nowDate = now instanceof Date ? now : new Date(now);
    const rateLimitRowsPruned = rateLimitStore.pruneExpired({
      nowMs: nowDate.getTime(),
      scopeWindows: policy.rateLimitWindows,
    });
    const community = communityStore.purgePersonalData({
      now: nowDate,
      abuseRetentionDays: policy.communityAbuseRetentionDays,
      profileMetadataRetentionDays: policy.communityProfileMetadataRetentionDays,
      orphanProfileRetentionDays: policy.communityOrphanProfileRetentionDays,
    });
    const submissions = submissionStore.purgePersonalData({
      now: nowDate,
      networkRetentionDays: policy.submissionNetworkDataRetentionDays,
      personalRetentionDays: policy.submissionPersonalDataRetentionDays,
    });
    const analytics = analyticsStore
      ? analyticsStore.purgeExpiredEvents({ now: nowDate })
      : { eventsDeleted: 0, visitorsDeleted: 0 };

    return {
      rateLimitRowsPruned,
      community,
      submissions,
      analytics,
    };
  }

  return { run };
}

module.exports = {
  createDataRetentionService,
};
