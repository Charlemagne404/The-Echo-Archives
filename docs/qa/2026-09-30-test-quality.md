# Test Suite Quality Audit — 2026-09-30

## Scope and result

This audit checked whether the executable suites exercise the contracts claimed by the current 2.0 release gates. It is not a coverage-percentage report. I inspected runner inventories, production call paths, browser setup and teardown, fixtures, mutation sensitivity, and the standard verification graph.

The audit found two test-runner defects and one public route defect. The required browser gate omitted three smoke files, and `--serial` searched the wrong directory. The server also failed to serve intended maintainer shell pages for submissions and analytics. The runner and route gaps are fixed, and focused test assertions now detect several cases that previously passed because another branch or input masked the intended contract.

The task worktree passed the full `rtk npm run verify` gate after the runner, route, and fixture fixes. The final assertion-only refinements then passed a focused 50-test slice. The exact accumulated branch receives another full verify during integration, recorded in the handoff. This report is not a release sign-off.

## Suite map

| Suite | Inventory and entry point | What it exercises |
| --- | --- | --- |
| Tool tests | 26 files in `tools/test/`; `npm run test:tools` | Catalogue source/read boundaries, schemas and provenance, generated pages, deterministic builds, search and discovery benchmarks, collection/entity/recommendation reports, monitoring, backup and recovery tooling, deployment-operation fixtures. |
| Catalogue validation | `npm run build:catalog`, `backend validate:data`, catalogue tests in both test trees | Authored records, generated projections, IDs and cross-references, source-backed entities, collection membership, and artifact integrity. The validator reports data warnings separately from integrity errors. |
| Backend unit and integration tests | 64 `backend/test/*.test.js`; `npm --prefix backend run test:serial` | Search/ranking, SQLite stores and recovery, APIs and authorization, submissions and review queues, community ratings, entity and collection services, generated and public routes, analytics, and Library service contracts. This is serial; it creates temporary databases and fixtures. |
| Browser smoke | 16 `backend/test/*.smoke.js`; `npm --prefix backend run test:smoke:required` | Public browse/detail/collection flows, URL/history behavior, mobile, accessibility/keyboard/reduced motion, creator/entity pages, maintainer pages, submission/chat and community flows, analytics, Library product behavior, and service-worker/offline behavior. The required runner uses Playwright and fails if the selected browser is unavailable. |
| Library platform | `backend/test/listener-library.test.js` | Real Chromium IndexedDB persistence, migrations, malformed data, blocked upgrades, version changes, two-tab updates, import/export, validation, failure outcomes, and transaction atomicity. |
| Library product | `backend/test/listener-library-product.smoke.js` | Browser-visible state controls, private rating and opt-in, reload/cross-tab behavior, cleared-state parity, Hidden visibility, keyboard/mobile use, and request privacy. |
| Discovery and recommendation | `tools/test/discovery-golden-benchmark.test.js`, `tools/test/discovery-v2.test.js`, `tools/test/discovery-personalization.test.js`, `backend/test/search-ranking.test.js`, `backend/test/similarity.test.js`, and scale tests | Exact title/alias identity, typed intent, hard and soft constraints, authored versus computed provenance, exclusions, candidate eligibility, stable ranking, reasons, and disabled Personal Discovery parity. |
| Generated output and service worker | Root `check:generated`, `check:structure`, `check:release-artifact`, `check:build-determinism`; `backend/test/site-structure.test.js`, `seo.test.js`, `sitemap.test.js`, and browser worker flow | Authored/generated boundaries, canonical routes and metadata, worker cache inputs/versioning, offline navigation, and API bypass behavior. |
| Entities and collections | `backend/test/entities.test.js`, entity graph/directory tests, `collection-service.test.js`, `catalog-invariants.test.js`, plus tool report tests | Typed entity roles, public relationships, route membership, authored ordering, candidate reports, and computed/authored collection boundaries. |
| Submission, moderation, analytics, and privacy | `submissions.test.js`, `maintainer.test.js`, `review-workflow.test.js`, analytics tests/smokes, community tests/smokes | Input and catalogue reference validation, unauthenticated/authorized maintainer paths, state transitions and publication, allowlisted analytics payloads, and visible/request-level outcomes. |
| Operations, staging, deployment, backup and restore | `tools/test/operations.test.js`, monitoring/backup/Restic tests, and deployment scripts | Script ordering, safety guards, fixture-based readiness/rollback, backup retention and recovery inventory. These are local simulations; they do not deploy to staging or restore the production host/database. |

