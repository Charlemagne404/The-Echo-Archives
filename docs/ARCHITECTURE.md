# Architecture

## Purpose

This is the active architecture reference for The Echo Archives.

Use it as the source of truth for:

- the current system shape
- the intended next-stage architecture
- the data and rendering model
- submission and community system boundaries
- maintainability rules

Detailed field-level schema lives in `data/schema.md`.
Historical architecture and migration docs live in `docs/archive/`.

## Summary

The Echo Archives is a structured, mostly static archive with a small Node and Express backend in `podcast-ai/`.

It has three main layers:

- authored page source in `site-src/` and committed frontend output in the repo root
- structured editorial catalog data in `data/`
- shared runtime modules and config in `shared/`
- backend services in `podcast-ai/` for chat, submissions, ratings, and sitemap support

The main architecture problem is no longer migration away from handwritten pages. The main problem is how to scale trust, metadata quality, moderation, and discovery depth without overbuilding.

## Repo Boundaries

These boundaries are now intentional and should be preserved as the project grows:

- `site-src/`: authored page sources, page manifest, and reusable HTML partials
- repo root `*.html`, `style.css`, `home.css`, `detail.css`, and `script.js`: committed public output and stable browser entry assets
- `shared/`: runtime JS, shared CSS partials, browser/backend/test config, and compatibility manifests such as `shared/config/legacy-redirects.json`
- `data/`: live editorial source data only
- `docs/`: product, architecture, operations, research, QA, and historical material only; never runtime inputs

The repo root command surface is intentionally small:

- `npm run dev`
- `npm run build:pages`
- `npm run check:structure`
- `npm run verify`

## Public Routes

Primary public routes:

- `/`
- `/collections.html`
- `/collection.html?id=<collection-id>`
- `/show.html?id=<show-id>`
- `/about.html`
- `/submit.html`

Legacy detail pages may still exist as compatibility entry points, but the reusable routes are the real product path.

## Frontend Role

The frontend should:

- render browse and detail state from structured catalog data
- derive browse views from shared metadata rather than duplicated markup
- keep the current visual identity
- expose trust signals and discovery features without requiring a frontend framework rewrite
- hide future features until backing data actually exists
- keep `script.js` as the single browser entry while `shared/app/` owns the runtime modules
- keep root HTML generated from `site-src/` rather than hand-editing duplicate page shells
- keep the public CSS URLs stable while `shared/styles/` owns imported partials behind them

If the catalog grows significantly, prefer lightweight derived indexes before considering a heavier stack migration.

## Canonical Editorial Data

The editorial source of truth lives in:

- `data/shows.json`
- `data/collections.json`
- `data/schema.md`

The frontend, Ask the Archivist, and related public surfaces should read from these structured datasets instead of scraping or inferring from HTML.

Key editorial principles:

- one canonical show record per show
- one canonical collection record per collection
- objective metadata stays separate from archive editorial opinion
- operational and community storage must not become the editorial source of truth

## Current Catalog Baseline

Current baseline:

- 27 show records
- 6 collection records
- 3 full reviews

The archive supports both full-review and indexed-only show records as valid long-term states.

## Backend Role

`podcast-ai/server.js` currently serves:

- catalog-grounded archive chat
- anonymous community ratings
- show, correction, listener-review, and creator-verification intake
- generated sitemap support
- optional static file serving

The backend should continue to own:

- chat orchestration
- submissions and corrections
- listener-review and creator-verification intake
- community ratings
- moderation-supporting workflow data
- sitemap generation
- startup validation for optional archive datasets

## Catalog Loading And Validation

`podcast-ai/lib/catalog.js` loads structured catalog data directly from `data/`.

Catalog load now also auto-syncs missing show cover art before validation:

- source order is RSS, Apple, official website, then listen website
- successful fetches are stored as managed local files in `images/covers/`
- resolved local cover paths are written back into `data/shows.json`
- unresolved covers fall back to a shared local placeholder for that process and log warnings instead of aborting startup

