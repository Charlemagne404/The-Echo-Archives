const crypto = require("node:crypto");

const POLICY_VERSION = "traffic-classification-v1";
const PAGE_VIEW_EVENT = "Page Viewed";
const SHOW_PAGE_KIND = "show";
const AUTOMATED_USER_AGENT_PATTERN = /bot|crawler|spider|slurp|headless|lighthouse|curl|wget|python(?:-requests)?|go-http-client|axios|node-fetch|postmanruntime|uptimerobot|pingdom|statuscake|betterstack|checkly|k6|prometheus|blackbox|datadog|newrelic|synthetic|monitor/i;
const MAX_TRACKED_SESSIONS_PER_SOURCE_MINUTE = 256;
const MAX_TRACKED_SHOWS_PER_SOURCE_MINUTE = 100;
const MAX_PROMOTABLE_EVENTS_PER_SOURCE_MINUTE = 300;

function normalizeIdentity(value) {
  const normalized = String(value || "").trim();
  return /^[A-Za-z0-9_-]{16,128}$/.test(normalized) ? normalized : "";
}

function hmac(secret, namespace, value) {
  return crypto.createHmac("sha256", secret).update(`${namespace}\n${value}`).digest("hex");
}

function createTokenBucket({ capacity, windowMs, now }) {
  return { tokens: capacity, updatedAt: now, capacity, refillPerMs: capacity / windowMs };
}

function refillTokenBucket(bucket, now) {
  const elapsed = Math.max(0, now - bucket.updatedAt);
  bucket.tokens = Math.min(bucket.capacity, bucket.tokens + elapsed * bucket.refillPerMs);
  bucket.updatedAt = now;
}

function canConsume(bucket, amount, now) {
  refillTokenBucket(bucket, now);
  return bucket.tokens + Number.EPSILON >= amount;
}

function consume(bucket, amount) {
  bucket.tokens = Math.max(0, bucket.tokens - amount);
}

function createWindow(now) {
  return {
    minute: Math.floor(now / 60_000),
    pageViews: 0,
    pageViewEventIds: new Set(),
    pageViewSessions: new Map(),
    showIds: new Set(),
    visitors: new Set(),
    sessionPageViews: new Map(),
    requestCount: 0,
    eventCount: 0,
  };
}

function ratioOfOnePageSessions(window) {
  if (!window.sessionPageViews.size) return 0;
  let onePageSessions = 0;
  for (const count of window.sessionPageViews.values()) {
    if (count === 1) onePageSessions += 1;
  }
  return onePageSessions / window.sessionPageViews.size;
}

function globalDecision(window) {
  const onePageRatio = ratioOfOnePageSessions(window);
  const broadTraversal = window.pageViews >= 75 && window.showIds.size >= 30 && window.sessionPageViews.size >= 50;
  const catalogueSweep = window.pageViews >= 240 && window.showIds.size >= 120 &&
    window.sessionPageViews.size >= 180 && onePageRatio >= 0.85;
  return {
    catalogueSweep,
    broadTraversal,
    onePageRatio,
  };
}

function sourceDecision(window) {
  const onePageRatio = ratioOfOnePageSessions(window);
  const catalogueSweep = window.pageViews >= 100 && window.showIds.size >= 50 &&
    window.sessionPageViews.size >= 80 && onePageRatio >= 0.9;
  const broadTraversal = window.pageViews >= 30 && window.showIds.size >= 20 &&
    window.sessionPageViews.size >= 20;
  return { catalogueSweep, broadTraversal, onePageRatio };
}

