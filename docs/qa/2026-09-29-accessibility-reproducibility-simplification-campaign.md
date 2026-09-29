# Accessibility, reproducibility, and simplification campaign

Date: 2026-09-29  
Scope: existing Echo Archives UI, generated build/release path, and code usage/dependency audit.  
Visual direction and public page set were preserved.

## Accessibility findings

Automated axe checks derive all 19 public routes from `page-manifest.json`,
including the `/collection` and `/show` templates, then add generated
creator-detail and representative show/collection detail routes, maintainer
sign-in, and all six authenticated maintainer routes. They run WCAG 2.0/2.1
A/AA and WCAG 2.2 AA rules plus axe semantic best-practice rules for heading
order, landmarks, focus semantics, target size, and color contrast in Chromium.
Dynamic scans cover search results, dialogs, submission modes, Library state,
ratings, carousel updates, and error states.
The audit found and fixed:

- The collection detail had nested regions with the same accessible name. The
  outer wrapper no longer creates a duplicate landmark; its inner section
  retains the visible “Shows in this collection” label.
- The mobile drawer used an `aside` (complementary landmark) with
  `role="dialog"`. It is now a neutral `div` with the existing modal dialog
  semantics; the CSS class and visual layout are unchanged.
- The collections directory's live region enclosed its whole card grid. A
  search update could announce the full set of as many as 54 cards. The grid is
  now quiet and its atomic `role="status"` summary reports the result count.
- Mobile navigation could lose focus after its opening animation/focus cycle,
  including with reduced motion enabled. Focus is now re-established after the
  activation frame; the browser regression checks the visible outline, tab
  wrapping, Escape, and return to the toggle.
- The lazy-loaded Archivist dialog also used an `aside` with `role="dialog"`;
  the new open-state axe scan caught it. Its wrapper is now a neutral `div`,
  with Escape, focus containment, and focus return covered by keyboard tests.
- Opening the submission tag picker re-rendered fields inside an optional
  disclosure. The picker now captures the current draft before replacing the
  fields and restores focus after rendering; Escape also returns focus to the
  recreated input. Keyboard regression coverage opens with Enter, navigates a
  suggestion with ArrowDown, checks the open state, and closes with Escape.
- Listener review carousel dots had a 9-by-9-pixel pointer target. Each button
  now has a 24-by-24-pixel target and keyboard outline while the visible dot
  remains 9 pixels. Axe passes after keyboard navigation and in the page-load
  failure state.
- The browse fallback left its horizontally scrollable quick-filter group with
  no focusable child because all chips are disabled. The group becomes
  keyboard-focusable only while browse controls are disabled and has a visible
  focus outline in that state.
- The show-lookup retry button had no focus-visible style. A keyboard traversal
  regression now reaches it and checks its outline; the unavailable state also
  passes axe.
- Six authored pages (About, Supporters, Privacy, Terms, Cookies, and
  Copyright) were missing from the original scan. They are now included with
  the rest of the public route templates.
- The creator directory had no keyboard regression for search, network
  filtering, or sorting. Its new regression checks result announcements,
  Escape-to-clear with focus retained, Space-operated filter state, and the
  labeled sort control.
- Filtered collection cards became `aria-hidden` while their exit animation
  continued, but could remain keyboard-focusable. They now leave the tab order
  during exit and regain their original `tabindex` when restored.
- Three analytics chart scrollers had no keyboard entry point or accessible
  name. Each is now a named `region` linked to its existing chart heading.
- Several maintainer reports, queues, and submission content areas were
  announced as large live regions. Those broad live announcements were
  removed; concise status elements carry counts and action results.
- The maintainer collection page imported session functions from a module that
  did not export them, preventing the application from reaching its ready
  state. The import now uses the session API module.

Submission validation has permanent regressions for visible field errors,
`aria-invalid`, alert semantics, invalid-title focus, every submission mode,
the open tag picker, correction search results, and lookup failure. The 13-test
accessibility smoke suite also checks collection and browse empty results,
320-CSS-pixel reflow with reduced motion, a populated local Library, chat and
filter dialogs, creator directory keyboard controls, and all six maintainer
routes at 320 CSS pixels. It passed with zero failures. The Library-card
regression opens the state control and saves a state with Enter, then verifies
focus returns to the card summary. The community browser suite also scans the
enabled rating form and review-carousel success/error states; its rating
selection is keyboard operated.

This is automated Chromium evidence, not a manual screen-reader or assistive
technology certification. Existing responsive/reduced-motion coverage remains
in the normal suite; no broad visual redesign was made.

## Clean-clone and release evidence

### Exercised runbook

The following sequence was run in an isolated clone of `main` at
`67088bf6c6b88a002c65de0540d0167bdc99d435`. Before installing, the clone had
no root or backend `node_modules` and no `backend/.env`. The campaign changes
were applied from the tracked diff and new source/test files; generated output
was rebuilt from source.

