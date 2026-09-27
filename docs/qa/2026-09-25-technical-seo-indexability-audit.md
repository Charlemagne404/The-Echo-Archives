# Technical SEO and indexability audit

**Date:** 2026-09-25

**Scope:** Current repository implementation and generated output for `echoarchives.net`

**Evidence boundary:** This audit verifies local source, generated files, and HTTP behavior from the repository server. It does not inspect Google Search Console or prove the live DNS, CDN, TLS, or production deployment behavior.

## Findings

### Robots and crawl controls

Production `robots.txt` allows public routes, names the absolute `/sitemap.xml` URL from `SITE_URL`, and disallows `/api/` and `/maintainer/`. Staging returns `Disallow: /` and sets a site-wide `X-Robots-Tag: noindex, nofollow, noarchive` response header. The intentional `/api/` and `/maintainer/` exclusions can appear as “Blocked by robots.txt” in Search Console if Google discovers those URLs; neither family belongs in the sitemap.

The application already added `X-Robots-Tag: noindex, nofollow, noarchive` to its named JSON data endpoints. The generic `/data/*.json` static handler did not, leaving files such as `/data/archive-stats.json`, `/data/tag-taxonomy.json`, and `/data/reviews/impact-winter.json` without an index exclusion. The handler now applies the same header to every JSON file it serves.

### Sitemap

The runtime endpoint and `tools/build-pages.js` both serialize through `backend/lib/sitemap.js`. The current source-derived inventory is:

| Route family | URLs |
| --- | ---: |
| Static pages | 13 |
| Published shows | 752 |
| Indexable collections | 48 of 54 |
| Indexable creator/entity pages | 71 of 132 public entities |
| **Total** | **884** |

The 48 indexable collections include all 24 generated “Shows Like X” routes. Collection indexability requires a title, a description of at least 60 characters, at least four published shows, and a 20-character reason for each included show. The remaining six collections are served with `noindex, follow` and are omitted from the sitemap. Entity detail pages require public publication, an explicit indexable flag, and links to at least two published shows.

The generated sitemap is a single 88,475-byte `<urlset>` with 884 unique absolute URLs, no query-string or `.html` aliases, and `lastmod` values for all show, collection, and entity detail URLs. This is far below the protocol limits, so a sitemap index is not needed. The runtime endpoint returned HTTP 200 with XML content type and valid XML in the local route test.

### Canonicals, redirects, and URL variants

Indexable static pages use manifest canonicals resolved against the configured site origin. Show, collection, and entity renderers produce absolute self-canonicals; dynamic `og:url` values follow those canonical URLs. `SITE_URL`, rather than the incoming `Host` header, controls the canonical origin.

The server returns permanent redirects for trailing-slash aliases, legacy `.html` routes, old query-based show and collection links, and known legacy show paths. Caddy configuration permanently redirects `www.echoarchives.net` and the legacy host to the HTTPS apex domain. The application now also redirects mixed-case static, show, collection, and creator URLs to the lowercase canonical path. Query variants of show and collection details redirect to the clean path; search and filter variants of discovery pages are `noindex, follow`.

`/contact` intentionally returns a temporary redirect to the separate contact site. It is not included in the sitemap.

Before this audit, generic 404/500 pages carried a canonical to `/404.html` or `/500.html`, and missing show pages pointed to `/show`. They now keep their correct HTTP error status and `noindex` treatment without emitting a canonical or `og:url` for an error document.

### Content routes, metadata, and structured data

All published shows are rendered as server-side HTML and use title, description, canonical, Open Graph, Twitter, image-alt, JSON-LD, and breadcrumb metadata. Existing SEO tests verify canonical and connected `PodcastSeries`/`WebPage` structured data for every published show.

Indexable collections and entity pages have server-rendered HTML, self-canonicals, Open Graph metadata, and connected `CollectionPage`, `ItemList`, breadcrumb, `Person`, or `Organization` structured data appropriate to their page. Structured data uses published show links and collection membership; it does not invent ratings for imported records. The homepage emits `WebSite`, `WebPage`, and `SearchAction` data.

The homepage load-more interaction is client state, not a URL-addressable page sequence. Show reviews use a public API page parameter, while `/api/` is excluded from crawling and carries `noindex`; no paginated review URL is in the sitemap. The show, collection, and creator detail routes remain individually discoverable through canonical links and the sitemap.

### Markdown negotiation and utility routes

Markdown is a representation selected on the same supported page URL through `Accept`; there are no separate `.md` routes. Negotiated pages send `Vary: Accept`, default browser requests to HTML, and include the canonical page URL in Markdown front matter. Static pages that do not support Markdown continue to return HTML.

The `/api/` middleware applies `noindex` to API responses. Named `/data` routes and all JSON files served by the static data handler now do the same. Maintainer pages have generated noindex metadata and are also disallowed in `robots.txt`. Offline and error pages are excluded from the sitemap; error responses have real 404/500 statuses.

## Google Search Console report mapping

| Report | Repository evidence and interpretation |
| --- | --- |
| Sitemap fetch/read failure | The local runtime route returns valid XML at `/sitemap.xml`, and `robots.txt` points to that URL. This does not establish live DNS, CDN, TLS, or Google fetch success. |
| Discovered/crawled but not indexed | The repository can verify status, content, canonicals, and sitemap membership, but not Google’s indexing decision. These reports require URL Inspection and Search Console evidence. |
| Duplicate without user-selected canonical | Indexable routes emit a self-canonical. Legacy, case, slash, and query aliases are redirected. Error pages no longer select an unrelated canonical. |
| Alternate page with canonical | URL variants are consolidated by redirects or marked noindex when they are filtered discovery views. Markdown uses the same URL and `Vary: Accept`. |
| Redirect error | Local tests cover canonical route redirects and source tests cover the apex host redirects. The intentional external contact redirect is temporary. Live redirect chains still require production verification. |
| Soft 404 | Missing show, collection, entity, and general routes return 404; error pages carry no canonical. Repository behavior does not prove Google’s classification for every response. |
| Blocked by robots.txt | `/api/` and `/maintainer/` are intentionally disallowed and excluded from the sitemap. A report for these utility routes is expected. |

## Automated regression coverage

The audit adds checks for runtime sitemap XML validity, exact source-derived sitemap membership, duplicate/variant URL exclusion, sitemap size limits, representative indexable HTTP responses, lowercase redirect behavior, noindex headers on generic data JSON, and canonical-free 404/500 output. The generated-output test also compares every `<loc>` in the built `sitemap.xml` with the source-derived canonical route set. Existing tests continue to verify show metadata, all indexable entity and collection routes, Markdown negotiation, API exclusions, and Caddy host redirects.

Focused SEO and route tests passed. The full `npm run verify` gate was not run: unrelated work appeared in the shared checkout during the audit, including edits to `tools/build-catalog.js` and the generated `sw.js`, which the full gate rebuilds. Those changes were left untouched. Production and Search Console behavior remain unverified.
