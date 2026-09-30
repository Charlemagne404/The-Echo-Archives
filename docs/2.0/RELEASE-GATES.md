# The Echo Archives 2.0 — Release gates

**Status:** The current shared worktree passed `rtk npm run verify` with exit 0: 150 runnable tools tests, 444 backend serial tests, and 97 required Chromium smoke tests passed; 5 tools tests were skipped for unavailable Linux/GNU/Restic prerequisites. A separate Library product smoke overlapped part of the browser phase, and no aggregate assertion failed. The runtime-only projection failure now has explicit browser coverage. The worktree still has no clean immutable candidate SHA. Release remains blocked pending exact-SHA verification on the supported runtime, external staging and rollback, named product/privacy/legal review, and release-owner sign-off.<br>
**Baseline:** executable v1.2.7 baseline is recorded in [BASELINE.md](BASELINE.md) at `55ca3969c850cabbc3c0159aae4e3c77da7e0410` (2026-09-28), including actual commands and results. Refresh it if the implementation branch differs materially or the release baseline has advanced.<br>
**Rule:** every gate has an artifact, environment, result, and owner. A skipped required browser run is not a pass. A dated QA report is not evidence of current behavior.

## Gate record

The release record must include the candidate commit, generated-output state, exact commands, Node/browser versions, browser/device and cache profile for visual/performance results, links to reports, skipped checks, known limitations, and a named reviewer for product/privacy decisions. Run expensive aggregate verification deliberately at release-candidate stage, not after every small edit. Existing current checks—not invented commands—are the source of executable validation.

## Candidate evidence — 2026-09-29–30

The [dated QA report](../qa/2026-09-30-2.0-release-candidate.md) records the dirty worktree identity, environment, full 10× measurements, privacy checks, migrations/recovery, baseline parity, service-worker/offline result, disposable local staging, rollback, documentation parity, and exact worktree paths. It distinguishes local loopback evidence from deployment and production evidence.

**Environment:** macOS 26.5.1 (Apple Silicon; Darwin 25.5.0), Node 24.14.1, npm 11.11.0, Playwright 1.60.0, managed Chromium revision 1223.

- The latest full aggregate exited 0. Root structure/generated-output/release-artifact checks, deterministic build, data/link checks, 150/150 runnable tools tests (5 skipped), 444/444 backend serial tests, and 97/97 required Chromium smoke tests passed. The new runtime-projection degradation case passed as part of the smoke suite. An independent Library product smoke overlapped part of the browser phase; its role and effect on timings are noted in the candidate QA report. Earlier offline-homepage and community-rating setup flakes, plus the interrupted serial run, remain documented there as contention-sensitive attempts.
- The 5 tools-suite skips require Linux/GNU production tooling or Restic unavailable on this macOS host. They remain skipped, not passed.
- `validate:data` reported 0 errors across 752 shows, 47 source collections, 132 entities, and 7 review companions. Source-backed relationship warnings remain for owner review. `check:release-artifact` passed with 752 shows, 54 runtime collections, 752 search records, 132 entities, and no release-artifact warnings.
- The required-browser suite passed 97 tests on managed Chromium revision 1223, including offline behavior and the runtime-projection regression. Browser evidence does not include Firefox, WebKit, physical devices, or screen-reader testing.
- Disposable local staging passed 272 checks with 0 errors; local app/state rollback preserved the isolated IndexedDB state and SQLite sentinel. These results do not establish external staging or production deployment/restore.
- The screenshot review and visible-surface comparison are recorded in the [homepage integration QA report](../qa/2026-09-29-discovery-homepage-integration.md); the release-candidate report records the more recent privacy, scale, and release checks.

## 1. Public compatibility and generated output