function createAnalyticsAbuseGuard({
  secret,
  now = () => Date.now(),
  sourceRequestsPerMinute = 600,
  sourceEventsPerMinute = 1200,
  globalEventsPerMinute = 6000,
  maxTrackedSources = 2_000,
} = {}) {
  const normalizedSecret = String(secret || "").trim();
  if (normalizedSecret.length < 32) throw new Error("Analytics abuse guard requires a 32-character HMAC secret.");
  for (const [name, value] of Object.entries({ sourceRequestsPerMinute, sourceEventsPerMinute, globalEventsPerMinute, maxTrackedSources })) {
    if (!Number.isSafeInteger(Number(value)) || Number(value) < 1) throw new Error(`Analytics abuse guard ${name} must be a positive integer.`);
  }

  const startedAt = new Date(now()).toISOString();
  const sources = new Map();
  const globalBuckets = new Map();
  const counters = {
    requests: 0,
    allowedRequests: 0,
    rejectedRequests: 0,
    rawEvents: 0,
    acceptedEvents: 0,
    rejectedEvents: 0,
    invalidRequests: 0,
    suspectedEvents: 0,
    highConfidenceEvents: 0,
    promotedEvents: 0,
  };

  function getMinuteWindow(map, key, timestamp) {
    const minute = Math.floor(timestamp / 60_000);
    let window = map.get(key);
    if (!window || window.minute !== minute) {
      window = createWindow(timestamp);
      map.set(key, window);
    }
    return window;
  }

  function getSource(address, timestamp) {
    const key = hmac(normalizedSecret, "analytics-source", String(address || "unknown"));
    let entry = sources.get(key);
    if (!entry) {
      if (sources.size >= Number(maxTrackedSources)) {
        const oldestKey = sources.keys().next().value;
        if (oldestKey) sources.delete(oldestKey);
      }
      entry = {
        requestBucket: createTokenBucket({ capacity: Number(sourceRequestsPerMinute), windowMs: 60_000, now: timestamp }),
        eventBucket: createTokenBucket({ capacity: Number(sourceEventsPerMinute), windowMs: 60_000, now: timestamp }),
        window: createWindow(timestamp),
      };
    }
    sources.delete(key);
    sources.set(key, entry);
    if (entry.window.minute !== Math.floor(timestamp / 60_000)) entry.window = createWindow(timestamp);
    return entry;
  }

  function getGlobalWindow(timestamp) {
    const minute = Math.floor(timestamp / 60_000);
    let window = globalBuckets.get(minute);
    if (!window) {
      window = createWindow(timestamp);
      globalBuckets.clear();
      globalBuckets.set(minute, window);
    }
    return window;
  }

  const globalEventBucket = createTokenBucket({
    capacity: Number(globalEventsPerMinute),
    windowMs: 60_000,
    now: now(),
  });

  function beginRequest(sourceAddress) {
    const timestamp = Number(now());
    const source = getSource(sourceAddress, timestamp);
    source.window.requestCount += 1;
    counters.requests += 1;
    if (!canConsume(source.requestBucket, 1, timestamp)) {
      counters.rejectedRequests += 1;
      return { allowed: false, retryAfterSeconds: 60 };
    }
    consume(source.requestBucket, 1);
    counters.allowedRequests += 1;
    return { allowed: true };
  }

  function noteInvalidRequest(eventCount = 0) {
    const count = Math.max(0, Math.min(100, Number(eventCount) || 0));
    counters.invalidRequests += 1;
    counters.rawEvents += count;
    counters.rejectedEvents += count;
  }

  function admitBatch(sourceAddress, eventCount) {
    const timestamp = Number(now());
    const count = Number(eventCount);
    if (!Number.isSafeInteger(count) || count < 1 || count > 100) {
      noteInvalidRequest(Number.isFinite(count) ? count : 0);
      return { allowed: false, retryAfterSeconds: 60, reason: "invalid_batch_size" };
    }
    const source = getSource(sourceAddress, timestamp);
    const global = getGlobalWindow(timestamp);
    counters.rawEvents += count;
    if (!canConsume(source.eventBucket, count, timestamp) || !canConsume(globalEventBucket, count, timestamp)) {
      counters.rejectedEvents += count;
      return { allowed: false, retryAfterSeconds: 60, reason: "ingestion_capacity" };
    }
    consume(source.eventBucket, count);
    consume(globalEventBucket, count);
    source.window.eventCount += count;
    global.eventCount += count;
    counters.acceptedEvents += count;
    return { allowed: true };
  }

  function observeBatch({ sourceAddress, events = [], visitorId = "", sessionId = "", userAgent = "" } = {}) {
    const timestamp = Number(now());
    const sourceKey = hmac(normalizedSecret, "analytics-source", String(sourceAddress || "unknown"));
    const source = getSource(sourceAddress, timestamp);
    const global = getGlobalWindow(timestamp);
    const visitor = normalizeIdentity(visitorId);
    const session = normalizeIdentity(sessionId);
    const visitorKey = visitor ? hmac(normalizedSecret, "analytics-visitor", visitor) : "";
    const sessionKey = session ? hmac(normalizedSecret, "analytics-session", `${visitor}\n${session}`) : "";
    const normalizedUserAgent = String(userAgent || "");
    // A user-agent can claim to be a search crawler but is not proof of crawler identity.
    // Treat bot labels as weak suspicion only; behavioral evidence still drives high confidence.
    const automatedUserAgent = AUTOMATED_USER_AGENT_PATTERN.test(normalizedUserAgent);
    const results = [];
    let globalPromote = Boolean(global.automatedCatalogueSweep);
    let sourcePromote = false;

    for (const event of events) {
      const pageView = event.eventName === PAGE_VIEW_EVENT;
      const showPage = pageView && event.properties?.page_kind === SHOW_PAGE_KIND && typeof event.properties?.show_id === "string";
      if (pageView) {
        global.pageViews += 1;
        source.window.pageViews += 1;
        if (visitorKey) {
          if (global.visitors.size < 3000) global.visitors.add(visitorKey);
          if (source.window.visitors.size < MAX_TRACKED_SESSIONS_PER_SOURCE_MINUTE) source.window.visitors.add(visitorKey);
        }
        if (sessionKey) {
          if (global.sessionPageViews.has(sessionKey) || global.sessionPageViews.size < 3000) {
            global.sessionPageViews.set(sessionKey, (global.sessionPageViews.get(sessionKey) || 0) + 1);
          }
          if (source.window.sessionPageViews.has(sessionKey) || source.window.sessionPageViews.size < MAX_TRACKED_SESSIONS_PER_SOURCE_MINUTE) {
            source.window.sessionPageViews.set(sessionKey, (source.window.sessionPageViews.get(sessionKey) || 0) + 1);
          }
        }
      }
      if (showPage) {
        if (global.showIds.size < 3000) global.showIds.add(event.properties.show_id);
        if (source.window.showIds.size < MAX_TRACKED_SHOWS_PER_SOURCE_MINUTE) source.window.showIds.add(event.properties.show_id);
        if (sessionKey && typeof event.eventId === "string") {
          if (global.pageViewEventIds.size < 3000) global.pageViewEventIds.add(event.eventId);
          if (source.window.pageViewEventIds.size < MAX_PROMOTABLE_EVENTS_PER_SOURCE_MINUTE) source.window.pageViewEventIds.add(event.eventId);
          if (global.pageViewSessions.size < 3000) global.pageViewSessions.set(event.eventId, sessionKey);
          if (source.window.pageViewSessions.size < MAX_PROMOTABLE_EVENTS_PER_SOURCE_MINUTE) source.window.pageViewSessions.set(event.eventId, sessionKey);
        }
      }

      const globalSignals = globalDecision(global);
      const sourceSignals = sourceDecision(source.window);
      globalPromote ||= globalSignals.catalogueSweep;
      sourcePromote ||= sourceSignals.catalogueSweep;
      const reasons = [];
      let trafficClass = "normal";
      if (pageView && sessionKey && global.sessionPageViews.get(sessionKey) === 1 &&
          (globalSignals.catalogueSweep || sourceSignals.catalogueSweep)) {
        trafficClass = "high_confidence_automated";
        if (globalSignals.catalogueSweep) reasons.push("global_broad_catalogue_traversal", "global_one_page_session_pattern");
        if (sourceSignals.catalogueSweep) reasons.push("source_broad_catalogue_traversal", "source_one_page_session_pattern");
      } else if (automatedUserAgent || globalSignals.broadTraversal) {
        trafficClass = "suspected_automation";
        if (automatedUserAgent) reasons.push("automation_user_agent_signal");
        if (globalSignals.broadTraversal) reasons.push("global_catalogue_traversal", "global_identifier_churn");
      } else if (sourceSignals.broadTraversal) {
        trafficClass = "suspected_automation";
        reasons.push("source_catalogue_traversal", "source_identifier_churn");
      }
      results.push({ trafficClass, reasonCodes: [...new Set(reasons)], eligible: trafficClass !== "high_confidence_automated" });
    }

    const currentGlobalWindow = getGlobalWindow(timestamp);
    if (globalPromote) {
      global.automatedCatalogueSweep = true;
      for (let index = 0; index < events.length; index += 1) {
        const event = events[index];
        const eventId = event.eventId;
        const eventSession = currentGlobalWindow.pageViewSessions.get(eventId);
        if (event.eventName !== PAGE_VIEW_EVENT || event.properties?.page_kind !== SHOW_PAGE_KIND ||
            !eventSession || currentGlobalWindow.sessionPageViews.get(eventSession) !== 1) continue;
        results[index] = {
          trafficClass: "high_confidence_automated",
          reasonCodes: ["global_broad_catalogue_traversal", "global_one_page_session_pattern"],
          eligible: false,
        };
      }
    }
    if (sourcePromote) {
      source.window.automatedCatalogueSweep = true;
      for (let index = 0; index < events.length; index += 1) {
        const event = events[index];
        const eventSession = source.window.pageViewSessions.get(event.eventId);
        if (event.eventName !== PAGE_VIEW_EVENT || event.properties?.page_kind !== SHOW_PAGE_KIND ||
            !eventSession || source.window.sessionPageViews.get(eventSession) !== 1 || results[index].trafficClass === "high_confidence_automated") continue;
        results[index] = {
          trafficClass: "high_confidence_automated",
          reasonCodes: ["source_broad_catalogue_traversal", "source_one_page_session_pattern"],
          eligible: false,
        };
      }
    }

    for (let index = 0; index < results.length; index += 1) {
      if (results[index].trafficClass !== "high_confidence_automated") continue;
      const sessionId = sessionKey;
      if (!sessionId || currentGlobalWindow.sessionPageViews.get(sessionId) !== 1) {
        results[index] = automatedUserAgent
          ? { trafficClass: "suspected_automation", reasonCodes: ["automation_user_agent_signal"], eligible: true }
          : { trafficClass: "normal", reasonCodes: ["multi_page_session_preserved"], eligible: true };
      }
    }
    const promoteEventIds = new Set(globalPromote
      ? [...currentGlobalWindow.pageViewEventIds].filter((eventId) => {
          const eventSession = currentGlobalWindow.pageViewSessions.get(eventId);
          return eventSession && currentGlobalWindow.sessionPageViews.get(eventSession) === 1;
        })
      : []);
    if (sourcePromote) {
      for (const eventId of source.window.pageViewEventIds) {
        const eventSession = source.window.pageViewSessions.get(eventId);
        if (eventSession && source.window.sessionPageViews.get(eventSession) === 1) promoteEventIds.add(eventId);
      }
    }
    for (const result of results) {
      if (result.trafficClass === "high_confidence_automated") counters.highConfidenceEvents += 1;
      else if (result.trafficClass === "suspected_automation") counters.suspectedEvents += 1;
    }
    counters.promotedEvents += promoteEventIds.size;
    return {
      classifications: results,
      promoteEventIds: [...promoteEventIds],
      sourceKey,
      signals: {
        automatedUserAgent,
        globalPageViews: global.pageViews,
        globalDistinctShows: global.showIds.size,
        globalDistinctSessions: global.sessionPageViews.size,
        globalOnePageSessionRatio: Math.round(globalDecision(global).onePageRatio * 1000) / 1000,
        sourcePageViews: source.window.pageViews,
        sourceDistinctShows: source.window.showIds.size,
      },
    };
  }

  function getSnapshot() {
    const timestamp = Number(now());
    const window = getGlobalWindow(timestamp);
    const decision = globalDecision(window);
    return {
      policyVersion: POLICY_VERSION,
      startedAt,
      retention: "process memory only; counters reset on restart",
      countsSinceStart: { ...counters },
      currentMinute: {
        requests: window.requestCount,
        acceptedEvents: window.eventCount,
        showPageViews: window.pageViews,
        distinctShowIds: window.showIds.size,
        distinctSessions: window.sessionPageViews.size,
        onePageSessionRatio: Math.round(decision.onePageRatio * 1000) / 1000,
        broadTraversal: decision.broadTraversal,
        highConfidenceCatalogueSweep: decision.catalogueSweep,
      },
      trackedSourceCount: sources.size,
      sourceAddressesStored: false,
      clientIdentifiersStored: false,
    };
  }

  return {
    admitBatch,
    beginRequest,
    getSnapshot,
    noteInvalidRequest,
    observeBatch,
    policyVersion: POLICY_VERSION,
  };
}

module.exports = {
  AUTOMATED_USER_AGENT_PATTERN,
  POLICY_VERSION,
  createAnalyticsAbuseGuard,
};
