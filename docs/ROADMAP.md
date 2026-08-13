# Roadmap

## Purpose

This is the active roadmap for taking The Echo Archives from its current public-beta shape to a stronger, broader, more trustworthy discovery product.

Use it as the source of truth for:

- sequencing
- milestone targets
- phase-by-phase work
- launch gates
- current status
- open questions

Historical planning docs live in `docs/archive/`.

## Current Baseline

The live catalog baseline now lives in `docs/generated/catalog-status.md`.

The shipped repo state includes:

- split catalog authoring under `catalog-src/`
- generated runtime catalog data under `data/`
- a generated `/data/search-index.json` browse artifact
- reusable show and collection routes
- a homepage with structured filters, search, quick filters, recently updated mode, featured collections, and a community-informed most-popular band
- Ask the Archivist chat and site-help flows
- anonymous community ratings
- moderated submissions and creator-verification intake
- protected maintainer queue and reporting pages
- generated static page output from `site-src/`

The repo is no longer in migration mode. The product questions are now about catalog depth, metadata quality, review coverage, trust, and how to improve discovery without overbuilding.

## Roadmap Rules

- Stay JSON-first unless catalog scale or moderation volume proves that model inadequate.
- Keep the product useful for discovery before adding heavier community systems.
- Expand indexed entries faster than full reviews when necessary, but never let metadata quality slip.
- Use the Imported tier for safely expanding factual coverage only when its strict automation gate passes; keep editorial and factual-review promotion separate.
- Preserve the current visual identity unless a change clearly improves browsing, trust, or mobile behavior.
- Favor better coverage and cleaner metadata over new feature classes.

## Deferred Work

Keep these out of scope unless a real bottleneck appears:

- full CMS migration
- account system
- forums or comments
- public API
- paid subscriptions
- complex recommendation infrastructure
- native mobile apps

## Current Reality

The archive currently has strong numeric breadth but uneven depth across indexed-only records.

That means the next meaningful gains are:

- more published shows only where they add useful coverage
- more full reviews after the Phase 2 floor, as editorial capacity allows
- richer similarity and recommendation reasoning
- more complete runtime, status, and creator metadata
- better confidence in filters that depend on that data

Do not chase raw collection count just because the system makes it easy. New collections should only ship when they add a real discovery path.

## Phase 2 Completion Policy — 2026-08-14

Gate B is a catalog-and-editorial milestone. Production launch readiness is a
separate decision and is not implied by this gate.

- The active floor is 129 published shows, 7 full reviews, and 29 collections.
  The archived 8-review target is historical and is not a Phase 2 blocker.
- Metadata requirements are tier-aware. Full-review and spotlight records must
  carry the richer editorial and recommendation fields; sparse indexed-only
  records remain published and factual without invented editorial claims.
- Phase 2 scope is English-language fiction/audio drama. Actual play/TTRPG and
  non-English candidates stay out of the ordinary automatic publication lane.
- A fact that cannot be verified is recorded as `unknown` or in
  `metadata.researchGaps`; hidden blanks do not count as completed audit work.

The generated catalog report is the executable Gate B checklist. It separates
numeric targets, factual gaps, editorial/recommendation gaps, collection
quality, taxonomy, and scope. Its `Phase 2 blocking errors` count must be zero.

## Current Gate Assessment — 2026-08-14

Gate B is `complete`. The generated report records 129 published shows, 7 full
reviews, 29 collections, zero actionable factual gaps, zero editorial or
collection blockers, 165 controlled taxonomy labels with zero unknown or
deprecated public tags, and zero out-of-scope published records.

Three missing RSS links and two runtime-duration gaps are explicitly documented
as research gaps. The 59 sparse indexed-only records with weak collection or
similarity coverage are informational under the tier-aware policy, not Gate B
errors. Creator verification remains a separate trust/launch follow-up; 0 live
records are creator-verified.

## Phase Summary