- **Routes:** all current canonical public routes, legacy aliases/redirects, noindex aliases, show detail pages, collections, creator pages, Shows Like routes, legal pages, submission pages, and current query parameter meanings resolve as before. There is no `/library` route or `/library.html` alias; the removed destination is absent from the manifest, generated output, and navigation.
- **History:** current query/filter/sort/seed URL behavior remains compatible. Back/Forward restores actual rendered inputs, results, summary, empty state, and scroll; browser history never contains Library status, private rating, or Personal Discovery setting.
- **Generated site:** authored source rebuilds successfully. Generated pages, page manifest routes, sitemap, robots, search index, CSS/JS output, aliases, and service worker are mutually consistent. Library state remains browser-local and absent from generated HTML; only static assets are cached. No hand-edited generated root artifact or personal state appears in a generated file.
- **Indexing and analytics:** no Library route exists to index or exclude. Library actions emit no Library-specific event and attach no Library state to existing analytics. The build and route checks prove there is no generated route, navigation entry, sitemap location, or page stylesheet.
- **Server/API compatibility:** current public API and protected maintainer route contracts have no unintended changes. No Library endpoint, personal-profile table, or data-bearing request is introduced.

**Pass evidence:** public-route, site-structure, sitemap, generated-output, and service-worker tests from the current package scripts; inspected route and generated-output report attached to the release record.

## 2. 1.x regression coverage

- Run current catalogue validation, link checks, focused backend tests, generated-site checks, and required-browser smoke suite using their actual package scripts.
- Cover title/alias ranking, creator identity, typo handling, empty/stop-word queries, filters, card rendering, authored collection membership, entity links, Shows Like and Try Next separation, similarity evidence/fit/duplicate exclusions, moderation/import/maintainer authorization, community ratings/reviews, submissions, analytics allowlist, and existing offline behavior.
- Existing aggregate failure is investigated against a fresh serial baseline. Concurrency-sensitive failures are reproduced and classified; neither ignored nor automatically called a 2.0 regression without evidence.
- Browser-required tests must fail closed when the browser is unavailable. Optional browser skips are reported as skipped and cannot satisfy release gates.

**Pass evidence:** test report records pass/fail/skip by suite; all required suites pass or have a reviewed, explicitly waived non-release-blocking issue. Any approved waiver names impact, owner, and follow-up.

## 3. Library state integrity

- Use the origin-scoped `echo-archives-listener-library` IndexedDB database, version 1, independently versioned from the export document. Store one current-state record per show ID plus a device-local Personal Discovery setting. Entry fields are limited to `showId`, `state` (`saved`, `listening`, `finished`, `dropped`, or `hidden`), optional explicitly entered private integer `rating` 1–5, optional `titleSnapshot`, and current-record `createdAt`/`updatedAt` timestamps. Timestamps are not event history. Do not store notes, arbitrary metadata, status history, recently viewed shows, or listening progress.
- Every shipped database version has deterministic migration fixtures from its immediately preceding released version. Migrations run in an IndexedDB `versionchange` transaction; failure aborts without replacing valid data. Unsupported newer database versions remain untouched.
- Every Library write uses a read/write transaction. Exercise one-show edits, full import, and reset for atomicity. Malformed rows, unavailable/denied IndexedDB, blocked upgrades, quota/write/transaction failure, browser restart, and tab refresh produce explicit honest outcomes. A failure never becomes an empty Library, a partial write, a localStorage fallback, or a server save.
- Exercise same-tab sequencing and two-tab edits. Post-commit cross-tab notification carries only a generic invalidation; receiving tabs reread through the service. The current implementation reports when BroadcastChannel is unavailable and does not promise cross-tab immediate updates in that case.
- Reset removes Library entries and sets Personal Discovery off atomically. It does not claim to clear separate analytics, community identity, chat, browser, or operating-system data.
- Removed/unknown show IDs survive read, export, import, restart, and migration. Never remap by title or alias. Unresolved title labels are not catalogue facts.

**Pass evidence:** schema and recovery tests, adapter failure tests, supported-browser storage test, and a documented migration matrix with before/after fixtures.

## 4. Service-level import/export

Import/export remain local service operations; there is no public Library management or transfer page.

