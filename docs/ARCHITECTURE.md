# Architecture

## Purpose

This is the active architecture reference for The Echo Archives.

Use it as the source of truth for:

- the current system shape
- the data and rendering model
- route and API boundaries
- moderation and community storage boundaries
- maintainability rules

Detailed field-level schema lives in `data/schema.md`.
Historical architecture and migration docs live in `docs/archive/`.

## Summary

The Echo Archives is a structured, static-first archive with a small Node and Express backend in `podcast-ai/`.

It has four main layers:

- authored page source in `site-src/`
- committed public page output in the repo root
- structured editorial catalog data in `data/`
- shared runtime modules and backend services in `shared/` and `podcast-ai/`

The main architecture problem is no longer migration away from handwritten pages. The current problem is how to scale trust, metadata quality, review coverage, and discovery depth without overbuilding.

## Repo Boundaries

These boundaries are intentional and should be preserved:

- `site-src/`: authored page sources, page manifest, and reusable HTML partials
- repo root `*.html`, `style.css`, `home.css`, `detail.css`, and `script.js`: generated, committed public output and stable browser entry assets
- `shared/`: browser modules, rendering helpers, search logic, shared CSS partials, and compatibility manifests
- `data/`: live editorial source data only
- `podcast-ai/`: backend services, tests, validation scripts, and SQLite-backed workflow storage
- `docs/`: product, architecture, operations, research, QA, and historical material only; never runtime inputs

The repo-root command surface is intentionally small:

- `npm run dev`
- `npm run build:pages`
- `npm run check:structure`
- `npm run verify`

## Generated Page Model

Pages are authored in `site-src/pages/`, routed through `site-src/page-manifest.json`, and emitted into committed root HTML by `tools/build-pages.js`.

The current generated page set includes:

- `index.html`
- `about.html`
- `for-creators.html`
- `creator-standards.html`
- `supporters.html`
- `collections.html`
- `collection.html`
- `show.html`
- `submit.html`
- `privacy.html`
- `terms.html`
- `cookies.html`
- `maintainer/submissions.html`
- `maintainer/submissions/report.html`
- `maintainer/imports.html`
- `maintainer/imports/report.html`

Do not hand-edit generated root HTML when the corresponding source exists in `site-src/`.

## Public Routes

Primary public routes:

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

Operational routes:

- `/sitemap.xml`
- `/robots.txt`
- `/404.html`

Maintainer-only routes when configured:

- `/maintainer/submissions.html`
- `/maintainer/submissions/report.html`
- `/maintainer/imports.html`
- `/maintainer/imports/report.html`

Legacy detail pages still exist under `shows/` and are kept as compatibility redirects to the reusable show route.

## Frontend Role

The frontend should:

- render browse and detail state from structured catalog data
- keep `script.js` as the single browser entry while `shared/app/` owns the implementation
- derive search, filters, cards, and detail views from shared metadata rather than duplicated markup
- preserve the current visual identity
- keep root HTML generated from `site-src/`
- keep public CSS URLs stable while `shared/styles/` owns imported partials

The homepage currently supports:

- structured filtering
- quick filters
- text search
- recently updated sort mode
- featured collections
- a most-popular band informed by community summaries and fallback popularity metadata
- inline-expanding show-card preview behavior
- no-results recovery

This is enough surface area that future UI work should start from the existing data and rendering model rather than from a rewrite impulse.

## Canonical Editorial Data

The editorial source of truth lives in:

- `data/shows.json`
- `data/collections.json`
- `data/reviews/*.json`
- `data/schema.md`

The frontend, Ask the Archivist, sitemap generation, and related public surfaces should read from these structured datasets instead of scraping or inferring from HTML.

Key editorial principles:

- one canonical show record per show
- one canonical collection record per collection
- optional long-form review data can live in companion review JSON
- objective metadata stays separate from archive editorial opinion
- operational and community storage must not become the editorial source of truth

## Current Catalog Baseline

As of June 30, 2026:

- 41 published show records
- 26 collection records
- 6 review companion JSON files
- 35 `indexed-only` shows
- 6 `full-review` shows
- 30 shows still lack RSS URLs
- 14 shows still lack `metadata.objectiveSources`
- 26 shows still carry `metadata.researchGaps`

The archive supports both `indexed-only` and `full-review` as valid long-term show states.

## Backend Role

`podcast-ai/server.js` currently serves:

- `GET /api/health`
- `GET /sitemap.xml`
- `GET /data/shows.json`
- `POST /api/chat`
- `GET /api/chat/health`
- `POST /api/community/profiles/anonymous`
- `GET /api/community/config`
- `GET /api/community/ratings/summary`
- `PUT /api/community/podcasts/:podcastId/rating`
- `DELETE /api/community/podcasts/:podcastId/rating`
- `POST /api/submissions/shows`
- protected maintainer session and submission queue APIs
- protected maintainer import queue, hydration, draft, and publish APIs
- optional static file serving from the repo root

The backend owns:

- chat orchestration and site-help responses
- catalog loading and validation
- submission intake
- community ratings
- moderation-supporting workflow data
- sitemap generation
- startup validation for optional archive datasets

