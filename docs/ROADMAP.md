# Roadmap

## Purpose

This is the active roadmap for taking The Echo Archives from its current structured-catalog baseline to the intended public product.

Use it as the source of truth for:

- sequencing
- milestone targets
- phase-by-phase work
- launch gates
- current status
- open questions

Historical planning docs live in `docs/archive/`.

## Current Baseline

As of June 8, 2026, the foundation is already in place:

- 27 published show records in `data/shows.json`
- 6 curated collections in `data/collections.json`
- 3 full reviews
- reusable show and collection routes
- Ask the Archivist groundwork
- anonymous community ratings
- first-party submission and correction intake
- sitemap and robots support
- mobile QA on the main public routes

The active roadmap is no longer about migration. It is about growth, trust, discovery quality, and editorial depth.

## Roadmap Rules

- Stay JSON-first through this roadmap unless catalog scale or moderation volume proves that model inadequate.
- Keep the product useful for discovery before adding heavier community systems.
- Expand indexed entries faster than full reviews when necessary, but never let metadata quality slip.
- Preserve the current visual identity unless a change clearly improves browsing, trust, or mobile behavior.
- Defer large platform work until the archive is demonstrably useful at scale.

## Deferred Work

Keep these out of scope unless a real bottleneck appears:

- full CMS migration
- account system
- forums or comments
- public API
- paid subscriptions
- complex recommendation infrastructure
- native mobile apps

## Phase Summary

| Phase | Dates | Primary outcome |
| --- | --- | --- |
| Phase 0 | Completed by June 2, 2026 | Foundation and launch-ready catalog architecture |
| Phase 1 | June 3, 2026 to June 28, 2026 | Stable public beta with visible trust signals |
| Phase 2 | June 29, 2026 to August 23, 2026 | Stronger catalog depth and editorial coverage |
| Phase 3 | August 24, 2026 to October 18, 2026 | Discovery upgrade that materially improves browsing |
| Phase 4 | October 19, 2026 to December 13, 2026 | Contribution and moderation systems that increase trust |
| Phase 5 | December 14, 2026 to February 7, 2027 | Creator, network, and archive-context layer |
| Phase 6 | February 8, 2027 to April 4, 2027 | Final-vision release candidate |

## Editorial Capacity Assumption

Assume one primary editor-maintainer with occasional outside feedback.

Sustainable cadence during growth phases:

- 2 to 4 new indexed shows per week
- 1 full review every 1 to 2 weeks
- 1 collection refresh or new collection per week during discovery-heavy phases

If available editorial time increases, use that capacity first to improve catalog depth and review coverage before adding new feature classes.

## Catalog Targets By Phase

| Phase end | Published shows | Full reviews | Collections |
| --- | --- | --- | --- |
| June 28, 2026 | 30+ | 3+ | 6+ |
| August 23, 2026 | 50+ | 8 to 10 | 10+ |
| October 18, 2026 | 70+ | 12 to 14 | 12+ |
| December 13, 2026 | 85+ | 16 to 18 | 13+ |
| February 7, 2027 | 100+ | 20 to 22 | 14+ |
| April 4, 2027 | 100 to 125 | 20 to 30 | 15+ |

## Phase 1 - Stable Public Beta

Primary goal:

- make the current archive feel alive, trustworthy, and safe to expose to a wider early audience

Product:

- expose honest archive stats and a visible last-updated signal
- add a visible archive activity or changelog entry point
- standardize Ask the Archivist naming
- confirm hero copy, CTA hierarchy, and footer language match branding
- make indexed-only show pages feel intentional rather than incomplete

Editorial:

- clean inconsistent descriptions, tone labels, and best-for tags
- validate every listen link and image path
- normalize completion and release statuses
- lock v1 review and indexed-entry templates
- define moderation SLA for corrections and submissions

Platform:

- verify sitemap, robots, canonical tags, and route metadata
- tighten validation for show and collection data changes
- document the release checklist
- keep regression coverage for catalog loading, sitemap generation, submissions, and ratings

Exit criteria:

- all main public routes pass manual QA
- no known broken show, collection, or submit flows remain
- trust signals are visible
- publishing and correction intake are reliable for early public use

## Phase 2 - Catalog Depth And Editorial Coverage

Primary goal:

- move from a promising launchable archive to a genuinely useful archive with enough breadth to recommend confidently

Product:

- promote more than three discovery paths on the homepage
- rotate featured collections based on editorial intent
- add stronger recommendation blocks to show pages
- surface reasons for similar-show links where available

Editorial:

- grow to at least 50 indexed shows
- publish 5 to 7 additional full reviews
- expand collections for beginner-friendly, completed, short-commitment, strong sound design, and character-driven paths
- freeze a stable v1 controlled vocabulary for genre, tone, format, completion status, and best-for tags
- avoid overconcentrating on a single subgenre

Platform:

- extend schema support for recommendation reasons and richer collection metadata
- add or maintain helper checks for links and metadata consistency
- keep ratings operationally separate from editorial presentation

Exit criteria:

- at least 50 indexed shows are live
- at least 8 full reviews are live
- at least 10 collections are live
- every show has consistent core metadata and valid listen links

## Phase 3 - Discovery Upgrade

Primary goal:

- make browsing materially better than searching inside a general podcast app

Product:

- improve search across genre, tone, best-for, completion status, and similarity
- add completion-status, review-status, runtime or commitment, and best-for filters
- add recently added and recently updated views
- improve collection browsing depth and empty-state recovery
- show recommendation reasons on detail pages where available

Editorial:

- make best-for tags more reliable and less redundant
- tighten similar-show relationships into a usable network
- treat collections as active editorial discovery products instead of fixed homepage ornaments

