# Echo submission modernization — Phase III.1 closeout

**Assessment date:** 2026-11-25
**Integrated candidate:** `codex/echo-submission-phase3-final-20261125` (local only)
**Production release observed:** `092faa604982ffd229fe0686157c4d275818e303`

## Verdict

**Not yet ready for production promotion under the requested evidence gate.** The integrated release candidate, privacy changes, isolated migration, staging publication, browser workflow, and application rollback compatibility passed their available checks. Production remains unchanged. Remaining gates are a fresh application-consistent snapshot and reconciliation, effective production setting readback, validation and restore of the actual scheduled backup artifact, approval/application of the exact six-row privacy redaction, and an approved non-public Discord destination check. The tested compatibility rollback artifact also needs to be staged before the forward-only migration.

This is a production evidence and authorization hold, not a known failing regression in the candidate.

## Findings by deployment risk

| Classification | Finding | Required action |
| --- | --- | --- |
| **Blocking** | The production DB copy is from 19:52 UTC and the live catalog capture is from 21:05 UTC. Submissions after the DB capture are not observable. | Capture a fresh online SQLite snapshot and runtime catalog immediately before rollout; rerun and approve the exact sanitized manifest. |
| **Blocking** | Effective production retention and automation settings could not be read. The protected service environment and backup directory deny this account. | Run the allowlisted environment readback and artifact checks below. Do not infer active settings from code defaults. |
| **Blocking** | The scheduled backup artifact and a full restore from it were not inspectable. Daily backup timer is active/enabled; off-site timer is inactive/disabled. | Validate the actual artifact, restore it into an isolated directory, and verify database, catalog, and importer recovery state before promotion. |
| **Blocking before processing activation** | Six existing derived rows contain private submission notes or verification notes. The isolated redaction applied cleanly, but production writes remain unauthorized. | Review and separately authorize the exact manifest-guarded production redaction. |
| **Blocking before notification activation** | The staging outbox delivered to an isolated mock transport, but there is no approved non-public Discord test destination available. No public message was sent. | Configure an approved test destination through the protected operator environment and verify delivery before enabling real notifications. |
| **Blocking for rollback readiness** | The raw previous release fails against the current 760-show runtime catalog. A minimal compatibility backport passed in isolation but is only a local commit. | Stage and retain the tested compatibility release before promoting schema-changing code. |
| **Non-blocking** | Off-site backup timer is disabled. | Confirm local-only recovery is acceptable for this release; enabling off-site backup remains a separately reviewed host operation. |
| **Informational** | Immutable release source has 752 shows while live runtime has 760. | Preserve and verify the active runtime overlay during promotion; do not replace it with the smaller release-tree copy. |
| **Informational** | Existing entity validation reports role warnings in the release tree. No new integrity errors were found. | Track under existing data-quality work; not a submission release blocker. |

## Repository and reconciliation

The candidate merges implementation `c2afbc9dca695577cfbb2fbc50acae2363c8e0d3` with canonical `origin/main` `4656c17f8af5c018b36124af4d4d497db5215eac`. The original main worktree remains untouched with 54 dirty paths. Four paths overlap the modernization (`backend/package.json`, `backend/server.js`, `script.js`, `sw.js`); their uncommitted work was excluded. No push or deployment occurred.

The live catalog was fetched read-only from `https://echoarchives.net/data/shows.json` at `2026-11-25T21:05:23.540Z`, SHA-256 `9ffcbb004a03c851b2e5fd87a18c94a727e026b5a49999cb15df901f8f81025b`; all 760 records were published. Two read-only reconciliation runs produced identical recommendations and no writes: nine published resolutions, one already-listed resolution, one Dyme duplicate consolidation, OPTOg retained for review, and The Survivor Tapes retained as open. Thus 11 resolutions and two outstanding submissions are still expected, subject to a fresh capture. The database snapshot predates the catalog capture by about 73 minutes.

See [the sanitized production reconciliation manifest](2026-11-25-phase-iii1-production-reconciliation.json) and [the isolated migration inventory](2026-11-25-phase-iii1-migration-inventory.json).

The migration adds 11 submission columns, three tables, five indexes, and the legacy-retention protection trigger. On an isolated copy of the current snapshot, it restored 10 candidate links and wrote 13 received plus nine published lifecycle events. It resolved nine submissions only where exact submission provenance existed and the target show existed in the current archive. It left Rosanna's Secret and both Dyme rows for separate reconciliation, and left OPTOg and The Survivor Tapes open. All 13 original submission rows and moderation statuses were preserved. Archive, candidate, job, run, rating, and rating-event records were unchanged; no importer jobs were requeued and no show was published by migration. `quick_check` passed, foreign-key violations were zero, and repeated startup made no additional changes.

## Privacy remediation

Private submitter notes and verification notes had flowed into candidate `objective_json` and a shared importer run's `input_json`. The code now sanitizes candidate, event, job, run, and lifecycle evidence writes; strips private notes and contact/network tokens from submission-to-import conversion; uses generic lifecycle errors in logs; diverts URLs containing embedded credentials or secret-like parameters to investigation; and redacts connected records during retention. Public creator metadata and independently fetched provider responses remain intact.