- A versioned export imports into an empty library with the same entry IDs, statuses, optional private ratings, and unresolved-show title labels. Export includes no Personal Discovery setting; import preserves the device’s current opt-in for both modes.
- Import always validates and previews the entire document before writing. Preview discloses mode, counts, unresolved IDs, and same-ID conflicts. **Merge** preserves local-only records; each imported same-ID record replaces that local record in full. **Replace** makes the validated imported records the complete Library after explicit confirmation. Unknown IDs remain intact; no title/alias remapping occurs.
- Commit-time conflicts are recalculated from the current Library inside the write transaction. Invalid files, invalid fields, unsupported versions, cancellation, or failed storage transactions change nothing; no partial import is allowed. Personal Discovery opt-in is not backup content and is never altered by either mode.
- No import is uploaded or included in analytics, requests, URL state, logs, or error reporting. The format is documented and carries an export schema version independent of IndexedDB database version. Backup JSON is readable plaintext and may contain private ratings and title labels.

**Pass evidence:** roundtrip fixtures including empty, sparse, unknown-ID, conflict, malformed, and older-version files; browser download/selection and cancellation flow.

## 5. Cleared-state and non-personalized behavior

- With Personal Discovery off or unavailable, the public candidate IDs, section membership, ordering, and Hidden-show visibility exactly match the ordinary non-personalized path for the same public query. The Library remains usable while personalization is off.
- Removing the final Library entry returns the search tab to that same baseline with no stale in-memory preference or cached reason. Browser coverage verifies disable, clear, reload, and cross-tab synchronization.
- Pausing Personal Discovery preserves Library entries and ratings while returning exact ordinary ordering and visibility. Re-enabling requires an explicit user action and uses current catalogue evidence.
- Only a private rating explicitly entered by the listener may affect personalization: 4–5 can be positive anchors, 1–2 negative anchors, and 3 is neutral. Archive Rating, Community Rating, passive behavior, or inferred values never substitute. Saved/Listening may be weak anchors; Finished is not a positive preference. Dropped and Hidden do not generalize to similar titles. When enabled, Hidden suppresses only its exact show from personalized discovery. Direct show routes remain accessible, and catalogue truth is unchanged.
- Exact implementation weights are 5:+3, 4:+2, 3:0, 2:-2, and 1:-3. Saved/Listening contribute +1 only when no explicit rating exists; a low explicit rating is independent evidence. Finished is never positive. Dropped suppresses its exact show only in recommendation scopes and is not itself a negative anchor; Hidden suppresses its exact show in enabled personal contexts, while explicit exact-title lookup and direct routes remain available.
- Library controls never change state from passive viewing, playback-link opening, a public rating, or an archive rating.

**Worktree evidence:** `tools/test/discovery-personalization.test.js` compares exact result objects for off/empty contexts and covers hard constraints/exclusions. `backend/test/listener-library-product.smoke.js` verifies ordered IDs and public position buckets after disable, exact Hidden visibility, clear, reload, and a second tab.

## 6. Search, intent, and discovery benchmark

- All reviewed exact-title and alias fixtures resolve the intended show despite punctuation, Unicode normalization, common words, taxonomy overlap, and body-text matches. Existing title/alias correctness remains at least as strong as the captured v1.2.7 baseline.
- Every hard filter excludes candidates missing or contradicting required evidence. Soft preferences rank known matches ahead of unknown where the query calls for it; unknown values are never fabricated or treated as evidence. Estimated runtime retains its qualifier. A target like “around 10 hours” is not displayed as exact runtime.
- “Finished shows” (catalogue lifecycle) and “shows I’ve finished” (local-only intent) are distinguished; the homepage explains when a request needs private listening history and omits its query text from a shareable URL. The Discovery engine does not read Library state; the page-level personalizer receives only sanitized local context after public retrieval and filters.
- Supported rich phrases have reviewed interpretation and expected results. The homepage reports interpreted criteria, short taxonomy ambiguities, and unsupported phrases in its existing results summary; it does not add a query-builder surface or silently convert unsupported phrases into fields.
- Seed and “like X” results retain existing identity exclusions, fit rules, evidence threshold, deterministic diversity, and authored/computed distinction. Typed creator/entity intent resolves only explicit source-backed roles; co-occurrence is never treated as an affiliation.
- The captured v1 benchmark contains the known `similarity-white-vault-sci-fi` failure: “something like The White Vault but sci-fi” admits `the-harrowing` without sci-fi evidence. Record it as pre-existing baseline behavior; the v2 hard-constraint gate passes only when the result no longer violates the explicit sci-fi requirement.
- Benchmark includes current catalogue examples, sparse factual-only records, no-match cases, duplicate provider identities, common/rare metadata, tone/performance conflicts, runtime unknowns, alias collisions, and adversarial title/taxonomy overlap. Expected output and reason evidence are reviewed by an archive maintainer. A single aggregate relevance score cannot waive a failing critical case.
- Candidate relevance changes are compared with the recorded baseline. No threshold or weight is changed solely to make sparse records appear covered.

