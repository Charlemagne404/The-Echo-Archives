# Cloudflare configuration guide (manual review only)

Zone plan: Free per task instructions. No Cloudflare settings were changed. The expressions below are candidate rules for the Free expression editor; confirm they parse against the current dashboard fields before saving.

Use the dashboard's current [Cache Rules](https://developers.cloudflare.com/cache/how-to/cache-rules/), [cache settings](https://developers.cloudflare.com/cache/how-to/cache-rules/settings/), [cache keys](https://developers.cloudflare.com/cache/how-to/cache-keys/), [rate limiting](https://developers.cloudflare.com/waf/rate-limiting-rules/) and [Bot Fight Mode](https://developers.cloudflare.com/bots/get-started/bot-fight-mode/) documentation when applying these recommendations.

Cloudflare Cache Rules support origin-controlled caching and a small Free-plan rule budget. Use explicit allowlists and **Use cache-control header if present, bypass cache if not**; do not select Cache Everything, status-code TTLs, or a fixed Edge TTL. Do not add Cache Response Rules that rewrite origin cache headers. Cloudflare evaluates `Cloudflare-CDN-Cache-Control` / `CDN-Cache-Control` ahead of downstream `Cache-Control` when no response rule overrides them, so leave those headers intact. Cloudflare's default cache key includes the full URL and query string; keep the default key and do not ignore or sort query parameters. [Cache key](https://developers.cloudflare.com/cache/how-to/cache-keys/), [CDN-Cache-Control precedence](https://developers.cloudflare.com/cache/concepts/cdn-cache-control/).

## Cache Rules

Create narrowly scoped allow rules. In each, set **Cache eligibility: Eligible for cache** and **Edge TTL: Use cache-control header if present, bypass cache if not**. Do not set browser TTL override, cache status-code override, or ignore query string. The application emits distinct `CDN-Cache-Control`; Cloudflare should honor it.

### 1. Anonymous queryless public HTML

Candidate expression:

```text
http.host eq "echoarchives.net" and
http.request.method in {"GET" "HEAD"} and
http.request.uri.query eq "" and
any(http.request.headers["accept"][*] wildcard "*text/html*") and
not any(http.request.headers["cookie"][*] ne "") and
not any(http.request.headers["authorization"][*] ne "") and
not any(http.request.headers["accept"][*] wildcard "*text/markdown*") and
(
  http.request.uri.path eq "/" or
  http.request.uri.path eq "/collections" or
  http.request.uri.path eq "/creators" or
  starts_with(http.request.uri.path, "/shows/") or
  starts_with(http.request.uri.path, "/collections/") or
  starts_with(http.request.uri.path, "/creators/")
)
```

These are the public queryless HTML routes with anonymous-identical content. Requests must advertise `text/html`; non-HTML clients and static image requests under `/shows/` fall through to the appropriate static rule/origin behavior. The wildcard operator is case-insensitive, so `TEXT/MARKDOWN` and other legal casing variants are excluded too. Edge/browser freshness comes from the origin's five-minute CDN TTL, one-hour SWR, one-day stale-if-error and browser revalidation. Query-bearing filters, cookies/auth, and Markdown negotiation bypass. Do not broaden this expression to all HTML.

For this rule's **Vary** setting, use `default: bypass` and configure `accept: normalize` with `media_types: ["text/html"]`. The application sends `Vary: Accept` on negotiated routes. Cloudflare does not use arbitrary `Vary` values unless the Cache Rule Vary setting is configured; this setting is available on Free. The media type allowlist keeps the cache key bounded and separates HTML representations. [Cloudflare Vary behavior](https://developers.cloudflare.com/cache/concepts/vary/), [Cache Rule Vary settings](https://developers.cloudflare.com/cache/how-to/cache-rules/settings/).

