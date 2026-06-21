# The Echo Archives

The Echo Archives is a curated discovery platform for audio dramas and fiction podcasts.

It exists to answer a simple question well: **what should I listen to next?**

This is not a generic podcast directory or a playback app. The project is built around editorial curation, compact discovery, strong metadata, and a dark cinematic archive identity that feels specific to fiction audio.

## What The Project Is

The archive is designed for listeners who want better ways to browse fiction podcasts than a broad podcast app usually offers.

It focuses on:

- curated show discovery
- compact browse-first UX
- mood, tone, format, and similarity-based recommendation paths
- deeper show pages with editorial context
- trust signals that separate editorial opinion, community response, and verified factual metadata

Continental is the parent brand, but The Echo Archives is meant to stand on its own as the product.

## Current State

The current build is a working structured-catalog archive with a small backend and a committed static frontend.

| Area | Current state |
| --- | --- |
| Catalog | 27 structured show records in `data/shows.json` |
| Collections | 6 curated collection records in `data/collections.json` |
| Editorial reviews | 3 long-form review companions in `data/reviews/` |
| Main experience | Browse homepage, reusable show pages, reusable collection pages |
| AI feature | Ask the Archivist with catalog-grounded recommendations and show answers |
| Community layer | Anonymous ratings plus moderated submission and correction intake |
| Delivery model | Static site output at repo root with a small Node/Express service in `podcast-ai/` |

Today, the archive already supports:

- a compact discovery homepage
- reusable show pages at `show.html?id=<show-id>`
- reusable collection pages at `collection.html?id=<collection-id>`
- Ask the Archivist chat
- anonymous community ratings
- show submissions
- metadata corrections
- listener review intake
- creator verification requests
- sitemap and robots support

## How It Works

The repo is intentionally simple.

- `data/` holds the canonical editorial catalog
- `site-src/` holds authored page sources and partials
- the repo root holds committed public output such as `index.html`, `show.html`, `style.css`, and `script.js`
- `shared/` holds shared runtime modules, browser logic, and CSS partials
- `podcast-ai/` holds the backend for chat, ratings, submissions, maintainer workflow, and sitemap support

The product is JSON-first. The frontend, the archive assistant, and related site features are meant to read from structured catalog data rather than hardcoded page content.

## Editorial Model

The Echo Archives separates different kinds of trust and meaning:

- **Archive rating** is the editorial view
- **Community rating** is listener response
- **Creator verified** means factual metadata was checked by a creator or official source

Creator verification does not imply creator approval of ratings, reviews, or rankings.

The archive also supports two valid long-term show states:

- **indexed-only** entries for solid discovery coverage
- **full-review** entries for shows with deeper editorial writeups

## Stack

- static HTML, CSS, and vanilla JavaScript
- shared frontend modules in `shared/app/`
- Node 20+
- Express
- SQLite for community and moderation workflow storage
- optional Ollama integration for Ask the Archivist model responses

There is no frontend framework rewrite here by default. The project favors small, readable, durable pieces over unnecessary platform complexity.

## Local Development

Install backend dependencies once:

```bash
npm --prefix podcast-ai install
```

Start the full local app:

```bash
npm run dev
```

This serves the site and backend together at [http://localhost:3010](http://localhost:3010).

## Repo Commands

Use the repo root as the main entry point:

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the local site and backend through `podcast-ai` |
| `npm run build:pages` | Regenerates committed root HTML from `site-src/` |
| `npm run check:structure` | Checks repo structure and source-boundary rules |
| `npm run verify` | Runs page build, structure checks, and backend verification |

Useful backend-only commands:

| Command | What it does |
| --- | --- |
| `npm --prefix podcast-ai test` | Runs backend tests |
| `npm --prefix podcast-ai run validate:data` | Validates structured catalog data |
| `npm --prefix podcast-ai run check:links` | Checks archive links |
| `npm --prefix podcast-ai run test:smoke` | Runs browser smoke coverage |
| `npm --prefix podcast-ai run review:new -- <show-id>` | Scaffolds a review companion file |
| `npm --prefix podcast-ai run review:publish -- <show-id>` | Publishes a completed review companion |
| `npm --prefix podcast-ai run review:report` | Audits review coverage and gaps |

## Main Public Routes

- `/`
- `/collections.html`
- `/collection.html?id=<collection-id>`
- `/show.html?id=<show-id>`
- `/about.html`
- `/submit.html`
- `/for-creators.html`

Legacy full-review URLs may still exist as compatibility redirects, but the reusable routes above are the main product path.

## Documentation

Core project docs:

- [`docs/PRODUCT.md`](docs/PRODUCT.md)
- [`docs/ROADMAP.md`](docs/ROADMAP.md)
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- [`docs/OPERATIONS.md`](docs/OPERATIONS.md)
- [`data/schema.md`](data/schema.md)
- [`podcast-ai/README.md`](podcast-ai/README.md)

Working project notes:

- [`HANDOFF.md`](HANDOFF.md)
- [`MEMORY.md`](MEMORY.md)
- [`TODO.md`](TODO.md)

## Project Direction

The current priority is not a platform rewrite.

The priority is making the archive more useful:

- more high-quality show coverage
- stronger collections
- better discovery paths
- cleaner metadata
- better trust signals
- thoughtful community and creator contribution workflows

If a change does not improve discovery, trust, or editorial usefulness, it is probably not the right next step for this repo.