```sh
node --version
npm --version
npm --prefix backend ci
npm --prefix backend run test:setup:browser -- chromium
npm run verify
```

Final clean-clone environment: macOS, Node `v24.14.1`, npm `11.11.0`, and
Chromium. `npm ci` reported zero vulnerabilities. The full final verification
passed on a second clean clone in Debian GNU/Linux 13 (Trixie) ARM64 under
Node `v22.23.1` and npm `10.9.8`. Linux needed Playwright's Debian host
libraries after its Chromium download:

```sh
(cd backend && sudo env DEBIAN_FRONTEND=noninteractive ./node_modules/.bin/playwright install-deps chromium)
```

This prerequisite is now included in the README's clean-machine instructions.
Neither production nor external provider state was touched.

The final clean-clone `npm run verify` under Node 24 passed: 144 tooling tests
(139 passed, five Restic-dependent skips), all 443 backend tests, and all 95
required browser smoke tests, with zero failures or browser skips. The
accessibility suite contributed 13 of those browser tests. Catalogue/page
builds, structure and generated-boundary checks, artifact sanity, and
two-build determinism also passed. `check:structure` emitted non-blocking
soft-limit notices for existing large modules/styles and referenced cover
files over 500 KB; these were retained.

The final Linux `npm run verify` passed 144 tooling tests (141 passed, three
Restic-dependent skips), all 443 backend tests, and all 95 required Chromium
browser tests with no failures or browser skips. It reproduced the same
1,555-file determinism digest recorded above. A Linux-only home-browser timing
race was fixed by making those navigations wait for the app-ready signal; the
focused Linux home suite then passed 10/10.

After adding keyboard operation and focus-return assertions for Library card
state controls, I reran `npm --prefix backend run test:smoke:required` in the
same clean clone. The final required-browser run passed all 95 browser tests
with zero failures or skips.

