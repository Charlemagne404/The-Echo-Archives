# Podcast AI

This service runs the archive assistant for The Echo Archives and lives inside the main repo.

## What it does

- Loads the structured archive catalog from `../data/shows.json`
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
