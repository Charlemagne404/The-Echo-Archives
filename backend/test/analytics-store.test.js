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

test("popularity rollup migration pages through retained events without changing cooldown results", () => {
  const context = createContext();
  const base = {
    visitorId: "visitor-migration-one-123456",
    sessionId: "session-migration-one-123456",
    pagePath: "/",
    userAgent: "Mozilla/5.0",
    occurredAt: new Date("2026-09-10T12:00:00.000Z"),
    eventName: "Show Opened",
  };
  const properties = {
    show_id: "impact-winter",
    discovery_surface: "home_archive_grid",
    browse_state: "default",
    result_type: "show_card",
    recommendation_source: "none",
    result_position_bucket: "1",
    content_profile: "full_review",
  };

  try {
    for (let index = 0; index < 505; index += 1) {
      assert.equal(context.store.recordClientEvent({
        ...base,
        eventId: `migration-open-${index}-123456`,
        properties,
      }).recorded, true);
    }
    context.db.prepare("UPDATE analytics_meta SET value = '2' WHERE key = 'popularity_daily_rollup_version'").run();
    context.db.prepare("UPDATE analytics_meta SET value = '0' WHERE key = 'popularity_raw_daily_rollup_version'").run();

    const migratedStore = createAnalyticsStore({
      db: context.db,
      secret: "test-analytics-hmac-secret-value-123456789",
      validateClientEvent: validateDiscoveryProps,
      retentionDays: 400,
    });
    const snapshot = migratedStore.getPopularitySignals({ now: new Date("2026-09-10T23:00:00.000Z") })["impact-winter"];
    assert.equal(snapshot.periods.lifetime["show_open:browse:1"], 1);
    assert.equal(snapshot.rawPeriods.lifetime["show_open:browse:1"], 505);
  } finally {
    cleanup(context);
  }
});

