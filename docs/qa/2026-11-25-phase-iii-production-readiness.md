# Phase III — Production Readiness and Deployment Verification

**Assessment date:** 2026-11-25

**Implementation base:** `288fc007ef938a7668fb1f3909163d414b5f63ab`

**Verified implementation branch:** `codex/submission-queue-modernization-20261125`
**Production release observed:** `092faa604982ffd229fe0686157c4d275818e303`

## Executive verdict

**Not yet ready for production promotion; automation activation must remain separately gated.** The isolated implementation is substantially safer than the original queue and passed the complete backend suite, migration checks, repeat-start checks, and queue browser smoke. The fresh dry-run remains stable at 13 show submissions and recommends 11 resolutions across 10 archive shows, while retaining OPTOg and The Survivor Tapes.

Promotion remains blocked on three production-evidence gates and one repository integration prerequisite. Automation activation has an additional privacy-policy blocker:

1. The effective production retention and automation environment values could not be read. The environment file is root-owned mode `0600`, and the service process environment is not readable by this account.
2. A verified fresh database snapshot was restored into an isolated runtime, but the protected scheduled backup artifact and an off-site restore could not be inspected. The off-site timer is disabled.
3. The current 760-show production catalog was available through the production-served public catalog response, but the protected mutable catalog source could not be staged. The browser staging app used a 752-show release-tree copy.
4. The canonical integration worktree must preserve and explicitly review the dirty main-worktree changes that overlap four implementation files.
5. Linked importer source snapshots/cache are outside the submission personal-data redaction path. A sanitized scan found submitted contact strings in compressed importer source payloads. The privacy treatment for those records needs an owner decision before unattended automation is enabled.

No production database, configuration, queue item, archive record, service, or automation setting was changed. The fresh dry-run and migration inventory are evidence only. Reconciliation changes were not applied.

## Repository and release state

| Area | Observed state |
|---|---|
| Production pointer | `/srv/echo-archives/current` resolves to release `092faa604982ffd229fe0686157c4d275818e303` |
| Production service | `echo-archives.service` active; `/api/health` returned `{"ok":true,"status":"ok"}` |
| Canonical main | `4656c17f8af5c018b36124af4d4d497db5215eac` |
| Implementation branch before Phase III local commit | `f1b4d78c088d403ef24de834e3cdc14226f0b909`; contains Phase II commit `288fc007ef938a7668fb1f3909163d414b5f63ab` and the canonical-main merge |
| Main worktree | Final read-only census: 50 tracked files modified and 3 untracked files (53 paths). Initial audit census was 32 tracked and 2 untracked; the dirty work expanded during this audit. No files were reset or overwritten. |

The committed canonical-main changes after the Phase II base were documentation changes and merged without code conflicts. The main worktree also contains unrelated in-progress UI/community work. Four dirty paths overlap the modernization diff: `backend/package.json`, `backend/server.js`, `script.js`, and `sw.js`. Those changes remain untouched and must be reviewed/preserved before integration to canonical main. The Phase III branch does not include that uncommitted work.

The checked-in release-tree catalog contains 752 shows. The live production `/data/shows.json` response contains 760 published shows. The HTTP response captured from `127.0.0.1:3010` matched the public domain response byte-for-byte. The production raw catalog source is protected. Production runtime preservation tests cover eight production-only shows, but the raw 760-record runtime source was not available for a full staging rehearsal.

The release-shaped checks reported a valid 752-show artifact. `npm run build:pages` and `npm run check:generated` passed; generated HTML boundary checks preserved all 32 authored HTML files. No tracked generated output was left dirty by these checks.

## Fresh production reconciliation

The active-release backup utility created an online SQLite snapshot at 2026-11-25 19:20:51 CET. It is 128,245,760 bytes with SHA-256 `0ea973e531bbe0144c828ce20e2728aafd651ac17d11c6d29e625dc84fb249de`. The official backup checker reported `integrity: ok`, zero foreign-key violations, 153 importer candidates, 760 podcast rows, and two discovery sources.

