# Podcast AI

This service runs the archive assistant for The Echo Archives and lives inside the main repo.

## What it does

- Loads the structured archive catalog from `../data/shows.json` plus optional `../data/reviews/*.json` companion files
- Auto-fetches missing show cover art from RSS, Apple, or website metadata and stores managed files under `../images/covers/`
- Exposes a same-origin chat API at `/api/chat`
- Persists anonymous community ratings in SQLite for future participation features
- Exposes community endpoints at `/api/community/*` for ratings, profile bootstrap, and summaries
- Exposes show submission intake at `/api/submissions/shows`
- Uses Ollama when available and falls back to grounded heuristic recommendations when it is not

## Run locally

```bash
cd podcast-ai
npm install
npm start
```

By default the service serves the static site from the repo root as well, so you can open `http://localhost:3010`.

## Environment

Copy `.env.example` to `.env` if you want to override defaults.

- `PORT`: API and site port. Defaults to `3010` to avoid common local conflicts.
- `OLLAMA_URL`: Ollama generate endpoint
- `OLLAMA_MODEL`: model name sent to Ollama
- `STATIC_ROOT`: site root relative to `podcast-ai/`
- `SERVE_STATIC`: serve the site and assets from the same process
- `REQUEST_TIMEOUT_MS`: timeout for the model request
- `DB_PATH`: SQLite database path for community features

## Maintainer review workflow

The service exposes the merged catalog at `/data/shows.json`, so the frontend keeps working while long-form review copy lives in `data/reviews/<show-id>.json`.
If a show record is missing a usable local `cover`, catalog load will try `listenLinks.rss`, `listenLinks.apple`, `officialLinks.website`, then `listenLinks.website`, download the discovered image into `images/covers/`, and rewrite `data/shows.json` with the new local path. Failed cover fetches fall back to a local placeholder for that process and log a warning instead of aborting startup.

Useful maintainer commands:

```bash
cd podcast-ai
npm run review:new -- <show-id>
npm run review:publish -- <show-id>
npm run review:report
```

- `review:new` creates a review companion file and moves `indexed-only` shows to `planned`
- `review:publish` validates the companion review file and promotes the show to `full-review`
- `review:report` prints a published-show audit for review coverage and metadata gaps
