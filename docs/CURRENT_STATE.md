# Current State

## Purpose

This document describes the actual current state of The Echo Archives as implemented in this repo.

Use it as a dated reality check alongside:

- `docs/PRODUCT.md` for the active product brief
- `docs/FINAL_PRODUCT.md` for the destination vision
- `docs/ARCHITECTURE.md` for system structure
- `docs/ROADMAP.md` for next-phase sequencing

## Snapshot Date

This snapshot reflects the repo state on **June 29, 2026**.

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

The project has moved past migration and foundation work. The main gap is not "does the product exist?" The main gap is "does the catalog have enough depth, review coverage, and metadata confidence to fully deliver the product promise?"

## Current Product Surface

Public routes currently include:

- `/`
- `/about.html`
- `/for-creators.html`
- `/creator-standards.html`
- `/supporters.html`
- `/collections.html`
- `/collection.html?id=<collection-id>`
- `/show.html?id=<show-id>`
- `/submit.html`
- `/privacy.html`
- `/terms.html`
- `/cookies.html`

Operational and trust-related surfaces currently include:

- `/sitemap.xml`
- `/robots.txt`
- `/404.html`
- `/maintainer/submissions.html`
- `/maintainer/submissions/report.html`

Legacy show pages under `shows/` still exist as compatibility entry points and redirect into the reusable show route.

## Catalog Baseline

Current structured catalog counts:

- 27 published show records in `data/shows.json`
- 15 collection records in `data/collections.json`
- 3 review companion files in `data/reviews/`
- 24 shows in `indexed-only` state
- 3 shows in `full-review` state
- 27 shows with archive ratings present
- 27 shows with runtime metadata present
- 27 shows with at least one official-site or website link present
- 27 shows with at least one similar-show relationship present
- 11 shows currently marked `featured`
- 0 shows currently marked `creator-verified`

Completion-state split:

- 15 `ongoing`
- 6 `finished`
- 6 `unclear`

What that means in practice:

- the catalog is real, but still small
- metadata structure is stronger than review depth
- the archive already supports recommendation logic, but coverage is still narrow
- creator verification is supported by the system but not yet represented in live catalog data

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

- canonical `show.html?id=<show-id>` routing
- structured metadata rendering
- links and factual context
- collection and relationship context
- community widgets
- correction and contribution paths

Collection pages currently support:

- canonical `collection.html?id=<collection-id>` routing
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

- `data/shows.json`
- `data/collections.json`
- `data/reviews/*.json`

This is now a structured-catalog product, not a pile of individually authored show pages.

## Current Command Surface

Repo-root commands:

- `npm run dev`
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

This is enough process to support disciplined iteration without a large platform footprint.

## Current Strengths

- The product identity is already distinct and coherent.
- The browse surface already reflects the intended compact archive model.
- The catalog is structured enough to power reusable routes, search, filters, chat grounding, and validation.
- The project already has moderation and trust boundaries instead of pretending it can add them later.
- The repo structure is clear: authored page source, generated public output, structured data, shared frontend code, backend services.
- The site already supports several real discovery modes rather than a single landing page concept.

## Current Gaps

The main limitations are content depth and maturity, not architecture.

Most important gaps today:

- only 27 published shows, which limits recommendation breadth
- only 3 full-review shows, which limits editorial depth
- creator verification exists as a workflow but has no live verified records yet
- many of the strongest future recommendation routes depend on denser catalog coverage
- filter confidence can only grow as metadata vocabulary gets broader and more consistent
- the archive still needs more "serious enough to trust" volume before the final vision fully lands

This is a healthy gap profile. The product is not blocked by missing infrastructure. It is mostly blocked by catalog growth, review work, and metadata refinement.

## Distance From The Final Product

Compared with `docs/FINAL_PRODUCT.md`, the current project is:

- strong on visual identity
- strong on repo structure
- strong on trust boundaries
- strong on data-first architecture
- moderate on discovery mechanics
- early on show-count breadth
- early on review density
- early on creator-verified metadata adoption

In other words, the product shape is largely correct. The archive now needs more substance inside that shape.

## Current Priority Direction

If the repo keeps following its current best path, the next highest-value work is:

- add more published shows
- convert more entries from `indexed-only` to `full-review`
- strengthen runtime, tone, format, and similarity metadata
- improve recommendation usefulness through denser data
- keep contribution, moderation, and trust rules clear as outside input grows

The current state does not call for a major rewrite. It calls for steady catalog and editorial expansion on top of the system that already exists.
