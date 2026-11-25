# Submission Queue Modernization — Phase II

**Date:** 2026-11-25  
**Implementation branch:** `codex/submission-queue-modernization-20261125`  
**Baseline:** production release `092faa604982ffd229fe0686157c4d275818e303`  
**Production state:** not modified; no release, database, service, or configuration changes were made.

## Executive summary

The submission lifecycle now has an additive, durable data model that connects incoming show submissions to importer candidates, related submissions, published shows, and an event history. Submission intake stays synchronous only for validation and persistence; feed and metadata work is scheduled through the existing importer. The automated worker is deliberately disabled by default and never publishes a show. A maintainer can inspect a prepared record and approve publication from the submission queue in one action.

The historical queue problem had two main causes: publication through importer workflows did not consistently update the original submission, and personal-data cleanup deleted old submission rows even when their operational work was still unresolved. The migration repairs candidate links using exact submission provenance, resolves already-published linked candidates, and retains future operational rows while redacting personal content at the configured retention threshold.

### Root causes addressed

- The legacy submission row had one optional importer-candidate column, while importer-created candidates also recorded provenance through `primary_source_type` / `primary_source_key`. These could diverge, so publication left an open submission behind.
- Moderation `status` did not distinguish intake processing, editorial readiness, and final resolution, and there was no durable history to explain transitions.
- Retention deleted expired submission rows without distinguishing personal-data removal from unresolved operational work.
- Submission and importer workspaces were disconnected. A maintainer had to start preparation elsewhere and could not see candidate readiness, source evidence, and retry history in the queue.
- Discord used generic contribution notices rather than lifecycle states. Show intake now has its own outbox notice; other contribution notices remain and duplicate show notices are suppressed.
- Provider identities and fuzzy title evidence were not represented as separate resolution paths. The new reconciler only closes on strong identity or exact candidate provenance; title and alias matches remain review prompts.

The Phase I production snapshot contained **12 show submissions**, including 11 rows corresponding to 10 archive shows. A follow-up row for **The Survivor Tapes**, submitted on 2026-11-25, brings the combined known inventory to **13**. The recommended reconciliation resolves 11 submissions across 10 archive shows, preserves the two original Dyme records with one linked as a duplicate, leaves OPTOg for manual review, and retains The Survivor Tapes as outstanding work. These are Phase I and follow-up findings, not a fresh production read. The production dry-run must be run against a current, verified read-only database snapshot before applying any reconciliation decision.

## Repository baseline and preservation

- The implementation was made in a separate worktree based on the recorded production release SHA above.
- The pre-existing dirty checkout, its unfinished importer/publisher work, and its untracked files were not reset, overwritten, merged, or committed into this branch.
- No work was pushed. The implementation commit is local to the isolated branch.
- Verification uses the isolated worktree and temporary SQLite databases. It reuses installed dependencies from the preserved checkout through `NODE_PATH`; it does not install packages or alter the production database.
- A generated-page build was run in the isolated worktree to refresh the maintainer page's generated asset hashes. The source and generated outputs are included together.

## Implemented lifecycle

`show_submissions` remains the canonical operational submission row and moderation status remains the editorial decision. New columns separately track processing, resolution, retry timing, error text, and content-redaction time. Additive tables provide many-to-many submission/candidate links, directed duplicate/related submission relationships, and idempotent lifecycle events. The migration restores links from both the legacy foreign-key field and importer candidates whose primary source identifies the submission.

The new lifecycle service runs a bounded reconciliation loop. It checks strong provider identities, detects exact identity duplicates in the queue, synchronizes linked candidate state, hands supported sources to the existing importer, and retries recoverable handoff failures with a bounded policy. It does not create another metadata-fetching or publication system. Candidate preparation still uses Echo's RSS, Apple, Podcast Index, Amazon Music, website, cache, durable job, readiness, URL-safety, and publication code.

Identity matches may automatically resolve a submission only when a strong provider identity maps unambiguously. A title or alias match alone is shown to the maintainer and remains open. If multiple provider identities point to conflicting archive shows, the submission is escalated for investigation. Publication from any ingestion route resolves every linked non-rejected submission through the existing publication transaction.

