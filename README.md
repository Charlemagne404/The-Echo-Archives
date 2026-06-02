# The Echo Archives

The Echo Archives is a curated discovery archive for audio dramas and fiction podcasts under the broader Continental umbrella.

## Current architecture

The repo now uses a JSON-first catalog:

- `data/shows.json` is the canonical show catalog
- `data/collections.json` is the canonical curated discovery layer
- `show.html` is the reusable show template for both full reviews and indexed-only entries
- `podcast-ai/` serves the static site, archive chat API, anonymous community ratings, and the first-party show submission endpoint

The visual language stays largely static, but the homepage, show pages, chat grounding, and community features now read from the same catalog records.
Collections now have first-class browse routes, the submit flow also accepts correction-mode intake for existing entries, and the site exposes `robots.txt` plus a generated sitemap.

## Local development

Install and run the backend service:

```bash
cd podcast-ai
npm install
npm start
```

By default the service serves the static site and API together at [http://localhost:3010](http://localhost:3010).

Useful scripts:

```bash
cd podcast-ai
npm run dev
npm test
```

## Main routes

- `/` - data-driven homepage
- `/collections.html` - browse all curated collections
- `/collection.html?id=<collection-id>` - reusable collection page
- `/show.html?id=<show-id>` - reusable show page
- `/about.html` - curation and rating policy
- `/submit.html` - new-show and correction intake form

Legacy full-review URLs still exist as redirects to `show.html`.

## Planning docs

Product and architecture notes still live in [`docs/`](docs):

- [`docs/VISION.md`](docs/VISION.md)
- [`docs/CURRENT_ARCHITECTURE.md`](docs/CURRENT_ARCHITECTURE.md)
- [`docs/TARGET_ARCHITECTURE.md`](docs/TARGET_ARCHITECTURE.md)
- [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md)
- [`docs/MIGRATION_PLAN.md`](docs/MIGRATION_PLAN.md)
- [`docs/FEATURE_PRIORITIES.md`](docs/FEATURE_PRIORITIES.md)
- [`docs/BRANDING.md`](docs/BRANDING.md)
- [`docs/OPEN_QUESTIONS.md`](docs/OPEN_QUESTIONS.md)
- [`docs/IMPLEMENTATION_CHECKLIST.md`](docs/IMPLEMENTATION_CHECKLIST.md)