**Worktree evidence:** the existing Discovery golden benchmark remains frozen and passes independently; Personal Discovery has separate deterministic tests and browser coverage. See the 2026-09-29 Personal Discovery QA report for exact commands and limits.

## 7. Recommendation explanations

- Every personal ordering change has an understandable reason tied to a specific local signal and current catalogue evidence. The explanation identifies the anchor show and the shared/contrasting dimensions used.
- Reasons correspond to actual score components and are stable/deterministic. No generic “because you like this” copy without the signal and evidence.
- Personal signals cannot override a hard query constraint, similarity evidence minimum, authored/computed relationship labels, or show identity exclusion.
- No explanation claims runtime, status, creator role, tone, or relationship facts absent from current catalogue evidence.
- If the system cannot produce an accurate explanation for an adjustment, it makes no such adjustment. The homepage exposes a compact, non-live result note only when a visible eligible candidate actually moved; it names shared public dimensions and the anchor.

**Pass evidence:** structured-reason unit assertions and rendered-copy review for positive, negative, unknown, sparse, and no-personal-signal cases.

**Worktree evidence:** ten deterministic unit tests and the required Chromium homepage flow pass. The flow checks grounded reason copy, visible result order, title-search visibility for a Hidden show, private request-data absence, and exact baseline order/position buckets after disabling or clearing. See [Personal Discovery QA](../qa/2026-09-29-personal-discovery.md).

## 8. Privacy, storage, and legal copy

- Confirm by code and browser network inspection that Library IDs/statuses/private ratings, import contents, opt-in state, anchors, and personal reasons do not leave the browser through APIs, analytics, chat, submission, URL, referrer, telemetry, or error logs. The sanitized `getPersonalContext()` boundary contains only `enabled` and, when enabled, entries with `showId`, `state`, and optional explicit `rating`; the page-level ranking runs locally and does not write personal state to its public retrieval cache.
- Confirm there is no Library-specific event, hidden seed, title, status, or rating in allowlisted analytics payloads or data exports. Existing unrelated allowlisted aggregate analytics remain unchanged and do not carry Library state.
- Confirm Library data is absent from generated catalogue/static route output, sitemap, service-worker caches, server SQLite, and public links. Any live DOM state exists only in the listener’s current browser view and is not exported into static output or requests. The service-worker cache version includes hashes for the imported `shared/library/` and `shared/app/library/` modules; removed page-only modules and stylesheet are not shipped or hashed. Database contents never enter worker caches.
- Verify third-party scripts or image/link requests receive no Library data in query parameters or referrers. Render any unresolved-show title as text, never executable HTML.
- Update Privacy and Cookies pages to name the local storage purpose, controls, clearing scope, backup-file plaintext, and storage limitations. Obtain the project’s normal legal review; do not state an unreviewed legal conclusion.
- Review existing community rating identity separately so local private stars cannot be confused with server-backed community response.

**Pass evidence:** privacy data-flow review, browser request capture, analytics allowlist check, generated-page inspection, updated copy review, and documented legal decision.

## 9. Accessibility, keyboard, mobile, and motion

