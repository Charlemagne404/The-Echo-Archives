const test = require("node:test");
const assert = require("node:assert/strict");
const { createAnalyticsAbuseGuard } = require("../lib/analytics-abuse-guard");

const SECRET = "test-analytics-abuse-guard-secret-1234567890";

function makeEvent(index, eventName = "Page Viewed", pageKind = "show") {
  return {
    eventId: `event-${String(index).padStart(28, "0")}`,
    eventName,
    properties: pageKind === "show" ? { page_kind: "show", show_id: `show-${index}` } : { page_kind: pageKind },
  };
}

test("ordinary multi-show browsing and low-volume visitors remain eligible", () => {
  const guard = createAnalyticsAbuseGuard({ secret: SECRET, now: () => Date.parse("2026-11-11T12:00:00.000Z") });
  const result = guard.observeBatch({
    sourceAddress: "203.0.113.4",
    events: [makeEvent(1), makeEvent(2), makeEvent(3), makeEvent(4)],
    visitorId: "visitor-ordinary-0000000000000001",
    sessionId: "session-ordinary-00000000000001",
    userAgent: "Mozilla/5.0 Chrome/146.0.0.0 Safari/537.36",
  });
  assert.deepEqual(result.classifications.map((item) => item.trafficClass), ["normal", "normal", "normal", "normal"]);
  assert.ok(result.classifications.every((item) => item.eligible));
  assert.deepEqual(result.promoteEventIds, []);
});

test("visitors sharing a public network retain normal eligibility", () => {
  const guard = createAnalyticsAbuseGuard({ secret: SECRET });
  const classifications = [];
  for (let visitorIndex = 0; visitorIndex < 12; visitorIndex += 1) {
    const result = guard.observeBatch({
      sourceAddress: "203.0.113.44",
      events: Array.from({ length: 4 }, (_, pageIndex) => makeEvent(30_000 + visitorIndex * 10 + pageIndex)),
      visitorId: `visitor-shared-network-${String(visitorIndex).padStart(16, "0")}`,
      sessionId: `session-shared-network-${String(visitorIndex).padStart(16, "0")}`,
      userAgent: "Mozilla/5.0 Chrome/146.0.0.0 Safari/537.36",
    });
    classifications.push(...result.classifications);
  }
  assert.equal(classifications.length, 48);
  assert.ok(classifications.every((item) => item.trafficClass === "normal" && item.eligible));
});

test("crawler user-agent labels are weak suspicion signals and do not bypass behavioral classification", () => {
  const guard = createAnalyticsAbuseGuard({ secret: SECRET });
  const suspicious = guard.observeBatch({
    sourceAddress: "203.0.113.8",
    events: [makeEvent(10)],
    visitorId: "visitor-crawler-0000000000000001",
    sessionId: "session-crawler-00000000000001",
    userAgent: "python-requests/2.32",
  });
  assert.equal(suspicious.classifications[0].trafficClass, "suspected_automation");
  assert.equal(suspicious.classifications[0].eligible, true);
  const searchCrawler = guard.observeBatch({
    sourceAddress: "203.0.113.9",
    events: [makeEvent(11)],
    visitorId: "visitor-search-0000000000000001",
    sessionId: "session-search-00000000000001",
    userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  });
  assert.equal(searchCrawler.classifications[0].trafficClass, "suspected_automation");
  assert.equal(searchCrawler.classifications[0].eligible, true);
  assert.ok(searchCrawler.classifications[0].reasonCodes.includes("automation_user_agent_signal"));

  const spoofedCrawlerGuard = createAnalyticsAbuseGuard({ secret: SECRET, globalEventsPerMinute: 1000 });
  let thresholdDecision;
  for (let index = 0; index < 240; index += 1) {
    thresholdDecision = spoofedCrawlerGuard.observeBatch({
      sourceAddress: `198.51.${Math.floor(index / 250)}.${(index % 250) + 1}`,
      events: [makeEvent(index + 20_000)],
      visitorId: `visitor-spoofed-crawler-${String(index).padStart(16, "0")}`,
      sessionId: `session-spoofed-crawler-${String(index).padStart(16, "0")}`,
      userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    });
  }
  assert.equal(thresholdDecision.classifications[0].trafficClass, "high_confidence_automated");
  assert.equal(thresholdDecision.classifications[0].eligible, false);
});

