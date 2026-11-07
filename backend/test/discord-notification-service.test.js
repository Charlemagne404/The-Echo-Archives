const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const express = require("express");

const { openDatabase } = require("../lib/store/database");
const { createAnalyticsStore } = require("../lib/store/analytics-store");
const { createCommunityStore } = require("../lib/store/community-store");
const { createCommunityRouter } = require("../lib/routes/community-routes");
const { createPublishedListenerReviewRouter } = require("../lib/routes/published-listener-review-routes");
const { createSubmissionRouter } = require("../lib/routes/submission-routes");
const appConfig = require("../lib/config");
const {
  createDiscordNotificationDispatcher,
  formatContributionEmbed,
  sendDiscordIntegrationTestMessage,
} = require("../lib/services/discord-notification-service");

function createDatabase() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "echo-discord-notifications-"));
  const db = openDatabase(path.join(directory, "community.sqlite"));
  return {
    db,
    cleanup() {
      db.close();
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
}

function mockResponse(status, { headers = {}, body = null } = {}) {
  const normalizedHeaders = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => normalizedHeaders.get(String(name).toLowerCase()) ?? null },
    json: async () => body,
  };
}

async function withServer(app, run) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
}

test("missing webhook disables delivery and creates no outbox rows", async () => {
  const { db, cleanup } = createDatabase();
  try {
    let fetchCalls = 0;
    const dispatcher = createDiscordNotificationDispatcher({
      db,
      webhookUrl: "",
      fetchImpl: async () => { fetchCalls += 1; return mockResponse(204); },
    });
    assert.equal(dispatcher.getStatus().enabled, false);
    assert.equal(dispatcher.enqueueContribution({ eventId: "submission:missing", kind: "submission" }), false);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM discord_notification_outbox").get().count, 0);
    await dispatcher.dispatchDue();
    assert.equal(fetchCalls, 0);
  } finally {
    cleanup();
  }
});

test("configuration accepts an absent webhook and rejects malformed endpoints without echoing values", () => {
  assert.doesNotThrow(() => appConfig.validateConfig({ ...appConfig, ECHO_DISCORD_WEBHOOK_URL: "" }));
  const invalidValue = "https://example.invalid/api/webhooks/123/diagnostic-marker";
  assert.throws(
    () => appConfig.validateConfig({ ...appConfig, ECHO_DISCORD_WEBHOOK_URL: invalidValue }),
    (error) => error.message.includes("ECHO_DISCORD_WEBHOOK_URL") && !error.message.includes("diagnostic-marker"),
  );
});

test("contribution embeds sanitize titles, avoid private content, and disable mentions", () => {
  const payload = formatContributionEmbed({
    eventId: "submission:test-id",
    kind: "submission",
    submissionType: "listener-review",
    showId: "impact-winter",
    showTitle: "@everyone [Night Shift] <script>",
    showHref: "https://malicious.example/redirect",
    ratingStars: 4,
    reviewExcerpt: "must not be included",
    contactEmail: "private@example.invalid",
  }, { now: new Date("2026-11-06T10:00:00.000Z") });
  const json = JSON.stringify(payload);
  assert.deepEqual(payload.allowed_mentions, { parse: [] });
  assert.match(payload.embeds[0].fields[0].value, /@\u200b/);
  assert.equal(payload.embeds[0].url, "https://echoarchives.net/show?id=impact-winter");
  assert.equal(payload.embeds[0].fields.some((field) => field.name === "Review rating" && field.value === "4 / 5 stars"), true);
  assert.equal(json.includes("must not be included"), false);
  assert.equal(json.includes("private@example.invalid"), false);
  assert.equal(json.includes("malicious.example"), false);
});

test("outbox deduplicates stable event IDs and sends mention-safe embeds", async () => {
  const { db, cleanup } = createDatabase();
  try {
    const sent = [];
    const dispatcher = createDiscordNotificationDispatcher({
      db,
      webhookUrl: "https://discord.com/api/webhooks/1/test-token",
      fetchImpl: async (_url, options) => {
        sent.push(JSON.parse(options.body));
        return mockResponse(200);
      },
    });
    const contribution = {
      eventId: "rating:rating-event-one",
      kind: "rating",
      changeType: "submitted",
      showId: "impact-winter",
      showTitle: "Impact Winter",
      rating: 9,
    };
    assert.equal(dispatcher.enqueueContribution(contribution), true);
    assert.equal(dispatcher.enqueueContribution(contribution), false);
    assert.equal(await dispatcher.dispatchDue(), true);
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].allowed_mentions, { parse: [] });
    assert.equal(sent[0].embeds[0].title, "New listener rating");
    assert.equal(sent[0].embeds[0].fields.find((field) => field.name === "Rating").value, "9 / 10");
    assert.equal(dispatcher.getStatus().delivered, 1);
    assert.equal(db.prepare("SELECT payload_json FROM discord_notification_outbox").get().payload_json, "");
  } finally {
    cleanup();
  }
});