The live production catalog capture was taken within one second of the database snapshot. It contains 760 records, all published, and has SHA-256 `9ffcbb004a03c851b2e5fd87a18c94a727e026b5a49999cb15df901f8f81025b`. The reconciliation dry-run was executed twice. After removing its generated timestamp, recommendations were identical. It opened the database read-only with `query_only=ON`; no writes were performed.

| Recommendation | Count | Result |
|---|---:|---|
| Resolve published candidate | 9 | Each candidate has exact submission provenance, is already published, and points to a show ID present as published in the captured live catalog. |
| Resolve already-listed | 1 | Rosanna’s Secret shares a YouTube playlist identity with `rosannas-secret`. |
| Consolidate duplicate | 1 | The long-title Dyme submission shares Apple, RSS, and Spotify identities with the published Dyme submission. Both source records remain. |
| Retain for review | 1 | OPTOg remains open; its exact linked candidate is `needs-review`, with no strong archive identity match. |
| Retain open | 1 | The Survivor Tapes remains outstanding; no archive identity or candidate match was found. |

The 11 resolution recommendations cover 10 unique archive targets. No title-only match is used to close a submission. Comparing by submission UUID, normalized action, and target show ID, the fresh recommendations match the 13-row Phase II manifest. OPTOg’s action label changed from `retain-for-manual-review` to `retain-for-review`; its state and evidence did not change. The Chronicles of Oz title is now displayed with “The”; its UUID, recommendation, and target are unchanged. The full sanitized row-level manifest, including submission and candidate IDs, target IDs, exact provenance flags, provider identity types, confidence, reason, and title-match hints, is in [the reconciliation manifest](2026-11-25-phase-iii-production-reconciliation.json).

The public catalog representation is sufficient to verify current target IDs and published status. It does not expose every internal source field from the protected mutable catalog. The raw catalog extraction command below is required before final staging verification.

## Exact migration inventory

The Phase II migration runs during `openDatabase()` even with `SUBMISSION_AUTOMATION_ENABLED=false`. The isolated migration was run against a clone of the fresh production snapshot. It does not publish a show or change moderation status, but it does make nine automatic `published` resolutions. Those nine data changes must be included in the pre-migration reconciliation approval.

| Migration effect | Before | After |
|---|---:|---:|
| Show submissions | 13 | 13; all original IDs and `status=new` values preserved |
| Candidate relationships | 0 | 10 restored: nine exact published submissions and OPTOg |
| Published submission resolutions | 0 lifecycle resolutions | 9; all targets exist and are published in the captured catalog |
| Open show submissions | 13 before lifecycle fields | 4: Rosanna’s Secret, OPTOg, the older Dyme submission, and The Survivor Tapes |
| Duplicate relationships | 0 | 0; the Dyme relationship is a later reviewed reconciliation action |
| Lifecycle events | 0 | 22: 13 received and 9 published-resolution events |
| Import candidates / jobs / runs | 153 / 164 / 46 | unchanged; all 164 existing jobs were already completed |
| Published show rows in `podcasts` | 760 | unchanged; complete table digest matched |
| Rating submissions / events | 34 / 2 | unchanged; both table digests matched |

The migration added 11 `show_submissions` columns, three tables, five indexes, and `protect_open_show_submissions_from_legacy_retention_delete`. It did not alter candidate, job, run, show, rating, or review records. The nine migration resolutions are backed by `primary_source_type='submission'`, `primary_source_key=<submission UUID>`, a published candidate, and a target present in the current archive. Full before/after rows, schema inventory, table digests, and integrity results are in [the migration inventory](2026-11-25-phase-iii-migration-inventory.json).

`PRAGMA quick_check` returned `ok` before and after migration; `foreign_key_check` returned zero violations. Reopening the migrated database with `openDatabase()` changed none of the eight checked tables: submissions, links, relations, lifecycle events, candidates, jobs, runs, and archive rows. No existing published show record was changed.

The production snapshot contains only `show` rows in `show_submissions`; no correction, review, or creator-verification submissions were present in that snapshot. The full backend suite exercises those submission types and passed. The migrated snapshot had zero `published_listener_reviews`; existing ratings and rating events were present and unchanged.