test("popularity rollups preserve raw actions while capping ranking contributions and survive raw-event expiry", () => {
  const context = createContext();
  const base = {
    visitorId: "visitor-popularity-one-123456",
    sessionId: "session-popularity-one-123456",
    pagePath: "/",
    userAgent: "Mozilla/5.0",
    occurredAt: new Date("2026-09-10T12:00:00.000Z"),
  };

  try {
    const impression = {
      ...base,
      eventName: "Show Card Impression",
      eventId: "impression-popularity-123456",
      properties: {
        show_id: "impact-winter",
        discovery_surface: "home_archive_grid",
        browse_state: "default",
        result_position_bucket: "1",
      },
    };
    assert.equal(context.store.recordClientEvent(impression).recorded, true);
    const repeatedImpression = context.store.recordClientEvent({ ...impression, eventId: "impression-again-123456", properties: {
      ...impression.properties,
      result_position_bucket: "2-4",
    } });
    assert.equal(repeatedImpression.recorded, true);
    assert.equal(repeatedImpression.popularityCounted, false);
    assert.equal(context.store.recordClientEvent({
      ...base,
      eventName: "Show Opened",
      eventId: "open-popularity-123456",
      properties: {
        show_id: "impact-winter",
        discovery_surface: "home_archive_grid",
        browse_state: "default",
        result_type: "show_card",
        recommendation_source: "none",
        result_position_bucket: "1",
        content_profile: "full_review",
      },
    }).recorded, true);
    const repeatedOpen = context.store.recordClientEvent({
      ...base,
      eventName: "Show Opened",
      eventId: "open-popularity-repeated-123456",
      properties: {
        show_id: "impact-winter",
        discovery_surface: "home_archive_grid",
        browse_state: "default",
        result_type: "show_card",
        recommendation_source: "none",
        result_position_bucket: "1",
        content_profile: "full_review",
      },
    });
    assert.equal(repeatedOpen.recorded, true);
    assert.equal(repeatedOpen.popularityCounted, false);
    assert.equal(context.store.recordClientEvent({
      ...base,
      eventName: "Show Card Impression",
      eventId: "editorial-rail-impression-123456",
      properties: {
        show_id: "impact-winter",
        discovery_surface: "home_popular_rail",
        result_position_bucket: "1",
      },
    }).recorded, true);
    assert.equal(context.store.recordClientEvent({
      ...base,
      eventName: "Show Opened",
      eventId: "editorial-rail-open-123456",
      properties: {
        show_id: "impact-winter",
        discovery_surface: "home_popular_rail",
        browse_state: "default",
        result_type: "show_card",
        recommendation_source: "none",
        result_position_bucket: "1",
        content_profile: "full_review",
      },
    }).recorded, true);
    assert.equal(context.store.recordClientEvent({
      ...base,
      eventName: "Show Saved",
      eventId: "save-popularity-123456",
      properties: { show_id: "impact-winter" },
    }).recorded, true);
    assert.equal(context.store.recordClientEvent({
      ...base,
      eventName: "Library State Changed",
      eventId: "listening-popularity-123456",
      properties: { show_id: "impact-winter", library_state: "listening" },
      visitorId: "visitor-popularity-two-123456",
      sessionId: "session-popularity-two-123456",
    }).recorded, true);
    assert.equal(context.store.recordClientEvent({
      ...base,
      eventName: "Library State Changed",
      eventId: "hidden-popularity-123456",
      properties: { show_id: "impact-winter", library_state: "hidden" },
    }).reason, "invalid_properties");
    assert.equal(context.store.recordServerInteraction({
      ...base,
      eventName: "Rating Changed",
      eventId: "rating-change-popularity-123456",
      properties: { show_id: "impact-winter" },
    }).recorded, true);
    assert.equal(context.store.recordClientEvent(pageEvent({
      eventId: "page-old-popularity-123456",
      occurredAt: new Date("2024-01-01T12:00:00.000Z"),
    })).recorded, true);
    assert.equal(context.store.recordClientEvent(pageEvent({
      eventId: "page-current-popularity-123456",
      occurredAt: base.occurredAt,
    })).recorded, true);

    const initial = context.store.getPopularitySignals({ now: new Date("2026-09-15T00:00:00.000Z") })["impact-winter"];
    assert.equal(initial.periods.lifetime["impression:browse:1"], 1);
    assert.equal(initial.periods.lifetime["show_open:browse:1"], 1);
    assert.equal(initial.periods.days90["impression:browse:1"], 1);
    assert.equal(initial.periods.days28["show_open:browse:1"], 1);
    assert.equal(initial.periods.lifetime.show_page_view, 2);
    assert.equal(initial.periods.lifetime.show_saved, 1);
    assert.equal(initial.periods.lifetime.library_listening, 1);
    assert.equal(initial.periods.lifetime.rating_changed, 1);
    assert.equal(initial.rawPeriods.lifetime["impression:browse:1"], 1);
    assert.equal(initial.rawPeriods.lifetime["impression:browse:2-4"], 1);
    assert.equal(initial.rawPeriods.lifetime["show_open:browse:1"], 2);
    assert.equal(initial.community.ratingCount, 1);

    context.db.prepare(`
      INSERT INTO analytics_events (event_id, event_name, occurred_at, show_id, properties_json)
      VALUES ('malformed-popularity-123456', 'Page Viewed', '2026-09-11T12:00:00.000Z', 'impact-winter', '{broken-json')
    `).run();
    context.db.prepare("DELETE FROM popularity_event_daily").run();
    context.db.prepare("DELETE FROM analytics_meta WHERE key = 'popularity_daily_rollup_version'").run();
    const migratedStore = createAnalyticsStore({
      db: context.db,
      secret: "test-analytics-hmac-secret-value-123456789",
      validateClientEvent: validateDiscoveryProps,
      retentionDays: 400,
    });
    const migrated = migratedStore.getPopularitySignals({ now: new Date("2026-09-15T00:00:00.000Z") })["impact-winter"];
    assert.equal(migrated.periods.lifetime["impression:browse:1"], 1);
    assert.equal(migrated.periods.lifetime.show_page_view, 2);

    context.store.purgeExpiredEvents({ now: new Date("2026-09-15T00:00:00.000Z") });
    const afterExpiry = context.store.getPopularitySignals({ now: new Date("2026-09-15T00:00:00.000Z") })["impact-winter"];
    assert.equal(afterExpiry.periods.lifetime.show_page_view, 2);
    assert.equal(context.db.prepare("SELECT COUNT(*) AS count FROM analytics_events WHERE event_id = 'page-old-popularity-123456'").get().count, 0);
  } finally {
    cleanup(context);
  }
});

