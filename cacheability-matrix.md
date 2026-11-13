# Cacheability matrix

The application emits cache directives; no live Cloudflare rule or public cache change was made. Shared caching is limited to stable public resources. Cloudflare should honor origin cache headers and preserve its full URL cache key, including query parameters.

| Resource | Safe for all anonymous visitors? | Application policy in isolated worktree | Cloudflare treatment to prepare | Exclusions/invalidation |
|---|---|---|---|---|
| Versioned CSS/JS and versioned JSON | Yes when `v` equals the current content hash | `public, max-age=31536000, immutable` in browser and CDN cache directives | Cache only allowlisted static paths with exact `?v=<10-char current hash>`; use origin TTL | Version bump is invalidation. Keep full query key. Stale hash can remain cached harmlessly only while callers reference it. |
| Generated cover images and social cards | Yes; file bytes are content-generated and public | Browser 1 day; CDN 1 day, SWR 7 days, stale-if-error 7 days | Cache allowlisted public image extensions/paths using origin TTL | Asset regeneration must replace URL/hash or purge edge cache. Do not match `/shows/<slug>` HTML as an image. |
| Public queryless homepage, show, creator, collection HTML | Yes if route is indexable and has no cookie/auth | Browser revalidation; CDN 5 minutes, SWR 1 hour, stale-if-error 1 day | Exact path prefixes only; require no query, no cookies/auth, and no Markdown `Accept` | Do not cache unlisted/draft/404/private routes, `Set-Cookie`, or non-2xx responses. Revalidate after catalogue/review updates or purge affected paths. |
| Query-bearing browse/search/filter HTML | No; query affects sort/filter/results | `private, no-store` | Bypass | Full query-string semantics retained. |
| Negotiated Markdown HTML responses | Different representation | `private, no-store`; `Vary: Accept` | Bypass requests advertising `text/markdown` | Do not rely on a cache key that ignores `Accept`. |
| `/data/shows.json`, `/data/collections.json`, search index and related public JSON | Public, but content changes with catalogue publish | Browser revalidation; CDN 5 minutes, SWR 1 hour, stale-if-error 1 day; exact versioned URLs immutable | Allowlist only these data paths; prefer the published `?v=` hash URLs for long-lived caching | Keep full query key; preserve invalidation/versioning. Do not include private/runtime/maintainer APIs. |
| `/api/popularity/scores` | Public aggregate, same for anonymous users | Existing short public cache retained (60 seconds) | Optional exact endpoint rule, honor origin TTL | No cookie/auth variant and no query-dependent response per inspected handler. Recheck before enabling. |
| Analytics, submissions, community writes, ratings/reviews mutations | No | No shared cache | Explicit bypass | Never cache POST or any write endpoint. |
| Maintainer/authenticated/library/personalized responses | No | Private/no-store or existing private handling | Explicit bypass | Cookie/auth and `Set-Cookie` safety. |
| Health/readiness, import/AI/operational endpoints | No shared cache | No-store or route-specific behavior | Bypass | Monitoring freshness and side effects. |

## Implemented response headers

- **Versioned immutable:** `Cache-Control: public, max-age=31536000, immutable` and matching `CDN-Cache-Control` only if `?v` equals the active asset's expected ten-character hash.
- **Generated images:** browser `max-age=86400, stale-if-error=604800`; CDN `max-age=86400, stale-while-revalidate=604800, stale-if-error=604800`.
- **Public JSON and queryless public HTML:** browser `max-age=0, stale-if-error=3600`; CDN `max-age=300, stale-while-revalidate=3600, stale-if-error=86400`.
- **Unsafe HTML variations:** `Cache-Control: private, no-store` and `CDN-Cache-Control: no-store`.

Cacheable HTML has a stable CSP (no request nonce) and `Vary: Accept`; eligible HTML does not set a cookie. The Cloudflare expression must separately exclude Markdown negotiation because Cloudflare does not guarantee arbitrary `Vary` values are part of its cache key. Verify the response contains no `Set-Cookie` before turning on the edge rule.

## Query, cookie and purge rules

Do not ignore query strings in a Cloudflare cache key. The current cache key includes the full URL; keeping all query parameters avoids collapsing filter, sort, pagination, or versioned responses. Queryless public HTML should remain a separate match. Cookie and authorization requests bypass even when they target a normally public route. Bypass admin, API writes, submissions, community and user-specific content. Use application `CDN-Cache-Control`; do not configure edge TTL overrides that make `no-store` eligible.

After a catalogue or generated image publish, use the existing versioned URLs where available; for unchanged HTML paths, purge only affected public URLs if a stale representation is unacceptable. Never purge broad host content without checking impact.
