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
| Detail routes | Reusable show pages at `show.html?id=<show-id>` and collection pages at `collection.html?id=<collection-id>` |
| Community layer | Anonymous ratings, moderated submissions, corrections, listener reviews, and creator verification intake |
| Assistant | Ask the Archivist with catalog-grounded chat and site-help responses |
| Maintainer tools | Passphrase-gated submission queue and report pages |
| Delivery model | Generated static pages at repo root, authored sources in `site-src/`, shared runtime in `shared/`, backend in `backend/` |

The current public page set includes:

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

Legacy show detail pages still exist under `shows/` and are kept as compatibility entry points that redirect to the reusable show route.

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
- Node 20+
- Express
- SQLite for ratings and submission workflow storage
- Optional Ollama integration for Ask the Archivist responses

There is no planned frontend framework rewrite by default. The repo favors simple, durable pieces and generated static output over avoidable platform complexity.

## Local Development

Install backend dependencies once:

```bash
npm --prefix backend install
```

Start the local app:

```bash
npm run dev
```

This runs the backend and serves the static site together at [http://localhost:3010](http://localhost:3010).

## Repo Commands

Root commands:

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the local backend and static site through `backend/` |
| `npm run build:catalog` | Regenerates runtime catalog data, the search index, and the generated catalog snapshot |
| `npm run report:catalog` | Prints solo-dev catalog gaps and generated-output drift |
| `npm run catalog:new:show -- --id <show-id> [--title "Title"]` | Scaffolds a new show source record |
| `npm run catalog:new:collection -- --id <collection-id> --show-id <show-id> [--title "Title"]` | Scaffolds a new collection source record |
| `npm run build:pages` | Regenerates committed root HTML from `site-src/` |
| `npm run check:structure` | Enforces repo structure and generated-source boundaries |
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

## Documentation

Active docs:

- [`docs/PRODUCT.md`](docs/PRODUCT.md)
- [`docs/ROADMAP.md`](docs/ROADMAP.md)
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- [`docs/OPERATIONS.md`](docs/OPERATIONS.md)
- [`data/schema.md`](data/schema.md)
- [`backend/README.md`](backend/README.md)

Working project notes:

- [`HANDOFF.md`](HANDOFF.md)
- [`MEMORY.md`](MEMORY.md)
- [`TODO.md`](TODO.md)

Historical planning and retired guidance live in [`docs/archive/`](docs/archive/).
