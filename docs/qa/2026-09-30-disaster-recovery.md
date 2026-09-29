# Disaster recovery and operations drill — 2026-09-30

## Scope and safety

Completed in the disposable `codex/overnight-disaster-recovery` worktree from
`ORIGINAL_BASE=aa81d5d088508e65822ea059af5928569e2c4043`. The original checkout,
production host, provider state, and user databases were not modified. Backup,
corruption, permission, startup, and restore probes used disposable temporary
paths/databases only. No product feature or dependency was added.

The authoritative recovery steps are in
[`deploy/DISASTER_RECOVERY.md`](../../deploy/DISASTER_RECOVERY.md); deployment
and rollback mechanics remain in `deploy/RELEASE_WORKFLOW.md` and
`deploy/ROLLBACK_PLAN.md`.

## Production-critical map

| Subsystem | Repository-backed contract |
| --- | --- |
| Static/generated public site | `catalog-src/` and `site-src/` are authored sources. `npm run build:catalog` and then `npm run build:pages` create `data/`, route pages, search projection, manifest, and service worker. Release artifacts are immutable under `/srv/echo-archives/releases/<sha>`; mutable catalog/publication output uses `/srv/echo-archives/runtime/production/<sha>`. |
| Backend and proxy | systemd `echo-archives.service`, dedicated `echo-archives` account, Node on `127.0.0.1:3010`. Caddy terminates HTTPS and proxies to that loopback listener; the checked-in Caddy file has no static fallback. Staging is private loopback `:3011` with its own database and health listener `:4011`. |
| Persistent data and projection | Production SQLite `/var/lib/echo-archives/community.sqlite`; staging SQLite `/var/lib/echo-archives-staging/community.sqlite`. SQLite WAL and `synchronous=FULL` are the default. The app projects authored catalog data into SQLite; generated search/catalog JSON and page data are rebuilt from source. |
| Service worker and browser-local state | Generated `sw.js` precaches an offline shell and visited public pages, does not cache `/api/`, and does not store Listener Library IndexedDB records in Cache Storage. Local Library state cannot be recovered from server backups. |
| Configuration/secrets | `/srv/echo-archives/shared/env/production.env`, root-owned mode `0600`, validated before service start. Staging has separate configuration and is rejected if it points at production state. |
| Backup/restore | Online SQLite backup, source/copy integrity and foreign-key checks, backup mode `0600`, no overwrite, failed partial removal. Checker validates newest by directory mtime or an exact `--file`; Restic/SFTP recovery is a separate host workflow. |
| Release, health, logs, rollback | `deploy/echo` builds an isolated temporary artifact, validates it, sends it through private staging, then promotes the same artifact. Readiness is detailed only on loopback (`:4010` production, `:4011` staging); public `/api/health` is coarse. `deploy/echo status`, systemd, and the namespaced journal provide operator diagnostics. Code rollback switches to a retained exact-SHA artifact; database restore is separate. |

## Failure simulation matrix

