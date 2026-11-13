# Staged deployment plan

No stage was deployed. All commands below are for a future operator after review and explicit release authorization. Current worktree changes are uncommitted, so first produce a reviewed exact commit and release artifact; do not deploy this working directory.

## Stage 1 — Code review and isolated release validation

**Files:** `backend/lib/config.js`, `backend/lib/analytics-abuse-guard.js`, `backend/lib/routes/maintainer-routes.js`, `backend/lib/store/analytics-store.js`, `backend/lib/store/database.js`, `backend/server.js`, `backend/package.json`, `backend/scripts/backfill-legacy-analytics-classifications.js`, `backend/scripts/historical-spike-counterfactual.js`, `backend/test/analytics-abuse-guard.test.js`, `backend/test/maintainer.test.js`, `backend/test/public-routes.test.js`, `backend/test/scraping-mitigation.test.js`, `backend/test/helpers/cache-proxy.js`, `shared/app/pages/maintainer-analytics.js`, and `site-src/pages/maintainer/analytics.html`. Review the ten mitigation documents and `historical-quarantine-candidates.json` separately. Confirm the candidate artifact is handled as restricted data (`0600`) and reviewed before any eligibility adjustment.

**Migrations:** additive tables and indexes in the existing `openDatabase` migration path. Review forward compatibility because application rollback does not downgrade SQLite schema.

**Environment:** no new variable is required while flags remain off. Verify the existing analytics HMAC secret is present without printing it.

**Commands:**

```bash
npm run build:catalog
npm run build:pages
npm run check:config
npm run test:tools
npm --prefix backend run test:serial
npm --prefix backend run test:smoke:required
```

The normal release command runs its own isolated build, data/config checks, tests, staging deployment and health/smoke checks. Do not skip the generated page build due to the interrupted build in this task.

**Health checks:** all tests green; generated build deterministic; stage exact artifact to private staging; `curl --fail http://127.0.0.1:3011/api/health`; `./deploy/echo smoke http://127.0.0.1:3011`; inspect anonymous/cookie/query/Markdown cache headers and `Set-Cookie`; inspect diagnostics. Verify origin 504 attribution instrumentation is available.

**Rollback:** no production mutation at this stage. Delete no data; retain the isolated worktree for review.

## Stage 2 — Low-risk origin/cache preparation

**Files:** `backend/server.js` (cache headers, public-file stat throttle, static route behavior) and the additive `backend/lib/store/database.js` migration. Deploy the same reviewed release with both feature flags off. Add Cloudflare Cache Rules only after staging confirms rule expressions, response headers and invalidation behavior. Cache rules are a separate dashboard change and are not authorized by this task.

**Migration:** additive startup migration creates the classification/eligibility tables and seeds the eligible rollup from existing daily popularity data. Verify staging backup, migration duration and legacy-vs-eligible aggregate equality first.

**Environment:** `ANALYTICS_INGEST_HARDENING_ENABLED=false`; `POPULARITY_EVENT_ELIGIBILITY_ENABLED=false`.

**Commands:** once a clean exact commit has been reviewed and pushed through the normal process, use `./deploy/echo staging <sha>`, tunnel to loopback 3011, run health and smoke, inspect response headers, then the separately approved promotion command `./deploy/echo promote`. Standard `./deploy/echo deploy <sha>` automatically promotes after its staging gates; use only after explicit approval.

**Health checks:** public homepage, show/creator/collection, browse/search/filter, cover/social images, popularity scores, health endpoint, `Cache-Control`/`CDN-Cache-Control`, cookie bypass, query bypass, Markdown bypass, authenticated maintainer and community/submission writes. Check Cloudflare `HIT` only after manual rules are separately enabled.

**Expected user effect:** public anonymous pages/assets become edge-cache eligible; browser behavior remains revalidated. No ranking, analytics classification or write behavior change.

**Rollback:** `./deploy/echo rollback <prior-sha>`; separately disable only the new Cloudflare rules. No database restore; additive tables remain.

## Stage 3 — Analytics hardening in monitor-first posture

