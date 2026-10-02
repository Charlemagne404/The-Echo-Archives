# Public scale and failure drill — 2026-10-01

Scope: local synthetic catalogues and disposable loopback servers only. Measurements below are from an Apple M2, Node 24.14.1, with an isolated SQLite database per HTTP profile. They describe relative bottlenecks, not production capacity.

## Request and dependency map

- Browser discovery loads generated `/data/shows.json`, search index, runtime evidence, and collections. Search ranking and filtering run in the browser; `/` and `/collections` also offer server-rendered Markdown to clients that request it.
- Show, collection, creator, and directory HTML/Markdown routes render from a loaded in-memory authored catalogue and generated templates. Show pages query SQLite for published listener review summaries; Markdown show pages also query community rating summaries. Recommendations use an in-memory similarity index. No public page fetches RSS or a listening platform at request time.
- Sitemap, robots, public reference JSON, and versioned data/assets are public. Sitemap and public reference are now computed when the catalogue loads, then replaced on refresh. The app checks generated data file metadata for refresh on each request. Concurrent refreshes share one promise.
- SQLite stores community ratings, reviews, submissions, analytics, rate limits, imports, and maintainer sessions. Public health checks SQLite. Maintainer APIs and the protected external-verification asset require a session and use `no-store`; the maintainer HTML shell remains reachable so a maintainer can log in.
- A show HTML render reads listener reviews with four prepared SQLite statements: count, one page, category aggregates, and overall score. The Markdown variant also asks for a compact community rating. In a disposable empty SQLite database, 1,000 repetitions of the four-statement show path took 36 ms total after warmup (about 0.036 ms per show); this is a lower bound and does not model populated review tables or storage contention.
- Caddy accepts only Cloudflare source ranges and forwards `CF-Connecting-IP` as the client IP. Caddy compresses with zstd/gzip and sets HSTS. The application does not implement a reverse-proxy cache. Cloudflare rule configuration is not present in this repository, so live edge cache behavior is unverified.

## Reproduced defects and changes

1. The public reference manifest used a full published-show scan for every collection member. Ten runs per size averaged 2.86, 19.98, 99.79, and 362.48 ms at 500, 2,000, 5,000, and 10,000 synthetic shows. A show ID map reduced those to 0.32, 1.09, 3.21, and 6.70 ms. The same manifest and sitemap were regenerated on every request; they are now built at load/refresh.
2. Show and collection routing repeatedly scanned the catalogue, and each show render rebuilt a show ID map. The loaded state now keeps ID maps for routing and rendering. The public route suite verifies behavior after the change.
3. Any nonempty `?v=` caused a one-year immutable policy, including arbitrary values that did not identify the bytes returned. Data and public asset responses now grant immutable caching only when `v` equals the current content hash. False versions receive the ordinary revalidation policy. HTML and Markdown retain `Vary: Accept` and `no-cache`.
4. A broken catalogue during refresh previously propagated a 500 to every route. The server now keeps the last good snapshot, logs the reload failure, marks health 503/degraded, retries after five seconds, and recovers when the files are repaired. A copy-on-write fixture proves this without changing authored data.
5. A URL above 8 KiB or 100 query parameters is rejected before refresh, parsing, routing, or database work. Unsupported HTTP methods receive 405. Browser search is limited to 200 characters; the shared scorer has a 2,000-character defensive ceiling so valid longer Archivist messages remain supported.
6. The existing synthetic catalogue benchmark could not run in Node because it imported browser constants without a DOM. Its controlled DOM shim restores the benchmark.
7. Missing/unreadable error-page templates could cause a secondary failure and default Express error output. Disk-independent 404/500 fallbacks now preserve controlled status and omit internal details; HTML server errors use no-store.
8. Import redirects left unread bodies and a zero redirect limit was ignored. Redirect cancellation, controller disposal, and zero-limit handling now have stream and real-socket regressions.
9. Cold recommendations repeatedly normalized identical record metadata and recomputed record coverage for each pair. Snapshot-owned WeakMaps reuse that work; deterministic output and rebuild invalidation are tested.
10. Source writers accepted duplicate and unsafe path-bearing IDs; full rewrites could delete healthy files before a later invalid registry failed. All IDs are checked before mutation, and failed rename staging files are cleaned.
11. SQLite's five-second runtime busy wait blocked the event loop during an external writer lock. Runtime waits are now 100 ms, lock errors return retryable 503, and a one-second write pause protects against repeated lock waits. Readiness reflects that degradation.
12. The maintainer browser fault test introduced 401 responses before its prior Retry operation finished dependency loads. It now synchronizes on the action's aria-busy state; no interaction assertion was bypassed.