Validation should continue to cover:

- unique ids
- known enum values
- valid URLs
- duplicate taxonomy terms
- `similarTo` references
- `similarReasons` references when present
- optional release, verification, and richer metadata fields when present
- optional `createdAt`, `creatorId`, and `networkId` fields
- collection references

The system should fail fast on malformed structured data rather than silently degrading.

## Detailed Schema

`data/schema.md` is the practical v1 schema reference.

It defines:

- the `show` object shape
- the richer optional metadata the JSON catalog may store before the UI uses it
- required fields
- controlled values
- validation rules
- collection shape
- optional companion datasets

Use `data/schema.md` for concrete field-level decisions. Use this file for system-level decisions.

## Future Structured Datasets

The most likely next additions are:

```txt
data/
  shows.json
  collections.json
  creators.json
  networks.json
  changelog.json
  schema.md
```

These datasets should only be added when real content exists and improves browsing or trust.

Related routes or UI should remain hidden until the data is present and validated.

## Community And Contribution Layer

Community and contribution features are a workflow layer, not editorial truth.

Current participation features include:

- anonymous profile bootstrap for ratings
- rating submission and removal
- rating summary fetches
- show submissions
- corrections
- listener-review intake
- creator-verification intake
- maintainer queue and report surfaces for moderation workflow

All intake remains moderation-first. Nothing should auto-publish into the archive catalog.

## Moderation Storage Model

Operational storage may use SQLite or another lightweight store for:

- submission queue entries
- typed payload JSON
- provenance JSON
- moderation notes, priority, and status
- anonymous community state

This storage layer should support workflow without replacing the structured editorial catalog.

## Creator Verification Boundary

Creator verification exists to improve factual metadata quality.

It must not imply:

- creator approval of archive ratings
- creator control over archive reviews
- editorial endorsement tied to creator status

The system should preserve provenance when creator-supplied factual corrections are accepted.

## Testing And Quality

The existing safety net includes backend coverage for:

- catalog loading
- optional archive-context loading
- sitemap generation
- submission flows
- community flows

It also includes lightweight browser smoke coverage for:

- main public routes
- homepage filters and empty-state recovery
- homepage expanding archive-card behavior
- Ask the Archivist open and close behavior
- submit-form mode switching

Key repo verification commands:

- `npm run build:pages`
- `npm run check:structure`
- `npm run validate:data`
- `npm run check:links`
- `npm run test:smoke`
- `npm run verify`

## Deployment Assumptions

Operational deployment details live in `deploy/`.

Current assumptions:

- Node 20+
- Express serves API and static files
- optional Ollama service at `127.0.0.1:11434`
- SQLite database at `podcast-ai/data/community.sqlite` in production
- reverse proxy and systemd definitions in `deploy/`

## Current Gaps

The current limitations are mostly editorial and scale-related:

- catalog breadth is still limited relative to the product vision
- full-review coverage is still sparse
- recommendation reasons are scaffolded but not yet fully populated
- creator, network, and changelog datasets are supported but not yet populated
- moderation remains intentionally manual
- runtime and commitment metadata are still too incomplete for fully trustworthy public filtering

## Maintainability Rules

- Keep the system boring and easy to operate.
- Preserve one canonical structured source for editorial data.
- Do not return to DOM scraping as source-of-truth logic.
- Do not add a heavy platform migration without a demonstrated bottleneck.
- Separate editorial truth from community and moderation workflow data.
- Prefer additive optional datasets over duplicated route-specific data.
- Keep the repo root as the intentional public web surface unless deployment requirements materially change.
- Keep `site-src/` as the authored page shell source and treat root HTML as generated output.
- Keep one root command surface instead of growing ad hoc scripts across directories.
- Treat public routes, query params, API shapes, storage keys, and DOM hooks as compatibility boundaries during hygiene refactors.
