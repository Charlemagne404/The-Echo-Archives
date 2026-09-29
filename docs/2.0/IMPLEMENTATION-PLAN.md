# The Echo Archives 2.0 — Implementation plan

**Status:** Phases 1–7 are implemented on this worktree, including rich homepage search and opt-in Personal Discovery on existing search and Try Next surfaces. Full release QA remains open.<br>
**Baseline:** repository `main` at `55ca3969c850cabbc3c0159aae4e3c77da7e0410` (v1.2.7), reviewed 2026-09-28. See [BASELINE.md](BASELINE.md) for environment, exact commands/results, catalogue revision, browser availability, route families, privacy/service-worker boundaries, and baseline limits. Recheck the live branch/worktree before execution; preserve later or concurrent work.

## Delivery shape and dependencies

Keep the project’s generated static pages, authored catalogue, plain browser modules, and current backend. The central dependency path is:

```text
1 Foundation ──┬── 2 Library platform ── 3 Existing-surface controls ──┐
               └── 4 Discovery benchmark ── 5 retrieval/query ── 6 UI ── 7 personalization
                                                                    │
                                    8 maintainer workbench (conditional) ──┤
                                    9 hardening ──────────────────────────┤
                                    10 migration/release QA ◄─────────────┘
```

Phases 2–7 are complete on this worktree. Revised Phase 3 supersedes its original dedicated Library page implementation with compact controls on existing cards and show pages. Phase 7 consumes the sanitized Library service boundary and follows the Discovery retrieval result model. Phase 8 remains conditional on evidence of material maintenance friction and is not a current follow-on. Phase 9 still covers broader hardening; Phase 10 is serial release evidence.

For separate Codex sessions, give each phase an isolated worktree/branch and explicit file ownership. Do not ask parallel workers to edit `shared/archive-search.js`, `shared/archive-similarity.js`, `shared/app/discovery-history.js`, `tools/build-pages.js`, `site-src/partials/header.html`, or the same generated output. Prefer a new adapter/orchestrator module and small reviewed integration commits. Reconcile to the latest shared branch before opening an integration PR; generated files must come only from their generator.

## Phase 1 — 2.0 foundation — complete

**Scope/result:** Reconfirmed the v1.2.7 executable baseline, current package commands, generated-output and catalogue state, discovery/recommendation reports, test/browser behavior, public route families and aliases, service-worker behavior, analytics/privacy boundaries, and repeatable local full-catalogue report timings. Recorded evidence and limits in [BASELINE.md](BASELINE.md). Froze the Library storage/schema and privacy boundaries, import contract, discovery context, and initial public intent/URL shape in [ARCHITECTURE.md](ARCHITECTURE.md) and the [decision records](decisions/).

**Likely files:** `docs/2.0/*`, `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/OPERATIONS.md`, `data/schema.md`, `package.json`, `backend/package.json`, `tools/`, `site-src/page-manifest.json`, `shared/archive-search.js`, `shared/archive-similarity.js`, `shared/app/discovery-history.js` (inspect only to start).

**Prerequisites:** None beyond a clean, identified v1.2.x base and the product constraints in [PRODUCT.md](PRODUCT.md).

**Can run in parallel:** Phase 2 Library platform and Phase 4 discovery benchmark may now proceed independently with distinct file ownership/worktrees. They must follow the frozen service, storage, import/export, personal-context, and intent contracts. Phase 3 UI integration must use the Library service API and may proceed once that API is stable.

**Tests/gates:** Baseline checks and limitations are recorded in [BASELINE.md](BASELINE.md). All listed checks passed in the baseline run; five `test:tools` skips require Linux production-host tooling or Restic not present on this macOS host. Optional and required browser smoke both ran with Chromium and passed. `npm run verify` was not run because it rebuilds catalogue/pages; its relevant constituents were run directly.

**Migration risks:** Stale planning docs and dated QA counts can be mistaken for runtime truth; later 1.x commits may be in flight; measurements vary by browser, cache, and machine.

**Do not do yet:** Do not add catalogue fields, migrate a server database, create a user identity, or rewrite search/similarity. The IndexedDB choice is frozen; revisit it only if supported-browser evidence demonstrates a critical compatibility or integrity blocker.

## Phase 2 — Library platform — implemented