## Catalog Loading And Validation

`podcast-ai/lib/catalog.js` loads structured catalog data directly from `data/`, merges companion review JSON into the matching show record, normalizes search data, and validates both shows and collections.

Validation covers:

- unique ids
- known enum values
- valid URLs
- duplicate normalized taxonomy values
- required rating and update fields
- `similarTo` and `similarReasons` references
- collection references
- optional creator and network ids
- date field validity

The system should fail fast on malformed structured data rather than silently degrading.

## Automatic Cover Sync

Catalog load and validation can auto-sync missing show cover art.

Source order:

- `listenLinks.rss`
- `listenLinks.apple`
- `officialLinks.website`
- `listenLinks.website`

Successful fetches are stored as managed local files in `images/covers/` and written back into `data/shows.json`.

If no cover can be resolved, the process logs a warning and falls back to a shared local placeholder for that run instead of aborting startup.

## Archive Assistant And Site Help

Ask the Archivist is not just a raw LLM endpoint.

The chat layer combines:

- structured show and collection data
- archive-context loaders
- site-help responses for privacy, terms, supporter, contact, and creator workflow questions
- rate limiting
- optional Ollama model calls
- deterministic catalog-grounded fallbacks when model output is unavailable or unsuitable

This grounding model is a core product boundary. The assistant should keep answering from archive data and route knowledge, not freeform invention.

## Community And Contribution Layer

Community and contribution features are a workflow layer, not editorial truth.

Current participation features include:

- anonymous profile bootstrap for ratings
- rating submission and removal
- rating summary fetches
- show submissions
- correction intake
- listener-review intake
- creator-verification intake
- maintainer queue and report surfaces
- internal catalog import queue, report, and CLI automation

All intake remains moderation-first. Nothing auto-publishes into the editorial catalog.

## Storage Model

Operational storage uses SQLite through `better-sqlite3`.

Current workflow storage supports:

- community profile and rating state
- abuse-signal and rate-limit support
- submission queue entries
- catalog import candidates, source snapshots, event history, and run records
- typed payload JSON
- provenance JSON
- moderation metadata such as status, priority, review notes, reviewer, and review time

This storage layer exists to support workflow without replacing the structured editorial catalog.

## Catalog Import Lane

The new catalog import lane is intentionally separate from both the public submission surface and the canonical catalog files.

Boundaries:

- public show intake still lives in the submission queue
- machine-found show candidates live in SQLite import tables
- approved candidates are written into `data/shows.json` as `status: "draft"`
- only fully reviewed records are promoted to `published`

Source strategy in v1:

- RSS is the primary objective metadata source
- Apple Search and lookup are the primary discovery helpers and `feedUrl` recovery path
- Podcast Index is optional authenticated enrichment when credentials are configured
- AI suggestions are provider-abstracted and optional; they may suggest subjective fields but never auto-publish anything

## Trust Boundaries

Creator verification exists to improve factual metadata quality.

It must not imply:

- creator approval of archive ratings
- creator control over archive reviews
- editorial endorsement tied to creator status

Community ratings are also distinct from editorial ratings and stay behind a minimum-public-threshold rule before averages display publicly.

## Testing And Quality

The current safety net includes:

- unit and integration tests for catalog loading, import adapters and service flow, archive context, chat routes, community flows, rate limits, review workflow, sitemap generation, site-help behavior, and maintainer auth
- browser smoke coverage for main routes, homepage browse behavior, card interactions, show-detail navigation, submit flows, creator flows, and rating flows
- repo-level structure checks and page generation verification

Key verification commands:

- `npm run build:pages`
- `npm run check:structure`
- `npm --prefix podcast-ai run validate:data`
- `npm --prefix podcast-ai run check:links`
- `npm --prefix podcast-ai test`
- `npm --prefix podcast-ai run test:smoke`
- `npm run verify`

## Deployment Assumptions

Operational deployment details live in `deploy/`.

Current assumptions:

- Node 20+
- Express serves API and static files
- optional Ollama service at `127.0.0.1:11434`
- SQLite database at `podcast-ai/data/community.sqlite` by default
- reverse proxy and systemd definitions in `deploy/`

## Current Gaps

The current limitations are mostly editorial and scale-related:

- show breadth is still modest
- full-review coverage is still sparse
- recommendation reasons are only partially populated
- creator, network, and changelog datasets are not live
- moderation remains intentionally manual
- some richer filter ideas still depend on more complete metadata

## Maintainability Rules

- Keep the system boring and easy to operate.
- Preserve one canonical structured source for editorial data.
- Do not return to DOM scraping as source-of-truth logic.
- Do not add a heavy platform migration without a demonstrated bottleneck.
- Separate editorial truth from community and moderation workflow data.
- Prefer additive optional datasets over duplicated route-specific data.
- Keep the repo root as the intentional public web surface unless deployment needs materially change.
- Keep `site-src/` as the authored page-shell source and treat root HTML as generated output.
- Treat public routes, query params, API shapes, storage keys, and DOM hooks as compatibility boundaries during hygiene refactors.
