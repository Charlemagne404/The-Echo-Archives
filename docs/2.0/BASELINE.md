# The Echo Archives 2.0 — v1.2.7 executable baseline

**Captured:** 2026-09-28<br>
**Baseline commit:** **55ca3969c850cabbc3c0159aae4e3c77da7e0410** (main, v1.2.7)<br>
**Purpose:** distinguish later 2.0 regressions from the behavior and known limits already present at the implementation baseline. This is a local repository baseline, not production, CI, or deployment proof.

## Checkout and catalogue revision

At the first status check, HEAD and the local origin/main tracking ref both named the baseline commit. The only worktree addition was the requested, untracked docs/2.0/ planning set. No tracked v1.2.7 source change was present.

The catalogue trees at that commit are:

| Tree | Revision |
| --- | --- |
| Authored catalog-src/ | 72aaea11ec81c28052ce576734e18468f8419870 |
| Generated data/ | 2f696eb412e1c98e79dc0020da7a0f418e2484d7 |

During this capture, separate concurrent work appeared in package.json, backend/package.json, backend/test/fixtures/, backend/test/listener-library.test.js, shared/library/, tools/lib/discovery-golden-benchmark.js, and tools/report-discovery-benchmark.js. Those files are not part of the baseline commit and were not edited in this session. They appeared after the baseline test commands had started; treat this record as evidence for commit 55ca3969, not as a claim that the final shared worktree is pristine. The current worktree must be rechecked before integration.

At the final worktree check, concurrent additions also included docs/2.0/LISTENER-LIBRARY-PLATFORM.md, docs/2.0/discovery-benchmark/, and tools/test/discovery-golden-benchmark.test.js. They are not part of the v1.2.7 baseline and were not edited in this session. Their state and contract parity must be reviewed independently before integration.

## Environment

- macOS host, Darwin 25.5.0, arm64.
- Node.js 24.14.1; npm 11.11.0.
- Playwright 1.60.0; the installed Chromium executable reports Google Chrome for Testing 148.0.7778.96.
- Browser smoke used the default Chromium target and local test servers. Firefox and WebKit were not run.

## Catalogue and generated-output state

| Check | Result |
| --- | --- |
| **rtk npm run validate:data** | Exit 0. Validated 752 shows and 54 runtime collections. Content integrity reported 0 errors across 752 shows, 47 source collections, 132 entities, and 7 review companions. Existing warnings cover entity type/role divergence and some duplicate multi-role links. |
| **rtk npm run report:catalog** | Exit 0. 752 published shows, 0 drafts, 54 runtime collections, 7 review companions, 0 missing similarReasons, and 0 Phase 2 blocking errors. It reports 502 shows with weak collection coverage, 6 missing RSS links with 0 actionable RSS gaps, and 29 documented research-gap records. |
| **rtk npm run check:generated** | Exit 0. The generated HTML boundary is valid: 170 generated pages are ignored and untracked; 32 authored HTML files are preserved. |
| **rtk npm run check:structure** | Exit 0. Existing warnings report files above the 350-line soft limit and referenced covers above the 500 KB soft limit. No hard structure failure was reported. |
| Generated data drift from report:catalog | shows, collections, search-index, and catalog-status all report ok. No builder was run and no generated public artifact was edited. |
| **rtk npm --prefix backend run check:links** | Exit 0. Local links, anchors, and assets validated for 18 public pages, 752 shows, and 54 collections. |
| **rtk npm --prefix backend run check:config** | Exit 0. Development configuration is valid. |

The 54 runtime collections include generated similarity routes; validation and recommendation reports distinguish those from the 47 authored source collections.

## Search, discovery, and recommendation reports

The root package scripts at the baseline include report:catalog, report:similarity, report:recommendation-coverage, and report:discovery-quality. There is no dedicated search-latency or query-quality report in that package version; exact-title, alias, filter, and history behavior is covered by backend tests.

| Command | Baseline result |
| --- | --- |
| **rtk npm run report:discovery-quality** | Exit 0. 235/752 shows (31.3%) have a curated discovery profile. All 752 have a genre; 749 have a format. Tones, tags, best-for routes, and similar-show metadata are present on 235 shows. The other 517 are imported factual-only records. |
| **rtk npm run report:similarity** | Exit 0. 447 curated similar links have 447 written reasons; 17 authored similarity routes are reported. The public candidate gate requires at least two dimensions and one factual anchor. At least one diagnostic candidate exists for 746/752 shows; public computed Try Next coverage is separately measured below. |
| **rtk npm run report:recommendation-coverage** | Exit 0. 236/752 shows (31.4%) have authored or computed recommendation coverage; 160 have a public computed Try Next match; 24 Shows Like routes comprise 17 authored and 7 generated routes. Six catalogue-isolation cases and 510 imported-policy-limited records account for the remaining uncovered/thin set; no malformed recommendation references or rejected public-gate candidates were reported. |
| **rtk npm --prefix backend run report:discovery-gaps** | Exit 0. The legacy 3-to-5 authored-similar-link heuristic lists 671 shows outside that range. Treat this as a historical link-count diagnostic, not as a surface-aware recommendation failure. |

The coverage reports are catalogue audits, not relevance approval. They do not justify lowering evidence gates or promoting imported source keywords into editorial discovery fields.

