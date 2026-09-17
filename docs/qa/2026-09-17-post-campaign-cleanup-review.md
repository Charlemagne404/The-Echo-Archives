# Post-campaign cleanup and review

Date: 2026-09-17  
Scope: Phase 1 factual cleanup, Phase 2 entity reconciliation, and Phase 3
Batches 1–23  
Review mode: cleanup and validation only; no new enrichment batch selected

## Current final state

- **Published shows:** 752. The catalog has 517 `imported` factual-only records,
  228 `indexed-only` records, and 7 `full-review` records.
- **Editorially eligible shows:** 235. All 235 have a curated discovery profile
  with tones, tags, best-for signals, and authored similarities. No imported
  records were promoted into editorial enrichment during this review.
- **Curated-profile coverage:** 235/235 eligible records, 100%.
- **Collections:** 46 non-empty collections, 1,115 authored memberships at the
  pre-recovery cleanup snapshot, and descriptive reasons on all 46 collections.
  That snapshot had 371 shows with membership and 250 with at least two. The
  current post-recovery count is 1,112 valid memberships across 371 shows, with
  249 having at least two; 381 remain uncollected.
- **Authored similarity:** 447 authored links with 447 reasons across 17
  similarity routes. The authored graph has no self-links, unknown targets,
  duplicate links, missing reasons, or orphaned reasons.
- **Public recommendation coverage:** the similarity report finds at least one
  candidate for 752/752 shows and at least three for 752/752; 750/752 reach the
  diagnostic five- and eight-candidate bands. This is computed candidate
  coverage, not a claim that all records have authored editorial links.
- **Entities:** 132 public entities, 318 relationship records, and 266 linked
  published shows. The authored registry contains 96 organizations and 36
  people; 55 organization-led entities are visible in the main directory.
  There are no orphan public entities or invalid relationship references.
- **Gate B:** complete. The current catalog report has zero blockers and passes
  the numeric floors (752/129 shows, 7/7 full reviews, 46/29 collections).
  Six missing RSS links, four runtime gaps, and 29 remaining show-level research
  gaps are explicitly documented after removal of the 558 generic recovery
  notices. Creator verification remains at 0 live verified shows.

## Fixes made

### Factual/catalog

No authored show record required a clear, evidence-backed correction during this
pass. The source audit found no duplicate field values, invalid provider URLs,
invalid dates, duplicate aliases, malformed IDs, invalid references, or
contradictory values that could be corrected without guessing. The corrected
facts from Phases 1–3 remain intact.

The audit confirmed that the shared provider identities are explainable rather
than accidental: the Magnus Archives/Magnus Protocol pair shares franchise
provider links, Artifacts of Arcane and Thieves Guild share Podcast Alchemy,
and Subjective Truth and Two Flat share Good Pointe. These were not rewritten.

### Editorial metadata

No low-risk editorial rewrite was justified. The 235 profiles have distinct
complete packet signatures; repeated controlled values such as `tense`,
`cinematic`, `headphones`, and `binge` are vocabulary reuse, not evidence of
duplicate generated copy. No generic campaign string, unsupported rating, or
obvious contradictory profile was found. The approved taxonomy has no unknown
labels; one approved label (`Sleeper ship`) is currently unused and was not
forced into a record.

### Similarity graph

No link or reason was changed. The full authored graph passed structural checks.
There are 47 reciprocal pairs, but no exact reason text is repeated three or
more times. The two shortest reasons are still directional and meaningful.
Popular hubs were retained when their relationships were legitimate; no
genre-only relationship was removed merely for being broad.

### Collections

No membership or collection was changed. All references and reasons are valid,
there are no duplicate memberships or near-duplicate collection pairs, and the
collection reason fields remain listener-facing. Uneven collection sizes were
treated as editorial shape, not a requirement for numerical symmetry.

### Entities

