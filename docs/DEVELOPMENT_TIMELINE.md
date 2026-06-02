# Unified Development Timeline

## Purpose

This is the main roadmap for taking The Echo Archives from its current launched foundation to the state described in `FINAL_VISION.md`.

It replaces the old split between migration planning, launch planning, feature wishlists, and open-ended architecture notes.

Use this document as the source of truth for:

- sequencing
- scope control
- milestone targets
- exit criteria
- cross-document references

## Current Baseline

As of June 2, 2026, the project already has the foundation in place:

- 27 published show records in `data/shows.json`
- 6 curated collections in `data/collections.json`
- 3 full reviews
- reusable show and collection routes
- Ask the Archivist groundwork
- anonymous community ratings
- first-party submit and correction intake
- sitemap and robots support
- mobile QA on main public routes

That means the next roadmap is not a migration roadmap.

It is a growth, trust, and quality roadmap.

## Roadmap Rules

- Stay JSON-first through this roadmap unless catalog scale or moderation volume makes that unworkable.
- Keep the site useful for discovery before adding heavier community features.
- Expand indexed entries faster than full reviews, but never let metadata quality slip.
- Preserve the current visual identity unless a change clearly improves browsing, trust, or mobile behavior.
- Defer accounts, comments, forums, subscriptions, mobile apps, and a heavy CMS until after the archive is genuinely useful at scale.

## Phase Summary

| Phase | Dates | Primary outcome |
| --- | --- | --- |
| Phase 0 | Completed by June 2, 2026 | Foundation and launch-ready catalog architecture |
| Phase 1 | June 3, 2026 to June 28, 2026 | Stable public beta with visible trust signals |
| Phase 2 | June 29, 2026 to August 23, 2026 | Stronger catalog depth and editorial coverage |
| Phase 3 | August 24, 2026 to October 18, 2026 | Discovery upgrade that makes browsing materially better |
| Phase 4 | October 19, 2026 to December 13, 2026 | Contribution and moderation systems that increase trust |
| Phase 5 | December 14, 2026 to February 7, 2027 | Creator, network, and archive-context layer |
| Phase 6 | February 8, 2027 to April 4, 2027 | Final-vision release candidate |

## Phase 0 - Completed Foundation

This work is already done and should now be treated as baseline:

- structured show and collection data
- reusable show pages
- reusable collection pages
- submit and correction intake
- community rating backend
- core chat grounding
- mobile QA
- launch messaging prep

The older migration docs remain useful as historical record, but they are no longer the active roadmap.

## Phase 1 - Stable Public Beta

Dates:

- June 3, 2026 to June 28, 2026

Primary goal:

- make the current archive feel alive, trustworthy, and safe to expose to a wider early audience

Required outcomes:

- fix remaining copy, broken-link, metadata, and route-quality issues
- surface honest archive stats and a visible last-updated signal on the homepage
- add a simple public changelog or update log
- standardize "Ask the Archivist" naming across the UI
- define submission response rules and moderation cadence
- complete soft-launch feedback loop with a small trusted audience

Exit criteria:

- all main public routes pass manual QA
- no known broken show, collection, or submit flows
- trust signals are visible on the homepage and About page
- there is a documented moderation path for corrections and submissions

## Phase 2 - Catalog Depth And Editorial Coverage

Dates:

- June 29, 2026 to August 23, 2026

Primary goal:

- move from "promising launchable archive" to "useful archive with enough breadth to recommend confidently"

Required outcomes:

- grow the catalog from 27 to at least 50 published shows
- grow full reviews from 3 to at least 8, with 10 preferred
- grow collections from 6 to at least 10
- freeze the first stable controlled vocabulary for genre, tone, format, completion status, and best-for tags
- add structured "reason to recommend" support for similar shows and collection inclusion
- run the broader community launch wave after baseline QA stays clean

Exit criteria:

- at least 50 indexed shows are live
- at least 8 full reviews are live
- every show has consistent core metadata and valid listen links
- every featured collection has a clear description and recent updated date

## Phase 3 - Discovery Upgrade

Dates:

- August 24, 2026 to October 18, 2026

Primary goal:

- make discovery materially better than a podcast app, not just more stylish

Required outcomes:

- introduce stronger filtering for completion status, review status, runtime, and best-for tags
- add "recently added" and "recently updated" archive views
- improve collection browsing beyond the homepage
- make recommendation paths explain themselves with short reasons
- ensure empty search states always redirect users toward a useful next action
- tighten Ask the Archivist prompts and UI around real archive use cases

Exit criteria:

- discovery routes support the most important listener questions from `FINAL_VISION.md`
- search and filters do not produce dead-end states without a recovery path
- recommendation reasons are visible wherever "similar to" is surfaced
- homepage, collection pages, and show pages feel consistent as one archive system

## Phase 4 - Contribution And Moderation Systems

Dates:

- October 19, 2026 to December 13, 2026

Primary goal:

- open the archive to more community input without reducing trust

Required outcomes:

- add listener review intake with clear moderation rules
- add creator verification for factual metadata only
- add review and submission moderation workflow documentation
- enforce community-rating visibility threshold and anti-spam protections
- capture provenance for edits, corrections, and verified facts
- run creator outreach with a correction-first tone

Exit criteria:

- no community content publishes automatically
- archive rating and community rating are clearly separated everywhere
- creator-verified metadata is distinguishable from editorial opinion
- moderation workload is manageable without a heavy admin system

## Phase 5 - Creator, Network, And Archive Context Layer

Dates:

- December 14, 2026 to February 7, 2027

Primary goal:

- make the archive feel deeper, more interconnected, and more obviously alive

Required outcomes:

- add creator pages
- add network pages where they help discovery
- expand activity history into a meaningful archive changelog
- add creator notes or Q&A support in a clearly separated format
- improve related-show paths through creator, network, and collection context
- continue catalog and review growth while preserving metadata quality

Exit criteria:

- creator and network entities improve browsing rather than acting like empty taxonomy pages
- the changelog demonstrates continuing editorial activity
- creator-facing features help accuracy without weakening editorial independence

## Phase 6 - Final-Vision Release Candidate

Dates:

- February 8, 2027 to April 4, 2027

Primary goal:

- reach a version that credibly matches the practical core of `FINAL_VISION.md`

Required outcomes:

- reach 100 to 125 published shows
- reach 20 to 30 archive-reviewed shows
- reach at least 15 strong collections
- harden Ask the Archivist around archive-grounded recommendation flows
- finalize About, curation, spoiler, and contribution policy language
- complete a public-quality release audit across mobile, metadata quality, ratings, and submission handling

Exit criteria:

- the archive is clearly useful even for users who arrive without prior context
- creators can correct facts without controlling editorial stance
- listeners can browse by mood, genre, format, status, similarity, and listening context
- the site presents itself as a living archive, not a static side project

## End-State Scorecard

By the end of Phase 6, the project should hit these practical targets:

- 100 to 125 published shows
- 20 to 30 full reviews
- 15 or more collections
- visible archive stats and changelog
- spoiler-safe review structure across all public review types
- creator correction and verification workflow
- listener review intake with moderation
- grounded Ask the Archivist experience
- creator and network browse paths where useful

## Cross-Document Map

Use the supporting roadmap docs for detail:

- `TIMELINE_PRODUCT_AND_DISCOVERY.md`
- `TIMELINE_EDITORIAL_AND_CATALOG.md`
- `TIMELINE_PLATFORM_AND_COMMUNITY.md`
- `TIMELINE_RELEASE_GATES.md`

Older planning docs should now be read as supporting context, not as competing sources of sequencing.