test("failed delivery retries with backoff and can then succeed", async () => {
  const { db, cleanup } = createDatabase();
  try {
    let now = new Date("2026-11-07T10:00:00.000Z");
    let calls = 0;
    const dispatcher = createDiscordNotificationDispatcher({
      db,
      webhookUrl: "https://discord.com/api/webhooks/1/test-token",
      clock: () => now,
      fetchImpl: async () => (++calls === 1 ? mockResponse(503) : mockResponse(204)),
    });
    dispatcher.enqueueContribution({ eventId: "submission:retry-me", kind: "submission", submissionType: "show", showTitle: "A New Show" });
    assert.equal(await dispatcher.dispatchDue(), false);
    assert.equal(dispatcher.getStatus().pending, 1);
    now = new Date(now.getTime() + 1_000);
    assert.equal(await dispatcher.dispatchDue(), true);
    assert.equal(calls, 2);
    assert.equal(dispatcher.getStatus().delivered, 1);
  } finally {
    cleanup();
  }
});

test("network failures retry with bounded backoff without exposing request details", async () => {
  const { db, cleanup } = createDatabase();
  try {
    let now = new Date("2026-11-07T10:00:00.000Z");
    let calls = 0;
    const logs = [];
    const dispatcher = createDiscordNotificationDispatcher({
      db,
      webhookUrl: "https://discord.com/api/webhooks/1/test-token",
      clock: () => now,
      logger: { error: (entry) => logs.push(entry), warn: (entry) => logs.push(entry) },
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) throw new Error("socket failed for https://discord.com/api/webhooks/1/test-token");
        return mockResponse(204);
      },
    });
    dispatcher.enqueueContribution({ eventId: "rating:network-retry", kind: "rating", showId: "impact-winter", showTitle: "Impact Winter", rating: 8 });
    assert.equal(await dispatcher.dispatchDue(), false);
    assert.equal(dispatcher.getStatus().pending, 1);
    assert.equal(logs.some((entry) => entry.includes("test-token")), false);
    now = new Date(now.getTime() + 1_000);
    assert.equal(await dispatcher.dispatchDue(), true);
    assert.equal(calls, 2);
    assert.equal(dispatcher.getStatus().delivered, 1);
  } finally {
    cleanup();
  }
});

test("429 responses respect Retry-After", async () => {
  const { db, cleanup } = createDatabase();
  try {
    let now = new Date("2026-11-07T10:00:00.000Z");
    let calls = 0;
    const dispatcher = createDiscordNotificationDispatcher({
      db,
      webhookUrl: "https://discord.com/api/webhooks/1/test-token",
      clock: () => now,
      fetchImpl: async () => (++calls === 1
        ? mockResponse(429, { headers: { "retry-after": "12" }, body: { retry_after: 12 } })
        : mockResponse(204)),
    });
    dispatcher.enqueueContribution({ eventId: "rating:limited", kind: "rating", showId: "impact-winter", showTitle: "Impact Winter", rating: 8 });
    assert.equal(await dispatcher.dispatchDue(), false);
    now = new Date(now.getTime() + 11_999);
    assert.equal(await dispatcher.dispatchDue(), false);
    assert.equal(calls, 1);
    now = new Date(now.getTime() + 1);
    assert.equal(await dispatcher.dispatchDue(), true);
    assert.equal(calls, 2);
  } finally {
    cleanup();
  }
});