The dry-run proposes exactly six rows: five candidate rows and one shared run row. It clears only `submissionHints[0].notes` and `verificationNotes` in the linked JSON values. Applying the exact manifest on an isolated copy changed six rows, preserved provider data and operational identity, passed integrity/FK checks, and left the source snapshot unchanged. The exact row keys and paths are in [the sanitized privacy manifest](2026-11-25-phase-iii1-privacy-redaction-dry-run.json).

The source scan found email strings in 39 website/RSS provider-source rows (20 snapshots, 19 caches). These rows are independently fetched public creator/provider content, not copies of private submitter contact fields, and remain unchanged. No source-IP or user-agent matches were found in candidate, event, job, or run records. An isolated retention exercise redacted due network and submission data across the original submission plus linked candidates/runs, retained operational tombstones, and passed integrity/FK checks.

Live redaction does not rewrite historical backups. Backup contents and expiry schedule remain unverified. Continue existing backup retention policy; any restored snapshot must run current retention cleanup before being exposed. No retention duration or privacy protection was changed.

## Backup, recovery, and rollback

Read-only host checks show `echo-archives.service` active at `/srv/echo-archives/releases/092faa604982ffd229fe0686157c4d275818e303`; `/api/health` returned healthy. `echo-archives-backup.timer` is active/enabled, next at `2026-11-26 03:22:08 CET`. `echo-archives-offsite-backup.timer` is inactive/disabled. Root filesystem headroom is 78,391,963,648 bytes (about 78.4 GB; 84% used), which does not verify a separate backup target.

The exact database snapshot passed `quick_check` and FK checks and was used in isolated application, migration, and staging copies. An isolated app returned healthy and importer/catalog state was available. This does not establish that the scheduled backup artifact is current, complete, readable, or restorable. Listing `/var/backups/echo-archives` returns `Permission denied`; restore from the actual scheduled artifact and off-site recovery remain unverified.

Raw release `092faa...` failed startup against the 760-show runtime because eight published provisional records do not have the review shape expected by its loader. Local fallback commit `b65d6060deafb76cc72b6de87a55df9a3737166f` backports the minimal compatibility. Against a migrated DB copy and 760-show runtime it passed startup, public health 200, catalog 760, maintainer login 204, and queue 200. The legacy retention trigger also prevented old cleanup from deleting an expired unresolved row and preserved lifecycle history. Stage the fallback artifact before migration. Application rollback remains separate from database restore; do not downgrade schema or overwrite newer writes with an older backup.

## Staging and browser checks

Staging used the current 760-show runtime catalog, not the 752-show release-tree catalog. A synthetic valid submission entered the isolated queue, was prepared automatically, became ready for review, and stayed unpublished until one explicit **Approve and publish** action. Publication added one test show to the isolated catalog (760 to 761) and automatically resolved the original submission. The original 760 rows remained. No live record changed.

The authenticated submission detail API returned HTTP 200 after publication. Playwright at 390px and 1440px displayed the resolved record without a server error or horizontal overflow. The source conversion now preserves `entities.json`; a regression test covers existing entity links. Isolated privacy and interrupted-processing exercises passed. All pre-existing non-submission importer candidates and jobs remained unchanged (143 non-submission candidates and 154 jobs); submission automation did not claim the unrelated 119-candidate backlog.

The isolated notification outbox delivered new-submission and ready-for-review events once each to a local mock webhook, without personal information. Real Discord delivery is unverified because no approved test destination was available; no public channel received a test message. Staging is configured with notifications off by design.

## Verification completed

- `npm --prefix backend run test:serial`: 628 passed, 0 failed, 1 existing optional rehearsal fixture skipped (629 total).
- `npm run test:tools`: 210 passed, 0 failed.
- Focused privacy/lifecycle/migration/publication checks: 101 passed.
- `npm run build:pages`: passed; 939 generated pages reused.
- `npm run check:generated`: passed; 170 generated pages ignored and 32 authored HTML files preserved.
- `npm run check:release-artifact`: passed for the 752-show release tree.
- `npm run validate:data`: passed with 0 integrity errors; existing entity-role warnings remain.
- Isolated migration and repeated startup: integrity/FK passed; no second-start changes.
- Reconciliation: two identical read-only recommendation runs.
- Privacy: read-only source dry-run, isolated manifest-guarded apply, and isolated retention exercise passed.
- Rollback: isolated previous-release compatibility boot and queue checks passed.

The full `npm run verify` reached the required browser smoke suite after the build, tools suite, generated checks, and backend serial suite. It found one stale test assertion that only allowed the pre-modernization queue URL parameters. The assertion now allows the supported `lane`, `submissionType`, `priority`, and `includeClosed` filters; the new focused `npm --prefix backend run test:smoke:maintainer-queue` passes. The full verifier was not rerun after this test-only correction. Its other completed groups passed; a temporary dependency link was needed because the isolated worktree has no `backend/node_modules`, and that link was removed afterward.

These checks do not replace actual scheduled-backup restoration, production environment readback, approved Discord destination delivery, or final fresh production reconciliation.

