const crypto = require("node:crypto");

const PAGE_VIEW_EVENT = "Page Viewed";
const DISCOVERY_EVENT_NAMES = new Set([
  PAGE_VIEW_EVENT,
  "Search Used",
  "Filter Changed",
  "Filters Cleared",
  "Collection Opened",
  "Entity Opened",
  "Show Opened",
  "Listen Link Opened",
]);
const SERVER_EVENT_NAMES = new Set([
  "Rating Submitted",
  "Rating Removed",
  "Helpful Vote",
  "Helpful Vote Removed",
  "Catalogue Submission",
]);
const INTERACTION_EVENT_NAMES = new Set([
  ...DISCOVERY_EVENT_NAMES,
  ...SERVER_EVENT_NAMES,
]);

const RANGE_DEFINITIONS = Object.freeze({
  "24h": { key: "24h", label: "Last 24 hours", durationMs: 24 * 60 * 60 * 1000, bucket: "hour" },
  "7d": { key: "7d", label: "Last 7 days", durationMs: 7 * 24 * 60 * 60 * 1000, bucket: "day" },
  "30d": { key: "30d", label: "Last 30 days", durationMs: 30 * 24 * 60 * 60 * 1000, bucket: "day" },
  all: { key: "all", label: "All tracked time", durationMs: null, bucket: "day" },
});

const BOT_USER_AGENT_PATTERN = /bot|crawler|spider|slurp|headless|lighthouse|curl|wget|python(?:-requests)?|go-http-client|axios|node-fetch|postmanruntime|uptimerobot|pingdom|statuscake|betterstack|checkly|k6|prometheus|blackbox|datadog|newrelic|synthetic|monitor/i;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const CONTROLLED_ID_PATTERN = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
const HOST_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const IPV4_PATTERN = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const SOURCE_VALUES = new Set(["direct", "internal", "unknown", "other"]);
const SUBMISSION_TYPES = new Set(["show", "correction", "listener-review", "creator-verification"]);
const BUCKET_EXPRESSIONS = Object.freeze({
  hour: "strftime('%Y-%m-%dT%H:00:00Z', occurred_at)",
  day: "strftime('%Y-%m-%dT00:00:00Z', occurred_at)",
  month: "strftime('%Y-%m-01T00:00:00Z', occurred_at)",
});

function toDate(value, fallback = null) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value || "");
  return Number.isFinite(date.getTime()) ? date : fallback;
}

function toIso(value, fallback = new Date()) {
  return (toDate(value, fallback) || fallback).toISOString();
}

function normalizeRange(value) {
  return RANGE_DEFINITIONS[String(value || "7d").trim()] || RANGE_DEFINITIONS["7d"];
}

