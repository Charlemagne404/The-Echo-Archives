# Operations

## Purpose

This is the active operations and runbook reference for The Echo Archives.

Use it as the source of truth for:

- release preflight
- production configuration and deployment
- database backup and recovery
- health checks and incident diagnostics
- manual QA expectations
- submission and moderation handling
- documentation maintenance rules
- where dated QA and historical records live

## Production Runtime Contract

The supported production shape is:

- Node.js `20.12` or newer
- the Express service bound to `127.0.0.1:3010` through Caddy
- Caddy terminating HTTPS for `https://echoarchives.net`
- systemd running the app as the unprivileged `charlie` user
- SQLite at `/home/charlie/The-Echo-Archives/backend/data/community.sqlite`
- runtime secrets and overrides in `/home/charlie/The-Echo-Archives/backend/.env`

The checked-in service unit sets the public origin, static root, database path, production mode, and a read-only default for community ratings. `backend/.env` is loaded after those defaults and may intentionally override them. Keep that file owned by the application user, mode `0600`, and outside git.

The service runs a configuration preflight before every start. Invalid production configuration prevents startup instead of silently using a development fallback.

## Production Environment

Copy [`backend/.env.example`](../backend/.env.example) to `backend/.env`, then replace or remove example values. Do not put `NODE_ENV` in the environment file; systemd sets it to `production`.

Required launch decisions:

- `SITE_URL` must be the public HTTPS origin with no path, query, credentials, or fragment.
- `DB_PATH` must be absolute in production.
- `MAINTAINER_REVIEW_PASSPHRASE` and `MAINTAINER_REVIEW_COOKIE_SECRET` must either both be absent or both be configured. For launch they should be configured because the public site advertises moderated submissions.
- The maintainer passphrase must be at least 12 characters. The cookie secret must be distinct and at least 32 characters.
- `COMMUNITY_RATING_WRITES_ENABLED` is `false` by default in production. Leaving it false is a supported read-only launch mode.

Generate secrets with a system cryptographic tool, for example:

```bash
openssl rand -base64 48
```

Never commit generated values or print them in release logs.

To enable community rating writes, configure all of the following together and keep the voter secret stable across releases:

```dotenv
COMMUNITY_RATING_WRITES_ENABLED=true
COMMUNITY_TURNSTILE_ENABLED=true
COMMUNITY_TURNSTILE_SITE_KEY=<site-key>
COMMUNITY_TURNSTILE_SECRET_KEY=<secret-key>
COMMUNITY_VOTER_HASH_SECRET=<at-least-32-random-characters>
```

The preflight rejects writes-on production configuration without complete Turnstile keys and a strong, explicit voter secret. Test the widget from a private browser session before enabling public writes.

Operational limits have conservative defaults and normally do not need overrides:

| Variable | Default | Purpose |
| --- | ---: | --- |
| `HOST` | `127.0.0.1` in production | Bind address for the Caddy-fronted Node service |
| `REQUEST_TIMEOUT_MS` | `30000` | Ollama chat request timeout |
| `CHAT_MESSAGE_MAX_LENGTH` | `2000` | Maximum submitted chat message length |
| `CHAT_HISTORY_ENTRY_MAX_LENGTH` | `2000` | Maximum text retained per supplied chat history entry |
| `COMMUNITY_TURNSTILE_TIMEOUT_MS` | `5000` | Turnstile verification timeout |
| `COMMUNITY_SUMMARY_MAX_IDS` | `100` | Maximum show IDs in one summary request |
| `MAINTAINER_LOGIN_WINDOW_MS` | `900000` | Maintainer login rate-limit window |
| `MAINTAINER_LOGIN_MAX` | `5` | Login attempts allowed in that window |
| `IMPORT_FETCH_TIMEOUT_MS` | `15000` | Maintainer import request timeout |
| `IMPORT_DOCUMENT_MAX_BYTES` | `5242880` | Maximum imported text/JSON document size |
| `IMPORT_COVER_MAX_BYTES` | `8388608` | Maximum imported cover response size |
| `IMPORT_WORKER_CONCURRENCY` | `4` | Concurrent candidate preparation jobs |
| `IMPORT_HOST_CONCURRENCY` | `2` | Concurrent requests to one source host |
| `IMPORT_APPLE_REQUESTS_PER_MINUTE` | `15` | Apple lookup/search rate bucket |
| `IMPORT_AUTO_WORKER` | `true` | Run queued import jobs in the backend process |

Validate the effective local or production-style configuration from the repo root:

```bash
npm run check:config
NODE_ENV=production npm run check:config
```

These root commands load `backend/.env` when it exists. Shell environment values take precedence over the file.

