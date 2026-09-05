# The Echo Archives

The Echo Archives is a curated discovery platform for audio dramas and fiction podcasts.

It exists to answer one question well: **what should I listen to next?**

This repo is not a generic podcast directory or a playback app. It is a dark, editorial, metadata-driven archive built around compact discovery, useful show pages, grounded recommendations, and clear trust signals.

## Release 1.1.0 — Creators

The repository now implements curated creator, studio, production-company and
network discovery, with explicit show relationships and stable creator pages.
The first pilot links seven entities to 17 existing shows. See
[Creators authoring](docs/CREATORS.md) for the data model and maintenance workflow,
and [1.1.0 release notes](docs/qa/2026-09-05-release-1.1-creators.md) for validation
and remaining limitations. Local implementation is separate from deployment.

## Current State

The repo contains a working static-first site plus a small Node backend.
The live catalog snapshot now lives in [`docs/generated/catalog-status.md`](docs/generated/catalog-status.md) so counts do not have to be hand-maintained across multiple docs.

| Area | Current state |
| --- | --- |
| Catalog source | Split JSON authoring files under `catalog-src/` |
| Runtime catalog | Generated public data under `data/` plus a generated `/data/search-index.json` browse index |
| Main browse surface | Homepage with structured filters, quick filters, search, recently updated mode, featured collections, and a most-popular band |
| Detail routes | Reusable show pages at `/shows/<show-id>` and collection pages at `/collections/<collection-id>` |
| Community layer | Publicly anonymous, pseudonymous ratings, moderated submissions, corrections, listener reviews, and creator verification intake |
| Assistant | Preserved Archivist integration, disabled by default for 1.0 |
| Maintainer tools | Passphrase-gated submissions, catalog imports, collection automation, report pages, and explicit publication/promotion controls |
| Delivery model | Generated static pages at repo root, authored sources in `site-src/`, shared runtime in `shared/`, backend in `backend/` |

The current public page set includes:

- `/`
- `/about`
- `/for-creators`
- `/creator-standards`
- `/supporters`
- `/help-center`
- `/collections`
- `/collections/<collection-id>`
- `/creators`
- `/creators/<stable-entity-id>`
- `/shows/<show-id>`
- `/submit`
- `/privacy`
- `/terms`
- `/cookies`
- `/copyright`

Legacy HTML and query-string detail routes remain compatibility entry points and permanently redirect to the clean canonical routes.

## How The Repo Is Organized

- `catalog-src/` holds the authored source of truth for shows, creator entities, collections, and review companions.
- `data/` holds generated runtime/public catalog data, including `search-index.json`.
- `site-src/` holds authored page sources, partials, and the page manifest.
- The repo root holds generated public output such as `index.html`, `show.html`, `collection.html`, and the stable CSS and JS entry files.
- `shared/` holds browser modules, shared rendering helpers, search logic, and CSS partials.
- `backend/` holds the Express backend for chat, ratings, submissions, maintainer review, sitemap generation, and validation tooling.
- `tools/` holds repo-level page build and structure-check scripts.

## Stack

- Static HTML, CSS, and vanilla JavaScript
- Shared frontend modules in `shared/app/`
- Node 22.12+ (CI and production currently use 22.23.1)
- Express
- SQLite for ratings and submission workflow storage
- Optional Ollama integration for the preserved Archivist feature

There is no planned frontend framework rewrite by default. The repo favors simple, durable pieces and generated static output over avoidable platform complexity.

## Local Development

Install backend dependencies once:

```bash
npm --prefix backend ci
```

Optionally copy `backend/.env.example` to `backend/.env` for local overrides. The root start/dev/config/backup commands load that file without replacing variables already exported by the shell.

The Archivist feature is disabled by default for the 1.0 release. Set `ARCHIVIST_ENABLED=true` in `backend/.env` and regenerate the pages with `npm run build:pages` when you are ready to expose the preserved feature again.

Start the local app:

```bash
npm run dev
```

This runs the backend and serves the static site together at [http://localhost:3010](http://localhost:3010).

## Repo Commands

Root commands:

| Command | What it does |
| --- | --- |
| `npm start` | Starts the backend and static site without watch mode |
| `npm run dev` | Starts the local backend and static site through `backend/` |
| `npm run check:config` | Loads `backend/.env` when present and validates the effective configuration |
| `npm run backup:database` | Creates and integrity-checks a timestamped SQLite backup |
| `npm run build:catalog` | Regenerates runtime catalog data, the search index, and the generated catalog snapshot |
| `npm run report:catalog` | Prints solo-dev catalog gaps and generated-output drift |
| `npm run catalog:new:show -- --id <show-id> [--title "Title"]` | Scaffolds a new show source record |
| `npm run catalog:new:collection -- --id <collection-id> --show-id <show-id> [--title "Title"]` | Scaffolds a new collection source record |
| `npm run build:pages` | Regenerates committed root HTML from `site-src/` |
| `npm run check:structure` | Enforces repo structure and generated-source boundaries |
| `npm run test:tools` | Runs repository build/SEO/operations tool tests |
| `npm run verify` | Regenerates catalog + pages, checks repo structure, then runs backend tests, smoke tests, and data/link validation |

Useful backend commands:

| Command | What it does |
| --- | --- |
| `npm --prefix backend test` | Runs backend tests |
| `npm --prefix backend run test:smoke` | Runs Playwright smoke coverage |
| `npm --prefix backend run validate:data` | Validates catalog and collection data |
| `npm --prefix backend run check:links` | Checks internal and external archive links |
| `npm --prefix backend run review:new -- <show-id>` | Scaffolds a review companion and moves a show to `planned` |
| `npm --prefix backend run review:publish -- <show-id>` | Publishes a completed review companion and promotes the show to `full-review` |
| `npm --prefix backend run review:report` | Audits review coverage and metadata gaps |
| `npm --prefix backend run import:seed -- --file <path>` | Adds titles or source URLs to the protected import queue |
| `npm --prefix backend run import:report` | Reports import readiness, blockers, and publication gaps |
| `npm --prefix backend run import:publish -- <candidate-id> --tier <imported\|indexed-only>` | Explicitly publishes an eligible factual record |
| `npm --prefix backend run import:promote -- <candidate-id> --reviewer <name>` | Records factual review and promotes an Imported entry to `indexed-only` |

## Documentation

Active docs:

- [`docs/PRODUCT.md`](docs/PRODUCT.md)
- [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md)
- [`docs/ROADMAP.md`](docs/ROADMAP.md)
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- [`docs/OPERATIONS.md`](docs/OPERATIONS.md)
- [`docs/IMPORTER.md`](docs/IMPORTER.md)
- [`docs/SEO.md`](docs/SEO.md)
- [`docs/CREATORS.md`](docs/CREATORS.md)
- [`docs/TAG_TAXONOMY.md`](docs/TAG_TAXONOMY.md)
- [`data/schema.md`](data/schema.md)
- [`backend/README.md`](backend/README.md)
- [`docs/FINAL_PRODUCT.md`](docs/FINAL_PRODUCT.md) — destination vision, not a current-release status document
- [`docs/qa/2026-09-05-release-1.1-creators.md`](docs/qa/2026-09-05-release-1.1-creators.md) — Creators implementation and validation evidence
- [`docs/qa/2026-08-18-release-1.0-readiness.md`](docs/qa/2026-08-18-release-1.0-readiness.md) — original launch evidence and gates

Working project notes:

- [`MEMORY.md`](MEMORY.md)
- [`TODO.md`](TODO.md)

Historical planning and retired guidance live in [`docs/archive/`](docs/archive/).
[`docs/DEEP_RESEARCH_REPORT.md`](docs/DEEP_RESEARCH_REPORT.md) is a historical
market-research snapshot and is not an active launch plan.
