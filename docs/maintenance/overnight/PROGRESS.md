# Operation Clean Slate — Progress

**Updated:** 2026-11-25
**Branch:** `codex/echo-operation-clean-slate`
**Baseline:** `b75221a67f11c3899d6c3c0ffeea7e5527e065d5`
**Candidate checkout:** `/tmp/echo-archives-operation-clean-slate`

## Completed work

- Kept the canonical checkout and its Git metadata untouched; all implementation and generated-file work is isolated in the candidate clone.
- Verified the immediate catalog/search/mobile changes with `npm run test:home-browse` (14/14), the focused production bug-fix suite (57/57), and `npm run build:pages`.
- Fixed review companion projection so public runtime catalog data and `/data/reviews/:showId.json` expose only complete, dated review content for shows currently marked `full-review`. Completeness must come from the companion itself; it cannot borrow inline fallback fields. Undated drafts and dated incomplete companions remain private. A stale direct `/data/reviews` static path now returns 404. Added runtime route, catalog, and generated-artifact regression cases.
- Added a durable link from a show submission to its import candidate, a short idempotency claim, maintainer queue projection, and a clear handoff state. Handoff keeps moderation status unchanged; only successful explicit candidate publication accepts a linked non-rejected submission.
- Included linked submission state in publication recovery snapshots. Recovery can read the prior schema and restores only rows that still match the accepted publication state, preserving later rejection or other concurrent review changes.
- Added lifecycle coverage for handoff without publication, repeat handoff, accepted/resolved state after explicit publication, rejected-row protection, rollback recovery, and claim contention/stale-claim recovery.
- Reviewed the catalog/publication flow through generated artifacts, runtime catalog and review routes, rendered show pages, SEO outputs, service-worker cache rules, and release mutable-state preservation. No live release action was taken.
- Reviewed current security invariants, analytics guidance, and the 2026-11-24 stability audit. The published submission retention policy is explicit (180 days for content/contact, 30 days for source IP/User-Agent); retention was not changed.
- Updated importer/schema documentation and this dated mission record. No authored catalog records or show content were edited.

## Repository and operational state

- Canonical checkout remains clean at `b75221a6`; local `main` is `7df736b7`. The isolated candidate has no pushed remote update because GitHub DNS/network access is unavailable.
- Local refs show `codex/echo-immediate-production-fixes-20261125` is 2 commits ahead of `origin/main`; publication-journal is 40 behind/7 unique, publication-readonly is 40 behind/15 unique, and publisher-integration is 40 behind/4 unique. Publisher-integration is 1 behind/54 ahead of the local publisher WIP branch. These divergent branches were not merged.
- No local or remote `Deployment` branch was found in the captured refs. No branch was created, rewritten, or deleted.
- About 20 active worktrees were inventoried. All were preserved, including the publisher, Discord, stability, CI, scraping, rollback, and runtime-permission worktrees. Existing untracked files in the scraping-mitigation and Discord worktrees were left untouched.
- Both stashes were preserved. The named importer/publisher stash is `dee787871012e179458fea4b04365391cb6dec41`; the separate release-verification stash is `12d62bbed79a413d43827d218e942e1b45ff18cf`. Neither was applied or dropped.
- The latest host sample was 85% disk used with 67 GiB free, 4 GiB swap occupied, about 3.4 GiB available RAM, and low memory pressure. No cleanup, swap reset, monitor edit, or production/staging query was performed.

## Validation completed

- `npm run test:home-browse` — 14/14 Chromium cases passed.
- `npm --prefix backend run test:production-bug-fixes` — 57/57 passed.
- `npm --prefix backend run test:importer` — 55/55 passed, including import parsing/fetching, durable lifecycle, publication recovery, and claim contention/stale-claim checks.
- `npm --prefix backend run test:maintainer-auth` — 1/1 passed.
- `npm --prefix backend run test:community-popularity` — 12/12 passed.
- `node backend/test/database-migration-recovery.test.js` — 5/5 passed, including historical migration and backup/recovery cases.
- `npm --prefix backend run test:smoke:maintainer-import` — 3/3 passed.
- `npm --prefix backend run test:security` — 45/45 passed.
- `node --test --test-concurrency=1 backend/test/public-routes.test.js` — 28/28 passed.
- `npm run test:tools` — 195/195 passed, including catalog-publication recovery, deployment/operations, backup, SEO, and generated-review projection tests.
- `npm run build:pages` passed; `npm run check:generated` passed with 170 generated pages ignored/untracked and 32 authored HTML files preserved.
- `npm run check:build-determinism` passed for 2,493 generated files, SHA-256 `72e84f1926e7d43cbbf6d26ea251d2d5da5eb188f3de22b8de9316de8893b636`.
- `npm --prefix backend run validate:data` passed with 0 errors across 752 shows, 47 collections, 132 entities, and 8 review companions. It emitted existing source-attribution warnings for editorial review; none were changed.
- `npm run check:release-artifact` passed: 752 published shows, 54 collections, no unlinked published shows, and no warnings.
- `npm run check:structure` exited successfully but reported existing line-size and cover-image-size warnings.
- `git diff --check` passed before the final report edits; rerun after final edits.

Commands that spawn loopback/subprocess servers required the approved unsandboxed retry after sandbox `EPERM` failures. `npm verify` was intentionally not run because it is expensive and focused suites already cover the touched areas.

## Remaining limitations

- The GitHub remote could not be refreshed, so branch freshness and push/CI status are unknown.
- No production or staging state was queried. The 2026-11-24 host/security audit is prior evidence, not a current runtime verification.
- No physical-device, screen-reader, or comprehensive accessibility review was performed.
- The source-attribution warnings require editorial evidence and were left unchanged.
- The isolated candidate is local-only until a human reviews and transfers/promotes it through the project’s normal release process.

## Candidate commits

- Mission plan: `1751fb35 docs: establish overnight maintenance mission`.
- Implementation: `8c05827d fix: protect review drafts and reconcile submission imports`.
- Final report and status update are committed locally in the mission documentation commit; no push or deployment is part of this mission.
