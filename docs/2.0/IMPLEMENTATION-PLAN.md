# The Echo Archives 2.0 — Implementation plan

**Status:** Phases 1–3 are implemented on this worktree. Discovery 2.0 query/retrieval remains separate in-flight work; full release QA is still open.<br>
**Baseline:** repository `main` at `55ca3969c850cabbc3c0159aae4e3c77da7e0410` (v1.2.7), reviewed 2026-09-28. See [BASELINE.md](BASELINE.md) for environment, exact commands/results, catalogue revision, browser availability, route families, privacy/service-worker boundaries, and baseline limits. Recheck the live branch/worktree before execution; preserve later or concurrent work.

## Delivery shape and dependencies

Keep the project’s generated static pages, authored catalogue, plain browser modules, and current backend. The central dependency path is:

```text
1 Foundation ──┬── 2 Library platform ── 3 Library site integration ──┐
               └── 4 Discovery benchmark ── 5 retrieval/query ── 6 UI ── 7 personalization
                                                                    │
                                    8 maintainer workbench (conditional) ──┤
                                    9 hardening ──────────────────────────┤
                                    10 migration/release QA ◄─────────────┘
```

Phases 2 and 3 are complete on this worktree. Their ownership remains separate from the Discovery benchmark/query/retrieval work in flight. Phase 5 needs the benchmark’s vocabulary and reviewed expected results; Phase 6 needs Phase 5’s query/API contract; Phase 7 needs both the Library service and retrieval result model. Phase 8 remains conditional on evidence of material maintenance friction and is not a current follow-on. Phase 9 still covers broader Discovery hardening; Library accessibility and responsive checks are included in the completed Phase 3 work. Phase 10 is serial release evidence.

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

## Phase 3 — Library site integration — implemented

**Result:** Added a generated `/library` noindex shell and responsive local Library UI with all five states, All Library, local search, updated/added/title sorting, unresolved exact IDs, private 1–5 rating, removal, entry-only backup, validated import preview, Merge/confirmed Replace, and raw malformed-row recovery export. The setting is labeled “Use my Library in discovery,” defaults off, and says Discovery integration is not active yet. The route has no personal generated payload or Library analytics and provides a useful no-JavaScript explanation.

**Likely files:** `site-src/pages/library.html` (or source naming convention), `site-src/page-manifest.json`, `site-src/partials/header.html`, source CSS partials, `shared/app/app.js`, `shared/app/` library/card/show-page modules, `shared/app/discovery-analytics.js` only to verify/exclude—not to add Library events—and focused UI smoke tests. Generated root `library/index.html`, `script.js`, CSS, and `sw.js` are outputs, never hand-edited.

**Integration surfaces:** Pre-rendered and hydrated show cards use a sibling control outside each full-card anchor. Shared card rendering covers the homepage, collections, creator/entity cards, and search/card variants; show-detail primary listen actions remain first, with a larger Library control after them. Relationship cards receive compact controls. The service runtime loads lazily and does not block ordinary page initialization; all surfaces subscribe to local and cross-tab invalidation.

**Status:** Implemented with keyboard, mobile, reduced-motion, storage-denial, unknown-ID, import/export, and network-privacy browser coverage. Generated output is produced only by `npm run build:pages`.

**Tests/gates:** Generated-route/noindex/sitemap assertions; service integration and storage-denial browser flows; all card/detail states; keyboard interaction, focus, mobile density, empty/unresolved states; page has no Analytics inclusion and emits no state-bearing network request. Keep optional and required-browser commands distinct.

**Migration risks:** Shared card rendering affects home, collection, creator, search, and show surfaces; a new route may accidentally be indexed or included in analytics; no-script and small-screen behavior can degrade unnoticed.

**Boundary:** Library actions are not server-backed; private ratings never become reviews/community votes; no personal state is shown on other users’ public surfaces or cached in the service worker.

## Phase 4 — Discovery benchmark

**Scope:** Review and carry forward the versioned golden-query benchmark captured from the v1.2.7 catalogue in [discovery-benchmark/README.md](discovery-benchmark/README.md). Measure title/alias resolution, query interpretation, hard filter correctness, seed similarity, entity-role resolution, runtime uncertainty, sparse metadata, and explanation grounding. Keep current-v1 observations separate from draft 2.0 assertions; preserve expected sections and authored/computed distinctions. Identify unsupported phrase cases rather than forcing coverage.

**Likely files:** Existing `docs/2.0/discovery-benchmark/` corpus and target contract, the registered `tools/` report runner/tests, and narrowly scoped benchmark documentation. Reuse the immutable captured catalogue baseline; do not edit authored show records to make benchmark examples pass.

**Prerequisites:** Phase 1 current catalogue/report inventory and deterministic fixture policy. Needs current supported schema vocabulary, not the older 1.1 product snapshot.

**Can run in parallel:** Phases 2 and 3 after Phase 1, provided benchmark authors do not edit their service/UI modules. This is a good independent session with ownership of only benchmark fixtures and report tests.

**Tests/gates:** Expected IDs and order/reasons reviewed by archive maintainers; exact title and aliases beat taxonomy collisions; unsupported intents remain visible; missing fields never count as positive evidence; no fabricated facts. Report known coverage limitations alongside scores instead of reducing to a single opaque relevance metric. The captured v1 baseline has one known hard-constraint case, `similarity-white-vault-sci-fi`; retain it as a pre-existing defect until retrieval satisfies the v2 contract.

