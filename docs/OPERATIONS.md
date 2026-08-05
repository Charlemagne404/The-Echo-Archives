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

- Node.js `22.12` or newer; CI and production currently pin `22.23.1`
- the Express service bound to `127.0.0.1:3010` through Caddy
- Caddy terminating HTTPS for `https://echoarchives.net`
- systemd running the app as the dedicated `echo-archives` account
- SQLite at `/var/lib/echo-archives/community.sqlite`
- runtime secrets and overrides in `/home/charlie/The-Echo-Archives/backend/.env`

The checked-in service unit sets the public origin, static root, database path,
and production mode. It applies device, kernel, capability, address-family,
personality, realtime, and setuid/setgid isolation that is compatible with the
current importer and publication paths. `backend/.env` supplies feature state
and secrets; before migration, keep it owned by `charlie`, mode `0600`, and
outside Git. The migration preserves that owner and adds only a named read ACL
for the runtime account. Because the ACL mask occupies the numeric group-mode
bits, verify the effective entries with `getfacl backend/.env` rather than
assuming a post-migration numeric mode of `0600`.

The checkout remains owned and deployed by `charlie`. The runtime account can
read it but cannot write application code or `.git`. It can write only the
dedicated SQLite state directory and the importer staging/publication paths
listed in the dedicated-account procedure below.

The canonical deployment installs dependencies as `charlie`, then applies
read/traverse ACLs to the immutable candidate `node_modules` tree and verifies
module resolution as `echo-archives` before restarting. Do not replace that
step with a recursive ownership change; deployment and runtime ownership remain
separate.

The service runs a configuration preflight before every start. Invalid production configuration prevents startup instead of silently using a development fallback.

## Production Environment

Copy [`backend/.env.example`](../backend/.env.example) to `backend/.env`, then replace or remove example values. Do not put `NODE_ENV` in the environment file; systemd sets it to `production`.

`backend/.env` is the single production source for application feature flags.
The systemd unit sets runtime location and process values but does not duplicate
feature flags. The local production monitor independently declares the expected
public state through `EXPECTED_COMMUNITY_RATING_WRITES` and
`EXPECTED_MAINTAINER_REVIEW`, and `EXPECTED_ACCESS_LOGS` in
`/etc/echo-archives/monitoring.env`; a mismatch between either local/public
health response and those expectations fails the gate.

Required launch decisions:

- `SITE_URL` must be the public HTTPS origin with no path, query, credentials, or fragment.
- `DB_PATH` must be absolute in production.
- `MAINTAINER_REVIEW_PASSPHRASE` and `MAINTAINER_REVIEW_COOKIE_SECRET` must either both be absent or both be configured. For launch they should be configured because the public site advertises moderated submissions.
- The maintainer passphrase must be at least 12 characters. The cookie secret must be distinct and at least 32 characters.
- `COMMUNITY_RATING_WRITES_ENABLED` is `false` by default in production. The
  owner-selected launch state is `true`, but only after the complete production
  flow, permissions, Turnstile, and rate limits pass verification. The
  read-only state remains the safe fallback if that gate fails.

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

Launch production with bounded access observability enabled:

```dotenv
ACCESS_LOG_ENABLED=true
ACCESS_LOG_HMAC_SECRET=<at-least-32-random-characters>
```

The application emits structured request metadata without raw client IPs,
query strings, bodies, cookies, or user-agent strings. Client addresses become
16-character HMAC pseudonyms whose derived key rotates each UTC week. Keep the
master secret private and stable; changing it deliberately breaks correlation.
If those keys are not already present, the guarded helper can generate and
append them without printing the secret:

```bash
node backend/scripts/configure-access-observability.js --env backend/.env
```

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
| `IMPORT_AUTO_DISCOVERY` | `false` | Optional in-process scheduler; production discovery uses the systemd timer |
| `IMPORT_DISCOVERY_CONCURRENCY` | `2` | Maximum concurrent discovery source checks |

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

The default smoke browser is Chromium. Before a public release, install the additional Playwright engines and repeat the serial browser suite in Firefox and WebKit:

```bash
npm --prefix backend run test:setup:browser -- firefox webkit
SMOKE_BROWSER=firefox npm --prefix backend run test:smoke:serial
SMOKE_BROWSER=webkit npm --prefix backend run test:smoke:serial
```

The service-worker smoke test stops the local test server after the public shell
is cached, verifies cached navigation and the uncached offline fallback, and then
restarts the server. The same real network-failure path runs in Chromium,
Firefox, and WebKit.

The working tree should stay clean after verification. If `npm run build:pages` or `npm run verify` changes generated root HTML, review the diff and commit it instead of hand-editing the public page files.

Do not install production dependencies or restart the live service until the release commit passes the complete workstation preflight, including Playwright. The production server update intentionally runs the non-browser subset after installing only production dependencies.

## 2026 launch maintenance

For the current launch remediation, use only
[`deploy/complete-launch-maintenance.sh`](../deploy/complete-launch-maintenance.sh)
and its
[`COMPLETE_LAUNCH_MAINTENANCE.md`](../deploy/COMPLETE_LAUNCH_MAINTENANCE.md)
runbook. The orchestrator pins the exact clean commit, coordinates the reviewed
Caddy/runtime-account/backup/Ollama changes, validates every shared Caddy host,
and stops with current-stage rollback on failure. It has unprivileged
`--repository-check`, privileged non-applying `--check`, and privileged
`--apply` modes.

Do not combine that session with the older broad local/host readiness scripts.
They cover unrelated co-hosted services or predate the Cloudflare-only origin
gate.

## First Server Install

On the server, clone the repository at `/home/charlie/The-Echo-Archives`, then run as the `charlie` user:

```bash
cd /home/charlie/The-Echo-Archives
npm --prefix backend ci --omit=dev
```

Configure `/home/charlie/The-Echo-Archives/backend/.env`, validate it, then install the checked-in systemd and Caddy configuration:

```bash
NODE_ENV=production npm run check:config
sudo ./deploy/migrate-echo-archives-runtime-account.sh --apply
sudo ./deploy/install-echo-archives-system.sh
```

The installer:

- composes and validates the complete Caddyfile before replacing the live file
- keeps timestamped backups of the prior Caddyfile and installed systemd units
- requires and rechecks the completed dedicated-account migration
- installs the isolated 14-day Echo Archives journal configuration
- installs and restarts `echo-archives.service`
- installs the discovery and verified-backup units, enabling both timers
- waits for the local health endpoint before reloading Caddy
- prints service status, the health response, and both timer schedules

It does not configure DNS, create secrets, or modify a live database.

### Dedicated runtime-account migration

The guarded migration moves the live database out of the deploy checkout,
creates the system account with a non-login shell, installs the hardened
service, and adds a hardened discovery-service drop-in. Run it once from the
canonical clean production checkout as `charlie`:

```bash
sudo /home/charlie/The-Echo-Archives/deploy/migrate-echo-archives-runtime-account.sh --apply
sudo /home/charlie/The-Echo-Archives/deploy/migrate-echo-archives-runtime-account.sh --check
```

The migration stops only Echo Archives application, discovery, monitoring, and
backup units while it takes an integrity-checked SQLite copy. It does not
delete the legacy database. Protected rollback material is recorded under
`/var/backups/echo-archives-runtime-account/`, and the successful backup path is
recorded in `/var/lib/echo-archives-runtime-account/readiness`.

The runtime account receives write access only to:

- `/var/lib/echo-archives`
- `backend/data/import-staging`
- `catalog-src/shows`
- `images/covers`
- `images/generated/covers`
- `data/reviews`
- the six generated catalog/status files declared in the service unit

Those checkout exceptions are required because approved importer publication
currently writes authored and generated artifacts in place. Publication can
therefore make the production checkout dirty. Review, validate, commit, and
push those artifacts as `charlie` before the next canonical deployment. The
migration uses targeted ACLs; it does not recursively transfer checkout
ownership or add the service account to `charlie`'s group.

