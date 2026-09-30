# Echo Archives Disaster Recovery Runbook

This runbook follows the checked-in release-backed Linux deployment. It does
not describe the legacy checkout, a public staging site, or any infrastructure
outside the repository. Host-only steps below are documented from the checked-in
units and scripts; they were not run on this macOS development host.

## Runtime map

| Component | Production location / boundary | Recovery signal |
| --- | --- | --- |
| Public HTML, CSS, JS, service worker, generated catalogue and search projection | Immutable release at `/srv/echo-archives/releases/<sha>` plus active mutable publication overlay at `/srv/echo-archives/runtime/production/<sha>`; generated from `catalog-src/`, `site-src/`, and the page manifest | `./deploy/echo status`; detailed loopback health; `deploy/catalog-sanity.js` |
| Backend | systemd `echo-archives.service`, Node bound to `127.0.0.1:3010` | `/api/health`, detailed health on loopback `127.0.0.1:4010`, `systemctl`, namespaced journal |
| Production database | `/var/lib/echo-archives/community.sqlite` | SQLite integrity / foreign-key checks and detailed backend health |
| Staging | systemd service on `127.0.0.1:3011`, detailed health on `127.0.0.1:4011`, separate DB `/var/lib/echo-archives-staging/community.sqlite` | `./deploy/echo status`; staging health and smoke checks |
| Proxy | Checked-in Caddy config terminates HTTPS and reverse-proxies to `127.0.0.1:3010`; it is separate host infrastructure | `caddy validate`, public health and response checks |
| Secrets and configuration | `/srv/echo-archives/shared/env/production.env`, root-owned mode `0600`; not in Git | `NODE_ENV=production npm run check:config` as the service account; never print the file |
| Local/off-site backups | `/var/backups/echo-archives/*.sqlite`; encrypted Restic/SFTP workflow is host-only | `check-database-backup.js`; timer/journal; successful off-site restore marker |
| Browser-local personalization | IndexedDB in the browser; not server state and not in service-worker Cache Storage | Browser-local only; a server restore cannot reconstruct it |

The Caddy proxy has no static-file fallback. When the backend is down, new
requests receive a gateway failure. A browser that already has the service
worker and a cached public page can render that page after a network error or a
502/503/504 response; an uncached navigation receives the precached offline
page. API requests are never answered from page cache and remain unavailable.

## First response

Run these read-only checks before changing a pointer, service, database, or
host configuration:

```bash
cd "${ECHO_SOURCE_ROOT:-/srv/echo-archives/source}"
./deploy/echo status
curl --fail --show-error --silent http://127.0.0.1:3010/api/health
curl --fail --show-error --silent http://127.0.0.1:4010/api/health
sudo systemctl --no-pager --full status echo-archives.service
sudo journalctl --namespace=echo-archives --unit echo-archives.service --since '15 minutes ago' --no-pager
```

The public health route is deliberately coarse. The separate loopback health
route is the release gate for the environment, current release, catalogue,
database durability, and enabled features. `./deploy/echo status` also reports
release/runtime pointers, service state, PID/exit result, database path, and
recent production history. Match public 5xx request IDs with the journal; do
not put request bodies, cookies, contact information, or secrets in incident
notes.

## Scenario procedures