The root `npm run verify` composes catalogue/page generation, structure and generated-boundary checks, release-artifact validation, all tool tests, build determinism, then backend data/link validation, serial backend tests, and required Chromium smoke. It does not run CI, live staging, production deployment, or a real host restore.

## Weak tests and fixes

### Smoke inventory was not truthful

The required browser runner maintained hand-written read-only/stateful lists but did not compare them with the files in `backend/test`. Three existing smokes were not scheduled: `discovery-analytics.handler.smoke.js`, `discovery-analytics.smoke.js`, and `listener-library-product.smoke.js`. As a result, the required command could report a complete pass while omitting important analytics and Library flows.

The runner now discovers every `.smoke.js` file, rejects duplicate/stale/unassigned entries before starting a batch, and tests that the actual repository inventory is scheduled exactly once. The serial branch also previously listed the backend root rather than `backend/test`, silently selecting zero smoke files. It now runs the discovered files serially and errors when none are found.

### A test masked moderation status validation

I added an API-level check for an unknown review status. Its first form omitted `priority`; the route forwards both fields, including an `undefined` priority, so priority validation returned 400 before the status validator ran. The test passed with the status validator deliberately disabled. The request now supplies a valid priority and asserts the 400 for the unknown status. With that correction, disabling the status validator makes the route test fail.

### Privacy and recommendation edge cases were under-specified

- Analytics tests checked pageview payloads and `pathname`-style input, but did not directly check a valid `href` containing a query and fragment. A mutation adding the query to the sanitized `href` survived the old test. The valid-`href` assertion now fails under that mutation.
- Public similarity tests exercised ordinary candidates, where candidate retrieval had already applied the score floor. A mutation to the second-stage public filter therefore had no effect. The enriched candidate test now supplies the same otherwise-eligible candidate with a score below the floor through `precomputedCandidates`; the mutation is killed.
- The transaction-abort mutation was initially paired with the non-failure persistence test and survived because that test did not inject a failing write. The error/migration test does inject write failures during replace/reset and proves prior rows and opt-in remain intact; that test kills the abort mutation.

### Hidden task-worktree path affected static fixtures

The isolated worktree path starts with a dot. Express static serving treats the hidden parent component as excluded, so several tests using that directory directly got `/style.css` 404s and app-ready timeouts. This was a test-environment path issue, not a production route regression. A test helper now creates a visible symlink alias under each unique temporary directory and points static-serving fixtures there. Production dotfile behavior was left unchanged; cleanup of the temporary directory also removes the alias.

### Real route defect exposed by integration coverage

The baseline server allowlist did not serve the intended maintainer shell routes for submissions and analytics. Requests to `/maintainer/submissions.html` and `/maintainer/analytics.html` returned 404. The allowlist now includes the six intended submissions, reports, imports, collections, and analytics shell paths. Tests verify successful shell responses and `noindex` headers; maintainer API authorization remains enforced separately.

## Controlled mutations

Each mutation was temporary and restored immediately. The table records whether the targeted assertion rejected the changed behavior after correcting test selection/input masks.

| Contract mutated | Evidence that rejected it |
| --- | --- |
| Maintainer session check bypassed | `backend/test/maintainer.test.js`: unauthenticated API expected 401 and observed 200 under the mutation. |
| Disabled Personal Discovery guard bypassed | Personal Discovery parity test failed on changed result identity/order. |
| Hard Discovery conjunction/exclusion bypassed | `tools/test/discovery-v2.test.js`: constrained result assertion returned a forbidden candidate. |
| Exact title precedence removed | Exact title/alias intent test failed. |
| Submission common-field validation skipped | `backend/test/submissions.test.js` failed an expected validation exception. |
| Known-show reference validation skipped | Correction-submission test failed its expected rejection for an unknown catalogue ID. |
| Authored evidence admitted as computed similarity | `backend/test/similarity.test.js` failed the authored/computed result-set assertion. |
| Public score floor skipped for precomputed candidates | The strengthened enriched-candidate test failed. |
| Unknown moderation status accepted | The corrected authenticated route test failed its status assertion. |
| Library backup extra-field validation skipped | The schema test failed when Personal Discovery setting data was accepted as backup content. |
| Private title snapshot added to Personal Context | Real Chromium Library API test failed its allowed-key/privacy assertions. |
| IndexedDB transaction abort omitted | Real Chromium storage-failure/migration test failed the atomic replace/reset assertions. |
| Analytics sanitizer retained query data in a valid `href` | The new direct URL-sanitization assertion failed. |
| Service worker intercepted/cache-stored API responses | Real worker browser flow failed because `/api/health` entered a public cache. |

