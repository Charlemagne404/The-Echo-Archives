const DEFAULT_INTERVAL_MS = 60_000;
const STALE_PROCESSING_LEASE_MS = 2 * 60_000;
const MAX_AUTOMATIC_ATTEMPTS = 4;
const NOTIFICATION_EVENTS = new Set([
  "new-submission",
  "ready-for-review",
  "processing-failed",
  "stale-submission",
]);

function boundedInteger(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Number.isInteger(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

function toImportSubmission(row) {
  return {
    id: row.id,
    status: row.status,
    submissionType: row.submission_type,
    showTitle: row.show_title,
    creatorName: row.creator_name,
    officialSite: row.official_site,
    rssOrListenLink: row.rss_or_listen_link,
    payload: row.payload_json || {},
  };
}

function createSubmissionLifecycleService({
  store,
  importService,
  discordNotifications = null,
  config = {},
  logger = console,
  clock = () => new Date(),
}) {
  const enabled = config.SUBMISSION_AUTOMATION_ENABLED === true;
  const concurrency = boundedInteger(config.SUBMISSION_PROCESSING_CONCURRENCY, 2, 1, 8);
  const intervalMs = boundedInteger(config.SUBMISSION_RECONCILIATION_INTERVAL_MS, DEFAULT_INTERVAL_MS, 60_000, 60 * 60_000);
  const staleNotificationDays = boundedInteger(config.SUBMISSION_STALE_NOTIFICATION_DAYS, 30, 7, 365);
  const personalRetentionDays = boundedInteger(config.SUBMISSION_PERSONAL_DATA_RETENTION_DAYS, 180, 30, 7300);
  const networkRetentionDays = boundedInteger(config.SUBMISSION_NETWORK_DATA_RETENTION_DAYS, 30, 1, personalRetentionDays);
  let timer = null;
  let scheduled = null;
  let running = false;

  function now() {
    const value = clock();
    return value instanceof Date ? value : new Date(value);
  }

  function notify(submission, eventType, eventKey) {
    if (!NOTIFICATION_EVENTS.has(eventType) || typeof discordNotifications?.enqueueSubmissionLifecycle !== "function") return false;
    try {
      return discordNotifications.enqueueSubmissionLifecycle({
        eventId: `submission-lifecycle:${submission.id}:${eventKey}`,
        eventType,
        submissionId: submission.id,
        timestamp: now().toISOString(),
      });
    } catch (error) {
      logger.error(JSON.stringify({
        level: "error",
        event: "submission_notification_enqueue_failed",
        submissionId: submission.id,
        eventType,
        error: String(error?.message || error).slice(0, 240),
      }));
      return false;
    }
  }

  function recordEvent(submission, event) {
    const added = store.recordLifecycleEvent({
      submissionId: submission.id,
      eventType: event.eventType,
      eventKey: event.eventKey,
      actor: event.actor || "submission-worker",
      reason: event.reason || "",
      evidence: event.evidence || {},
      createdAt: event.createdAt || now().toISOString(),
    });
    if (added) notify(submission, event.eventType, event.eventKey);
    return added;
  }

  function setProcessing(submission, status, { error = "", eventType = "", eventKey = "", reason = "", evidence = {}, nextAttemptAt = null } = {}) {
    const result = store.updateProcessingState(submission.id, {
      status,
      error,
      startedAt: status === "processing" ? now() : null,
      nextAttemptAt,
      eventType,
      eventKey,
      reason,
      evidence,
    });
    if (result.eventAdded) notify(submission, eventType, eventKey);
    return result.changed;
  }

  function resolve(submission, { status, reason, evidence = {}, showId = "", actor = "submission-worker", eventKey = "" } = {}) {
    const changed = store.resolveSubmission(submission.id, { status, reason, evidence, showId, actor, eventKey });
    if (changed) notify(submission, status, eventKey || `resolution:${status}`);
    return changed;
  }

  function identityGroups(rows) {
    const byIdentity = new Map();
    rows.forEach((row) => {
      if (!row.show_title || row.content_redacted_at) return;
      const keys = importService.getSubmissionIdentityKeys(toImportSubmission(row));
      keys.forEach((identity) => {
        const key = `${identity.type}:${identity.value}`;
        const group = byIdentity.get(key) || { identity, rows: [] };
        group.rows.push(row);
        byIdentity.set(key, group);
      });
    });
    return [...byIdentity.values()].filter((group) => new Set(group.rows.map((row) => row.id)).size > 1);
  }

  function canonicalSubmission(rows) {
    const published = rows.filter((row) => row.import_candidate_status === "published" && row.import_published_show_id);
    const pool = published.length ? published : rows.filter((row) => row.resolution_status === "published");
    return [...(pool.length ? pool : rows)].sort((left, right) => (
      String(left.submitted_at).localeCompare(String(right.submitted_at)) || left.id.localeCompare(right.id)
    ))[0];
  }

  function reconcileDuplicateSubmissions(rows) {
    identityGroups(rows).forEach((group) => {
      const uniqueRows = [...new Map(group.rows.map((row) => [row.id, row])).values()];
      const canonical = canonicalSubmission(uniqueRows);
      uniqueRows.filter((row) => row.id !== canonical.id).forEach((duplicate) => {
        const evidence = {
          identityType: group.identity.type,
          identityValue: group.identity.value,
          confidence: 1,
          canonicalSubmissionId: canonical.id,
          archiveShowId: canonical.import_published_show_id || canonical.import_resolved_show_id || "",
        };
        if (duplicate.resolution_status === "open") {
          const eventKey = `resolution:duplicate:${canonical.id}`;
          const changed = store.resolveDuplicateSubmission(duplicate.id, canonical.id, {
            reason: "duplicate-provider-identity",
            evidence,
            actor: "submission-worker",
            eventKey,
          });
          if (changed) notify(duplicate, "duplicate", eventKey);
        } else {
          store.relateSubmissions(duplicate.id, canonical.id, { relationshipType: "duplicate-of", evidence, createdAt: now().toISOString() });
        }
        recordEvent(canonical, {
          eventType: "related-submission",
          eventKey: `related-duplicate:${duplicate.id}`,
          reason: "another-submission-shares-provider-identity",
          evidence: { relatedSubmissionId: duplicate.id, identityType: group.identity.type, confidence: 1 },
        });
      });
    });
  }

  function reconcilePublishedCandidates(rows) {
    rows.forEach((row) => {
      if (row.resolution_status !== "open" || row.status === "rejected") return;
      if (row.import_candidate_status === "published" && row.import_published_show_id) {
        resolve(row, {
          status: "published",
          reason: "linked-import-candidate-published",
          showId: row.import_published_show_id,
          evidence: { candidateId: row.import_candidate_id, showId: row.import_published_show_id, source: "durable-candidate-link" },
          eventKey: `resolution:published:${row.import_candidate_id}`,
        });
      }
    });
  }

  function reconcileArchiveMatches(rows) {
    rows.forEach((row) => {
      if (row.resolution_status !== "open" || row.status === "rejected" || row.content_redacted_at) return;
      if (row.import_candidate_status === "published" && row.import_published_show_id) return;
      const match = importService.findSubmissionIdentityMatch(toImportSubmission(row));
      if (!match) return;
      if (match.conflictingShowIds?.length) {
        setProcessing(row, "needs-investigation", {
          error: "Provider identity maps to more than one archive show.",
          eventType: "needs-investigation",
          eventKey: `identity-conflict:${match.conflictingShowIds.join(":")}`,
          reason: "provider-identity-conflict",
          evidence: { showIds: [match.showId, ...match.conflictingShowIds], identityType: match.identityType },
        });
        return;
      }
      resolve(row, {
        status: "already-listed",
        reason: "strong-provider-identity-match",
        showId: match.showId,
        evidence: { showId: match.showId, showTitle: match.showTitle, identities: match.evidence },
        eventKey: `resolution:already-listed:${match.showId}`,
      });
    });
  }

  function syncCandidateStatuses(rows) {
    rows.forEach((row) => {
      if (row.resolution_status !== "open" || row.status === "rejected" || !row.import_candidate_id) return;
      const status = row.import_candidate_status;
      const revisionKey = `${row.import_candidate_id}:${row.import_candidate_revision || 1}`;
      if (status === "ready") {
        setProcessing(row, "ready-for-review", {
          eventType: "ready-for-review",
          eventKey: `candidate-ready:${revisionKey}`,
          reason: "importer-readiness-checks-passed-editorial-approval-required",
          evidence: { candidateId: row.import_candidate_id, inputRevision: row.import_candidate_revision || 1 },
        });
      } else if (["failed"].includes(status)) {
        setProcessing(row, "failed", {
          error: row.import_candidate_error || "Importer preparation failed after retry attempts.",
          eventType: "processing-failed",
          eventKey: `candidate-failed:${revisionKey}`,
          reason: "importer-retry-limit-reached",
          evidence: { candidateId: row.import_candidate_id, inputRevision: row.import_candidate_revision || 1 },
        });
      } else if (["needs-review", "duplicate", "rejected"].includes(status)) {
        setProcessing(row, "needs-investigation", {
          error: row.import_candidate_error || "Importer preparation needs maintainer investigation.",
          eventType: "needs-investigation",
          eventKey: `candidate-investigation:${revisionKey}`,
          reason: "importer-readiness-or-identity-review-required",
          evidence: { candidateId: row.import_candidate_id, candidateStatus: status },
        });
      } else if (["queued", "processing"].includes(status)) {
        setProcessing(row, "processing");
      }
    });
  }

  function notifyStale(rows) {
    const cutoff = now().getTime() - staleNotificationDays * 24 * 60 * 60_000;
    rows.forEach((row) => {
      if (row.resolution_status !== "open" || !row.submitted_at) return;
      const submittedAt = Date.parse(row.submitted_at);
      if (!Number.isFinite(submittedAt) || submittedAt > cutoff) return;
      const eventKey = `stale:${staleNotificationDays}-days`;
      if (recordEvent(row, {
        eventType: "stale-submission",
        eventKey,
        reason: "unresolved-submission-exceeded-stale-notification-threshold",
        evidence: { ageDays: Math.floor((now().getTime() - submittedAt) / 86_400_000) },
      })) {
        logger.warn(JSON.stringify({ level: "warn", event: "submission_queue_stale", submissionId: row.id }));
      }
    });
  }

  async function processSubmission(id) {
    const row = store.getShowSubmission(id);
    if (!row || row.submission_type !== "show" || row.status === "rejected" || row.resolution_status !== "open") return false;
    if (!store.claimProcessing(id, { startedAt: now(), staleBefore: new Date(now().getTime() - STALE_PROCESSING_LEASE_MS) })) return false;
    const claimed = store.getShowSubmission(id);
    const submission = toImportSubmission({ ...claimed, payload_json: claimed.payload_json });
    try {
      if (claimed.content_redacted_at) {
        setProcessing(submission, "needs-investigation", {
          error: "Submission details were redacted under the configured retention policy.",
          eventType: "needs-investigation",
          eventKey: "retention-content-redacted",
          reason: "cannot-process-redacted-submission",
        });
        return true;
      }
      const archiveMatch = importService.findSubmissionIdentityMatch(submission);
      if (archiveMatch) {
        if (archiveMatch.conflictingShowIds?.length) {
          setProcessing(submission, "needs-investigation", {
            error: "Provider identity maps to more than one archive show.",
            eventType: "needs-investigation",
            eventKey: `identity-conflict:${archiveMatch.conflictingShowIds.join(":")}`,
            reason: "provider-identity-conflict",
            evidence: { showIds: [archiveMatch.showId, ...archiveMatch.conflictingShowIds] },
          });
          return true;
        }
        resolve(submission, {
          status: "already-listed",
          reason: "strong-provider-identity-match",
          showId: archiveMatch.showId,
          evidence: { showId: archiveMatch.showId, showTitle: archiveMatch.showTitle, identities: archiveMatch.evidence },
          eventKey: `resolution:already-listed:${archiveMatch.showId}`,
        });
        return true;
      }
      const potentialMatches = importService.findPotentialSubmissionMatches(submission);
      const hasSource = importService.submissionHasSupportedPreparationSource(submission);
      if (potentialMatches.length || !hasSource) {
        setProcessing(submission, "needs-investigation", {
          error: potentialMatches.length
            ? "A title or alias matches an archive show, but no strong provider identity confirms it."
            : "No supported RSS, Apple, Podcast Index, or official website source was submitted.",
          eventType: "needs-investigation",
          eventKey: potentialMatches.length ? `title-match:${potentialMatches[0].id}` : "unsupported-source",
          reason: potentialMatches.length ? "potential-title-match-requires-human-verification" : "unsupported-or-incomplete-source",
          evidence: { potentialMatches, supportedSource: hasSource },
        });
        return true;
      }
      await importService.seedSubmissionForMaintainer(submission, "submission-automation");
      const linked = store.getShowSubmission(id);
      if (!linked?.import_candidate_id) {
        setProcessing(submission, "needs-investigation", {
          error: "Submission was accepted, but no durable importer candidate was linked.",
          eventType: "needs-investigation",
          eventKey: "candidate-link-missing",
          reason: "automatic-preparation-did-not-produce-a-candidate-link",
        });
        return true;
      } else {
        setProcessing(submission, "processing", {
          eventType: "candidate-queued",
          eventKey: `candidate-queued:${linked.import_candidate_id}`,
          reason: "durable-importer-preparation-job-queued",
          evidence: { candidateId: linked.import_candidate_id },
        });
      }
      return true;
    } catch (error) {
      const attemptCount = Number(claimed.processing_attempts || 1);
      const retryable = error?.retryable !== false && attemptCount < MAX_AUTOMATIC_ATTEMPTS;
      const nextAttemptAt = retryable ? new Date(now().getTime() + Math.min(60 * 60_000, 30_000 * (2 ** (attemptCount - 1)))) : null;
      setProcessing(submission, retryable ? "retry-wait" : "needs-investigation", {
        error: String(error?.message || error).slice(0, 1_000),
        nextAttemptAt,
        eventType: retryable ? "dispatch-retry-scheduled" : "processing-failed",
        eventKey: retryable ? `dispatch-retry:${attemptCount}` : `dispatch-failed:${attemptCount}`,
        reason: retryable ? "automatic-preparation-dispatch-retry" : "automatic-preparation-dispatch-exhausted",
        evidence: { attemptCount, retryable: Boolean(retryable) },
      });
      return true;
    }
  }

  async function runOnce({ limit = concurrency } = {}) {
    if (!enabled || running) return { enabled, claimed: 0 };
    running = true;
    try {
      const rows = store.listForLifecycleReconciliation();
      reconcileDuplicateSubmissions(rows);
      reconcilePublishedCandidates(rows);
      reconcileArchiveMatches(rows);
      syncCandidateStatuses(store.listForLifecycleReconciliation());
      notifyStale(store.listForLifecycleReconciliation());
      const ids = store.listDueProcessing({ now: now(), limit: Math.min(concurrency, Math.max(1, Number(limit) || concurrency)) });
      const claimed = await Promise.all(ids.map((id) => processSubmission(id)));
      const claimedIds = ids.filter((_id, index) => claimed[index]);
      return { enabled, claimed: claimedIds.length, submissionIds: claimedIds };
    } catch (error) {
      logger.error(JSON.stringify({ level: "error", event: "submission_lifecycle_reconciliation_failed", error: String(error?.message || error).slice(0, 240) }));
      return { enabled, claimed: 0, error: String(error?.message || error).slice(0, 240) };
    } finally {
      running = false;
    }
  }

  function signalNewSubmission(id) {
    const submission = store.getShowSubmission(id);
    if (submission && submission.submission_type === "show" && submission.resolution_status === "open") {
      recordEvent(submission, {
        eventType: "new-submission",
        eventKey: "notification:new-submission",
        actor: "submission-intake",
        reason: "new-show-submission-received",
      });
    }
    if (!enabled || scheduled) return false;
    scheduled = setTimeout(() => {
      scheduled = null;
      void runOnce().catch(() => {});
    }, 0);
    scheduled.unref?.();
    return Boolean(id);
  }

  function start() {
    if (!enabled || timer) return false;
    timer = setInterval(() => { void runOnce(); }, intervalMs);
    timer.unref?.();
    void runOnce();
    return true;
  }

  function stop() {
    if (timer) clearInterval(timer);
    if (scheduled) clearTimeout(scheduled);
    timer = null;
    scheduled = null;
  }

  function retryForMaintainer(id, actor = "authenticated-maintainer") {
    const submission = store.getShowSubmission(id);
    if (!submission || submission.submission_type !== "show") {
      const error = new Error("Show submission not found.");
      error.statusCode = 404;
      throw error;
    }
    if (submission.resolution_status !== "open" || submission.status === "rejected") {
      const error = new Error("Only unresolved, non-rejected show submissions can be retried.");
      error.statusCode = 409;
      throw error;
    }
    if (submission.import_candidate_id) {
      const result = importService.retryForMaintainer(submission.import_candidate_id, actor);
      setProcessing(submission, "processing", { eventType: "retry-requested", eventKey: `manual-retry:${Date.now()}`, reason: "maintainer-requested-import-retry", evidence: { candidateId: submission.import_candidate_id } });
      return result;
    }
    store.updateProcessingState(id, { status: "received", error: "", startedAt: null, nextAttemptAt: null });
    recordEvent(submission, { eventType: "retry-requested", eventKey: `manual-retry:${Date.now()}`, actor, reason: "maintainer-requested-submission-retry" });
    signalNewSubmission(id);
    return { submissionId: id, queued: true };
  }

  function resolveDuplicateForMaintainer(id, relatedSubmissionId, actor = "authenticated-maintainer") {
    const submission = store.getShowSubmission(id);
    const related = store.getShowSubmission(relatedSubmissionId);
    if (!submission || !related || submission.submission_type !== "show" || related.submission_type !== "show" || id === relatedSubmissionId) {
      const error = new Error("Choose two different show submissions to resolve as duplicates.");
      error.statusCode = 400;
      throw error;
    }
    if (submission.resolution_status !== "open" || submission.status === "rejected") {
      const error = new Error("Only unresolved show submissions can be resolved as duplicates.");
      error.statusCode = 409;
      throw error;
    }
    const evidence = { confirmedByMaintainer: true, relatedSubmissionId };
    const eventKey = `resolution:duplicate:${relatedSubmissionId}`;
    const updated = store.resolveDuplicateSubmission(id, relatedSubmissionId, {
      reason: "maintainer-confirmed-duplicate",
      evidence,
      actor,
      eventKey,
    });
    if (!updated) {
      const error = new Error("This submission was resolved by another queue action.");
      error.statusCode = 409;
      throw error;
    }
    notify(submission, "duplicate", eventKey);
    return store.getShowSubmission(id);
  }

  function resolveAlreadyListedForMaintainer(id, showId, actor = "authenticated-maintainer") {
    const submission = store.getShowSubmission(id);
    if (!submission || submission.submission_type !== "show" || submission.resolution_status !== "open") {
      const error = new Error("Only unresolved show submissions can be resolved as already listed.");
      error.statusCode = 409;
      throw error;
    }
    const match = importService.findPotentialSubmissionMatches(toImportSubmission(submission)).find((entry) => entry.id === showId);
    if (!match) {
      const error = new Error("Choose an archive show shown as a potential match for this submission.");
      error.statusCode = 400;
      throw error;
    }
    resolve(submission, {
      status: "already-listed",
      reason: "maintainer-confirmed-archive-match",
      evidence: { showId: match.id, showTitle: match.title, matchType: match.matchType, confidence: match.confidence, confirmedByMaintainer: true },
      showId: match.id,
      actor,
      eventKey: `resolution:already-listed:${match.id}:maintainer`,
    });
    return store.getShowSubmission(id);
  }

  function getDetail(id) {
    const submission = store.getShowSubmission(id);
    if (!submission) return null;
    const lifecycle = store.getLifecycleDetails(id);
    const potentialMatches = submission.submission_type === "show" && !submission.content_redacted_at && submission.resolution_status === "open"
      ? importService.findPotentialSubmissionMatches(toImportSubmission({ ...submission, payload_json: submission.payload_json }))
      : [];
    return {
      lifecycle,
      potentialMatches,
      potentialSubmissionDuplicates: submission.submission_type === "show" && !submission.content_redacted_at && submission.resolution_status === "open"
        ? lifecycle.potentialDuplicates
        : [],
    };
  }

  function getHealth() {
    return {
      ...store.getQueueHealth({
        now: now(),
        personalRetentionDays: personalRetentionDays,
        networkRetentionDays: networkRetentionDays,
      }),
      automationEnabled: enabled,
      processingConcurrency: concurrency,
      reconciliationIntervalMs: intervalMs,
      personalDataRetentionDays: personalRetentionDays,
      networkDataRetentionDays: networkRetentionDays,
      notifications: discordNotifications?.getStatus?.() || { enabled: false, operational: false },
    };
  }

  return {
    getDetail,
    getHealth,
    resolveDuplicateForMaintainer,
    resolveAlreadyListedForMaintainer,
    retryForMaintainer,
    runOnce,
    signalNewSubmission,
    start,
    stop,
  };
}

module.exports = { createSubmissionLifecycleService };
