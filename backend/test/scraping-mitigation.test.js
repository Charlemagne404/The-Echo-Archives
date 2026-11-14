const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const Database = require("better-sqlite3");
const { findFreePort } = require("./helpers/free-port");
const { startCacheProxy } = require("./helpers/cache-proxy");
const { openDatabase } = require("../lib/store/database");
const { createAnalyticsStore } = require("../lib/store/analytics-store");

const projectRoot = path.resolve(__dirname, "..");
const siteRoot = path.resolve(projectRoot, "..");
const analyticsSecret = "test-analytics-mitigation-hmac-secret-2026";
let validateDiscoveryProps;

test.before(async () => {
  ({ validateDiscoveryProps } = await import("../../shared/app/discovery-analytics.js"));
});

function makeToken(prefix, value) {
  return `${prefix}-${String(value).padStart(24, "0")}`;
}

function makePageView({ id, showId, visitorId, sessionId, pagePath = `/shows/${showId}` }) {
  return {
    eventId: makeToken("event", id),
    eventName: "Page Viewed",
    pagePath,
    properties: { page_kind: "show", show_id: showId },
    visitorId: visitorId || makeToken("visitor", id),
    sessionId: sessionId || makeToken("session", id),
  };
}

async function startLocalServer({ tempDir, dbPath, envOverrides = {} }) {
  const port = await findFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server.js"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      SERVE_STATIC: "true",
      STATIC_ROOT: siteRoot,
      DB_PATH: dbPath,
      SITE_URL: baseUrl,
      NODE_ENV: "test",
      TRUST_PROXY: "loopback",
      OLLAMA_URL: "http://127.0.0.1:9/api/generate",
      ANALYTICS_HMAC_SECRET: analyticsSecret,
      ANALYTICS_INGEST_HARDENING_ENABLED: "true",
      ENABLE_TEST_ERROR_ROUTES: "true",
      ...envOverrides,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout.on("data", (chunk) => { logs += chunk.toString(); });
  child.stderr.on("data", (chunk) => { logs += chunk.toString(); });

  let ready = false;
  const startedAt = Date.now();
  while (!ready && Date.now() - startedAt < 45_000) {
    if (child.exitCode !== null) throw new Error(`Local application exited before readiness.\n${logs}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(1_000) });
      ready = response.ok;
    } catch (_error) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  if (!ready) {
    child.kill("SIGTERM");
    throw new Error(`Local application did not become ready.\n${logs}`);
  }
  return { process: child, baseUrl, logs: () => logs };
}

async function stopLocalServer(server) {
  if (!server?.process || server.process.exitCode !== null || server.process.signalCode !== null) return;
  server.process.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (server.process.exitCode === null) server.process.kill("SIGKILL");
      resolve();
    }, 5_000);
    server.process.once("exit", () => { clearTimeout(timer); resolve(); });
  });
}

async function postAnalytics(baseUrl, event, { ip = "127.0.0.1", userAgent = "Mozilla/5.0 Chrome/146.0.0.0 Safari/537.36" } = {}) {
  const response = await fetch(`${baseUrl}/api/analytics/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": ip,
      "X-Echo-Analytics-Visitor": event.visitorId,
      "X-Echo-Analytics-Session": event.sessionId,
      "X-Echo-Analytics-Path": event.pagePath,
      "X-Echo-Analytics-Source": "direct",
      "User-Agent": userAgent,
    },
    body: JSON.stringify({
      eventId: event.eventId,
      eventName: event.eventName,
      pagePath: event.pagePath,
      properties: event.properties,
      ...(event.occurredAt !== undefined ? { occurredAt: event.occurredAt } : {}),
    }),
  });
  await response.arrayBuffer();
  return response;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] || 0;
}

