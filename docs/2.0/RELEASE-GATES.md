# The Echo Archives 2.0 — Release gates

**Status:** Library implementation gates have worktree evidence below. The full 2.0 release remains open pending staging, rollback, legal review, deployment, and Discovery 2.0 integration gates.<br>
**Baseline:** executable v1.2.7 baseline is recorded in [BASELINE.md](BASELINE.md) at `55ca3969c850cabbc3c0159aae4e3c77da7e0410` (2026-09-28), including actual commands and results. Refresh it if the implementation branch differs materially or the release baseline has advanced.<br>
**Rule:** every gate has an artifact, environment, result, and owner. A skipped required browser run is not a pass. A dated QA report is not evidence of current behavior.

## Gate record

The release record must include the candidate commit, generated-output state, exact commands, Node/browser versions, browser/device and cache profile for visual/performance results, links to reports, skipped checks, known limitations, and a named reviewer for product/privacy decisions. Run expensive aggregate verification deliberately at release-candidate stage, not after every small edit. Existing current checks—not invented commands—are the source of executable validation.

## Worktree implementation evidence — 2026-09-29

These results validate the listener Library implementation in the current worktree. They are not a staging, deployment, legal-review, or production release sign-off.

**Environment:** macOS 26.5.1 (Apple Silicon), Node 24.14.1, Playwright-managed Chromium headless shell revision 1223.

- `npm run build:catalog`, `npm run build:pages`, `npm run check:structure`, and `npm run check:generated` passed. Structure checking retained the repository's existing non-blocking warnings.
- `npm run test:tools` passed: 129 passed, 0 failed, 5 skipped. Skips are environment-specific release/tool checks that need the Linux/GNU or Restic environment.
- Backend `validate:data` and `check:links` passed.
- `npm --prefix backend run test:serial` passed: 439 passed, 0 failed, 0 skipped, 153.9 seconds. This exercises all `test/*.test.js`, including the Library service tests.
- `npm --prefix backend run test:library` passed: 8 passed, 0 failed, 0 skipped, 7.7 seconds. This combines the Library schema/service tests with real Chromium product flows covering the Library shell, CRUD/rating, filtering/search, cross-tab behavior, backup/restore, preference persistence, storage failure/recovery, and request privacy.
- `npm --prefix backend run test:smoke:required` passed in Chromium: 82 passed, 0 failed, 0 skipped. This includes responsive navigation, offline/service-worker behavior, reduced motion, existing public flows, and creator/detail pages.
- The default parallel `npm run verify` reached the backend `npm test` stage but did not complete: route-test workers and their spawned servers remained active without progress for over 20 minutes. That process group was stopped; the repository's existing serial test script and required-browser suite above were then run to completion.
- Browser visual review was automated through Playwright responsive, reduced-motion, keyboard, and layout assertions. No manually inspected screenshot artifact was recorded.

## 1. Public compatibility and generated output

- **Routes:** all current canonical public routes, legacy aliases/redirects, noindex aliases, show detail pages, collections, creator pages, Shows Like routes, legal pages, submission pages, and current query parameter meanings resolve as before. `/library` is additive, noindex, absent from sitemap, excluded from analytics, and has no generated user-state payload.
- **History:** current query/filter/sort/seed URL behavior remains compatible. Back/Forward restores actual rendered inputs, results, summary, empty state, and scroll; browser history never contains Library status, private rating, or Personal Discovery setting.
- **Generated site:** authored source rebuilds successfully. Generated pages, page manifest routes, sitemap, robots, search index, CSS/JS output, aliases, and service worker are mutually consistent. The Library route shell and scripts/styles contain no listener records, and the worker caches only static assets. No hand-edited generated root artifact or personal state appears in a generated file.
- **Indexing and analytics:** `/library` is noindex, absent from sitemap, and excluded from analytics inclusion. It emits no Library-specific event. The build proves these properties from generated output and the manifest, not just source inspection.
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

## 4. Import/export