| Symptom | Diagnosis | Safe action | Recovery verification | Rollback / actions to avoid |
| --- | --- | --- | --- | --- |
| Public 502/503/504 or API timeouts | Compare coarse public health, detailed `:4010` health, `deploy/echo status`, systemd state, and the last 15 minutes of the Echo journal. If detailed health is absent, the backend has not reached readiness. | Let the bounded systemd/release restart finish; correct only the specific configuration, database permission, or release problem shown in preflight/journal. Run `NODE_ENV=production npm run check:config` as the service account with secrets redacted. | Require detailed loopback health for the expected production release, then `/api/health` on `:3010` and the public origin. Check `./deploy/echo status` again. | Do not reload Caddy as a substitute for a failed backend. The service worker can help only returning visitors with previously cached pages; it cannot restore APIs or help a fresh browser. |
| Service fails during startup | Inspect `systemctl status` and the namespaced journal. Run the configuration preflight. Check that `DB_PATH`, `STATIC_ROOT`, and required production values resolve to their documented paths; do not print environment values. | Fix the identified path/value/ownership issue. The generated page manifest and legacy redirects are now read before generated-catalog loading and database initialization, so a missing/malformed copy fails without creating or migrating the production database. | Preflight succeeds, systemd is active, both local health routes return expected JSON, and release/status point to the intended SHA. | Do not delete a database created by an unrelated earlier failure or replace the production environment file from a local `.env`. Do not repeatedly restart through the systemd start limit. |
| Database is malformed, unwritable, locked, or writes fail | Check detailed health, exact configured DB path, service account access to the DB directory and sidecars, and journal diagnostics. The local lab confirmed malformed SQLite exits nonzero with `file is not a database`; an unwritable directory fails to open without creating a DB file. | Preserve the database and `-wal`/`-shm` files. Diagnose ownership, free space, and lock holders before recovery. For a failed application operation, use the exact store/transaction diagnostic and retain the request ID. | After a correction, run integrity and foreign-key checks on a copy first; require detailed health and a representative read/write in staging or an isolated restored copy. | Do not remove WAL/SHM files while the service is live, hand-edit SQLite files, or restore a backup over production without a maintenance window and explicit approval. |
| Latest local backup fails validation | `check-database-backup.js --directory` selects the newest `.sqlite` by modification time and validates that one file. It does not silently fall back. | Preserve the failed file as evidence. List the candidates and validate a selected older file explicitly, with an age window that reflects the accepted recovery point: `sudo -u echo-archives /usr/bin/node /srv/echo-archives/current/tools/check-database-backup.js --file /var/backups/echo-archives/<exact-file>.sqlite --max-age-hours 720`. Check its reported integrity, foreign keys, required tables, age, and mode; record how much data may be lost versus the failed newest copy. | Perform a disposable restore from that exact validated file and inspect expected records before authorizing any production restore. | Never rename/delete the corrupt copy to make a different file look newest, lower the age bound without recording the older recovery point, or restore an unchecked candidate. |
| New deployment, staging, or release artifact fails | `deploy/echo deploy` builds an isolated temporary release and gates configuration, generated output, data, and tests before staging. A staging failure leaves production untouched. Inspect `./deploy/echo status`, deployment command output, and service journal. | Repair the source/build issue and run the documented staged release path again. Keep failed temporary/release artifacts for diagnosis until their contents and cleanup safety are understood. | The exact artifact passes staging detailed health and smoke before promotion; after promotion detailed health reports that SHA. | Do not copy an incomplete build into the active release or hand-edit generated HTML, catalogue, search, page manifest, or `sw.js`. Generate from authored sources with `npm run build:catalog` then `npm run build:pages`. |
| Production is unhealthy after promotion | Check `./deploy/echo status`, the production service/journal, and detailed health. The promotion path already attempts to restore and independently health-check the previous release on a failed readiness gate. | If still unhealthy and a known retained artifact is compatible with the current forward-only database schema, run `./deploy/echo rollback <40-character-release-sha>` as the deployment user. | Require status to identify the retained SHA, production service active, detailed health ready, and public `/api/health` passing. | Code rollback does not downgrade SQLite schema, delete new rows, restore a database, or change Caddy. Do not assume it reverses a migration. |
| Database data must be restored | Treat this separately from code rollback. Confirm the affected environment and exact `DB_PATH`; validate the backup and restore to a disposable path before touching live state. | After explicit approval and a maintenance window: stop only the affected service; move the current DB and WAL/SHM sidecars to a timestamped evidence location; install the verified copy at the exact path with reviewed `echo-archives:echo-archives` ownership and mode; run integrity/schema checks; start service. | Require detailed health, coarse health, expected catalogue/queue/community state, and representative reads/writes. Keep the pre-restore state until reviewed. | Do not restore staging data to production, use a backup with unaccepted age, delete the pre-restore database, or infer that browser IndexedDB can be restored from the server. |
| Caddy/host or encrypted off-site recovery fails | Caddy syntax, public TLS/proxy behavior, systemd/journald, Restic/SFTP/Tailscale, host permissions and the physical host are not available on this macOS drill host. | On the actual host, use its existing runbooks: `deploy/RELEASE_WORKFLOW.md`, `deploy/OFF_HOST_BACKUP_PLAN.md`, and `docs/OPERATIONS.md`. Keep host repairs separate from application release changes. | Validate Caddy before reload, then verify public TLS/headers/health. For off-site recovery require the checked-in restore drill and the successful restore marker; repository integrity alone is not enough. | Do not claim local tests prove Caddy, systemd, Restic, off-host availability, host rebuild, DNS/TLS, or production restore. |

## Backup validation and restore commands

The backup command uses SQLite's online backup API, validates source and copy
integrity/foreign keys, writes mode `0600`, refuses overwrite, and removes a
failed partial output. The checker validates the selected file read-only and
requires the current core tables. A verified local copy is not proof of an
off-host backup.

On a disposable copy or approved host maintenance window:

```bash
/usr/bin/node /srv/echo-archives/current/tools/check-database-backup.js \
  --file /var/backups/echo-archives/<exact-file>.sqlite --max-age-hours 720
sqlite3 /var/backups/echo-archives/<exact-file>.sqlite 'PRAGMA integrity_check; PRAGMA foreign_key_check;'
```

The only integrity result should be `ok`; foreign-key check should return no
rows. To restore, stop the affected service, preserve the current DB and its
sidecars, copy the verified backup to a disposable restore path, set restrictive
permissions, and open it with the application database initializer. Check the
schema, important records, and a representative write before any approved live
restore. On the production host follow the restore ownership/mode steps in
`docs/OPERATIONS.md`; do not improvise an in-place file replacement.

## Long-absence checks

- systemd restarts failed processes after five seconds and has a start limit of
  five starts per minute; inspect its state instead of creating a restart loop.
- The namespaced journal is bounded to 256 MiB, keeps at least 1 GiB free, and
  expires entries after 14 days. Preserve relevant logs before that window.
- The local backup timer runs daily around 03:15 with up to 15 minutes of
  jitter. It does not prune local backups. Local retention is applied only
  after verified off-site backup, so a disabled/broken off-site job can let
  local backups accumulate.
- The deployment lock is an advisory `flock`; the lock file may remain after a
  process exits, but the kernel lock is released with the process/file
  descriptor. Do not delete a lock file solely because it exists.
- Temporary release output is isolated until validation/finalization. Failed
  temporary release paths are cleaned by later workflow cleanup; confirm the
  exact path and age before any manual removal.
- `production-history.log` is append-only in the checked-in workflow; no
  rotation rule is represented here. Monitor its size on the host.

## Evidence limits

The 2026-09-30 disposable drill exercised application startup, backup and
restore tooling, database recovery tests, and browser behavior against a local
gateway failure. It did not use production data or mutate provider/host state.
Linux-only release rollback, Caddy, systemd, Restic/SFTP, actual host restore,
and the automatic timers still require host-side drills; see the dated QA report
in `docs/qa/2026-09-30-disaster-recovery.md`.