The origin currently emits no `Set-Cookie` on the public cacheable routes. With origin TTL behavior left intact, Cloudflare preserves and bypasses a cacheable response that unexpectedly carries `Set-Cookie`; do not choose an Edge TTL override, because that can remove the cookie and cache the response. Confirm this in staging. Cloudflare serves cacheable `HEAD` requests from a cached `GET`; the application supports both methods. [HEAD and Set-Cookie behavior](https://developers.cloudflare.com/cache/concepts/cache-behavior/).

### 2. Versioned immutable public assets

Candidate expression:

```text
http.host eq "echoarchives.net" and
http.request.method in {"GET" "HEAD"} and
http.request.uri.query contains "v=" and
(
  starts_with(http.request.uri.path, "/shared/") or
  starts_with(http.request.uri.path, "/data/") or
  http.request.uri.path in {
    "/script.js" "/style.css" "/public-heroes.css" "/home.css" "/info.css"
    "/collections.css" "/entity-directory.css" "/creators.css" "/submit.css"
    "/maintainer.css" "/detail.css" "/chat.css" "/site.webmanifest"
  }
)
```

The `contains` check uses Cloudflare's Free-plan expression operators; the app, rather than this broad eligibility check, grants one-year immutable headers only when `v` exactly equals the current ten-character content hash. Any other query value receives the shorter ordinary cache policy. Do not include `/sw.js`; it deliberately uses `no-cache`. Keep the full URL/query in the cache key. Do not include API, upload, or user-specific paths.

### 3. Generated public images

Candidate expression:

```text
http.host eq "echoarchives.net" and
http.request.method in {"GET" "HEAD"} and
(
  (starts_with(http.request.uri.path, "/images/") and
    (ends_with(lower(http.request.uri.path), ".avif") or
     ends_with(lower(http.request.uri.path), ".gif") or
     ends_with(lower(http.request.uri.path), ".jpeg") or
     ends_with(lower(http.request.uri.path), ".jpg") or
     ends_with(lower(http.request.uri.path), ".png") or
     ends_with(lower(http.request.uri.path), ".svg") or
     ends_with(lower(http.request.uri.path), ".webp"))) or
  (starts_with(http.request.uri.path, "/shows/") and
    (ends_with(lower(http.request.uri.path), ".avif") or
     ends_with(lower(http.request.uri.path), ".gif") or
     ends_with(lower(http.request.uri.path), ".jpeg") or
     ends_with(lower(http.request.uri.path), ".jpg") or
     ends_with(lower(http.request.uri.path), ".png") or
     ends_with(lower(http.request.uri.path), ".svg") or
     ends_with(lower(http.request.uri.path), ".webp"))) or
  http.request.uri.path in {
    "/favicon.ico" "/apple-touch-icon.png" "/icon-192.png" "/icon-512.png"
    "/echo-wordmark1.png" "/echo-wordmark-nosub1.svg" "/echo-wordmark-sub1.svg" "/og-image.png"
  }
)
```

Generated covers and social cards live under `/images/generated/`; authored static show artwork is served from `/shows/`. This expression uses Free-plan functions and matches only image extensions under those static mounts; a `/shows/<id>` HTML route must not match. Verify the deployed manifest and sample `Content-Type` before saving. The CDN gets one-day freshness, seven-day stale-while-revalidate and seven-day stale-if-error.

### 4. Public catalogue data and popularity aggregate (optional)

Candidate expression:

```text
http.host eq "echoarchives.net" and
http.request.method in {"GET" "HEAD"} and
(
  http.request.uri.path in {
    "/data/shows.json" "/data/collections.json" "/data/entities.json"
    "/data/entity-graph.json" "/data/search-index.json" "/data/runtime-evidence.json"
    "/data/archive.json" "/api/popularity/scores"
  }
)
```

These exact handlers are public aggregate/catalogue responses and ignore query parameters; nevertheless the full query remains in the key. Use origin TTL (five minutes for public data, current 60 seconds for popularity scores). Do not include dynamic community, submission, analytics, admin, health, AI, or authenticated APIs. Versioned data should use Rule 2 instead.

If rule capacity is tight, prioritize immutable assets and public HTML; the application already emits origin cache headers and the cache rule only activates when explicitly saved.

## Bypass checks

Before allow rules, add a higher-priority bypass if the dashboard UI supports a clear bypass action; otherwise ensure the allow expressions above never match:

- `/api/analytics/*`, `/api/submissions/*`, `/api/community/*`, review/rating writes;
- `/maintainer/*`, authentication, library/personalized paths, imports, AI, health/readiness;
- any request with cookie or authorization for HTML;
- any query-bearing HTML and any Markdown-negotiated request;
- response `Set-Cookie`, `private`, `no-store`, or missing `CDN-Cache-Control` (achieved by origin-header TTL mode; do not override).

Cloudflare rule expressions inspect requests, so response `Set-Cookie` behavior is enforced by leaving origin cache control enabled and avoiding fixed TTL or status-code overrides. Cloudflare's current cache documentation says an eligible response with `Set-Cookie` is not stored when origin TTL behavior is respected; a fixed TTL override can strip the cookie and cache it. Verify both the public cacheable route and an intentionally cookie-setting staging fixture. Do not use a rule that overrides origin privacy directives. [Cloudflare Set-Cookie cache behavior](https://developers.cloudflare.com/cache/concepts/cache-behavior/).

## Security rules

Do not block Chrome 146, countries, verified or unverified search crawlers, or catalogue paths. Those selectors would harm real listeners/search indexing and do not address a distributed scraper. The app does not trust user-agent claims as crawler verification; its behavior-based classifier affects analytics/popularity only and never blocks a page request. No low-volume dotfile probe rule is required for this mitigation; the app does not serve arbitrary filesystem paths and missing routes return a not-found response. Existing Cloudflare protections can remain unchanged.

## Rate limiting for analytics

Free-plan rule availability is limited, and path/IP counters are not distributed identity. If one rule is available, stage a single exact API-path rule only after application hardening is live:

```text
http.host eq "echoarchives.net" and
http.request.method eq "POST" and
http.request.uri.path in {"/api/analytics/events" "/api/analytics/events/batch"}
```

Candidate threshold: **30 requests per 10 seconds per source IP**, mitigation **Block for 10 seconds**. Legitimate clients issue individual events or batches of up to 50 impressions; this threshold leaves room for shared NAT traffic while clipping a local burst. Watch 429/403 counts and tune from staging measurements before production. Since a blocked `fetch()` cannot solve an interactive challenge, use Block rather than a challenge for this isolated telemetry endpoint. A 403 only drops that analytics request; it should not block catalogue page delivery.

Per-IP limiting can miss a distributed crawl spread across many addresses, may group legitimate visitors behind NAT, and may be approximate per Cloudflare location with counters that lag. Treat it as supplemental event-write protection, not a crawl defense. Application global event capacity remains necessary.

## Bot Fight Mode

Do not enable Bot Fight Mode as part of this release. On Free it is broad, not path-exemptible through a custom skip rule, and can challenge analytics/API fetches or legitimate clients. If later evaluated, first test staging behavior for browser catalogue navigation, verified search crawlers, analytics POSTs, reviews, submissions, and listening links. A challenged analytics POST would lose measurement; do not assume JavaScript or a browser UA proves that the request is human.

## Origin restriction

The inspected Caddy site already allows Cloudflare peer IPs. Do not change UFW during this mitigation. For a later explicit host-infrastructure change, retrieve current Cloudflare IPv4/IPv6 ranges from the official list, compare them with Caddy's current allowlist, preserve SSH and named monitoring probes, and prepare a timed rollback through the host console. Verify proxied reachability and direct-IP rejection before making firewall policy persistent.
