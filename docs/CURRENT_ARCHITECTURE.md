# Current Architecture

## Summary

The project is now a structured, mostly static archive with a small Node/Express backend in `podcast-ai/`.

The system has three clear layers:

- a static frontend with reusable routes
- structured catalog data in `data/`
- backend services for chat, submissions, ratings, and sitemap support

The main architecture problem is no longer "how do we migrate away from handwritten catalog truth."

The main architecture problem is now "how do we scale trust, metadata quality, moderation, and discovery depth without overbuilding."

## Frontend

Primary public routes:

- `/`
- `/collections.html`
- `/collection.html?id=<collection-id>`
- `/show.html?id=<show-id>`
- `/about.html`
- `/submit.html`

The frontend remains lightweight and largely static in presentation, but it now renders browse and show state from structured catalog data instead of handwritten card grids.
The homepage also derives archive trust stats from the live catalog, supports structured browse filters, exposes a "recently updated" mode, and uses inline-expanding archive cards with viewport-aware placement plus touch/keyboard support without introducing a frontend build step.

## Structured Catalog

The editorial source of truth lives in:

- `data/shows.json`
- `data/collections.json`
- `data/schema.md`

`script.js` loads the catalog and collections client-side for homepage, show-page, and collection-page rendering.

Current baseline:

- 27 show records
- 6 collection records
- 3 full reviews

## Show And Collection Rendering

The archive now uses reusable routes:

- `show.html` for show pages
- `collection.html` for individual collections
- `collections.html` for collection browse

Legacy detail pages still exist as compatibility entry points, but the reusable routes are the real product path.

## Backend

`podcast-ai/server.js` serves:

- catalog-grounded archive chat
- anonymous community ratings
- show, correction, listener-review, and creator-verification intake
- generated sitemap support
- optional static file serving

Current API areas include:

- health
- chat
- community ratings
- submissions

## Catalog Loading

`podcast-ai/lib/catalog.js` now loads structured catalog data directly from `data/shows.json` and `data/collections.json`.

It validates:

- unique ids
- known enum values
- valid URLs
- duplicate taxonomy terms
- `similarTo` references
- optional `similarReasons` references
- optional `createdAt`, `creatorId`, and `networkId` fields
- collection references

Optional future datasets such as `creators.json`, `networks.json`, and `changelog.json` are also validated when present, but remain invisible to the public site until real data exists.

## Community Layer

Community ratings are real backend-backed data.

The archive currently supports:

- anonymous profile creation
- rating submission and removal
- rating summary fetches
- client-side persistence for anonymous identity

The next-stage challenge is not basic ratings support.

It is handling trust, thresholds, anti-spam, and moderation cleanly as public use increases.

## Submission Layer

The archive now has a first-party intake flow for:

- new shows
- corrections
- listener reviews
- creator verification requests

All intake still lands in SQLite for manual review. The operational layer now stores typed payload JSON, provenance JSON, and moderation metadata without turning SQLite into the editorial source of truth.

## Testing And Quality

There is already backend test coverage for:

- catalog loading
- optional archive-context loading
- sitemap generation
- submission flows
- community flows

There is also lightweight browser smoke coverage for:

- main public routes
- homepage structured filters and empty-state recovery
- homepage expanding archive cards across hover, touch, keyboard, constrained-height, and reduced-motion cases
- Ask the Archivist open and close behavior
- submit-form mode switching

Release tooling now includes:

- `npm run validate:data`
- `npm run check:links`
- `npm run test:smoke`
- `npm run verify`

The roadmap should extend that safety net as discovery and moderation logic grows.

## Current Gaps

The important current gaps are:

- limited catalog breadth relative to the final vision
- limited full-review coverage
- no public changelog route yet
- no public listener-review surface yet
- no creator or network browse layer yet
- no trustworthy `createdAt` backfill for "recently added"

## Submit/contact flow

[`contact.html`](/Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/contact.html) is a thin wrapper around an embedded Tally form.

This still works as a lightweight general contact surface, but the primary archive intake is now the catalog-specific `/submit.html` workflow.

## Deployment assumptions

Deployment details are discoverable in `deploy/`:

- `deploy/Caddyfile.echo` reverse-proxies `echo.continental-hub.com` to `127.0.0.1:3010`
- `deploy/echo-archives.service` runs the Node service under systemd

Operational assumptions:

- Node 20+
- Express server handles both API and static files
- optional Ollama service on `127.0.0.1:11434`
- SQLite database file at `podcast-ai/data/community.sqlite` in production

## Current architecture problems

The remaining issues are now mostly about scale and editorial throughput rather than platform fragility:

- recommendation reasons are scaffolded but not yet populated
- optional creator, network, and changelog datasets are supported but not yet populated
- moderation remains intentionally manual and low-automation
- runtime and commitment data are still too sparse for a trustworthy public filter

The current build is technically quieter than the original foundation, but it still depends on future editorial growth to reach the final vision.