The scheduler uses a per-process concurrency limit (default **2**, maximum **8**), a durable SQLite compare-and-set claim, a two-minute stale lease, and an interval (default **60 seconds**, maximum **60 minutes**). Handoff dispatch retries are capped at four attempts with bounded exponential delay. Existing importer jobs remain the durable preparation queue. `SUBMISSION_AUTOMATION_ENABLED` defaults to `false`; activation is a deliberate deployment step.

## Queue snapshot and reconciliation manifest

The detailed row-by-row before/after record is in [the reconciliation manifest](2026-11-25-submission-reconciliation-manifest.json). It distinguishes the 12-row Phase I snapshot from the 2026-11-25 follow-up submission and explicitly marks live production revalidation as outstanding.

| Recommended outcome from Phase I snapshot and follow-up row | Count | Treatment |
| --- | ---: | --- |
| Published importer candidate tied to exact submission provenance | 9 | Resolve as `published`, preserving candidate and show IDs |
| Strong YouTube playlist identity matches an archive show | 1 | Resolve as `already-listed` |
| Older Dyme submission shares strong provider identity with published Dyme | 1 | Resolve as `duplicate`, retain both source rows and link them |
| Existing candidate requires human review | 1 | Keep OPTOg open for manual review |
| No current match or linked candidate | 1 | Keep The Survivor Tapes open and process as new work after activation |
| **Combined known show submissions** | **13** | **11 resolution recommendations; 2 remain open** |

The 11 resolutions represent 10 unique archive show records because the Dyme duplicate points to the same published Dyme show as its canonical submission. In the Phase I snapshot, all 12 rows were `show`, `new`, and normal priority; no malformed HTTP(S) URLs were found, but reachability and redirects were not tested. The nine already-published candidate links were absent from the legacy submission foreign-key column but present in importer `primary_source_type` / `primary_source_key` provenance. The migration recovers those links without editing published show data.

Phase I also observed 119 importer candidates, including OPTOg's candidate. The 118 other candidates are outside the submission workflow. The new reconciler only claims due show-submission rows and does not batch-requeue unrelated importer candidates. The normal importer worker's existing behavior is otherwise unchanged.

### Current production dry-run

`backend/scripts/submission-reconciliation-dry-run.js` requires explicit database and catalog paths, opens SQLite with `readonly: true` and `query_only`, runs `quick_check` and `foreign_key_check`, emits a before/after manifest, and excludes email, source IP, and user agent. It was run twice against isolated fixture databases; the recommendations were identical and the database content did not change. Title-only matches remained manual.

No current production database snapshot or authenticated private queue export was available in this isolated implementation session. Therefore the production manifest has **not** been regenerated here. Before any live reconciliation, create and validate a fresh backup/snapshot and run:

```sh
NODE_PATH=/path/to/release/backend/node_modules npm --prefix /path/to/release/backend run submission:reconcile-dry-run -- \
  --db /path/to/verified-read-only-snapshot/community.sqlite \
  --catalog /path/to/release/data/shows.json \
  > /secure/audit-location/submission-reconciliation.json
```

Review that output against the row manifest and current catalog. Only the exact strong-identity and durable-candidate relationships should be automated. Do not apply any title-only recommendation automatically.

## Intake, admin, and notifications

- Valid submissions are saved before any network work. An optional idempotency key is hashed and uniquely indexed; repeating the same key returns the original row.
- Typed listening links are retained and translated into the existing importer objective, identity registry, and source/provenance records.
- Supported show submissions automatically enter the existing durable importer preparation lane when automation is enabled. Unsupported or ambiguous sources become `needs-investigation` with actionable errors.
- The maintainer queue defaults to actionable open items and has separate processing, investigation, and resolved lanes. Submission detail now includes lifecycle history, linked candidates and jobs, readiness and provenance, validation issues, archive matches, and potential duplicate submissions.
- Maintainers can retry, reject through the existing moderation update, confirm a duplicate, confirm an archive match, or explicitly approve-and-publish a ready candidate. Retry and resolution routes remain behind maintainer session authentication.
- The approve-and-publish route checks candidate readiness and publication-tier eligibility; preparation never grants publication authority.
- Discord lifecycle notifications use the existing SQLite outbox, stable event IDs, mention-safe embeds, and dispatcher retries. Intake, ready-for-review, persistent failure, and stale events are deduplicated. Submission titles and contact/network fields are not placed in new notification payloads. An outbox enqueue failure is logged and cannot reject an accepted submission.
- Queue health includes open/actionable/processing/failed/stale counts, submissions at or within 30 days of personal/network retention (including overdue rows), redacted content, notification status, and submission/candidate synchronization mismatches.

