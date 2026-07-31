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
4. Stage the newest completed `backend/data/backups/*.sqlite` file together
   with importer cover staging and the private runtime configuration required to
   reproduce the service. Exclude `*.sqlite-wal`, `*.sqlite-shm`,
   `node_modules`, and the live database.
5. Run the off-host copy after `echo-archives-backup.service` succeeds. A separate oneshot service and timer should report failure independently rather than hiding a local-backup failure.

The credential-neutral foundation remains checked in:

- `tools/check-database-backup.js` validates freshness, private permissions, SQLite integrity, foreign keys, required tables, and table counts.
- `deploy/echo-archives-offsite-backup.sh` is the canonical Pi upload workflow.
  It selects the newest completed local backup, verifies a byte-identical copy
  in the protected cache, stages the complete recovery inventory there, uploads
  only that stable inventory, applies retention, and checks the repository.
- `deploy/echo-archives-offsite-backup.service` and `.timer` are the single canonical Raspberry Pi automation pair. The service keeps the home tree read-only, waits for Tailscale and root SSH, and maintains a freshness marker without storing credentials or database content in the unit.
- `deploy/offsite-backup.env.example` documents the required variable names without containing credentials.
- `deploy/complete-pi-backup-setup.sh` performs the guarded restore drill, installs and manually verifies the unit pair, enables its timer, and rejects duplicate Pi backup automation.

The Pi credentials, repository password, SSH identity, and operational script
remain root-owned outside the checkout. The timer must not be enabled until
`deploy/complete-pi-backup-setup.sh --apply` completes its supervised restore
and service verification.

The encrypted inventory currently contains:

- the verified SQLite backup, never the live database or WAL files;
- `backend/data/import-staging/`, when present;
- every runtime-writable publication directory and generated catalog/status
  file, including authored show records, covers, review companions, and
  generated public data;
- the production `backend/.env`;
- the active shared Caddyfile;
- the active Echo systemd unit/timer files;
- the private local-monitor environment;
- the Better Stack heartbeat and Restic environment files (not the Restic
  password or SSH private key);
- the namespaced journal retention file, runtime-account discovery drop-in,
  Better Stack systemd drop-in, runtime migration readiness record, and Ollama
  unit when present.

Each job builds a manifest of every staged recovery path, restores the exact
new snapshot with Restic byte verification into root-only staging, and compares
the restored filesystem with that manifest before retention, repository
checking, local pruning, success-marker publication, or heartbeat success. The
atomic marker records the full verified snapshot ID, so a later failed-run
orphan cannot become recovery evidence.

The Restic repository password and SSH recovery identity cannot be recovered
from the repository they unlock. Their separately held recovery location,
custodian, and emergency access test remain a private owner-controlled record.

## Initial retention

- 7 daily snapshots
- 5 weekly snapshots
- 12 monthly snapshots
- At least 2 annual snapshots once the service has operated that long

Apply retention with the backup tool's snapshot-aware prune command. Never use a filename-age deletion loop against the live database or the only remote copy.
Group Restic retention by host and tag, not by source path; each completed local
backup has a timestamped filename and default path grouping would otherwise
create a new retention group every day.

Local completed SQLite backups use the owner-approved 30-day policy with a
minimum floor of seven copies. Cleanup runs only after the same job has uploaded
the complete recovery inventory and passed exact restore verification, remote
retention, and `restic check`. A failed or unreachable off-site repository
therefore retains all local recovery copies.

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

## Legacy backup note

The existing Deja Dup Microsoft configuration is not an acceptable substitute: it has no verified recent backup, its discovered chain is stale/empty, and it was invoked without encryption. Do not remove it until a replacement has passed the acceptance test.

The selected replacement is the encrypted Raspberry Pi Restic repository. Its
initialization and first snapshot are already complete; never reinitialize it.
The remaining activation gate is a successful guarded restore drill and
automatic-service verification.
