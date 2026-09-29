# Discovery 2.0 homepage integration QA — 2026-09-29

## Scope and result surfaces

This report covers the local homepage integration of the deterministic Discovery 2.0 engine. The existing search input, filter controls, compact cards, collection links, creator links, results summary, and empty-state panel remain the visible surfaces. Recognized rich queries use the Discovery adapter; exact titles, ordinary text, and bounded typos retain the existing scorer. The worktree was not committed or published.

The browser flow covers exact title lookup, combined finished and genre criteria, reloadable public query state, exclusions, authored and computed similarity ordering, typed creator relationships, runtime qualifiers, collection routes, unsupported and ambiguous phrases, strict hard-range empty results, private listening-history handling, Back/Forward scroll restoration, and mobile card density. Local listening intent remains out of public URLs and the adapter does not read Library state.

The presentation adds only a short conditional note inside the existing results summary and uses the existing empty-state panel for clarification, privacy, collection, and strict no-result outcomes. Exact title lookup adds no note. No navigation item, persistent panel, or query-builder surface was added.

## Visual comparison

The full-page desktop and mobile captures were reviewed side by side. The default homepage retains its existing hero, browsing sections, card density, and page height.

| Viewport | Before / after | Hero | Search | Initial cards | Card width | Page height | Overflow |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| Desktop, 1440 × 1000 | identical | 430 / 430 px | 56 / 56 px | 60 / 60 | 212 / 212 px | 7,134 / 7,134 px | — |
| Mobile, 390 × 844 | identical | 656 / 656 px | 54 / 54 px | 60 / 60 | 173 / 173 px | 14,688 / 14,688 px | none |

| Desktop | Mobile |
| --- | --- |
| [Before](../../output/playwright/pre-integration-desktop.png) · [After](../../output/playwright/post-integration-desktop.png) | [Before](../../output/playwright/pre-integration-mobile.png) · [After](../../output/playwright/post-integration-mobile.png) |

The detailed captures and measurements are also available in [`output/playwright/`](../../output/playwright/).

## Query and URL evidence

The captured browser results include:

- `finished sci-fi`: 29 results with `genre=sci-fi` and `completionStatus=finished`; every visible result satisfies both requirements after reload.
- `sci-fi but not comedy`: hard include/exclude criteria are shareable and every visible result satisfies them.
- `something like The White Vault but sci-fi`: 10 results, with 7 authored archive picks before 3 computed matches.
- `shows by the people behind The White Vault`: the existing result surface shows the two linked creators alongside the matching show.
- `around 10 hours`: the browser check verifies that surfaced runtime evidence is qualified as observed, reported, or estimated; the runtime contract and unit coverage preserve unknown where evidence is absent.
- `Best for long walks`: the existing empty-state surface links to the curated collection route.
- Unsupported `darker` wording remains visible as unused text; `horror` remains visibly ambiguous and uses the supported genre interpretation.
- `shows I have finished`: explains that public search does not use private listening history and omits the query text from the URL.
- `at least 100000 hours`: returns a strict no-match state instead of relaxing the hard runtime condition.

## Performance and generated runtime evidence

The paired in-memory query sample below was captured on 2026-09-28 with Node v24.14.1, the hydrated 752-record search index, two warm-ups, and 20 interleaved calls per query. It compares `archiveSearch.scoreCatalog` with full `engine.retrieve` on the same catalogue. It is not a browser end-to-end latency measurement. The homepage dispatches simple searches to the existing scorer, so the first two rows describe the engine comparison rather than an extra cost paid by those integrated page paths. Shared-worktree load makes the tail unsuitable as a release guarantee.

| Query | Existing scorer median | Full Discovery median | Difference |
| --- | ---: | ---: | ---: |
| `Midnight Burger` | 28.29 ms | 29.13 ms | +0.84 ms |
| `finished sci-fi` | 38.24 ms | 41.55 ms | +3.31 ms |
| `something like The White Vault but sci-fi` | 47.46 ms | 1.25 ms | −46.21 ms |
| `people behind The White Vault` | 46.90 ms | 0.23 ms | −46.67 ms |
| `QCODE` | 20.07 ms | 0.64 ms | −19.43 ms |
| `around 10.9 hours` | 37.94 ms | 8.32 ms | −29.62 ms |

The separate public runtime projection contains 752 rows and is 105,978 bytes raw (12,242 bytes gzipped). It contains public length evidence and runtime-gap flags, remains separate from `data/search-index.json`, and contains no Listener Library data. The homepage starts this fetch alongside core search data without making page readiness wait for it.

When the homepage is visited, the service worker now warms its versioned search index, collections, and runtime projection explicitly; these resources are not added to the global install precache. The offline browser check verifies all three cache entries, confirms APIs bypass the cache, and exercises a cached home reload and an uncached-route fallback.

## Verification

- `rtk npm run benchmark:discovery -- --strict` passed on 2026-09-29. The catalogue fingerprint matched the frozen baseline; all 57 baseline observations were unchanged; all 84 Discovery 2.0 assertions passed; there were zero hard-constraint violations.
- `rtk npm verify` passed on 2026-09-29: catalog/page builds, structure and generated-boundary checks, release-artifact check, tools tests (149 passed, 0 failed, 5 platform-dependent skips), deterministic build (1,552 generated files), backend validation/link checks, serial backend tests (444 passed), and required Chromium smoke (96 passed, 0 failed, 0 skipped).
- The required Chromium run passed the offline service-worker check, including cache checks for all three visited-home data resources, and the Discovery 2.0 integration case with URL/history and mobile coverage.
- Content validation reported zero integrity errors and non-blocking source-backed entity-role warnings. The release-artifact check reported no warnings. `rtk git diff --check` passed, and `data/search-index.json` stayed unchanged.

The strict benchmark and this local browser report are worktree evidence. They do not constitute staging, release, or production verification.