**Result:** The asynchronous service uses version-1 IndexedDB database `echo-archives-listener-library`, current entry fields `showId`, `state`, optional `rating`, optional `titleSnapshot`, `createdAt`, and `updatedAt`, and a separate settings store. The implementation provides typed failures, validation/recovery, atomic Merge/Replace/reset, and generic BroadcastChannel invalidation. `getPersonalContext()` exposes only `enabled` plus (when enabled) each entry’s `showId`, `state`, and optional explicit rating. Backup JSON contains entries and export metadata only; it never exports or changes the device-local Personal Discovery preference. No notes, event history, fallback store, or server persistence are used.

**Likely files:** New `shared/library/schema.js`, `storage.js`, `service.js` (or matching modules); focused `backend/test/library-*.test.js` or the repository’s established pure-module test location; root/backend package scripts only if an existing test-discovery pattern requires registration.

**Prerequisites:** Phase 1 freezes the state and export schemas, adapter, limits, and failure contract.

**Status:** Implemented and covered by real Chromium storage/API tests. Discovery benchmark and retrieval modules remain separately owned.

**Tests/gates:** Test each database migration edge; valid/invalid documents; malformed rows and newer database versions; unavailable/denied storage, blocked upgrades, quota and transaction failures; import/export roundtrip; Merge and Replace conflicts; explicit reset; same-tab sequencing and cross-tab invalidation. Verify atomicity: a failed or stale operation leaves the prior committed entries intact. Verify imports never change the device-local opt-in.

**Migration risks:** Browser origin scoping, browser eviction/manual clearing, schema corruption, simultaneous writes, and upgrades after a user has newer state. No 2.0 Library data exists at launch, but future releases must preserve forward compatibility.

**Boundary:** There is no server endpoint, SQLite table, account, sync, status-history log, or automatic migration from unrelated analytics/community keys. The service contract is consumed by Phase 3.

## Phase 3 — Compact Library integration on existing surfaces — revised and implemented

**Scope:** Integrate a small state/status control into shared show cards and a compact state/private-rating disclosure in the existing show-detail action area. Keep card controls outside full-card anchors. Support all five states and removal, show current state, announce storage failures, preserve focus, and synchronize same-page/cross-tab changes. Keep ordinary browsing functional when storage is unavailable and preserve the visible hierarchy and compact density of Echo 1.2.x.

**Revised result (2026-09-29):** Removed the dedicated `/library` route, page manifest entry, noindex/sitemap/analytics handling, navigation item, page-only controller modules, page stylesheet, management UI, and page-specific tests. Retained IndexedDB persistence, validation, timestamps, recovery/import/export service methods, sanitized Personal Discovery context, and lazy synchronization. Cards expose a tiny state affordance; show details keep state, private rating, and the opt-in checkbox inside the existing listening action disclosure. Import/export/recovery have no normal public UI.

**Likely files:** `shared/app/library/`, card/control styles, `shared/app/app.js`, generated-output configuration, service-worker hash inputs, and focused control/privacy tests. Removed page-only files are not future implementation targets. Generated output is rebuilt from authored sources and never hand-edited.

**Integration surfaces:** Pre-rendered and hydrated cards use a sibling control outside each full-card anchor. Shared cards cover home, collections, creator/entity results, and search/card variants. Show details place the control inside the existing listening action area. The service runtime loads lazily and does not block ordinary page initialization; surfaces subscribe to same-page and cross-tab invalidation.

**Status:** Implemented with keyboard, mobile, reduced-motion, storage-denial, same-page/cross-tab, reload persistence, Hidden-state browsing, and network-privacy browser coverage. Service tests cover import/export, reset, malformed rows, and recovery. Generated output is produced only by `npm run build:pages`.

**Tests/gates:** Prove that no generated/public `/library` route or nav item exists; retain service persistence/recovery checks; cover compact card/detail states, private rating only on detail, keyboard focus, mobile density, storage honesty, ordinary browsing, cross-tab updates, reload persistence, and absence of personal state in network/URL/generated HTML. Keep optional and required-browser commands distinct.

**Migration risks:** Shared card rendering affects home, collection, creator, search, and show surfaces; removing the page must not break the service or leave dead routes/assets; reducing visual footprint must preserve accessible state and private-data boundaries.

**Boundary:** Library actions are not server-backed; private ratings never become reviews/community votes; no personal state is shown on other users’ public surfaces or cached in the service worker.

## Phase 4 — Discovery benchmark — complete