| Phase | Dates | Primary outcome |
| --- | --- | --- |
| Phase 0 | Completed by June 2, 2026 | Foundation and launch-ready catalog architecture |
| Phase 1 | June 3, 2026 to June 28, 2026 | Stable public beta with trust, moderation, and generated-page workflow in place |
| Phase 2 | June 29, 2026 to August 23, 2026 | Broader catalog depth and stronger review coverage |
| Phase 3 | August 24, 2026 to October 18, 2026 | Better discovery through higher-trust filters and recommendation context |
| Phase 4 | October 19, 2026 to December 13, 2026 | More mature contribution and moderation systems |
| Phase 5 | December 14, 2026 to February 7, 2027 | Creator and network context only where it improves discovery |
| Phase 6 | February 8, 2027 to April 4, 2027 | Mature release candidate with broader coverage and stronger QA confidence |

## Editorial Capacity Assumption

Assume one primary editor-maintainer with occasional outside feedback.

Sustainable cadence during growth phases:

- 2 to 4 new indexed shows per week
- 1 full review every 1 to 2 weeks
- collection refreshes as needed, with new collections only when they add a real route

If available editorial time increases, spend it on show coverage, review depth, and metadata cleanup before adding new systems.

## Catalog Targets By Phase

| Phase end | Published shows | Full reviews | Collections |
| --- | --- | --- | --- |
| Current generated snapshot baseline | See `docs/generated/catalog-status.md` | See `docs/generated/catalog-status.md` | See `docs/generated/catalog-status.md` |
| August 23, 2026 | 129+ | 7+ | 29+ |
| October 18, 2026 | 129+ | 8 to 10 | 30+ |
| December 13, 2026 | 129+ | 10 to 14 | 30+ |
| February 7, 2027 | 129+ | 14 to 18 | 32+ |
| April 4, 2027 | 129+ | 18 to 24 | 34+ |

These targets are intentionally more conservative on collections than earlier planning. The current gap is not collection count; it is show depth and review density.

## Phase 2 - Catalog Depth And Review Coverage

Primary goal:

- make the archive materially more useful by widening real show coverage and increasing the number of pages with richer editorial depth

Product:

- keep the homepage discovery surfaces stable and honest
- make indexed-only show pages feel complete even without long-form reviews
- surface stronger recommendation context where the data already supports it

Editorial:

- maintain at least 129 published shows while correcting source conflicts and
  factual gaps
- retain at least 7 full reviews; no additional review is required for Gate B
- tighten inconsistent descriptions, tags, and status labeling
- fill in missing runtime, completion, and release metadata where possible
- verify similar-show links, reasons, anchor paths, and route-collection copy
- keep sparse indexed-only records factual-only rather than backfilling
  unsupported tones, best-for claims, ratings, or similarities

Platform:

- keep data validation strict as the catalog grows
- maintain link checks and smoke coverage
- avoid shipping filters that look richer than the data really is

Exit criteria:

- numeric targets remain met: 129 published shows, 7 full reviews, and 29
  collections
- actionable factual gaps are fixed or explicitly documented as unknown
- every full-review/spotlight record passes its review-companion, editorial
  metadata, similarity-reason, and collection checks
- taxonomy and locked scope checks pass
- the generated catalog report has zero Phase 2 blocking errors
- generated outputs, focused QA, and repository validation are clean
- launch-readiness blockers remain tracked separately from Gate B

## Phase 3 - Discovery Upgrade

Primary goal:

- make browsing materially better than title-first discovery in a general podcast app

Product:

- improve the usefulness of existing structured filters
- add or refine filters only where the data is complete enough to support them
- improve no-result recovery and cross-links between search, collections, and Ask the Archivist
- make recommendation reasons more visible where they exist

Editorial:

- normalize controlled vocabulary further
- improve similar-show network quality
- review older entries for weak descriptions or inconsistent archive notes

Platform:

- derive richer filter options from structured data rather than hand-maintained UI lists
- keep search and browse logic grounded in the catalog
- keep the generated search index lean enough for homepage browse/search without dragging full detail payloads into the browse path

Exit criteria:

- discovery improvements are data-backed, not just UI-deep
- search and filters noticeably outperform generic title-only browsing

## Phase 4 - Contribution And Moderation Systems

Primary goal:

- accept more outside input without blurring editorial ownership or lowering trust

Product:

- keep archive rating, community rating, listener reviews, and creator verification clearly separate
- make contribution expectations explicit before a user submits anything
- keep factual updates distinguishable from editorial content