The migration checks runtime database writes, checkout protection, importer
write paths, static serving, loopback Ollama access, discovery identity, a
structured access event in the isolated journal, and a normal verified local
backup. Roll back to the recorded migration backup, or name a specific
protected backup, with:

```bash
sudo /home/charlie/The-Echo-Archives/deploy/migrate-echo-archives-runtime-account.sh --rollback
sudo /home/charlie/The-Echo-Archives/deploy/migrate-echo-archives-runtime-account.sh --rollback /var/backups/echo-archives-runtime-account/<timestamp>
```

Rollback first captures the newest dedicated-account database into the legacy
location, restores prior units, environment, ACLs, and active timer state, and
keeps the dedicated account, state directory, and rollback bundle for
inspection. It does not delete production data.

## Production Domain Migration

The canonical public origin is `https://echoarchives.net`. The checked-in Caddy
configuration serves that host and sends `https://www.echoarchives.net` and
`https://echo.continental-hub.com` to the same path and query on the canonical
origin with permanent redirects.

Before installing the migration on the production server:

1. Point the apex `echoarchives.net` and `www.echoarchives.net` A/AAAA records
   at the Caddy host. Keep the existing `echo.continental-hub.com` records
   pointed there too; Caddy must be able to serve HTTPS before it can return
   either redirect.
2. In the production `backend/.env`, set `SITE_URL=https://echoarchives.net`.
   The environment file is authoritative for application feature flags; the
   unit supplies only the fixed runtime defaults documented above.
3. Pull the release, install production dependencies, run the production
   configuration check, then run `sudo ./deploy/install-echo-archives-system.sh`.

The committed domain cutover helper performs the environment update, Caddy and
systemd installation, local HTTPS health check, and legacy-redirect check in
one operation. Run it from the production checkout after pulling the release:

```bash
sudo ./deploy/migrate-echoarchives-domain.sh
```

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

`deploy/update-echo-archives.sh` is the only supported deployment
implementation. The repository-root `update-echo-archives.sh` exists only as a
compatibility wrapper and immediately delegates to the canonical script;
automation and runbooks should use the `deploy/` path directly.

The update script deliberately stops before restart unless all of these succeed:

1. The checkout is clean, on a branch with an upstream.
2. The upstream update can be applied fast-forward-only.
3. The locked production dependencies install with `npm ci --omit=dev`.
4. Production configuration validates.
5. Catalog/page generation, structure, tool tests, data, links, and backend tests pass without changing tracked output.
6. An online SQLite backup completes and passes `PRAGMA integrity_check`.

It then restarts the service and polls `/api/health`. A failed health check prints systemd status and the last 80 journal entries and exits nonzero. It does not automatically roll back code or data; inspect the failure before choosing a revision or restoring a database.

## Post-Reboot Local Launch Completion

After the reviewed host-maintenance pass and reboot, run the guarded local
completion once from the production checkout:

```bash
sudo /home/charlie/The-Echo-Archives/deploy/complete-local-launch-readiness.sh --apply
```

The script captures the exact UFW, nftables, iptables, and ip6tables state under
`/var/backups/echo-archives-local-readiness/`; requires the reviewed public
allows and rejects the obsolete rules; installs a user-service drop-in that
waits for a successful MongoDB ping before starting Continental ID auth; keeps
the obsolete root auth service disabled; restarts and verifies the intended
user service; and runs firewall, listener, Caddy, Echo, auth, and local-monitor
postflight checks. It rolls back the auth drop-in if a post-change check fails
and never reboots the host.

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

### Daily local backup timer

The checked-in `echo-archives-backup.service` runs the same verified backup command each day at approximately 03:15 local time, with a randomized delay of up to 15 minutes. The main system installer installs and enables this timer after the application passes its local health check. Verify it on the production host:

```bash
systemctl list-timers echo-archives-backup.timer
```

The timer creates local recovery copies only. Configure an encrypted off-host destination and a retention policy separately; a backup stored only on this server does not protect against host loss.

Before trusting the backup process for launch, copy one backup to a temporary location, open it with `sqlite3`, and confirm expected table counts. Perform a restore drill on a non-production copy.

### Encrypted Raspberry Pi backup

