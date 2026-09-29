# Data integrity torture campaign — 2026-09-30

**Scope:** authored catalogue data through generated projections and public serving. Work ran on `codex/overnight-data-integrity`, based on `aa81d5d088508e65822ea059af5928569e2c4043`.

**Data/UI boundary:** no files under `catalog-src/` were changed, no production metadata was fabricated, and no public layout or feature was changed. Test fixtures used temporary directories. `sw.js` was regenerated because the cache key for the changed search module changed.

## 1. Data lifecycle map

| Stage | Authoritative input | Derived representation and checks |
| --- | --- | --- |
| Show records and order | `catalog-src/shows/<id>.json`; `catalog-src/shows/_order.json` | `tools/lib/catalog-source.js` reads records in authored manifest order. Authored `listenLinks.rss` remains the source for RSS destinations; `backend/lib/catalog-integrity.js` validates file names, IDs, HTTP(S) links, and cross-provider identities before projections are built. |
| Collections and order | `catalog-src/collections/<id>.json`; `catalog-src/collections/_order.json` | `backend/lib/catalog.js` resolves memberships against current show IDs. Source similarity and curated collection order remain authored. |
| Reviews | `catalog-src/reviews/<show-id>.json` | Merged by the catalogue loader and projected to `data/reviews/`; companion review content takes precedence over stale inline review fields. |
| Entities and attribution | `catalog-src/entities.json`, typed `entityLinks`, and optional creator/network/changelog registries | `backend/lib/entities.js` resolves typed evidence; `tools/lib/catalog-artifacts.js` writes `data/entities.json` and `data/entity-graph.json`. Entity pages and public references are generated from resolved entities. |
| Validation and normalization | Authored split files plus `tools/lib/catalog-schema.js` | Raw graph, identity, URL, enum, date, relationship, and manifest checks run in `backend/lib/catalog-integrity.js`; runtime records are normalized in `backend/lib/catalog.js` and `shared/archive-record.js`. |
| Catalog build | Authored source and local cover assets | `tools/build-catalog.js` validates, optionally migrates legacy runtime-shaped input, performs the explicit cover-maintenance step, loads normalized records, computes reports/gates, and calls `tools/lib/catalog-artifacts.js`. Outputs include `data/shows.json`, `data/collections.json`, `data/search-index.json`, review projections, entity graph, runtime evidence, statistics, taxonomy, and generated status. |
| Search | Published runtime show records | `shared/archive-search.js` projects and queries the search index. The index is a derived projection; public search does not become an authored source. |
| Similarity and recommendations | Authored `similarTo`/reason fields, typed metadata, and collection definitions | `backend/lib/shows-like-routes.js` and `shared/archive-similarity.js` keep authored links separate from computed candidates and generated Shows Like routes. Recommendation reasons must be supported by candidate evidence. |
| Covers | Authored `cover` and `coverAlt`; local `images/covers/` | Build maintenance may repair missing assets; responsive variants are derived under `images/generated/`. The build ran without changing authored source files. |
| Public pages and routes | `site-src/page-manifest.json`, authored page content, catalog projections | `tools/build-pages.js` generates HTML, aliases/redirects, creator pages, CSS bundles, service worker, sitemap, and robots output. Build-output and route-manifest checks detect missing and extra generated pages. |
| Runtime serving | Current catalogue and generated static assets | `backend/server.js` loads catalogue/entity state and serves dynamic pages, JSON, Markdown negotiation, sitemap, robots, and approved static files. `backend/lib/public-markdown-render.js`, `backend/lib/public-reference.js`, and `backend/lib/sitemap.js` own the corresponding public representations. |
| Imports and enrichment | Provider facts, selected evidence, reviewer actions | `backend/lib/services/import-service.js`, `elevation-service.js`, and `backend/lib/store/import-store.js` keep candidate/evidence state in SQLite. Promotion writes authored source through the guarded catalog-source path and rebuilds derived outputs. |
| Reports | Authored source or explicit generated snapshots, depending on report | Catalog, similarity, recommendation, metadata, entity, provenance, and collection reports are read-only. A source-tree digest was compared before and after the report sweep. |

## 2. Important invariants tested

- Split-source directories, order manifests, file IDs, and record IDs must agree. Authored order is preserved; filesystem enumeration does not silently add omitted records.
- IDs used as file paths must be unique lowercase slugs. Duplicate IDs and traversal-shaped IDs fail before a writer touches source.
- Parse errors fail closed and preserve existing bytes. Injected rename failures roll back changed records and leave no temporary files.
- Raw integrity validation must stop generation before source migration, cover repair, or derived-output writes. The synthetic shared-RSS fixture verifies that a failed build preserves an existing runtime projection.
- Duplicate list values are normalized for case and Unicode NFC before validation. Search-tag normalization also treats composed and decomposed Unicode identically.
- Listener Library and Personal Discovery remain browser-local. A recursive key scan of generated show, collection, search, entity, graph, and runtime-evidence JSON found none of the known local-only context, rating, library, device, or voter-secret fields.
- Existing catalog, entity, collection, route, sitemap, Markdown, public-reference, import/elevation, and migration suites exercise projection consistency and preserve factual/editorial and authored/computed boundaries.
- Generated checks and the release-artifact gate verify route/search/catalog counts, entity projections, and the generated HTML boundary.

