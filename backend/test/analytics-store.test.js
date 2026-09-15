const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { openDatabase } = require("../lib/store/database");
const {
  createAnalyticsStore,
  isLikelyBot,
} = require("../lib/store/analytics-store");

let validateDiscoveryProps;

test.before(async () => {
  ({ validateDiscoveryProps } = await import("../../shared/app/discovery-analytics.js"));
});

function createContext({ collections = [] } = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "echo-archives-analytics-"));
  const db = openDatabase(path.join(tempDir, "analytics.sqlite"));
  const store = createAnalyticsStore({
    db,
    secret: "test-analytics-hmac-secret-value-123456789",
    validateClientEvent: validateDiscoveryProps,
    retentionDays: 400,
    collections,
  });
  store.setTrackingStartedAt(new Date("2026-08-01T00:00:00.000Z"));
  db.prepare("INSERT INTO podcasts (id, title, has_page) VALUES (?, ?, 1)").run("impact-winter", "Impact Winter");
  db.prepare("INSERT INTO community_profiles (id) VALUES (?)").run("profile-analytics");
  db.prepare(`
    INSERT INTO rating_submissions (id, podcast_id, profile_id, rating, status)
    VALUES (?, ?, ?, ?, 'active')
  `).run("rating-analytics", "impact-winter", "profile-analytics", 9);
  return { tempDir, db, store };
}

function cleanup(context) {
  context.db.close();
  fs.rmSync(context.tempDir, { recursive: true, force: true });
}

function pageEvent(overrides = {}) {
  return {
    eventName: "Page Viewed",
    eventId: `page-${Math.random().toString(36).slice(2)}-123456`,
    visitorId: "visitor-analytics-one-123456",
    sessionId: "session-analytics-one-123456",
    pagePath: "/shows/impact-winter?query=private",
    source: "www.example.com/private/path",
    properties: { page_kind: "show", show_id: "impact-winter" },
    userAgent: "Mozilla/5.0",
    occurredAt: new Date("2026-09-10T12:00:00.000Z"),
    ...overrides,
  };
}

test("analytics store hashes identities, validates events, deduplicates reloads, and reports tracked usage", () => {
  const context = createContext();

  try {
    assert.equal(context.store.recordClientEvent(pageEvent()).recorded, true);
    assert.equal(context.store.recordClientEvent(pageEvent({
      eventId: "page-duplicate-123456789",
      occurredAt: new Date("2026-09-10T12:00:15.000Z"),
    })).reason, "duplicate");
    assert.equal(context.store.recordClientEvent(pageEvent({
      eventName: "Show Opened",
      eventId: "show-opened-123456789",
      properties: {
        show_id: "impact-winter",
        discovery_surface: "internal_link",
        browse_state: "default",
        result_type: "show_card",
        recommendation_source: "none",
        result_position_bucket: "1",
        content_profile: "full_review",
      },
    })).recorded, true);
    assert.equal(context.store.recordServerInteraction({
      eventName: "Rating Submitted",
      eventId: "rating-saved-123456789",
      visitorId: "visitor-analytics-one-123456",
      sessionId: "session-analytics-one-123456",
      pagePath: "/shows/impact-winter",
      properties: { show_id: "impact-winter" },
      userAgent: "Mozilla/5.0",
      occurredAt: new Date("2026-09-10T12:05:00.000Z"),
    }).recorded, true);
    assert.equal(context.store.recordServerInteraction({
      eventName: "Helpful Vote",
      eventId: "helpful-vote-123456789",
      visitorId: "visitor-analytics-one-123456",
      sessionId: "session-analytics-one-123456",
      pagePath: "/shows/impact-winter",
      properties: { show_id: "impact-winter" },
      userAgent: "Mozilla/5.0",
      occurredAt: new Date("2026-09-10T12:06:00.000Z"),
    }).recorded, true);
    assert.equal(context.store.recordClientEvent(pageEvent({
      eventId: "page-bot-123456789",
      userAgent: "UptimeRobot/2.0",
    })).recorded, false);

    const invalid = context.store.recordClientEvent(pageEvent({
      eventName: "Search Used",
      eventId: "invalid-search-123456789",
      properties: {
        query: "private search text",
        discovery_surface: "home_archive",
        query_kind: "text",
        structured_clause_group: "none",
        result_count_bucket: "1",
        active_filter_count_bucket: "0",
        recovery_context: "none",
      },
    }));
    assert.equal(invalid.recorded, false);
    assert.equal(invalid.reason, "invalid_properties");
    assert.equal(isLikelyBot("Mozilla/5.0"), false);
    assert.equal(isLikelyBot("Googlebot/2.1"), true);

    context.store.recordClientEvent(pageEvent({
      eventId: "page-previous-123456789",
      visitorId: "visitor-analytics-old-123456",
      sessionId: "session-analytics-old-123456",
      occurredAt: new Date("2026-09-04T12:00:00.000Z"),
      pagePath: "/collections",
      properties: { page_kind: "collections" },
    }));

    const dashboard = context.store.getDashboard({ range: "7d", now: new Date("2026-09-15T00:00:00.000Z") });
    assert.equal(dashboard.metrics.pageViews.value, 1);
    assert.equal(dashboard.metrics.uniqueVisitors.value, 1);
    assert.equal(dashboard.metrics.interactions.value, 3);
    assert.equal(dashboard.metrics.ratingsSubmitted.value, 1);
    assert.equal(dashboard.metrics.pageViews.change.available, true);
    assert.equal(dashboard.topShows[0].title, "Impact Winter");
    assert.equal(dashboard.topShows[0].pageViews, 1);
    assert.equal(dashboard.recordTotals.activeRatings, 1);
    assert.equal(dashboard.coverage.trackingStartedAt, "2026-08-01T00:00:00.000Z");

    const storedEvents = context.db.prepare("SELECT * FROM analytics_events ORDER BY id").all();
    assert.equal(storedEvents.length, 5);
    assert.doesNotMatch(JSON.stringify(storedEvents), /visitor-analytics|session-analytics|UptimeRobot|private search text/i);
    assert.ok(storedEvents.every((event) => event.visitor_key === "" || /^[a-f0-9]{32}$/.test(event.visitor_key)));
  } finally {
    cleanup(context);
  }
});