test("repeated activity has sharp per-identity caps while broad and later engagement remains countable", () => {
  const context = createContext();
  const start = new Date("2026-09-10T12:00:00.000Z");
  const visitorId = "visitor-repeat-spam-123456";
  const sessionId = "session-repeat-spam-123456";
  const base = {
    visitorId,
    sessionId,
    pagePath: "/shows/impact-winter",
    userAgent: "Mozilla/5.0",
  };
  const showOpenProperties = {
    show_id: "impact-winter",
    discovery_surface: "home_archive_grid",
    browse_state: "default",
    result_type: "show_card",
    recommendation_source: "none",
    result_position_bucket: "1",
    content_profile: "full_review",
  };

  try {
    const firstImpression = {
      ...base,
      eventName: "Show Card Impression",
      eventId: "spam-impression-first-123456",
      occurredAt: start,
      properties: { show_id: "impact-winter", discovery_surface: "home_archive_grid", browse_state: "default", result_position_bucket: "1" },
    };
    assert.equal(context.store.recordClientEvent(firstImpression).popularityCounted, true);
    assert.equal(context.store.recordClientEvent(firstImpression).reason, "duplicate");
    const repeatedImpression = context.store.recordClientEvent({
      ...firstImpression,
      eventId: "spam-impression-second-123456",
      properties: { ...firstImpression.properties, result_position_bucket: "2-4" },
    });
    assert.equal(repeatedImpression.recorded, true);
    assert.equal(repeatedImpression.popularityCounted, false);

    for (let index = 0; index < 100; index += 1) {
      context.store.recordClientEvent({
        ...base,
        eventName: "Show Opened",
        eventId: `spam-open-${String(index).padStart(3, "0")}-123456`,
        occurredAt: new Date(start.getTime() + index * 60_000),
        properties: showOpenProperties,
      });
    }
    context.store.recordClientEvent({
      ...base,
      eventName: "Show Opened",
      eventId: "search-surface-open-123456789",
      occurredAt: start,
      properties: {
        ...showOpenProperties,
        browse_state: "search",
        result_type: "search_result",
      },
    });
    context.store.recordClientEvent({
      ...base,
      eventName: "Show Opened",
      eventId: "collection-surface-open-123456789",
      occurredAt: start,
      properties: {
        ...showOpenProperties,
        discovery_surface: "collection_page_grid",
        result_type: "collection_member",
        recommendation_source: "collection_membership",
        collection_id: "best-for-long-walks",
      },
    });
    for (let index = 0; index < 100; index += 1) {
      const personBase = {
        ...base,
        visitorId: `visitor-distinct-${String(index).padStart(3, "0")}-123456`,
        sessionId: `session-distinct-${String(index).padStart(3, "0")}-123456`,
      };
      context.store.recordClientEvent({
        ...personBase,
        eventName: "Show Card Impression",
        eventId: `distinct-impression-${String(index).padStart(3, "0")}-123456`,
        occurredAt: start,
        properties: firstImpression.properties,
      });
      context.store.recordClientEvent({
        ...personBase,
        eventName: "Show Opened",
        eventId: `distinct-open-${String(index).padStart(3, "0")}-123456`,
        occurredAt: start,
        properties: showOpenProperties,
      });
    }

    for (let index = 0; index < 100; index += 1) {
      context.store.recordClientEvent(pageEvent({
        eventId: `refresh-page-${String(index).padStart(3, "0")}-123456`,
        visitorId,
        sessionId,
        occurredAt: new Date(start.getTime() + index * 60_000),
      }));
    }
    for (let index = 0; index < 20; index += 1) {
      context.store.recordClientEvent({
        ...base,
        eventName: "Listen Link Opened",
        eventId: `listen-spam-${String(index).padStart(3, "0")}-123456`,
        occurredAt: new Date(start.getTime() + index * 60_000),
        properties: {
          show_id: "impact-winter",
          provider: "spotify",
          link_role: "primary",
          discovery_surface: "show_page_facts",
          content_profile: "full_review",
        },
      });
    }

    const nextDay = new Date(start.getTime() + 25 * 60 * 60 * 1000);
    context.store.recordClientEvent({
      ...base,
      eventName: "Listen Link Opened",
      eventId: "listen-legitimate-next-day-123456",
      occurredAt: nextDay,
      properties: {
        show_id: "impact-winter",
        provider: "spotify",
        link_role: "primary",
        discovery_surface: "show_page_facts",
        content_profile: "full_review",
      },
    });

    for (let index = 0; index < 20; index += 1) {
      context.store.recordClientEvent({
        ...base,
        eventName: "Show Saved",
        eventId: `save-cycle-${String(index).padStart(3, "0")}-123456`,
        occurredAt: start,
        properties: { show_id: "impact-winter" },
      });
      context.store.recordClientEvent({
        ...base,
        eventName: "Library State Changed",
        eventId: `state-toggle-${String(index).padStart(3, "0")}-123456`,
        occurredAt: new Date(start.getTime() + 1_000 + index * 1_000),
        properties: { show_id: "impact-winter", library_state: index % 2 ? "finished" : "listening" },
      });
      context.store.recordServerInteraction({
        ...base,
        eventName: "Rating Changed",
        eventId: `rating-edit-${String(index).padStart(3, "0")}-123456`,
        occurredAt: start,
        properties: { show_id: "impact-winter" },
      });
      context.store.recordServerInteraction({
        ...base,
        eventName: "Helpful Vote",
        eventId: `helpful-toggle-${String(index).padStart(3, "0")}-123456`,
        occurredAt: start,
        properties: { show_id: "impact-winter" },
      });
    }

    const afterCooldown = new Date(start.getTime() + 31 * 24 * 60 * 60 * 1000);
    context.store.recordClientEvent({
      ...base,
      eventName: "Show Saved",
      eventId: "save-legitimate-month-later-123456",
      occurredAt: afterCooldown,
      properties: { show_id: "impact-winter" },
    });
    context.store.recordServerInteraction({
      ...base,
      eventName: "Rating Changed",
      eventId: "rating-legitimate-month-later-123456",
      occurredAt: afterCooldown,
      properties: { show_id: "impact-winter" },
    });
    context.store.recordServerInteraction({
      ...base,
      eventName: "Helpful Vote",
      eventId: "helpful-legitimate-month-later-123456",
      occurredAt: afterCooldown,
      properties: { show_id: "impact-winter" },
    });

    const malformedIdentityEvent = {
      ...base,
      visitorId: "bad",
      sessionId: "bad",
      eventName: "Show Card Impression",
      properties: { show_id: "impact-winter", discovery_surface: "home_archive_grid", browse_state: "default", result_position_bucket: "1" },
    };
    for (let index = 0; index < 3; index += 1) {
      context.store.recordClientEvent({
        ...malformedIdentityEvent,
        eventId: `malformed-identity-${index}-123456789`,
        occurredAt: start,
      });
    }
    assert.equal(context.store.recordClientEvent({
      ...base,
      eventName: "Show Opened",
      eventId: "malformed-context-123456789",
      properties: { ...showOpenProperties, browse_state: "<script>" },
    }).reason, "invalid_properties");

    const snapshot = context.store.getPopularitySignals({ now: new Date("2026-10-15T00:00:00.000Z") })["impact-winter"];
    assert.equal(snapshot.periods.lifetime["show_open:browse:1"], 101);
    assert.equal(snapshot.rawPeriods.lifetime["show_open:browse:1"], 200);
    assert.equal(snapshot.periods.lifetime["show_open:search:1"], 1);
    assert.equal(snapshot.periods.lifetime["show_open:collection:1"], 1);
    assert.equal(snapshot.periods.lifetime["impression:browse:1"], 102);
    assert.equal(snapshot.rawPeriods.lifetime["impression:browse:1"], 104);
    assert.equal(snapshot.periods.lifetime.show_page_view, 1);
    assert.equal(snapshot.rawPeriods.lifetime.show_page_view, 100);
    assert.equal(snapshot.periods.lifetime.listen_click, 2);
    assert.equal(snapshot.rawPeriods.lifetime.listen_click, 21);
    assert.equal(snapshot.periods.lifetime.show_saved, 2);
    assert.equal(snapshot.rawPeriods.lifetime.show_saved, 21);
    assert.equal(snapshot.periods.lifetime.library_listening || 0, 0);
    assert.equal(snapshot.periods.lifetime.library_finished || 0, 0);
    assert.equal(snapshot.periods.lifetime.rating_changed, 2);
    assert.equal(snapshot.rawPeriods.lifetime.rating_changed, 21);
    assert.equal(snapshot.periods.lifetime.helpful_vote, 2);
    assert.equal(snapshot.rawPeriods.lifetime.helpful_vote, 21);
    const storedLimitKeys = context.db.prepare("SELECT limit_key FROM popularity_contribution_limits").all();
    assert.ok(storedLimitKeys.length > 0);
    assert.ok(storedLimitKeys.every(({ limit_key }) => /^[a-f0-9]{32}$/.test(limit_key)));
    assert.equal(JSON.stringify(storedLimitKeys).includes(visitorId), false);
  } finally {
    cleanup(context);
  }
});

