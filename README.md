# The Echo Archives

The Echo Archives is a curated discovery archive for audio dramas and fiction podcasts under the broader Continental umbrella.

## Current architecture

The repo now uses a JSON-first catalog:

- `data/shows.json` is the canonical show metadata index
- `data/collections.json` is the canonical curated discovery layer
- `data/reviews/*.json` stores long-form editorial review companions per show
- `show.html` is the reusable show template for both full reviews and indexed-only entries
- `podcast-ai/` serves the static site, archive chat API, anonymous community ratings, and the first-party show submission endpoint
- `script.js` is the thin browser entry and `shared/app/` owns the runtime frontend modules
- `style.css`, `home.css`, and `detail.css` stay public root assets while `shared/styles/` owns the imported partial tree

The visual language stays largely static, but the homepage, show pages, chat grounding, and community features now read from the same catalog records.
Collections now have first-class browse routes, the homepage exposes archive trust stats plus structured filtering, the submit flow supports new shows, corrections, listener reviews, and creator verification requests, and the site exposes `robots.txt` plus a generated sitemap.
The catalog schema is intentionally broader than the currently rendered UI so richer podcast metadata can live in JSON first and be surfaced later when it proves useful.

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
npm run validate:data
npm run check:links
npm run test:smoke
npm run review:new -- <show-id>
npm run review:publish -- <show-id>
npm run review:report
npm run verify
```

The maintainer review workflow keeps `data/shows.json` focused on show metadata while `data/reviews/<show-id>.json` holds longer editorial copy. Run `review:new` to scaffold a review file, `review:publish` to promote a drafted review to `full-review`, and `review:report` to audit catalog gaps.

Root-level delivery files are intentionally present for both the live Node deployment and simpler static hosting setups, including `404.html`, `robots.txt`, `sitemap.xml`, `site.webmanifest`, `favicon.ico`, `apple-touch-icon.png`, `og-image.png`, and the basic policy pages.
The root public surface is intentional: no build step is required, Express can still serve the repo root directly, and simple static-host fallbacks continue to work.

This repo hygiene refactor does not change public routes, query params, API shapes, catalog schema, DOM hooks, or storage keys.

Update a deployed checkout and restart the live service:

```bash
./update-echo-archives.sh
```

The script fast-forwards from `origin`, runs `npm install` in `podcast-ai`, restarts `echo-archives.service`, reloads Caddy when present, and finishes with a local health check. It stops if the working tree has uncommitted changes.

## Main routes

- `/` - data-driven homepage
- `/collections.html` - browse all curated collections
- `/collection.html?id=<collection-id>` - reusable collection page
- `/show.html?id=<show-id>` - reusable show page
- `/about.html` - curation and rating policy
- `/contact.html` - redirect shim to `contact.continental-hub.com`
- `/privacy.html` - privacy summary for the current implementation
- `/terms.html` - site usage terms
- `/cookies.html` - browser storage and cookie notes
- `/submit.html` - show, correction, listener-review, and creator-verification intake form

Legacy full-review URLs still exist as redirects to `show.html`.

## Docs

The active repo-wide docs are intentionally small:

- [`docs/PRODUCT.md`](docs/PRODUCT.md)
- [`docs/ROADMAP.md`](docs/ROADMAP.md)
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- [`docs/OPERATIONS.md`](docs/OPERATIONS.md)
- [`data/schema.md`](data/schema.md)
- [`podcast-ai/README.md`](podcast-ai/README.md)

Supporting records:

- [`HANDOFF.md`](HANDOFF.md)
- [`MEMORY.md`](MEMORY.md)
- [`TODO.md`](TODO.md)
- [`docs/qa/`](docs/qa)
- [`docs/research/feedback/`](docs/research/feedback)
- [`docs/archive/`](docs/archive)