## Release Preflight

Install the complete locked dependency set on the release workstation:

```bash
npm --prefix backend ci
```

Run release preflight from the repo root:

```bash
npm run check:config
npm run verify
npm --prefix backend audit
npm --prefix backend audit --omit=dev
git status --short
```

If `npm run verify` fails, do not publish.

`npm run verify` currently:

- regenerates committed root HTML from `site-src/`
- runs repo structure checks
- runs repository build, SEO, and operations tool tests
- runs backend data validation
- runs archive link checks
- runs backend tests
- runs Playwright smoke coverage

The working tree should stay clean after verification. If `npm run build:pages` or `npm run verify` changes generated root HTML, review the diff and commit it instead of hand-editing the public page files.

Do not install production dependencies or restart the live service until the release commit passes the complete workstation preflight, including Playwright. The production server update intentionally runs the non-browser subset after installing only production dependencies.

## First Server Install

On the server, clone the repository at `/home/charlie/The-Echo-Archives`, then run as the `charlie` user:

```bash
cd /home/charlie/The-Echo-Archives
npm --prefix backend ci --omit=dev
```

Configure `/home/charlie/The-Echo-Archives/backend/.env`, validate it, then install the checked-in systemd and Caddy configuration:

```bash
NODE_ENV=production npm run check:config
sudo ./deploy/install-echo-archives-system.sh
```

The installer:

- composes and validates the complete Caddyfile before replacing the live file
- keeps timestamped backups of the prior Caddyfile and service unit
- installs and restarts `echo-archives.service`
- waits for the local health endpoint before reloading Caddy
- prints service status and the health response

It does not configure DNS, create secrets, or modify a live database.

## Production Domain Migration

The canonical public origin is `https://echoarchives.net`. The checked-in Caddy
configuration serves that host and sends `https://echo.continental-hub.com` to
the same path and query on the new origin with a permanent redirect.

Before installing the migration on the production server:

1. Point the apex `echoarchives.net` A/AAAA records at the Caddy host. Keep the
   existing `echo.continental-hub.com` records pointed there too; Caddy must be
   able to serve HTTPS before it can return the redirect.
2. In the production `backend/.env`, set `SITE_URL=https://echoarchives.net`.
   That file overrides the value in the systemd unit.
3. Pull the release, install production dependencies, run the production
   configuration check, then run `sudo ./deploy/install-echo-archives-system.sh`.

After the install, verify the new host serves the application and the legacy
host returns a permanent redirect before updating any external links. Retain the
legacy redirect for the foreseeable future to preserve existing bookmarks and
search-engine signals.

## Routine Server Update

Run routine updates as the `charlie` application user, not root:

```bash
cd /home/charlie/The-Echo-Archives
./deploy/update-echo-archives.sh
```

The update script deliberately stops before restart unless all of these succeed:

1. The checkout is clean, on a branch with an upstream.
2. The upstream update can be applied fast-forward-only.
3. The locked production dependencies install with `npm ci --omit=dev`.
4. Production configuration validates.
5. Catalog/page generation, structure, tool tests, data, links, and backend tests pass without changing tracked output.
6. An online SQLite backup completes and passes `PRAGMA integrity_check`.

It then restarts the service and polls `/api/health`. A failed health check prints systemd status and the last 80 journal entries and exits nonzero. It does not automatically roll back code or data; inspect the failure before choosing a revision or restoring a database.

The following optional shell variables are available for nonstandard installations:

- `SERVICE_NAME`
- `HEALTH_URL`
- `HEALTH_ATTEMPTS`
- `HEALTH_INTERVAL_SECONDS`

## Database Backups And Restore

Create a verified online backup from the repo root:

```bash
npm run backup:database
```

By default this reads `DB_PATH` from `backend/.env` and writes a mode-`0600`, timestamped SQLite file under `backend/data/backups/`. The directory is ignored by git. `BACKUP_DIR` may select a different default directory. No retention deletion is automatic; copy backups off-host and apply a reviewed retention policy separately.

Explicit paths are supported for one-off checks and off-host mount points. Relative paths are resolved from `backend/`:

```bash
npm run backup:database -- --source /absolute/path/community.sqlite --destination /absolute/path/community-backup.sqlite
```

Before trusting the backup process for launch, copy one backup to a temporary location, open it with `sqlite3`, and confirm expected table counts. Perform a restore drill on a non-production copy.

Restore is a manual maintenance operation. Confirm every path before running it:

1. Put the site into a maintenance window and stop `echo-archives.service`.
2. Verify the selected backup with `sqlite3 <backup> 'PRAGMA integrity_check;'`; the only result should be `ok`.
3. Move the current database and any `-wal`/`-shm` sidecars to a timestamped recovery location. Do not delete them.
4. Install the backup at the configured `DB_PATH` with owner/group `charlie` and mode `0600`.
5. Start the service, check `/api/health`, then inspect the maintainer queues and community summaries.
6. Retain the pre-restore database until the restored state has been reviewed.

## Health, Logs, And Failure Diagnosis

Local readiness:

```bash
curl --fail --show-error --silent http://127.0.0.1:3010/api/health
```

The endpoint is not cached. It returns a failure status when SQLite is unavailable and exposes only service readiness, feature readiness, and public catalog counts.

Service status and recent logs:

```bash
sudo systemctl --no-pager --full status echo-archives.service
sudo journalctl --unit echo-archives.service --lines 100 --no-pager
sudo journalctl --unit echo-archives.service --since '15 minutes ago' --no-pager
```

The service uses request IDs for backend diagnostics. When investigating a public 5xx response, correlate its response request ID with the journal without copying submission bodies, contact details, cookies, or secrets into tickets.

If startup fails, run the production preflight as the application user before changing the unit:

```bash
cd /home/charlie/The-Echo-Archives
NODE_ENV=production npm run check:config
```

The checked-in unit allows 15 seconds for graceful shutdown. Repeated crashes are bounded by systemd start limits instead of creating an unbounded restart loop.

## Proxy And Live-Host Verification

Caddy enables zstd/gzip compression, strips its `Server` response header, and adds HSTS. Express owns the response-aware cache policy: successful versioned `?v=` resources are immutable, unversioned images use short stale-while-revalidate caching, sitemap/robots use one-hour caching, and HTML/data/script/style/service-worker shells revalidate. Keeping cache headers in the application prevents transient 404 or 5xx responses from inheriting an immutable proxy policy. Private maintainer and API responses also remain controlled by the application.

After installing or changing the proxy configuration, verify locally and publicly:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
curl --compressed --silent --show-error --dump-header - --output /dev/null https://echoarchives.net/
curl --silent --show-error --dump-header - --output /dev/null 'https://echoarchives.net/style.css?v=<current-version>'
curl --silent --show-error --dump-header - --output /dev/null https://echoarchives.net/sw.js
curl --silent --show-error --dump-header - --output /dev/null https://echoarchives.net/api/health
curl --silent --show-error --dump-header - --output /dev/null https://echo.continental-hub.com/
```

Confirm HTTPS, HSTS, compression on eligible content, the expected cache policy, and absence of internal paths or server error detail. Caddy is not available in every development environment, so its config must also be validated on the target host before launch.

For the legacy host, confirm a `308` response with a `Location` header whose
origin is `https://echoarchives.net` and whose path and query are unchanged.

## Generated Output Rule

Keep these ownership rules intact:

- `catalog-src/` is authored catalog source
- `site-src/` is authored page source
- root HTML files are generated, committed public output
- `shared/` contains active runtime code, shared styles, and active config
- `data/` contains generated runtime/public catalog output only
- `docs/`, `docs/research/`, and `docs/archive/` are never runtime inputs
- temporary outputs belong in ignored temp locations, not tracked repo folders

Catalog/page builds also own `images/generated/covers/`, `images/generated/info/`, and the root route CSS bundles. Run `npm run build:catalog` before `npm run build:pages`; review generated image, runtime catalog, stylesheet, page, and service-worker diffs together. Do not copy responsive image metadata into authored catalog records or hand-edit generated variants.

## Catalog And Asset Checks

Validation and normal startup can auto-download missing show cover art into `images/covers/` and rewrite the authored show source with the resolved local cover path.

Review and commit those changes when they are legitimate.

Before publishing catalog changes, confirm:

- no broken local covers or route assets remain
- no invalid absolute URLs exist in listen or official links
- no invalid enum values or duplicate taxonomy terms exist
- no review companion merge issues exist
- no optional dataset errors exist if `creators.json`, `networks.json`, or `changelog.json` are introduced later
- each local published cover has generated 320px/640px variants when the source is large enough, with the original retained as fallback
- generated 320px covers stay at or below 100 KiB, 640px covers at or below 220 KiB, and generated information-page illustrations at or below 350 KiB
- the service-worker install list remains an offline shell rather than including catalog JSON, the search index, route modules, maintainer code, submit code, or chat code
- each page requests only its manifest-declared route CSS; `chat.css` should not load before the launcher is used

## Manual Route QA

Verify these public routes before publishing significant catalog, route, style, or behavioral changes:

- `/`
- `/about`
- `/for-creators`
- `/creator-standards`
- `/supporters`
- `/help-center`
- `/collections`
- `/collections/<known-collection-id>`
- `/shows/<known-show-id>`
- `/submit`
- `/privacy`
- `/terms`
- `/cookies`
- `/copyright`
- `/404.html`
- `/500.html`
- `/offline.html`

Checks:

- page title and canonical URL match the route
- required social/meta tags exist on the public and error routes
- homepage trust stats render
- homepage search, structured filters, quick filters, and recently updated mode work
- homepage most-popular band behaves sensibly with and without community summary data
- no-results recovery actions work
- inline preview and card interactions do not produce layout breakage
- Ask the Archivist opens and closes cleanly
- show and collection missing states stay coherent
- show and collection share actions work, including copy/share feedback
- offline fallback appears after service-worker registration when the network is cut
- submit modes switch correctly across show, correction, listener review, and creator verification

If maintainer auth is enabled, also verify:

- `/maintainer/submissions.html`
- `/maintainer/submissions/report.html`
- `/maintainer/imports.html`
- `/maintainer/imports/report.html`

## Launch Checks

- production must serve `/shows/:showId`, `/collections/:collectionId`, their compatibility redirects, and `/sitemap.xml` through the backend so crawlers and social scrapers receive entry-specific metadata and real status codes
- the committed `sitemap.xml` should contain show and collection URLs generated from the live catalog, not just top-level pages
- `sitemap.xml` loads
- `robots.txt` loads
- `sw.js` loads
- legacy show-detail and query-string aliases still return a permanent redirect to canonical `/shows/...` or `/collections/...` routes
- maintainer auth is enabled and tested before public promotion of submissions or corrections
- submission and correction handling is ready before promotion
- submission queue behavior is the live intake path; no public email-delivery feature is assumed
- community rating writes are either fully configured and tested with Turnstile plus voter-hash secrets, or clearly left read-only on purpose
- run a private/incognito pass on `/`, `/shows/<known-show-id>`, `/collections/<known-collection-id>`, and `/submit`
- verify Plausible pageview analytics only when `PLAUSIBLE_DOMAIN` is configured for the build
- docs stay accurate when routes, schema, or operating assumptions change

## Submission Intake Surface

Public intake currently lives on:

- `/submit`
- `POST /api/submissions/shows`

Supported `submissionType` values:

- `show`
- `correction`
- `listener-review`
- `creator-verification`

Everything enters the same SQLite-backed review queue. Nothing auto-publishes.

Maintainer review has protected internal surfaces:

- `/maintainer/submissions.html`
- `/maintainer/submissions/report.html`

Protected queue APIs:

- `POST /api/maintainer/session`
- `DELETE /api/maintainer/session`
- `GET /api/maintainer/submissions`
- `GET /api/maintainer/submissions/:id`
- `PATCH /api/maintainer/submissions/:id`

Maintainer routes are disabled unless `MAINTAINER_REVIEW_PASSPHRASE` is configured.

Use:

- `MAINTAINER_REVIEW_COOKIE_SECRET` to sign the session cookie
- `MAINTAINER_REVIEW_SESSION_TTL_HOURS` to control session length

## Catalog Import Lane

Machine-found show intake is separate from the public submission queue.

Protected internal import surfaces:

- `/maintainer/imports.html`
- `/maintainer/imports/report.html`

Protected import APIs:

- `GET /api/maintainer/imports`
- `POST /api/maintainer/imports`
- `GET /api/maintainer/imports/search`
- `GET /api/maintainer/imports/runs/:runId`
- `POST /api/maintainer/imports/runs/:runId/retry`
- `POST /api/maintainer/imports/audit`
- `POST /api/maintainer/imports/batch-publish`
- `GET /api/maintainer/imports/:id`
- `POST /api/maintainer/imports/:id/hydrate`
- `PATCH /api/maintainer/imports/:id/review`
- `POST /api/maintainer/imports/:id/draft`
- `POST /api/maintainer/imports/:id/retry`
- `POST /api/maintainer/imports/:id/evidence`
- `POST /api/maintainer/imports/:id/publish`

Useful import CLI commands:

```bash
cd backend
npm run import:seed -- --file ./tmp/import-list.txt
npm run import:hydrate -- --candidate <candidate-id>
npm run import:report
npm run import:draft -- --candidate <candidate-id>
npm run import:publish -- --candidate <candidate-id>
npm run import:audit
npm run import:benchmark
```

Import workflow:

1. Seed titles, Apple URLs, RSS URLs, or mixed newline lists into the internal queue.
2. Persistent workers enrich, resolve, stage covers, and prepare records automatically.
3. Inspect `ready` records; resolve only the named blockers on `needs-review` records.
4. Use **Approve and publish** to write a factual `indexed-only` record and run one catalog build.
5. Add archive-owned editorial enrichment later through the independent review workflow.

Operational rules:

- nothing public auto-publishes
- objective metadata is automatically resolved from retained evidence
- AI output never populates the prepared factual record
- Podcast Index enrichment is optional and must degrade cleanly when credentials are absent
- external calls are protected by persistent retries, caching, per-host concurrency, and rate buckets

Full source policy, readiness rules, retry timing, update locks, snapshot retention, and publication recovery are in `docs/IMPORTER.md`.

Duplicate review rules:

- prefer feed URL matches over title-only matches
- treat Apple collection id, Podcast Index feed id, and Podcast Index guid matches as strong duplicate signals
- use normalized title plus creator matches as review prompts, not auto-merge rules
- mark duplicates in the queue instead of deleting history

## Queue Data Expectations

Each submission should store:

- shared identifying fields such as `show_title`, `existing_show_id`, `contact_email`, and optional link fields
- `payload_json` for type-specific structured data
- `provenance_json` for source-link data when relevant
- moderation metadata such as `status`, `priority`, `review_notes`, `reviewed_by`, and `reviewed_at`

## Recommended Moderation Statuses

Use a small predictable vocabulary:

- `new`
- `in-review`
- `accepted`
- `rejected`
- `needs-follow-up`

## Type-Specific Submission Rules

`show`:

- requires a contact email
- requires at least one of `officialSite` or `rssOrListenLink`
- stores show-focused context in `payload_json`

`correction`:

- requires a known `existing_show_id`
- accepts optional contact email
- requires factual correction details in `notes`
- should not be used for editorial disagreement

`listener-review`:

- requires a known `existing_show_id`
- accepts optional contact email
- requires a 1 to 10 rating
- requires review text
- stores rating, spoiler level, and review text in `payload_json`

`creator-verification`:

- requires a known `existing_show_id`
- accepts optional contact email
- requires at least one verification source link
- requires factual notes describing what should be verified or corrected
- stores source links in both `payload_json` and `provenance_json`

## Moderation Rules

- Keep archive editorial stance separate from community and creator input.
- Do not publish raw listener or creator submissions automatically.
- Treat creator verification as factual metadata review, not editorial control.
- Preserve provenance links for accepted factual changes sourced from creators or official channels.

## Community Rating Rules

- Keep community rating clearly separate from Archive Rating.
- Do not imply creator endorsement through creator verification.
- Community rating writes default to disabled in production; a read-only launch is intentional and supported.
- Community rating writes use a server-issued HTTP-only voter cookie for one active vote per show per device.
- Enabling writes in production requires `COMMUNITY_TURNSTILE_ENABLED`, both Turnstile keys, and an explicit voter-hash secret.
- Keep `COMMUNITY_VOTER_HASH_SECRET` stable between deploys so existing voter cookies keep resolving to the same hashed profile.
- Public averages stay hidden until `COMMUNITY_MIN_PUBLIC_RATINGS` verified votes exist for a show. The default threshold is `3`.
- Rating abuse signals use salted IP and user-agent hashes and should be pruned with `COMMUNITY_ABUSE_RETENTION_DAYS`, defaulting to `30`.

## Documentation Maintenance

Active repo-wide docs:

- `README.md`
- `AGENTS.md`
- `docs/PRODUCT.md`
- `docs/ROADMAP.md`
- `docs/ARCHITECTURE.md`
- `docs/OPERATIONS.md`
- `data/schema.md`
- `backend/README.md`

Supporting records:

- `HANDOFF.md`: current task state and recent handoff notes
- `MEMORY.md`: stable long-term repo facts worth preserving across tasks
- `TODO.md`: small discovered follow-ups that are not full roadmap items
- `docs/qa/`: dated QA reports
- `docs/research/feedback/`: design and research feedback snapshots
- `docs/archive/`: retired planning and historical material

Documentation rules:

- keep active docs current and concise
- prefer updating an existing source-of-truth doc over creating a new planning file
- use exact counts and exact dates when recording current project state
- move retired one-off plans and historical snapshots into `docs/archive/`
- keep archival datasets under `docs/archive/data/` and concept art under `docs/research/concepts/` when they are no longer active inputs
- keep dated QA as reports, not as evergreen guidance

## Current QA Record

The latest recorded mobile QA pass still lives at:

- `docs/qa/2026-06-07-mobile-qa.md`

If a newer manual QA pass is done, add a new dated report instead of overwriting the old one.