- A versioned export imports into an empty library with the same entry IDs, statuses, optional private ratings, and unresolved-show title labels. Export includes no Personal Discovery setting; import preserves the device’s current opt-in for both modes.
- Import always validates and previews the entire document before writing. Preview discloses mode, counts, unresolved IDs, and same-ID conflicts. **Merge** preserves local-only records; each imported same-ID record replaces that local record in full. **Replace** makes the validated imported records the complete Library after explicit confirmation. Unknown IDs remain intact; no title/alias remapping occurs.
- Commit-time conflicts are recalculated from the current Library inside the write transaction. Invalid files, invalid fields, unsupported versions, cancellation, or failed storage transactions change nothing; no partial import is allowed. Personal Discovery opt-in is not backup content and is never altered by either mode.
- No import is uploaded or included in analytics, requests, URL state, logs, or error reporting. The format is documented and carries an export schema version independent of IndexedDB database version. Backup JSON is readable plaintext and may contain private ratings and title labels.

**Pass evidence:** roundtrip fixtures including empty, sparse, unknown-ID, conflict, malformed, and older-version files; browser download/selection and cancellation flow.

## 5. Cleared-state and non-personalized behavior

- With Personal Discovery off or unavailable, the public candidate IDs, section membership, ordering, and Hidden-show visibility exactly match the ordinary non-personalized path for the same public query. The Library remains usable while personalization is off.
- After reset, the page returns to that same baseline with no stale in-memory preference, cached reason, or Hidden suppression. Verify after navigation, reload, and in a second open tab.
- Pausing Personal Discovery preserves Library entries and ratings while returning exact ordinary ordering and visibility. Re-enabling requires an explicit user action and uses current catalogue evidence.
- Only a private rating explicitly entered by the listener may affect personalization: 4–5 can be positive anchors, 1–2 negative anchors, and 3 is neutral. Archive Rating, Community Rating, passive behavior, or inferred values never substitute. Saved/Listening may be weak anchors; Finished is not a positive preference. Dropped and Hidden do not generalize to similar titles. When enabled, Hidden suppresses only its exact show from personalized discovery. Direct show routes remain accessible, and catalogue truth is unchanged.
- Library controls never change state from passive viewing, playback-link opening, a public rating, or an archive rating.

**Pass evidence:** pure parity tests compare exact ordered IDs and sections; browser tests cover enable, pause, clear, reload, navigation, and tab synchronization.

## 6. Search, intent, and discovery benchmark

- All reviewed exact-title and alias fixtures resolve the intended show despite punctuation, Unicode normalization, common words, taxonomy overlap, and body-text matches. Existing title/alias correctness remains at least as strong as the captured v1.2.7 baseline.
- Every hard filter excludes candidates missing or contradicting required evidence. Soft preferences rank known matches ahead of unknown where the query calls for it; unknown values are never fabricated or treated as evidence. Estimated runtime retains its qualifier. A target like “around 10 hours” is not displayed as exact runtime.
- “Finished shows” (catalogue lifecycle) and “shows I’ve finished” (local Library state) are distinguished in fixtures; ambiguous phrasing asks for clarification, and personal state never enters a shareable URL.
- Supported structured phrases have reviewed interpretation and expected results. Unsupported/ambiguous phrases remain visible as text or request an editable interpretation; they are not silently converted into unsupported fields.
- Seed and “like X” results retain existing identity exclusions, fit rules, evidence threshold, deterministic diversity, and authored/computed distinction. Typed creator/entity intent resolves only explicit source-backed roles; co-occurrence is never treated as an affiliation.
- The captured v1 benchmark contains the known `similarity-white-vault-sci-fi` failure: “something like The White Vault but sci-fi” admits `the-harrowing` without sci-fi evidence. Record it as pre-existing baseline behavior; the v2 hard-constraint gate passes only when the result no longer violates the explicit sci-fi requirement.
- Benchmark includes current catalogue examples, sparse factual-only records, no-match cases, duplicate provider identities, common/rare metadata, tone/performance conflicts, runtime unknowns, alias collisions, and adversarial title/taxonomy overlap. Expected output and reason evidence are reviewed by an archive maintainer. A single aggregate relevance score cannot waive a failing critical case.
- Candidate relevance changes are compared with the recorded baseline. No threshold or weight is changed solely to make sparse records appear covered.

