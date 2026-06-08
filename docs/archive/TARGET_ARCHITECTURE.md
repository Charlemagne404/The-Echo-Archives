# Target Architecture

## Status

The original target architecture in this file is largely achieved.

Structured catalog data is already the source of truth for:

- show rendering
- collection rendering
- chat grounding
- sitemap generation

This file now describes the next architecture target for the roadmap beyond the foundation phase.

## Core Principle

Keep editorial truth simple and structured.

The system should remain:

- JSON-first for editorial catalog data
- lightweight for public rendering
- separate between editorial truth and community participation data

## Next Data Extensions

The most likely next structured additions are:

```txt
data/
  shows.json
  collections.json
  creators.json
  networks.json
  changelog.json
  schema.md
```

The loader layer already supports these datasets as optional inputs.

They should only be added when the content actually exists and improves browsing or trust.
Until then, the related routes and UI remain hidden by data-presence gating.

## Backend Role

The backend should continue to own:

- chat orchestration
- submissions and corrections
- listener-review and creator-verification intake
- community ratings
- moderation-supporting data where needed
- sitemap generation

It should also keep validating optional archive datasets at startup so future content additions fail fast when malformed.

SQLite or another operational store should remain a participation and workflow layer, not the editorial source of truth.

## Frontend Role

The frontend should continue to:

- render from structured catalog data
- derive browse views from shared metadata
- derive archive stats and trust signals from live catalog data
- keep the current visual identity
- avoid duplication across routes

Hidden future features should activate only when their backing data exists. No manual feature-flag layer is needed for creator pages, network pages, changelog surfaces, or recommendation reasons.

If the catalog becomes much larger, add lightweight derived indexes before considering a full framework rewrite.

## Moderation And Contribution Model

The next target architecture now already supports intake for:

- listener-review intake
- creator verification metadata
- provenance for factual corrections
- typed submission payload storage

It should next support public surfaces for:

- changelog or activity history

That does not require a large admin product during the current roadmap.

It requires:

- clean schemas
- clear operational states
- small, reliable moderation flows

## Maintainability Rules

- one canonical show record per show
- one canonical collection record per collection
- one canonical creator record only when needed
- one canonical network record only when needed
- no return to DOM scraping as source-of-truth logic
- no heavy platform migration without a demonstrated bottleneck

## Deferred Architecture Work

Keep these out of the current roadmap:

- full CMS migration
- accounts platform
- social graph features
- public API
- native apps

The next architecture should still be boring, durable, and easy to operate by one primary maintainer.