## 3. Real defects found

1. The show source writer accepted duplicate and unsafe IDs. A duplicate show could be last-write-wins, and an unsafe ID could escape the intended record directory. Collection IDs had a duplicate-map guard but no slug/path-safety contract. Both writers now share strict ID validation.
2. A failed atomic write could leave its temporary file behind. The temporary name also depended only on process ID and millisecond time. It now uses a UUID, and failed writes remove the temporary file before rethrowing.
3. Split-source reads treated absent directories or `_order.json` as empty and silently appended unlisted files in sorted order. That could hide source corruption and change authored order. Reads now require the folders and manifests, exact record coverage, slug IDs, object records, and filename/internal-ID agreement.
4. Show updates did not parse an existing target record before replacement, so malformed bytes could be overwritten. The writer now preflights the entire requested batch and preserves malformed target bytes on failure.
5. `buildCatalog` did not run raw cross-record integrity validation before its maintenance and generation steps. An unresolved shared-provider identity could reach artifact generation. A new fixture proves the build now fails before touching derived outputs.
6. Identity/list normalization did not apply Unicode NFC. Composed and decomposed aliases could pass as distinct values, and search tags could normalize inconsistently. Both validation and search normalization now apply NFC.

## 4. Malformed cases already rejected correctly

Existing raw/runtime tests reject duplicate show IDs and normalized list values; unknown, self, and duplicate similarity references; malformed collection membership and cover references; malformed HTTP/RSS URLs; impossible dates; invalid numeric ratings/runtime values; unsupported discovery profiles; malformed provider-identity dispositions; mismatched source manifests; and invalid entity role/type or relationship evidence. Optional discovery metadata remains optional where the schema permits it.

## 5. Fixes made

- Added strict batch-ID validation and target preflight to source writers.
- Added unique, cleaned-up atomic temporary files while retaining rollback behavior.
- Made split reads fail closed for missing directories/manifests, missing or duplicate order IDs, omitted files, malformed records, and internal-ID mismatches; changed incidental filename ordering to codepoint sorting.
- Added raw catalog-integrity validation at the start of `buildCatalog`, before source-layout or cover mutations and before generated writes.
- Re-read source after the optional cover step so generated reviews and collections reflect the source that was actually built.
- Applied Unicode NFC in raw normalized comparisons and search-tag normalization.

## 6. Generated-artifact mismatches found

- `npm run build:catalog` produced 752 shows, 54 collections, and 7 review companions. The release-artifact check reported 752 published shows, 54 collections, 752 search records, 132 entities, 72 indexable entities, no unlinked published shows, and no warnings.
- `check:generated` passed; the generated HTML boundary reported 170 generated pages ignored/untracked and 32 authored HTML files preserved.
- No stale/mismatched catalog JSON projection was reported. The tracked `sw.js` cache version changed as expected because `shared/archive-search.js` changed; its source hash now matches the generated bundle manifest.
- The standalone `benchmark:discovery` returned status 2 for catalogue fingerprint drift from its recorded baseline (`fe17934a…` versus current source). This is a stale benchmark baseline signal, not a failed query assertion: all 57 recorded observations were unchanged and all 160 supported target checks passed. No baseline was recaptured.

## 7. Determinism findings

- The repository double-build check passed for 1,552 generated files under the default environment, `TZ=UTC`, and `LC_ALL=sv_SE.UTF-8`. Every run produced SHA-256 `acaea6b63bc8f3c77ef56fa67153d763bf02fca231a4d8e53ca9b35493625244`.
- Synthetic split-source fixtures enumerate files in a different order from `_order.json` and confirm authored order wins. A CRLF fixture parses correctly, then the writer emits stable LF JSON. The loader and source writers use stable codepoint order for incidental directory listings.
- Scanning the 1,552 fingerprinted outputs found no task-worktree or temporary-directory absolute paths and no CRLF line endings in generated text files (binary image assets were excluded from the line-ending check).
- `build-pages.js` intentionally reads `SITE_URL`, `PUBLIC_ANALYTICS_ENABLED`, `ARCHIVIST_ENABLED`, and `HOME_CARD_HOVER_EXPAND_ENABLED`; different values are expected to alter environment-configured page markup. Those feature/site URL variants were not forced to match.
- Only Node 24.14.1 is installed; the repository’s Node 22 minimum could not be exercised here. No separate concurrent multi-process generation test or key-reordered-object equivalence test was added. A build is a sequence of file writes rather than one transaction across all generated outputs.

## 8. Provenance/import findings

No import/elevation code changed. The backend suite’s passing cases cover factual Imported records, source provenance preservation, evidence selection, idempotent/recoverable jobs, rollback after failed publication/reload, and preservation of reviewer-owned fields. Imported facts remain separate from archive editorial claims. The writer changes make the final authored-source mutation fail closed on invalid IDs and malformed target records.