**Scope:** Review and carry forward the versioned golden-query benchmark captured from the v1.2.7 catalogue in [discovery-benchmark/README.md](discovery-benchmark/README.md). Measure title/alias resolution, query interpretation, hard filter correctness, seed similarity, entity-role resolution, runtime uncertainty, sparse metadata, and explanation grounding. Keep current-v1 observations separate from draft 2.0 assertions; preserve expected sections and authored/computed distinctions. Identify unsupported phrase cases rather than forcing coverage.

**Likely files:** Existing `docs/2.0/discovery-benchmark/` corpus and target contract, the registered `tools/` report runner/tests, and narrowly scoped benchmark documentation. Reuse the immutable captured catalogue baseline; do not edit authored show records to make benchmark examples pass.

**Prerequisites:** Phase 1 current catalogue/report inventory and deterministic fixture policy. Needs current supported schema vocabulary, not the older 1.1 product snapshot.

**Can run in parallel:** Phases 2 and 3 after Phase 1, provided benchmark authors do not edit their service/UI modules. This is a good independent session with ownership of only benchmark fixtures and report tests.

**Tests/gates:** Expected IDs and order/reasons reviewed by archive maintainers; exact title and aliases beat taxonomy collisions; unsupported intents remain visible; missing fields never count as positive evidence; no fabricated facts. Report known coverage limitations alongside scores instead of reducing to a single opaque relevance metric. The captured v1 baseline has one known hard-constraint case, `similarity-white-vault-sci-fi`; retain it as a pre-existing defect until retrieval satisfies the v2 contract.

**Migration risks:** Benchmark leakage into implementation-specific scoring, current dataset drift, sparse imported entries being treated as failures, or one curated case encouraging show-specific exceptions.

**Do not do yet:** Do not tune weights to fit a handful of titles, bulk-enrich the catalogue, convert subjective phrases into unsupported scales, or use an LLM as expected-result authority.

## Phase 5 — Discovery 2.0 retrieval/query system — complete

**Result:** The deterministic typed parser and retrieval orchestrator are implemented in `shared/discovery/` over the existing archive search, similarity, entities, runtime, and collection evidence. It preserves identity precedence, hard/soft/avoid criteria, unresolved text, runtime qualifiers, and authored/computed result sections. The engine does not replace the 1.x search or similarity systems.

**Files:** `shared/discovery/query.js`, `index.js`, `runtime.js`, `url-state.js`, the benchmark corpus/contract/report, and focused Discovery tests. The existing engines remain the data and candidate adapters.

**Prerequisites:** Phase 4 benchmark and Phase 1 query schema/URL-state decisions; existing 1.x regression tests available as baseline.

**Can run in parallel:** Phase 8 workbench investigation/implementation may proceed on protected maintainer pages, reports, and tools, with no shared discovery modules. Phase 3 stabilization can continue independently.

**Tests/gates:** Benchmark acceptance, old search/similarity/entity/collection route tests, exact alias and query precedence, hard constraints, estimate/unknown handling, explicit entity-role correctness, authored-first result ordering and separate fallback sections, deterministic repeatability. Track the known v1 `similarity-white-vault-sci-fi` failure against the captured baseline so its eventual correction is not mistaken for a newly introduced regression.

**Migration risks:** Duplicate ranking logic, incompatible search result ordering, mis-parsing a title as a filter, changing current URL meaning, leaking implementation-specific scores into public explanations.

**Do not do yet:** Do not delete current engines or routes, introduce free-form AI, auto-relax hard constraints, build a vector database, or infer entity links from shared credits.

## Phase 6 — Discovery 2.0 UI integration — complete

**Result:** Integrated recognized rich queries into homepage search through `shared/app/pages/home/discovery.js`. Exact-title, simple-text, and bounded-typo searches retain the fast existing scorer; recognized rich intent uses one lazily constructed Discovery engine. Existing direct filters, compact show cards, creator links, collection routes, results summary, URL controller, and history restoration remain in use. The summary receives a brief inline note for interpreted criteria, runtime qualifiers, ambiguity, or unsupported phrases. No query-builder surface or per-query chips were added.

**Files:** `shared/app/pages/home/`, the home controller and search cache, existing browse summary styling, Discovery URL codec integration, the generated `data/runtime-evidence.json` projection, its build/server route, and `backend/test/discovery-stability.smoke.js`. The frozen `data/search-index.json` input was left unchanged.

**Prerequisites:** Phase 5 query and retrieval contracts; local Library state remains out of URLs and ordinary public browsing.