test("normal and suspected events remain eligible while high-confidence automation is excluded only from opt-in scoring", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "echo-analytics-eligibility-"));
  const dbPath = path.join(tempDir, "analytics.sqlite");
  const db = openDatabase(dbPath);
  try {
    const store = createAnalyticsStore({
      db,
      secret: analyticsSecret,
      validateClientEvent: validateDiscoveryProps,
      popularityEligibilityEnabled: true,
    });
    const at = new Date("2026-09-10T12:00:00.000Z");
    store.setTrackingStartedAt(at);
    const normalEvent = makePageView({ id: "normal", showId: "impact-winter" });
    const recordNormal = () => store.recordClassifiedClientEvent({
      ...normalEvent,
      occurredAt: at,
      trafficClass: "normal",
      reasonCodes: [],
      popularityEligible: true,
      policyVersion: "traffic-classification-test",
    });
    assert.equal(recordNormal().recorded, true);
    assert.equal(recordNormal().reason, "duplicate");

    const automatedEvent = makePageView({ id: "automated", showId: "impact-winter" });
    assert.equal(store.recordClassifiedClientEvent({
      ...automatedEvent,
      occurredAt: new Date(at.getTime() + 60_000),
      trafficClass: "high_confidence_automated",
      reasonCodes: ["rolling_minute_broad_catalogue_traversal"],
      popularityEligible: false,
      policyVersion: "traffic-classification-test",
    }).recorded, true);
    assert.equal(db.prepare("SELECT event_count FROM popularity_event_daily WHERE show_id = ? AND signal = 'show_page_view'").get("impact-winter").event_count, 2);
    assert.equal(db.prepare("SELECT event_count FROM popularity_event_raw_daily WHERE show_id = ? AND signal = 'show_page_view'").get("impact-winter").event_count, 2);
    assert.equal(db.prepare("SELECT event_count FROM popularity_event_eligible_daily WHERE show_id = ? AND signal = 'show_page_view'").get("impact-winter").event_count, 1);

    assert.equal(store.setEventEligibility({ eventId: normalEvent.eventId, eligible: false, reason: "reviewed test candidate", actor: "test-operator" }).updated, true);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM popularity_event_eligible_daily WHERE show_id = ? AND signal = 'show_page_view'").get("impact-winter").count, 0);
    assert.equal(store.setEventEligibility({ eventId: normalEvent.eventId, eligible: true, reason: "restored after review", actor: "test-operator" }).updated, true);
    assert.equal(db.prepare("SELECT event_count FROM popularity_event_eligible_daily WHERE show_id = ? AND signal = 'show_page_view'").get("impact-winter").event_count, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM analytics_event_eligibility_audit WHERE event_id = ?").get(normalEvent.eventId).count, 2);

    const listenEvent = {
      eventId: makeToken("event-listen", 1),
      eventName: "Listen Link Opened",
      pagePath: "/shows/impact-winter",
      visitorId: makeToken("visitor-listen", 1),
      sessionId: makeToken("session-listen", 1),
      properties: {
        show_id: "impact-winter",
        provider: "other",
        link_role: "primary",
        discovery_surface: "show_page_hero",
        content_profile: "unknown",
      },
    };
    assert.equal(store.recordClassifiedClientEvent({
      ...listenEvent,
      occurredAt: new Date(at.getTime() + 120_000),
      trafficClass: "suspected_automation",
      reasonCodes: ["automation_user_agent_signal"],
      popularityEligible: true,
      policyVersion: "traffic-classification-test",
    }).recorded, true);
    assert.equal(db.prepare("SELECT event_count FROM popularity_event_eligible_daily WHERE show_id = ? AND signal = 'listen_click'").get("impact-winter").event_count, 1);

    const noSignalEvent = {
      eventId: makeToken("event-search", 1),
      eventName: "Search Used",
      pagePath: "/",
      visitorId: makeToken("visitor-search", 1),
      sessionId: makeToken("session-search", 1),
      properties: {
        discovery_surface: "home_archive",
        query_kind: "text",
        structured_clause_group: "none",
        result_count_bucket: "2-4",
        active_filter_count_bucket: "0",
        recovery_context: "none",
      },
    };
    assert.equal(store.recordClassifiedClientEvent({
      ...noSignalEvent,
      occurredAt: new Date(at.getTime() + 180_000),
      trafficClass: "suspected_automation",
      reasonCodes: ["automation_user_agent_signal"],
      popularityEligible: true,
      policyVersion: "traffic-classification-test",
    }).recorded, true);
    const noSignalClassification = db.prepare(`
      SELECT popularity_eligible, popularity_signal, contribution_counted
      FROM analytics_event_classifications WHERE event_id = ?
    `).get(noSignalEvent.eventId);
    assert.deepEqual(noSignalClassification, {
      popularity_eligible: 1,
      popularity_signal: "",
      contribution_counted: 0,
    }, "eligible means allowed to contribute when a supported signal exists; it does not manufacture a contribution");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM analytics_events").get().count, 4);
    const diagnostics = store.getTrafficDiagnostics({ now: new Date(at.getTime() + 180_000) });
    assert.equal(diagnostics.rawEvents.pageViewsLast24Hours, 2);
    assert.equal(diagnostics.classifiedEvents.byClass.normal.pageViews, 1);
    assert.equal(diagnostics.classifiedEvents.byClass.high_confidence_automated.last24HoursPageViews, 1);
    assert.equal(diagnostics.classifiedEvents.byClass.suspected_automation.popularityEligibleEvents, 2);

    const currentStore = store.getPopularitySignals({ now: new Date("2026-09-10T12:10:00.000Z") });
    assert.equal(currentStore["impact-winter"].periods.days28.show_page_view, 1);
    assert.equal(currentStore["impact-winter"].periods.days28.listen_click, 1);
    const legacyStore = createAnalyticsStore({
      db,
      secret: analyticsSecret,
      validateClientEvent: validateDiscoveryProps,
      popularityEligibilityEnabled: false,
    });
    assert.equal(legacyStore.getPopularitySignals({ now: new Date("2026-09-10T12:10:00.000Z") })["impact-winter"].periods.days28.show_page_view, 2);
  } finally {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("legacy classification backfill requires an exact popularity replay and makes reviewed events reversible", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "echo-analytics-legacy-eligibility-"));
  const db = openDatabase(path.join(tempDir, "analytics.sqlite"));
  try {
    const store = createAnalyticsStore({
      db,
      secret: analyticsSecret,
      validateClientEvent: validateDiscoveryProps,
      popularityEligibilityEnabled: true,
    });
    const event = makePageView({ id: "legacy", showId: "impact-winter" });
    assert.equal(store.recordClientEvent({
      ...event,
      occurredAt: new Date("2026-09-10T12:00:00.000Z"),
    }).recorded, true);
    db.prepare("DELETE FROM analytics_event_classifications WHERE event_id = ?").run(event.eventId);

    const checkOnly = store.backfillLegacyEventClassifications();
    assert.equal(checkOnly.verified, true);
    assert.equal(checkOnly.classificationsWouldAdd, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM analytics_event_classifications WHERE event_id = ?").get(event.eventId).count, 0);
    const cliResult = spawnSync(process.execPath, [
      path.join(projectRoot, "scripts", "backfill-legacy-analytics-classifications.js"),
      "--db", path.join(tempDir, "analytics.sqlite"),
    ], {
      encoding: "utf8",
      env: { ...process.env, ANALYTICS_HMAC_SECRET: analyticsSecret },
      timeout: 30_000,
    });
    assert.equal(cliResult.status, 0, cliResult.stderr || cliResult.stdout);
    const cliReport = JSON.parse(cliResult.stdout);
    assert.equal(cliReport.mode, "check");
    assert.equal(cliReport.sourceReadOnly, true);
    assert.equal(cliReport.verified, true);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM analytics_event_classifications WHERE event_id = ?").get(event.eventId).count, 0);
    const backfill = store.backfillLegacyEventClassifications({ apply: true });
    assert.equal(backfill.updated, true);
    assert.equal(backfill.classificationsAdded, 1);
    assert.equal(backfill.replayedContributions, 1);
    assert.equal(db.prepare("SELECT traffic_class FROM analytics_event_classifications WHERE event_id = ?").get(event.eventId).traffic_class, "legacy_unclassified");
    assert.equal(store.setEventEligibility({
      eventId: event.eventId,
      eligible: false,
      reason: "confirmed historical crawler event in review fixture",
      actor: "test-reviewer",
    }).updated, true);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM popularity_event_eligible_daily WHERE show_id = ? AND signal = 'show_page_view'").get("impact-winter").count, 0);
    assert.equal(db.prepare("SELECT event_count FROM popularity_event_daily WHERE show_id = ? AND signal = 'show_page_view'").get("impact-winter").event_count, 1);
  } finally {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("historical counterfactual emits pending event-level records from a read-only database copy", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "echo-historical-counterfactual-"));
  const dbPath = path.join(tempDir, "fixture.sqlite");
  const outputPath = path.join(tempDir, "candidates.json");
  const db = openDatabase(dbPath);
  try {
    const store = createAnalyticsStore({
      db,
      secret: analyticsSecret,
      validateClientEvent: validateDiscoveryProps,
    });
    assert.equal(store.recordClientEvent({
      ...makePageView({ id: "counterfactual", showId: "impact-winter" }),
      occurredAt: new Date("2026-11-06T11:10:30.000Z"),
    }).recorded, true);
  } finally {
    db.close();
  }

  try {
    const script = path.join(projectRoot, "scripts", "historical-spike-counterfactual.js");
    const result = spawnSync(process.execPath, [
      script,
      "--db", dbPath,
      "--catalog", path.join(siteRoot, "data", "shows.json"),
      "--output", outputPath,
    ], { encoding: "utf8", timeout: 30_000 });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    assert.equal(report.rollupReplay.verified, true);
    assert.equal(report.totals.candidatePageViews, 1);
    assert.equal(report.totals.candidatePopularityContributions, 1);
    assert.equal(report.candidates[0].reviewStatus, "pending_review");
    assert.equal(report.methodology.rawAnalyticsEventsChanged, false);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("historical counterfactual requires explicit snapshot and output paths", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "echo-counterfactual-cli-"));
  const script = path.join(projectRoot, "scripts", "historical-spike-counterfactual.js");
  const missingSnapshotPath = path.join(tempDir, "missing-snapshot.sqlite");
  const existingOutputPath = path.join(tempDir, "preserved-output.json");
  const sentinel = Buffer.from("synthetic output fixture; never overwrite\n");
  fs.writeFileSync(existingOutputPath, sentinel);

  try {
    const cases = [
      { args: [], expected: "--db is required" },
      { args: ["--db", missingSnapshotPath], expected: "--output is required" },
      { args: ["--db", missingSnapshotPath, "--output", existingOutputPath], expected: "--output already exists" },
    ];
    for (const scenario of cases) {
      const result = spawnSync(process.execPath, [script, ...scenario.args], { encoding: "utf8" });
      assert.equal(result.status, 1);
      assert.match(result.stderr, new RegExp(scenario.expected));
    }
    assert.equal(fs.existsSync(missingSnapshotPath), false, "argument validation must happen before opening the snapshot");
    assert.deepEqual(fs.readFileSync(existingOutputPath), sentinel, "an existing output must remain untouched");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("analytics source request limits run before JSON parsing for malformed and oversized bodies", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "echo-analytics-preparse-limit-"));
  const dbPath = path.join(tempDir, "community.sqlite");
  let server;
  try {
    server = await startLocalServer({
      tempDir,
      dbPath,
      envOverrides: { ANALYTICS_SOURCE_REQUESTS_PER_MINUTE: "2" },
    });
    const malformed = await fetch(`${server.baseUrl}/api/analytics/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "198.51.100.44" },
      body: "{",
    });
    assert.equal(malformed.status, 400);
    await malformed.arrayBuffer();

    const afterMalformed = await fetch(`${server.baseUrl}/api/analytics/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "198.51.100.44" },
      body: JSON.stringify({
        eventId: makeToken("event", "preparse-limit-44"),
        eventName: "Page Viewed",
        pagePath: "/shows/impact-winter",
        properties: { page_kind: "show", show_id: "impact-winter" },
      }),
    });
    assert.equal(afterMalformed.status, 204, "one malformed body consumes one request token");
    await afterMalformed.arrayBuffer();

    const afterMalformedLimit = await fetch(`${server.baseUrl}/api/analytics/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "198.51.100.44" },
      body: JSON.stringify({
        eventId: makeToken("event", "preparse-limit-44-second"),
        eventName: "Page Viewed",
        pagePath: "/shows/impact-winter",
        properties: { page_kind: "show", show_id: "impact-winter" },
      }),
    });
    assert.equal(afterMalformedLimit.status, 429);
    assert.equal(afterMalformedLimit.headers.get("retry-after"), "60");
    await afterMalformedLimit.arrayBuffer();

    const oversized = await fetch(`${server.baseUrl}/api/analytics/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "198.51.100.45" },
      body: JSON.stringify({ payload: "x".repeat(30_000) }),
    });
    assert.equal(oversized.status, 413);
    await oversized.arrayBuffer();

    const afterOversized = await fetch(`${server.baseUrl}/api/analytics/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "198.51.100.45" },
      body: JSON.stringify({
        eventId: makeToken("event", "preparse-limit-45"),
        eventName: "Page Viewed",
        pagePath: "/shows/impact-winter",
        properties: { page_kind: "show", show_id: "impact-winter" },
      }),
    });
    assert.equal(afterOversized.status, 204, "one oversized body consumes one request token");
    await afterOversized.arrayBuffer();

    const afterOversizedLimit = await fetch(`${server.baseUrl}/api/analytics/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "198.51.100.45" },
      body: JSON.stringify({
        eventId: makeToken("event", "preparse-limit-45-second"),
        eventName: "Page Viewed",
        pagePath: "/shows/impact-winter",
        properties: { page_kind: "show", show_id: "impact-winter" },
      }),
    });
    assert.equal(afterOversizedLimit.status, 429);
    assert.equal(afterOversizedLimit.headers.get("retry-after"), "60");
    await afterOversizedLimit.arrayBuffer();
  } finally {
    await stopLocalServer(server);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("isolated crawl test covers shared caching, concurrent catalogue reads, and hardened analytics", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "echo-scraping-mitigation-"));
  const dbPath = path.join(tempDir, "community.sqlite");
  let server;
  let proxy;
  try {
    server = await startLocalServer({ tempDir, dbPath });
    proxy = await startCacheProxy(server.baseUrl);

    const showUrl = `${server.baseUrl}/shows/impact-winter`;
    const started = Date.now();
    const samePage = await Promise.all(Array.from({ length: 120 }, async () => {
      const requestStarted = Date.now();
      const response = await fetch(showUrl);
      const body = await response.arrayBuffer();
      return { status: response.status, bytes: body.byteLength, elapsedMs: Date.now() - requestStarted };
    }));
    assert.ok(samePage.every((item) => item.status === 200 && item.bytes > 10_000));
    const samePageElapsedMs = Date.now() - started;

    const firstShared = await fetch(`${proxy.url}/shows/impact-winter`);
    assert.equal(firstShared.status, 200);
    assert.equal(firstShared.headers.get("cf-cache-status"), "MISS");
    await firstShared.arrayBuffer();
    const secondShared = await fetch(`${proxy.url}/shows/impact-winter`);
    assert.equal(secondShared.headers.get("cf-cache-status"), "HIT");
    await secondShared.arrayBuffer();
    const credentialed = await fetch(`${proxy.url}/shows/impact-winter`, { headers: { Cookie: "viewer=example" } });
    assert.equal(credentialed.headers.get("cf-cache-status"), "BYPASS");
    await credentialed.arrayBuffer();
    const authorization = await fetch(`${proxy.url}/shows/impact-winter`, { headers: { Authorization: "Bearer test-token" } });
    assert.equal(authorization.headers.get("cf-cache-status"), "BYPASS");
    await authorization.arrayBuffer();
    const markdown = await fetch(`${proxy.url}/shows/impact-winter`, { headers: { Accept: "text/markdown" } });
    assert.equal(markdown.headers.get("cf-cache-status"), "DYNAMIC");
    assert.match(markdown.headers.get("content-type") || "", /text\/markdown/);
    await markdown.arrayBuffer();

    const shows = JSON.parse(fs.readFileSync(path.join(siteRoot, "data", "shows.json"), "utf8"));
    const traversalIds = [...new Set(shows.map((show) => String(show.id || "").toLowerCase()).filter(Boolean))].slice(0, 240);
    assert.ok(traversalIds.length >= 240, "fixture catalog must contain at least 240 published show routes for traversal coverage");
    proxy.purge();
    const traversalStart = Date.now();
    const originBeforeTraversal = proxy.originRequests();
    for (let offset = 0; offset < traversalIds.length; offset += 24) {
      const pageBatch = traversalIds.slice(offset, offset + 24);
      const responses = await Promise.all(pageBatch.map(async (showId) => {
        const response = await fetch(`${proxy.url}/shows/${encodeURIComponent(showId)}`);
        await response.arrayBuffer();
        return response;
      }));
      assert.ok(responses.every((response) => response.status === 200));
      assert.ok(responses.every((response) => response.headers.get("cf-cache-status") === "MISS"),
        JSON.stringify(responses.filter((response) => response.headers.get("cf-cache-status") !== "MISS").map((response) => ({ status: response.status, cache: response.headers.get("cf-cache-status"), control: response.headers.get("cdn-cache-control"), vary: response.headers.get("vary") }))));
    }
    const originAfterFirstTraversal = proxy.originRequests();
    const traversalOriginRequests = originAfterFirstTraversal - originBeforeTraversal;
    assert.equal(traversalOriginRequests, traversalIds.length);
    for (const showId of traversalIds) {
      const response = await fetch(`${proxy.url}/shows/${encodeURIComponent(showId)}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cf-cache-status"), "HIT");
      await response.arrayBuffer();
    }
    const traversalElapsedMs = Date.now() - traversalStart;
    assert.equal(proxy.originRequests(), originAfterFirstTraversal);

    const showsDataMiss = await fetch(`${proxy.url}/data/shows.json`);
    assert.equal(showsDataMiss.status, 200);
    assert.equal(showsDataMiss.headers.get("cf-cache-status"), "MISS");
    await showsDataMiss.arrayBuffer();
    const showsDataHit = await fetch(`${proxy.url}/data/shows.json`);
    assert.equal(showsDataHit.headers.get("cf-cache-status"), "HIT");
    await showsDataHit.arrayBuffer();

    const immutableAssetVersion = crypto.createHash("sha1")
      .update(fs.readFileSync(path.join(siteRoot, "style.css"))).digest("hex").slice(0, 10);
    const assetUrl = `${proxy.url}/style.css?v=${immutableAssetVersion}`;
    assert.equal((await fetch(assetUrl)).headers.get("cf-cache-status"), "MISS");
    assert.equal((await fetch(assetUrl)).headers.get("cf-cache-status"), "HIT");
    const socialUrl = `${proxy.url}/images/generated/social/default.png`;
    assert.equal((await fetch(socialUrl)).headers.get("cf-cache-status"), "MISS");
    assert.equal((await fetch(socialUrl)).headers.get("cf-cache-status"), "HIT");

    const showsById = new Map(shows.map((show) => [show.id, show]));
    const lowVolumeIds = traversalIds.slice(0, 4);
    const lowVisitor = makeToken("visitor-normal", 1);
    const lowSession = makeToken("session-normal", 1);
    for (let index = 0; index < lowVolumeIds.length; index += 1) {
      const showId = lowVolumeIds[index];
      assert.ok(showsById.has(showId));
      const event = makePageView({ id: `normal-${index}`, showId, visitorId: lowVisitor, sessionId: lowSession });
      assert.equal((await postAnalytics(server.baseUrl, event)).status, 204);
    }
    const duplicate = makePageView({ id: "normal-0", showId: lowVolumeIds[0], visitorId: lowVisitor, sessionId: lowSession });
    assert.equal((await postAnalytics(server.baseUrl, duplicate)).status, 204);
    const invalidEvent = makePageView({ id: "unsupported", showId: lowVolumeIds[0] });
    invalidEvent.eventName = "Unrecognized Event";
    assert.equal((await postAnalytics(server.baseUrl, invalidEvent)).status, 400);
    const forgedTimestamp = { ...makePageView({ id: "timestamp", showId: lowVolumeIds[0] }), occurredAt: "2020-01-01T00:00:00Z" };
    assert.equal((await postAnalytics(server.baseUrl, forgedTimestamp)).status, 400);

    const oversizedBatch = Array.from({ length: 101 }, (_, index) => ({
      eventId: makeToken("batch-event", index),
      eventName: "Page Viewed",
      properties: { page_kind: "show", show_id: lowVolumeIds[0] },
    }));
    const oversized = await fetch(`${server.baseUrl}/api/analytics/events/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "203.0.113.40" },
      body: JSON.stringify({ events: oversizedBatch }),
    });
    assert.equal(oversized.status, 413);
    await oversized.arrayBuffer();
    const bodyTooLarge = await fetch(`${server.baseUrl}/api/analytics/events/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "203.0.113.41" },
      body: JSON.stringify({ events: [], padding: "x".repeat(30_000) }),
    });
    assert.equal(bodyTooLarge.status, 413);
    await bodyTooLarge.arrayBuffer();

    const scrapeStarted = Date.now();
    for (let index = 0; index < 240; index += 1) {
      const showId = traversalIds[index % traversalIds.length];
      const event = makePageView({ id: `distributed-${index}`, showId });
      const sourceIp = `198.51.${100 + Math.floor(index / 254)}.${(index % 254) + 1}`;
      const response = await postAnalytics(server.baseUrl, event, { ip: sourceIp });
      assert.equal(response.status, 204, `distributed source event ${index}`);
    }
    const distributedScrapeElapsedMs = Date.now() - scrapeStarted;

    const googlebotEvent = makePageView({ id: "googlebot", showId: traversalIds.at(-1) });
    const googlebot = await postAnalytics(server.baseUrl, googlebotEvent, {
      ip: "192.0.2.80",
      userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    });
    assert.equal(googlebot.status, 204, "crawler-labeled page requests remain publicly available during an analytics sweep");

    await stopLocalServer(server);
    server = null;
    const readonlyDb = new Database(dbPath, { readonly: true, fileMustExist: true });
    readonlyDb.pragma("query_only = ON");
    try {
      const eventCount = readonlyDb.prepare("SELECT COUNT(*) AS count FROM analytics_events").get().count;
      assert.equal(eventCount, 245, "duplicate and rejected payloads must not create stored events");
      const classes = Object.fromEntries(readonlyDb.prepare("SELECT traffic_class, COUNT(*) AS count FROM analytics_event_classifications GROUP BY traffic_class").all().map((row) => [row.traffic_class, Number(row.count)]));
      assert.equal(classes.normal, 4);
      assert.equal(classes.high_confidence_automated, 241, "a crawler user-agent claim does not bypass independent global traversal evidence");
      assert.equal(classes.suspected_automation || 0, 0);
      const googlebotClassification = readonlyDb.prepare("SELECT traffic_class, reason_codes_json FROM analytics_event_classifications WHERE event_id = ?").get(googlebotEvent.eventId);
      assert.equal(googlebotClassification.traffic_class, "high_confidence_automated");
      assert.match(googlebotClassification.reason_codes_json, /global_broad_catalogue_traversal/);
      const legacyPageViews = readonlyDb.prepare("SELECT SUM(event_count) AS count FROM popularity_event_daily WHERE signal = 'show_page_view'").get().count;
      const rawPageViews = readonlyDb.prepare("SELECT SUM(event_count) AS count FROM popularity_event_raw_daily WHERE signal = 'show_page_view'").get().count;
      const eligiblePageViews = readonlyDb.prepare("SELECT SUM(event_count) AS count FROM popularity_event_eligible_daily WHERE signal = 'show_page_view'").get().count;
      assert.equal(Number(legacyPageViews), 245);
      assert.equal(Number(rawPageViews), 245);
      assert.equal(Number(eligiblePageViews), 4, "independent human multi-page browsing remains eligible; crawler views do not count as human popularity during a confirmed sweep");
    } finally {
      readonlyDb.close();
    }

    const result = {
      sameShowRequests: samePage.length,
      sameShowConcurrentLatencyMedianMs: median(samePage.map((item) => item.elapsedMs)),
      sameShowConcurrentElapsedMs: samePageElapsedMs,
      traversalShowPages: traversalIds.length,
      traversalElapsedMs: traversalElapsedMs,
      traversalOriginRequests,
      traversalSecondPassOriginRequests: 0,
      distributedAnalyticsEvents: 240,
      distributedAnalyticsElapsedMs: distributedScrapeElapsedMs,
    };
    process.stdout.write(`SCRAPING_MITIGATION_BENCHMARK ${JSON.stringify(result)}\n`);
  } finally {
    if (proxy) await proxy.close();
    if (server) await stopLocalServer(server);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