Platform:

- derive richer filters from structured data
- support recent views from trustworthy timestamps
- only add a derived search index if client-side search becomes clumsy
- improve Ask the Archivist grounding from structured metadata rather than presentation text

Exit criteria:

- discovery improvements are data-backed, not just UI-deep
- search and filters noticeably outperform generic title-only browsing

## Phase 4 - Contribution And Moderation Systems

Primary goal:

- open more contribution paths without blurring editorial ownership or lowering trust

Product:

- separate archive rating, community rating, listener reviews, and creator notes visually and semantically
- make submission expectations explicit before users contribute
- make verified factual updates distinguishable from editorial content

Editorial:

- define spoiler labels and moderation standards for listener reviews
- define what creators can verify and what they cannot influence
- define how much editing is acceptable before publishing contributed material

Platform:

- store listener-review submissions cleanly
- preserve provenance for creator-verified metadata changes
- add simple anti-spam controls for ratings and submission endpoints
- keep community averages hidden until threshold rules are met

Exit criteria:

- contribution systems are trustworthy without requiring a heavy admin dashboard
- outside input improves coverage and trust without confusing editorial canon

## Phase 5 - Creator, Network, And Archive Context Layer

Primary goal:

- deepen archive context only where it meaningfully improves discovery

Product:

- add creator pages only when they help users find related shows
- add network pages only when they clarify meaningful relationships
- create a changelog or updates surface that shows archive growth over time

Editorial:

- add creator records for repeated high-value entities
- add network records where they materially improve context
- pilot creator notes or short Q&A in a clearly separate format

Platform:

- store creator, network, and changelog data in structured reusable form
- keep rollback and maintenance simple
- avoid data duplication between editorial JSON and operational storage

Exit criteria:

- creator and network layers enrich browsing rather than creating empty directories
- the archive feels interconnected, not like isolated records

## Phase 6 - Final-Vision Release Candidate

Primary goal:

- make the public product feel obviously mature, coherent, and substantial

Product:

- keep key discovery modes visible within the first screen or two
- ensure full reviews, indexed-only entries, community surfaces, and trust signals all read cleanly together
- keep Ask the Archivist tightly grounded in real catalog data

Editorial:

- reach critical mass across genres and tones
- review older entries for consistency
- remove or rewrite weak summaries that no longer meet archive standards

Platform:

- harden tests around browse routes, show rendering, collections, submissions, ratings, and sitemap behavior
- review performance on mobile and slower connections
- ensure failure cases degrade cleanly
- define a recurring QA pass for links, images, metadata quality, and empty states

Exit criteria:

- 100 to 125 shows are live
- 20 to 30 full reviews are live
- 15 or more collections are live
- public routes, submissions, ratings, and sitemap behavior all pass release QA

## Release Gates

| Gate | Target date | Status | Meaning |
| --- | --- | --- | --- |
| Gate A - Stable Public Beta | June 28, 2026 | `technical-ready` | Trust signals, route hardening, intake updates, validation, and smoke coverage are in place; final QA and launch timing remain human decisions. |
| Gate B - Community Growth Ready | August 23, 2026 | `content-pending` | Technical scaffolding exists, but catalog depth, reviews, collections, and recommendation reasons still depend on future content. |
| Gate C - Discovery Advantage Ready | October 18, 2026 | `content-pending` | Filter and recent-view support is partially live, but stronger recommendation and data-complete discovery surfaces still depend on richer metadata. |
| Gate D - Trust And Contribution Ready | December 13, 2026 | `technical-ready` | Intake, provenance storage, and moderation plumbing exist; public contribution quality still depends on reviewed content and policy follow-through. |
| Gate E - Final-Vision Release Candidate | April 4, 2027 | `content-pending` | Platform groundwork exists, but the release candidate still depends on scale, coverage, and final policy language. |

Status labels:

- `technical-ready`: tooling and code support the gate, but QA, timing, or content may still be pending
- `content-pending`: technical groundwork exists, but the gate depends on additional human-authored catalog or policy work
- `complete`: both technical and content requirements are satisfied

## Launch Waves

Wave 1 - Soft Launch:

- June 2026 during Phase 1
- focus on fixing trust, QA, wording, and metadata issues before wider exposure

Wave 2 - Community Launch:

- late July to August 2026 during Phase 2
- focus on submissions, missing-show discovery, and early recommendation feedback once catalog depth is stronger

Wave 3 - Creator Outreach:

- October to December 2026 during Phase 4
- focus on metadata accuracy, creator verification, and archive credibility

Launch rule:

- do not widen promotion faster than the archive can absorb corrections, submissions, metadata cleanup, and moderation work

## Open Questions

Phase 2:

- Where is the exact inclusion boundary between audio drama, fiction podcast, and adjacent narrative formats?
- Will actual play remain out of scope, partially in scope, or collection-specific?
- Will non-English shows stay out of scope for now, or enter through a limited pilot?

Default:

- keep scope tight until the archive reaches 50+ shows with consistent metadata quality

Phase 3:

- Should runtime filtering use coarse buckets only, or expose more precise listening-commitment ranges?
- How much recommendation reasoning should be stored as structured data versus written inline in reviews?

Default:

- keep filters simple and high-signal first

Phase 4:

- What is the minimum acceptable moderation burden for listener reviews before publication becomes too noisy?
- Should creator verification stay a lightweight badge plus provenance note, or become a fuller audit state?

Default:

- start with the lightest system that still makes trust visible

Phase 5:

- Which creators and networks are important enough to deserve dedicated pages first?
- Should creator notes and Q&A live on show pages, creator pages, or both?

Default:

- only create creator or network pages when they improve discovery for multiple shows