## Operator readback commands

Run as an authorized operator. This prints only an allowlist and a webhook configured boolean; it never prints the webhook value or other secrets:

```bash
sudo bash -s <<'SH'
pid=$(systemctl show echo-archives.service -p MainPID --value)
while IFS= read -r entry; do
  name=${entry%%=*}
  value=${entry#*=}
  case "$name" in
    SUBMISSION_AUTOMATION_ENABLED|SUBMISSION_PERSONAL_DATA_RETENTION_DAYS|SUBMISSION_NETWORK_DATA_RETENTION_DAYS|DATA_RETENTION_CLEANUP_INTERVAL_MS|SUBMISSION_PROCESSING_CONCURRENCY|SUBMISSION_RECONCILIATION_INTERVAL_MS|SUBMISSION_STALE_NOTIFICATION_DAYS|IMPORT_AUTO_WORKER|IMPORT_AUTO_DISCOVERY|IMPORT_WORKER_CONCURRENCY|IMPORT_HOST_CONCURRENCY|DB_PATH|STATIC_ROOT|IMPORT_STAGING_ROOT)
      printf '%s=%s\n' "$name" "$value" ;;
    ECHO_DISCORD_WEBHOOK_URL)
      [ -n "$value" ] && echo ECHO_DISCORD_WEBHOOK_URL_CONFIGURED=true || echo ECHO_DISCORD_WEBHOOK_URL_CONFIGURED=false ;;
  esac
done < <(tr '\0' '\n' < "/proc/$pid/environ")
SH
```

Inspect and validate the actual newest local backup as the service account:

```bash
sudo find /var/backups/echo-archives -maxdepth 1 -type f -name '*.sqlite' -printf '%TY-%Tm-%TdT%TH:%TM:%TS %s %p\n' | sort -r | head -5
sudo -u echo-archives /usr/bin/node /srv/echo-archives/current/tools/check-database-backup.js --directory /var/backups/echo-archives --max-age-hours 36
```

Then follow `deploy/DISASTER_RECOVERY.md` to restore that exact artifact into an isolated directory and verify catalog/importer recovery, SQLite integrity, and foreign keys. Report only basename, age, bytes, counts, hashes, and results. Do not restore to production.

## Controlled rollout after separate authorization

1. Merge the local candidate to canonical `main` only after authorization to publish it. Fetch the exact merged SHA, require a clean deployment checkout, and run `npm run verify` plus the focused privacy, migration, lifecycle, importer, and maintainer tests. Stop on any failure.
2. Stage and retain the tested `b65d6060...` previous-release compatibility artifact before migration. Stop if it fails health, catalog, or queue checks.
3. Run the allowlisted production environment readback. Confirm automation is `false`; record actual retention values and stop if unknown, invalid, or inconsistent with published policy. Create and validate a fresh online SQLite backup, capture `/data/shows.json` from `http://127.0.0.1:3010`, and record hashes/counts. Do not proceed unless the actual backup and isolated restore pass.
4. With the exact candidate under `/srv/echo-archives/releases/<sha>`, run reconciliation and privacy dry-runs against that same backup/catalog using the verified retention settings. Repeat and compare normalized recommendations. Obtain explicit approval for exact manifests; stop if a new row, missing show, conflict, unexpected private field, or fuzzy-only match appears.
5. Use the established manual deployment path `./deploy/echo staging <sha>`, inspect private staging and health, then `./deploy/echo promote`. Confirm production automation is disabled before promotion. Preserve the active production overlay; do not use the 752-show release copy. Stop on any migration or health regression.
6. Verify migration-induced resolutions, all 760 catalog records, queue state, candidate/job counts, integrity/FKs, and service health. Apply only separately approved current privacy and reconciliation manifests. Keep OPTOg and The Survivor Tapes open unless fresh evidence changes their status. Account for submissions arriving after the snapshot; never overwrite their work with a stale manifest.
7. Check maintainer queue, resolved example, outbox, processing/notification failures, queue age, retention status, and logs. Confirm unrelated importer jobs were not claimed. Test Discord only against the approved private destination.
8. Activate automation separately after authorization, at concurrency `1`, leaving importer worker/discovery settings unchanged. Verify the first bounded processing cycle and notification delivery. Stop/disable automation on stalled queue growth, repeated failures, SQLite lock contention, identity conflict, notification backlog, or any unapproved publication. Publication continues to require explicit editorial approval.

For application rollback, disable automation, wait for or safely stop in-flight submission work, preserve jobs, then run `./deploy/echo rollback <compatibility-release-sha>` and verify health and queue state. Do not downgrade the DB. Database restoration is a separate approved incident action after quantifying writes since backup and accepting the data-loss window.

## Changes requiring separate authorization

No production changes were made. Publishing/pushing the candidate, deployment or service restart, schema migration, applying the six-row redaction, reconciliation writes (including the expected 11 resolutions and Dyme relation), production environment changes, real Discord test delivery, and automation activation remain unauthorized. The final dry-run must incorporate submissions received since the recorded snapshot; the 11-resolution expectation is not authority to write.
