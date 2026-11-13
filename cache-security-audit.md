# Cache security and isolation audit

## Decision

Application cache headers are limited to content that is identical for anonymous visitors. The tested route behavior separates public, private, query-dependent, and negotiated responses. Cloudflare behavior was checked against its current published rules documentation, but no real edge rule was created or tested in this task; manual staging verification remains required before enabling those rules.

## Response scope

| Response | Application behavior | Isolation result |
|---|---|---|
| Queryless homepage, public show, creator, and collection HTML | Shared-cache headers only on indexable routes; `GET`/`HEAD`; no query, cookie, authorization, or Markdown negotiation; stable CSP and `Vary: Accept` | Anonymous representation is shared. Credentialed, filtered, non-indexable, and Markdown responses are `private, no-store`. |
| Public catalogue/reference JSON | Public object only; versioned endpoints get immutable headers only when `v` matches the current content hash | Different full URLs/query strings remain separate. Data contains no request-specific user state. |
| Generated public images | Public file routes only; one-day browser/CDN freshness with bounded stale windows | Image bytes are independent of viewer identity; missing files are errors and are not assigned a long-lived success policy. |
| Versioned CSS/JS | One-year immutable headers only for an exact active ten-character asset hash | New hash is the normal invalidation mechanism; stale or arbitrary `v` values receive short policy. |
| Popularity score aggregate | Existing public endpoint contract, 60-second freshness | Same anonymous aggregate for all visitors; no optional Cloudflare rule is required. |
| Authentication, maintainer, personalized community, submissions, analytics, writes, health/readiness | No shared-cache allow rule; route-specific private/no-store behavior | Not included in proposed Cloudflare allow expressions. |

## Cache-key and HTTP checks

The application and synthetic cache-proxy tests cover:

- Full path and query-string separation; filtered/sorted URLs cannot reuse a queryless HTML response.
- Cookie and authorization requests bypass public HTML caching. Cacheable public HTML returned no `Set-Cookie`; the fixture never stored a response that set one.
- HTML and Markdown negotiation use separate `Accept` variants. Markdown responses bypass shared caching; HTML `Vary: Accept` is retained.
- `GET` and `HEAD` behavior, including bodyless `HEAD`, GET-to-HEAD reuse, ETag conditional revalidation (`304`), stale-if-error, and explicit purge after a content change.
- A `503`/error and a `404` are not stored by the synthetic proxy; application error responses retain non-cacheable directives.
- Separate show paths and static image paths do not share a cache object.

The conditional request check uses raw HTTP because Node `fetch` automatically adds `Cache-Control: no-cache` with `If-None-Match`, which changes Express's revalidation path. The raw request confirmed the expected `304`.

## Cloudflare compatibility

The updated [Cloudflare guide](cloudflare-configuration-guide.md) uses explicit paths, GET/HEAD, queryless HTML, cookie/authorization exclusions, and a `text/html` Accept requirement. It retains the default full-URL cache key and relies on origin `CDN-Cache-Control`; it does not set Cache Everything, fixed Edge TTL, status TTL overrides, or query normalization. Versioned assets are eligible only on allowlisted paths, and the application grants immutable freshness only for the exact current hash.

For the HTML Cache Rule, configure `Vary: Accept` normalization for `text/html` and bypass the default for unconfigured `Vary` headers. Keep origin TTL behavior so `private`, `no-store`, and unexpected `Set-Cookie` responses are not forced into cache. Cloudflare documents the case-insensitive `wildcard` operator and the cache-rule Vary setting in its [Ruleset operators](https://developers.cloudflare.com/ruleset-engine/rules-language/operators/), [Vary settings](https://developers.cloudflare.com/cache/how-to/cache-rules/settings/), and [Set-Cookie cache behavior](https://developers.cloudflare.com/cache/concepts/cache-behavior/).

The application emits cache directives but no Cloudflare setting was changed. Confirm the expressions parse in the Free-plan dashboard and verify `MISS` then `HIT`, cookie/query/Markdown bypass, conditional requests, `Set-Cookie`, and content invalidation on staging before manual activation.

## Public functionality and privacy

No cookies, source addresses, session tokens, or request-specific values are included in the cacheable HTML response. Cookie-bearing anonymous pages take the uncached path, so later personalization cannot leak through the shared key. Search/filter routes remain query-sensitive and uncached. Cache headers do not block requests and do not change indexing directives.

Dotfiles and deployment paths are not exposed by the application's explicit static-file routing; missing paths return a not-found response. The low-volume probe traffic does not justify broad cache or security rules.

## Verification limits

The proxy fixture models the expected shared-cache behavior, not Cloudflare's production edge. No zone settings, DNS, public caches, or staging services were changed. TTL behavior at an actual Cloudflare edge and purge propagation still require staging verification.