## Local traffic profiles

`tools/benchmark-public-load.js` starts and stops a private loopback server with a disposable SQLite file. It reads sitemap routes and consumes each response body. The following are single runs, so repeat before using them to size infrastructure.

| Profile | Concurrency | Requests | Throughput | p50 | p95 | p99 | HTTP errors | End RSS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Browse | 16 | 300 | 28.2/s | 420 ms | 1,198 ms | 3,523 ms | 0 | 477 MB |
| Search | 16 | 300 | 322.6/s | 40 ms | 91 ms | 275 ms | 0 | 327 MB |
| Crawler | 16 | 884 | 47.3/s | 269 ms | 732 ms | 1,033 ms | 0 | 364 MB |
| Mixed | 32 | 500 | 88.1/s | 59 ms | 1,491 ms | 5,386 ms | 0 | 306 MB |
| Spike | 64 | 500 | 74.0/s | 68 ms | 6,710 ms | 6,744 ms | 0 | 258 MB |

The crawler covered every URL in the generated sitemap. These profiles include Node client and server work on the same laptop. End RSS is not a leak measurement. The browse and spike tails point to CPU-heavy dynamic page rendering on one Node event loop as the first likely bottleneck at 10× traffic. Search requests mostly serve the home shell; this profile does not measure browser-side search on slow devices. The existing catalogue benchmark separately exercises browser discovery and large synthetic fixtures.

A later crawler repeat after the reload-hardening change returned 200 for all 884 routes at 43.5 requests/s, p95 782 ms, p99 1,442 ms, and end RSS 539 MB. The run-to-run memory variation reinforces that endpoint RSS is not evidence of a leak or a stable capacity limit.

The full local link pass fetched those 884 sitemap pages, extracted 3,749 unique internal `a`, `img`, `script`, and `link` destinations, and fetched each destination. All 4,633 requests returned 200, with no broken local links found. External listening platforms were excluded.

The synthetic catalogue benchmark also completed at 752, 1,504, 3,760, and 7,520 shows (roughly current, 2×, 5×, and 10×). At 7,520, catalogue loading took 2.20 s, collection loading 1.16 s, search-index generation 107 ms, similarity-index construction 318 ms, and sitemap generation plus entry build 69 ms. Peak checkpoint RSS was about 354 MB. A common creator query matched all 7,520 fixtures and took 413 ms on average in the Node search scorer; that is a likely slow-device browser bottleneck if the catalogue grows 10×. Page generation rendered every show at 752 and 1,504 records, but only 30 sampled pages at 3,760 and 7,520; those timings cannot be compared as total-build capacity. A subsequent 50× run completed with a 2 GiB V8 heap cap; details follow below.

## Cache and staleness contract

- HTML/Markdown pages are revalidated and vary by Accept. Their current review/community content is dynamic. A shared CDN must honor `Vary: Accept`; it must never force-cache `/api/*` or maintainer routes.
- Versioned public data and assets are immutable only for the current hash. Unversioned data revalidates with a 60-second stale-while-revalidate window. Unversioned images have a one-day freshness window and seven-day stale window. A changed cover at the same unversioned URL can therefore remain visible for up to that window; a release should use a new content URL or purge it when immediate correction matters.
- Sitemap and robots allow one hour of freshness plus one hour stale revalidation. Removed/renamed URLs may remain discoverable until that window ends, but origin route lookup returns the current status. Page, sitemap, and reference state are replaced together after a successful catalogue refresh.
- Public catalogue refresh failure preserves known-good content and fails readiness. Startup with invalid authored content still fails closed. If a release modifies several data files nonatomically, a refresh can observe an intermediate state; the revision check rejects a change during reload, while the last-good snapshot keeps public reads available.

## Coverage and remaining risks

