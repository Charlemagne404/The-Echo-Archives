# Show Importer Review-and-Publish QA — 2026-07-14

## Outcome

The factual import lane reached review-and-publish operation for ordinary source-rich shows. A prepared record stays in SQLite, and an authenticated approval publishes it without manual catalog or cover editing. Existing factual/editorial work is protected by legacy ownership, managed fingerprints, and reviewer locks.

No ratings, reviews, archive copy, tones, best-for values, similarities, collection placement, popularity, awards, or creator-verification claims were generated during QA.

## Real-World Temporary-Storage Smoke

Command:

```bash
npm --prefix backend run import:live-smoke
```

The smoke used live mutable sources and temporary SQLite/catalog/cover storage. Podcast Index credentials were not configured, so this pass exercised Apple, RSS, official-site, caching/security, resolution, and cover staging paths.

| Seed | Result | Observed behavior |
| --- | --- | --- |
| Midnight Burger | `ready` | Apple + RSS + official site; 86 full, 15 bonus, 3 trailers observed; 600px Echo-ready cover; Apple cover-size warning |
| Spectre | `ready` | Apple + RSS; 9 full, 1 bonus, 2 trailers; official site returned 403; completion remained honestly unknown |
| Welcome to Night Vale | `ready` | Apple + RSS + official site; 367 full episodes observed; 1400px cover |
| The Magnus Archives | `ready` | Apple + RSS + official site; 380 full, 4 bonus, 11 trailers; 1500px cover |
| Case 63 | `ready` | Apple + RSS; official site failed; 21 full and 1 trailer observed; 3000px cover |
| King Falls AM | `ready` | Apple + RSS; old feed was not treated as cancelled/completed; 116 full episodes observed; explicit status warning |
| De dödas röster | `needs-review` | Apple title discovery resolved to a different Swedish feed; out-of-scope and title-identity ambiguity are explicit blockers |

Mutable counts are reported by the command rather than asserted. The command requires at least two source-rich references to become ready and requires every non-ready unusual result to expose named blockers. Six of seven results were ready in this run.

## Synthetic Scale Benchmark

Command:

```bash
npm --prefix backend run import:benchmark
```

Measured temporary-storage result:

| Measure | Result | Requirement |
| --- | ---: | ---: |
| Candidate seed + idempotent identity claims | 0.981s | < 30s |
| Source snapshot insertion | 20,000 in 0.620s | 20,000 |
| Evidence insertion | 250,000 in 2.230s | 250,000 |
| FTS queue lookup | 4.5ms | < 250ms |
| 5,000-show catalog validation/build | 1.581s | < 60s |
| Process RSS memory after workload | 251.7MB | < 512MB |

The worker is bounded to four candidates and two requests per host by default. Batch publication integration coverage asserts one build for two individually reviewed ready records; the same code path handles larger reviewed batches.

## Automated Coverage

The final `npm verify` run passed: catalog/page builds, structural validation, 9 tooling tests, 166 backend tests, link/data validation, and the complete Playwright smoke suite. The dedicated maintainer-import browser smoke also passed and is now part of the default smoke runner.

Backend and browser tests cover:

- RSS and Atom parsing, CDATA/entities, nested categories, Podcasting 2.0 GUID/people/funding/license/transcripts, full/bonus/trailer counts, scheduled and missing-duration behavior, malformed XML, and prohibited DTD/entities
- official-site structured data, expanded listen/support/social link classification, and depth-one crawl limits
- deterministic source agreement/conflict confidence, reviewer selections, and weak unstructured evidence
- unsafe/private URLs, redirects, timeouts, response limits, MIME validation, and JSON/XML failures
- cover byte sniffing, dimensions, square/minimum checks, Apple quality warnings, corrupt/SVG/mismatched input, stable hashes, and remote byte replacement
- idempotent identity upsert, FTS queue search, snapshot retention, cache compression, lease recovery, retry exhaustion, and field locks
- direct ready publication, factual-only records, legacy/human field protection, explicit failure blockers, batch review/build behavior, and rollback after failed validation
- authenticated asynchronous `202` intake, persistent run progress, compatibility preparation aliases, and review state
- maintainer UI progress, ready/blocked previews, cover quality, provenance, conflict selection, retry, review, and approval controls
- factual indexed-publication versus editorial Gate B validation

## Remaining Human Judgment

Maintainers still decide:

- whether borderline or non-English results belong in catalogue scope
- which high-confidence value wins a genuine official-source identity/title/creator/completion conflict
- whether a title-only discovery result is the intended show
- whether optional missing credits, transcripts, platform links, or exact counts merit follow-up
- all editorial ratings, reviews, archive copy, tones, recommendations, collections, tags, awards, and creator-verification decisions

These are judgment calls rather than manual data-entry requirements. Every non-ready candidate is required to name its exact blocker and retain the competing evidence.

## Assessment

True review-and-publish is achieved for ordinary source-rich imports: automated preparation reaches `ready`, the prepared JSON and cover can be inspected, approval publishes directly, repeat imports preserve human work, and indexed factual records no longer depend on editorial discovery fields. Unusual or uncertain shows degrade to explicit `needs-review` rather than receiving invented facts.