| Area / failure | Result and evidence | Outcome |
| --- | --- | --- |
| Missing SQLite file and missing parent directories | Disposable backend startup created the configured directory/database and reached coarse health 200. This is intentional initialization for a new environment; it is not a recovery strategy for an unexpectedly missing production file. | Pass; distinguish first boot from data loss before starting production. |
| Malformed SQLite database | Disposable backend process exited nonzero with `file is not a database`; it did not claim readiness. The file was isolated and unchanged. | Pass; fail-fast. |
| Invalid SQLite synchronous value | `SQLITE_SYNCHRONOUS=FAST` exited nonzero with `SQLITE_SYNCHRONOUS must be FULL or NORMAL` before a database was created. | Pass; fail-fast. |
| Missing production secret/config | Production config preflight exited nonzero and named `ANALYTICS_HMAC_SECRET` as missing/invalid; no server listener started. | Pass; fail-fast. |
| Unwritable database directory | Under a non-root disposable user, a `0500` parent failed with `unable to open database file`; no database file appeared. | Pass; fails without creating data. |
| Missing generated page manifest | The initial probe found that this failure occurred after opening/initializing SQLite. Startup now parses the page manifest and legacy redirects before loading generated catalog state or opening SQLite. A regression test injects the missing manifest read and asserts nonzero startup with no DB file. | Fixed and focused regression passes. |
| Wrong runtime static path | Startup reported the missing page-manifest path. Covered by the preflight regression above. | Pass after fix; the database is no longer created/migrated first. |
| Concurrent SQLite writer / lock / injected error | A second connection received `SQLITE_BUSY` while an immediate write lock was held, then wrote successfully after unlock. An injected abort in the second half of a rating transaction left both rating and event counts at zero. An exception in a multi-statement transaction left zero rows. | Pass; transient contention is visible and transaction boundaries preserve atomicity. |
| Malformed persisted JSON | SQLite `integrity_check` remained `ok` while a stored `metadata_json` value caused the rating path to fail. `getPodcast` now throws a safe row-specific message (`Invalid stored metadata JSON for podcast <id>.`); the regression confirms the operation leaves no rating/event rows and does not log the corrupt payload. | Fixed diagnostic; focused regression passes. |
| Backup while writes occur | A temporary 144 MiB database had a separate writer commit 585,625 paired transactions. The online backup did not complete under that deliberately continuous high-rate load; after the disposable writer was stopped it completed. The resulting copy had mode `0600`, SQLite `integrity_check=ok`, 1,171,250 rows across 585,625 transaction IDs, and zero incomplete pairs. | Pass with load caveat: sustained extreme write pressure can delay online backup completion until the database quiesces. The nightly timer is scheduled during a low-traffic window; monitor it rather than assuming completion. |
| Corrupt newest backup and older valid fallback | In a separate small disposable backup directory, default newest-file selection rejected the corrupt SQLite file. Explicit `--file` validation accepted the older backup; a restored copy preserved its sentinel, passed integrity, and accepted a post-restore write. | Pass; fallback is explicit, not automatic. |
| Backend gateway/offline and service worker | A real browser cached the home page, then a local same-port server returned 502 for all paths. Cached home rendered and reached `homeReady`; an uncached route rendered the offline page; `/api/health` remained 502 and API responses were absent from Cache Storage. With the server stopped, the existing offline/cached navigation path also passed. | Pass; fixed 502/503/504 navigation behavior. APIs are not available offline. |
| Static serving from assigned hidden worktree | Express returned 404 for static assets when test `STATIC_ROOT` was inside the dot-prefixed task path. Test-only visible symlinks now make fixture roots traversable without renaming or copying the assigned worktree. The product release workflow already uses visible `release-*` temp paths. | Test harness fix; public-route regression passes. |
| Generated/stale artifact integrity | `npm run build:pages` regenerated `sw.js` from `tools/build-pages.js`. The full verify passed `check:generated`, release-artifact sanity, and build determinism. | Pass; generated output is current. |
| Release-pointer rollback and host process manager | The migration-failure test verifies schema work and marker rollback; code rollback mechanics and DB boundary are documented and inspected. The actual Linux release rollback drill requires `ss`, GNU `find -printf`, `setsid`, host filesystem layout, and a completed host backup; Caddy/systemd are also absent on this macOS host. No production-like pointer swap or systemd recovery is claimed here. | Blocked on host-only prerequisites; see limitations. |
| Restart mid-request, malformed/slow API, generated SW revision mismatch, incomplete release copy, Caddy/proxy, Restic/SFTP | These were not faithfully simulated on the available host. The 502 proxy path, schema/migration rollback, generated checks, and release workflow were tested/inspected, but do not substitute for Linux host and prior/new release upgrade drills. | Not run; not claimed. |

## Unsafe behavior found and fixes

1. A missing page manifest could fail startup after the database was already
   opened and migrations ran. Startup now validates the generated page manifest
   shape and legacy redirect JSON before generated-catalog loading and database
   initialization. `backend/test/public-routes.test.js` injects a missing
   manifest read and verifies the configured DB path remains absent.
2. A malformed persisted show metadata JSON value surfaced as a generic parser
   error. The community store now logs the affected podcast ID and column
   context without including the stored value; the operation remains atomic.
