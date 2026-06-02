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
- submission and correction intake
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
- collection references

This is a major improvement over the older HTML-scraping approach.

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

The archive has a first-party submit flow with correction support.

That gives the roadmap a real intake surface already. The next work is to turn intake into a reliable editorial workflow instead of just a form destination.

## Testing And Quality

There is already backend test coverage for:

- catalog loading
- sitemap generation
- submission flows
- community flows

The roadmap should extend that safety net as discovery and moderation logic grows.

## Current Gaps

The important current gaps are:

- limited catalog breadth relative to the final vision
- limited full-review coverage
- limited discovery depth on top of the catalog
- limited visible archive activity signals
- no listener-review moderation layer yet
- no creator or network browse layer yet

## Submit/contact flow

[`contact.html`](/Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/contact.html) is a thin wrapper around an embedded Tally form.

This works as a low-friction submit/contact flow for now, but it is generic rather than catalog-specific.

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

The main issues are structural, not visual:

- catalog data is duplicated between homepage HTML and `podcast-data.json`
- backend catalog loading depends on parsing handwritten markup
- most indexed shows do not have reusable detail pages
- slugs and paths are inconsistent across folders, filenames, and titles
- filters and collections are maintained manually in markup
- homepage rendering does not scale cleanly beyond a small handcrafted catalog

The current build proves the concept. It is not yet set up to grow into a real archive.