The production off-host destination is the dedicated Restic SFTP repository on
the Raspberry Pi. The root-only configuration is intentionally kept outside the
checkout:

- `/etc/echo-archives/pi-restic.env`
- `/etc/echo-archives/pi-restic-password`
- `/root/.ssh/echo-archives-pi-backup`
- `/usr/local/sbin/echo-archives-pi-backup`

The root-owned manual script is retained for supervised diagnostics but is not
referenced by automatic units because it creates a redundant fresh local backup.

`echo-archives-offsite-backup.timer` is the only canonical automatic Pi backup
timer. It runs at approximately 04:00 local time, after the local SQLite timer's
03:15–03:30 window. Its oneshot service waits for `network-online.target` and
`tailscaled.service`, proves Tailscale and root SSH reachability, selects the
newest completed local `.sqlite` backup, and verifies a protected byte-for-byte
staging copy in its systemd-managed state directory, outside Restic's active
cache tree. A backup older than six hours is rejected,
so a failed local-backup run cannot silently upload yesterday's database. The
job builds a stable encrypted recovery inventory from that copy, importer cover
staging, the production environment, the active Caddyfile, Echo systemd units,
all runtime-writable publication directories and generated catalog/status files,
and the private monitor configuration. It uploads only that stable state copy,
requires the backup summary and snapshot metadata to match it, restores and
byte-verifies the exact recovery subfolder, compares the exact restored tree with
its manifest, applies the reviewed Restic retention policy, requires `restic
check` to succeed, removes all unencrypted staging, and only then atomically
publishes a success marker containing the full snapshot ID. It never opens the
live database or creates a second local database backup.

The Restic password and SSH identity are bootstrap credentials and must have a
separately tested owner-controlled recovery copy; storing them only inside the
repository they unlock is not recovery.

Retention groups snapshots by host and `echo-archives` tag rather than by
source path, because timestamped local backup filenames change every day.

`ProtectHome=read-only` is intentional. Do not add the live database or any
broad home/repository path to `ReadWritePaths`. The off-site service receives
write access only to its Restic cache, monitoring state, and the exact completed
backup directory because it applies the owner-approved 30-day retention only
after upload and remote verification. It never writes the live database.

The guarded first-time completion and repeat restore-drill procedure is:

```bash
sudo /home/charlie/The-Echo-Archives/deploy/complete-pi-backup-setup.sh --apply
```

If the restore drill has already passed and only the automatic service needs
repair, use the repair-only mode. It validates the recorded successful restore
and does not repeat it:

```bash
sudo /home/charlie/The-Echo-Archives/deploy/complete-pi-backup-setup.sh --repair-automation
```

It does not initialize a repository or restore over production. It selects the
last successful Echo-tagged snapshot pinned by the success marker, ignoring
newer failed-run orphans, and restores it beneath a unique `/var/tmp`
directory, validates SQLite integrity, foreign keys, and required non-empty
tables, then starts an isolated application as `echo-archives` on loopback port 3911
against that restored copy. The drill requires healthy application state,
matching catalog counts, and a representative rendered show page before
removing only the temporary restore. It installs the canonical unit pair, runs
the service, requires a new snapshot, checks retention and repository
integrity, enables the timer, rejects competing Echo Archives Pi automation,
and requires zero failed systemd units. The last successful result is recorded
without credentials or content at
`/var/lib/echo-archives-monitoring/pi-backup-readiness`.

Routine checks:

```bash
systemctl list-timers echo-archives-offsite-backup.timer --all
systemctl status echo-archives-offsite-backup.service
journalctl -u echo-archives-offsite-backup.service --since today
```

### Scheduled show discovery

The checked-in discovery timer runs the protected `import:discover` command every 30 minutes. The main system installer installs and enables it. It does nothing until a maintainer configures and enables a focused source in **Catalog imports**; each source still observes its own configured cadence.

```bash
systemctl list-timers echo-archives-discovery.timer
```

Run all enabled sources manually for an operational check with `npm --prefix backend run import:discover -- --all`. Discovery only creates internal candidates; the existing maintainer review and explicit publication approval remain mandatory.