The focused route suite covers HTML/Markdown variation, false and valid version tags, malformed percent-encoded paths, HEAD, unsupported methods, long URLs, parameter floods, health degradation/recovery, sitemap canonical routes, static path boundaries, and noindex behavior. Existing backend tests cover authentication/session expiry, import fetch limits and redirects, RSS parsing, catalogue integrity, similarity ordering, and SEO. The local sitemap and internal-link crawls returned 200 throughout.

`npm run validate:data` passed with 0 integrity errors across 752 shows, 47 authored collections, 132 entities, and 7 review companions (54 collections after generated similarity routes). It reported 55 advisory entity-role/redundant-role warnings, such as a studio linked as a production company. Those relationships need source review; the drill did not rewrite factual credits to silence warnings.

The repository has no deployable Cloudflare cache-rule export, so the exact edge key, cookie behavior, purge, and stale-if-error behavior still need an account-side configuration review or an exported ruleset. A controlled shared-cache proxy now verifies MISS/HIT, expiry, purge, query isolation, credential bypass, and negotiated-page noncaching. It honors Cache-Control/Vary and is not an implementation of every Cloudflare rule or live purge. Missing/unreadable error-template fallback and database read failure/recovery are covered. Twenty real loopback endless redirect bodies leave no active sockets after cancellation; this is bounded fault coverage, not a long-duration leak test. Physical disk-full/read-only drills, the extended RSS fault matrix, long-duration memory/handle testing, and production-host DB contention remain open. The local traffic run cannot certify production capacity or a 50× catalogue startup on the actual host.

## Test tiers

Run from the repository root after `npm --prefix backend ci` and `npm run build:catalog && npm run build:pages` in a clean candidate:

| Tier | Command | Purpose |
| --- | --- | --- |
| FAST | `npm run test:fast` | Catalogue/search, negotiation, public reference |
| NORMAL | `npm run test:normal` | Tool and serialized backend tests |
| INTEGRATION | `npm run test:integration` | Full local public route suite |
| CRAWL | `npm run test:crawl` | Sitemap pages and every unique internal link at concurrency 16 |
| LOAD | `npm run test:load` | Mixed 500-request profile at concurrency 32 |
| CHAOS | `npm run test:chaos` | Catalogue and DB failure/recovery, missing error templates, shared cache, upstream body disposal |

For additional local profiles: `node tools/benchmark-public-load.js browse 16 300`, `node tools/benchmark-public-load.js search 16 300`, or `node tools/benchmark-public-load.js spike 64 500`. For synthetic size curves: `npm run benchmark:catalog-scale -- --sizes=500,2000,5000,10000 --coverage-full-max=0 --coverage-samples=3 --page-samples=30 --json`.

Additional disk-failure regression: missing 404/500 templates now use a disk-independent escaped constant fallback, preventing secondary template errors from reaching Express stack output. HTML server errors use no-store. Focused regression passed after the environment restart; the interrupted browser smoke result remains unverified.

Import resource regression: redirect bodies are cancelled before following/rejecting a hop, zero redirects is respected, and all completed/rejected fetches abort their request controller to dispose unread bodies. Five focused regressions and existing adapter/cover tests passed (27 total). Database fault injection checks both prepared statements and new queries; assets/sitemap remain readable while health fails and show pages return controlled errors, then recover.

CPU-profile-guided recommendation optimization: a cold browse profile (300 requests, concurrency 16, V8 CPU profiling enabled on both runs) measured 34.6 requests/s, p95 926 ms, p99 2,791 ms before, and 67.5 requests/s, p95 445 ms, p99 1,471 ms after snapshot-scoped normalization and record-coverage caches. All requests were 200. Profiling showed repeated normalization (2.1 seconds sampled in normalizeValue alone) and record coverage dominating the original run. Snapshot-owned WeakMaps reuse those derived values without global cross-catalogue state. The existing similarity suite preserved deterministic outputs; a new regression checks warm comparisons and rebuild invalidation. These are single-run local comparisons, not a production capacity claim.

HTTP listener hardening: headers are bounded to 16 KiB, receipt of headers to 10 seconds and receipt of the complete request to 15 seconds (checked each second); this does not limit application processing after receipt. Raw TCP regressions verify 431 before handler invocation, 408 for incomplete headers/bodies, and healthy follow-up traffic. Additional loopback fetch faults cover a stalled body timeout, oversized streaming body, corrupted gzip, and a subsequent healthy fetch.