**Can run in parallel:** Independent accessibility/performance audit preparation under Phase 9 can start once markup prototypes settle. Phase 8 remains separate.

**Tests/gates:** Browser coverage checks simple-search fallback, required and avoided criteria, authored-before-computed similarity, creator links, runtime evidence, collection routing, unresolved and ambiguous wording, strict no-match, private-intent URL omission, Back/Forward with scroll restoration, and compact mobile cards. The required Chromium suite and full verification remain release evidence and are recorded separately from staging/deployment sign-off.

**Migration risks:** Historical query URLs, old filters, collection and Shows Like routes, browser history semantics, and the intentionally dense browse layout.

**Do not do yet:** Do not hide filter controls behind natural language, change collection editorial membership, merge authored/computed results, or place Library status in public URL state.

## Phase 7 — Personal Discovery — implemented

**Implemented result (2026-09-29):** A minimal sanitized context reaches a separate deterministic personalization helper only while the device-local opt-in is on. The checkbox lives inside the existing show-detail Library disclosure and defaults off. The homepage applies the helper after query and direct-filter eligibility; the existing show-page Try Next integration applies it to computed recommendations while preserving authored picks and provenance. No new route, navigation item, page section, or dashboard was added.

**Behavior:** Saved and Listening are weak positive anchors only without an explicit rating. Ratings 5/4 are positive, 3 neutral, and 2/1 negative. Finished is never positive and is excluded only in the supported `new-to-you` scope, which has no current public surface. Dropped suppresses only the exact show in recommendation scopes and does not generalize; Hidden suppresses only the exact show while enabled. Direct title identity and direct routes remain available. Search and Try Next adjust only eligible `shows` and computed-similarity candidates, by at most three positions; authored recommendations, hard constraints, exclusions, duplicate protection, and similarity evidence gates stay authoritative. Reasons name the specific public dimensions and the explicit Library signal; no score is shown. Off, unavailable, disabled, or cleared contexts restore exact public order and visibility.

**Data/performance boundary:** The homepage uses the generated search index for ordinary retrieval and the separate public `runtime-evidence.json` projection to complete the in-memory similarity metadata used by Personal Discovery. The search index and frozen v1 golden baseline are not rewritten. Bounded caches contain derivable public comparisons only; no personal context or personalized result is persisted.

**Files:** `shared/app/discovery-personalization.js`, `shared/app/library/runtime.js`, `shared/app/library/integration.js`, homepage search cache/results/controller, generated runtime-evidence projection, pure tests, browser product tests, and `tools/benchmark-personal-discovery.js`.

**Prerequisites:** Phases 2 and 5 complete; Phase 6 defines how optional personal results fit existing sections; benchmark includes disabled/cleared parity cases.

**Can run in parallel:** Isolated reason-copy/accessibility review can happen once the reason object schema is frozen. Phase 8 can still proceed separately.

**Tests/gates:** Ten deterministic personalization tests pass. Required-browser product coverage checks opt-in, ratings, Hidden/direct-title behavior, exact disabled and cleared parity, cross-tab changes, reload, request privacy, keyboard use, and narrow mobile layout. `benchmark:personal-discovery` records enabled/disabled latency for 1, 5, and 20 Library entries. Full verification and residual release gates are recorded in [RELEASE-GATES.md](RELEASE-GATES.md).

**Migration risks:** Treating Finished as positive, Dropped/Hidden as broad dislike, exposing private anchors in logs/DOM or external links, or allowing a score to bypass sparse-evidence rules.

**Do not do yet:** Do not train/retain taste profiles, personalize without opt-in, send library data to an API/LLM, infer preferences from clicks, or change the ordinary baseline when personalization is disabled.

## Phase 8 — Maintainer/workbench improvements

**Scope:** Improve only evidenced cross-surface catalogue-maintenance friction. Candidate work is a small navigable workbench linking existing submission/moderation, import/elevation, collection, entity-attribution, recommendation-coverage, and validation reports with shared context. Keep every write behind current protected routes and explicit moderation. Do this phase only if Phase 1 identifies repeated real maintenance tasks that current pages/tools make materially harder.

**Likely files:** `site-src/pages/maintainer-*.html`, `backend/lib/` protected maintainer routes, `tools/` report CLI, existing maintainer tests and docs. Keep it out of listener query/library modules.

**Prerequisites:** Evidence from current operations and an explicit narrow workbench scope; existing auth and moderation contracts remain in force.