**Pass evidence:** versioned benchmark report with fixture source/version, reviewed expected outputs, critical-case pass list, unsupported-intent list, and comparison to v1.2.7.

## 7. Recommendation explanations

- Every personal ordering change has an understandable reason tied to a specific local signal and current catalogue evidence. The explanation identifies the anchor show and the shared/contrasting dimensions used.
- Reasons correspond to actual score components and are stable/deterministic. No generic “because you like this” copy without the signal and evidence.
- Personal signals cannot override a hard query constraint, similarity evidence minimum, authored/computed relationship labels, or show identity exclusion.
- No explanation claims runtime, status, creator role, tone, or relationship facts absent from current catalogue evidence.
- If the system cannot produce an accurate explanation for an adjustment, it makes no such adjustment.

**Pass evidence:** structured-reason unit assertions and rendered-copy review for positive, negative, unknown, sparse, and no-personal-signal cases.

## 8. Privacy, storage, and legal copy

- Confirm by code and browser network inspection that Library IDs/statuses/private ratings, import contents, opt-in state, anchors, and personal reasons do not leave the browser through APIs, analytics, chat, submission, URL, referrer, telemetry, or error logs. The current sanitized `getPersonalContext()` boundary contains only `enabled` and, when enabled, entries with `showId`, `state`, and optional explicit `rating`; Discovery ranking is not yet integrated.
- Confirm Library route analytics exclusion in generated HTML and emitted network requests. Existing unrelated allowlisted aggregate analytics remain unchanged and do not carry Library origin/state.
- Confirm Library data is absent from generated catalogue/static route output, sitemap, service-worker caches, server SQLite, and public links. Any live DOM state exists only in the listener’s current browser view and is not exported into static output or requests. The service-worker cache version includes tree hashes for `shared/library/`, `shared/app/library/`, `shared/app/pages/library/`, and the `library.css` bundle version; database contents never enter worker caches.
- Verify third-party scripts or image/link requests receive no Library data in query parameters or referrers. Render any unresolved-show title as text, never executable HTML.
- Update Privacy and Cookies pages to name the local storage purpose, controls, clearing scope, backup-file plaintext, and storage limitations. Obtain the project’s normal legal review; do not state an unreviewed legal conclusion.
- Review existing community rating identity separately so local private stars cannot be confused with server-backed community response.

**Pass evidence:** privacy data-flow review, browser request capture, analytics allowlist check, generated-page inspection, updated copy review, and documented legal decision.

## 9. Accessibility, keyboard, mobile, and motion

- Library actions and status controls have programmatic names, current state, and keyboard operation. State changes and import/storage errors are announced without requiring color alone.
- Complete browse-to-Library-to-show journeys can be performed without a pointer. Focus order, focus return after dialogs, escape/cancel, focus visibility, and page headings are reviewed.
- Test at supported narrow mobile widths and at zoom: no horizontal overflow, clipped actions, controls too small to use, or expanded cards that destroy the established browse density. State remains visible without hover.
- Honor `prefers-reduced-motion`; no state or discovery information depends on animation. Contrast remains sufficient for red/orange and green accents, metadata, badges, focus, disabled and error states.
- Empty, loading, denied-storage, corruption, no-match, unresolved-ID, and import-preview states are covered, not only the happy path.
- Browser checks cover `/library`, add/change/remove/rate controls on cards and show pages, repeated-card and cross-tab updates, reload persistence, local search/sort/filter, backup preview/Merge/Replace/cancel/failure, opt-in persistence and import isolation, storage failure, unknown IDs, recovery export, request privacy, narrow layout, keyboard focus/Escape, and reduced motion where applicable.

