function createDataRetentionService({
  communityStore,
  rateLimitStore,
  submissionStore,
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

    return {
      rateLimitRowsPruned,
      community,
      submissions,
    };
  }

  return { run };
}

module.exports = {
  createDataRetentionService,
};