**Files:** `backend/lib/config.js`, `backend/lib/analytics-abuse-guard.js`, `backend/server.js`, `backend/lib/store/analytics-store.js`, `backend/lib/store/database.js`, `backend/lib/routes/maintainer-routes.js`, `shared/app/pages/maintainer-analytics.js`, `site-src/pages/maintainer/analytics.html`, and the analytics/maintainer tests listed in Stage 1.

**Migration:** same additive migration; no raw event rewrite. Run legacy backfill `--check` against staging before any apply. Check mode creates a temporary consistent backup and does not mutate the input DB.

**Environment:** stable existing `ANALYTICS_HMAC_SECRET` (minimum 32 characters), plus:

```text
ANALYTICS_INGEST_HARDENING_ENABLED=true
ANALYTICS_SOURCE_REQUESTS_PER_MINUTE=600
ANALYTICS_SOURCE_EVENTS_PER_MINUTE=1200
ANALYTICS_GLOBAL_EVENTS_PER_MINUTE=3000
ANALYTICS_MAX_TRACKED_SOURCES=2000
POPULARITY_EVENT_ELIGIBILITY_ENABLED=false
```

**Health checks:** review validation rejection, 413/429/503, source/global counters, event class distributions, raw event counts, duplicate retry behavior, batch atomicity, one-page/high traversal classification, normal multi-show browsing, low-volume visitor, and independent listen/save/community events. Keep thresholds unchanged until staging data supports tuning.

**Commands:** deploy to private staging first. Use the protected staging environment's existing secret when invoking:

```bash
npm --prefix backend run backfill:analytics-eligibility -- --db /var/lib/echo-archives-staging/community.sqlite
```

Then apply only after an exact check result and staging approval:

```bash
npm --prefix backend run backfill:analytics-eligibility -- --db /var/lib/echo-archives-staging/community.sqlite --apply
```

Supply the existing secret through the protected operator environment without echoing it. Do not apply to production under this task's authorization.

**Expected user effect:** analytics calls with malformed, oversized or excessive payloads are rejected; browsing remains available. Some high-volume shared-source telemetry may be dropped; count and review it.

**Rollback:** switch `ANALYTICS_INGEST_HARDENING_ENABLED=false` and redeploy/rollback. Existing raw and classified rows remain; no data deletion.

## Stage 4 — Popularity eligibility after review

**Files:** the eligibility migration and methods in `backend/lib/store/database.js` and `backend/lib/store/analytics-store.js`, the authenticated review route in `backend/lib/routes/maintainer-routes.js`, the `POPULARITY_EVENT_ELIGIBILITY_ENABLED` flag in `backend/lib/config.js`, and the counterfactual/backfill scripts plus pending review artifact. `backend/lib/popularity.js` is unchanged.

**Migration:** run the check-only exact legacy backfill on staging and verify raw/legacy/eligible daily totals. Apply eligible classifications only after exact replay. Human-review each pending historical candidate before explicit quarantine.

**Environment:** `POPULARITY_EVENT_ELIGIBILITY_ENABLED=true` only after staging counterfactual review. Keep ingestion hardening on. The score formula remains unchanged; input eligibility changes only for reviewed/high-confidence events.

**Commands:** use maintainer-authenticated `POST /api/maintainer/analytics/event-eligibility` with event ID, `eligible:false`, high-confidence class and concise evidence/reason. Keep the returned audit record. Enable the popularity flag only after expected score/rank delta is reviewed against actual catalog signals.

**Health checks:** reproduce a before/after score report; confirm raw views unchanged; confirm eligibility daily counts; confirm listens, saves and community events unchanged; compare top rankings; inspect audit entries; verify setting an event back to eligible restores the eligibility aggregate.

**Expected user effect:** only suspicious/reviewed page-view contributions stop affecting human-oriented rankings; raw traffic reporting retains the views.

**Rollback:** set `POPULARITY_EVENT_ELIGIBILITY_ENABLED=false`, redeploy/restart through the release process, and optionally restore reviewed events to eligible with an audited maintainer request. The legacy scoring input immediately becomes active again; schema and raw events remain.
