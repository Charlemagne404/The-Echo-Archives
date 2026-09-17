# First-party analytics

The Echo Archives uses a small first-party event collector for the private maintainer dashboard at `/maintainer/analytics.html`. The dashboard data is available only through an active passphrase-protected maintainer session, and the maintainer page itself is excluded from browser analytics collection. It is intentionally separate from access logging: the dashboard measures public pages and meaningful archive actions, not every HTTP request.

## What is collected

Public pages can send these events to `POST /api/analytics/events`:

- `Page Viewed`
- `Search Used`
- `Filter Changed`
- `Filters Cleared`
- `Collection Opened`
- `Entity Opened`
- `Show Opened`
- `Listen Link Opened`

Successful server-side actions add:

- `Rating Submitted`
- `Rating Removed`
- `Helpful Vote`
- `Helpful Vote Removed`
- `Catalogue Submission`

Event properties remain allow-listed. They contain controlled page kinds, route-safe show/collection/entity ids, controlled discovery classifications, submission type, and coarse source information. Search text, query strings, fragments, titles, descriptions, review text, contact details, raw referrers, IP addresses, user agents, and browser fingerprints are not analytics properties.

The browser keeps a random visitor token in `localStorage` and a short-lived session token in `sessionStorage`. The collector HMAC-hashes those values before inserting them into SQLite. The raw tokens are never stored in the analytics tables. The default analytics retention is 400 days and can be changed with `ANALYTICS_RETENTION_DAYS`.

## Counting definitions

- A page view is a `Page Viewed` event from a public generated page. The same session/path is deduplicated within a 30-second window, which prevents obvious reload double-counting.
- A session is the browser session token. It expires after 30 minutes without activity or 24 hours, whichever comes first. It is not a login or an account.
- An approximate unique visitor is a distinct HMAC-derived visitor key among page views. It is approximate because clearing or blocking browser storage creates a new or missing durable identity, and different browsers/devices are counted separately.
- An engaged session is a session with at least one non-page-view event.
- Returning versus new uses the visitor table: a visitor first seen before the selected window and active during it is returning; otherwise it is new.
- A show open is a click on an archive show card or recommendation route. A listen click is a click on a tracked external listening or official link. These are separate signals: opening a show does not imply that the listener opened an external destination.
- Discovery surfaces are controlled labels such as `home_archive_grid`, `collection_page_grid`, or `show_similar`; the dashboard groups them without storing the underlying search text or link URL.
- Ratings and submissions in tracked ranges are successful writes recorded from the time this collector is enabled. The dashboard separately shows current active rating records and retained catalogue-submission records from the existing SQLite tables.

## Dashboard views

The protected dashboard supports 24-hour, 7-day, 30-day, and all-tracked ranges with an honest comparison boundary when an earlier period is available. It reports:

- headline visitors, sessions, page views, engaged sessions, show opens, listen clicks, ratings, and submissions;
- traffic, interaction, and contribution trends with zero-filled time buckets;
- top public pages, shows, collections, coarse referrer sources, and discovery surfaces;
- a session funnel from engagement through collection/show opens, listen links, ratings, and catalogue submissions;
- current community-record totals separately from range-based event history.

The dashboard uses aggregate grouped data only. It does not provide a visitor-level timeline or expose raw browser tokens.

## Noise filtering and failure behavior

The collector never runs on the `/api/health` listeners and does not use access logs as analytics. Maintainer/admin requests are ignored when the signed maintainer session is present. Requests with common crawler, scanner, headless, command-line, synthetic-monitoring, and uptime-monitor user-agent markers are ignored. Invalid event names, properties, paths, and ids fail closed.

The browser uses a keepalive same-origin `fetch` and does not wait for the collector before rendering. Backend write failures and rate-limit responses are swallowed for the visitor and do not change the page response. The analytics store is cleaned by the existing in-process retention job.

`PUBLIC_ANALYTICS_ENABLED=false` disables browser collection for an isolated environment such as staging. The backend injects this setting into public HTML responses at request time, so a staging-built artifact can be promoted to production without carrying staging's disabled flag. Production should set it to `true` and provide a stable random `ANALYTICS_HMAC_SECRET` of at least 32 characters.

## Historical boundary

The migration writes `tracking_started_at` when the analytics tables are first initialized. Trends before that timestamp are not reconstructed from raw HTTP traffic. All-time headline trends therefore mean “all tracked time,” while the archive ledger uses current records already present in `rating_submissions`, `show_submissions`, published listener reviews, and helpful votes. Older rating-write events may also be removed by the existing community-retention policy; the separate analytics event retention applies to tracked events.

The dashboard shows the tracking start and retention coverage beside every range so an empty or partial historical period is not presented as recovered usage.
