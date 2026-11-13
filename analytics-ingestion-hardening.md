# Analytics ingestion hardening

## Behavior and rollout flag

Implemented in the isolated worktree behind `ANALYTICS_INGEST_HARDENING_ENABLED` (default `false`). With the flag off, legacy ingestion behavior remains active. When enabled, a per-source request token is consumed **before JSON parsing**, so malformed and oversized bodies cannot bypass request-rate limits. The JSON parser is capped at 24 KB, the batch endpoint accepts at most 100 events, and a request is rejected atomically if any event is invalid. Each event has an exact allowlist (`eventId`, `eventName`, `pagePath`, `properties`); names and property schemas use the application's existing discovery event validator. Client-supplied timestamps and unknown fields are rejected. Server receipt time is authoritative.

Event IDs are validated and used by the existing unique-event deduplication path, making repeated submissions idempotent. Dedup is at event ID, not visitor/session ID. The guard does not treat a client-generated visitor or session token as proof of a human.

## Limits

Defaults, all configurable and validated as positive integers:

| Setting | Default | Scope |
|---|---:|---|
| `ANALYTICS_SOURCE_REQUESTS_PER_MINUTE` | 600 | Per HMAC-hashed request source |
| `ANALYTICS_SOURCE_EVENTS_PER_MINUTE` | 1,200 | Per HMAC-hashed request source |
| `ANALYTICS_GLOBAL_EVENTS_PER_MINUTE` | 3,000 | Whole Node process/application |
| `ANALYTICS_MAX_TRACKED_SOURCES` | 2,000 | Bounded in-memory source map |

Rejected over-limit requests receive 429 with `Retry-After`; oversized JSON gets 413. Database errors receive 503. Each batch is written under one SQLite transaction. Guard counters are process-local and reset on restart; they are not a distributed rate limiter. HMAC secret is required (minimum 32 characters) when hardening is enabled. Source addresses are not persisted by this guard; only an HMAC-derived bounded key is held in memory.

## Classification and stored data

Each accepted event receives one of `normal`, `suspected_automation`, or `high_confidence_automated`, policy version and reason codes. Raw `analytics_events` remain the source of truth. Classifications are stored separately in `analytics_event_classifications`; eligibility adjustments have an audit record and separate `popularity_event_eligible_daily` rollup. Raw analytics and the legacy popularity rollup are not deleted or rewritten.

User-agent labels are weak evidence, never proof that a crawler is verified. A low-volume Googlebot-like request remains eligible as suspected traffic. During a multi-signal broad sweep, one-page show views can be excluded from popularity regardless of the claimed user agent; this does not block or challenge catalogue requests or affect search indexing.

Maintainer diagnostics expose raw event/page-view counts, class-specific counts, eligibility counts, guard state and approximate browser/session identifiers. Browser IDs/sessions are not labeled verified unique humans. Passive show-card impressions are excluded from meaningful engagement. `Page Viewed` remains a valid popularity signal unless its event is specifically classified or reviewed as ineligible.

## Backfill and operator review

Run the backfill command in check mode first. It takes a consistent SQLite online backup, replays the existing page-view popularity rollup and refuses apply if any aggregate differs. It requires the existing stable `ANALYTICS_HMAC_SECRET`; do not rotate it as part of this change. Apply mode is explicit and should target staging first. The five historical windows are separately emitted as pending event IDs with no raw visitor/session/source identifiers; they need individual maintainer review before eligibility changes.

## Failure and privacy notes

- New writes are atomic per batch; duplicate IDs remain idempotent.
- Invalid batches do not partially enter the raw event table.
- The global cap bounds accepted write volume but can reject a real site-wide burst; monitor 429s and classification counts before tightening it.
- Per-IP/source limits can affect shared NAT users; thresholds are deliberately much higher than normal per-person behavior. The global cap handles identifier/source rotation.
- Limits are per process. If the app is later run with multiple workers, coordinate a shared bounded counter before relying on the per-source/global totals across all workers.
- A distributed crawl that stays below the per-minute breadth thresholds can remain unclassified; the event cap still bounds writes but is not a complete crawl detector.
- Do not infer automation solely from low engagement, browser ID churn, one-page sessions, UA, or referrer.