Source-write fault regressions: unsafe/duplicate show and collection IDs, unsafe review IDs, and a later invalid collection are rejected before any existing source file is replaced/deleted. A simulated EROFS rename preserves the old JSON and cleans staging files. Import/catalogue compatibility plus these regressions passed 34 tests. The subsequent publication journal and SIGKILL regressions below address process interruption; this is not physical power-loss certification.

Verification update: NORMAL passed (457 backend tests plus the tool suite) before the final source-writer changes, which received the 34-test focused check. Required browser smoke was nonzero on a maintainer-import session-expiry drill. A standalone repeat passed before modification, identifying a timing-dependent test issue: the queue shell becomes ready while Retry still loads detail/discovery/elevation dependencies. The test now waits for the Retry action's aria-busy to clear before introducing the next 401 fault. A fresh browser aggregate is needed; no earlier partial smoke success is an aggregate pass.

50× synthetic run completed: 37,600 shows, 1,880 creators, 1,880 authored plus 1,880 generated similarity collections, and 41,373 sitemap entries. Fixture writing took 5.72 s, catalogue load 6.57 s, collections/routes 3.18 s, similarity index 961 ms, sitemap plus entries 795 ms, and 10 sampled show pages 135 ms. Common creator search scored all 37,600 records in 1.42 s average / 1.90 s p95. The retained multi-stage benchmark reached a 1.33 GB process peak RSS; it holds authored records, runtime projections, artifacts, indexes, and report state simultaneously, so this is not server-only steady memory. Generated raw show data was 133 MB, runtime projection 102 MB, search index 67 MB, and sitemap 4.8 MB. At this scale, monolithic browser catalogue transfer and main-thread ranking are material bottlenecks; introducing browser workers/projections or server-side discovery would require a measured product-compatible follow-up. These measurements ran while browser regressions were active and are rough local scaling evidence.

The tested 41,373 entries fit in one sitemap. The subsequent shard/index implementation below also covers catalogues above that limit. The 50× run is a real local result, not production-host startup or build certification.

Final normal-tier rerun after source changes passed: tool suite plus 457/457 backend tests. Final CHAOS passed all 11 checks (4 route/cache/dependency scenarios and 7 raw HTTP/upstream scenarios). Generated-output boundary check passed. The modified maintainer-import browser file passed both tests; the fresh required-browser aggregate remains pending until its exit result is recorded.

The fresh required-browser aggregate subsequently exited 0 after the Retry synchronization fix. This replaces the earlier interrupted and failing runs; browser evidence is Chromium on this local machine, not physical Safari/iOS or production proof.

A longer mixed profile completed 10,000 requests at concurrency 32: all 200, 438 requests/s, p50 53 ms, p95 147 ms, p99 298 ms. Twenty-four process samples ranged from initial RSS 302 MB through a 365 MB peak to about 204 MB at completion; CPU increased by 21.13 seconds over 22.82 seconds elapsed. This shows cold recommendation warmup followed by stable bounded memory in this short run, not proof against hour/day-scale leaks.

SQLite lock defect: a separate loopback-test database connection holding BEGIN IMMEDIATE caused a normal submission to wait 5,200 ms synchronously and return 500. Runtime busy_timeout is now 100 ms after migrations (startup retains 5,000 ms); SQLITE_BUSY/SQLITE_LOCKED return 503 with Retry-After: 1 and no-store. A regression holds a real lock, verifies cheap rejection and available public reads, rolls the lock back, and verifies submission recovery. This avoids one maintenance writer multiplying into multi-second event-loop stalls per queued write request.

Final lock result: 503 in 134 ms (5,200 ms / 500 before). Ten additional writes during the pause fail quickly without another DB wait; public sitemap reads continue, readiness is temporarily 503, and readiness/submission writes recover after release and Retry-After. Final normal run passed 458/458 backend tests plus all tool tests. The write-pause addition also passed its focused real-lock drill after that run. Required Chromium browser aggregate exited 0. No deployment, push, or live production traffic was performed.

Remaining scope is explicit: physical power-loss durability of the publication journal is unverified; no hour/day soak, actual disk-full filesystem, or production-host fault test was performed. The local cache proxy does not establish the account's actual Cloudflare rule configuration. This candidate substantially hardens measured failure modes, but those gaps prevent claiming that every requested drill or production-readiness gate is complete.