**Migration risks:** Benchmark leakage into implementation-specific scoring, current dataset drift, sparse imported entries being treated as failures, or one curated case encouraging show-specific exceptions.

**Do not do yet:** Do not tune weights to fit a handful of titles, bulk-enrich the catalogue, convert subjective phrases into unsupported scales, or use an LLM as expected-result authority.

## Phase 5 — Discovery 2.0 retrieval/query system

**Scope:** Introduce a typed query representation and deterministic parser for benchmark-supported intent; compose exact search, structured filters, seed similarity, explicit entity roles, and authored collection/show routes. Track hard requirements, soft preferences, avoid criteria, unresolved language, and match provenance. Maintain identity precedence and visible unknown metadata. This is orchestration over 1.x systems, not a replacement ranker.

**Likely files:** New `shared/discovery/query.js`, `retrieve.js`, normalizers or taxonomy map; focused unit tests and benchmark report; integration points to `shared/archive-search.js`, `archive-similarity.js`, `archive-entities.js` should be small and isolated. Avoid broad edits to those shared engines until a concrete gap is shown.

**Prerequisites:** Phase 4 benchmark and Phase 1 query schema/URL-state decisions; existing 1.x regression tests available as baseline.

**Can run in parallel:** Phase 8 workbench investigation/implementation may proceed on protected maintainer pages, reports, and tools, with no shared discovery modules. Phase 3 stabilization can continue independently.

**Tests/gates:** Benchmark acceptance, old search/similarity/entity/collection route tests, exact alias and query precedence, hard constraints, estimate/unknown handling, explicit entity-role correctness, authored-first result ordering and separate fallback sections, deterministic repeatability. Track the known v1 `similarity-white-vault-sci-fi` failure against the captured baseline so its eventual correction is not mistaken for a newly introduced regression.

**Migration risks:** Duplicate ranking logic, incompatible search result ordering, mis-parsing a title as a filter, changing current URL meaning, leaking implementation-specific scores into public explanations.

**Do not do yet:** Do not delete current engines or routes, introduce free-form AI, auto-relax hard constraints, build a vector database, or infer entity links from shared credits.

## Phase 6 — Discovery 2.0 UI integration

**Scope:** Make the typed query inspectable and editable in existing browse/search/collection/creator/show routes. Add only supported controls and criterion chips; retain direct structured filters. Extend URLs only with public, allowlisted state and preserve current Back/Forward rendering, scroll, and query-key compatibility. Explain unsupported phrases and evidence gaps with useful correction paths.

**Likely files:** Existing `site-src/pages/` and partials where needed; `shared/app/` home, collection, entity/creator, show-page and history modules; new discovery UI module/CSS partial; page manifests; route/history and browser smoke tests. `shared/app/discovery-history.js` is an integration seam and should be changed narrowly.

**Prerequisites:** Phase 5 query and retrieval contracts; Library route must already keep its private state out of URLs.

**Can run in parallel:** Independent accessibility/performance audit preparation under Phase 9 can start once markup prototypes settle. Phase 8 remains separate.

**Tests/gates:** Existing URL tests and actual popstate UI restoration; public URL roundtrip; alias/title precedence; filter AND/OR behavior; empty/sparse states; small viewport/keyboard/zoom; generated page and alias checks; no private state in URL/title/referrer/HTML.

**Migration risks:** Historical query URLs, old filters, collection and Shows Like routes, browser history semantics, and the intentionally dense browse layout.

**Do not do yet:** Do not hide filter controls behind natural language, change collection editorial membership, merge authored/computed results, or place Library status in public URL state.

## Phase 7 — Personal Discovery

**Scope:** Pass a minimal immutable Library signal snapshot into a separate deterministic personalization layer after public candidates pass query/evidence gates. Support explicit opt-in, exact-show lifecycle suppression, limited positive/negative rating signals, weak Saved/Listening anchors, grounded reasons, pause, clear-to-baseline, and explanation links to the anchor.

**Likely files:** `shared/discovery/personalize.js`, `shared/library/service.js` read API, page controllers, show-card/show-page recommendation renderers, reason-copy module, focused pure and browser tests. Do not add private fields to `archive-search.js` data or public catalog records.

**Prerequisites:** Phases 2 and 5 complete; Phase 6 defines how optional personal results fit existing sections; benchmark includes disabled/cleared parity cases.

**Can run in parallel:** Isolated reason-copy/accessibility review can happen once the reason object schema is frozen. Phase 8 can still proceed separately.

**Tests/gates:** Off/cleared exact candidate, section, ordering, and Hidden-show visibility parity with ordinary discovery; explicit opt-in only; exact status semantics; only explicitly entered ratings may influence results; explainability for every order change; hard query gates cannot be overridden; no personal data in analytics, requests, URLs, generated output, or service worker.

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

Phases 1–3 are implemented on this worktree. Continue the separately owned Discovery benchmark/query/retrieval work, then integrate Personal Discovery through `getPersonalContext()` only after its result contract is reviewed. Complete the still-open staging, rollback, legal-copy, and full 2.0 release gates before release. Phase 8 remains conditional and is not part of this implementation.