No entity or relationship was changed. The conservative Phase 2 policy remains
intact: unresolved one-off creator strings and compound credits stay in manual
review queues rather than becoming public pages. The graph has no orphan public
entities, duplicate normalized aliases, invalid references, or infrastructure
labels accidentally promoted as production entities.

The 43 known type/role divergence warnings remain visible because they describe
source-backed role differences, such as a canonical network receiving a
production-company role on a particular show. They are not silently normalized.

### Generated artifacts

The deterministic rebuild completed:

```text
Built catalog artifacts for 752 shows, 46 collections, and 7 review companions.
```

`check:generated` passed. Generated catalog data, entity data, collection data,
similarity data, search data, status reports, and generated page output showed
no unexpected catalog churn. The generated catalog status remains current at
2026-09-17.

### Documentation

Updated stale active snapshots in:

- `docs/CURRENT_STATE.md`
- `docs/ROADMAP.md`
- `docs/OPERATIONS.md`
- `docs/ARCHITECTURE.md`
- `docs/CREATORS.md`
- `docs/ENTITY-ENRICHMENT-CANDIDATES.md`

These updates correct the current date, Gate B status, catalog/entity counts,
collection/similarity follow-up counts, and the compound-evidence queue. They do
not rewrite historical QA reports, product philosophy, or roadmap direction.

### Code/tooling cleanup

No temporary files, abandoned campaign scripts, dead helpers, debug logging, or
commented-out experiments were clearly attributable to this campaign. No code
or tooling was deleted.

## Issues deliberately left alone

- `Welcome to Night Vale` is the one `full-review` record without a numeric
  archive rating in the discovery-quality report. No rating was invented.
- `impact-winter` reports an inactive release feed alongside an ongoing
  completion state and a research gap about future-season status. That may be a
  feed-lifecycle distinction; it needs source review before changing either
  field.
- The entity graph has 486 published shows without explicit entity links and
  707 shows with zero or one relationship. The candidate report has 31 manual
  new-entity leads and 84 shows with compound evidence. These require
  source-backed human decisions, not automatic reconciliation.
- 381 shows have no collection membership, and 502 have fewer than two. The
  low-membership collection candidates are useful review queues, not permission
  to force shows into collections.
- The authored similarity report marks 671 links outside its preferred range.
  No scoring weights, thresholds, or authored relationships were changed.
- The provenance report still classifies all 752 records as legacy/unknown for
  explicit documented provenance, despite existing objective source evidence
  and importer evidence on 683 records. A provenance migration is a separate
  project and was not fabricated during cleanup.
- The 27 `metadata.reviewFile` pointers are schema-supported companion-review
  references, not stale pointers; they were retained.
- Historical QA, research, and release snapshots remain in `docs/qa/` and
  related documentation. They were not deleted or rewritten merely because
  newer counts exist.

## Graph-health review

The authored similarity graph is concentrated in one editorial component of 236
shows, with 516 isolated published nodes. This is expected from the tier policy:
the 235 eligible records carry authored discovery context, while imported
records remain factual-only. It is a real limitation for recommendation depth,
not evidence that the authored links are malformed.

The strongest incoming authored hubs are Midnight Burger and The White Vault
(16 each), Archive 81 (13), Ars Paradoxica (12), and Oz 9, Deca Tapes, The
Magnus Archives, and Welcome to Night Vale (10 each). Entity hubs include Realm
(21 linked shows), Bloody FM (17), iHeart (13), QCODE (10), and Rusty Quill
(8). These hubs should be watched for concentration, but the audit found no
pathological exact-reason repetition or evidence that legitimate hubs should be
removed.

Collection coverage is intentionally uneven. The largest collections are
Headphones (107), Late-night (99), Ongoing Sci-fi (76), Episodic Comedy (71),
and Completed Drama (63). The collection report found no near-duplicate pairs;
the remaining imbalance is coverage, not structural duplication.