No meaningful mutation remained surviving after the tests were strengthened. The release record still has areas with no executable claim rather than a surviving code mutation—particularly legal, staging, production restore, and screen-reader review.

## Browser truthfulness, isolation, and flakiness

The browser setup polls a live server endpoint before opening pages. Shared navigation helpers wait for the app-ready marker; some older flows still use `networkidle` or direct navigation and route checks rather than the common readiness helper. Tests that need deterministic UI/API fixtures commonly block service workers, while the separate service-worker smoke installs and exercises the real worker, including API GET/POST bypass and offline navigation. Console/page errors and failed requests are checked by selected smokes, not by a uniform listener across every flow. There is no global retry layer that can convert a failed browser assertion into a pass.

Temporary static roots and SQLite databases use unique temporary directories; browser contexts and test servers are closed by teardown paths. The main runner separates read-only and stateful smoke inventories, with default concurrency one for both batches. Free-port selection is followed by server readiness polling; no port collision or leaked task-owned server was observed in this audit.

One standalone required-smoke run during overlapping browser work on the shared host failed with accessibility cancellations, a mobile server-start deadline, a home-card navigation timeout, and a hidden maintainer-import control. The same affected files passed isolated reruns after other browser work ended, and the complete required smoke suite passed in the full verification. I did not raise arbitrary timeouts or add retry logic. This audit did not run an artificial repeated-load stress loop because other verification jobs were using the host.

The completed standard verify took 733.89 seconds in the task worktree. The backend serial suite took 99.62 seconds; tool tests took 14.58 seconds; the 16 sequential browser file runs accounted for about 600 seconds of test-reported duration. I made no test-runtime optimization, so there is no before/after runtime claim. The required inventory now exercises three additional smoke files compared with the incomplete baseline inventory.

## Release-gate evidence map

Classification describes this audit's executable evidence, not release approval. “Strongly executable” means the behavior has a relevant automated path in the current environment; it does not satisfy other human or deployment evidence in the gate text.

| Release gate | Classification | Evidence and remaining gap |
| --- | --- | --- |
| 1. Public compatibility and generated output | Strongly executable for local artifacts | Route, sitemap, generated-boundary, structure, service-worker and browser route checks passed. Staging-origin isolation is outside the suite. |
| 2. 1.x regression coverage | Strongly executable locally | Catalogue validation, links, 446 serial backend tests, and 102 required browser tests passed. This is not CI or production evidence. |
| 3. Library state integrity | Strongly executable in Chromium | Real IndexedDB persistence, migration, blocked/versioned upgrades, malformed data, cross-tab behavior and failure recovery are exercised. No multi-browser/device matrix was run. |
| 4. Service-level import/export | Strongly executable at service layer | Schema, preview, merge/replace, conflict and storage failure paths run; file picker/download/cancellation UI is intentionally absent with the removed management page. |
| 5. Cleared-state and non-personalized behavior | Strongly executable locally | Unit and browser tests compare disabled/empty/cleared result identity, order and Hidden behavior. Browser proof is Chromium-only. |
| 6. Search, intent and discovery benchmark | Strongly executable for frozen cases; partial for editorial review | Golden, exact-title, hard-constraint, indexed/exhaustive and synthetic-scale tests pass. Expected editorial cases still need archive-maintainer review; full 25k candidate workloads are not a release pass. |
| 7. Recommendation explanations | Partial | Deterministic reason/evidence assertions and browser-visible result behavior pass. Human review of copy is represented by prior dated product QA, not recreated by this test audit. |
| 8. Privacy, storage and legal copy | Partial; legal review is manual | Analytics allowlist and URL redaction, Library context keys, local-only service boundaries and browser request absence have executable checks. No named legal reviewer decision was produced here. |
| 9. Accessibility, keyboard, mobile and motion | Partial | Automated accessibility semantics, keyboard/focus, reduced motion, responsive overflow and mobile flows ran in Chromium. A manual screen-reader spot check remains open. |
| 10. Performance and scale | Currently unsupported as a release decision | Synthetic/index parity tests and prior benchmark artifacts exist. There is still no approved product latency budget or measured full 10x/25k release workload. |
| 11. Service worker and offline behavior | Strongly executable for local worker flow; partial for lifecycle | Generated worker, cache version inputs, API bypass, cached visited pages and offline fallback are tested in a real browser. Staging update/rollback and separate-origin storage checks are absent. |
| 12. Staging, rollback and documentation parity | Partial automation; deployment evidence unsupported | Shell fixture tests simulate safety/readiness/rollback; no exact SHA was deployed to staging, no staging/production origin isolation was observed, and no production host/database restore was run. |
| 13. Product scope and visual footprint | Partial; visual comparison is manual | A 2026-09-29 dated desktop/mobile review exists and remains the current visual evidence. This audit created no new screenshot comparison or visual sign-off. |