3. A successful browser navigation only used cached HTML when `fetch()` rejected.
   Caddy 502/503/504 are normal HTTP responses, so returning browsers received a
   gateway page even with a cached route. The generated service worker now uses
   cached page/offline fallback for these gateway responses while passing other
   HTTP statuses through and continuing to bypass API requests.

No deployment architecture, schema, product surface, provider integration, or
retention policy was changed.

## Backup, restore, rollback evidence

- Focused repository tests exercised online backup, integrity and foreign-key
  rejection, clean application restore, search/record preservation, and
  representative writes after restore. The larger concurrent-write drill
  confirmed transaction-pair consistency after load stopped; it also exposed
  that an indefinitely busy writer can delay backup completion.
- The corrupt-newest drill proves the checker fails closed on the selected
  newest candidate and accepts an older file only when its exact path is given.
  The runbook now requires an age/RPO decision and disposable restore before a
  live database restore.
- The existing migration rollback test confirms failed structural migration
  work and its marker roll back together. A release code rollback does not
  downgrade schema or erase later persistent rows.
- The Linux disposable release rollback script was not run because its required
  `ss` command and GNU `find -printf` behavior are unavailable here. Caddy,
  systemd, host ownership, Restic, encrypted off-site restore, and production
  data were not touched.

## Verification

| Command | Result |
| --- | --- |
| `npm --prefix backend ci --no-audit --no-fund` | Pass; browser/backend dependencies installed from lockfile (deprecation notices only). |
| `npm --prefix backend run test:setup:browser -- chromium` | Pass; Chromium test runtime installed. |
| Focused service-worker Playwright test (`node --test --test-concurrency=1 --test-name-pattern='service worker supports cached public pages offline and falls back for uncached routes' backend/test/browser.smoke.js`) | Pass; cached 502 fallback, offline fallback, and API cache exclusion. |
| `node --test --test-concurrency=1 backend/test/community.test.js backend/test/database-migration-recovery.test.js backend/test/database-durability.test.js backend/test/public-routes.test.js` | Pass; 36 tests, 0 failures after all code edits. |
| `node --test --test-concurrency=1 --test-name-pattern='service worker supports cached public pages offline and falls back for uncached routes' backend/test/browser.smoke.js` | Pass; 1 real-browser scenario, 0 failures. |
| `npm run build:pages` | Pass; generated `sw.js` matches the renderer source. |
| `git diff --check` | Pass after the report and runbook were added; rerun before commit. |
| `npm run verify` | Pass; exit 0. This ran `build:catalog`, `build:pages`, `check:structure`, `check:generated`, `check:release-artifact`, `test:tools`, `check:build-determinism`, and the backend `verify` chain including data/link validation, serial tests, and required Chromium smokes. Data validation printed existing referenced-cover soft-limit notices; the gate completed successfully. |

## Long absence and remaining risk

- systemd restarts failures after five seconds and bounds starts to five per
  minute; repeated crashes need journal/status triage.
- The namespaced journal is bounded at 256 MiB and 14 days. Preserve incident
  evidence before expiry.
- Local backup runs daily around 03:15 with up to 15 minutes jitter and does
  not prune local copies. Off-site Restic retention is applied only after its
  restore/repository checks. If the off-site timer is unavailable, local files
  can accumulate.
- `production-history.log` has no rotation rule represented in the checked-in
  workflow. Monitor its size.
- Caddy, systemd, host permissions, the actual production `DB_PATH`, Restic and
  SFTP/Tailscale credentials, off-host availability, live restore, and
  automatic timers still require a host-side drill. This report is not a
  deployment, host-restore, or production-readiness certificate.

## Files changed

- `backend/lib/store/community-store.js`
- `backend/server.js`
- `backend/test/community.test.js`
- `backend/test/public-routes.test.js`
- `backend/test/browser.smoke.js`
- `backend/test/helpers/browser-smoke.js`
- `backend/test/helpers/visible-static-root.js`
- `backend/test/community-routes.test.js`
- `backend/test/listener-library-product.smoke.js`
- `backend/test/maintainer.test.js`
- `backend/test/rate-limit.test.js`
- `tools/build-pages.js`
- generated `sw.js`
- `docs/OPERATIONS.md`
- `deploy/DISASTER_RECOVERY.md`
- this QA report