- Library actions and status controls have programmatic names, current state, and keyboard operation. State changes and import/storage errors are announced without requiring color alone.
- Card-to-show journeys and their compact Library controls can be used without a pointer. Focus order, focus return after state changes, Escape, focus visibility, and page headings are reviewed.
- Test at supported narrow mobile widths and at zoom: no horizontal overflow, clipped actions, controls too small to use, or expanded cards that destroy the established browse density. State remains visible without hover.
- Honor `prefers-reduced-motion`; no state or discovery information depends on animation. Contrast remains sufficient for red/orange and green accents, metadata, badges, focus, disabled and error states.
- Denied-storage and corruption states are covered in the existing controls/service; empty, unresolved-ID, and import-preview states are covered by service tests where no public UI exists.
- Browser checks prove `/library` has no public/generated route or navigation item; cover add/change/remove on cards, state/private-rating controls on show pages, repeated-card and cross-tab updates, reload persistence, storage failure, Hidden behavior in ordinary browsing, request privacy, narrow layout, keyboard focus/Escape, and reduced motion. Service tests cover import/export, opt-in persistence/isolation, unknown IDs, and recovery export without a public management UI.

**Pass evidence:** automated accessibility checks plus keyboard and screen-reader spot checks on named browser/OS, viewport screenshots or equivalent report, reduced-motion run, and responsive smoke results.

**Worktree evidence:** the required Chromium suite passed on Playwright-managed Chromium revision 1223. The Personal Discovery product flow checks keyboard operation, status text, reload and cross-tab state, request privacy, and a 390 px viewport with no horizontal overflow. Desktop/mobile screenshot review is recorded in the [homepage integration QA report](../qa/2026-09-29-discovery-homepage-integration.md). A manual screen-reader spot check remains a release-review item.

## 10. Performance and scale

- The v1.2.7 [baseline](BASELINE.md) remains the public-catalogue correctness and report-timing reference. The 2.0 [performance budget](PERFORMANCE-BUDGET.md) was recorded before the integrated stress run and uses the closest prior 25,000-show and 752-show evidence for review limits.
- Review the named browser profile, catalogue revision, cache/network condition, operation boundaries, and memory evidence. These single-host timings are review evidence, not portable guarantees or hard millisecond CI gates.
- Repeat measurements under the same conditions. Separate network, parsing, ranking, rendering, and storage costs so an aggregate improvement cannot hide a slower critical operation.
- Synthetic catalogue stress test has at least 10 times the then-current published record count, with realistic sparse/dense metadata distribution and duplicate/alias cases. Discovery must remain deterministic, preserve evidence gates, and render in bounded pages rather than mounting all results. If Phase 1 proves this factor meaningless or impractical, record a replacement stress case before implementation and apply it consistently.
- Performance work may not reduce title/alias correctness, recommendation evidence, accessible behavior, or explanation accuracy.

**Pass evidence:** before/after benchmark artifact, environment record, agreed budget, synthetic scale test output, and explanation of any trade-off.

**Integrated measurement — 2026-09-29:** The synthetic fixture contains 7,520 shows, 376 collections, and 376 entities (10× the current 752-show catalogue); it reads and writes no authored catalogue source. On macOS 26.5.1 Apple Silicon with Node v24.14.1 and Playwright Chromium revision 1223, 3 warmups and 24 measured retrieval calls produced engine-construction p95 1,352 ms, exact-title p95 78.6 ms, broad text p95 710.1 ms, `sci-fi` p95 35.8 ms, `finished sci-fi` p95 24.3 ms, and `finished sci-fi under 10 hours` p95 16.1 ms. Runtime preference and exact runtime lookup resolved to qualified runtime results; creator lookup returned its typed entity result. At 20/100/500 Library entries, first enabled calls were 60.7/232.9/1,310.6 ms. The 500-entry run had 275 weighted anchors, a 50-candidate product of 13,750, and 13,471 compared pairs (within the structural limit); the 500-entry warm enabled p95 was 26.5 ms versus 18.0 ms disabled (1.47×), with no new similarity comparisons across 24 repeated warm calls. Hidden suppression, Finished visibility, public-disabled parity, and personal-reason output were recorded. On a 390 × 844 Chromium viewport, parsing plus hydration took 657 ms, 24-card render/update took 2.2/0.8 ms, and horizontal overflow was absent. Memory peak RSS was about 425 MB for the Node benchmark process; browser heap is reported separately. See the dated [candidate QA report](../qa/2026-09-30-2.0-release-candidate.md) and [performance budget](PERFORMANCE-BUDGET.md).

