# Encrypted Off-Host Backup Plan

## Objective

Keep the verified local SQLite backup workflow as the first recovery layer, then copy completed backup files to encrypted storage outside this host. Never copy the live `community.sqlite`, `-wal`, or `-shm` files directly.

## Recommended shape

1. Choose one account-backed destination:
   - restic repository in Backblaze B2, Amazon S3, or another S3-compatible service;
   - restic over SFTP to a separately administered host;
   - an equivalent encrypted backup product with documented restore commands.
2. Create dedicated least-privilege credentials that can access only the Echo Archives backup repository.
3. Store the repository password and provider credentials in a root-owned mode-`0600` environment file outside the repository.
4. Back up only completed `backend/data/backups/*.sqlite` files. Exclude `*.sqlite-wal`, `*.sqlite-shm`, import staging, `node_modules`, and the live database.
5. Run the off-host copy after `echo-archives-backup.service` succeeds. A separate oneshot service and timer should report failure independently rather than hiding a local-backup failure.

Credential-neutral preparation is checked in:

- `tools/check-database-backup.js` validates freshness, private permissions, SQLite integrity, foreign keys, required tables, and table counts.
- `deploy/echo-archives-offsite-backup.sh` verifies the newest local backup before sending only that completed file to restic.
- `deploy/echo-archives-offsite-backup.service` and `.timer` run after a successful local backup and maintain a read-only freshness marker without credentials or database content.
- `deploy/offsite-backup.env.example` documents the required variable names without containing credentials.

The off-site unit has a `ConditionPathExists` guard and cannot run until `/etc/echo-archives/offsite-backup.env` is deliberately created. `deploy/final-production-launch-maintenance.sh` installs restic and the reviewed unit files, but deliberately leaves the timer disabled until credentials exist and the first backup and restore drill are supervised.

## Initial retention

- 7 daily snapshots
- 5 weekly snapshots
- 12 monthly snapshots
- At least 2 annual snapshots once the service has operated that long

Apply retention with the backup tool's snapshot-aware prune command. Never use a filename-age deletion loop against the live database or the only remote copy.

## Acceptance test

1. Run `npm run backup:database` and identify the new verified `.sqlite` file.
2. Send it through the encrypted off-host job.
3. List the remote snapshot and verify the expected file and size.
4. Restore into a new temporary directory on a different filesystem or host.
5. Open the restored copy read-write with the production SQLite library.
6. Require:
   - `PRAGMA integrity_check` returns `ok`;
   - `PRAGMA foreign_key_check` returns no rows;
   - expected counts exist for `podcasts`, `community_profiles`, `catalog_import_candidates`, and `catalog_discovery_sources`.
7. Record the snapshot ID, restore duration, counts, and date without recording credentials or private submission content.

## Ongoing checks

- Alert if the newest successful remote snapshot is older than 30 hours.
- Perform an automated integrity check of a downloaded remote backup monthly.
- Perform a documented human restore drill quarterly.
- Review storage growth and retention quarterly.
- Rotate credentials at least annually and immediately after any suspected exposure.

## Current blocker

The existing Deja Dup Microsoft configuration is not an acceptable substitute: it has no verified recent backup, its discovered chain is stale/empty, and it was invoked without encryption. Do not remove it until a replacement has passed the acceptance test.

No remote repository or credentials have been selected. After the final host-maintenance script installs restic and the unit files, credential creation, repository initialization, timer enablement, and the first restore drill remain manual launch requirements.
