const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { openDatabase } = require("../lib/store/database");
const { createImportStore } = require("../lib/store/import-store");
const { createSubmissionStore } = require("../lib/store/submission-store");
const { createSubmissionService } = require("../lib/services/submission-service");
const { createSubmissionLifecycleService } = require("../lib/services/submission-lifecycle-service");

function createContext({ discordNotifications = null, automationEnabled = true, rateLimiter = null } = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "echo-submission-lifecycle-"));
  const db = openDatabase(path.join(tempDir, "community.sqlite"));
  const store = createSubmissionStore({ db });
  const importStore = createImportStore({ db });
  const submissionService = createSubmissionService({ store, rateLimiter });
  const prepared = new Map();
  const archiveShowIds = new Set();
  const importer = {
    getSubmissionIdentityKeys(submission = {}) {
      const payload = submission.payload || {};
      const link = payload.listenLinks?.find((row) => /rss/i.test(row.label))?.url || submission.rssOrListenLink || "";
      return link ? [{ type: "rss-url", value: link.replace(/\/$/, "") }] : [];
    },
    findSubmissionIdentityMatch(submission = {}) {
      const link = submission.rssOrListenLink || submission.payload?.listenLinks?.find((row) => /rss/i.test(row.label))?.url || "";
      return prepared.get(`archive:${link}`) || null;
    },
    hasArchiveShow(showId) {
      return archiveShowIds.has(showId);
    },
    findPotentialSubmissionMatches(submission = {}) {
      return prepared.get(`title:${submission.showTitle}`) || [];
    },
    submissionHasSupportedPreparationSource(submission = {}) {
      const urls = [submission.officialSite, submission.rssOrListenLink, ...(submission.payload?.listenLinks || []).map((row) => row.url)];
      return urls.some((url) => /^https:\/\//i.test(url || ""));
    },
    async seedSubmissionForMaintainer(submission, actor) {
      const candidate = importStore.createCandidate({
        status: "queued",
        title: submission.showTitle,
        creatorName: submission.creatorName,
        primarySourceType: "submission",
        primarySourceKey: submission.id,
        primarySourceUrl: submission.rssOrListenLink,
        provenance: { actor },
      });
      importStore.linkSubmissionToCandidate(submission.id, candidate.id);
      return { candidate, candidateIds: [candidate.id] };
    },
    retryForMaintainer(candidateId) {
      return { candidateId, queued: true };
    },
  };
  const logger = { error() {}, warn() {}, info() {} };
  const lifecycle = createSubmissionLifecycleService({
    store,
    importService: importer,
    discordNotifications,
    logger,
    config: {
      SUBMISSION_AUTOMATION_ENABLED: automationEnabled,
      SUBMISSION_PROCESSING_CONCURRENCY: 2,
      SUBMISSION_RECONCILIATION_INTERVAL_MS: 60_000,
      SUBMISSION_STALE_NOTIFICATION_DAYS: 30,
      SUBMISSION_PERSONAL_DATA_RETENTION_DAYS: 180,
      SUBMISSION_NETWORK_DATA_RETENTION_DAYS: 30,
    },
  });

  function submitShow({ title, link, idempotencyKey = "" }) {
    return submissionService.submit({
      intakeVersion: 2,
      submissionType: "show",
      showTitle: title,
      listenLinks: [{ label: "RSS Feed", url: link }],
      website: "",
    }, { idempotencyKey });
  }

  function close() {
    lifecycle.stop();
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  return { archiveShowIds, db, importer, importStore, lifecycle, prepared, store, submissionService, submitShow, close };
}

test("intake is idempotent and automatic preparation reuses a durable importer candidate", async () => {
  const context = createContext();
  try {
    const first = context.submitShow({ title: "Night Signal", link: "https://feeds.example/night.xml", idempotencyKey: "night-signal-2026" });
    const repeated = context.submitShow({ title: "Night Signal edited", link: "https://feeds.example/night.xml", idempotencyKey: "night-signal-2026" });
    assert.equal(first.submission.id, repeated.submission.id);
    assert.equal(context.db.prepare("SELECT COUNT(*) AS count FROM show_submissions").get().count, 1);
    assert.equal(context.db.prepare("SELECT COUNT(*) AS count FROM submission_lifecycle_events WHERE submission_id = ? AND event_type = 'received'").get(first.submission.id).count, 1);

    const result = await context.lifecycle.runOnce();
    const stored = context.store.getShowSubmission(first.submission.id);
    assert.equal(result.claimed, 1);
    assert.ok(stored.import_candidate_id);
    assert.equal(stored.processing_status, "processing");
    assert.equal(context.importStore.getSubmissionHandoff(first.submission.id).candidateId, stored.import_candidate_id);

    context.importStore.updateCandidate(stored.import_candidate_id, {
      status: "ready",
      preparedRecord: { id: "night-signal", title: "Night Signal" },
      readiness: { ready: true },
    });
    await context.lifecycle.runOnce();
    assert.equal(context.store.getShowSubmission(first.submission.id).processing_status, "ready-for-review");
    assert.equal(context.store.getShowSubmission(first.submission.id).resolution_status, "open");

    context.importStore.updateCandidate(stored.import_candidate_id, {
      status: "published",
      publishedShowId: "night-signal",
    });
    context.importStore.resolveSubmissionLinksForCandidate(stored.import_candidate_id, "night-signal", "another-ingestion-path");
    await context.lifecycle.runOnce();
    assert.equal(context.store.getShowSubmission(first.submission.id).resolution_status, "published");
    assert.equal(context.store.getShowSubmission(first.submission.id).import_resolved_show_id, "night-signal");
  } finally {
    context.close();
  }
});

test("idempotent intake retries return the accepted row without consuming another rate-limit slot", () => {
  let rateLimitChecks = 0;
  const context = createContext({
    rateLimiter: { check() { rateLimitChecks += 1; } },
  });
  try {
    const first = context.submitShow({ title: "Idempotent Retry", link: "https://feeds.example/idempotent.xml", idempotencyKey: "retry-key-2026" });
    const repeated = context.submitShow({ title: "Edited retry body", link: "https://feeds.example/other.xml", idempotencyKey: "retry-key-2026" });
    assert.equal(first.submission.id, repeated.submission.id);
    assert.equal(repeated.idempotent, true);
    assert.equal(rateLimitChecks, 1);
    assert.equal(context.db.prepare("SELECT COUNT(*) AS count FROM show_submissions").get().count, 1);
  } finally {
    context.close();
  }
});

test("new-submission notifications are durable and idempotent without contact or network fields", () => {
  const notifications = [];
  const context = createContext({
    discordNotifications: {
      enqueueSubmissionLifecycle(event) {
        notifications.push(event);
        return true;
      },
    },
  });
  try {
    const result = context.submitShow({ title: "Quiet Signal", link: "https://feeds.example/quiet.xml" });
    context.lifecycle.signalNewSubmission(result.submission.id);
    context.lifecycle.signalNewSubmission(result.submission.id);
    assert.equal(notifications.filter((event) => event.eventType === "new-submission").length, 1);
    assert.equal(context.db.prepare("SELECT COUNT(*) AS count FROM submission_lifecycle_events WHERE submission_id = ? AND event_type = 'new-submission'").get(result.submission.id).count, 1);
    assert.deepEqual(Object.keys(notifications[0]).sort(), ["eventId", "eventType", "submissionId", "timestamp"].sort());
  } finally {
    context.close();
  }
});

test("submission reconciliation leaves unrelated importer candidates untouched", async () => {
  const context = createContext();
  try {
    for (let index = 0; index < 119; index += 1) {
      context.importStore.createCandidate({
        id: `unrelated-candidate-${index}`,
        status: index % 2 === 0 ? "ready" : "needs-review",
        primarySourceType: "manual-seed",
        primarySourceKey: `unrelated-${index}`,
      });
    }
    const before = context.db.prepare(`
      SELECT status, COUNT(*) AS count
      FROM catalog_import_candidates
      GROUP BY status ORDER BY status
    `).all();
    const result = await context.lifecycle.runOnce();
    const after = context.db.prepare(`
      SELECT status, COUNT(*) AS count
      FROM catalog_import_candidates
      GROUP BY status ORDER BY status
    `).all();
    assert.equal(result.claimed, 0);
    assert.deepEqual(after, before);
  } finally {
    context.close();
  }
});

test("strong identity resolves automatically, while title-only matches remain actionable", async () => {
  const context = createContext();
  try {
    const listed = context.submitShow({ title: "Different Display Name", link: "https://feeds.example/listed.xml" });
    context.prepared.set("archive:https://feeds.example/listed.xml", {
      showId: "archive-show",
      showTitle: "Archive Show",
      identityType: "rss-url",
      evidence: [{ identityType: "rss-url", identityValue: "https://feeds.example/listed.xml", confidence: 1 }],
    });
    const titleMatch = context.submitShow({ title: "Same Title", link: "https://feeds.example/new.xml" });
    context.prepared.set("title:Same Title", [{ id: "archive-show", title: "Same Title", matchType: "title-and-creator-review", confidence: 0.75 }]);

    await context.lifecycle.runOnce();
    const listedRow = context.store.getShowSubmission(listed.submission.id);
    const titleRow = context.store.getShowSubmission(titleMatch.submission.id);
    assert.equal(listedRow.resolution_status, "already-listed");
    assert.equal(listedRow.import_resolved_show_id, "archive-show");
    assert.equal(titleRow.resolution_status, "open");
    assert.equal(titleRow.processing_status, "needs-investigation");
    assert.match(titleRow.processing_error, /no strong provider identity/i);
  } finally {
    context.close();
  }
});

test("provider-identity duplicates keep both records and reconcile idempotently", async () => {
  const context = createContext();
  try {
    const original = context.submitShow({ title: "Dyme: An Appalachian Horror Audio Drama", link: "https://feeds.example/dyme.xml" });
    const duplicate = context.submitShow({ title: "Dyme", link: "https://feeds.example/dyme.xml" });
    context.db.prepare("UPDATE show_submissions SET submitted_at = ? WHERE id = ?").run("2026-11-24T10:00:00.000Z", original.submission.id);
    context.db.prepare("UPDATE show_submissions SET submitted_at = ? WHERE id = ?").run("2026-11-25T10:00:00.000Z", duplicate.submission.id);
    const result = await context.lifecycle.runOnce();
    const originalRow = context.store.getShowSubmission(original.submission.id);
    const duplicateRow = context.store.getShowSubmission(duplicate.submission.id);
    assert.equal(result.claimed, 1);
    assert.equal(originalRow.resolution_status, "open");
    assert.equal(duplicateRow.resolution_status, "duplicate");
    const relation = context.store.getLifecycleDetails(duplicate.submission.id).relations.find((row) => row.relationshipType === "duplicate-of");
    assert.equal(relation.submissionId, original.submission.id);
    assert.ok(context.store.getShowSubmission(original.submission.id));
    assert.ok(context.store.getShowSubmission(duplicate.submission.id));

    const eventCount = context.db.prepare("SELECT COUNT(*) AS count FROM submission_lifecycle_events").get().count;
    await context.lifecycle.runOnce();
    assert.equal(context.db.prepare("SELECT COUNT(*) AS count FROM submission_lifecycle_events").get().count, eventCount);
  } finally {
    context.close();
  }
});

test("published candidates with missing or conflicting archive targets remain open for investigation", async () => {
  const context = createContext();
  try {
    const missing = context.submitShow({ title: "Missing Target", link: "https://feeds.example/missing-target.xml" });
    await context.lifecycle.runOnce();
    let row = context.store.getShowSubmission(missing.submission.id);
    context.importStore.updateCandidate(row.import_candidate_id, { status: "published", publishedShowId: "missing-show" });
    await context.lifecycle.runOnce();
    row = context.store.getShowSubmission(missing.submission.id);
    assert.equal(row.resolution_status, "open");
    assert.equal(row.processing_status, "needs-investigation");

    const conflict = context.submitShow({ title: "Conflicting Target", link: "https://feeds.example/conflicting-target.xml" });
    await context.lifecycle.runOnce();
    row = context.store.getShowSubmission(conflict.submission.id);
    context.importStore.updateCandidate(row.import_candidate_id, { status: "published", publishedShowId: "candidate-show" });
    context.archiveShowIds.add("candidate-show");
    context.archiveShowIds.add("identity-show");
    context.prepared.set(`archive:${row.rss_or_listen_link}`, {
      showId: "identity-show",
      showTitle: "Conflicting Target",
      evidence: [{ identityType: "rss-url", identityValue: row.rss_or_listen_link, confidence: 1 }],
    });
    await context.lifecycle.runOnce();
    row = context.store.getShowSubmission(conflict.submission.id);
    assert.equal(row.resolution_status, "open");
    assert.equal(row.processing_status, "needs-investigation");
  } finally {
    context.close();
  }
});

test("maintainers can inspect and atomically resolve exact-title submission duplicates", () => {
  const context = createContext();
  try {
    const original = context.submitShow({ title: "The Quiet Engine", link: "https://feeds.example/quiet-a.xml" });
    const possibleDuplicate = context.submitShow({ title: "The Quiet Engine", link: "https://feeds.example/quiet-b.xml" });
    const detail = context.lifecycle.getDetail(original.submission.id);
    assert.equal(detail.potentialSubmissionDuplicates.length, 1);
    assert.equal(detail.potentialSubmissionDuplicates[0].id, possibleDuplicate.submission.id);

    const resolved = context.lifecycle.resolveDuplicateForMaintainer(original.submission.id, possibleDuplicate.submission.id);
    assert.equal(resolved.resolution_status, "duplicate");
    const history = context.store.getLifecycleDetails(original.submission.id);
    assert.ok(history.relations.some((relation) => relation.relationshipType === "duplicate-of"));
    assert.ok(history.events.some((event) => event.eventType === "duplicate"));
    assert.ok(context.store.getShowSubmission(original.submission.id));
    assert.ok(context.store.getShowSubmission(possibleDuplicate.submission.id));
    const health = context.store.getQueueHealth();
    assert.equal(health.unresolved, 1);
    assert.equal(health.missingCandidateLinks, 0);
  } finally {
    context.close();
  }
});

test("notification enqueue failures do not block readiness or publication transitions", async () => {
  const context = createContext({
    discordNotifications: {
      enqueueSubmissionLifecycle() { throw new Error("outbox temporarily unavailable"); },
      getStatus() { return { enabled: true, operational: false }; },
    },
  });
  try {
    const result = context.submitShow({ title: "Quiet Engine", link: "https://feeds.example/quiet.xml" });
    await context.lifecycle.runOnce();
    const row = context.store.getShowSubmission(result.submission.id);
    context.importStore.updateCandidate(row.import_candidate_id, {
      status: "ready",
      preparedRecord: { id: "quiet-engine", title: "Quiet Engine" },
      readiness: { ready: true },
    });
    await context.lifecycle.runOnce();
    assert.equal(context.store.getShowSubmission(result.submission.id).processing_status, "ready-for-review");
    assert.equal(context.lifecycle.getHealth().notifications.enabled, true);
    assert.equal(context.lifecycle.getHealth().notifications.operational, false);
  } finally {
    context.close();
  }
});

test("missing lifecycle notifications are re-enqueued idempotently while automation is disabled", async () => {
  let failEnqueue = true;
  const enqueued = [];
  let context;
  context = createContext({
    automationEnabled: false,
    discordNotifications: {
      enqueueSubmissionLifecycle(event) {
        if (failEnqueue) throw new Error("outbox temporarily unavailable");
        enqueued.push(event);
        context.db.prepare(`
          INSERT OR IGNORE INTO discord_notification_outbox (event_id, event_type, payload_json, status, next_attempt_at)
          VALUES (?, ?, '{}', 'pending', CURRENT_TIMESTAMP)
        `).run(event.eventId.slice(0, 200), `submission-${event.eventType}`);
        return true;
      },
      getStatus() { return { enabled: true, operational: !failEnqueue }; },
    },
  });
  try {
    const result = context.submitShow({ title: "Queue Notice Recovery", link: "https://feeds.example/notice-recovery.xml" });
    context.lifecycle.signalNewSubmission(result.submission.id);
    assert.equal(context.store.countLifecycleEventsMissingNotifications(), 1);

    failEnqueue = false;
    await context.lifecycle.runOnce();
    assert.equal(enqueued.length, 1);
    assert.equal(context.store.countLifecycleEventsMissingNotifications(), 0);
    assert.equal(context.store.getShowSubmission(result.submission.id).processing_status, "received");
  } finally {
    context.close();
  }
});