The main discovery deserts are imported-only records without editorial
profiles, the 381 uncollected shows, the 486 entity-unlinked shows, and sparse
legacy records with no independent creator evidence. Computed candidate search
still reaches every published show at the minimum diagnostic band, but that
does not replace authored reasons, entity evidence, or collection context.

## Validation results

All commands below were run against the final source state unless noted.

| Command | Result |
| --- | --- |
| `npm run build:catalog` | Passed; 752 shows, 46 collections, 7 review companions |
| `npm run build:pages` | Passed |
| `npm run validate:data` | Passed with 0 integrity errors; 43 known entity type/role warnings |
| `npm run report:discovery-quality` | Passed; current coverage and blind spots reported |
| `npm run report:similarity` | Passed; 447 authored links/reasons, no structural errors |
| `npm run report:collection-candidates` | Passed; no invalid references or near-duplicate collections |
| `npm run report:entity-graph` | Passed; no orphan entities, invalid records, or legacy-link conflicts |
| `npm run report:entity-candidates` | Passed; manual-only candidate queues reported |
| `npm run report:provenance` | Passed; legacy/unknown provenance boundary reported explicitly |
| `npm run report:catalog` | Passed; Gate B complete, 0 blockers |
| `npm run check:generated` | Passed; generated boundary valid, 170 generated pages ignored and 32 authored HTML files preserved |
| `npm run check:structure` | Passed with existing soft-limit warnings for large source/style files and cover assets |
| `npm run test:tools` | 81 passed, 2 failed, 3 skipped out of 86; failures are host-specific (`stat -c` on macOS and a fixture requiring `/usr/bin/node`); skipped tests require Restic |
| `npm --prefix backend run verify` | Parallel run reached 364/365 backend tests; one rate-limit assertion was flaky and returned 200 instead of 429 |
| `npm --prefix backend run test:serial` | Passed; 365/365 |
| `npm --prefix backend run test:smoke` | Passed; all grouped browser smoke batches passed |
| `npm run verify` | Build, pages, structure, and generated checks passed; it stops at the same two host-specific tool-test failures before invoking backend verification |
| `git diff --check` | Passed |

The parallel backend rate-limit failure did not reproduce in the supported
serial suite. None of the failing host-specific tests touch campaign catalog
data, and no unrelated production code was changed to make them pass.

## Human review recommendations

1. Review the preserved UI/source worktree changes separately before committing;
   they are not part of this cleanup.
2. Decide whether `Welcome to Night Vale` should receive a human archive rating
   or remain unrated.
3. Review the 43 entity type/role divergences and the 486-show entity queue only
   when independent source evidence is available.
4. Treat the 29 remaining show-level research gaps, six RSS gaps, four runtime gaps, and legacy
   provenance boundary as explicit follow-up—not as reasons to resume automatic
   enrichment.
5. If a fully green root verify is required, run the two failed tools tests in
   their expected Linux/production runtime or handle that host-compatibility
   work in a separate tooling change.
6. Complete deployment, provider, backup/recovery, monitoring, and live-device
   browser review separately; local validation does not prove those gates.

## Worktree summary

### Cleanup changes

- Added this QA report.
- Updated six active documentation files listed above.
- No files under `catalog-src/` or `data/` were changed by this cleanup.
- No generated catalog/status diff remained after the deterministic data rebuild.

### Unrelated user changes preserved

The following modifications appeared during the shared-workspace validation and
were left untouched:

- `backend/test/show-detail-navigation.smoke.js`
- `shared/app/pages/home.js`
- `shared/app/pages/home/results.js`
- `shared/app/pages/home/state.js`
- `shared/app/scroll-restoration-boot.js`
- `script.js`
- `sw.js`

They implement a browse-grid scroll/result restoration change, its smoke test,
and associated runtime hash updates. They should probably be reviewed and
committed separately from this documentation cleanup.

The worktree is intentionally not clean: it contains the cleanup documentation
plus those preserved unrelated changes. Nothing was committed, pushed,
deployed, published, reset, reverted, or stashed.