function normalizePagePath(value = "") {
  const path = String(value || "").trim().split(/[?#]/, 1)[0] || "/";
  if (
    !path.startsWith("/") ||
    path.length > 240 ||
    /[\u0000-\u001f\u007f\s]/.test(path) ||
    path.includes("..")
  ) {
    return "";
  }
  return path;
}

function normalizeControlledId(value = "") {
  const normalized = String(value || "").trim();
  return normalized && normalized.length <= 160 && CONTROLLED_ID_PATTERN.test(normalized) ? normalized : "";
}

function normalizeToken(value = "") {
  const normalized = String(value || "").trim();
  return TOKEN_PATTERN.test(normalized) ? normalized : "";
}

function normalizeSource(value = "") {
  const normalized = String(value || "").trim().toLowerCase().replace(/^www\./, "");
  if (SOURCE_VALUES.has(normalized)) return normalized;
  if (HOST_PATTERN.test(normalized) || IPV4_PATTERN.test(normalized)) return normalized;
  return normalized ? "other" : "direct";
}

function isLikelyBot(userAgent = "") {
  return BOT_USER_AGENT_PATTERN.test(String(userAgent || ""));
}

function createHash(secret, value) {
  return crypto.createHmac("sha256", secret).update(value).digest("hex").slice(0, 32);
}

function hashContext(secret, visitorId, sessionId) {
  const normalizedVisitorId = normalizeToken(visitorId);
  const normalizedSessionId = normalizeToken(sessionId);
  const visitorKey = normalizedVisitorId
    ? createHash(secret, `visitor\n${normalizedVisitorId}`)
    : "";
  const sessionKey = normalizedSessionId
    ? createHash(secret, `session\n${normalizedVisitorId}\n${normalizedSessionId}`)
    : "";
  return { visitorKey, sessionKey };
}

function safeEventId(value) {
  const normalized = String(value || "").trim();
  return TOKEN_PATTERN.test(normalized) ? normalized : crypto.randomUUID();
}

function safeProperties(eventName, properties, validateClientEvent) {
  if (DISCOVERY_EVENT_NAMES.has(eventName)) {
    const validated = typeof validateClientEvent === "function"
      ? validateClientEvent(eventName, properties)
      : null;
    if (!validated || typeof validated !== "object" || Array.isArray(validated)) return null;
    return validated;
  }

  if (!SERVER_EVENT_NAMES.has(eventName) || !properties || typeof properties !== "object" || Array.isArray(properties)) {
    return null;
  }

  const safe = {};
  const showId = normalizeControlledId(properties.show_id);
  if (showId) safe.show_id = showId;

  if (eventName === "Catalogue Submission") {
    const submissionType = String(properties.submission_type || "show").trim();
    safe.submission_type = SUBMISSION_TYPES.has(submissionType) ? submissionType : "show";
  }

  return safe;
}

function idFromProperties(properties, key) {
  return normalizeControlledId(properties?.[key]);
}

function floorUtc(date, bucket) {
  const floored = new Date(date.getTime());
  if (bucket === "month") {
    floored.setUTCDate(1);
    floored.setUTCHours(0, 0, 0, 0);
  } else if (bucket === "day") {
    floored.setUTCHours(0, 0, 0, 0);
  } else {
    floored.setUTCMinutes(0, 0, 0);
  }
  return floored;
}

function addBucket(date, bucket) {
  const next = new Date(date.getTime());
  if (bucket === "month") {
    next.setUTCMonth(next.getUTCMonth() + 1);
  } else if (bucket === "day") {
    next.setUTCDate(next.getUTCDate() + 1);
  } else {
    next.setUTCHours(next.getUTCHours() + 1);
  }
  return next;
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 10) / 10;
}

function createChange(value, previousValue, available) {
  const current = Number(value || 0);
  const previous = Number(previousValue || 0);
  if (!available) {
    return { available: false, delta: null, percentage: null };
  }
  return {
    available: true,
    delta: current - previous,
    percentage: previous === 0 ? null : formatPercent(((current - previous) / previous) * 100),
  };
}

function createAnalyticsStore({ db, secret = "", validateClientEvent, retentionDays = 400, collections = [] }) {
  const normalizedSecret = String(secret || "").trim();
  const enabled = normalizedSecret.length >= 32;
  const safeRetentionDays = Number.isInteger(Number(retentionDays)) && Number(retentionDays) > 0
    ? Number(retentionDays)
    : 400;
  let collectionTitles = new Map();

  function setCollections(nextCollections = []) {
    collectionTitles = new Map(
      (Array.isArray(nextCollections) ? nextCollections : [])
        .filter((collection) => collection?.id)
        .map((collection) => [String(collection.id), String(collection.title || collection.id)]),
    );
  }

  setCollections(collections);

  const getMeta = db.prepare("SELECT value FROM analytics_meta WHERE key = ?");
  const setMeta = db.prepare(`
    INSERT INTO analytics_meta (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);
  const insertEvent = db.prepare(`
    INSERT OR IGNORE INTO analytics_events (
      event_id, event_name, occurred_at, visitor_key, session_key, page_path,
      show_id, collection_id, source, properties_json, is_server_event, dedupe_key
    ) VALUES (
      @eventId, @eventName, @occurredAt, @visitorKey, @sessionKey, @pagePath,
      @showId, @collectionId, @source, @propertiesJson, @isServerEvent, @dedupeKey
    )
  `);
  const upsertVisitor = db.prepare(`
    INSERT INTO analytics_visitors (visitor_key, first_seen_at, last_seen_at, first_source, last_source)
    VALUES (@visitorKey, @occurredAt, @occurredAt, @source, @source)
    ON CONFLICT(visitor_key) DO UPDATE SET
      first_seen_at = CASE WHEN excluded.first_seen_at < analytics_visitors.first_seen_at
        THEN excluded.first_seen_at ELSE analytics_visitors.first_seen_at END,
      last_seen_at = CASE WHEN excluded.last_seen_at > analytics_visitors.last_seen_at
        THEN excluded.last_seen_at ELSE analytics_visitors.last_seen_at END,
      first_source = CASE WHEN excluded.first_seen_at < analytics_visitors.first_seen_at
        THEN excluded.first_source ELSE analytics_visitors.first_source END,
      last_source = CASE WHEN excluded.last_seen_at >= analytics_visitors.last_seen_at
        THEN excluded.last_source ELSE analytics_visitors.last_source END
  `);
  const insertAndUpsert = db.transaction((payload) => {
    const result = insertEvent.run(payload);
    if (result.changes > 0 && payload.visitorKey) {
      upsertVisitor.run(payload);
    }
    return result.changes > 0;
  });

  function getTrackingStartedAt() {
    const metaValue = getMeta.get("tracking_started_at")?.value;
    const metaDate = toDate(metaValue);
    if (metaDate) return metaDate;
    const earliest = db.prepare("SELECT MIN(occurred_at) AS occurred_at FROM analytics_events").get()?.occurred_at;
    return toDate(earliest, new Date());
  }

  function record({
    eventName,
    eventId,
    occurredAt,
    visitorId,
    sessionId,
    pagePath,
    source,
    properties,
    isServerEvent,
  }) {
    if (!enabled) return { recorded: false, reason: "disabled" };

    const now = toIso(occurredAt);
    const safePath = normalizePagePath(pagePath);
    const context = hashContext(normalizedSecret, visitorId, sessionId);
    const safeSource = normalizeSource(source);
    const safeShowId = idFromProperties(properties, "show_id");
    const safeCollectionId = idFromProperties(properties, "collection_id");
    const dedupeKey = eventName === PAGE_VIEW_EVENT && context.sessionKey && safePath
      ? createHash(normalizedSecret, `pageview\n${context.sessionKey}\n${safePath}\n${Math.floor(new Date(now).getTime() / 30_000)}`)
      : null;
    const recorded = insertAndUpsert({
      eventId: safeEventId(eventId),
      eventName,
      occurredAt: now,
      visitorKey: context.visitorKey,
      sessionKey: context.sessionKey,
      pagePath: safePath,
      showId: safeShowId,
      collectionId: safeCollectionId,
      source: safeSource,
      propertiesJson: JSON.stringify(properties || {}),
      isServerEvent: isServerEvent ? 1 : 0,
      dedupeKey,
    });
    return { recorded, reason: recorded ? "stored" : "duplicate" };
  }

  function requestShouldBeIgnored({ userAgent = "", internal = false } = {}) {
    return Boolean(internal) || isLikelyBot(userAgent);
  }

  function recordClientEvent({
    eventName,
    eventId,
    occurredAt = new Date(),
    visitorId,
    sessionId,
    pagePath,
    source,
    properties,
    userAgent = "",
    internal = false,
  } = {}) {
    if (requestShouldBeIgnored({ userAgent, internal })) {
      return { recorded: false, reason: internal ? "internal" : "bot" };
    }
    if (!DISCOVERY_EVENT_NAMES.has(eventName)) {
      return { recorded: false, reason: "unknown_event" };
    }
    const safePropertiesValue = safeProperties(eventName, properties, validateClientEvent);
    if (!safePropertiesValue) return { recorded: false, reason: "invalid_properties" };
    if (eventName === PAGE_VIEW_EVENT && !normalizePagePath(pagePath)) {
      return { recorded: false, reason: "invalid_path" };
    }
    return record({
      eventName,
      eventId,
      occurredAt,
      visitorId,
      sessionId,
      pagePath,
      source,
      properties: safePropertiesValue,
      isServerEvent: false,
    });
  }

  function recordServerInteraction({
    eventName,
    eventId,
    occurredAt = new Date(),
    visitorId,
    sessionId,
    pagePath,
    source,
    properties,
    userAgent = "",
    internal = false,
  } = {}) {
    if (requestShouldBeIgnored({ userAgent, internal })) {
      return { recorded: false, reason: internal ? "internal" : "bot" };
    }
    if (!SERVER_EVENT_NAMES.has(eventName)) {
      return { recorded: false, reason: "unknown_event" };
    }
    const safePropertiesValue = safeProperties(eventName, properties, validateClientEvent);
    if (!safePropertiesValue) return { recorded: false, reason: "invalid_properties" };
    return record({
      eventName,
      eventId,
      occurredAt,
      visitorId,
      sessionId,
      pagePath,
      source,
      properties: safePropertiesValue,
      isServerEvent: true,
    });
  }

  function purgeExpiredEvents({ now = new Date() } = {}) {
    const nowDate = toDate(now, new Date());
    const cutoff = new Date(nowDate.getTime() - safeRetentionDays * 24 * 60 * 60 * 1000).toISOString();
    const deletedEvents = db.prepare("DELETE FROM analytics_events WHERE occurred_at < ?").run(cutoff).changes;
    const deletedVisitors = db.prepare(`
      DELETE FROM analytics_visitors
      WHERE last_seen_at < ?
        AND NOT EXISTS (
          SELECT 1 FROM analytics_events WHERE analytics_events.visitor_key = analytics_visitors.visitor_key
        )
    `).run(cutoff).changes;
    return { eventsDeleted: deletedEvents, visitorsDeleted: deletedVisitors, cutoff }; 
  }

  function rangeWindow(rangeValue, nowValue = new Date()) {
    const definition = normalizeRange(rangeValue);
    const now = toDate(nowValue, new Date());
    const trackingStartedAt = getTrackingStartedAt();
    const retentionCutoff = new Date(now.getTime() - safeRetentionDays * 24 * 60 * 60 * 1000);
    const requestedStart = definition.durationMs === null
      ? trackingStartedAt
      : new Date(now.getTime() - definition.durationMs);
    const requestedEnd = now;
    const availableFrom = new Date(Math.max(trackingStartedAt.getTime(), retentionCutoff.getTime()));
    const queryStart = new Date(Math.max(requestedStart.getTime(), availableFrom.getTime()));
    const comparisonStart = definition.durationMs === null
      ? null
      : new Date(requestedStart.getTime() - definition.durationMs);
    const comparisonEnd = definition.durationMs === null ? null : requestedStart;
    const comparisonAvailable = Boolean(
      comparisonStart &&
      comparisonStart.getTime() >= availableFrom.getTime() &&
      comparisonEnd.getTime() > comparisonStart.getTime(),
    );
    const spanDays = (requestedEnd.getTime() - requestedStart.getTime()) / (24 * 60 * 60 * 1000);
    const bucket = definition.key === "all" && spanDays > 120 ? "month" : definition.bucket;
    return {
      ...definition,
      now,
      requestedStart,
      requestedEnd,
      queryStart,
      availableFrom,
      comparisonStart,
      comparisonEnd,
      comparisonAvailable,
      bucket,
      trackingStartedAt,
      retentionCutoff,
    };
  }

  function queryPeriodSummary(start, end) {
    if (!start || !end || end <= start) {
      return {
        uniqueVisitors: 0,
        sessions: 0,
        pageViews: 0,
        showPageViews: 0,
        engagedSessions: 0,
        interactions: 0,
        collectionOpens: 0,
        showOpens: 0,
        listenClicks: 0,
        searches: 0,
        filterChanges: 0,
        ratingsSubmitted: 0,
        catalogueSubmissions: 0,
      };
    }
    const row = db.prepare(`
      SELECT
        COUNT(CASE WHEN event_name = @pageViewEvent THEN 1 END) AS page_views,
        COUNT(DISTINCT CASE WHEN event_name = @pageViewEvent AND visitor_key <> '' THEN visitor_key END) AS unique_visitors,
        COUNT(DISTINCT CASE WHEN event_name = @pageViewEvent AND session_key <> '' THEN session_key END) AS sessions,
        COUNT(CASE WHEN event_name <> @pageViewEvent THEN 1 END) AS interactions,
        COUNT(DISTINCT CASE WHEN event_name <> @pageViewEvent AND session_key <> '' THEN session_key END) AS engaged_sessions,
        COUNT(CASE WHEN event_name = @pageViewEvent AND show_id <> '' THEN 1 END) AS show_page_views,
        COUNT(CASE WHEN event_name = 'Collection Opened' THEN 1 END) AS collection_opens,
        COUNT(CASE WHEN event_name = 'Show Opened' THEN 1 END) AS show_opens,
        COUNT(CASE WHEN event_name = 'Listen Link Opened' THEN 1 END) AS listen_clicks,
        COUNT(CASE WHEN event_name = 'Search Used' THEN 1 END) AS searches,
        COUNT(CASE WHEN event_name IN ('Filter Changed', 'Filters Cleared') THEN 1 END) AS filter_changes,
        COUNT(CASE WHEN event_name = 'Rating Submitted' THEN 1 END) AS ratings_submitted,
        COUNT(CASE WHEN event_name = 'Catalogue Submission' THEN 1 END) AS catalogue_submissions
      FROM analytics_events
      WHERE occurred_at >= @start AND occurred_at < @end
    `).get({
      pageViewEvent: PAGE_VIEW_EVENT,
      start: start.toISOString(),
      end: end.toISOString(),
    });
    return {
      uniqueVisitors: Number(row.unique_visitors || 0),
      sessions: Number(row.sessions || 0),
      pageViews: Number(row.page_views || 0),
      showPageViews: Number(row.show_page_views || 0),
      engagedSessions: Number(row.engaged_sessions || 0),
      interactions: Number(row.interactions || 0),
      collectionOpens: Number(row.collection_opens || 0),
      showOpens: Number(row.show_opens || 0),
      listenClicks: Number(row.listen_clicks || 0),
      searches: Number(row.searches || 0),
      filterChanges: Number(row.filter_changes || 0),
      ratingsSubmitted: Number(row.ratings_submitted || 0),
      catalogueSubmissions: Number(row.catalogue_submissions || 0),
    };
  }

  function createBuckets(start, end, bucket) {
    const buckets = [];
    let cursor = floorUtc(start, bucket);
    const last = floorUtc(end, bucket);
    while (cursor <= last && buckets.length < 520) {
      buckets.push(cursor.toISOString());
      cursor = addBucket(cursor, bucket);
    }
    return buckets;
  }

  function queryTimeSeries(window) {
    const buckets = createBuckets(window.requestedStart, window.requestedEnd, window.bucket);
    const expression = BUCKET_EXPRESSIONS[window.bucket];
    const rows = db.prepare(`
      SELECT
        ${expression} AS bucket,
        COUNT(CASE WHEN event_name = @pageViewEvent THEN 1 END) AS page_views,
        COUNT(DISTINCT CASE WHEN event_name = @pageViewEvent AND visitor_key <> '' THEN visitor_key END) AS unique_visitors,
        COUNT(DISTINCT CASE WHEN event_name = @pageViewEvent AND session_key <> '' THEN session_key END) AS sessions,
        COUNT(CASE WHEN event_name = @pageViewEvent AND show_id <> '' THEN 1 END) AS show_page_views,
        COUNT(CASE WHEN event_name <> @pageViewEvent THEN 1 END) AS interactions,
        COUNT(DISTINCT CASE WHEN event_name <> @pageViewEvent AND session_key <> '' THEN session_key END) AS engaged_sessions,
        COUNT(CASE WHEN event_name = 'Collection Opened' THEN 1 END) AS collection_opens,
        COUNT(CASE WHEN event_name = 'Show Opened' THEN 1 END) AS show_opens,
        COUNT(CASE WHEN event_name = 'Listen Link Opened' THEN 1 END) AS listen_clicks,
        COUNT(CASE WHEN event_name = 'Search Used' THEN 1 END) AS searches,
        COUNT(CASE WHEN event_name IN ('Filter Changed', 'Filters Cleared') THEN 1 END) AS filter_changes,
        COUNT(CASE WHEN event_name = 'Rating Submitted' THEN 1 END) AS ratings,
        COUNT(CASE WHEN event_name = 'Catalogue Submission' THEN 1 END) AS submissions
      FROM analytics_events
      WHERE occurred_at >= @start AND occurred_at < @end
      GROUP BY bucket
      ORDER BY bucket ASC
    `).all({
      pageViewEvent: PAGE_VIEW_EVENT,
      start: window.queryStart.toISOString(),
      end: window.requestedEnd.toISOString(),
    });
    const byBucket = new Map(rows.map((row) => [row.bucket, row]));
    return buckets.map((bucketValue) => {
      const row = byBucket.get(bucketValue) || {};
      return {
        bucket: bucketValue,
        pageViews: Number(row.page_views || 0),
        uniqueVisitors: Number(row.unique_visitors || 0),
        sessions: Number(row.sessions || 0),
        showPageViews: Number(row.show_page_views || 0),
        interactions: Number(row.interactions || 0),
        engagedSessions: Number(row.engaged_sessions || 0),
        collectionOpens: Number(row.collection_opens || 0),
        showOpens: Number(row.show_opens || 0),
        listenClicks: Number(row.listen_clicks || 0),
        searches: Number(row.searches || 0),
        filterChanges: Number(row.filter_changes || 0),
        ratings: Number(row.ratings || 0),
        submissions: Number(row.submissions || 0),
      };
    });
  }

  function queryReturningVisitors(window) {
    const row = db.prepare(`
      SELECT
        COUNT(CASE WHEN first_seen_at >= @start THEN 1 END) AS new_visitors,
        COUNT(CASE WHEN first_seen_at < @start THEN 1 END) AS returning_visitors
      FROM analytics_visitors
      WHERE last_seen_at >= @start AND last_seen_at < @end
    `).get({ start: window.queryStart.toISOString(), end: window.requestedEnd.toISOString() });
    return {
      newVisitors: Number(row.new_visitors || 0),
      returningVisitors: Number(row.returning_visitors || 0),
    };
  }

  function queryTopPages(window) {
    return db.prepare(`
      SELECT
        page_path,
        COUNT(*) AS page_views,
        COUNT(DISTINCT CASE WHEN session_key <> '' THEN session_key END) AS sessions,
        COUNT(DISTINCT CASE WHEN visitor_key <> '' THEN visitor_key END) AS visitors
      FROM analytics_events
      WHERE event_name = @pageViewEvent
        AND page_path <> ''
        AND occurred_at >= @start AND occurred_at < @end
      GROUP BY page_path
      ORDER BY page_views DESC, page_path ASC
      LIMIT 10
    `).all({
      pageViewEvent: PAGE_VIEW_EVENT,
      start: window.queryStart.toISOString(),
      end: window.requestedEnd.toISOString(),
    }).map((row) => ({
      path: row.page_path,
      pageViews: Number(row.page_views || 0),
      sessions: Number(row.sessions || 0),
      visitors: Number(row.visitors || 0),
    }));
  }

  function queryTopShows(window) {
    return db.prepare(`
      SELECT
        e.show_id,
        COALESCE(p.title, e.show_id) AS title,
        COUNT(CASE WHEN e.event_name = @pageViewEvent THEN 1 END) AS page_views,
        COUNT(CASE WHEN e.event_name <> @pageViewEvent THEN 1 END) AS interactions,
        COUNT(CASE WHEN e.event_name = 'Listen Link Opened' THEN 1 END) AS listen_clicks,
        COUNT(CASE WHEN e.event_name = 'Rating Submitted' THEN 1 END) AS ratings
      FROM analytics_events AS e
      LEFT JOIN podcasts AS p ON p.id = e.show_id
      WHERE e.show_id <> ''
        AND e.occurred_at >= @start AND e.occurred_at < @end
      GROUP BY e.show_id, p.title
      ORDER BY page_views DESC, interactions DESC, title ASC
      LIMIT 10
    `).all({
      pageViewEvent: PAGE_VIEW_EVENT,
      start: window.queryStart.toISOString(),
      end: window.requestedEnd.toISOString(),
    }).map((row) => ({
      showId: row.show_id,
      title: row.title,
      pageViews: Number(row.page_views || 0),
      interactions: Number(row.interactions || 0),
      listenClicks: Number(row.listen_clicks || 0),
      ratings: Number(row.ratings || 0),
    }));
  }

  function querySources(window) {
    return db.prepare(`
      SELECT
        source,
        COUNT(*) AS page_views,
        COUNT(DISTINCT CASE WHEN session_key <> '' THEN session_key END) AS sessions,
        COUNT(DISTINCT CASE WHEN visitor_key <> '' THEN visitor_key END) AS visitors
      FROM analytics_events
      WHERE event_name = @pageViewEvent
        AND occurred_at >= @start AND occurred_at < @end
      GROUP BY source
      ORDER BY page_views DESC, source ASC
      LIMIT 10
    `).all({
      pageViewEvent: PAGE_VIEW_EVENT,
      start: window.queryStart.toISOString(),
      end: window.requestedEnd.toISOString(),
    }).map((row) => ({
      source: row.source,
      pageViews: Number(row.page_views || 0),
      sessions: Number(row.sessions || 0),
      visitors: Number(row.visitors || 0),
    }));
  }

  function queryInteractionBreakdown(window) {
    return db.prepare(`
      SELECT
        event_name,
        COUNT(*) AS count,
        COUNT(DISTINCT CASE WHEN session_key <> '' THEN session_key END) AS sessions
      FROM analytics_events
      WHERE event_name <> @pageViewEvent
        AND occurred_at >= @start AND occurred_at < @end
      GROUP BY event_name
      ORDER BY count DESC, event_name ASC
    `).all({
      pageViewEvent: PAGE_VIEW_EVENT,
      start: window.queryStart.toISOString(),
      end: window.requestedEnd.toISOString(),
    }).map((row) => ({
      event: row.event_name,
      count: Number(row.count || 0),
      sessions: Number(row.sessions || 0),
    }));
  }

  function queryDiscoverySurfaces(window) {
    return db.prepare(`
      SELECT
        COALESCE(NULLIF(json_extract(properties_json, '$.discovery_surface'), ''), 'unknown') AS surface,
        COUNT(*) AS interactions,
        COUNT(DISTINCT CASE WHEN session_key <> '' THEN session_key END) AS sessions,
        COUNT(CASE WHEN event_name = 'Search Used' THEN 1 END) AS searches,
        COUNT(CASE WHEN event_name IN ('Filter Changed', 'Filters Cleared') THEN 1 END) AS filter_changes,
        COUNT(CASE WHEN event_name = 'Collection Opened' THEN 1 END) AS collection_opens,
        COUNT(CASE WHEN event_name = 'Show Opened' THEN 1 END) AS show_opens,
        COUNT(CASE WHEN event_name = 'Listen Link Opened' THEN 1 END) AS listen_clicks
      FROM analytics_events
      WHERE is_server_event = 0
        AND event_name <> @pageViewEvent
        AND occurred_at >= @start AND occurred_at < @end
      GROUP BY surface
      ORDER BY interactions DESC, surface ASC
      LIMIT 12
    `).all({
      pageViewEvent: PAGE_VIEW_EVENT,
      start: window.queryStart.toISOString(),
      end: window.requestedEnd.toISOString(),
    }).map((row) => ({
      surface: row.surface || "unknown",
      interactions: Number(row.interactions || 0),
      sessions: Number(row.sessions || 0),
      searches: Number(row.searches || 0),
      filterChanges: Number(row.filter_changes || 0),
      collectionOpens: Number(row.collection_opens || 0),
      showOpens: Number(row.show_opens || 0),
      listenClicks: Number(row.listen_clicks || 0),
    }));
  }

  function queryTopCollections(window) {
    return db.prepare(`
      SELECT
        collection_id,
        COUNT(CASE WHEN event_name = @pageViewEvent THEN 1 END) AS page_views,
        COUNT(CASE WHEN event_name = 'Collection Opened' THEN 1 END) AS opens,
        COUNT(CASE WHEN event_name = 'Show Opened' THEN 1 END) AS show_opens,
        COUNT(DISTINCT CASE WHEN session_key <> '' THEN session_key END) AS sessions
      FROM analytics_events
      WHERE collection_id <> ''
        AND occurred_at >= @start AND occurred_at < @end
      GROUP BY collection_id
      ORDER BY opens DESC, show_opens DESC, page_views DESC, collection_id ASC
      LIMIT 10
    `).all({
      pageViewEvent: PAGE_VIEW_EVENT,
      start: window.queryStart.toISOString(),
      end: window.requestedEnd.toISOString(),
    }).map((row) => ({
      collectionId: row.collection_id,
      title: collectionTitles.get(row.collection_id) || row.collection_id,
      pageViews: Number(row.page_views || 0),
      opens: Number(row.opens || 0),
      showOpens: Number(row.show_opens || 0),
      sessions: Number(row.sessions || 0),
    }));
  }

  function queryDistinctEventSessions(window, eventName) {
    const row = db.prepare(`
      SELECT COUNT(DISTINCT CASE WHEN session_key <> '' THEN session_key END) AS count
      FROM analytics_events
      WHERE event_name = ? AND occurred_at >= ? AND occurred_at < ?
    `).get(eventName, window.queryStart.toISOString(), window.requestedEnd.toISOString());
    return Number(row?.count || 0);
  }

  function queryRecordTotals() {
    const activeRatings = db.prepare("SELECT COUNT(*) AS count FROM rating_submissions WHERE status = 'active'").get().count;
    const catalogueSubmissions = db.prepare("SELECT COUNT(*) AS count FROM show_submissions").get().count;
    const publishedListenerReviews = db.prepare("SELECT COUNT(*) AS count FROM published_listener_reviews WHERE is_published = 1").get().count;
    const helpfulVotes = db.prepare("SELECT COUNT(*) AS count FROM listener_review_helpful_votes").get().count;
    return {
      activeRatings: Number(activeRatings || 0),
      catalogueSubmissions: Number(catalogueSubmissions || 0),
      publishedListenerReviews: Number(publishedListenerReviews || 0),
      helpfulVotes: Number(helpfulVotes || 0),
    };
  }

  function queryMostRatedShows() {
    return db.prepare(`
      SELECT
        r.podcast_id AS show_id,
        COALESCE(p.title, r.podcast_id) AS title,
        COUNT(*) AS rating_count,
        ROUND(AVG(r.rating), 1) AS average_rating
      FROM rating_submissions AS r
      LEFT JOIN podcasts AS p ON p.id = r.podcast_id
      WHERE r.status = 'active'
      GROUP BY r.podcast_id, p.title
      ORDER BY rating_count DESC, average_rating DESC, title ASC
      LIMIT 10
    `).all().map((row) => ({
      showId: row.show_id,
      title: row.title,
      ratingCount: Number(row.rating_count || 0),
      averageRating: row.average_rating === null ? null : Number(row.average_rating),
    }));
  }

  function getDashboard({ range = "7d", now = new Date() } = {}) {
    const window = rangeWindow(range, now);
    const current = queryPeriodSummary(window.queryStart, window.requestedEnd);
    const previous = window.comparisonAvailable
      ? queryPeriodSummary(window.comparisonStart, window.comparisonEnd)
      : null;
    const returning = queryReturningVisitors(window);
    const recordTotals = queryRecordTotals();
    const timeSeries = queryTimeSeries(window);
    const metricDefinitions = [
      ["uniqueVisitors", "Approx. visitors", "First-party anonymous IDs; page-view scoped."],
      ["sessions", "Sessions", "A session is a browser visit window, not a login."],
      ["pageViews", "Page views", "Tracked public page loads; reloads within 30 seconds are deduped."],
      ["showPageViews", "Show-page views", "Page views whose route resolves to a show."],
      ["interactions", "Interactions", "Search, filters, navigation, listens, ratings, and submissions."],
      ["engagedSessions", "Engaged sessions", "Sessions with at least one action beyond a page load."],
      ["showOpens", "Show opens", "Tracked show-card or recommendation opens."],
      ["listenClicks", "Listen links", "Clicks to an external listening or official link."],
      ["searches", "Searches", "Search actions recorded without storing the search text."],
      ["filterChanges", "Filter changes", "Filter additions, removals, and clear actions."],
      ["collectionOpens", "Collection opens", "Curated and related collection routes opened."],
      ["ratingsSubmitted", "Ratings saved", "Successful rating writes tracked from the start date."],
      ["catalogueSubmissions", "Submissions", "Successful public catalogue submissions tracked from the start date."],
    ];
    const metrics = Object.fromEntries(metricDefinitions.map(([key, label, note]) => [
      key,
      {
        label,
        value: current[key],
        change: createChange(current[key], previous?.[key], window.comparisonAvailable),
        note,
      },
    ]));
    const trackedSessions = current.sessions;
    const funnel = {
      sessions: trackedSessions,
      engagedSessions: current.engagedSessions,
      collectionSessions: queryDistinctEventSessions(window, "Collection Opened"),
      showOpenSessions: queryDistinctEventSessions(window, "Show Opened"),
      listenSessions: queryDistinctEventSessions(window, "Listen Link Opened"),
      ratingSessions: queryDistinctEventSessions(window, "Rating Submitted"),
      submissionSessions: queryDistinctEventSessions(window, "Catalogue Submission"),
    };
    funnel.engagedRate = trackedSessions ? formatPercent((funnel.engagedSessions / trackedSessions) * 100) : null;
    funnel.collectionRate = trackedSessions ? formatPercent((funnel.collectionSessions / trackedSessions) * 100) : null;
    funnel.showOpenRate = trackedSessions ? formatPercent((funnel.showOpenSessions / trackedSessions) * 100) : null;
    funnel.listenRate = trackedSessions ? formatPercent((funnel.listenSessions / trackedSessions) * 100) : null;
    funnel.ratingRate = trackedSessions ? formatPercent((funnel.ratingSessions / trackedSessions) * 100) : null;
    funnel.submissionRate = trackedSessions ? formatPercent((funnel.submissionSessions / trackedSessions) * 100) : null;

    return {
      generatedAt: toIso(now),
      range: {
        key: window.key,
        label: window.label,
        start: window.requestedStart.toISOString(),
        end: window.requestedEnd.toISOString(),
        comparisonStart: window.comparisonStart?.toISOString() || null,
        comparisonEnd: window.comparisonEnd?.toISOString() || null,
        bucket: window.bucket,
      },
      coverage: {
        trackingStartedAt: window.trackingStartedAt.toISOString(),
        availableFrom: window.availableFrom.toISOString(),
        rangeDataStartsAt: window.queryStart.toISOString(),
        retentionDays: safeRetentionDays,
        comparisonAvailable: window.comparisonAvailable,
      },
      metrics,
      returningVisitors: returning,
      traffic: timeSeries,
      interactionsOverTime: timeSeries.map((point) => ({
        bucket: point.bucket,
        interactions: point.interactions,
        engagedSessions: point.engagedSessions,
        showOpens: point.showOpens,
        listenClicks: point.listenClicks,
      })),
      contributionsOverTime: timeSeries.map((point) => ({
        bucket: point.bucket,
        ratings: point.ratings,
        submissions: point.submissions,
      })),
      topPages: queryTopPages(window),
      topShows: queryTopShows(window),
      topCollections: queryTopCollections(window),
      mostRatedShows: queryMostRatedShows(),
      sources: querySources(window),
      discoverySurfaces: queryDiscoverySurfaces(window),
      interactionBreakdown: queryInteractionBreakdown(window),
      funnel,
      recordTotals,
      privacy: {
        rawIpStored: false,
        rawUserAgentStored: false,
        browserIdsStored: false,
      },
      eventNames: [...INTERACTION_EVENT_NAMES],
    };
  }

  return {
    enabled,
    retentionDays: safeRetentionDays,
    getDashboard,
    getTrackingStartedAt,
    purgeExpiredEvents,
    recordClientEvent,
    recordServerInteraction,
    requestShouldBeIgnored,
    setCollections,
    setTrackingStartedAt(value) {
      setMeta.run("tracking_started_at", toIso(value));
    },
  };
}

module.exports = {
  DISCOVERY_EVENT_NAMES,
  PAGE_VIEW_EVENT,
  SERVER_EVENT_NAMES,
  createAnalyticsStore,
  isLikelyBot,
  normalizePagePath,
  normalizeSource,
};
