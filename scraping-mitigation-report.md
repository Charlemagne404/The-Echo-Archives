# Emergency scraping mitigation report

## Scope and execution boundary

Prepared in an isolated worktree at `/tmp/echo-archives-scraping-mitigation-20261111`, based on the production release `cb6af6ae6c7a28fe5bfd272992588cda9cb5274a`. The original dirty checkout was not modified. No production data, service, proxy, firewall, Cloudflare setting, DNS record, release pointer, or popularity score was changed. No changes were committed or pushed. Popularity V2.1.2 remains separate.

## Implemented

- Added conservative origin cache headers for versioned immutable assets, generated images, anonymous queryless public HTML, public JSON, and the public popularity score endpoint. Authentication, cookies, query-bearing HTML, Markdown negotiation, and non-public pages bypass shared HTML caching.
- Reduced repeated public-data file-stat work to at most once per second per process.
- Added optional strict analytics ingestion: bounded body and event batches, event/property allowlists, server receipt timestamps, stable event-ID deduplication, per-source request/event limits, an application-wide event cap, and explainable traffic classes.
- Preserved raw analytics and the existing `popularity_event_daily` rollup. Added a separate eligibility ledger, reversible eligibility rollup, and an audit table/API. The existing scoring formula is unchanged; the eligibility input flag defaults off.
- Added a read-only historical counterfactual report and a check-only-first legacy classification/backfill command. Historical candidate rows are pending human review, not automatically quarantined.
- Added isolated crawl, cache proxy, classification, replay, and reversible quarantine tests.

## Evidence and unresolved production cause

Cloudflare's supplied November 11 counters reconcile to 110,616 classified requests, 2,641 fewer than the stated 113,257 incident total. DYNAMIC + MISS is 17,000 viewer requests that required origin fetches. UPDATING (2,085) is a stale viewer response while background revalidation occurs; it is not 2,085 distinct origin fetches. The 8,261 blank-status rows and the unclassified remainder are unresolved, so the earlier approximate 27,000 origin-reaching/origin-checking estimate is not a measured fetch count.

The measured 42,182 weekly 504s (including 5,646 on November 11) are not attributed to a component by the available evidence. Caddy has no Echo access log in the inspected configuration. Available journal evidence shows 273 Caddy 502 connection-refused responses on November 8, a separate app-availability symptom; it does not identify the November 11 504 generator. No historical CPU or database latency series was available. The app source traces each show HTML request to four synchronous review/score reads; this does not establish that SQLite was the cause of the observed 504s.

The supplied dashboard shows 5,461 visitors, 5,470 sessions, 5,477 views, 74 engaged sessions, two show opens and two listening clicks over a rolling seven-day window. A separate read-only production DB snapshot near the investigation cutoff contained 6,973 raw events, 5,480 page views, 5,464 distinct browser pseudonyms, 5,473 sessions, two show opens, two listens and 1,476 passive impressions. These are rolling/reporting snapshots, not independent weekly totals; browser pseudonyms and sessions are not verified humans. The numbers show a severe measurement-quality gap, but low engagement by itself is not automation evidence.

See [origin-performance-audit.md](origin-performance-audit.md) for source/host limits and the origin restriction proposal.

## Historical popularity counterfactual

Five supplied incident windows contain 4,017 raw page-view events, 1,891 show-page views and 1,891 contributions to the existing page-view popularity input. Exact replay matched the corresponding existing rollup for every window. These are event-level review candidates correlated by time only; request-level Cloudflare joins, source addresses, and crawler identity were unavailable. Nothing was deleted or modified.

Removing only those candidate show-page contributions in a reproducible copy changed 247 show scores and 246 ranks. Desert Skies and Paralyzed left the current top 25; The Silt Verses and The Magnus Protocol entered. This is a counterfactual, not a production ranking change. Raw page-view reporting and independent listening/community signals remain available.

See [popularity-contamination-report.md](popularity-contamination-report.md) and `historical-quarantine-candidates.json`.

The final validation pass confirmed that the preserved artifact has mode `0600`, zero recorded rollup mismatches, correct half-open window timestamps, and all candidates remain `pending_review`. The underlying Nov 6–11 SQLite snapshot was not present locally for a fresh rerun, so no new historical eligibility decision was made. A full isolated replay is required before Stage 4 or any historical quarantine.

## Deployment status

Prepared only. Deployment is explicitly out of scope. The previously interrupted page build has now completed under bounded resources, generated aliases and integrity checks pass, and the full verification status is in [test-report.md](test-report.md). Review [staging-readiness.md](staging-readiness.md) and [staging-deployment-runbook.md](staging-deployment-runbook.md) before a separately authorized staging deployment. The source changes remain uncommitted in this worktree.
