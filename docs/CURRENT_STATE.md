# Current State

## Purpose

This document describes the actual current state of The Echo Archives as implemented in this repo.

Use it as a dated reality check alongside:

- `docs/PRODUCT.md` for the active product brief
- `docs/FINAL_PRODUCT.md` for the destination vision
- `docs/ARCHITECTURE.md` for system structure
- `docs/ROADMAP.md` for next-phase sequencing

## Snapshot Date

This narrative snapshot reflects the repository as of **2026-08-14**. The latest
catalog-authored update in the generated snapshot is **2026-08-14**; for exact
counts and coverage gaps, use `docs/generated/catalog-status.md`.

## Summary

The Echo Archives is no longer an idea-stage prototype.

It is already a working static-first discovery site with:

- a live structured show catalog
- reusable show and collection routes
- search and filter-driven browsing
- catalog-grounded chat
- community rating infrastructure
- moderation-first submission intake
- a protected maintainer review surface

The project has moved past migration and foundation work. Phase 2 / Gate B is
complete as a catalog-and-editorial milestone. Production launch readiness,
creator verification, and deeper coverage remain separately tracked work.

## Current Product Surface

Public routes currently include:

- `/`
- `/about`
- `/for-creators`
- `/creator-standards`
- `/supporters`
- `/help-center`
- `/collections`
- `/collections/<collection-id>`
- `/shows/<show-id>`
- `/submit`
- `/privacy`
- `/terms`
- `/cookies`
- `/copyright`

Operational and trust-related surfaces currently include:

- `/sitemap.xml`
- `/robots.txt`
- `/404.html`
- `/maintainer/submissions.html`
- `/maintainer/submissions/report.html`
- `/maintainer/imports.html`
- `/maintainer/imports/report.html`

Legacy show pages and query-string detail aliases remain as permanent compatibility redirects to the clean detail routes.

## Catalog Baseline

Current counts and metadata coverage now live in `docs/generated/catalog-status.md`.

Canonical authoring now lives under:

- `catalog-src/shows/`
- `catalog-src/collections/`
- `catalog-src/reviews/`

Generated runtime/public catalog output now lives under:

- `data/shows.json`
- `data/collections.json`
- `data/reviews/*.json`
- `data/search-index.json`

What that means in practice:

- the catalog is real and has 129 published shows, but it is still uneven in depth
- metadata structure is stronger than review depth
- the archive already supports recommendation logic, but coverage is still narrow
- creator verification is supported by the system but not yet represented in live catalog data
- the importer supports an automation-checked `imported` tier, but no live catalog record currently uses it

The Phase 2 report records 7 full reviews, 29 collections, zero actionable
factual gaps, zero editorial/collection blockers, a stable 165-label taxonomy,
and zero out-of-scope published records. The 59 sparse indexed-only records
with weak collection or similarity coverage are informational under the
tier-aware policy; they do not carry unsupported editorial claims.

## Current Browse Experience

The homepage is already the main discovery surface and currently supports:

- search
- structured filters
- quick filters
- recently updated browse mode
- compact show cards
- featured collections
- a most-popular band
- inline preview behavior for non-coarse-pointer interactions
- empty-state recovery paths
- a sticky compact browse bar after the hero scrolls away

This means the project already has a real discovery UI. The current challenge is making that UI smarter through better catalog depth, not replacing it with a different browsing model.

## Current Show And Collection Experience

The reusable detail pages are in place.

Show pages currently support the core archive-detail model:

- canonical `/shows/<show-id>` routing
- structured metadata rendering
- links and factual context
- collection and relationship context
- community widgets
- correction and contribution paths

Collection pages currently support:

- canonical `/collections/<collection-id>` routing
- featured and directory presentation
- motion-enhanced browsing behavior
- collection-as-discovery-route positioning rather than generic taxonomy folders

The system shape is correct. The remaining work is mostly catalog depth, editorial quality, and consistency.

## Current Community, Trust, And Submission Layer

The repo already includes a meaningful moderation-first trust layer.

Implemented now:

- anonymous community rating bootstrap
- rating submission and removal
- public rating-summary support with thresholds
- Ask the Archivist chat endpoint
- show submission intake
- correction intake
- listener-review intake
- creator-verification intake
- passphrase-gated maintainer queue
- passphrase-gated maintainer reporting surface
- protected machine-found import queue, readiness reports, explicit Imported/indexed-only publication, and factual-review promotion

Important current boundary:

- user and creator input does not auto-publish into the editorial catalog

This is a strong foundation for trust. It also means the product is already more operationally mature than a normal early content prototype.

## Current Architecture Shape

The current system is split into four main layers:

- `site-src/` for authored page sources and partials
- repo-root generated HTML and stable CSS/JS entry assets
- `shared/` for active frontend modules and shared styles
- `backend/` for the Node and Express backend, tests, validation, and SQLite-backed workflow storage

Editorial source of truth currently lives in:

- `catalog-src/shows/`
- `catalog-src/collections/`
- `catalog-src/reviews/`

This is now a structured-catalog product, not a pile of individually authored show pages.

## Current Command Surface

Repo-root commands:

- `npm run dev`
- `npm run build:catalog`
- `npm run report:catalog`
- `npm run catalog:new:show -- --id <show-id>`
- `npm run catalog:new:collection -- --id <collection-id>`
- `npm run build:pages`
- `npm run check:structure`
- `npm run verify`

Backend verification commands:

- `npm --prefix backend test`
- `npm --prefix backend run test:smoke`
- `npm --prefix backend run validate:data`
- `npm --prefix backend run check:links`
- `npm --prefix backend run review:new -- <show-id>`
- `npm --prefix backend run review:publish -- <show-id>`
- `npm --prefix backend run review:report`
- `npm --prefix backend run import:seed -- --file <path>`
- `npm --prefix backend run import:report`
- `npm --prefix backend run import:publish -- <candidate-id> --tier <imported|indexed-only>`
- `npm --prefix backend run import:promote -- <candidate-id> --reviewer <name>`

This is enough process to support disciplined iteration without a large platform footprint.

## Current Strengths

- The product identity is already distinct and coherent.
- The browse surface already reflects the intended compact archive model.
- The catalog is structured enough to power reusable routes, search, filters, chat grounding, and validation.
- The project already has moderation and trust boundaries instead of pretending it can add them later.
- The repo structure is clear: authored page source, generated public output, structured data, shared frontend code, backend services.
- The site already supports several real discovery modes rather than a single landing page concept.

## Current Gaps

The remaining limitations are content depth and launch maturity, not Phase 2
catalog completion or architecture.

Most important gaps today, from the current generated catalog report:

- 59 sparse indexed-only shows have fewer than two collection memberships; this is informational under the tier-aware policy
- 59 sparse indexed-only shows have no editorial similarity set; this is not a Gate B blocker
- 3 published shows lack RSS links and 2 records retain explicitly documented runtime-duration gaps
- 13 records retain explicit research-gap notes for facts that are not currently verifiable
- editorial depth still lags metadata breadth
- creator verification exists as a workflow but has no live verified records yet
- many of the strongest future recommendation routes depend on denser catalog coverage
- filter confidence can only grow as metadata vocabulary gets broader and more consistent
- the archive still needs more "serious enough to trust" volume before the final vision fully lands

This is a healthy post-Phase-2 gap profile. The product is not blocked by the
catalog gate or missing infrastructure. Remaining work is launch readiness,
creator verification, and editorial expansion.

## Distance From The Final Product

Compared with `docs/FINAL_PRODUCT.md`, the current project is:

- strong on visual identity
- strong on repo structure
- strong on trust boundaries
- strong on data-first architecture
- moderate on discovery mechanics
- broad on show-count breadth but uneven in depth
- at the Phase 2 floor on review density
- early on creator-verified metadata adoption

In other words, the product shape is largely correct. The archive now needs more substance inside that shape.

## Current Priority Direction

If the repo keeps following its current best path, the next highest-value work is:

- add more published shows only where they add useful coverage
- convert more entries from `indexed-only` to `full-review` and fact-check eligible Imported entries
- strengthen runtime, tone, format, and similarity metadata
- improve recommendation usefulness through denser data
- keep contribution, moderation, and trust rules clear as outside input grows

The current state does not call for a major rewrite. It calls for steady catalog and editorial expansion on top of the system that already exists.