test("helpful-vote popularity counts one distinct helpful voter per show, not one vote per review", () => {
  const context = createContext();
  try {
    context.db.prepare("INSERT INTO community_profiles (id) VALUES (?)").run("profile-analytics-two");
    const insertSubmission = context.db.prepare(`
      INSERT INTO show_submissions (id, submission_type, existing_show_id, show_title, contact_email)
      VALUES (@id, 'listener-review', 'impact-winter', 'Impact Winter', 'listener@example.com')
    `);
    const insertReview = context.db.prepare(`
      INSERT INTO published_listener_reviews (id, submission_id, show_id, title, body, rating_stars, is_published)
      VALUES (@id, @submissionId, 'impact-winter', @title, 'Review copy', @rating, @published)
    `);
    for (const review of [
      { id: "review-one", submissionId: "submission-one", title: "First review", rating: 4, published: 1 },
      { id: "review-two", submissionId: "submission-two", title: "Second review", rating: 5, published: 1 },
      { id: "review-hidden", submissionId: "submission-hidden", title: "Unpublished review", rating: 1, published: 0 },
    ]) {
      insertSubmission.run({ id: review.submissionId });
      insertReview.run(review);
    }
    const insertVote = context.db.prepare(`
      INSERT INTO listener_review_helpful_votes (review_id, profile_id)
      VALUES (?, ?)
    `);
    insertVote.run("review-one", "profile-analytics");
    insertVote.run("review-two", "profile-analytics");
    insertVote.run("review-two", "profile-analytics-two");
    insertVote.run("review-hidden", "profile-analytics-two");

    const popularity = context.store.getPopularitySignals({ now: new Date("2026-10-15T00:00:00.000Z") })["impact-winter"];
    assert.equal(popularity.community.reviewCount, 2);
    assert.equal(popularity.community.helpfulVoteCount, 2);
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
