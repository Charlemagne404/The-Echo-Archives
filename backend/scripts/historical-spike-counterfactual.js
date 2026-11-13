#!/usr/bin/env node

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");
const { openDatabase } = require("../lib/store/database");
const { createAnalyticsStore, getPopularityContribution } = require("../lib/store/analytics-store");
const { scoreCatalogPopularity } = require("../lib/popularity");

const ROOT = path.resolve(__dirname, "../..");
const WINDOWS = Object.freeze([
  { id: "2026-11-06-main-burst", start: "2026-11-06T11:10:00.000Z", end: "2026-11-06T11:12:00.000Z", confidence: "high" },
  { id: "2026-11-07-three-hour-incident-observed-minute", start: "2026-11-07T11:11:00.000Z", end: "2026-11-07T11:13:00.000Z", confidence: "lower" },
  { id: "2026-11-09-main-burst", start: "2026-11-09T10:41:00.000Z", end: "2026-11-09T10:43:00.000Z", confidence: "high" },
  { id: "2026-11-10-main-burst", start: "2026-11-10T10:28:00.000Z", end: "2026-11-10T10:30:00.000Z", confidence: "high" },
  { id: "2026-11-11-main-burst", start: "2026-11-11T10:32:00.000Z", end: "2026-11-11T10:34:00.000Z", confidence: "high" },
]);
const OFFLINE_SECRET = "offline-counterfactual-do-not-use-for-analytics-hashing";

function parseArgs(argv) {
  const options = {
    db: "",
    catalog: path.join(ROOT, "data", "shows.json"),
    output: "",
    asOf: "2026-11-11T23:59:59.999Z",
  };
  for (let index = 2; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!["--db", "--catalog", "--output", "--as-of"].includes(key) || !value) {
      throw new Error("Usage: node scripts/historical-spike-counterfactual.js --db ISOLATED_SNAPSHOT --output NEW_PATH [--catalog PATH] [--as-of ISO]");
    }
    options[{ "--db": "db", "--catalog": "catalog", "--output": "output", "--as-of": "asOf" }[key]] = value;
    index += 1;
  }
  if (!options.db) throw new Error("--db is required; pass an isolated, consistent SQLite snapshot.");
  if (!options.output) throw new Error("--output is required; choose a new path so the preserved candidate report is not overwritten.");
  options.db = path.resolve(options.db);
  options.catalog = path.resolve(options.catalog);
  options.output = path.resolve(options.output);
  if (fs.existsSync(options.output)) throw new Error("--output already exists; choose a new path so existing review evidence is preserved.");
  const asOf = new Date(options.asOf);
  if (!Number.isFinite(asOf.getTime())) throw new Error("--as-of must be a valid ISO date.");
  options.asOf = asOf;
  return options;
}

function safeProperties(value) {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (_error) {
    return {};
  }
}

function rankingDelta(before, after, affectedShowIds) {
  return affectedShowIds.map((showId) => ({
    showId,
    currentScore: before.diagnostics[showId]?.score ?? null,
    counterfactualScore: after.diagnostics[showId]?.score ?? null,
    scoreDelta: before.diagnostics[showId] && after.diagnostics[showId]
      ? Number((before.diagnostics[showId].score - after.diagnostics[showId].score).toFixed(6))
      : null,
    currentRank: before.diagnostics[showId]?.rank ?? null,
    counterfactualRank: after.diagnostics[showId]?.rank ?? null,
    rankDelta: before.diagnostics[showId] && after.diagnostics[showId]
      ? after.diagnostics[showId].rank - before.diagnostics[showId].rank
      : null,
  })).sort((left, right) => Math.abs(right.rankDelta || 0) - Math.abs(left.rankDelta || 0) || left.showId.localeCompare(right.showId));
}