## Retention and privacy

The prior cleanup deleted expired submission rows unless a listener review was already published. That could silently erase unresolved work and lifecycle context. The new behavior never deletes a submission row as part of this cleanup. It still removes source IP and user agent after the network retention period. At the configured personal-data retention threshold it clears contact email, submitted title/creator/link/details, payload, provenance, review notes, and free-form reviewer identity. It preserves the row ID, moderation and processing/resolution state, timestamps, candidate links, published show ID, and event types/times. A redacted unresolved show is visibly escalated to `needs-investigation` rather than silently disappearing.

Lifecycle event evidence, resolution evidence, relationship evidence, processing errors, and free-form historical actors are also scrubbed when content is redacted. This preserves operational history while preventing submitted text or personal names inside evidence from bypassing the retention period. New Discord events contain no submission title or personal contact/network fields.

The code defaults remain the existing 180-day personal-content and 30-day network-data periods, validated as configuration. The effective production override values could not be read from the service account used for this work. Before rollout, the authorized operator must read back the effective values from the running service and confirm that they match the applicable privacy notice/policy. **Changing either retention period is a policy decision and requires explicit approval.** A historic message already delivered to Discord cannot be recalled by the application; the new lifecycle messages avoid these fields going forward.

## Risks and limitations

- Automation is disabled by default. It must be explicitly enabled only after release, migration, dry-run review, and health checks.
- Reconciliation of the 12 Phase I rows plus the 2026-11-25 follow-up row has not been run against current production data. The included manifest is the recommended disposition and must be revalidated.
- Production retention overrides and current backup/restore success need privileged operational verification before release.
- A single process-local scheduler prevents overlapping work inside one process; multiple processes are protected by the database claim/lease. SQLite write contention still needs production resource monitoring.
- A website or platform page may not expose an RSS feed or supported provider identity. Such items remain in investigation; the implementation does not guess feeds from title alone.
- There are no new bulk mutation controls. The Phase I actionable set is small, strong-match reconciliation is automated, and ambiguous editorial cases are intentionally handled one at a time to avoid unsafe mass closure. Reassess bulk triage after the live queue size and use patterns are observed.
- No schema downgrade is supplied. Application rollback should return to the prior app release while retaining additive columns/tables; do not restore an older database over newer writes unless using the verified backup restore procedure and accepting the corresponding data-loss window.
- No live production service, database, Discord webhook, or staging maintainer session was exercised. The authenticated queue was inspected in a real browser against an isolated local server; a staging browser walkthrough remains a rollout gate.

## Phase II implementation map

| Priority | Area | Files / structures | Change and verification |
| --- | --- | --- | --- |
| P0 | Durable lifecycle and migration | `backend/lib/store/database.js`; `show_submissions`; `submission_candidate_links`; `submission_relations`; `submission_lifecycle_events` | Additive schema and provenance backfill; migration recovery, foreign-key, and integrity tests |
| P0 | Intake and importer handoff | `backend/lib/services/submission-service.js`; `backend/lib/services/import-service.js`; `backend/lib/store/import-store.js`; `backend/lib/services/submission-lifecycle-service.js` | Idempotent intake, typed-link preservation, strong identity checks, bounded durable handoff and retry; lifecycle/import/fetch-safety tests |
| P0 | Publication and reconciliation | `backend/lib/store/import-store.js`; `backend/lib/services/submission-lifecycle-service.js` | Resolve all linked submissions from any successful publication path; title-only matches never close; duplicate reconciliation idempotency tests |
| P0 | Retention safety | `backend/lib/store/submission-store.js`; `backend/lib/config.js` | Replace row deletion with personal-data redaction and preserve operational history; retention tests and effective-config readback gate |
| P1 | Maintainer workflow | `backend/lib/routes/maintainer-routes.js`; `shared/app/maintainer/*`; `shared/app/pages/maintainer.js`; `site-src/pages/maintainer/submissions.html` | Queue lanes, details, matches, candidate readiness, history, retry, duplicate/match resolution, one-click editorial approval; route tests and staging browser walkthrough |
| P1 | Notifications and health | `backend/lib/services/discord-notification-service.js`; lifecycle service and health route | Durable outbox lifecycle notices and queue consistency indicators; notification failure/retry tests |
| P1 | Reconciliation utility | `backend/scripts/submission-reconciliation-dry-run.js`; `backend/package.json` | Read-only CLI manifest; fixture repeatability, query-only, privacy omission, quick-check/FK checks |

