# Analytics protection validation

## Validation result

The ingestion hardening is opt-in and validated in local servers with temporary SQLite databases. Strict mode validates before writing, uses server receipt time, bounds request and event volume, and preserves raw events. Classification is explainable and affects popularity eligibility only; it never blocks catalogue requests.

## Request handling

| Check | Result |
|---|---|
| Valid single event and event batch | Accepted and stored transactionally |
| Unsupported event name, malformed schema, unknown field, forged client timestamp | Rejected; no partial batch write |
| Body larger than 24 KB | `413`; source request token was already consumed before JSON parsing |
| More than 100 events in a batch | `413`; batch is not partially written |
| Duplicate event ID/retry | Idempotent; only one raw event and one contribution |
| Receipt time | Server time is authoritative; arbitrary client event time is rejected |
| Source request/event and global event limits | Bounded token buckets; rejected calls receive `429` and `Retry-After` |
| Database write failure | Bounded `503`; public catalogue/static reads remain available in failure tests |

The public impression client batches at most 50 events. The endpoint ceiling is 100 so ordinary use has room for other event types. Default controls are 600 requests/minute and 1,200 events/minute per source, 3,000 events/minute per Node process, and 2,000 tracked source keys. The source key is HMAC-derived and memory-only; raw source addresses are not persisted by the guard.

## Legitimate traffic simulations

- A low-volume visitor browsed four shows in one session; all page views remained eligible.
- Twelve visitors shared one public address and each browsed four shows; all 48 page views remained normal and eligible.
- Low-volume Googlebot-like user-agent traffic was labeled `suspected_automation` from the UA signal alone but remained eligible.
- A crawler-labeled request during a confirmed distributed sweep was accepted with `204`; its page view was classified from the combined catalogue/session pattern, not the user-agent string. No request was blocked, challenged, or made unavailable to the crawler.
- Independent listening, saves, ratings, and community contributions remain separate event types and are not changed when a show page view is excluded.

## Automated traffic simulations

- A distributed 240-event catalogue sweep across many source addresses, show IDs, and one-page sessions crossed the explicit global breadth threshold and classified the implicated page views high confidence.
- Rotating client visitor/session identifiers did not bypass the global event-volume limit or broad traversal signal.
- A Googlebot-like string did not bypass high-confidence behavior classification; UA-only evidence remains weak and eligible.
- Repeated submissions were deduplicated by event ID. Oversized batches and malformed/oversized bodies were rejected and counted against the request limit before parsing.
- A 120-event crawl spread at 40 events/minute across three rolling minutes did not cross the broad-traversal thresholds and remained undetected. The global/per-source caps still bound writes, but they are not a complete low-rate crawl detector.

## Classification and reporting

| Class | Eligibility behavior |
|---|---|
| `normal` | Eligible by default |
| `suspected_automation` | Stored with policy and reason codes; remains eligible |
| `high_confidence_automated` | Only implicated show-page views start ineligible; raw events and independent action events remain intact |

The high-confidence decision combines broad traversal with a large one-page-session pattern in a rolling minute. It does not rely solely on volume, UA, engagement, or identifier churn. The application has no trusted verified-bot metadata, so a user-agent claim is never treated as verified identity. Public pages remain indexable and available.

Internal maintainer diagnostics separate raw requests, raw events, class counts, eligible page views, and guard counters. Passive card impressions are reported separately and do not count as meaningful engagement. Browser IDs and sessions are anonymous pseudonyms, not verified unique humans.

## Limits and staging observation

- A real person can generate a one-page session while an unrelated broad scrape is active. The aggregate classifier cannot prove that individual is automated; its decision affects only that page-view popularity input and can be reversed with an audit record. Keep `POPULARITY_EVENT_ELIGIBILITY_ENABLED=false` through initial analytics observation.
- Sustained traffic below the rolling breadth thresholds can remain `normal`; per-process event caps bound writes but do not identify every scraper.
- Source thresholds can group visitors behind NAT. The shared-network fixture stayed normal at ordinary volumes; monitor source rejections before changing limits.
- Counters reset on process restart and are local to a Node process. A future multi-worker deployment needs shared bounded counters before relying on global/source limits across workers.
- Cloudflare per-IP limits remain supplemental and cannot stop a distributed crawl. Bot Fight Mode is not part of the release; challenges can break analytics POSTs.

## Tests

The final mitigation suite includes shared-network visitors, low-rate distributed traffic, UA spoofing, batch/body rejection, idempotency, reversible eligibility, and isolated local load fixtures. The full browser suite exercises analytics collection in actual Chromium; see [test-report.md](test-report.md) after final repository verification.