async function main() {
  const options = parseArgs(process.argv);
  const source = new Database(options.db, { readonly: true, fileMustExist: true });
  source.pragma("query_only = ON");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "echo-popularity-counterfactual-"));
  const snapshotPath = path.join(tempDir, "analytics-snapshot.sqlite");
  let snapshot;
  try {
    await source.backup(snapshotPath);
    const candidateRows = [];
    const findWindow = source.prepare(`
      SELECT event_id, event_name, occurred_at, page_path, show_id, properties_json, visitor_key, session_key
      FROM analytics_events
      WHERE event_name = 'Page Viewed' AND occurred_at >= ? AND occurred_at < ?
      ORDER BY occurred_at ASC, id ASC
    `);
    for (const window of WINDOWS) {
      for (const row of findWindow.iterate(window.start, window.end)) {
        const properties = safeProperties(row.properties_json);
        const showId = String(row.show_id || properties.show_id || "");
        candidateRows.push({
          eventId: row.event_id,
          occurredAt: row.occurred_at,
          pagePath: row.page_path,
          showId,
          windowId: window.id,
          evidenceConfidence: window.confidence,
          popularityContributionCounted: false,
          reviewStatus: "pending_review",
          proposedAction: "review_before_quarantine",
          reasonCode: "incident_window_correlation_without_request_level_join",
        });
      }
    }
    source.close();

    snapshot = openDatabase(snapshotPath);
    const store = createAnalyticsStore({
      db: snapshot,
      secret: OFFLINE_SECRET,
      retentionDays: 400,
      popularityEligibilityEnabled: false,
    });

    const candidateIds = new Set(candidateRows.map((row) => row.eventId));
    const contributionsByEventId = new Set();
    const lastContributedAt = new Map();
    const cooldownIsReady = snapshot.prepare(`
      SELECT CASE WHEN julianday(?) - julianday(?) >= ? / 86400.0 THEN 1 ELSE 0 END AS ready
    `);
    const pageViewRows = snapshot.prepare(`
      SELECT event_id, event_name, occurred_at, visitor_key, session_key, show_id, properties_json
      FROM analytics_events
      WHERE event_name = 'Page Viewed' AND show_id <> ''
      ORDER BY occurred_at ASC, id ASC
    `);
    for (const row of pageViewRows.iterate()) {
      const properties = safeProperties(row.properties_json);
      const contribution = getPopularityContribution(row.event_name, properties);
      if (!contribution?.signal || !contribution.limitGroup) continue;
      const showId = String(row.show_id || "");
      const identity = row.visitor_key || row.session_key || "anonymous";
      const key = `${identity}\n${showId}\n${contribution.limitGroup}`;
      const previousAt = lastContributedAt.get(key);
      const counted = !previousAt || Number(cooldownIsReady.get(row.occurred_at, previousAt, contribution.cooldownSeconds)?.ready) === 1;
      if (!counted) continue;
      lastContributedAt.set(key, row.occurred_at);
      if (candidateIds.has(row.event_id)) contributionsByEventId.add(row.event_id);
    }

    for (const candidate of candidateRows) {
      candidate.popularityContributionCounted = contributionsByEventId.has(candidate.eventId);
      if (!candidate.showId) candidate.reasonCode = "page_view_without_show_popularity_signal";
    }

    const candidateDays = [...new Set(candidateRows.map((row) => row.occurredAt.slice(0, 10)))];
    const expectedRollups = new Map();
    const candidateDaySet = new Set(candidateDays);
    const replayCandidates = snapshot.prepare(`
      SELECT event_name, occurred_at, visitor_key, session_key, show_id, properties_json
      FROM analytics_events
      WHERE event_name = 'Page Viewed' AND show_id <> ''
      ORDER BY occurred_at ASC, id ASC
    `);
    const replayLastAt = new Map();
    for (const row of replayCandidates.iterate()) {
      const properties = safeProperties(row.properties_json);
      const contribution = getPopularityContribution(row.event_name, properties);
      if (!contribution?.signal || !contribution.limitGroup) continue;
      const showId = String(row.show_id || "");
      const eventDay = row.occurred_at.slice(0, 10);
      const identity = row.visitor_key || row.session_key || "anonymous";
      const key = `${identity}\n${showId}\n${contribution.limitGroup}`;
      const previousAt = replayLastAt.get(key);
      const counted = !previousAt || Number(cooldownIsReady.get(row.occurred_at, previousAt, contribution.cooldownSeconds)?.ready) === 1;
      if (!counted) continue;
      replayLastAt.set(key, row.occurred_at);
      if (!candidateDaySet.has(eventDay)) continue;
      const rollupKey = `${eventDay}\n${showId}\n${contribution.signal}`;
      expectedRollups.set(rollupKey, (expectedRollups.get(rollupKey) || 0) + 1);
    }
    const actualRollups = new Map();
    for (const day of candidateDays) {
      for (const row of snapshot.prepare(`
        SELECT show_id, signal, event_count FROM popularity_event_daily
        WHERE event_day = ? AND signal = 'show_page_view'
      `).all(day)) {
        actualRollups.set(`${day}\n${row.show_id}\n${row.signal}`, Number(row.event_count || 0));
      }
    }
    const allRollupKeys = new Set([...expectedRollups.keys(), ...actualRollups.keys()]);
    const rollupMismatches = [];
    for (const key of allRollupKeys) {
      const expected = expectedRollups.get(key) || 0;
      const actual = actualRollups.get(key) || 0;
      if (expected !== actual) rollupMismatches.push({ key: key.replaceAll("\n", "/"), expected, actual });
    }
    const rollupReplayVerified = rollupMismatches.length === 0;

    const catalog = JSON.parse(fs.readFileSync(options.catalog, "utf8"));
    const beforeSignals = store.getPopularitySignals({ now: options.asOf });
    const afterSignals = structuredClone(beforeSignals);
    const contributionCountByShow = new Map();
    for (const candidate of candidateRows) {
      if (!candidate.showId || !candidate.popularityContributionCounted) continue;
      contributionCountByShow.set(candidate.showId, (contributionCountByShow.get(candidate.showId) || 0) + 1);
      const signals = afterSignals[candidate.showId];
      if (!signals) continue;
      for (const period of ["lifetime", "days90", "days28"]) {
        const counts = signals.periods?.[period];
        if (counts && Number(counts.show_page_view || 0) > 0) counts.show_page_view -= 1;
      }
    }
    const before = scoreCatalogPopularity(catalog, beforeSignals, options.asOf);
    const after = scoreCatalogPopularity(catalog, afterSignals, options.asOf);
    const affectedShowIds = [...contributionCountByShow.keys()];
    const rankingChanges = rankingDelta(before, after, affectedShowIds);
    const topMembershipChanges = {
      currentTop25: catalog.filter((show) => before.diagnostics[show.id]?.rank <= 25).map((show) => show.id),
      counterfactualTop25: catalog.filter((show) => after.diagnostics[show.id]?.rank <= 25).map((show) => show.id),
    };
    topMembershipChanges.entered = topMembershipChanges.counterfactualTop25.filter((id) => !topMembershipChanges.currentTop25.includes(id));
    topMembershipChanges.left = topMembershipChanges.currentTop25.filter((id) => !topMembershipChanges.counterfactualTop25.includes(id));

    const byWindow = WINDOWS.map((window) => {
      const rows = candidateRows.filter((row) => row.windowId === window.id);
      return {
        ...window,
        pageViews: rows.length,
        showPageViews: rows.filter((row) => row.showId).length,
        popularityContributions: rows.filter((row) => row.popularityContributionCounted).length,
        distinctShows: new Set(rows.map((row) => row.showId).filter(Boolean)).size,
      };
    });

    const byShow = [...contributionCountByShow.entries()].map(([showId, count]) => ({ showId, candidateContributions: count }))
      .sort((left, right) => right.candidateContributions - left.candidateContributions || left.showId.localeCompare(right.showId));
    const result = {
      generatedAt: new Date().toISOString(),
      source: { mode: "read-only-consistent-sqlite-backup", database: options.db },
      asOf: options.asOf.toISOString(),
      scoringModelVersion: before.modelVersion,
      methodology: {
        candidateWindowsAreFixedReviewWindows: true,
        popularityInputsAreReplayedAgainstTheExistingShowPageViewDailyRollup: rollupReplayVerified,
        requestLevelCloudflareJoinAvailable: false,
        rawAnalyticsEventsChanged: false,
        popularityFormulaChanged: false,
        candidateEventsRemainPendingUntilHumanReview: true,
      },
      rollupReplay: { verified: rollupReplayVerified, mismatches: rollupMismatches.slice(0, 20) },
      totals: {
        candidatePageViews: candidateRows.length,
        candidateShowPageViews: candidateRows.filter((row) => row.showId).length,
        candidatePopularityContributions: contributionsByEventId.size,
        affectedShows: affectedShowIds.length,
        affectedShowsWithScoreChange: rankingChanges.filter((row) => row.scoreDelta !== 0).length,
        affectedShowsWithRankChange: rankingChanges.filter((row) => row.rankDelta !== 0).length,
      },
      windows: byWindow,
      top25Membership: topMembershipChanges,
      affectedShows: rankingChanges,
      contributionsByShow: byShow,
      candidates: candidateRows,
    };
    fs.writeFileSync(options.output, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    process.stdout.write(`${JSON.stringify({ output: options.output, totals: result.totals, rollupReplayVerified, windows: byWindow })}\n`);
  } finally {
    try { source.close(); } catch (_error) { /* already closed */ }
    try { snapshot?.close(); } catch (_error) { /* close after error if opened */ }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