## Restart, transport, and sitemap follow-up — 2026-10-02

- A private filesystem publication journal snapshots authored source, generated catalogue files, reviews, and promoted covers before mutation. Nested catalogue generation joins the owning publication. Failed publication restores those files; SIGKILL recovery runs before server startup loads public state. Pure catalogue readers report an incomplete publication without mutating it. Committed journal cleanup retires the journal directory atomically. Another live publisher receives 503. The old importer staging lock was removed; the root publication journal now owns mutual exclusion and does not leave a permanent stale lock after process death.
- Import candidate statuses and identity bindings commit in one SQLite transaction. A persisted recovery plan reconciles that bookkeeping with restored files if the process dies after SQLite commit and before the filesystem commit marker. Recovery touches publication fields, not unrelated community data. Child-process SIGKILL regressions cover a partial source batch, changed generated data, the SQLite commit gap, successful commit, and a live owner. A server integration regression verifies startup recovery before healthy show responses. These tests exercise process death, not disk-controller/power failure or actual disk exhaustion.
- Import DNS validation now runs in the actual undici socket lookup, preventing a changed private DNS answer from reaching a connection. DNS resolution, redirect handling and body reads share one total timeout. Expanded IPv6 representations are normalized before private-network checks. Same-origin redirects retain credentials; cross-origin redirects forward only Accept, Accept-Language and User-Agent. Regression fixtures prove DNS rebinding rejection, a stalled DNS deadline, expanded loopback/mapped IPv6 rejection, credential stripping, and disposed response sockets.
- Sitemap generation produces a root index and shards above 50,000 URLs or 52,428,800 UTF-8 bytes. Both server state and static generation share the implementation; normal-size output remains a single file. Regression XML validates 50,014 unique URLs in two shards and a canonical index, plus byte-based splitting with Unicode. Limits follow [the sitemap protocol](https://www.sitemaps.org/protocol.html). Documents remain precomputed at load/refresh rather than per request.
- NORMAL exited 0 with the tool suite and 462 backend tests before the final sitemap and startup-recovery additions. The later focused import/transport suite passed 38 tests, journal suite passed 5, startup recovery passed, sitemap suite passed 5, and generated-output boundary passed. CHAOS exited 0 with the startup and journal drills included. Later integration/crawl results are recorded after completion below.


Latest verification and additional RSS findings:

- The refreshed NORMAL command exited 0: 158 tool passes, 5 intentional platform skips, and 465/465 backend tests. INTEGRATION passed 24/24 public-route scenarios. The separate RSS/import follow-up passed 30 tests after that aggregate; its large-feed CHAOS fixture passed separately. The journal suite now has 7 passing scenarios, including simulated backup ENOSPC and rollback EROFS recovery followed by a successful new publication.
- CRAWL fetched 884 sitemap pages plus 3,749 internal destinations: all 4,633 returned 200. Canonicals, titles, descriptions, OpenGraph title/description, structured-data syntax, and sitemap/noindex consistency passed across all sitemap pages. External platforms are excluded. The crawl understands sitemap indexes and constrains shard fetching to the disposable local origin. This checks metadata structure, not editorial quality or external links.
- RSS duplicate GUIDs previously counted twice. Changed GUIDs pointing to the same enclosure also duplicated observations. Explicit GUID/enclosure identities now deduplicate observations without merging matching titles alone. A fixture proves unknown/malformed dates remain unknown and incomplete feeds remain observed counts. A 910 KB feed with 130,000 small items previously threw RangeError from the season-count argument spread; a reduction fixes that defect. Parser depth-limit failures now have a permanent IMPORT_INVALID_XML classification instead of retrying malformed feeds as transient outages. The large-item fixture remains in CHAOS rather than normal development tests.

The most likely bottleneck at 10× traffic remains cold recommendation scoring and dynamic page rendering on one Node event loop. At 50× catalogue size, the generated monolithic browser data transfer and browser-side search become additional material bottlenecks. Neither finding justifies distributed caching from this local evidence.

Final CHAOS exited 0 with 25 passes: 6 route/cache/dependency/startup checks, 11 transport/raw-HTTP checks, 7 publication recovery checks, and the 130,000-item RSS fixture. All work remains local to the isolated candidate; no production traffic, deployment or push occurred.