There is no dedicated automated CSRF-token/origin-rejection contract in the reviewed maintainer auth path. The session cookie is configured `HttpOnly` and `SameSite=Lax`; this audit verified session authorization, but does not claim a cross-site form rejection test or a token-based CSRF mechanism.

## Full verification

Environment: macOS 26.5.1, Node v24.14.1, npm 11.11.0, Playwright 1.60.0 with managed Chromium headless-shell revision 1223.

- Task worktree `rtk npm run verify` — passed end-to-end in 733.89 seconds after the implementation fixes; the final assertion-only refinements are covered by the focused slice below and by the required combined integration verify.
- Focused post-audit unit slice, `rtk proxy node --test --test-concurrency=1 test/smoke-runner.test.js test/discovery-analytics.test.js test/similarity.test.js test/submissions.test.js` from `backend/` — 50 passed, 0 failed.
- Root tools suite — 154 tests: 149 passed, 0 failed, 5 skipped. Two skips require Linux/GNU production tooling; three require Restic, which was not installed.
- Catalogue/page generation and output gates — 752 shows, 54 collections; generated boundary preserved 170 generated and 32 authored HTML files; release artifact `ok: true`, 752 shows, 54 collections, 132 entities, 72 indexable entities, and no release-artifact warnings.
- Deterministic build — 1,552 generated files, SHA-256 `754efd84325bcd512aad9764955db2657132c1e1784f279d222532ca9c9fd1ad`.
- Backend data and links — 752 shows / 54 collections validated with zero integrity errors; public link checks passed for 18 pages, 752 shows, and 54 collections. Source-backed entity/role warnings remain non-blocking and were not changed as catalogue data work was outside scope.
- Backend serial suite — 446 passed, 0 failed, 0 skipped.
- Required Playwright suite — 16 smoke files, 102 passed, 0 failed, 0 skipped.
- `rtk proxy git diff --check` — passed.

## Files changed

- `backend/scripts/run-smoke-tests.js` — complete inventory discovery, validation, and working serial enumeration.
- `backend/server.js` — intended noindex maintainer shell allowlist.
- `backend/test/smoke-runner.test.js`, `backend/test/maintainer.test.js`, `backend/test/discovery-analytics.test.js`, `backend/test/similarity.test.js` — runner, route, privacy, moderation-mask, and recommendation-floor assertions.
- `backend/test/helpers/static-root.js` (new), `backend/test/helpers/browser-smoke.js`, `backend/test/community-routes.test.js`, `backend/test/listener-library-product.smoke.js`, `backend/test/public-routes.test.js`, `backend/test/rate-limit.test.js` — visible static-root alias for isolated fixtures.
- `docs/qa/2026-09-30-test-quality.md` — this report.

No authored catalogue data or generated public artifact was changed. No dependency was added.

## Remaining manual or unsupported claims

Legal/privacy conclusion and named reviewer approval; manual screen-reader review; actual staging deployment of an exact SHA; staging-versus-production origin isolation; rollback against staged Library data; production deployment and host/database restore; approved end-to-end performance budget and full 10x/25k workload; a fresh human visual comparison; and CI evidence remain unproven by this local test run. Keep the full 2.0 release open for the owners listed in `docs/2.0/RELEASE-GATES.md`.