## Retention and privacy

The published privacy page describes a 180-day limit for submission content/contact and 30 days for network data. Current code defaults are 180 and 30 days, respectively, and the cleanup service runs independently of submission automation. **The effective production values are unknown** because the root-only environment file and `/proc/<service-pid>/environ` were not readable. Do not assume the defaults are production’s active values.

At the fresh snapshot, the 13 show submissions were at most 105 days old. Under 180/30-day defaults, zero rows were due or within 30 days of personal-content retention; two rows still had network data and neither had reached the 30-day threshold. These are default-based calculations, not verification of effective production retention.

The privacy risk extends beyond `show_submissions`:

- Ten importer candidates are linked by submission identity.
- Their 55 source snapshots were all uncompacted; 44 associated source-cache rows were present.
- No linked source-cache row was expired at capture, and the cache expiry field is not a deletion policy for source snapshots.
- A sanitized content scan found contact-string matches in 2 linked source snapshot/normalized rows and in 17 compressed source payload rows. No matched value is included here.
- Candidate objective/provenance fields did not contain those contact strings in the scan. Query-bearing source URLs were present in 10 snapshots and 9 cache rows; their contents were not reproduced.

Submission redaction does not currently scrub linked candidate objective/source URLs, raw source snapshots, or compressed source cache. This can leave personal or token-bearing data after the submission’s content retention deadline. The current implementation preserves an operational tombstone but clears the title and links at personal-content redaction, which means an old unresolved item can no longer be processed from the queue alone. Before unattended automation is authorized, decide whether importer source captures count as submission content, how their retention/deletion should work, and what non-personal operational identifier may remain after redaction. Do not extend retention or silently keep personal details to keep old work actionable.

The legacy-delete protection trigger prevents a prior release’s cleanup query from deleting an unresolved show row. It redacts the row and retains the tombstone, lifecycle history, and candidate link. The policy consequence and the linked-source gap still require a decision; the trigger is a rollback safety measure, not a complete privacy solution.

## Backup and isolated recovery evidence

The fresh snapshot was created by the active production release’s `backup-database.js`, validated by the official checker, copied into isolated test paths, and used to start the implementation server. The isolated app returned healthy and served the queue. A second fresh migration clone passed integrity and foreign-key checks.

This proves that a newly made SQLite snapshot is readable and usable in an isolated runtime. It does **not** prove that the scheduled backup artifact can be restored or that all recovery data is covered:

- `echo-archives-backup.timer` is active, but the protected backup directory/artifacts were not readable by this account, so artifact age/content and a restore from that exact artifact remain unverified.
- `echo-archives-offsite-backup.timer` is inactive and disabled. Off-site availability and restoration are unverified.
- The local database backup covers the community SQLite file. Coverage of the mutable 760-show runtime catalog, importer staging/leases/journals, and other runtime state was not confirmed from an actual backup artifact.
- Disk had approximately 77 GB free of 468 GB (83% used), enough for the measured 128 MB database snapshot and release work. Check again at deployment; do not infer off-host capacity from local free space.

The deployment gate must include an authorized artifact listing, integrity check, and isolated restore using the established recovery procedure. Never restore over production as part of this release.

## Rollback safety

The previous production application release started successfully against a migrated isolated database and served health and maintainer queue routes. Its SQL does not fail on additive lifecycle columns. The legacy retention delete query was tested against an isolated migrated database after unresolved rows were aged past the retention cutoff: it deleted zero open show rows, redacted those rows, preserved their candidate link, and left SQLite integrity/FKs clean.

Application rollback and database restoration are separate operations. `./deploy/echo rollback [<release-sha>]` switches release/runtime pointers and leaves SQLite untouched. Do not restore an old database over newer production writes.

One material rollback limitation remains: release `092...` ignores `resolution_status` and displays all 13 rows as `new`, including the nine rows marked published by the migration. During a code rollback, freeze submission moderation actions until the lifecycle-aware release is restored. If there is in-flight submission preparation, disable new submission automation and pause importer work using the reviewed production configuration procedure; leave queued jobs durable. Existing importer job rows were all completed in the snapshot. The legacy cleanup trigger prevents unresolved operational rows from disappearing, but the old interface cannot present their lifecycle state correctly.