Editorial:

- define spoiler and moderation standards for listener reviews
- define what creators can verify and what they cannot influence
- define what level of editing is acceptable before publishing contributed text

Platform:

- keep the SQLite queue and maintainer surface simple and reliable
- preserve provenance for creator-supplied factual changes
- keep anti-spam and vote-threshold protections in place

Exit criteria:

- contribution systems remain trustworthy without requiring a large admin product
- outside input improves coverage and trust without confusing editorial canon

## Phase 5 - Creator, Network, And Archive Context

Primary goal:

- deepen archive context only where it meaningfully improves discovery

Product:

- add creator pages only when they help users find related shows
- add network pages only when they clarify meaningful relationships
- expose archive growth over time if a changelog becomes genuinely useful

Editorial:

- add creator or network records only for high-value repeated entities
- pilot creator notes or Q&A only if the archive can keep them clearly separate from editorial voice

Platform:

- keep creator, network, and changelog data structured and optional
- avoid duplicating entity data across the catalog and operational storage

Exit criteria:

- creator and network context enriches browsing rather than creating empty directories

## Phase 6 - Final-Vision Release Candidate

Primary goal:

- make the public product feel mature, coherent, and substantial

Product:

- keep key discovery modes visible within the first screen or two
- make full reviews, indexed-only entries, Imported entries, community surfaces, and trust signals read cleanly together
- keep Ask the Archivist tightly grounded in real catalog data

Editorial:

- reach better genre and tone coverage
- revisit older entries for consistency
- remove or rewrite weak summaries that no longer meet archive standards

Platform:

- harden tests around browse routes, show rendering, collections, submissions, ratings, and sitemap behavior
- review performance on mobile and slower connections
- ensure failure cases degrade cleanly

Exit criteria:

- 100 to 125 shows are live
- 18 to 24 full reviews are live
- the archive feels meaningfully better than a generic podcast browse flow

## Release Gates

| Gate | Target date | Status | Meaning |
| --- | --- | --- | --- |
| Gate A - Stable Public Beta | June 28, 2026 | `technical-ready` | The repo has generated-page workflow, moderation plumbing, tests, and trust surfaces in place. Human launch timing and content readiness remain separate decisions. |
| Gate B - Catalog Depth Ready | August 23, 2026 | `complete` | Catalog/editorial completion is verified by the generated Phase 2 readiness report. Production launch readiness remains a separate gate. |
| Gate C - Discovery Advantage Ready | October 18, 2026 | `content-pending` | Existing search and filters work, but stronger discovery advantage depends on denser, cleaner metadata and recommendation reasoning. |
| Gate D - Trust And Contribution Ready | December 13, 2026 | `technical-ready` | Intake, provenance, moderation queue, and community safeguards are implemented; long-term trust depends on editorial follow-through. |
| Gate E - Final-Vision Release Candidate | April 4, 2027 | `content-pending` | The platform groundwork exists, but scale, coverage, and editorial consistency are still the long pole. |

Status labels:

- `technical-ready`: tooling and code support the gate, but QA, timing, or content may still be pending
- `content-pending`: technical groundwork exists, but the gate depends on additional human-authored catalog or policy work
- `complete`: both technical and content requirements are satisfied

## Open Questions

Phase 2 decisions are locked:

- scope is English-language fiction/audio drama
- actual play/TTRPG candidates remain out of scope
- non-English candidates remain out of scope for the ordinary automatic lane
- sparse indexed-only records remain factual-only until editorial work exists
- unverifiable facts are explicit unknowns/research gaps

Phase 3:

- Which filters are honest enough to promote publicly once more data is filled in?
- How much recommendation reasoning should be stored as structured data versus written inline in reviews?

Default:

- keep filters simple and high-signal first

Phase 4:

- What is the minimum acceptable moderation burden for listener reviews before publication becomes too noisy?
- Should creator verification remain a lightweight badge plus provenance note, or become a fuller audit state?

Default:

- keep the lightest system that still makes trust visible

Phase 5:

- Which creators and networks are important enough to deserve dedicated pages first?
- Should creator notes and Q&A live on show pages, creator pages, or both?

Default:

- only create creator or network pages when they improve discovery for multiple shows