**Can run in parallel:** Only after the prerequisites and narrow scope above are accepted, it can use a separate worktree in parallel with Phases 2–7 and exclusive ownership of maintainer/backend/report paths. It is not authorized by completion of Phase 1 alone. Coordinate at integration review.

**Tests/gates:** Existing authorization, CSRF/rate, moderation, import/elevation, collection, and audit tests; explicit non-public and non-auto-publish behavior; maintainer-only analytics/report access.

**Migration risks:** Broadening auth scope, accidental write paths, operational SQLite migration needs, duplicated reports or queue state, and concurrent test flakes that obscure real failures.

**Do not do yet:** Do not replace the source of truth with a CMS, rewrite moderation, publish submissions automatically, or include this phase in 2.0 if the evidence does not justify it.

## Phase 9 — Accessibility, performance, and scale hardening

**Scope:** Audit the integrated product for mobile usability, keyboard operation, accessible names and status changes, contrast, focus management, reduced motion, dense-card layout, and resilient storage errors. Compare discovery/data-loading performance with Phase 1. Add synthetic large-catalogue stress coverage and improve indexing/paging only at demonstrated hot paths.

**Likely files:** Source CSS and page partials; `shared/app/` Library/discovery renderers; service/query adapter only if measured; `backend/test/` browser/responsive/scale tests; `tools/` benchmark scripts. No generated output edits.

**Prerequisites:** Phases 3, 6, and 7 behavior and DOM contracts are stable enough to audit; Phase 1 baseline exists.

**Can run in parallel:** Accessibility, perf profiling, and synthetic fixture work can be separate subtracks after UI freeze, with reports and fixes assigned to non-overlapping modules. Final integration must be serial.

**Tests/gates:** Keyboard-only journeys, screen-reader-visible state, mobile breakpoints, reduced-motion preference, no horizontal overflow at supported widths, storage failure and offline flows, required-browser interaction; same-environment performance comparison; synthetic catalogue at 10x current published count (update the factor if Phase 1 shows that is either trivial or impractical).

**Migration risks:** Optimizing away exact alias behavior or reason clarity, making card density worse, introducing stale caches, and overfitting synthetic scale at the cost of real catalogue correctness.

**Do not do yet:** Do not set arbitrary millisecond/percentage budgets before baseline; do not add a new search engine or cache layer without profiling evidence.

## Phase 10 — Migration and release QA

**Scope:** Freeze and test all Library schema migrations/export compatibility, public route and 1.x regression coverage, generated-site artifacts, service-worker behavior, privacy/legal wording, deployment staging, same-origin browser storage, release/rollback instructions, and documentation parity. Publish no behavior until all gates in [RELEASE-GATES.md](RELEASE-GATES.md) have evidence and an owner.

**Likely files:** `docs/2.0/RELEASE-GATES.md`, `docs/OPERATIONS.md`, `docs/PRODUCT.md`, `docs/ANALYTICS.md`, `site-src/pages/privacy.html`, `cookies.html`, package scripts/workflows only where existing release commands require integration, schema migration fixtures, deploy release workflow docs.

**Prerequisites:** Phases 1–9 accepted or explicitly scoped out; no unresolved data/privacy semantics; production rollback decision recorded.

**Can run in parallel:** Documentation parity, isolated browser compatibility matrix, and staging deployment rehearsal can be prepared concurrently. The release go/no-go review, required suite, final artifact generation, and production/rollback decision are serial.

**Tests/gates:** Complete release gate checklist with artifacts and measured baseline comparison; required browser mode must fail closed if unavailable; full existing release verification and focused new tests; staged same-origin storage test; restore previous code and prove compatible Library behavior; document post-release verification. Do not treat a passed syntax/focused check as full release evidence.

**Migration risks:** Browser local data survives code rollback and remains origin-scoped; service worker can continue serving cached code; server SQLite rollback does not reverse migrations; user backups may span released schema versions. Keep Library changes entirely client-side unless a separate reviewed need appears.

**Do not do yet:** Do not launch on an optional-browser skip, silently reset unsupported state, add a server database migration as a substitute for local-state recovery, or claim success without staging/rollback evidence.

## Recommended next implementation work

Phases 1–7 are implemented on this worktree. Complete the still-open staging, rollback, legal-copy, deployment, and full 2.0 release gates before release. Phase 8 remains conditional and is not part of this implementation.