## Automation, security, and operational reliability

Phase III review found and fixed these concrete issues in the isolated branch:

- Published resolution now requires the exact submission candidate provenance and a target present in the live catalog projection. Conflicting provider identities, mismatched candidate targets, and absent target IDs are escalated instead of being resolved.
- Reconciliation candidate joins are limited to exact submission provenance. A title resemblance cannot close a row.
- Duplicate provider-identity resolution remains deterministic; the already-published Dyme submission is canonical and both original rows are preserved.
- Missing lifecycle notification outbox entries are replayed from durable lifecycle events. Enqueue failure no longer permanently loses the notice; replay is idempotent. Automation-disabled startup still performs notification/staleness reconciliation, but does not prepare or resolve submissions.
- Idempotent repeated intake keys return the original submission without consuming another rate-limit slot or generating duplicate lifecycle/analytics events.
- The migration’s legacy retention trigger protects unresolved show rows on old-code rollback.

New publication remains behind the maintainer `approve-and-publish` endpoint and requires a ready candidate/readiness eligibility check. The in-queue detail view renders the approval control when the linked candidate is ready; the publication service tests verify publication and automatic submission resolution. In the browser staging run, the prepared candidate was intentionally left queued, so a click-through of a ready candidate’s approval button was not exercised.

The enabled synthetic staging run used concurrency 1 and `IMPORT_AUTO_WORKER=false`. A public-form submission produced one durable linked candidate and one queued prepare job, no published candidate, and remained unchanged after service restart. This exercises the handoff and restart boundary without fetching an external provider or processing unrelated candidates. Existing production snapshot state had 153 candidates and 164 completed jobs; migration hashes prove none were requeued or modified.

Existing fetch-safety tests cover private-address rejection and redirect/request bounds. The full backend suite includes retries, stale leases, concurrent claims, repeated requests, and failure recovery. Discord was not sent to a real destination: no isolated test destination was configured. Notification outbox enqueue failure/replay behavior passed deterministic tests. Production notification destination/config remains part of the protected environment readback.

## Staging and browser verification

The temporary isolated server used a copied production database with automation disabled, importer workers disabled, a separate importer staging directory, and local-only maintainer credentials. No real Discord webhook was configured.

- The public submission form accepted a synthetic valid show submission with HTTP 201.
- Three requests using the same idempotency key returned HTTP 201 and the same submission ID; there was one row for that key.
- The maintainer queue showed The Survivor Tapes and OPTOg as open/actionable, with queue-health status visible.
- Playwright checks at 390 px and 1440 px found no horizontal overflow. The dedicated `submission-queue.smoke.js` passed.
- In a separate empty isolated database with automation enabled, concurrency 1, and importer workers disabled, a synthetic public form submission created one source-linked candidate and one durable queued job. There were zero publications. Restart preserved the same submission, candidate, and job counts.
- The browser staging catalog contained 752 shows, not the 760-show live runtime catalog. Current raw-runtime parity and the ready-candidate approval click-through remain unverified.

The interface puts the ready candidate’s approval button in the submission detail view, which is the intended one-action path. Browser evidence confirms the queue’s layout and actionable rows; it does not yet prove the end-to-end button-to-publication path with a ready prepared record.

## Verification results

| Check | Result |
|---|---|
| `backend npm run test:serial` | 619 passed, 0 failed, 1 skipped; skip is the optional Nov. 1 rehearsal fixture, absent from this checkout |
| `backend/test/submission-queue.smoke.js` | 1 passed in Chromium |
| `tools/test:tools` | 210 passed on isolated rerun. The first concurrent run had a transient temporary-port health failure and lacked the worktree-local `backend/node_modules` path; after a temporary dependency symlink was used for the rerun and removed, the suite passed. |
| `backend npm run check:config` | Passed for development configuration |
| `npm run check:generated` | Passed; authored/generated boundary valid |
| `npm run check:structure` | Exit 0; existing soft-limit warnings for oversized source files and cover assets remain |
| `npm run check:release-artifact` | Passed; 752 shows, 54 collections, no artifact warnings |
| `npm run validate:data` | Passed with zero content-integrity errors; existing entity-role warnings remain |
| `git diff --check` | Passed |
| Fresh production reconciliation, two runs | Same 13 rows and recommendations after ignoring generated time; no writes |
| Isolated migration and repeat startup | `quick_check=ok`, 0 FK violations; no changes on second startup |
| Production health/release inspection | Active release `092...`; `/api/health` OK |