test("analytics retention removes old events and visitor keys without touching archive records", () => {
  const context = createContext();

  try {
    context.store.recordClientEvent(pageEvent({
      eventId: "page-old-123456789",
      occurredAt: new Date("2025-01-01T00:00:00.000Z"),
    }));
    const result = context.store.purgeExpiredEvents({ now: new Date("2026-09-15T00:00:00.000Z") });
    assert.equal(result.eventsDeleted, 1);
    assert.equal(context.db.prepare("SELECT COUNT(*) AS count FROM analytics_events").get().count, 0);
    assert.equal(context.db.prepare("SELECT COUNT(*) AS count FROM rating_submissions").get().count, 1);
  } finally {
    cleanup(context);
  }
});

test("analytics dashboard reports discovery pathways, collection context, and conversion stages", () => {
  const context = createContext({
    collections: [{ id: "best-for-long-walks", title: "Best for long walks" }],
  });

  try {
    const base = {
      visitorId: "visitor-analytics-path-123456",
      sessionId: "session-analytics-path-123456",
      pagePath: "/collections/best-for-long-walks",
      userAgent: "Mozilla/5.0",
      occurredAt: new Date("2026-09-10T13:00:00.000Z"),
    };
    assert.equal(context.store.recordClientEvent({
      ...base,
      eventName: "Page Viewed",
      eventId: "path-page-123456789",
      properties: { page_kind: "collection", collection_id: "best-for-long-walks" },
    }).recorded, true);
    assert.equal(context.store.recordClientEvent({
      ...base,
      eventName: "Collection Opened",
      eventId: "path-collection-123456789",
      properties: {
        collection_id: "best-for-long-walks",
        collection_kind: "curated",
        discovery_surface: "collections_directory",
      },
    }).recorded, true);
    assert.equal(context.store.recordClientEvent({
      ...base,
      eventName: "Show Opened",
      eventId: "path-show-123456789",
      properties: {
        show_id: "impact-winter",
        collection_id: "best-for-long-walks",
        discovery_surface: "collection_page_grid",
        browse_state: "default",
        result_type: "collection_member",
        recommendation_source: "collection_membership",
        result_position_bucket: "1",
        content_profile: "full_review",
      },
    }).recorded, true);
    assert.equal(context.store.recordClientEvent({
      ...base,
      eventName: "Listen Link Opened",
      eventId: "path-listen-123456789",
      pagePath: "/shows/impact-winter",
      properties: {
        show_id: "impact-winter",
        provider: "spotify",
        link_role: "primary",
        discovery_surface: "show_page_facts",
        content_profile: "full_review",
      },
    }).recorded, true);
    assert.equal(context.store.recordClientEvent({
      ...base,
      eventName: "Search Used",
      eventId: "path-search-123456789",
      pagePath: "/",
      properties: {
        discovery_surface: "home_archive",
        query_kind: "text",
        structured_clause_group: "none",
        result_count_bucket: "5-9",
        active_filter_count_bucket: "0",
        recovery_context: "none",
      },
    }).recorded, true);

    const dashboard = context.store.getDashboard({
      range: "7d",
      now: new Date("2026-09-15T00:00:00.000Z"),
    });
    assert.equal(dashboard.metrics.collectionOpens.value, 1);
    assert.equal(dashboard.metrics.showOpens.value, 1);
    assert.equal(dashboard.metrics.listenClicks.value, 1);
    assert.equal(dashboard.metrics.searches.value, 1);
    assert.equal(dashboard.topCollections[0].title, "Best for long walks");
    assert.equal(dashboard.topCollections[0].showOpens, 1);
    assert.equal(dashboard.funnel.collectionSessions, 1);
    assert.equal(dashboard.funnel.showOpenSessions, 1);
    assert.equal(dashboard.funnel.listenSessions, 1);
    assert.ok(dashboard.discoverySurfaces.some((item) => item.surface === "collection_page_grid"));
  } finally {
    cleanup(context);
  }
});
