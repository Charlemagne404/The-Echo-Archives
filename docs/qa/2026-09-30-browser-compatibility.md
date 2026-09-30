# Browser and Platform Compatibility Campaign

- Date: 2026-09-30
- Task slug: `browser-compat`
- Task branch: `codex/overnight-browser-compat`
- Original integration base: `aa81d5d088508e65822ea059af5928569e2c4043`

## Runtime and platform

The campaign ran on macOS 26.5.1 (Darwin 25.5.0, Apple Silicon arm64), Node.js 24.14.1, npm 11.11.0, and Playwright 1.60.0. The installed Playwright browser versions were Chromium 148.0.7778.96, Firefox 150.0.2, and WebKit 26.4.

WebKit is Playwright's WebKit runtime; it is not a Safari installation. Mobile viewport and touch checks used Playwright emulation. No physical iPhone or iPad, installed Safari, or Linux host was available, so none is certified by this report.

## Browser behavior matrix

The focused compatibility runner contains 11 serial suites. Its complete Firefox and WebKit runs passed before the final mobile-navigation accessibility adjustment. After that adjustment, the focused keyboard focus/focus-return regression passed in Chromium, Firefox, and WebKit. The final full repository verification passed in Chromium after all changes.

| Behavior area | Exercised behavior | Result |
| --- | --- | --- |
| IndexedDB and Library | Open and persist state; read/write and rollback; concurrent pages, BroadcastChannel synchronization, version changes and blocked upgrades; invalid rows, migration, storage failures, close/reopen, reset, and a 500-entry import/read round trip. | Full focused Firefox and WebKit matrices passed before the final accessibility adjustment; final Chromium repository verification passed. |
| Fetch and failure handling | Abort a fetch, bound a delayed response, reject malformed JSON, and keep failure handling same-origin in the browser fixture. | Full focused Firefox and WebKit matrices passed; final Chromium repository verification passed. |
| Search, Discovery, and history | Typo-tolerant search, shareable URL state, rich Discovery criteria, similarity routes, collection filters/sorts, creator filters, and Back/Forward restoration. | Full focused Firefox and WebKit matrices passed; final Chromium repository verification passed. |
| Filters and responsive surfaces | Structured filters, mobile filter sheet, narrow layouts down to 320 CSS pixels, and touch target sizing. | Full focused Firefox and WebKit matrices passed; final Chromium repository verification passed. |
| Service workers and cache | Public-page offline fallback, stale-worker update, cache retirement, delivery statuses, and exclusion of private Library state from Cache Storage. | Full focused Firefox and WebKit matrices passed; final Chromium repository verification passed. |
| Focus, forms, and navigation | Mobile menu open/close, Escape and focus return, filter focus, Library card/detail controls, Personal Discovery, submit/correction flows, maintainer import, and creator/entity routes. | Full focused Firefox and WebKit matrices passed before the final accessibility adjustment. The targeted mobile-navigation keyboard-focus regression then passed on all three engines. |

These results show the exercised browser APIs and core flows working consistently across the three Playwright engines, subject to the chronology above. They do not establish parity for untested operating systems or physical devices.

## Browser-specific findings and fixes

- Static assets returned 404s from the hidden dot-prefixed task worktree because file delivery depended on the process working directory. Static and maintainer page routes now resolve files against an explicit root; smoke assertions cover CSS and JavaScript delivery.
- Firefox exposed a Library checkbox race while save/refresh completed asynchronously. The integration now retains the requested checked state until the refreshed state is applied.
- The cross-tab blocked-upgrade fixture could leave Firefox waiting on an unrealistic open connection. The fixture now closes/coordinates the old connection as a real version-change participant should; the product behavior remains tested for blocked upgrades.
- WebKit lost focus when the submit tag picker rerendered. The handler now restores focus synchronously after rendering.
- Mobile menu focus could run before the drawer's focusable controls were rendered. Focus now retries for up to 12 animation frames while checking visibility and layout. Generated navigation and filter controls also have explicit accessible names; the drawer uses explicit cross-engine visibility selectors.
- Maintainer session-expiry interception was narrowed to the import endpoint so nested candidate requests are not mistaken for expired sessions.
- Search-history coverage now permits a single intermediate entry during typing and still requires exactly one settled entry, matching the debounced UI behavior across engine timing.

No compatibility polyfills were added.

## Changes and files

The campaign added a serial, selectable Playwright compatibility runner and focused browser API coverage; added service-worker update/cache privacy coverage and realistic Library stress cases; fixed the demonstrated focus, async control, and static-path issues; and regenerated tracked page assets.

Files changed:

- `backend/lib/routes/maintainer-routes.js`
- `backend/package.json` (scripts only; no dependencies added)
- `backend/server.js`
- `backend/scripts/run-browser-compat.js` (new)
- `backend/test/browser-api-compat.smoke.js` (new)
- `backend/test/browser.smoke.js`
- `backend/test/discovery-stability.smoke.js`
- `backend/test/listener-library-product.smoke.js`
- `backend/test/listener-library.test.js`
- `backend/test/maintainer-import.smoke.js`
- `home.css` (generated)
- `script.js` (generated)
- `shared/app/library/integration.js`
- `shared/app/mobile-nav.js`
- `shared/app/pages/home/filter-menu.js`
- `shared/app/pages/submit/click-handlers.js`
- `shared/styles/home/cards/17-responsive-780-a.css`
- `style.css` (generated)
- `sw.js` (generated)
- `tools/build-pages.js`

No catalogue source data changed. The final structure check reported the touched CSS source at 549 lines, below the repository's 550-line hard limit. Generated-boundary validation preserved 32 authored HTML files and reported no generated-output violations.

## Verification

- `rtk proxy npm --prefix backend run test:smoke:compat -- --browser=firefox` — all 11 focused suites passed.
- `rtk proxy npm --prefix backend run test:smoke:compat -- --browser=webkit` — all 11 focused suites passed.
- Focused `test/accessibility.smoke.js` test `mobile navigation and filter sheet support keyboard focus` with `SMOKE_BROWSER=chromium`, `firefox`, and `webkit` — passed on each engine after the final navigation/accessibility change.
- `rtk npm run verify` — passed on the task branch after all changes. This ran catalog/page builds, structure and generated-boundary checks, release artifact checks, tooling tests, build determinism, backend data/link checks, serial tests, and required Chromium browser smoke coverage.
- `rtk proxy git diff --check` — passed.

The full Firefox/WebKit 11-suite matrices were not rerun after the final accessibility-only navigation adjustment. Their earlier full passes plus the final targeted three-engine regression are reported separately above; the final broad verification was Chromium. No Linux, Safari, or physical iOS verification was performed.

## Integration record

The serialized integration result, including the final overnight integration commit and combined verification, is recorded in `docs/qa/agent-handoffs/browser-compat.md`.
