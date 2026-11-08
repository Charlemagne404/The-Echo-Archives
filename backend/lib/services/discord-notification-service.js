const DISPATCH_INTERVAL_MS = 1_000;
const REQUEST_TIMEOUT_MS = 5_000;
const CLAIM_TIMEOUT_MS = 2 * 60 * 1_000;
const MAX_ATTEMPTS = 6;
const MAX_BACKOFF_MS = 15 * 60 * 1_000;
const EMBED_COLORS = Object.freeze({ contribution: 0xd66a3d, rating: 0xe58a45, summary: 0x678d69 });
const SUBMISSION_LABELS = Object.freeze({
  show: "New show submission",
  correction: "Correction or information update",
  "listener-review": "Listener review submission",
  "creator-verification": "Creator verification request",
});

function sanitizeDiscordText(value, maxLength = 240) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/@/g, "@\u200b")
    .replace(/([\\`*_{}\[\]()<>#+.!|~])/g, "\\$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function formatCount(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.max(0, Number(value) || 0));
}

function safeShowLink(showId, showHref, siteUrl) {
  const origin = new URL(siteUrl);
  const fallback = new URL(`/show?id=${encodeURIComponent(String(showId || ""))}`, origin);
  if (!showHref) return fallback.href;
  try {
    const candidate = new URL(showHref, origin);
    if (candidate.origin === origin.origin && candidate.protocol === "https:") return candidate.href;
  } catch (_error) {
    // The archive route below remains safe when catalogue href data is absent or malformed.
  }
  return fallback.href;
}

function formatContributionEmbed(contribution, { siteUrl = "https://echoarchives.net", now = new Date() } = {}) {
  const timestamp = new Date(contribution.timestamp || now).toISOString();
  const embed = {
    color: contribution.kind === "rating" ? EMBED_COLORS.rating : EMBED_COLORS.contribution,
    timestamp,
    footer: { text: "Echo Archives · Internal activity" },
    fields: [],
  };

  if (contribution.kind === "helpful") {
    embed.title = "Listener review marked helpful";
    embed.url = safeShowLink(contribution.showId, contribution.showHref, siteUrl);
    embed.fields.push(
      { name: "Show", value: sanitizeDiscordText(contribution.showTitle || contribution.showId, 240), inline: true },
      { name: "Helpful votes", value: formatCount(contribution.helpfulCount), inline: true },
    );
    return { embeds: [embed], allowed_mentions: { parse: [] } };
  }

  if (contribution.kind === "rating") {
    const changed = contribution.changeType === "changed";
    embed.title = changed ? "Listener rating changed" : "New listener rating";
    embed.url = safeShowLink(contribution.showId, contribution.showHref, siteUrl);
    embed.fields.push(
      { name: "Show", value: sanitizeDiscordText(contribution.showTitle || contribution.showId, 240), inline: true },
      { name: "Rating", value: `${formatCount(contribution.rating)} / 10`, inline: true },
    );
    return { embeds: [embed], allowed_mentions: { parse: [] } };
  }

  const submissionType = String(contribution.submissionType || "");
  embed.title = SUBMISSION_LABELS[submissionType] || "New archive submission";
  embed.url = contribution.showId
    ? safeShowLink(contribution.showId, contribution.showHref, siteUrl)
    : new URL("/maintainer/submissions.html", siteUrl).href;
  embed.description = submissionType === "listener-review"
    ? "A listener review was submitted and is awaiting moderation."
    : "A visitor contribution was saved to the moderation queue.";
  embed.fields.push(
    { name: "Show", value: sanitizeDiscordText(contribution.showTitle || "New show", 240), inline: true },
    { name: "Submission type", value: sanitizeDiscordText(SUBMISSION_LABELS[submissionType] || submissionType || "Submission", 120), inline: true },
  );

  const correctionType = sanitizeDiscordText(contribution.correctionType, 120);
  if (submissionType === "correction" && correctionType) {
    embed.fields.push({ name: "Update type", value: correctionType, inline: true });
  }
  if (submissionType === "listener-review" && Number.isInteger(Number(contribution.ratingStars))) {
    embed.fields.push({ name: "Review rating", value: `${formatCount(contribution.ratingStars)} / 5 stars`, inline: true });
  }
  return { embeds: [embed], allowed_mentions: { parse: [] } };
}

function formatDailySummaryEmbed(summary, { now = new Date() } = {}) {
  if (!summary || summary.available === false) return null;
  const embed = {
    title: `Echo Archives — Daily activity · ${sanitizeDiscordText(summary.day, 10)}`,
    color: EMBED_COLORS.summary,
    timestamp: new Date(now).toISOString(),
    description: summary.coverageStart && summary.coverageStart > `${summary.day}T00:00:00.000Z`
      ? `Partial coverage from ${sanitizeDiscordText(summary.coverageStart, 32)} · existing first-party anonymous analytics`
      : "Previous UTC day · existing first-party anonymous analytics",
    footer: { text: "Echo Archives · Internal activity" },
    fields: [
      { name: "Tracked page views", value: formatCount(summary.pageViews), inline: true },
      { name: "Anonymous visitor IDs", value: `${formatCount(summary.uniqueVisitors)} (approx.)`, inline: true },
      { name: "Sessions", value: formatCount(summary.sessions), inline: true },
      { name: "Recorded interactions", value: formatCount(summary.interactions), inline: true },
      { name: "Searches", value: formatCount(summary.searches), inline: true },
      { name: "Filter changes", value: formatCount(summary.filterChanges), inline: true },
      { name: "Show opens", value: formatCount(summary.showOpens), inline: true },
      { name: "Collection opens", value: formatCount(summary.collectionOpens), inline: true },
      { name: "Listening clicks", value: formatCount(summary.listenClicks), inline: true },
      { name: "Ratings received", value: formatCount((summary.ratingsSubmitted || 0) + (summary.ratingsChanged || 0)), inline: true },
      { name: "Ratings removed", value: formatCount(summary.ratingsRemoved), inline: true },
      { name: "Reviews submitted", value: formatCount(summary.reviewsSubmitted), inline: true },
      { name: "New shows", value: formatCount(summary.newShowSubmissions), inline: true },
      { name: "Corrections / updates", value: formatCount(summary.correctionSubmissions), inline: true },
      { name: "Creator requests", value: formatCount(summary.creatorVerificationSubmissions), inline: true },
      { name: "Helpful votes", value: formatCount(summary.helpfulVotes), inline: true },
    ],
  };

  const topShows = (summary.topShows || []).slice(0, 3).map((show, index) =>
    `${index + 1}. ${sanitizeDiscordText(show.title, 120)} · ${formatCount(show.pageViews)} views`);
  if (topShows.length) embed.fields.push({ name: "Most viewed shows", value: topShows.join("\n"), inline: false });
  const topPages = (summary.topPages || []).slice(0, 3).map((page, index) =>
    `${index + 1}. ${sanitizeDiscordText(page.path, 120)} · ${formatCount(page.pageViews)} views`);
  if (topPages.length) embed.fields.push({ name: "Most viewed pages", value: topPages.join("\n"), inline: false });
  const topCollections = (summary.topCollections || []).slice(0, 3).map((collection, index) =>
    `${index + 1}. ${sanitizeDiscordText(collection.title, 120)} · ${formatCount(collection.opens)} opens`);
  if (topCollections.length) embed.fields.push({ name: "Most opened collections", value: topCollections.join("\n"), inline: false });
  return { embeds: [embed], allowed_mentions: { parse: [] } };
}

function utcDay(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function previousUtcDay(date) {
  const day = new Date(date);
  day.setUTCHours(0, 0, 0, 0);
  day.setUTCDate(day.getUTCDate() - 1);
  return utcDay(day);
}

async function sendDiscordIntegrationTestMessage({ webhookUrl = "", fetchImpl = globalThis.fetch } = {}) {
  if (!webhookUrl || typeof fetchImpl !== "function") {
    throw new Error("Discord integration test is not configured.");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  timeout.unref?.();
  try {
    const response = await fetchImpl(`${webhookUrl}?wait=true`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: "Echo Archives — Notifications Online",
        embeds: [{
          title: "Discord integration test",
          description: "The Discord activity notification system has been configured successfully.\n\nThis is an integration test, not real visitor activity.",
          color: EMBED_COLORS.contribution,
          timestamp: new Date().toISOString(),
          footer: { text: "Echo Archives · Internal activity" },
        }],
        allowed_mentions: { parse: [] },
      }),
      signal: controller.signal,
      redirect: "error",
    });
    if (!response.ok) throw new Error(`Discord integration test returned HTTP ${response.status}.`);
    return { status: response.status };
  } finally {
    clearTimeout(timeout);
  }
}

function createDiscordNotificationDispatcher({
  db,
  webhookUrl = "",
  siteUrl = "https://echoarchives.net",
  analyticsStore = null,
  fetchImpl = globalThis.fetch,
  clock = () => new Date(),
  logger = console,
  requestTimeoutMs = REQUEST_TIMEOUT_MS,
}) {
  const enabled = Boolean(String(webhookUrl || "").trim());
  const insertNotification = db.prepare(`
    INSERT OR IGNORE INTO discord_notification_outbox (event_id, event_type, payload_json, status, next_attempt_at)
    VALUES (@eventId, @eventType, @payloadJson, 'pending', @now)
  `);
  const nextDueNotification = db.prepare(`
    SELECT event_id, event_type, payload_json, attempts
    FROM discord_notification_outbox
    WHERE status IN ('pending', 'retry') AND next_attempt_at <= @now
    ORDER BY created_at ASC, event_id ASC
    LIMIT 1
  `);
  const claimNotification = db.prepare(`
    UPDATE discord_notification_outbox
    SET status = 'delivering', attempts = attempts + 1, claimed_at = @now
    WHERE event_id = @eventId AND status IN ('pending', 'retry')
  `);
  const resetExpiredClaims = db.prepare(`
    UPDATE discord_notification_outbox
    SET status = 'retry', claimed_at = NULL, next_attempt_at = @now,
        last_error_code = 'stale_delivery_claim'
    WHERE status = 'delivering' AND claimed_at <= @cutoff
  `);
  const markDelivered = db.prepare(`
    UPDATE discord_notification_outbox
    SET status = 'delivered', payload_json = '', delivered_at = @now, claimed_at = NULL, last_error_code = ''
    WHERE event_id = @eventId
  `);
  const markRetry = db.prepare(`
    UPDATE discord_notification_outbox
    SET status = 'retry', next_attempt_at = @nextAttemptAt, claimed_at = NULL,
        last_error_code = @errorCode
    WHERE event_id = @eventId
  `);
  const markFailed = db.prepare(`
    UPDATE discord_notification_outbox
    SET status = 'failed', payload_json = '', claimed_at = NULL, last_error_code = @errorCode
    WHERE event_id = @eventId
  `);
  const countByStatus = db.prepare(`
    SELECT status, COUNT(*) AS count FROM discord_notification_outbox GROUP BY status
  `);
  const latestDelivery = db.prepare(`
    SELECT delivered_at FROM discord_notification_outbox
    WHERE status = 'delivered' ORDER BY delivered_at DESC LIMIT 1
  `);
  const nowSql = () => new Date(clock()).toISOString();
  let dispatchTimer = null;
  let summaryTimer = null;
  let dispatching = false;
  let nextAllowedAt = 0;

  function enqueue(eventId, eventType, payload) {
    if (!enabled || !eventId || !payload) return false;
    const result = insertNotification.run({
      eventId: String(eventId).slice(0, 200),
      eventType: String(eventType || "activity").slice(0, 80),
      payloadJson: JSON.stringify(payload),
      now: nowSql(),
    });
    return result.changes > 0;
  }

  function enqueueContribution(contribution) {
    if (!contribution?.eventId || !contribution?.kind) return false;
    try {
      const payload = formatContributionEmbed(contribution, { siteUrl, now: clock() });
      return enqueue(contribution.eventId, contribution.kind, payload);
    } catch (_error) {
      logger.error(JSON.stringify({ level: "error", event: "discord_outbox_enqueue_failed" }));
      return false;
    }
  }

  function enqueueDailySummary(day) {
    if (!enabled || !analyticsStore?.enabled || typeof analyticsStore.getDiscordDailySummary !== "function") return false;
    try {
      const summary = analyticsStore.getDiscordDailySummary(day);
      const payload = formatDailySummaryEmbed(summary, { now: clock() });
      return payload ? enqueue(`daily-summary:${day}`, "daily-summary", payload) : false;
    } catch (_error) {
      logger.warn(JSON.stringify({ level: "warn", event: "discord_daily_summary_failed" }));
      return false;
    }
  }

  function retryAfterMs(response, body) {
    const header = Number.parseFloat(response.headers?.get?.("retry-after") || "");
    const bodyDelay = Number(body?.retry_after);
    const delaySeconds = Number.isFinite(bodyDelay) ? bodyDelay : header;
    return Number.isFinite(delaySeconds) && delaySeconds > 0 ? Math.ceil(delaySeconds * 1000) : 1_000;
  }

  async function readRateLimitBody(response) {
    try {
      return await response.json();
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      return null;
    }
  }

  function queueRetry(row, errorCode, delayMs = null) {
    if (row.attempts >= MAX_ATTEMPTS) {
      markFailed.run({ eventId: row.event_id, errorCode: `${errorCode}_max_attempts` });
      logger.warn(JSON.stringify({ level: "warn", event: "discord_delivery_abandoned", errorCode, attempts: row.attempts }));
      return;
    }
    const backoff = Math.min(MAX_BACKOFF_MS, 1_000 * (2 ** Math.max(0, row.attempts - 1)));
    const retryMs = delayMs === null ? backoff : Math.max(1_000, delayMs);
    markRetry.run({
      eventId: row.event_id,
      nextAttemptAt: new Date(clock().getTime() + retryMs).toISOString(),
      errorCode,
    });
    logger.warn(JSON.stringify({ level: "warn", event: "discord_delivery_retry_scheduled", errorCode, attempt: row.attempts }));
  }

  function claimNext() {
    const now = new Date(clock());
    const stamp = now.toISOString();
    const claimed = db.transaction(() => {
      resetExpiredClaims.run({
        now: stamp,
        cutoff: new Date(now.getTime() - CLAIM_TIMEOUT_MS).toISOString(),
      });
      const candidate = nextDueNotification.get({ now: stamp });
      if (!candidate) return null;
      const result = claimNotification.run({ eventId: candidate.event_id, now: stamp });
      if (!result.changes) return null;
      return { ...candidate, attempts: Number(candidate.attempts || 0) + 1 };
    });
    return claimed();
  }

  async function dispatchDue() {
    if (!enabled || dispatching || typeof fetchImpl !== "function" || clock().getTime() < nextAllowedAt) return false;
    dispatching = true;
    let row;
    let response;
    let rateLimitDelayMs = null;
    let requestTimeout = null;
    try {
      row = claimNext();
      if (!row) return false;
      let payload;
      try {
        payload = JSON.parse(row.payload_json);
      } catch (_error) {
        markFailed.run({ eventId: row.event_id, errorCode: "invalid_outbox_payload" });
        return false;
      }

      const controller = new AbortController();
      requestTimeout = setTimeout(() => controller.abort(), requestTimeoutMs);
      requestTimeout.unref?.();
      try {
        response = await fetchImpl(`${webhookUrl}?wait=true`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
          redirect: "error",
        });
      } catch (error) {
        const errorCode = error?.name === "AbortError" ? "network_timeout" : "network_error";
        queueRetry(row, errorCode);
        return false;
      }

      if (response.ok) {
        markDelivered.run({ eventId: row.event_id, now: nowSql() });
        const remaining = Number(response.headers?.get?.("x-ratelimit-remaining"));
        const resetAfter = Number.parseFloat(response.headers?.get?.("x-ratelimit-reset-after") || "");
        const serverWait = remaining === 0 && Number.isFinite(resetAfter) ? Math.ceil(resetAfter * 1000) : 0;
        nextAllowedAt = clock().getTime() + Math.max(DISPATCH_INTERVAL_MS, serverWait);
        return true;
      }

      if (response.status === 429) {
        rateLimitDelayMs = retryAfterMs(response, null);
        nextAllowedAt = Math.max(nextAllowedAt, clock().getTime() + rateLimitDelayMs);
        const body = await readRateLimitBody(response);
        rateLimitDelayMs = retryAfterMs(response, body);
        nextAllowedAt = Math.max(nextAllowedAt, clock().getTime() + rateLimitDelayMs);
        queueRetry(row, "http_429", rateLimitDelayMs);
      } else if (response.status >= 500) {
        queueRetry(row, `http_${response.status}`);
      } else {
        markFailed.run({ eventId: row.event_id, errorCode: `http_${response.status}` });
        logger.error(JSON.stringify({ level: "error", event: "discord_delivery_rejected", status: response.status }));
      }
      return false;
    } catch (error) {
      if (row) {
        const rateLimitedTimeout = response?.status === 429 && error?.name === "AbortError";
        queueRetry(row, rateLimitedTimeout ? "http_429" : "outbox_error", rateLimitedTimeout ? rateLimitDelayMs : null);
      }
      else logger.error(JSON.stringify({ level: "error", event: "discord_outbox_error" }));
      return false;
    } finally {
      if (requestTimeout) clearTimeout(requestTimeout);
      dispatching = false;
    }
  }

  function scheduleNextDailySummary() {
    if (!enabled || !analyticsStore?.enabled) return;
    const now = new Date(clock());
    const target = new Date(now);
    target.setUTCHours(0, 5, 0, 0);
    if (target <= now) target.setUTCDate(target.getUTCDate() + 1);
    summaryTimer = setTimeout(() => {
      enqueueDailySummary(previousUtcDay(clock()));
      scheduleNextDailySummary();
    }, Math.max(1_000, target.getTime() - now.getTime()));
    summaryTimer.unref?.();
  }

  function start() {
    if (!enabled || dispatchTimer) return;
    dispatchTimer = setInterval(() => { void dispatchDue(); }, DISPATCH_INTERVAL_MS);
    dispatchTimer.unref?.();
    if (analyticsStore?.enabled) {
      enqueueDailySummary(previousUtcDay(clock()));
      scheduleNextDailySummary();
    }
    void dispatchDue();
  }

  function stop() {
    if (dispatchTimer) clearInterval(dispatchTimer);
    if (summaryTimer) clearTimeout(summaryTimer);
    dispatchTimer = null;
    summaryTimer = null;
  }

  function getStatus() {
    try {
      const counts = Object.fromEntries(countByStatus.all().map((row) => [row.status, Number(row.count || 0)]));
      return {
        enabled,
        running: Boolean(dispatchTimer),
        pending: (counts.pending || 0) + (counts.retry || 0) + (counts.delivering || 0),
        failed: counts.failed || 0,
        delivered: counts.delivered || 0,
        lastDeliveredAt: latestDelivery.get()?.delivered_at || null,
        summariesEnabled: Boolean(enabled && analyticsStore?.enabled && analyticsStore?.getDiscordDailySummary),
      };
    } catch (_error) {
      return { enabled, running: Boolean(dispatchTimer), operational: false };
    }
  }

  return {
    enqueueContribution,
    enqueueDailySummary,
    dispatchDue,
    formatDailySummaryEmbed,
    getStatus,
    start,
    stop,
  };
}

module.exports = {
  createDiscordNotificationDispatcher,
  formatContributionEmbed,
  formatDailySummaryEmbed,
  sanitizeDiscordText,
  sendDiscordIntegrationTestMessage,
};