`npm ci` first exposed two moderate npm audit findings through the existing
`undici@7.29.0` override. The override is now `7.29.1`, the lockfile resolves
that exact version, and a second clean install reported zero vulnerabilities.
The patched version is listed by the
[GitHub advisory](https://github.com/advisories/GHSA-3wwx-pv8p-q78v).

The build determinism check runs catalog and page builds twice with cover
recovery disabled, then compares each expected generated path and SHA-256. On
the final source it passed for 1,555 generated files with combined digest
`18911d9463da79e061a65fa523745fb62a970162443040425a7975f50957144a` under
both Node 22 and Node 24. Generated HTML remains ignored build output;
authored pages remain under `site-src/`.
The release artifact check found 752 published shows, 54 collections, 752
search records, 132 entities, 72 indexable entities, and no warnings.

The final staging smoke was exercised against the rebuilt clean clone on a
local server bound to `127.0.0.1:3011`, using an empty SQLite database under a
disposable `/tmp` directory and an environment with provider credentials
absent. It passed 272 checks with zero errors. A database backup made with
`tools/backup-database.js` passed integrity checks (1,167,360 bytes, mode
0600). The temporary database,
including SQLite sidecar files, was removed afterward. Three warnings only
reported capped internal-link crawl counts (80/179 homepage, 80/164
collections, and 80/98 show page).

### Release boundary

The remote `deploy/echo staging`, `deploy/echo promote`, production deploy,
production rollback, and host backup/restore were not run. Those actions change
release pointers, services, or databases; the user instruction prohibited
touching production or external provider state without a non-destructive mode.
The Linux `deploy/verify-deployment-rollback-invariants.sh` drill was run in a
disposable clean checkout with a test-only commit and temporary backup. It
detected the deliberately bad candidate, restored the previous revision in 13
seconds, retained the database sentinel, and cleaned its temporary worktree.
It did not access production. Isolated regressions in
`tools/test/operations.test.js` execute the real `promote_staging()` and
`rollback_production()` paths against temporary `DEPLOY_ROOT` trees. They
verify rejection before backup when staging smoke evidence is absent, backup
ordering before promotion pointers switch, atomic release/runtime pointer
switches, mutable runtime-state preservation, an unchanged database sentinel,
and automatic pointer recovery when either target fails health. The fixtures
stub deployment-host service, permission, and backup boundaries and adapt GNU
path/rename commands; they do not prove host systemd, remote staging promotion,
real host backup/restore, or provider behavior. Those remain unproven here.

## Usage and dependency map

| Surface | Authored source / entry | Runtime or generated output |
| --- | --- | --- |
| Public pages and aliases | `site-src/page-manifest.json`, `site-src/pages/`, `site-src/partials/` | `tools/build-pages.js` emits ignored root HTML, clean-route aliases, creator pages, sitemap, robots file, hashed CSS/JS entry bundles, and `sw.js` |
| Catalog and show covers | `catalog-src/` show records and cover paths | `tools/build-catalog.js` emits `data/*.json`, search/entity/review data, and responsive cover assets under `images/generated/covers/`; data and structure validation check references and generated boundaries |
| Branding/editorial media | `site-src/pages/`, `site-src/partials/`, `site-src/data/social-links.json`, `shared/styles/`, and source images under `images/` | `tools/build-pages.js` wires page/social assets and offline precache entries; `backend/server.js` explicitly exposes root assets and serves `/images/*`, `/shows/*`, and `/shared/*`; responsive info variants come from `backend/lib/responsive-images.js` |
| Browser modules | `script.js` → `shared/app/app.js` | Route-aware dynamic imports under `shared/app/pages/`; shared search, similarity, entity, rendering, and analytics modules under `shared/` |
| Dynamic detail pages | backend server and show/collection renderers | `/shows/:id` and `/collections/:id`; static generated aliases remain for the documented hosting and compatibility contract |
| API and maintainer tools | `backend/server.js`, `backend/lib/routes/`, `site-src/pages/maintainer/` | Public community/submission/review routes and protected maintainer APIs; browser workspaces use modules in `shared/app/pages/` |
| Tests | `tools/test/*.test.js`, `backend/test/*.test.js`, `backend/test/*.smoke.js` | Root `verify` runs tool checks, data/link validation, backend tests, then required-browser smoke tests serially |
| Release/recovery | `deploy/echo`, `deploy/release-common.sh`, `deploy/staging-smoke.js`, backup/rollback scripts | Exact-commit release artifacts, private staging, promotion, backup, and rollback on the configured Linux host |

The backend's direct dependencies all have concrete callers: Express serves
routes, `better-sqlite3` backs storage and backup checks, Cheerio handles HTML
parsing, `fast-xml-parser` parses feeds, Sharp inspects/processes covers,
Playwright drives browser smoke tests, and axe-core powers accessibility
checks. No unused dependency was proven. Client and server text/identity
normalizers remain separate because they serve different schemas and runtime
boundaries; no shared replacement contract was established.

## Simplification and hardening disposition

### Deleted safely

Removed five unreferenced CSS source files:
`shared/styles/base/chat.css` and `shared/styles/home/{cards,filters,hero,responsive}.css`.
The page builder's explicit CSS entry manifest did not import them, a
repository-wide reference search found no consumers, and generated styles are
built from the active entrypoints. The similarly named show-page styles remain
in use. Generated bundles were left to their source builder.

### Refactored safely

- Added catalogue indexes for entity memberships, collection membership,
  similarity evidence, and search candidates to avoid repeated full scans.
  Regression tests compare indexed search and similarity results with
  exhaustive candidates, including evidence gates and ranking.
- Reused show/entity maps during validation and detail rendering.
- Made malformed import-store JSON fail closed and preserved unrelated rows
  when one evidence selection changes.
- Guarded asynchronous Library imports against stale file-selection results;
  made remote catalog fetch errors and invalid JSON explicit.
- Prevented the service worker from caching API responses and added a browser
  regression for that boundary.
- Added route/output manifest coverage and the deterministic-build check to
  `npm run verify`.

### Suspicious but retained

- `shared/archive-similarity.js` is still large. Its ranking, typed evidence,
  and explanation paths are coupled, and this pass found no safe extraction
  boundary that preserves those contracts.
- `deploy/diagnose-restored-database-access.sh` is not a normal release
  entrypoint and is only referenced by structural tests, but its recovery
  diagnostic purpose is not proof that it is obsolete.
- A repo-wide basename scan found 14 tracked root/branding/editorial image
  files with no reference in current source or freshly generated pages:
  `C2-dark.png`, `Circle2-Logo-S.png`, `Horizontal-Logo-W.png`,
  `Horizontal-logo.png`, `Vertical-Logo-W.png`, `Vertical-Logo.png`,
  `about-discovery-panel.png`, `about-founder-orbit.png`, `chat-icon.svg`,
  `filter-svgrepo-com.svg`, `filter.svg`, `gofundme2.svg`,
  `hero-archive-dish.png`, and `patreon.svg`. They remain because the server
  serves image paths as public URLs, so the local source scan cannot establish
  that external links have been retired; some source images may also be kept
  as masters. Catalogue covers are data-driven and were excluded from this
  basename scan; their references and generated variants are checked by the
  catalog/data/build validations. No image or package dependency was deleted
  based only on an absent filename match.

### Intentionally duplicated

- Authored `catalog-src/` and `site-src/` coexist with derived `data/`, root
  pages, hashed assets, and service-worker output. Builds and boundary checks
  enforce this source/generated split.
- Client and server code repeat some data normalization and rendering rules
  across separate browser and Node boundaries. They are not interchangeable
  without an explicit parity contract.

### Legacy but required

Legacy query-string/HTML detail URLs and clean aliases remain for compatibility;
the route manifest, redirects, and public-route tests continue to cover them.
No compatibility route was removed.
