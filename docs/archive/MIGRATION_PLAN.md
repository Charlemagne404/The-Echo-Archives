# Migration Plan

## Status

The migration described in this file is complete.

The archive now uses:

- `data/shows.json` as the canonical show catalog
- `data/collections.json` as the canonical collection layer
- reusable show pages
- reusable collection pages
- first-party submit and correction flows

## What This File Represents Now

Treat this file as historical record for the completed architecture transition from handwritten catalog pages to a structured archive.

It should not be used as the active roadmap.

## Active Planning

The current planning set starts from the post-migration baseline and lives in:

- `DEVELOPMENT_TIMELINE.md`
- `TIMELINE_PRODUCT_AND_DISCOVERY.md`
- `TIMELINE_EDITORIAL_AND_CATALOG.md`
- `TIMELINE_PLATFORM_AND_COMMUNITY.md`
- `TIMELINE_RELEASE_GATES.md`

## Migration Outcome

The migration succeeded in moving the project from:

- duplicated catalog truth across HTML and JSON
- fragile backend parsing of presentation markup
- manually authored one-off review pages

to:

- structured catalog-driven rendering
- shared reusable browse and detail routes
- cleaner support for chat, ratings, submit flows, and future growth

The next problem is no longer migration.

The next problem is reaching the quality, depth, trust, and coverage described in `FINAL_VISION.md`.
