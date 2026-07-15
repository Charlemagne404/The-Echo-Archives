# SEO operating rules

This document defines the maintained search contract for The Echo Archives. The goal is durable discoverability for useful catalog and editorial content, not an audit score or high-volume keyword publishing.

## Entity and brand strategy

Use **The Echo Archives — Audio Drama Discovery** as the primary search-facing descriptor. The site must consistently identify itself as a human-curated discovery platform for audio dramas and fiction podcasts through titles, descriptions, headings, visible copy, internal links, and structured data.

Core category associations are:

- audio drama discovery and reviews
- fiction podcast recommendations
- curated listening collections
- recommendations for shows similar to a known audio drama

Disambiguate the brand through these specific, accurate category signals. Do not refer to unrelated entities, stuff keywords, or add hidden explanatory text. Keep the visible product language editorial and listener-first.

## URL and canonical rules

`SITE_URL` is the only authoritative origin. Source manifests use path-only canonicals; generation and the backend resolve them against `SITE_URL`.

Canonical public routes are:

- `/` for the unfiltered discovery homepage
- `/collections` for the collection directory
- `/shows/<show-id>` for a published show
- `/collections/<collection-id>` for a qualifying collection
- the extensionless paths declared in `site-src/page-manifest.json` for other public pages

Rules:

- Emit one self-referencing absolute canonical for every indexable response.
- Emit canonical clean routes in cards, breadcrumbs, structured data, share actions, chat actions, and the sitemap.
- Permanently redirect `/show?id=...`, `/collection?id=...`, `.html` aliases, legacy show paths, trailing slashes, and query-bearing detail URLs to the clean route.
- Do not include aliases or query parameters in the sitemap.
- A missing show or collection must return HTTP 404 with `noindex, nofollow, noarchive`; it must never redirect to a generic detail shell.

This follows Google’s recommendation to combine redirects, canonicals, and sitemap inclusion as aligned canonicalization signals: [Google canonical guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls).

## Structured-data rules

Structured data must describe visible, supported content and use the same canonical URLs as the page:

- Homepage: `WebSite` and `WebPage`, with a site-search `SearchAction`.
- Static public page: `WebPage` and `BreadcrumbList`.
- Collection directory: `CollectionPage`, `ItemList`, and `BreadcrumbList`.
- Collection detail: `CollectionPage`, `ItemList`, and `BreadcrumbList`.
- Show detail: `WebPage`, `PodcastSeries`, and `BreadcrumbList`.

Use stable `@id` values derived from the canonical URL and connect entities with `isPartOf`, `mainEntity`, and `breadcrumb`. Keep creator values, official links, genres, languages, dates, images, and collection reasons grounded in catalog data.

Do not emit `AggregateRating`, review counts, awards, organizations, authors, social profiles, or authority claims unless the repository has real source data that supports them. Archive ratings are editorial, community ratings are listener responses, and creator verification is factual metadata confirmation; never merge these meanings in markup. Follow [Google’s structured-data policies](https://developers.google.com/search/docs/appearance/structured-data/sd-policies) and the relevant [Schema.org types](https://schema.org/PodcastSeries).

## Indexability rules

Index and follow:

- unfiltered public pages with unique content
- published show pages
- collections that pass the quality gate below

Use `noindex, follow, noarchive` for discovery filter/search states so crawlers can follow results without indexing combinatorial URLs. Use `noindex, nofollow, noarchive` for errors, private maintainer pages, offline pages, API/data responses, and unresolved detail IDs. `robots.txt` blocks `/maintainer/` and `/api/`, but meta or `X-Robots-Tag` remains the index-control mechanism for reachable responses.

Important content, card links, collection reasons, headings, and breadcrumbs must exist in the raw HTML response. Client JavaScript may enhance or refresh that content, but must not be the only way a crawler can discover it. See [Google’s JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics).

## Collection-page quality gate

A collection can be indexed and included in the sitemap only when all of these are true:

- it has a non-empty title
- its distinctive editorial description is at least 60 characters
- it contains at least four published shows
- every included show has a collection-specific reason of at least 20 characters

Collections should answer a real listener need such as mood, genre, format, listening context, completion status, or similarity to a specific show. Do not create near-duplicate, automated, doorway, or search-term-only collections. A collection that fails the gate may remain usable for listeners, but must be `noindex` and absent from the sitemap until improved.

## Images and performance

- Keep explicit width and height on content images to limit layout shift.
- Use responsive generated cover variants where available, meaningful cover alt text, and lazy loading for below-the-fold art.
- Keep the homepage hero preload and `fetchpriority="high"` limited to the actual likely LCP image.
- Allow `max-image-preview:large` on indexable pages.
- Do not add render-blocking SEO libraries or client-only content generation.

## Domain migration

If the public origin changes:

1. Set the new production `SITE_URL`; do not edit URLs into source files.
2. Regenerate the catalog and pages, then run `npm run verify`.
3. Confirm canonicals, Open Graph URLs, JSON-LD, robots sitemap location, and every sitemap `<loc>` use the new origin.
4. Keep equivalent path mappings and add one-hop permanent redirects from every old-origin URL to its new-origin canonical.
5. Verify both properties in Google Search Console and Bing Webmaster Tools; submit the new sitemap and use Google’s change-of-address workflow when applicable.
6. Keep old-origin redirects active for at least a year and preferably indefinitely; monitor crawl errors, indexing, traffic, and redirect chains.

Reference: [Google site-move guidance](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes).

## Search launch checklist

Google Search Console:

- Verify the production domain property and all required ownership records.
- Submit `/sitemap.xml` and confirm the discovered count matches the canonical indexable route count.
- Inspect `/`, representative full-review and archive-guide shows, a topical collection, and a similarity collection.
- Test live URLs and rendered HTML; confirm canonical selection matches the declared canonical.
- Validate rich results where supported and monitor structured-data parsing, Core Web Vitals, crawl stats, soft 404s, duplicate canonicals, and manual actions.
- Request indexing for a small representative set after launch or a migration, not every URL.

Bing Webmaster Tools:

- Verify the site, submit `/sitemap.xml`, and inspect the same representative URLs.
- Review Index Explorer, crawl errors, robots handling, and duplicate-content signals.
- Add IndexNow only if a maintained publish/update path can submit changed canonical URLs reliably; it is optional, not a substitute for crawlable links and a sitemap.

References: [Google sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap), [Bing sitemap guidance](https://www.bing.com/webmasters/help/sitemaps-3b5cf6ed), and [Bing robots meta guidance](https://www.bing.com/webmasters/help/which-robots-metatags-does-bing-support-5198d240).