**Pass evidence:** automated accessibility checks plus keyboard and screen-reader spot checks on named browser/OS, viewport screenshots or equivalent report, reduced-motion run, and responsive smoke results.

## 10. Performance and scale

- The existing [v1.2.7 baseline](BASELINE.md) includes repeatable full-catalogue report timings, but not controlled browser latency, Library operations, or memory. Before setting performance budgets, add repeatable measurements using a named browser/device profile, catalogue revision, cache/network condition, and the operations listed here: load/parse, first useful result, exact search, structured filtering, retrieval, render/pagination, Library load/write, and memory where tooling supports it.
- Before feature coding, set a reviewable performance budget based on that measured baseline and the supported-device target. Do not invent a millisecond or percentage limit after observing a regression. Release candidate must stay within the agreed budget or have a documented trade-off approved by product/engineering owners.
- Repeat measurements under the same conditions. Separate network, parsing, ranking, rendering, and storage costs so an aggregate improvement cannot hide a slower critical operation.
- Synthetic catalogue stress test has at least 10 times the then-current published record count, with realistic sparse/dense metadata distribution and duplicate/alias cases. Discovery must remain deterministic, preserve evidence gates, and render in bounded pages rather than mounting all results. If Phase 1 proves this factor meaningless or impractical, record a replacement stress case before implementation and apply it consistently.
- Performance work may not reduce title/alias correctness, recommendation evidence, accessible behavior, or explanation accuracy.

**Pass evidence:** before/after benchmark artifact, environment record, agreed budget, synthetic scale test output, and explanation of any trade-off.

## 11. Service worker and offline behavior

- Generated worker continues to cache only approved static shell/assets; it never includes Library state, exports, or private personalized output. API requests remain excluded from worker caching.
- A previously visited Library route can open offline when shell/assets are cached and show locally stored entries. The UI accurately states which public catalogue data is unavailable; do not promise cold-offline catalog browsing.
- Browser restart, worker update, cached old page, and code rollback do not silently clear or migrate Library data. Unsupported newer state remains recoverable. Verify worker activation/update behavior and cache versioning.
- Existing offline fallback behavior and public static shell continue working without a server response.

**Pass evidence:** generated-worker assertions plus browser offline, previously visited route, worker update, and preserved-storage checks in an isolated profile.

## 12. Staging, rollback, and documentation parity

- Deploy the exact release-candidate SHA to the existing staging environment with its separate database; verify route generation and major user flows there. Use an isolated browser profile and explicitly confirm the staging origin cannot read/write the production-origin Library.
- Exercise rollback to the previous code artifact after creating a staging Library. Confirm that old code does not corrupt newer state and that recovery instructions work; if the previous code cannot understand it, it must leave it intact rather than overwrite it.
- Confirm no server DB migration is introduced for Library. If another independently justified server migration exists, review backup, forward recovery, and rollback as a separate migration plan; code rollback alone does not restore SQLite.
- Record deployment, health check, service-worker update, storage behavior, and rollback steps in operations docs. Update current product/architecture/roadmap/storage/privacy/analytics docs where the shipped behavior changes them; mark superseded 1.1 snapshots as dated rather than silently changing their historical evidence.
- Docs must agree on storage name/purpose/schema version, route/indexing policy, status semantics, export behavior, personalization default, analytics exclusion, offline limits, and release commands.

**Pass evidence:** staging and rollback runbook with exact SHA, separate-origin test, database state, browser profile, screenshots/logs where useful, and documentation parity review.

## Release decision

The release owner signs each gate as pass, fail, or explicitly waived with rationale and owner. Privacy, state integrity, discovery correctness, cleared-state parity, required browser coverage, generated output, and rollback safety are blocking gates. A waived visual polish issue must not conceal a functional keyboard/mobile blocker. If a gate cannot be measured or reproduced, the release remains unverified until its method is fixed.
