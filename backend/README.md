# Backend

This service runs the backend for The Echo Archives and keeps the archive assistant as one part of that backend.

## What it does

- Loads the authored archive catalog from `../catalog-src/` and serves generated runtime data at `/data/*`
- Auto-fetches missing show cover art from RSS, Apple, or website metadata and stores managed files under `../images/covers/`
- Exposes a same-origin chat API at `/api/chat`
- Keeps the archive assistant implementation isolated under `lib/ai/`
- Persists device-scoped anonymous community ratings in SQLite
- Exposes community endpoints at `/api/community/*` for ratings, profile bootstrap, and summaries
- Exposes show submission intake at `/api/submissions/shows`
- Exposes a protected internal import lane for machine-found catalog candidates
- Uses Ollama when available and falls back to grounded heuristic recommendations when it is not

## Run locally

```bash
cd backend
npm ci
npm start
```

By default the service serves the static site from the repo root as well, so you can open `http://localhost:3010`.
Node.js 22.12 or newer is required. CI pins the current production runtime, Node.js 22.23.1. The start/dev/config wrappers load `backend/.env` when it exists without overriding variables already exported by the shell.

## Environment

Copy `.env.example` to `.env` if you want to override defaults.

- `PORT`: API and site port. Defaults to `3010` to avoid common local conflicts.
- `OLLAMA_URL`: Ollama generate endpoint
- `OLLAMA_MODEL`: model name sent to Ollama
- `STATIC_ROOT`: site root relative to `backend/`
- `SERVE_STATIC`: serve the site and assets from the same process
- `REQUEST_TIMEOUT_MS`: timeout for the model request
- `DB_PATH`: SQLite database path for community features
- `SITE_URL`: authoritative public origin for canonical and discovery metadata
- `TRUST_PROXY`: Express trusted-proxy setting. Defaults to `loopback`
- `PODCAST_INDEX_API_KEY`: optional Podcast Index API key for import enrichment
- `PODCAST_INDEX_API_SECRET`: optional Podcast Index API secret for import enrichment
- `PODCAST_INDEX_USER_AGENT`: user-agent string sent to Podcast Index and import fetches
- `IMPORT_SUGGESTION_PROVIDER`: optional subjective suggestion provider name. Current supported value is `ollama`
- `IMPORT_SUGGESTION_MODEL`: optional model name used by the import suggestion provider
- `IMPORT_FETCH_TIMEOUT_MS`, `IMPORT_DOCUMENT_MAX_BYTES`, `IMPORT_COVER_MAX_BYTES`: bounded maintainer import fetch limits
- `COMMUNITY_RATING_WRITES_ENABLED`: controls rating mutations and defaults to disabled in production
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
- `MAINTAINER_LOGIN_WINDOW_MS`, `MAINTAINER_LOGIN_MAX`: maintainer login throttling policy
- `PLAUSIBLE_DOMAIN`: optional public analytics domain injected into generated public pages during `npm run build:pages`
- `PLAUSIBLE_SCRIPT_SRC`: optional Plausible script URL override used during page generation

Run `npm run check:config` before local startup. Run `NODE_ENV=production npm run check:config` before deployment. Production requirements, backup/restore, and deployment procedures live in [`docs/OPERATIONS.md`](../docs/OPERATIONS.md).

## Maintainer review workflow

The service exposes the merged catalog at `/data/shows.json` and the generated browse/search payload at `/data/search-index.json`, so the frontend keeps working while long-form review copy lives in `catalog-src/reviews/<show-id>.json`.
If a show record is missing a usable local `cover`, catalog load will try `listenLinks.rss`, `listenLinks.apple`, `officialLinks.website`, then `listenLinks.website`, download the discovered image into `images/covers/`, and rewrite the authored show source with the new local path. Failed cover fetches fall back to a local placeholder for that process and log a warning instead of aborting startup.

Protected maintainer submission workflow routes:

- `/maintainer/submissions.html`
- `/maintainer/submissions/report.html`
- `/maintainer/imports.html`
- `/maintainer/imports/report.html`
- `/api/maintainer/session`
- `/api/maintainer/submissions`
- `/api/maintainer/imports`

The maintainer queue is passphrase-gated, reads from the same SQLite submission store as public intake, and lets you update `status`, `priority`, `review_notes`, and `reviewed_by` without opening the database directly.

The import lane is a separate internal queue for machine-found shows. It stores candidate records, source snapshots, duplicate matches, provenance, and optional AI suggestions in SQLite, then writes approved entries into `../catalog-src/shows/` as `status: "draft"` before regenerating runtime output. Nothing public auto-publishes.

Useful maintainer commands:

```bash
cd backend
npm run review:new -- <show-id>
npm run review:publish -- <show-id>
npm run review:report
npm run import:seed -- --file ./tmp/import-list.txt
npm run import:hydrate -- --candidate <candidate-id>
npm run import:report
npm run import:draft -- --candidate <candidate-id>
npm run import:publish -- --candidate <candidate-id>
```

- `review:new` creates a review companion file and moves `indexed-only` shows to `planned`
- `review:publish` validates the companion review file and promotes the show to `full-review`
- `review:report` prints a published-show audit for review coverage and metadata gaps
- `import:seed` creates internal candidates from pasted titles, Apple URLs, RSS URLs, or mixed newline lists
- `import:hydrate` fetches objective metadata snapshots from Apple, RSS, Podcast Index, and website sources when available
- `import:report` prints current import queue and gap state
- `import:draft` writes an approved candidate into the authored show source as a hidden `draft`
- `import:publish` promotes a fully reviewed draft show to `published` after normal validation succeeds
