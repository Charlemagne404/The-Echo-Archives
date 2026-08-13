# The Echo Archives

The Echo Archives is a curated discovery platform for audio dramas and fiction podcasts.

It exists to answer one question well: **what should I listen to next?**

This repo is not a generic podcast directory or a playback app. It is a dark, editorial, metadata-driven archive built around compact discovery, useful show pages, grounded recommendations, and clear trust signals.

## Current State

The repo contains a working static-first site plus a small Node backend.
The live catalog snapshot now lives in [`docs/generated/catalog-status.md`](docs/generated/catalog-status.md) so counts do not have to be hand-maintained across multiple docs.

| Area | Current state |
| --- | --- |
| Catalog source | Split JSON authoring files under `catalog-src/` |
| Runtime catalog | Generated public data under `data/` plus a generated `/data/search-index.json` browse index |
| Main browse surface | Homepage with structured filters, quick filters, search, recently updated mode, featured collections, and a most-popular band |
| Detail routes | Reusable show pages at `/shows/<show-id>` and collection pages at `/collections/<collection-id>` |
| Community layer | Anonymous ratings, moderated submissions, corrections, listener reviews, and creator verification intake |
| Assistant | Ask the Archivist with catalog-grounded chat and site-help responses |
| Maintainer tools | Passphrase-gated submission queue, catalog-import queue, report pages, and explicit publication/promotion controls |
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
- `/shows/<show-id>`
- `/submit`
- `/privacy`
- `/terms`
- `/cookies`
- `/copyright`

Legacy HTML and query-string detail routes remain compatibility entry points and permanently redirect to the clean canonical routes.

## How The Repo Is Organized

- `catalog-src/` holds the authored source of truth for shows, collections, and review companions.
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
- Optional Ollama integration for Ask the Archivist responses

There is no planned frontend framework rewrite by default. The repo favors simple, durable pieces and generated static output over avoidable platform complexity.

## Local Development

Install backend dependencies once:

```bash
npm --prefix backend ci
```

Optionally copy `backend/.env.example` to `backend/.env` for local overrides. The root start/dev/config/backup commands load that file without replacing variables already exported by the shell.

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
- [`docs/TAG_TAXONOMY.md`](docs/TAG_TAXONOMY.md)
- [`data/schema.md`](data/schema.md)
- [`backend/README.md`](backend/README.md)

Working project notes:

- [`MEMORY.md`](MEMORY.md)
- [`TODO.md`](TODO.md)

Historical planning and retired guidance live in [`docs/archive/`](docs/archive/).