## 11. Service worker and offline behavior

- Generated worker continues to cache only approved static shell/assets; it never includes Library state, exports, or private personalized output. API requests remain excluded from worker caching.
- Previously visited ordinary Echo pages keep their existing offline behavior. Library service state remains independent of worker caches; there is no separate offline Library page. Do not promise cold-offline catalog browsing.
- Browser restart, worker update, cached old page, and code rollback do not silently clear or migrate Library data. Unsupported newer state remains recoverable. Verify worker activation/update behavior and cache versioning.
- Existing offline fallback behavior and public static shell continue working without a server response.

**Pass evidence:** generated-worker assertions plus browser offline, previously visited route, worker update, and preserved-storage checks in an isolated profile.

## 12. Staging, rollback, and documentation parity

- Deploy the exact release-candidate SHA to the existing staging environment with its separate database; verify route generation and major user flows there. Use an isolated browser profile and explicitly confirm the staging origin cannot read/write the production-origin Library.
- Exercise rollback to the previous code artifact after creating a staging Library. Confirm that old code does not corrupt newer state and that recovery instructions work; if the previous code cannot understand it, it must leave it intact rather than overwrite it.
- Confirm no server DB migration is introduced for Library. If another independently justified server migration exists, review backup, forward recovery, and rollback as a separate migration plan; code rollback alone does not restore SQLite.
- Record deployment, health check, service-worker update, storage behavior, and rollback steps in operations docs. Update current product/architecture/roadmap/storage/privacy/analytics docs where the shipped behavior changes them; mark superseded 1.1 snapshots as dated rather than silently changing their historical evidence.
- Docs must agree on storage name/purpose/schema version, absence of a Library route, status semantics, service-level export behavior, personalization default, analytics privacy, offline limits, and release commands.

**Pass evidence:** staging and rollback runbook with exact SHA, separate-origin test, database state, browser profile, screenshots/logs where useful, and documentation parity review.

## 13. Product scope and visual footprint

- Compare the 2.0 result with the Echo 1.2.x information architecture: top-level and mobile navigation, page hierarchy, card height/density, show-page actions, homepage, collections, and creator pages.
- Prefer enhancing existing surfaces. Do not add a Library navigation item, dashboard, global settings page, or public management page. Any proposed new route must show why the problem cannot fit Echo’s current structure.
- Library status controls remain visually secondary to shows and listening actions. No new surface may make ordinary browse cards substantially taller or reorder the existing show-page hierarchy without explicit product justification.

**Pass evidence:** dated side-by-side review of the current 1.2.x structure and 2.0 pages at desktop and narrow mobile widths, with remaining visible expansions listed and justified.

**Worktree review — 2026-09-29:** compared the generated v1.2.7 baseline at `55ca3969c850cabbc3c0159aae4e3c77da7e0410` with Playwright-managed Chromium screenshots of browse, show detail, and mobile browse. Desktop and mobile navigation match the baseline after the Library link is removed. Existing browse density, homepage hierarchy, collections, creator pages, and show-page content order remain intact. The only deliberate additional controls are compact Library state/remove actions on cards and a compact detail disclosure for state, private rating, and removal. No major residual expansion remains; accessibility changes to navigation, collection status/labels, and carousel targets preserve the existing page hierarchy.

## Release decision

The release owner signs each gate as pass, fail, or explicitly waived with rationale and owner. Privacy, state integrity, discovery correctness, cleared-state parity, required browser coverage, generated output, and rollback safety are blocking gates. A waived visual polish issue must not conceal a functional keyboard/mobile blocker. If a gate cannot be measured or reproduced, the release remains unverified until its method is fixed.
