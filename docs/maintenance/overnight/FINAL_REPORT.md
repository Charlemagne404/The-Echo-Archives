# Operation Clean Slate — Final Report

**Date:** 2026-11-25
**Candidate:** `/tmp/echo-archives-operation-clean-slate`
**Branch:** `codex/echo-operation-clean-slate`
**Baseline:** `b75221a67f11c3899d6c3c0ffeea7e5527e065d5`
**Implementation commit:** `8c05827d fix: protect review drafts and reconcile submission imports`
**Deployed candidate:** `092faa604982ffd229fe0686157c4d275818e303` (2026-11-25)
**Canonical main merge:** `9f2a95ccd795eb589b96e3ad4c2b1120b0a9f430`

This report preserves the overnight checkpoint below. Its initial local-only handoff was superseded by the final integration and production closeout at the end of this report.

## Outcome

The overnight work produced the implementation and focused validation summarized below. The candidate was subsequently consolidated, merged, and deployed; see **Post-deployment closeout** for the final state.

## Changes

### Review privacy and publication projection

- Public catalog merging now requires each review companion to have a publication date and its own complete archive take and spoiler-free review. Completeness cannot be borrowed from inline fallback fields.
- Generated `data/reviews` artifacts include only companions for published shows classified as full reviews. Draft, incomplete, and stale generated review files are excluded while their authored source files remain intact.
- The dynamic `/data/reviews/:showId.json` route returns the active published full-review projection. Other paths below `/data/reviews` fail closed instead of falling through to static files.
- Catalog, artifact, and route regression cases cover undated drafts, incomplete companions, inline fallback mixing, and stale output.

### Submission and importer lifecycle

- Show submissions now persist their import candidate ID, a short-lived handoff claim, and resolved show ID. Maintainer projections show the candidate and publication state.
- Handoff is idempotent, rejects a rejected source row, and leaves moderation status unchanged. Successful explicit candidate publication accepts linked non-rejected submissions and records reviewer, review time, and show ID.
- Publication recovery snapshots include linked submission state while retaining compatibility with the earlier snapshot schema. Rollback restores only rows still matching the accepted publication state, so a later rejection is preserved.
- The maintainer view links to the import candidate and, after publication, to the show. Tests cover duplicate handoff, claim contention and stale-claim recovery, explicit publication, rejection, and rollback recovery.

### Documentation and preserved decisions

- Updated [IMPORTER.md](../../IMPORTER.md) and [schema.md](../../../data/schema.md) with the private linkage and public review projection contracts.
- Updated the mission plan, progress, and findings documents. No authored show records or editorial review text were edited.
- Kept the published submission retention policy: content/contact at most 180 days after review or receipt if never reviewed; source IP/User-Agent at most 30 days. The earlier idea to preserve open rows indefinitely was rejected because it conflicts with that policy.

## Validation

- `npm run test:home-browse` — 14/14 Chromium cases passed.
- `npm --prefix backend run test:production-bug-fixes` — 57/57 passed after the final review-gate adjustment.
- `npm --prefix backend run test:importer` — 55/55 passed.
- `npm --prefix backend run test:maintainer-auth` — 1/1 passed.
- `npm --prefix backend run test:community-popularity` — 12/12 passed.
- `node backend/test/database-migration-recovery.test.js` — 5/5 passed.
- `npm --prefix backend run test:smoke:maintainer-import` — 3/3 passed.
- `npm --prefix backend run test:security` — 45/45 passed.
- `node --test --test-concurrency=1 backend/test/public-routes.test.js` — 28/28 passed.
- `npm run test:tools` — 195/195 passed against the final review projection.
- `npm run build:pages` passed; social cards reported 939 reused and 0 rendered.
- `npm run check:generated` passed: 170 generated pages were ignored/untracked and 32 authored HTML files were preserved.
- `npm run check:build-determinism` passed for 2,493 generated files with SHA-256 `72e84f1926e7d43cbbf6d26ea251d2d5da5eb188f3de22b8de9316de8893b636`.
- `npm --prefix backend run validate:data` passed with zero errors across 752 shows, 47 collections, 132 entities, and 8 review companions. Existing entity-role attribution warnings remain for human review.
- `npm run check:release-artifact` passed with 752 published shows, 54 collections, no unlinked published shows, and no warnings.
- `npm run check:structure` exited successfully with existing line-size and cover-image-size warnings. `git diff --check` passed.

`npm verify` was not run because it is expensive and the focused suites above cover the touched code. Tests that create loopback servers or subprocesses needed an approved runner after sandbox `EPERM` failures.

## Repository and operational boundaries

- The canonical checkout at `/home/charlie/echo-archives` remains unchanged. All work is in the isolated candidate checkout.
- Local refs show divergent publisher and publication branches; none were merged, rewritten, or deleted. No local or remote `Deployment` branch was found in captured refs.
- All inspected worktrees, both stashes, and existing untracked worktree files remain preserved. The named importer/publisher stash was not applied or dropped.
- GitHub DNS was unavailable, so remote refs, CI status, and push state could not be refreshed. No push was made.
- Production and staging were not queried. No production request, deployment, service restart, database write/migration, queue action, or publication was performed.
- The latest local host sample showed 85% disk usage, 67 GiB free, and full 4 GiB swap. No cleanup or host changes were made. The 2026-11-24 stability audit remains prior evidence rather than current runtime verification.
- No physical-device, screen-reader, or full accessibility review was performed. Editorial entity-attribution warnings remain unchanged.

## Handoff

The original overnight handoff at `8c05827d` was superseded by the consolidated candidate and release below.

## Post-deployment closeout — 2026-11-25

- PR #10 was merged to `main` at `9f2a95ccd795eb589b96e3ad4c2b1120b0a9f430`. At merge, GitHub confirmed the merge tree had no file differences from deployed candidate `092faa604982ffd229fe0686157c4d275818e303`; subsequent updates to this report are documentation-only.
- The deployed candidate includes the runtime snapshot preservation fix. The earlier `ac008445` staging attempt failed at startup because a private snapshot journal was copied into the new runtime overlay; automatic rollback restored `7ad109f0`. The fix removes only the verified temporary journal copy while retaining importer and publisher state.
- Production and staging are healthy per the deployment closeout. Production retains 760 shows and 54 collections. Discord notifications have zero pending and zero failed deliveries. Manual visual inspection found no apparent regressions.
- GitHub Actions verification passed on `092faa604982ffd229fe0686157c4d275818e303`. The earlier staging failure did not affect production data or its release.

### Non-blocking infrastructure follow-ups

These are separate host/development maintenance items and do not block active product development:

- **Offsite backup recovery:** the prior stability reports record an inactive offsite schedule and no recent verified offsite restore. The infrastructure owner should confirm the schedule and perform the documented recovery rehearsal.
- **Disk monitoring:** the local monitor recorded 82% filesystem usage against its 80% threshold during the deployment window. Review capacity and alert thresholds as a separate maintenance item; this closeout did not repeat the host audit.
- **Shell DNS:** direct shell GitHub access failed DNS resolution during this work, while the authenticated GitHub integration remained available. Repair the development shell's DNS/network path separately.