## Finding classification

### Blocking

1. **Effective environment is unverified.** Have an authorized operator run the narrow whitelist command in the rollout section. Preserve current values; do not print the full environment or secrets.
2. **Actual scheduled/off-site backup restore is unverified.** Verify a protected artifact and restore it to an isolated location. Off-site timer is currently disabled.
3. **Full runtime catalog staging is incomplete.** Provide the service-account-readable 760-show catalog source or an approved protected export, then rerun staging against it.
4. **Canonical integration must preserve dirty main work.** Review the four overlapping modified paths before producing the integrated release commit.

### Blocking for automation activation

1. **Personal-data retention for linked importer sources needs a decision and follow-up.** Do not activate automation until source snapshot/cache retention matches an approved policy and post-redaction unresolved work has an approved handling path.

### Non-blocking

1. Old-code rollback displays resolved submissions as `new`; freeze queue moderation during that rollback and roll forward promptly.
2. A browser click-through of a ready candidate’s single approval action was not performed. Service-level publication tests pass; complete this in staging after catalog parity is available.
3. No real Discord test delivery was performed. Use an isolated destination before automation activation.

### Informational

1. Live catalog has 760 shows while the release-tree artifact has 752; production runtime preservation tests cover eight runtime-only shows.
2. Existing 164 importer jobs were all completed at snapshot time. The migration left all 153 candidates, 164 jobs, and 46 runs unchanged.
3. The current show-submission queue contained 13 rows; all moderation statuses were `new` before migration. The lifecycle migration does not rewrite moderation status.

## Narrow operator evidence requests

The production environment file is `/srv/echo-archives/shared/env/production.env` (`root:root`, mode `0600`). The service runs as `echo-archives`. An authorized operator can reveal only the required non-secret effective values with:

```bash
sudo sh -c '
  pid=$(systemctl show echo-archives.service -p MainPID --value)
  tr "\0" "\n" < "/proc/$pid/environ" |
    grep -E "^(SUBMISSION_PERSONAL_DATA_RETENTION_DAYS|SUBMISSION_NETWORK_DATA_RETENTION_DAYS|SUBMISSION_AUTOMATION_ENABLED|SUBMISSION_PROCESSING_CONCURRENCY|SUBMISSION_RECONCILIATION_INTERVAL_MS|SUBMISSION_STALE_NOTIFICATION_DAYS|DATA_RETENTION_CLEANUP_INTERVAL_MS|IMPORT_AUTO_WORKER|IMPORT_AUTO_DISCOVERY|IMPORT_WORKER_CONCURRENCY|IMPORT_HOST_CONCURRENCY|DB_PATH|STATIC_ROOT|IMPORT_STAGING_ROOT)="
'
```

Do not include webhook URLs, API credentials, cookie secrets, or the complete environment in the output.

For current raw catalog staging, run as the authorized operator and provide the file through the approved staging-data channel:

```bash
sudo -u echo-archives -- cat /srv/echo-archives/runtime/production/092faa604982ffd229fe0686157c4d275818e303/data/shows.json \
  > /tmp/echo-production-runtime-shows.json
jq -e 'length == 760 and all(.[]; .status == "published")' /tmp/echo-production-runtime-shows.json
sha256sum /tmp/echo-production-runtime-shows.json
```

The output is a public catalog source export; keep it in a mode-0700 temporary directory and do not include non-public operational data. If the release runtime path changes before rollout, resolve it from the active production runtime pointer first.

For the protected local backup artifact, an authorized operator should list exact filenames and validate one artifact before staging a restore:

```bash
sudo find /var/backups/echo-archives -maxdepth 1 -type f -name '*.sqlite' -printf '%TY-%Tm-%TdT%TH:%TM:%TS %s %p\n' | sort -r | head -5
sudo /usr/bin/node /srv/echo-archives/current/tools/check-database-backup.js \
  --directory /var/backups/echo-archives --max-age-hours 36
```

Then follow `deploy/DISASTER_RECOVERY.md` to restore the exact selected artifact only into a disposable path, run SQLite integrity/FK checks, and start a copied app against that isolated restore. A green backup service status is not a substitute for this artifact restore.

## Production rollout plan (not executed)

Production remains read-only until a separate rollout authorization. The implementation branch has not been pushed or deployed.

### 1. Integrate without overwriting existing work

First inspect and preserve the dirty main worktree. Resolve the overlaps in `backend/package.json`, `backend/server.js`, `script.js`, and `sw.js` in a clean integration worktree. Then integrate the locally committed Phase III branch into a clean checkout of current canonical main:

```bash
git fetch origin
git worktree add -b codex/echo-phase3-release /tmp/echo-phase3-release origin/main
git -C /tmp/echo-phase3-release status --porcelain
git -C /tmp/echo-phase3-release merge --no-ff codex/submission-queue-modernization-20261125
cd /tmp/echo-phase3-release
npm run verify
```

Prerequisite: the clean-worktree status is empty before merge and the dirty main changes have been separately preserved/reviewed. Expected: no lost WIP, no unresolved merge conflicts, full verify passes. Stop if any overlapping file has an unreviewed content conflict or generated catalog output unexpectedly changes.

Push/integration into canonical remote and production use require separate authorization; neither is part of this Phase III task.

### 2. Prepare the exact release and staging data

After integration authorization, stage the exact integrated SHA with the existing workflow:

```bash
./deploy/echo staging <integrated-40-character-sha>
curl --fail --silent --show-error http://127.0.0.1:3011/api/health | jq .
./deploy/echo smoke http://127.0.0.1:3011
```

Before accepting staging, confirm the runtime catalog count is 760 and its source digest matches the authorized catalog export. Verify public form, maintainer authentication, open/actionable lanes, approval button with a ready candidate, and a single test publication in disposable staging. Use an isolated Discord destination. Stop if the runtime catalog is still 752, any source identity conflicts, any unrelated importer job is claimed, a notification escapes the test destination, or a publication occurs without an explicit click.

### 3. Capture the deployment baseline and exact reconciliation

Immediately before production promotion, take and verify a new database backup. Promotion also performs the deployment workflow’s verified backup; keep both artifact paths/digests in the rollout record.

```bash
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup="/var/backups/echo-archives/phase3-predeploy-${stamp}.sqlite"
sudo -u echo-archives /usr/bin/node /srv/echo-archives/current/tools/backup-database.js \
  --source /var/lib/echo-archives/community.sqlite --destination "$backup"
sudo -u echo-archives /usr/bin/node /srv/echo-archives/current/tools/check-database-backup.js \
  --file "$backup" --max-age-hours 1
sha256sum "$backup"
```

Copy the current runtime catalog using the authorized procedure above. Run the read-only reconciliation against the verified snapshot and the captured catalog twice:

```bash
node backend/scripts/submission-reconciliation-dry-run.js \
  --db "$backup" --catalog /tmp/echo-production-runtime-shows.json \
  > /tmp/phase3-reconciliation-1.json
node backend/scripts/submission-reconciliation-dry-run.js \
  --db "$backup" --catalog /tmp/echo-production-runtime-shows.json \
  > /tmp/phase3-reconciliation-2.json
```

Expected at current evidence: 13 rows with `9 resolve-published`, `1 resolve-already-listed`, `1 consolidate-duplicate`, `1 retain-for-review`, and `1 retain-open`. Require normalized outputs to match and inspect every new or changed row. Approve the exact nine migration resolutions plus the two remaining reconciliation actions before migration. Stop if IDs, targets, candidate provenance, or action counts differ. If any submission arrives after the snapshot, take a new snapshot and rerun; never apply a stale manifest.