test("distributed full-catalogue sweeps promote only one-page show views and preserve independent actions", () => {
  const guard = createAnalyticsAbuseGuard({ secret: SECRET, globalEventsPerMinute: 1000 });
  const humanSession = guard.observeBatch({
    sourceAddress: "203.0.113.20",
    events: [makeEvent(20), makeEvent(21), makeEvent(22), makeEvent(23)],
    visitorId: "visitor-human-000000000000000001",
    sessionId: "session-human-00000000000000001",
    userAgent: "Mozilla/5.0 Chrome/146.0.0.0 Safari/537.36",
  });
  assert.ok(humanSession.classifications.every((item) => item.eligible));

  let thresholdDecision;
  for (let index = 0; index < 240; index += 1) {
    thresholdDecision = guard.observeBatch({
      sourceAddress: `198.51.${Math.floor(index / 250)}.${(index % 250) + 1}`,
      events: [makeEvent(index + 1000)],
      visitorId: `visitor-distributed-${String(index).padStart(20, "0")}`,
      sessionId: `session-distributed-${String(index).padStart(20, "0")}`,
      userAgent: "Mozilla/5.0 Chrome/146.0.0.0 Safari/537.36",
    });
  }

  assert.equal(thresholdDecision.classifications[0].trafficClass, "high_confidence_automated");
  assert.equal(thresholdDecision.classifications[0].eligible, false);
  assert.equal(thresholdDecision.promoteEventIds.length, 240);
  for (const humanEventId of [20, 21, 22, 23].map((index) => makeEvent(index).eventId)) {
    assert.equal(thresholdDecision.promoteEventIds.includes(humanEventId), false, "multi-page sessions are preserved during the same traffic burst");
  }

  const listen = guard.observeBatch({
    sourceAddress: "198.51.100.99",
    events: [{ eventId: "listen-event-000000000000001", eventName: "Listen Link Opened", properties: { show_id: "impact-winter" } }],
    visitorId: "visitor-listener-000000000000000001",
    sessionId: "session-listener-00000000000000001",
    userAgent: "Mozilla/5.0 Chrome/146.0.0.0 Safari/537.36",
  });
  assert.notEqual(listen.classifications[0].trafficClass, "high_confidence_automated");
  assert.equal(listen.classifications[0].eligible, true);

  const snapshot = guard.getSnapshot();
  assert.equal(snapshot.sourceAddressesStored, false);
  assert.equal(snapshot.clientIdentifiersStored, false);
  assert.doesNotMatch(JSON.stringify(snapshot), /198\.51\.|203\.0\.113\.|visitor-distributed/);
});

test("distributed low-rate traversal across rolling minutes is not claimed as detected", () => {
  let now = Date.parse("2026-11-11T12:00:00.000Z");
  const guard = createAnalyticsAbuseGuard({ secret: SECRET, now: () => now });
  const classes = [];
  for (let index = 0; index < 120; index += 1) {
    now = Date.parse("2026-11-11T12:00:00.000Z") + Math.floor(index / 40) * 60_000;
    const result = guard.observeBatch({
      sourceAddress: `198.51.${Math.floor(index / 254)}.${(index % 254) + 1}`,
      events: [makeEvent(index + 40_000)],
      visitorId: `visitor-low-rate-${String(index).padStart(16, "0")}`,
      sessionId: `session-low-rate-${String(index).padStart(16, "0")}`,
      userAgent: "Mozilla/5.0 Chrome/146.0.0.0 Safari/537.36",
    });
    classes.push(...result.classifications.map((item) => item.trafficClass));
  }
  assert.equal(classes.length, 120);
  assert.ok(classes.every((trafficClass) => trafficClass !== "high_confidence_automated"));
});

test("source and application token buckets bound requests and total event volume", () => {
  let now = Date.parse("2026-11-11T12:00:00.000Z");
  const guard = createAnalyticsAbuseGuard({
    secret: SECRET,
    now: () => now,
    sourceRequestsPerMinute: 1,
    sourceEventsPerMinute: 2,
    globalEventsPerMinute: 2,
    maxTrackedSources: 1,
  });
  assert.equal(guard.beginRequest("203.0.113.1").allowed, true);
  assert.equal(guard.beginRequest("203.0.113.1").allowed, false);
  assert.equal(guard.admitBatch("203.0.113.1", 2).allowed, true);
  assert.equal(guard.admitBatch("203.0.113.2", 1).allowed, false);
  now += 60_000;
  assert.equal(guard.beginRequest("203.0.113.1").allowed, true);
});