## 9. Compatibility and migration findings

- Required/current: split show and collection files with exact `_order.json` manifests.
- Intentionally supported legacy: aggregate `data/shows.json` and `data/collections.json` when split `catalog-src/` is absent. The explicit build migration remains and `backend/test/catalog-tooling.test.js` covers bootstrap from this shape. Read-only catalog reporting on legacy runtime data is covered and does not migrate or synchronize it.
- Intentionally supported compatibility: runtime review companions and inline review fields; companion review content takes precedence when both exist. Optional creator/network/changelog registries remain accepted and validated when present.
- Database schema migrations were not modified; migration/recovery tests are part of the backend suite.
- Uncertain: no active loader/test path for a historical monolithic `catalog.json` shape was found in this scoped audit. No compatibility path was removed.

## 10. Tests added or extended

- `tools/test/catalog-source-transaction.test.js`: 9 passing tests for duplicate/unsafe IDs, rename failure cleanup and rollback, malformed-byte preservation for both record types, retry idempotency, strict manifests, internal IDs, authored order, and CRLF input handling.
- `tools/test/build-catalog-validation.test.js`: synthetic unresolved RSS identity fails before derived outputs change.
- `backend/test/catalog-integrity.test.js` and `backend/test/catalog.test.js`: Unicode NFC collision checks.
- `backend/test/search-ranking.test.js`: direct composed/decomposed search-tag normalization check.
- `backend/test/cover-sync.test.js` and `tools/test/discovery-enrichment.test.js`: split-source fixtures now include required collection order manifests.

## 11. Verification results

- Focused source/build/enrichment tests: 18/18 passed.
- `backend/test/catalog-integrity.test.js`: 10/10 passed.
- `backend/test/catalog.test.js` plus `backend/test/cover-sync.test.js`: 57/57 passed.
- `backend/test/search-ranking.test.js`: 9/9 passed.
- Full root `npm run verify` exited 1 after reaching the backend serial suite; the root build, generated-boundary, release-artifact, tools-test, and determinism stages passed, as did backend validation and link checks. A separately captured rerun of `test:serial` reported 442/446 passing and four route/browser failures: two maintainer endpoints returned 404 instead of 200, `/style.css` returned 404, and one responsive case timed out waiting for the app-ready signal. The required-browser stage was skipped by the `&&` chain after the serial-test failure.
- Other Echo verification and smoke processes were active concurrently in separate worktrees during both backend runs, including a verification in the protected original checkout. The route mismatches appear consistent with dynamic-port/server contention, but that cause is not yet proven. This is recorded as unresolved pending an isolated rerun; it is not claimed as a passing full verification.
- Read-only reports `report:catalog`, `report:similarity`, `report:recommendation-coverage`, `report:discovery-quality`, `report:metadata-quality`, `report:collection-catalogue`, `report:collection-candidates`, `report:entity-graph`, `report:entity-candidates`, `report:entity-attribution`, and `report:provenance` exited 0. `check:generated`, `validate:data`, and `check:collection-catalogue` exited 0. The source digest before and after the report sweep was identical: 810 files, SHA-256 `014b64f88d2f72a2e7e34c2654927ead4e2a6e4c2734f3823585512aed2b460c`.
- `benchmark:discovery` reported the baseline drift documented in section 6; no benchmark baseline or authored data was changed.

## 12. Exact files changed

- `backend/lib/catalog-integrity.js`
- `backend/test/catalog-integrity.test.js`
- `backend/test/catalog.test.js`
- `backend/test/cover-sync.test.js`
- `backend/test/search-ranking.test.js`
- `shared/archive-search.js`
- `sw.js` (generated cache fingerprint)
- `tools/build-catalog.js`
- `tools/lib/catalog-source.js`
- `tools/test/build-catalog-validation.test.js`
- `tools/test/catalog-source-transaction.test.js`
- `tools/test/discovery-enrichment.test.js`
- This QA report.

## 13. Remaining data-integrity risks

- The full backend verification still needs a quiet-host rerun because concurrent Echo test servers were active during the observed 404/time-out failures.
- The benchmark corpus fingerprint is older than the current catalogue; the baseline should be reviewed by its owner rather than recaptured automatically.
- A process interruption during multi-file artifact generation can leave a partially refreshed generated set. Re-running the build and the generated/release gates detects and repairs/rejects that state; artifact generation is not an all-files atomic transaction.
- The retained legacy fallback cannot distinguish a true runtime-shaped legacy checkout from an accidental loss of `catalog-src/`; a valid but stale `data/shows.json`/`data/collections.json` could therefore be treated as migration input. This behavior is preserved for compatibility and should be tightened only with an explicit migration contract.
- Concurrent independent builds are not serialized by a repository-wide generation lock. The new writer temp names prevent temp-name collision and per-call rollback works, but cross-process manifest/build interleaving was not exercised.
- Node 22 behavior remains unverified on this host.