### 4. Deploy with submission automation disabled

Using the authorized protected-environment procedure, explicitly set `SUBMISSION_AUTOMATION_ENABLED=false` before promotion while preserving the approved effective retention values. Do not infer values from source defaults. Confirm no unexpected queued importer jobs have appeared; if any non-submission jobs are queued, stop and review before restart.

```bash
./deploy/echo promote
curl --fail --silent --show-error http://127.0.0.1:3010/api/health | jq .
```

Expected: the exact staged SHA is promoted, production health is green, and automation remains disabled. The release startup will run the additive migration and automatically resolve the nine exact published submissions even with the flag false. Stop on migration error, a resolution outside the approved nine, a missing target, integrity/FK error, unexpected job/candidate digest change, or production health failure. The deployment script restores release pointers on its own health failure; do not restore the database.

### 5. Verify migration, then apply the two reviewed reconciliation changes

Use a read-only SQLite connection to run `PRAGMA quick_check` and `PRAGMA foreign_key_check`. Confirm 13 original submission IDs remain, exactly nine migration resolutions match the approved inventory, 10 candidate links were restored, and candidates/jobs/runs/archive rows retain their approved baseline digests. Confirm the two Dyme rows remain present. Then use the authenticated submission queue to resolve Rosanna’s Secret as already listed and relate the older Dyme submission as a duplicate of the published Dyme submission. Do not alter the archive show records.

Expected afterward: 11 resolved submission rows covering 10 published shows; OPTOg remains open for investigation; The Survivor Tapes remains open. Stop if any other row changes or if the UI presents a fuzzy title match as sufficient evidence.

### 6. Verify production health and queue workspace

```bash
./deploy/echo status
curl --fail --silent --show-error http://127.0.0.1:3010/api/health | jq .
```

Open `/maintainer/submissions.html` in an authenticated browser. Check actionable, processing, investigation, and resolved lanes; the queue health summary; no missing links; and that OPTOg and The Survivor Tapes remain actionable. Keep intake open only if the migration and read checks pass. Submission automation remains off.

### 7. Activate automation only after separate approval

Automation activation is not included in the production rollout approval described here. After privacy-source retention is approved and implemented, backups are proven, and staging parity passes, obtain separate authorization. Set `SUBMISSION_AUTOMATION_ENABLED=true` and `SUBMISSION_PROCESSING_CONCURRENCY=1`; retain the reviewed importer worker behavior. Verify the 153 pre-existing candidates/164 completed jobs did not change, then submit one controlled show and confirm one linked job, bounded retries, no publication without a maintainer click, no PII in Discord, and no growing outbox backlog.

Monitor every 5 minutes for the first hour and then daily for seven days: health, oldest queue age, retry/failure counts, queue/candidate link consistency, notification outbox backlog, SQLite busy/errors, and unrelated importer candidate/job digests. Roll back the application if health fails after the deployment readiness window, any unauthorized publication occurs, unrelated candidates/jobs change, queue integrity fails, or sustained preparation failures/outbox backlog appear. Notification failure alone must not reject submissions; pause activation if delivery remains unhealthy.

### Application rollback versus database restoration

For an application-only rollback, first set submission automation false, let any active lifecycle call finish or stop cleanly, and pause importer workers if jobs are in flight. Preserve queued jobs and the migrated database. Then use:

```bash
./deploy/echo status
./deploy/echo rollback <previous-known-good-40-character-release-sha>
curl --fail --silent --show-error http://127.0.0.1:3010/api/health | jq .
```

While release `092...` is active, freeze submission review actions: its queue will show lifecycle-resolved rows as `new`. The retention trigger prevents unresolved show rows from being deleted but will redact their submission content. Roll forward to the lifecycle-aware release before resuming queue work.

Database restoration is a separate incident procedure. Preserve current database and WAL/SHM as evidence, quantify writes since the selected backup, obtain explicit approval, restore only to the exact environment path in a maintenance window, and verify integrity/FKs before restart. Never restore the pre-migration snapshot over newer production submissions or importer writes without an explicit data-loss decision.