A separate read-only golden-query benchmark was added to the shared worktree after the v1.2.7 package baseline. Running its current command, `rtk npm run benchmark:discovery`, exited 0 in report mode and verified the recorded baseline/catalogue fingerprint against HEAD: all 57 baseline observations were unchanged. Among 78 supported target assertions, 2 failed; 82 future-v2 assertions remain unsupported. Exact identity passed 14/14, acceptable recall passed 12/12, v1 query-shape recognition passed 19/19, routes 5/5, typed entity retrieval 5/5, and explanation evidence 9/9. The two failures are the same underlying case, `similarity-white-vault-sci-fi__: `the-harrowing__ appears in the top five for “something like The White Vault but sci-fi” without sci-fi evidence, violating both the prohibited-result and hard-constraint assertions. This is a pre-existing v1 discovery limitation, not a 2.0 regression. The report and fixture are in the concurrently added [Discovery benchmark README](discovery-benchmark/README.md); its command and implementation are not part of the pinned v1.2.7 package manifest.

## Tests and browser checks

Commands were selected from the root and backend package manifests at the baseline. npm run verify was not run: the root aggregate runs catalogue/page builders and the repository instructions reserve it for deliberate release verification. Its relevant checks were run individually below; this is not a claim that the aggregate verify command ran.

| Command | Result |
| --- | --- |
| **rtk npm run test:tools** | Exit 0: 98 passed, 0 failed, 5 skipped, 103 total. Skips require Linux production-host tooling or Restic, unavailable in this macOS environment. |
| **rtk npm --prefix backend test** | Exit 0: 435 passed, 0 failed, 0 skipped. |
| **rtk npm --prefix backend run test:smoke** | Exit 0 in Chromium: 82 passed, 0 failed, 0 skipped. |
| **rtk npm --prefix backend run test:smoke:required** | Exit 0 in Chromium: 82 passed, 0 failed, 0 skipped. |

The optional smoke command may exit successfully with an explicit skip when its browser is absent. The required command fails closed in that case. In this environment Chromium was installed, so both commands ran the full batch. Backend unit tests also passed the smoke-runner checks for optional skip and required failure when a browser is missing.

No test failures or flaky reruns were observed in this baseline run. No concurrency-sensitive failure was reproduced.

## Repeatable local timing sample

These are repeat wall-clock samples of existing full-catalogue report operations, not browser interaction latency or release budgets. Both runs used the environment above and the same 752-show catalogue; cache state and background host load were not controlled. Concurrent work was active in the shared host, so the spread is recorded rather than treated as a stable budget.

| Command | Wall time |
| --- | ---: |
| **rtk proxy /usr/bin/time -p npm run report:similarity** | 37.22 s; 47.17 s |
| **rtk proxy /usr/bin/time -p npm run report:recommendation-coverage** | 31.89 s; 32.21 s |

Repeat those exact commands on the same catalogue tree and comparable hardware for a before/after comparison. The repository has no controlled browser search-latency, first-useful-result, or memory benchmark yet. These samples show host-load variance, and no milliseconds or percentage budget is frozen from them.

## Public routes and legacy aliases

The page manifest and public-route tests define these route families:

- Browse and information: /, /about, /for-creators, /creator-standards, /supporters, /help-center, /privacy, /terms, /cookies, and /copyright.
- Discovery directories and details: /collections, /collections/:collectionId, /creators, /creators/:entityId, /shows/:showId, and /submit.
- Private maintainer pages: /maintainer/submissions.html, /maintainer/submissions/report.html, /maintainer/imports.html, /maintainer/imports/report.html, /maintainer/collections.html, and /maintainer/analytics.html.
- Error/offline shells: /404.html, /500.html, and /offline.html.

Important compatibility routes include /show?id=:showId and its /show.html and /show/index.html forms redirecting to /shows/:showId; /collection?id=:collectionId and /collection.html?id=:collectionId redirect to /collections/:collectionId; extension routes such as /collections.html redirect to /collections; and case/trailing-slash variants normalize to clean routes. Three older nested show files remain redirect aliases: shows/Impact Winter/impact-winter.html, shows/ars paradoxica/ars-paradoxica.html, and shows/oz9/oz9.html.

Public browse URL state currently uses q, collection, repeated genre and structured filter-group keys, plus sort. Collections use q, intent, and sort; the creator directory uses q, type, and sort. Existing page helpers preserve rendered Back/Forward state. These public contracts contain no Library state.

## Service worker and privacy boundaries

- tools/build-pages.js generates the worker. Install precaches a small offline shell and versioned assets. Successful same-origin navigations are cached network-first; offline navigation tries the visited HTML, a precached URL, then /offline.html. Assets are cache-first, with background refresh for non-immutable requests.
- Only same-origin GET requests are handled. /api/ and external requests bypass the worker. The worker precache does not include the full catalogue or user state; activation removes obsolete Echo caches. Browser-owned storage is independent of those caches.
- The manifest controls analytics inclusion per page. The first-party event schema allowlists bounded fields and rejects raw search/query text. Search events carry query-kind and result/filter buckets, not the entered text. Anonymous visitor/session identifiers use separate localStorage and sessionStorage keys.
- Community ratings/reviews, submissions, protected maintainer workflows, and aggregate analytics are server-backed. No Library API, IndexedDB Library, or personal listener profile exists in the baseline commit. Private Library state must remain separate from these services and from the existing analytics identifiers.

## Baseline limitations to carry forward

- Catalogue enrichment is uneven by policy: 517 imported records are factual-only. Missing tones, themes, tags, listening context, or typed creator evidence must remain unknown.
- The existing entity relationship and structure warnings above are baseline warnings, not new 2.0 failures.
- Chromium was verified locally; Safari, Firefox, WebKit, a physical mobile device, production, and CI were not verified by this capture.
- Report wall times are two local samples per command with uncontrolled host load and do not set performance budgets. No Library storage timing exists because v1.2.7 has no Library implementation.
- The results in this file are pinned to commit and catalogue tree revisions above. Re-run the same commands after integration; do not compare against a changed catalogue, a different browser, or an unisolated worktree without recording that difference.