Restore is a manual maintenance operation. Confirm every path before running it:

1. Put the site into a maintenance window and stop `echo-archives.service`.
2. Verify the selected backup with `sqlite3 <backup> 'PRAGMA integrity_check;'`; the only result should be `ok`.
3. Move the current database and any `-wal`/`-shm` sidecars to a timestamped recovery location. Do not delete them.
4. Install the backup at the configured `DB_PATH` with owner/group
   `echo-archives:echo-archives` and mode `0640`.
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
sudo systemctl --no-pager --full status systemd-journald@echo-archives.service
sudo journalctl --namespace=echo-archives --unit echo-archives.service --lines 100 --no-pager
sudo journalctl --namespace=echo-archives --unit echo-archives.service --since '15 minutes ago' --no-pager
```

The namespaced journal is persistent, compressed, bounded to 256 MiB while
leaving at least 1 GiB free, and expires entries after 14 days. The service uses
request IDs for backend diagnostics. When investigating a public 5xx response,
correlate its response request ID with the journal without copying submission
bodies, contact details, cookies, or secrets into tickets. The production
monitor requires health to report `features.accessLogs=true` when
`EXPECTED_ACCESS_LOGS=true`.

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

For the legacy host, confirm a permanent `301` response with a `Location` header whose
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
- `GET /api/submissions/shows/:showId/context` for the public objective facts used by correction and verification forms

Supported `submissionType` values:

- `show`
- `correction`
- `listener-review`
- `creator-verification`

Everything enters the same SQLite-backed review queue. Nothing auto-publishes.
New clients send `intakeVersion: 2`; unversioned queue records remain readable through the legacy normalization and maintainer-formatting paths.

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
- `GET /api/maintainer/imports/discovery`
- `POST /api/maintainer/imports/discovery/sources`
- `PATCH /api/maintainer/imports/discovery/sources/:sourceId`
- `POST /api/maintainer/imports/discovery/sources/:sourceId/run`
- `POST /api/maintainer/imports/batch-publish`
- `GET /api/maintainer/imports/:id`
- `POST /api/maintainer/imports/:id/hydrate`
- `PATCH /api/maintainer/imports/:id/review`
- `POST /api/maintainer/imports/:id/draft`
- `POST /api/maintainer/imports/:id/retry`
- `POST /api/maintainer/imports/:id/reopen`
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
npm run import:discover -- --all
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

- requires a show title and at least one typed official, RSS, or listening URL
- accepts creator/network, contact email, tags, completion status, description, and notes as optional enrichment hints
- defaults an omitted completion status to `unknown`
- derives importer handoff fields from typed link labels, then keeps importer enrichment and publication as separate protected approvals

`correction`:

- requires a known `existing_show_id`
- accepts optional contact email
- stores v2 fields in `payload.correctionDetails`
- `broken-link` requires the affected URL and a Replace/Remove action; Replace also requires a replacement URL
- `metadata` requires the metadata field, proposed value, and supporting source
- `status` requires the proposed status and supporting source; effective-date context is optional
- `credits` requires an Add/Update/Remove action, person or organization, role, and supporting source
- `artwork` requires an official artwork URL; credit is optional
- `other` requires the issue and proposed correction; a source is optional
- should not be used for editorial disagreement

`listener-review`:

- requires a known `existing_show_id`
- accepts optional contact email
- requires a 1 to 5 overall rating, spoiler level, and review text
- accepts an optional review title and zero, some, or all supported 1 to 10 category scores
- validates each supplied category independently and rejects unknown category keys
- published category aggregates continue to use each category's own qualifying ratings and visibility threshold

`creator-verification`:

- requires a known `existing_show_id`
- requires creator/network, role, requested factual updates, and a verification method
- official-domain email requires a valid contact email
- website, social-account, and press-kit methods require the corresponding official URL
- `other` requires an evidence description plus either a URL or contact email
- stores v2 method evidence in `payload.verificationEvidence` and retains source links in `provenance_json`
- treats domain matching and official-source evidence as maintainer signals, never automatic approval

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