## Verification completed

- `npm run build:pages` with shared installed dependencies — completed; 939 social cards reused, no new social-card renders.
- Full backend serial suite: **614 passed, 0 failed, 1 skipped** across 615 tests. This includes the existing regression suite and the new submission queue browser smoke inventory.
- Final submission lifecycle rerun after adding the 119-candidate isolation assertion: **7/7 passed**.
- `test:database-migrations`: **5/5 passed** on the additive migration and recovery fixtures.
- Local Playwright smoke signs in to an isolated server, submits a test show, inspects lifecycle details, and checks 390px and 1440px layouts; it passed.
- `git diff --check`, package/manifest JSON parsing, page generation, and development configuration validation passed.

## Production rollout and rollback plan

1. **Before release:** read back effective retention and Discord configuration from the service environment; confirm the approved privacy periods. Confirm disk headroom and that the current production backup is recent, readable, integrity-checked, and restorable. Perform the existing isolated restore drill; keep its evidence.
2. **Capture baseline:** take a fresh application-consistent backup of the community database using the existing backup workflow. Run its integrity and foreign-key check, then retain the prior release and database restore point.
3. **Dry-run:** execute the reconciliation utility against a read-only verified snapshot and the matching production catalog. Compare the 12 Phase I rows plus the 2026-11-25 follow-up row if it is still present (or current row count if changed), review strong identities and conflicts, and approve the exact manifest before applying reconciliation.
4. **Deploy disabled:** deploy the tested commit with `SUBMISSION_AUTOMATION_ENABLED=false`. Startup applies the additive migration and backfills candidate relationships. Verify migration marker, `PRAGMA quick_check`, `PRAGMA foreign_key_check`, queue health and migration counts. Existing published candidate submissions may resolve from exact links as part of that migration; inspect against the dry-run.
5. **Staging/browser gate:** exercise new intake, idempotent repeat, resolved match, OPTOg manual review, one-click approval, explicit rejection, Discord outbox delivery, and mobile/desktop queue detail in staging. Confirm no unrelated importer candidate was queued or reprocessed.
6. **Activate:** set `SUBMISSION_AUTOMATION_ENABLED=true` only after the disabled release is stable and the dry-run is approved. Keep concurrency at 2 initially, observe one full reconciliation cycle, and verify it only claims show-submission rows. The existing 118 unrelated candidates remain outside its query.
7. **Post-deploy:** verify queue health counters and mismatch counts, candidate/job progression, no title-only automatic resolutions, Discord delivery, retry/stale alerts, retention redaction thresholds, and application/database integrity. Review after the first day and again after one week.
8. **Application rollback:** disable automation first, then point the application back to the previous release. Leave additive database schema and data in place. The old application ignores the additive structures; do not run a destructive down migration.
9. **Database restore:** only restore the fresh verified backup if database corruption or incompatible writes require it. Stop application writers, restore through the documented isolated/guarded procedure, check integrity and foreign keys, then start the matching prior release. This loses writes since the backup, so record that window and obtain operational approval.

## Remaining approvals and actions

- Approval is required for any change to personal-data or network-data retention durations.
- An authorized operator must provide a fresh production snapshot or execute the read-only dry-run and attach its complete (sanitized) output before any live reconciliation.
- Confirm production's effective retention overrides, current backup/restore evidence, Discord outbox connectivity, and staging browser walkthrough before enabling automation.
