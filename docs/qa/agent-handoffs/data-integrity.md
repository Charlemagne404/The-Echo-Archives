# Data integrity torture campaign

- Task slug: `data-integrity`
- Task branch: `codex/overnight-data-integrity`
- Starting integration commit: `aa81d5d088508e65822ea059af5928569e2c4043`
- Task commit: `5e1541c650fb529504845b4d6b46385275bca17a`
- Changes made: fail-closed split-source loading and safe source writes; raw source-integrity gate before build side effects; NFC normalization for list identity and search tags; synthetic corruption/rollback/order tests; dated QA report.
- Bugs found/fixed: unsafe/duplicate writer IDs; malformed show replacement without preflight; temp-file debris after injected rename errors; missing/incomplete split manifests silently becoming empty or reordered reads; raw provider-identity conflicts reaching generation; composed/decomposed Unicode duplicates.
- Important files/subsystems touched: `tools/lib/catalog-source.js`, `tools/build-catalog.js`, `backend/lib/catalog-integrity.js`, `shared/archive-search.js`, their tests, generated `sw.js`, and `docs/qa/2026-09-30-data-integrity.md`.
- Tests/results:
  - `rtk proxy node --test --test-concurrency=1 tools/test/catalog-source-transaction.test.js tools/test/build-catalog-validation.test.js tools/test/discovery-enrichment.test.js` — 18/18 passed.
  - `rtk npm --prefix backend run test:catalog-integrity` — 10/10 passed.
  - `rtk proxy node --test --test-concurrency=1 backend/test/catalog.test.js backend/test/cover-sync.test.js` — 57/57 passed.
  - `rtk proxy node --test --test-concurrency=1 backend/test/search-ranking.test.js` — 9/9 passed.
  - `rtk npm run check:build-determinism`, `TZ=UTC rtk npm run check:build-determinism`, and `LC_ALL=sv_SE.UTF-8 rtk npm run check:build-determinism` — each passed for 1,552 generated files with SHA-256 `acaea6b63bc8f3c77ef56fa67153d763bf02fca231a4d8e53ca9b35493625244`.
  - `rtk npm run check:generated`, `rtk npm run validate:data`, and `rtk npm run check:collection-catalogue` — exit 0. All listed read-only reports exited 0.
  - Read-only report commands `rtk npm run report:catalog`, `report:similarity`, `report:recommendation-coverage`, `report:discovery-quality`, `report:metadata-quality`, `report:collection-catalogue`, `report:collection-candidates`, `report:entity-graph`, `report:entity-candidates`, `report:entity-attribution`, and `report:provenance` — exit 0. The authored-source digest before/after was 810 files and SHA-256 `014b64f88d2f72a2e7e34c2654927ead4e2a6e4c2734f3823585512aed2b460c`.
  - Final quiet-host `rtk npm run verify` — exit 0. The root build, generated-boundary, release-artifact, tools tests, determinism, backend data validation, link checks, backend serial tests, and required browser smoke all passed. Tools: 159 passed, 5 skipped; backend serial: 447/447 passed; required browser smoke: 96/96 passed; aggregate: 702 passed, 5 skipped, 0 failed.
  - An earlier hidden-path run returned 404 for maintainer pages and `/style.css`, then timed out waiting for browser app readiness. The cause was Express `sendFile` ignoring the dot-prefixed task worktree path `.echo-codex-data-integrity`. Moving the unchanged task worktree to the non-hidden sibling `echo-codex-data-integrity` fixed the route behavior; the affected maintainer, public-route, and responsive tests then passed 24/24.
  - `rtk npm run benchmark:discovery` — exit 2 solely for baseline catalogue fingerprint drift; all 57 observations were unchanged and all 160 supported checks passed.
- Known limitations: the retained legacy aggregate-runtime migration cannot tell a real legacy checkout from accidental loss of `catalog-src/`. Multi-file derived artifact writes are not a group transaction, and independent builds are not serialized.
- Dependencies changed: None.
- Generated artifacts changed: `sw.js` only; regenerated cache fingerprint for `shared/archive-search.js`.
- Interactions with likely other campaigns: overlaps catalog/enrichment/schema work through `tools/lib/catalog-source.js`, `tools/build-catalog.js`, and `backend/lib/catalog-integrity.js`; overlaps discovery/personalization work through `shared/archive-search.js`. Reconcile against later handoffs under the integration lock.
- Compatibility concerns: preserve the aggregate `data/shows.json`/`data/collections.json` bootstrap path and read-only legacy report behavior. Split-source mode now requires complete valid `_order.json` manifests. No database migration or public route contract changed.
- Things later agents must preserve: authored catalog order is defined by `_order.json`; do not weaken slug/path safety or malformed-byte preservation; keep authored and computed recommendation evidence distinct; keep browser-local Library/Personal Discovery state out of public catalogue projections; do not edit authored catalogue content to satisfy tests.

## Integration notes for later agents

- Re-read every handoff under the integration lock before rebasing. Preserve strict split-source validation and the pre-generation raw integrity gate if neighboring catalog or discovery work touches these paths.
- The initial route/browser failures were caused by the hidden task worktree path interacting with Express `sendFile` dotfile handling. The task worktree now lives at `/Users/charliearnerstal/Documents/GitHub/echo-codex-data-integrity`; do not move it back under a dot-prefixed path when running browser or route tests.
- The benchmark corpus is stale relative to current source; do not recapture its baseline as part of this task.
- This branch was rebased from `aa81d5d088508e65822ea059af5928569e2c4043` onto `5eed3f1b522517544c19fdc27fd4206168d66ce4` under the integration lock. The only conflict was generated `sw.js`; the integrated service-worker generator was retained and `rtk npm run build:pages` regenerated the worker with the task's archive-search fingerprint, preserving the no-store and 502/503/504 offline-fallback behavior.
- `disaster-recovery.md` and `security-redteam.md` were read under the lock and their integrated behavior was preserved.

## Integration result

- Pre-integration commit: `5eed3f1b522517544c19fdc27fd4206168d66ce4`; the shared worktree was clean on `codex/overnight-integration`.
- Rebase/conflicts: Rebased onto the pre-integration commit. One generated `sw.js` conflict was resolved by rebuilding from the integrated generator; no other conflicts remained.
- Prior handoffs incorporated: `disaster-recovery.md` and `security-redteam.md`, read under the lock; their changes were retained.
- Combined verification: Pending quiet-window verification on the combined branch.
- Final overnight integration commit: Pending.
- Push result: Pending; only the task and overnight integration branches may be pushed, never `main`.