test("permanent HTTP failures do not retain queued message content", async () => {
  const { db, cleanup } = createDatabase();
  try {
    const dispatcher = createDiscordNotificationDispatcher({
      db,
      webhookUrl: "https://discord.com/api/webhooks/1/test-token",
      fetchImpl: async () => mockResponse(404),
      logger: { error() {}, warn() {} },
    });
    dispatcher.enqueueContribution({ eventId: "submission:rejected", kind: "submission", submissionType: "show", showTitle: "Private title" });
    assert.equal(await dispatcher.dispatchDue(), false);
    const row = db.prepare("SELECT status, payload_json, last_error_code FROM discord_notification_outbox").get();
    assert.deepEqual(row, { status: "failed", payload_json: "", last_error_code: "http_404" });
    assert.equal(dispatcher.getStatus().failed, 1);
  } finally {
    cleanup();
  }
});

test("daily summary reuses first-party analytics and identifies visitor IDs as approximate", () => {
  const { db, cleanup } = createDatabase();
  try {
    const analyticsStore = createAnalyticsStore({
      db,
      secret: "test-analytics-hmac-secret-value-123456789",
      validateClientEvent: (_name, properties) => properties,
    });
    analyticsStore.setTrackingStartedAt("2026-11-01T00:00:00.000Z");
    db.prepare("INSERT INTO podcasts (id, title, has_page) VALUES (?, ?, 1)").run("impact-winter", "Impact Winter");
    const at = new Date("2026-11-06T12:00:00.000Z");
    analyticsStore.recordClientEvent({
      eventName: "Page Viewed", eventId: "page-view-12345678", occurredAt: at,
      visitorId: "visitor-123456789012", sessionId: "session-123456789012",
      pagePath: "/shows/impact-winter", source: "direct",
      properties: { page_kind: "show", show_id: "impact-winter" }, userAgent: "Mozilla/5.0",
    });
    analyticsStore.recordServerInteraction({
      eventName: "Rating Submitted", eventId: "rating-12345678", occurredAt: at,
      properties: { show_id: "impact-winter" }, userAgent: "Mozilla/5.0",
    });
    analyticsStore.recordServerInteraction({
      eventName: "Catalogue Submission", eventId: "review-12345678", occurredAt: at,
      properties: { show_id: "impact-winter", submission_type: "listener-review" }, userAgent: "Mozilla/5.0",
    });
    const summary = analyticsStore.getDiscordDailySummary("2026-11-06");
    assert.equal(summary.pageViews, 1);
    assert.equal(summary.uniqueVisitors, 1);
    assert.equal(summary.ratingsSubmitted, 1);
    assert.equal(summary.reviewsSubmitted, 1);
    assert.equal(summary.topShows[0].title, "Impact Winter");
  } finally {
    cleanup();
  }
});

test("successful submissions notify after save; failed and filtered requests stay silent", async () => {
  const notifications = [];
  let mode = "success";
  const app = express();
  app.use(express.json());
  app.use("/api/submissions", createSubmissionRouter({
    submissionService: {
      submit: () => {
        if (mode === "failed") throw Object.assign(new Error("invalid submission"), { statusCode: 400 });
        if (mode === "filtered") return { accepted: true, filtered: true };
        return {
          accepted: true,
          filtered: false,
          submission: {
            id: "submission-12345678", submission_type: "listener-review", existing_show_id: "impact-winter",
            show_title: "Impact Winter", submitted_at: "2026-11-07T10:00:00.000Z",
            payload_json: { ratingStars: 4, review: "Private review text" },
          },
        };
      },
    },
    discordNotifications: { enqueueContribution: (event) => notifications.push(event) },
    getShowHref: () => "/shows/impact-winter",
  }));
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ error: error.message }));
  await withServer(app, async (baseUrl) => {
    let response = await fetch(`${baseUrl}/api/submissions/shows`, {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}",
    });
    assert.equal(response.status, 201);
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].kind, "submission");
    assert.equal(notifications[0].submissionType, "listener-review");
    assert.equal(notifications[0].ratingStars, 4);
    assert.equal(Object.hasOwn(notifications[0], "review"), false);

    mode = "failed";
    response = await fetch(`${baseUrl}/api/submissions/shows`, {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}",
    });
    assert.equal(response.status, 400);
    assert.equal(notifications.length, 1);

    mode = "filtered";
    response = await fetch(`${baseUrl}/api/submissions/shows`, {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}",
    });
    assert.equal(response.status, 202);
    assert.equal(notifications.length, 1);
  });
});

