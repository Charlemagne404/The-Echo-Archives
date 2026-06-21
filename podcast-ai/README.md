# Podcast AI

This service runs the archive assistant for The Echo Archives and lives inside the main repo.

## What it does

- Loads the structured archive catalog from `../data/shows.json` plus optional `../data/reviews/*.json` companion files
- Auto-fetches missing show cover art from RSS, Apple, or website metadata and stores managed files under `../images/covers/`
- Exposes a same-origin chat API at `/api/chat`
- Persists device-scoped anonymous community ratings in SQLite
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
- `COMMUNITY_TURNSTILE_SITE_KEY`: Cloudflare Turnstile site key shown by the rating widget
- `COMMUNITY_TURNSTILE_SECRET_KEY`: Cloudflare Turnstile secret key used for server-side verification
- `COMMUNITY_TURNSTILE_ENABLED`: enables Turnstile enforcement for rating writes. Defaults to enabled when a secret key is set
- `COMMUNITY_TURNSTILE_VERIFY_URL`: optional Siteverify endpoint override for tests
- `COMMUNITY_MIN_PUBLIC_RATINGS`: verified vote threshold before public averages display. Defaults to `3`
- `COMMUNITY_ABUSE_RETENTION_DAYS`: retention window for hashed rating-abuse signals. Defaults to `30`
- `COMMUNITY_VOTER_COOKIE_NAME`: HTTP-only voter cookie name. Defaults to `echo-community-voter`
- `COMMUNITY_VOTER_HASH_SECRET`: stable secret used to hash voter cookies and abuse signals
- `MAINTAINER_REVIEW_PASSPHRASE`: enables the protected maintainer review queue when set
- `MAINTAINER_REVIEW_COOKIE_SECRET`: signs the maintainer session cookie
- `MAINTAINER_REVIEW_SESSION_TTL_HOURS`: maintainer session lifetime in hours

## Maintainer review workflow

The service exposes the merged catalog at `/data/shows.json`, so the frontend keeps working while long-form review copy lives in `data/reviews/<show-id>.json`.
If a show record is missing a usable local `cover`, catalog load will try `listenLinks.rss`, `listenLinks.apple`, `officialLinks.website`, then `listenLinks.website`, download the discovered image into `images/covers/`, and rewrite `data/shows.json` with the new local path. Failed cover fetches fall back to a local placeholder for that process and log a warning instead of aborting startup.

Protected maintainer submission workflow routes:

- `/maintainer/submissions.html`
- `/maintainer/submissions/report.html`
- `/api/maintainer/session`
- `/api/maintainer/submissions`

The maintainer queue is passphrase-gated, reads from the same SQLite submission store as public intake, and lets you update `status`, `priority`, `review_notes`, and `reviewed_by` without opening the database directly.

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