test("ratings notify only when changed and keep the existing response shape", async () => {
  const notifications = [];
  let ratingChangeType = "submitted";
  const app = express();
  app.use(express.json());
  app.use("/api/community", createCommunityRouter({
    communityService: {
      submitRating: async () => ({
        profileId: "profile-private",
        podcast: { id: "impact-winter", title: "Impact Winter", href: "/shows/impact-winter" },
        ratingChangeType,
        ratingEventId: ratingChangeType === "unchanged" ? "" : "rating-event-12345678",
        rating: 9,
        summary: { averageRating: 9, ratingCount: 1 },
      }),
    },
    config: { COMMUNITY_RATING_WRITES_ENABLED: true, COMMUNITY_VOTER_COOKIE_NAME: "echo-voter" },
    discordNotifications: { enqueueContribution: (event) => notifications.push(event) },
  }));
  await withServer(app, async (baseUrl) => {
    let response = await fetch(`${baseUrl}/api/community/podcasts/impact-winter/rating`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ rating: 9 }),
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(Object.keys(body).sort(), ["podcast", "profileId", "ratingChangeType", "summary"].sort());
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].rating, 9);

    ratingChangeType = "unchanged";
    response = await fetch(`${baseUrl}/api/community/podcasts/impact-winter/rating`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ rating: 9 }),
    });
    assert.equal(response.status, 200);
    assert.equal(notifications.length, 1);
  });
});

test("repeating the same rating is a no-op and creates no second rating event", () => {
  const { db, cleanup } = createDatabase();
  try {
    const store = createCommunityStore({
      db,
      catalog: [{
        id: "impact-winter", title: "Impact Winter", href: "/shows/impact-winter", image: "",
        hasPage: true, finalRating: null, tags: [], summary: "", bestFor: [], similarTo: [],
      }],
    });
    const profileId = store.ensureProfile(null);
    const write = (rating) => store.upsertRating({
      podcastId: "impact-winter", profileId, rating, source: "web", abuseHash: "",
    });
    const initial = write(9);
    const retry = write(9);
    assert.equal(initial.changeType, "submitted");
    assert.ok(initial.eventId);
    assert.equal(retry.changeType, "unchanged");
    assert.equal(retry.eventId, "");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM rating_events").get().count, 1);
  } finally {
    cleanup();
  }
});

test("new helpful votes notify once and preserve the public review response", async () => {
  const notifications = [];
  let changed = true;
  const app = express();
  app.use(express.json());
  app.use("/api/reviews", createPublishedListenerReviewRouter({
    reviewService: {
      getPublishedShowId: () => "impact-winter",
      updateHelpful: async () => ({
        reviewId: "review-12345678",
        helpfulCount: changed ? 3 : 3,
        viewerMarkedHelpful: true,
        changed,
        notificationEventId: changed ? "helpful-event-12345678" : "",
      }),
    },
    config: { COMMUNITY_RATING_WRITES_ENABLED: true, COMMUNITY_VOTER_COOKIE_NAME: "echo-voter" },
    discordNotifications: { enqueueContribution: (event) => notifications.push(event) },
    getShowTitle: () => "Impact Winter",
    getShowHref: () => "/shows/impact-winter",
  }));
  await withServer(app, async (baseUrl) => {
    let response = await fetch(`${baseUrl}/api/reviews/review-12345678/helpful`, { method: "PUT" });
    let body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(Object.keys(body).sort(), ["helpfulCount", "reviewId", "viewerMarkedHelpful"].sort());
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].kind, "helpful");

    changed = false;
    response = await fetch(`${baseUrl}/api/reviews/review-12345678/helpful`, { method: "PUT" });
    body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(notifications.length, 1);
    assert.deepEqual(Object.keys(body).sort(), ["helpfulCount", "reviewId", "viewerMarkedHelpful"].sort());
  });
});

test("integration test sends one labeled, mention-safe webhook request", async () => {
  let calls = 0;
  let sentPayload;
  const result = await sendDiscordIntegrationTestMessage({
    webhookUrl: "https://discord.com/api/webhooks/1/test-token",
    fetchImpl: async (_url, options) => {
      calls += 1;
      sentPayload = JSON.parse(options.body);
      return mockResponse(200);
    },
  });
  assert.deepEqual(result, { status: 200 });
  assert.equal(calls, 1);
  assert.equal(sentPayload.content, "Echo Archives — Notifications Online");
  assert.match(sentPayload.embeds[0].description, /not real visitor activity/);
  assert.deepEqual(sentPayload.allowed_mentions, { parse: [] });
});
