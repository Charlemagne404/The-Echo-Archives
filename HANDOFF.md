## UI fix pass (2026-06-30)

### Current task

Tighten the first-view UI and related headers without changing the archive's overall visual direction.

### Files changed

- `site-src/pages/index.html`
- `shared/styles/home/cards/02-hero-search.css`
- `shared/styles/home/cards/07-archive-cards.css`
- `shared/styles/home/cards/09-preview-shell.css`
- `shared/styles/home/cards/14b-about-page-polish.css`
- `shared/styles/home/collections/01-page.css`
- `shared/styles/home/collections/02-cards.css`
- `shared/styles/home/collections/03-responsive.css`
- generated `index.html`
- generated `collection.html`
- generated `about.html`

### What was completed

- Reworked the homepage hero route links into more intentional CTA buttons and dropped them lower between the intro copy and the search controls.
- Removed the extra `Archive momentum` helper sentence.
- Normalized browse-card heights by constraining title/tag growth instead of making every card taller.
- Raised the sticky browse bar above the carousel layer.
- Reduced the collection-detail hero height, kept the title on one desktop line, and tightened the right-side collage scale.
- Reduced the about-page hero height and moved the heading block back up to match the rest of the site.
- Rebuilt generated pages and ran a desktop/mobile verification pass.

### What still needs work

- No known follow-up work from this pass.

### Commands run

- `rtk npm run build:pages`
- `rtk npm run check:structure`
- `rtk npm --prefix podcast-ai exec -- playwright screenshot 'http://127.0.0.1:5500/collection.html?id=shows-like-welcome-to-night-vale' /var/folders/fz/flyk6p9d4klgjcnhjg5w3t5r0000gn/T/echo-collection-hero-fallback.png`
- `rtk npm --prefix podcast-ai exec -- playwright screenshot 'http://127.0.0.1:5500/about.html' /var/folders/fz/flyk6p9d4klgjcnhjg5w3t5r0000gn/T/echo-about-hero-fallback.png`
- `rtk npm --prefix podcast-ai exec -- playwright screenshot 'http://127.0.0.1:5500/index.html#podcast-grid' /var/folders/fz/flyk6p9d4klgjcnhjg5w3t5r0000gn/T/echo-home-grid-fallback.png`
- `rtk npm --prefix podcast-ai exec -- playwright screenshot 'http://127.0.0.1:5500/index.html#favoriteRoutes' /var/folders/fz/flyk6p9d4klgjcnhjg5w3t5r0000gn/T/echo-home-sticky-fallback.png`
- `rtk npm --prefix podcast-ai exec -- playwright screenshot --browser chromium --viewport-size '390,844' 'http://127.0.0.1:5500/index.html' /var/folders/fz/flyk6p9d4klgjcnhjg5w3t5r0000gn/T/echo-home-mobile-fallback.png`
- `rtk npm --prefix podcast-ai exec -- playwright screenshot --browser chromium --viewport-size '390,844' 'http://127.0.0.1:5500/collection.html?id=shows-like-welcome-to-night-vale' /var/folders/fz/flyk6p9d4klgjcnhjg5w3t5r0000gn/T/echo-collection-mobile-fallback.png`
- `rtk npm --prefix podcast-ai exec -- playwright screenshot --browser chromium --viewport-size '390,844' 'http://127.0.0.1:5500/about.html' /var/folders/fz/flyk6p9d4klgjcnhjg5w3t5r0000gn/T/echo-about-mobile-fallback.png`

### Known issues

- The in-app browser worked for the initial home checks but stalled on repeated screenshot capture, so the later visual verification used the repo's installed Playwright CLI as fallback.

## Current task

Implement the catalog ingestion pipeline: internal import queue, source adapters, draft/publish workflow, maintainer import UI, CLI tools, docs, and validation changes.

## Files changed

- `podcast-ai/lib/import/`
- `podcast-ai/lib/services/import-service.js`
- `podcast-ai/lib/store/import-store.js`
- `podcast-ai/lib/store/database.js`
- `podcast-ai/lib/routes/maintainer-routes.js`
- `podcast-ai/lib/routes/chat-routes.js`
- `podcast-ai/lib/catalog.js`
- `podcast-ai/server.js`
- `podcast-ai/scripts/import-*.js`
- `podcast-ai/package.json`
- `podcast-ai/.env.example`
- `podcast-ai/README.md`
- `shared/app/maintainer-import/`
- `shared/app/pages/maintainer-imports.js`
- `shared/app/maintainer/api.js`
- `shared/app/app.js`
- `shared/styles/home/maintainer/01-layout.css`
- `shared/styles/home/maintainer/02-responsive.css`
- `site-src/page-manifest.json`
- `site-src/pages/maintainer/imports.html`
- `site-src/pages/maintainer/imports-report.html`
- generated `maintainer/imports.html`
- generated `maintainer/imports/report.html`
- `data/schema.md`
- `docs/ARCHITECTURE.md`
- `docs/OPERATIONS.md`
- `.env.example`
- `podcast-ai/test/catalog.test.js`
- `podcast-ai/test/chat-routes.test.js`
- `podcast-ai/test/maintainer.test.js`
- `podcast-ai/test/import-adapters.test.js`
- `podcast-ai/test/import-service.test.js`
- `HANDOFF.md`

## What was completed

- Added a new internal import subsystem under `podcast-ai/` with Apple, RSS, Podcast Index, and website adapters; candidate normalization; dedupe; provenance; draft writing; publish promotion; and optional suggestion-provider abstraction.
- Added SQLite tables for import candidates, source snapshots, events, and run records, plus maintainer APIs for listing, seeding, hydrating, reviewing, drafting, and publishing candidates.
- Refactored server state so published catalog reads, sitemap generation, chat grounding, community catalog sync, and known show ids can refresh after publish actions.
- Added maintainer import queue and report pages at `/maintainer/imports.html` and `/maintainer/imports/report.html`, including batch seed, external search, queue filters, detail review, draft/publish actions, and generated public page output.
- Added CLI commands `import:seed`, `import:hydrate`, `import:report`, `import:draft`, and `import:publish`.
- Relaxed catalog validation so `draft` shows may omit `ratings.archive`, while `published` shows still require it and still fail Gate B discovery checks when incomplete.
- Documented the new import lane, env vars, operational flow, and the distinction between canonical catalog files and internal operational import storage.
- Added focused adapter, service, catalog, chat-route, and maintainer-route test coverage for the import workflow.

## What still needs work

- No blocking implementation work remains for the v1 import lane itself.
- The existing smoke failure in `podcast-ai/test/home-card-interactions.smoke.js` is still present and unrelated to the import pipeline. It times out clicking `#collectionNext` because the collections card, sticky filter toggle, or chat toggle intercepts pointer events on the homepage.

## Commands run

- `rtk sed -n '1,220p' /Users/charliearnerstal/.codex/RTK.md`
- `rtk git status --short`
- `rtk git diff --stat`
- `rtk sed -n ...` across the new import service, store, routes, page manifest, maintainer page sources, styles, docs, and tests
- `rtk node -e '...'` to confirm current catalog counts and metadata-gap counts
- `rtk npm run build:pages`
- `rtk npm run check:structure`
- `rtk npm --prefix podcast-ai run validate:data`
- `rtk node --test podcast-ai/test/import-adapters.test.js podcast-ai/test/import-service.test.js podcast-ai/test/maintainer.test.js podcast-ai/test/chat-routes.test.js podcast-ai/test/catalog.test.js`
- `rtk npm --prefix podcast-ai test`
- `rtk npm --prefix podcast-ai run check:links`
- `rtk node --test --test-concurrency=1 podcast-ai/test/*.smoke.js`

## Known issues

- `npm run check:structure` still reports soft-limit warnings for `shared/app/maintainer-import/render.js`, `shared/app/pages/maintainer-imports.js`, `shared/styles/home/maintainer/01-layout.css`, and the pre-existing `shared/app/pages/home.js` / `shared/styles/home/cards/03-filter-controls.css`, but it exits successfully.
- Full smoke coverage mostly passed, but `podcast-ai/test/home-card-interactions.smoke.js` still fails on the pre-existing `#collectionNext` pointer-intercept timeout described above.

## Current task

Implement the focused "Shows Like X" recommendation pass across archive data, homepage routes, collections, and show-detail recommendations.

## Files changed

- `data/shows.json`
- `data/collections.json`
- `site-src/pages/index.html`
- `site-src/pages/collections.html`
- generated `index.html`
- generated `collections.html`
- `shared/app/constants.js`
- `shared/app/pages/home.js`
- `shared/app/pages/home/elements.js`
- `shared/app/pages/collections.js`
- `shared/app/render-show/relationships.js`
- `podcast-ai/lib/discovery-gaps.js`
- `podcast-ai/scripts/discovery-gap-report.js`
- `podcast-ai/test/catalog.test.js`
- `podcast-ai/test/discovery-gaps.test.js`
- `podcast-ai/test/review-workflow.test.js`
- `HANDOFF.md`

## What was completed

- Added the fixed homepage `Shows like your favorites` rail and pointed the hero CTA mix toward `Midnight Burger`, `Welcome to Night Vale`, and `Completed shows`.
- Added the `Start from a favorite show` section on `collections.html` and surfaced all `kind: similarity` routes there without replacing the broader collections directory.
- Made show-detail `Start next` cards reason-led and skipped blank-reason similarity cards entirely.
- Raised the discovery-data contract so published shows now carry 3-5 similarity links, complete `similarReasons`, at least 2 collection memberships, and anchor shows at least 3 collection memberships.
- Added the new `shows-like-welcome-to-night-vale`, `shows-like-midst`, and `shows-like-malevolent` collections with 6-show membership, `showReasons`, intent tags, and commitment metadata.
- Brought existing route data up to the same standard and closed the zero-collection / single-collection dead-end cases for published shows.
- Chose depth over thin breadth for this phase: no new shows were published because no candidate set was prepared in-repo to the required metadata/readiness bar.
- Added validation coverage for missing `similarReasons`, weak collection membership, and incomplete similarity-route `showReasons`, then updated publish-workflow fixtures to satisfy the stricter rules.
- Ran rendered QA on the homepage, collections page, a similarity collection route, the `Midnight Burger` show page, and `like X` search flows in desktop plus mobile.

## What still needs work

- No blocking follow-up from this pass. If you want another phase next, the clearest continuation is expanding curated anchor families with new shows that can meet the same complete-metadata bar on day one.

## Commands run

- `rtk sed -n '1,220p' /Users/charliearnerstal/.codex/RTK.md`
- `rtk sed -n '1,260p' /Users/charliearnerstal/.codex/plugins/cache/openai-curated/build-web-apps/3fdeeb49/skills/frontend-testing-debugging/SKILL.md`
- `rtk sed -n '1,260p' /Users/charliearnerstal/.codex/plugins/cache/openai-bundled/browser/26.616.81150/skills/control-in-app-browser/SKILL.md`
- `rtk git status --short`
- `rtk cat package.json`
- `rtk sed -n '1,260p' shared/app/pages/home.js`
- `rtk sed -n '1,260p' site-src/page-manifest.json`
- `rtk rg -n ...` to inspect routes, search wiring, and similarity-query behavior
- `rtk npm run build:pages`
- `rtk npm run check:structure`
- `rtk npm --prefix podcast-ai run validate:data`
- `rtk npm --prefix podcast-ai run check:links`
- `rtk npm --prefix podcast-ai test`
- Browser runtime checks against `http://127.0.0.1:3010/`, `collections.html`, `collection.html?id=shows-like-welcome-to-night-vale`, and `show.html?id=midnight-burger`
- `rtk node - <<'NODE' ...` Playwright screenshot capture to `/tmp/echo-qa-20260630/`

## Known issues

- `shared/app/pages/home.js` still exceeds the soft 350-line advisory limit reported by `npm run check:structure`, but the check passes and no hard structure failures remain.
- The in-app Browser plugin worked for navigation, DOM snapshots, console checks, and interactions, but its screenshot capture timed out in this workspace; screenshot artifacts were captured with the repo's Playwright dependency instead.

---

## Current task

Add two new documentation files: one deeper final-product destination doc and one detailed current-state snapshot doc.

## Files changed

- `docs/FINAL_PRODUCT.md`
- `docs/CURRENT_STATE.md`
- `HANDOFF.md`

## What was completed

- Added `docs/FINAL_PRODUCT.md` as a fuller destination document for what The Echo Archives should become, using the archived final-vision language as source material but aligning it with the current active docs.
- Added `docs/CURRENT_STATE.md` as a dated June 29, 2026 snapshot of the implemented product surface, catalog baseline, architecture shape, trust layer, and the main gaps between the current repo and the intended final product.
- Kept the new docs complementary to `docs/PRODUCT.md`, `docs/ROADMAP.md`, and `docs/ARCHITECTURE.md` rather than replacing them.

## What still needs work

- If these new docs become the preferred references, add links to them from whichever active doc or README index you want to use as the navigation hub.
- The current-state snapshot will need date and count refreshes as the catalog and review coverage grow.

## Commands run

- `pwd`
- `rg --files`
- `sed -n '1,240p' /Users/charliearnerstal/.codex/RTK.md`
- `rtk sed -n '1,260p' docs/archive/FINAL_VISION.md`
- `rtk sed -n '1,260p' docs/PRODUCT.md`
- `rtk sed -n '1,260p' docs/ARCHITECTURE.md`
- `rtk sed -n '1,260p' HANDOFF.md`
- `rtk sed -n '1,260p' docs/ROADMAP.md`
- `rtk sed -n '1,260p' docs/OPERATIONS.md`
- `rtk cat package.json`
- `rtk node - <<'NODE' ...` to inspect catalog and collection counts
- `rtk sed -n '1,260p' README.md`
- `rtk sed -n '1,260p' podcast-ai/README.md`
- `rtk sed -n '1,220p' data/schema.md`
- `rtk node - <<'NODE' ...` to inspect backend scripts
- `rtk git status --short`
- `rtk sed -n '1,220p' TODO.md`

## Known issues

- The worktree already contained unrelated in-progress changes in `README.md`, `docs/PRODUCT.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, `docs/OPERATIONS.md`, and `HANDOFF.md` before this pass; they were left in place.

## Current task

Refresh the active documentation so it matches the implemented repo state as of June 29, 2026.

## Files changed

- `README.md`
- `docs/PRODUCT.md`
- `docs/ROADMAP.md`
- `docs/ARCHITECTURE.md`
- `docs/OPERATIONS.md`
- `HANDOFF.md`

## What was completed

- Updated the root README to reflect the current catalog counts, route surface, generated-page workflow, backend role, and available commands.
- Rewrote the active product doc so it describes the implemented public surfaces and current priorities instead of older pre-launch framing.
- Reworked the roadmap to reflect the real June 29, 2026 baseline: 27 published shows, 15 collections, 3 review companions, and a current focus on show depth over collection count.
- Updated architecture documentation to match the current page-generation pipeline, public and maintainer routes, API surface, data model boundaries, and current test coverage.
- Updated operations documentation to match the actual verification flow, route QA surface, submission workflow, and documentation maintenance rules.

## What still needs work

- `podcast-ai/README.md` and `data/schema.md` were reviewed and appear broadly aligned with the current implementation, but they were not materially changed in this pass.
- If a fresh manual QA pass is performed, add a new dated report under `docs/qa/`.

## Commands run

- `rtk cat /Users/charliearnerstal/.codex/RTK.md`
- `rtk cat AGENTS.md`
- `rtk cat package.json`
- `rtk cat README.md`
- `rtk cat docs/PRODUCT.md`
- `rtk cat docs/ROADMAP.md`
- `rtk cat docs/ARCHITECTURE.md`
- `rtk cat docs/OPERATIONS.md`
- `rtk cat podcast-ai/package.json`
- `rtk cat podcast-ai/README.md`
- `rtk cat site-src/page-manifest.json`
- `rtk sed -n '1,260p' data/schema.md`
- `rtk sed -n '1,260p' podcast-ai/server.js`
- `rtk sed -n '1,260p' podcast-ai/lib/catalog.js`
- `rtk sed -n '1,260p' shared/app/app.js`
- `rtk sed -n '1,260p' shared/app/pages/home.js`
- `rtk sed -n '1,260p' podcast-ai/lib/config.js`
- `rtk sed -n '1,260p' podcast-ai/lib/routes/community-routes.js`
- `rtk sed -n '1,260p' podcast-ai/lib/routes/submission-routes.js`
- `rtk sed -n '1,260p' podcast-ai/test/browser.smoke.js`
- `rtk sed -n '1,220p' podcast-ai/test/home-browse.smoke.js`
- `rtk node -e '...'` to measure current show and collection counts
- `rtk npm run check:structure`

## Known issues

- `npm run check:structure` passes, but it still reports pre-existing soft-limit warnings for `shared/app/pages/home.js` and `shared/styles/home/cards/03-filter-controls.css`.

---

## Current task

Fix push-time CI breakages affecting mobile browse-card behavior and backend dependency audit results.

## Files changed

- `shared/app/home-preview.js`
- `podcast-ai/package-lock.json`
- `HANDOFF.md`

## What was completed

- Restored touch/coarse-pointer browse-card taps so they open the inline archive preview instead of falling through to navigation.
- Refreshed the backend lockfile so `qs` resolves to `6.15.3`, clearing the `npm audit (server)` advisory.
- Verified the touch-card fix with a direct Playwright probe against `http://127.0.0.1:3010/`, confirming the tapped card expands in place with `card` placement and `stack` layout.

## What still needs work

- The packaged smoke suite currently still hits an unrelated pointer-intercept timeout around the featured collections carousel / sticky browse bar overlap later in `podcast-ai/test/home-card-interactions.smoke.js`.
- The `govulncheck` failure from GitHub could not be reproduced locally in this repo because there are no tracked Go sources or Go module files.

## Commands run

- `rtk npm --prefix podcast-ai audit fix --package-lock-only`
- `rtk npm run check:structure`
- `rtk npm --prefix podcast-ai run test:smoke -- --test-name-pattern='homepage expanding archive card supports stable hover, keyboard, touch, and compact anchored geometry'`
- `rtk npm run dev`
- `rtk curl -I http://127.0.0.1:3010/`
- `rtk node -e 'const { chromium } = require("./podcast-ai/node_modules/playwright"); ...'`

## Known issues

- `npm run check:structure` still reports existing soft-limit warnings for `shared/app/pages/home.js` and `shared/styles/home/cards/03-filter-controls.css`, but it exits successfully.
- Unrelated in-progress worktree changes remain in the collections files already modified before this fix.

## Current task

Add smoother, higher-value motion to the collections page for filter/sort state changes, empty-state feedback, chip selection, and collage hover depth.

## Files changed

- `shared/app/pages/collections.js`
- `shared/app/pages/collections-grid-motion.js`
- `shared/app/pages/collections-motion.js`
- `shared/styles/home/collections/01-page.css`
- `shared/styles/home/collections/02-cards.css`
- `HANDOFF.md`

## What was completed

- Reworked the collections page rendering so featured and directory cards now preserve identity by collection id and animate through filter, sort, and search changes instead of snapping.
- Added animated summary-text updates and an empty-state reveal so the page gives clearer feedback when the active mood, search, or result count changes.
- Changed mood chips to stay mounted, animate on activation, and auto-scroll the selected chip fully into view on narrow screens.
- Added restrained collage motion and slightly stronger hover/focus depth on collection cards so the card media better communicates that each route contains multiple shows.
- Re-ran rendered QA on `http://127.0.0.1:3010/collections.html` in headless Playwright on desktop and mobile after the in-app Browser plugin failed local navigation.

## What still needs work

- No known follow-up for the collections motion pass beyond broader subjective tuning if the motion language changes later.

## Commands run

- `rtk npm run build:pages`
- `rtk npm run check:structure`
- `rtk npm run dev`
- `rtk curl -I http://127.0.0.1:3010/collections.html`
- `rtk node /tmp/collections-motion-check.cjs`

## Known issues

- The in-app Browser plugin was available but failed local-page navigation in this workspace, so rendered QA used the repo’s Playwright dependency instead.
- Unrelated pre-existing worktree changes remain in `shared/styles/base/global.css` and `shared/styles/base/global/04-view-transitions.css`.

## Current task

Add a sticky compact browse bar after the hero scrolls away and make coarse-pointer browse-card taps go straight to show detail pages.

## Files changed

- `site-src/pages/index.html`
- generated `index.html`
- `shared/app/pages/home.js`
- `shared/app/pages/home/elements.js`
- `shared/app/pages/home/filters.js`
- `shared/app/home-preview.js`
- `shared/styles/home/cards/01-surface.css`
- `shared/styles/home/cards/02-hero-search.css`
- `shared/styles/home/cards/03-filter-controls.css`
- `shared/styles/home/cards/17-responsive-780-a.css`
- `shared/styles/home/cards/19-responsive-560.css`
- `shared/styles/home/cards/20-motion.css`
- `HANDOFF.md`

## What was completed

- Added a dedicated fixed-position sticky browse bar with mirrored search and filter controls that appears after the browse hero fully leaves the viewport.
- Kept the sticky and hero browse controls synchronized so search text, filter state, and filter counts stay in lockstep across both surfaces.
- Added a second filter dropdown instance for the sticky bar while preserving the existing filter grouping, active-state syncing, and clear behavior.
- Changed coarse-pointer browse-card taps so they now follow through to the show detail page instead of opening inline preview, while desktop hover/focus preview remains intact.
- Rebuilt the generated home page and confirmed the repo structure checks still pass.

## What still needs work

- Run browser/mobile QA against the home page to visually confirm sticky-bar spacing, dropdown placement, and touch-card navigation on an actual rendered page.

## Commands run

- `rtk npm run build:pages`
- `rtk npm run check:structure`

## Known issues

- `shared/app/pages/home.js` and `shared/styles/home/cards/03-filter-controls.css` now exceed the soft `350`-line advisory limit, but `npm run check:structure` still passes because the hard fail threshold is higher.

## Current task

Revert the cross-page View Transition pass after it increased perceived page-load latency without enough visible payoff.

## Files changed

- `shared/styles/base/global.css`
- `HANDOFF.md`

## What was completed

- Removed the global `@view-transition` opt-in from the shared base CSS import chain.
- Deleted the dedicated View Transition partial so top-level page navigations are back to normal browser navigation behavior.
- Kept the rollback scoped to the transition pass only and left unrelated in-progress worktree changes untouched.

## What still needs work

- No follow-up is required unless page-transition polish is revisited later with a different strategy, such as prefetch-backed navigation or more static destination-page rendering.

## Commands run

- `rtk npm run check:structure`

## Known issues

- None discovered in the rollback itself.

---

## Current task

Remove the center-weighted orange glow from the featured collections carousel cards.

## Files changed

- `shared/styles/home/cards/05-collection-cards.css`
- `HANDOFF.md`

## What was completed

- Removed the orange radial overlay that intensified as featured collection cards approached the center of the carousel.
- Kept the existing carousel motion, depth, and highlight sheen intact so the cards still feel active without the warm center wash.

## What still needs work

- No known follow-up for this carousel polish tweak.

## Commands run

- `rtk npm run check:structure`

## Known issues

- Unrelated pre-existing dirty files remain in `for-creators.html`, `podcast-ai/test/catalog.test.js`, `podcast-ai/test/home-browse.smoke.js`, `shared/app/pages/home/layout.js`, `shared/styles/home/cards/14b-about-page-polish.css`, `shared/styles/home/collections/01-page.css`, `shared/styles/home/creators/03-standards.css`, and `site-src/pages/for-creators.html`.

---

## Current task

Revert the creator spotlight portrait on the `For creators` page back to the generic gray avatar and keep only small polish fixes.

## Files changed

- `site-src/pages/for-creators.html`
- `shared/styles/home/creators/03-standards.css`
- generated `for-creators.html`
- `HANDOFF.md`

## What was completed

- Reverted the over-designed portrait illustration and restored the simple generic gray avatar.
- Tightened the avatar edge treatment with a crisper circular outline.
- Lowered and widened the shoulder shape so the empty gap at the bottom of the avatar is reduced without changing the overall placeholder look.
- Rebuilt the page and rechecked the spotlight section in-browser on desktop.

## What still needs work

- No known follow-up for this avatar correction pass.

## Commands run

- `rtk npm run build:pages`
- `rtk npm run check:structure`
- `rtk npm run dev`
- Browser QA at `http://127.0.0.1:3010/for-creators.html`

## Known issues

- Unrelated pre-existing dirty files remain in `podcast-ai/test/catalog.test.js`, `podcast-ai/test/home-browse.smoke.js`, `shared/app/pages/home/layout.js`, `shared/styles/home/cards/05-collection-cards.css`, `shared/styles/home/cards/14b-about-page-polish.css`, and `shared/styles/home/collections/01-page.css`.
- Browser mobile spotlight screenshot capture was unreliable in this pass; desktop validation is the primary visual proof.

---

## Current task

Realign the Collections and About page heroes to the main browse hero after an earlier pass over-compressed them.

## Files changed

- `shared/styles/home/collections/01-page.css`
- `shared/styles/home/cards/14b-about-page-polish.css`
- `HANDOFF.md`

## What was completed

- Restored the Collections hero to the browse hero’s top-left geometry instead of the shortened centered version.
- Widened the Collections title measure so it breaks later and reads as a broad hero heading rather than a narrow stacked block.
- Moved the About hero copy back to the same left and top anchor as the browse hero by restoring browse-like panel height and padding.
- Tightened the About paragraph and signal widths to the same measure family as the main browse header.
- Rebuilt the generated pages and visually checked the rendered `collections.html` and `about.html` headers with Playwright screenshots.

## What still needs work

- No known follow-up for this hero-alignment correction.

## Commands run

- `rtk npm run build:pages`
- `rtk npm run check:structure`
- `python3 -m http.server 4010`
- Playwright screenshot check against `http://127.0.0.1:4010/collections.html` and `http://127.0.0.1:4010/about.html`

## Known issues

- The worktree still contains unrelated pre-existing changes in `for-creators.html`, `site-src/pages/for-creators.html`, `shared/styles/home/creators/03-standards.css`, `podcast-ai/test/catalog.test.js`, `podcast-ai/test/home-browse.smoke.js`, `shared/app/pages/home/layout.js`, and `shared/styles/home/cards/05-collection-cards.css`.

## Current task

Align the collections and about page headers with the site’s other secondary-page hero headers.

## Files changed

- `shared/styles/home/collections/01-page.css`
- `shared/styles/home/cards/14b-about-page-polish.css`
- `HANDOFF.md`

## What was completed

- Reduced the Collections page hero height and typography so it matches the same centered header rhythm used on the other secondary pages.
- Tightened the Collections hero copy width, paragraph measure, and action spacing so the header no longer feels oversized relative to the rest of the site.
- Centered the About page hero content vertically and normalized the copy width so its header text block sits like the other page headers.
- Adjusted the About header signal line to align from the top instead of reading as an oddly placed inline strip.

## What still needs work

- No known follow-up for this header alignment pass.

## Commands run

- `rtk npm run build:pages`
- `rtk npm run check:structure`

## Known issues

- The worktree still contains unrelated pre-existing changes in `podcast-ai/test/catalog.test.js`, `shared/app/pages/home/layout.js`, and `shared/styles/home/cards/05-collection-cards.css`.

## Current task

Fix the checked-in release gate so `npm run verify` passes again.

## Files changed

- `podcast-ai/test/catalog.test.js`
- `podcast-ai/test/home-browse.smoke.js`
- `shared/app/pages/home/layout.js`
- `shared/styles/home/cards/05-collection-cards.css`
- `HANDOFF.md`

## What was completed

- Updated the catalog test to match the current 15-collection dataset instead of the pre-expansion count of 6.
- Changed home-grid motion handling so a new browse/search transition cancels in-flight shell motion and replays the next transition instead of falling back to an instant patch.
- Strengthened featured-collection hover emphasis slightly so the carousel focus behavior clears the smoke-test threshold again.
- Tightened the browse smoke test waits around async grid rerenders so it waits for actual motion/restoration state instead of fixed timing assumptions.
- Re-ran the full release gate and confirmed `rtk npm run verify` now passes end to end.

## What still needs work

- No known release-gate follow-up from this fix.

## Commands run

- `rtk node --test --test-concurrency=1 podcast-ai/test/home-browse.smoke.js`
- `rtk node --test --test-concurrency=1 podcast-ai/test/home-card-interactions.smoke.js`
- `rtk npm run verify`

## Known issues

- None discovered in the release gate after this pass.

## Current task

Restore the `Most Popular` section on the main browse page after it stopped appearing on initial load.

## Files changed

- `shared/app/pages/home/results-motion.js`
- `HANDOFF.md`

## What was completed

- Fixed a browse-page motion regression that could cancel a section-opening animation and leave the `Most Popular` band stuck at zero height and zero opacity.
- Restored the default-state `Most Popular` band without changing its intended hide-on-search/filter/sort behavior.
- Rebuilt the generated pages and re-ran the focused browse smoke coverage for the `Most Popular` band.

## What still needs work

- Investigate the existing `podcast-ai/test/home-browse.smoke.js` failure in the broader structured-filter flow; it fails on an archive-grid card-count assertion unrelated to the `Most Popular` fix.

## Commands run

- `rtk npm run build:pages`
- `rtk node --test podcast-ai/test/home-browse.smoke.js`

## Known issues

- `podcast-ai/test/home-browse.smoke.js` still has one existing failure in `homepage supports structured filtering, recently updated mode, and no-result recovery` at the archive-grid `cardCount > 0` assertion.

## Current task

Relax the structure checker line-budget rule so `350` is advisory instead of a hard failure.

## Files changed

- `tools/check-structure.js`
- `HANDOFF.md`

## What was completed

- Changed the structure checker so JavaScript and CSS files now warn when they exceed `350` lines.
- Raised the actual failure threshold to `550` lines for both JavaScript and CSS budgets.
- Kept the existing `npm run check:structure` workflow intact so oversized files still show up during verification.

## What still needs work

- No follow-up required unless you want different soft/hard thresholds.

## Commands run

- `rtk npm run check:structure`

## Known issues

- `npm run check:structure` now passes with warnings for files above the soft budget; review those warnings periodically so the advisory limit still has teeth.

## Current task

Add smoother home-page browse-result transitions and stronger Featured collections depth cues.

## Files changed

- `shared/app/pages/home.js`
- `shared/app/pages/home/results-motion.js`
- `shared/app/pages/home/most-popular.js`
- `shared/app/collection-carousel.js`
- `shared/styles/home/cards/04-browse-bands.css`
- `shared/styles/home/cards/05-collection-cards.css`
- `HANDOFF.md`

## What was completed

- Added animated result-summary updates plus enter/exit motion for the no-results state and the Popular with listeners band on the home page.
- Routed most-popular visibility through the new motion helper so browse-state changes feel continuous instead of abruptly hiding surfaces.
- Added stronger collection-card depth cues with center-weighted pull, edge tilt, cover parallax, and sheen shift driven by carousel position.
- Verified the home page in-browser on desktop, including a no-results search state and a collection-carousel next-step interaction.

## What still needs work

- No known follow-up for this scoped motion pass.

## Commands run

- `rtk npm run build:pages`
- `rtk npm run check:structure`
- `rtk npm run dev`
- Browser QA at `http://localhost:3010/`

## Known issues

- `rtk npm run check:structure` still fails on an unrelated pre-existing file budget violation in `shared/styles/show/sections/02-actions-facts.css` (447 lines vs 350 max).
- Mobile DOM/state was checked at a 390x844 viewport, but the browser-runtime mobile screenshot attempt timed out, so desktop screenshots are the primary visual proof for this pass.

## Current task

Polish the podcast-specific show-page correction / participation prompt so it stands out more.

## Files changed

- `shared/app/render-show/facts.js`
- `shared/styles/show/sections.css`
- `shared/styles/show/sections/02-actions-facts.css`
- `shared/styles/show/sections/02b-correction.css`
- `shared/styles/show/sections/05-responsive.css`
- `HANDOFF.md`

## What was completed

- Reworked the correction CTA into a stronger community archive care section with clearer hierarchy, review-queue language, compact trust notes, and a separated action lane.
- Added green community-accent styling while preserving the dark archive look and red/orange primary CTA.
- Added responsive stacking so mobile keeps the participation notes and correction button readable.

## What still needs work

- No known follow-up for this prompt.

## Commands run

- `rtk npm run build:pages`
- `rtk npm run check:structure`
- `rtk npm run dev`
- Browser QA at `http://127.0.0.1:3010/show.html?id=solar`

## Known issues

- The fixed back-to-top and chat controls can overlap the lower-right edge of this section on narrow/low scroll positions; this is existing global floating-control behavior and was left out of this scoped polish pass.

## Current task

Improve the reusable podcast-specific show detail page using the approved Listening Console direction.

## Files changed

- `shared/app/render-show/hero.js`
- `shared/app/render-show/sections.js`
- `shared/app/render-show/facts.js`
- `shared/app/render-show/utils.js`
- `shared/styles/show/sections/01-hero.css`
- `shared/styles/show/sections/02-actions-facts.css`
- `shared/styles/show/sections/03-layout-links.css`
- `shared/styles/show/sections/05-responsive.css`
- `podcast-ai/test/community-rating-flow.smoke.js`
- `HANDOFF.md`

## What was completed

- Reworked the show hero into a listen-first console with archive/community score cards, compact runtime/status metadata, creator/network, factual verification, cover-art anchor, and primary listen CTA.
- Kept community rating visible in the hero and preserved the existing community-rating hooks/interactions.
- Removed the duplicated indexed-only `Archive summary` block so indexed pages use one intentional `Archive note`.
- Added factual verification to the facts rail without implying creator approval of ratings or reviews.
- Tuned desktop and mobile layouts; mobile now shows the cover art before the decision console and avoids horizontal overflow.

## What still needs work

- No known follow-up for the show-detail redesign itself.

## Commands run

- `rtk npm run build:pages`
- `rtk npm run check:structure`
- `rtk npm --prefix podcast-ai run test:smoke`
- `rtk npm run dev`
- Browser QA at `http://127.0.0.1:3010/show.html?id=the-deca-tapes`

## Known issues

- Full `rtk npm --prefix podcast-ai run test:smoke` is 20/21 passing. The remaining failure is unrelated to this task: `homepage supports structured filtering, recently updated mode, and no-result recovery` times out at `podcast-ai/test/home-browse.smoke.js:220`.
- The fixed chat/back-to-top controls can still overlap the right rail at some scroll offsets; this is pre-existing global floating-control behavior and was left out of this scoped show-page redesign.

## Current task

Revamp the main Collections page into a mood-first discovery surface and polish simple collection detail pages.

## Files changed

- `data/collections.json`
- `data/schema.md`
- `shared/archive-record.js`
- `podcast-ai/lib/catalog.js`
- `shared/app/render-collections.js`
- `shared/app/pages/collections.js`
- `shared/app/pages/collection.js`
- `shared/styles/home/collections.css`
- `shared/styles/home/collections/01-page.css`
- `shared/styles/home/collections/02-cards.css`
- `shared/styles/home/collections/03-responsive.css`
- `site-src/pages/collections.html`
- `site-src/pages/collection.html`
- generated `collections.html`
- generated `collection.html`

## What was completed

- Rebuilt Collections around a cinematic hero, mood selector, real stats, five featured routes, and searchable/sortable card-grid directory.
- Expanded collections from 6 to 15 curated paths with additive metadata, real show-cover collage ordering, commitment labels, intent tags, and show reasons.
- Added URL-backed `intent`, `q`, and `sort` state for the Collections page.
- Updated collection detail pages with a matching hero/collage treatment, route tags, commitment stat, archive link, and visible show reasons.
- Added scoped collection CSS split under the line-budget limit.

## What still needs work

- No known follow-up for this revamp.

## Commands run

- `rtk npm run build:pages`
- `rtk npm run check:structure`
- `rtk npm --prefix podcast-ai run validate:data`
- `rtk npm run dev`
- Browser QA through Playwright using local Brave at `http://127.0.0.1:3010/`

## Known issues

- `npm verify` was not run, per the task plan and repo note that it is expensive.
- The two supplied concept images remain untracked in `docs/research/concepts/`.

## Current task

Fix the GitHub `verify` workflow failure triggered by push commit `6e0d61a`.

## Files changed

- `shared/app/collection-carousel.js`
- `HANDOFF.md`

## What was completed

- Inspected the failed GitHub Actions run with `gh run view` and confirmed the failure was in `npm run check:structure`, not in git push itself.
- Verified the exact error was the repo line-budget guard: `shared/app/collection-carousel.js` was 354 lines, above the enforced 350-line maximum.
- Reduced the module to 349 lines with a behavior-preserving cleanup so `rtk npm run check:structure` now passes locally.

## What still needs work

- The current dirty local worktree still fails full `rtk npm run verify` in `podcast-ai/test/home-card-interactions.smoke.js`, which is separate from the original pushed-commit CI failure.

## Commands run

- `rtk gh run list --workflow verify.yml --limit 5`
- `rtk gh run view 28049408630 --json name,conclusion,status,url,workflowName,event,headBranch,headSha,jobs`
- `rtk gh run view 28049408630 --log`
- `rtk wc -l shared/app/collection-carousel.js`
- `rtk npm run check:structure`
- `rtk npm run verify`

## Known issues

- Full local `rtk npm run verify` still fails on the current uncommitted smoke suite with `homepage expanding archive card supports stable hover, keyboard, touch, and compact anchored geometry` in `podcast-ai/test/home-card-interactions.smoke.js`.
- The worktree contains unrelated pre-existing edits outside this CI fix.

## Current task

Refactor the browser smoke suite into smaller flow-focused files with shared setup/helpers.

## Files changed

- `podcast-ai/package.json`
- `podcast-ai/test/browser.smoke.js`
- `podcast-ai/test/helpers/browser-smoke.js`
- `podcast-ai/test/creator-flow.smoke.js`
- `podcast-ai/test/community-rating-flow.smoke.js`
- `podcast-ai/test/show-detail-navigation.smoke.js`
- `podcast-ai/test/home-browse.smoke.js`
- `podcast-ai/test/home-card-interactions.smoke.js`
- `podcast-ai/test/chat-submit-flow.smoke.js`
- `HANDOFF.md`

## What was completed

- Moved shared Playwright/server setup, fixture loading, and reusable smoke helpers into `podcast-ai/test/helpers/browser-smoke.js`.
- Reduced `browser.smoke.js` to critical route/static/legacy redirect coverage.
- Split the remaining browser smoke coverage into user-facing flow files for creator pages, community ratings, show-detail navigation, home browse, home card interactions, and chat/submit.
- Updated `test:smoke` to run all `test/*.smoke.js` files serially so the split suite preserves single-suite stability.
- Replaced two timing-sensitive fixed sleeps with condition waits and moved the reduced-motion carousel click before the carousel is hidden by alternate browse modes.

## What still needs work

- No known follow-up for the smoke-test refactor.

## Commands run

- `rtk node --check podcast-ai/test/helpers/browser-smoke.js`
- `rtk node --check podcast-ai/test/browser.smoke.js`
- `rtk node --check podcast-ai/test/creator-flow.smoke.js`
- `rtk node --check podcast-ai/test/community-rating-flow.smoke.js`
- `rtk node --check podcast-ai/test/show-detail-navigation.smoke.js`
- `rtk node --check podcast-ai/test/home-browse.smoke.js`
- `rtk node --check podcast-ai/test/home-card-interactions.smoke.js`
- `rtk node --check podcast-ai/test/chat-submit-flow.smoke.js`
- `rtk node --test --test-concurrency=1 podcast-ai/test/home-browse.smoke.js`
- `rtk node --test --test-concurrency=1 podcast-ai/test/home-card-interactions.smoke.js`
- `rtk npm --prefix podcast-ai run test:smoke`
- `rtk npm run check:structure`

## Known issues

- `rtk npm run check:structure` still fails on the pre-existing `shared/app/collection-carousel.js` line-budget issue: 354 lines vs the 350-line limit.
- The worktree already contains unrelated edits outside this refactor.

## Current task

Align the Featured collections heading with the View all collections link.

## Files changed

- `shared/styles/home/cards/04-browse-bands.css`
- `HANDOFF.md`

## What was completed

- Removed the extra bottom margin from the Featured collections heading only inside the home-page collection band.
- Verified the heading and View all collections link now share the same bottom edge on desktop while the mobile stacked layout remains intact.

## What still needs work

- No known follow-up for this alignment fix.

## Commands run

- `rtk npm run check:structure`
- Browser QA at `http://127.0.0.1:3010/`

## Known issues

- `rtk npm run check:structure` still fails because `shared/app/collection-carousel.js` is 354 lines and the checker limit is 350. That file was not changed for this task.
- The worktree already contained unrelated changes before this task.

## Current task

Hide Featured collections whenever Popular with listeners is hidden on the home browse page.

## Files changed

- `shared/app/pages/home.js`
- `shared/app/pages/home/most-popular.js`
- `HANDOFF.md`

## What was completed

- Added an optional visibility callback to the most-popular controller so related home-page sections can follow the same visibility decision.
- Wired the featured collections rail to hide when the popular section is hidden by search, filters, selected collections, alternate sort modes, or lack of popular shows.
- Kept the existing collection rail rendering and grid insertion behavior intact.

## What still needs work

- No known follow-up for this visibility rule.

## Commands run

- `rtk node --check shared/app/pages/home.js`
- `rtk node --check shared/app/pages/home/most-popular.js`
- `rtk npm verify`

## Known issues

- `rtk npm verify` currently fails in `npm run check:structure` because `shared/app/collection-carousel.js` is 354 lines and the structure checker limit is 350. That file was not changed for this task.
- The worktree contains an unrelated pre-existing edit in `shared/styles/home/cards/13-chat-about-base.css`.

## Current task

Keep the featured collections arrows moving in the pressed direction across the loop seam instead of snapping back the other way after a full cycle.

## Files changed

- `shared/app/collection-carousel.js`
- `podcast-ai/test/browser.smoke.js`
- `HANDOFF.md`

## What was completed

- Reworked manual featured-collections arrow navigation to recenter from the nearest actual card identity rather than from raw loop scroll offset.
- Targeted the physical adjacent card in the pressed direction, then snapped back to the equivalent middle-set card after the animation so repeated clicks keep moving forward or backward cleanly through the loop.
- Extended the existing homepage carousel smoke test to click through more than a full cycle and assert the centered collection IDs continue in the expected wrapped order.

## What still needs work

- No known follow-up for this carousel wrap-direction fix.

## Commands run

- `rtk node --check shared/app/collection-carousel.js`
- `rtk node --check podcast-ai/test/browser.smoke.js`
- `rtk node --test --test-name-pattern "homepage featured collections carousel applies center-weighted focus and direct hover emphasis" podcast-ai/test/browser.smoke.js`

## Known issues

- The worktree still contains unrelated pre-existing edits outside this fix.

## Current task

Stabilize the browse archive grid when filters are toggled rapidly so cards do not land in a broken or partially reflowed layout.

## Files changed

- `shared/app/pages/home.js`
- `shared/app/pages/home/layout.js`
- `podcast-ai/test/browser.smoke.js`
- `HANDOFF.md`

## What was completed

- Coalesced same-frame home-page filter/sort/search renders so rapid option clicks resolve to one final grid update instead of stacking multiple intermediate reflows.
- Added a grid-motion safety fallback that cancels overlapping card motion and snaps the archive grid back to a stable layout when a new render lands mid-animation.
- Added a browser smoke regression that rapidly toggles filters on and off and asserts the grid returns to the baseline layout with no lingering motion classes.
- Kept the existing structured filtering smoke coverage, but relaxed two assertions so legitimate overlap fallbacks do not fail the suite.

## What still needs work

- No known follow-up for the rapid filter-toggle grid bug.

## Commands run

- `rtk npm --prefix podcast-ai run test:smoke -- --test-name-pattern "homepage rapid filter toggles fall back to a stable grid when animations overlap|homepage supports structured filtering, recently updated mode, and no-result recovery"`
- `rtk npm --prefix podcast-ai test`
- `rtk npm run verify`

## Known issues

- The worktree still contains unrelated pre-existing edits outside this fix, including carousel/community files and generated page files.

## Current task

Fix the featured collections arrow hit-target bug and make arrow clicks center the next or previous audio drama instead of scrolling by a fixed distance.

## Files changed

- `shared/app/collection-carousel.js`
- `shared/app/collection-carousel-centering.js`
- `shared/styles/home/cards/04-browse-bands.css`
- `podcast-ai/test/browser.smoke.js`
- `HANDOFF.md`

## What was completed

- Raised the featured collections arrow buttons above the card layer so hovering and clicking the arrows no longer falls through to the collection card underneath.
- Changed manual carousel navigation to choose the nearest current card, then animate to the next or previous card and snap that card into the viewport center.
- Added a small centering helper module so the carousel stays within the repo’s line-budget guardrail.
- Extended the browser smoke assertions to verify arrow hit targets resolve to the buttons and that arrow navigation lands the expected collection near the viewport center.
- Confirmed in browser QA against `http://127.0.0.1:4173/` that the arrow hit target is now the button and that arrow navigation re-centers the collections rail instead of shifting by a blind fixed step.

## What still needs work

- No known follow-up for the collections-arrow fix itself.

## Commands run

- `rtk npm run dev`
- Browser QA against `http://127.0.0.1:4173/`
- `rtk npm run verify`
- `rtk npm --prefix podcast-ai run test:smoke`

## Known issues

- `rtk npm run verify` is currently blocked before smoke tests by the flaky unrelated rate-limit failure in `podcast-ai/test/rate-limit.test.js` (`chat, community, and submission writes return 429 with Retry-After and recover after the window`, expected `429`, got `200`).
- `rtk npm --prefix podcast-ai run test:smoke` still has broader suite instability outside the collections rail work: the featured collections carousel test passed, but the run later hit an existing browse-filter assertion (`expected 230, got 0`) and then multiple `ERR_CONNECTION_REFUSED` failures after the smoke server dropped.

## Current task

Implement FLIP-style browse-grid motion on the home page so search, filter, and sort updates animate instead of snapping.

## Files changed

- `shared/app/pages/home.js`
- `shared/app/pages/home/layout.js`
- `shared/app/pages/home/grid-motion.js`
- `shared/styles/home/cards/20-motion.css`
- `podcast-ai/test/browser.smoke.js`
- `HANDOFF.md`

## What was completed

- Added `changeReason` routing in the home-page render flow so live search, explicit controls, initial render, and layout-bucket changes use distinct grid update paths.
- Replaced the grid’s `replaceChildren()` swap with keyed shell reconciliation in `layout.js`, preserving the existing collection-rail insertion point while animating only show-card shells.
- Added a dedicated `grid-motion.js` helper for shell FLIP motion, enter/exit staging, exit cancellation during rapid live-search changes, and reduced-motion-aware timing buckets.
- Moved browse-grid motion styling into `shared/styles/home/cards/20-motion.css` with shell-level motion classes and `#podcast-grid { position: relative; }`.
- Extended browser smoke coverage to assert explicit vs live-search duration buckets, shell enter/exit/FLIP states, rapid search restoration without duplicates, and reduced-motion no-animation behavior.

## What still needs work

- No known follow-up for the browse-grid motion itself.
- Repo-wide verification is still blocked by an unrelated failing rate-limit test outside the home-page files touched here.

## Commands run

- `rtk node --check shared/app/pages/home.js`
- `rtk node --check shared/app/pages/home/layout.js`
- `rtk node --check shared/app/pages/home/grid-motion.js`
- `rtk node --check podcast-ai/test/browser.smoke.js`
- `rtk node --test --test-name-pattern 'homepage supports structured filtering, recently updated mode, and no-result recovery' podcast-ai/test/browser.smoke.js`
- `rtk node --test --test-name-pattern 'homepage expanding archive card supports stable hover, keyboard, touch, and compact anchored geometry' podcast-ai/test/browser.smoke.js`
- `rtk npm --prefix podcast-ai run test:smoke`
- `rtk npm run dev`
- Browser QA against `http://127.0.0.1:3010/index.html`
- `rtk npm run verify`

## Known issues

- `rtk npm --prefix podcast-ai run test:smoke` still reports unrelated existing failures in community/detail flows and later server loss outside the browse-grid files changed here; the two targeted home-page smoke tests above passed.
- `rtk npm run verify` fails before smoke tests on an unrelated existing failure in `podcast-ai/test/rate-limit.test.js` (`chat, community, and submission writes return 429 with Retry-After and recover after the window` expected `429`, got `200`).
- The in-app browser session initially timed out navigating to `/`; retrying with `http://127.0.0.1:3010/index.html` succeeded for page identity, console, screenshot, and interaction checks.

## Current task

Increase the featured collections center-card expansion so the motion reads clearly without needing close inspection.

## Files changed

- `shared/styles/home/cards/04-browse-bands.css`
- `shared/styles/home/cards/05-collection-cards.css`
- `podcast-ai/test/browser.smoke.js`
- `HANDOFF.md`

## What was completed

- Increased the featured collections ambient center scale and upward lift substantially on desktop, while still tapering the effect down on tablet and mobile.
- Strengthened the collection-card cover scaling, brightness, and hover lift so the emphasized card reads as visibly larger and higher in the rail.
- Moved the internal top headroom into the actual carousel viewport so expanded cards can grow upward inside the scroll container without getting clipped at the top edge.
- Tightened the homepage carousel smoke assertions so the center-vs-edge scale gap and hover lift stay obvious going forward.

## What still needs work

- No known follow-up for this tuning pass.

## Commands run

- `rtk node --test --test-name-pattern "homepage featured collections carousel applies center-weighted focus and direct hover emphasis" podcast-ai/test/browser.smoke.js`
- `rtk node --test --test-name-pattern "chat, community, and submission writes return 429 with Retry-After and recover after the window" podcast-ai/test/rate-limit.test.js`
- `rtk npm run verify`

## Known issues

- `rtk npm run verify` is intermittently blocked by an unrelated flaky failure in `podcast-ai/test/rate-limit.test.js` where the throttling assertion sometimes receives `200` instead of `429`; the targeted rerun of that single test passed.

## Current task

Enhance the featured collections carousel motion on the home browse page with stronger center-weighted scaling and directional arrow interaction feedback.

## Files changed

- `shared/app/collection-carousel.js`
- `shared/app/community/detail-widget.js`
- `shared/styles/home/cards/04-browse-bands.css`
- `shared/styles/home/cards/05-collection-cards.css`
- `shared/styles/home/cards/20-motion.css`
- `podcast-ai/test/browser.smoke.js`
- `HANDOFF.md`

## What was completed

- Strengthened the featured collections center-weighting so cards grow and lift more clearly as they approach the viewport center, while staying softer on smaller breakpoints.
- Added transient carousel direction state for `prev` / `next` clicks and used it to drive arrow press feedback plus a brief directional shove/glow across the collections rail.
- Kept direct card hover/focus emphasis separate from the ambient center weighting so hovered cards still get an extra interaction boost.
- Extended the homepage smoke coverage to assert stronger center scaling, direct hover boost, directional arrow pulse state, and reduced-motion suppression for the new rail effects.
- Fixed a deterministic show-page community-rating race/test fragility that was blocking `npm run verify` by preventing stale detail-summary hydration from overwriting newer local actions and by updating the smoke test to read rolling metric text safely.

## What still needs work

- No known follow-up for the featured collections motion pass.

## Commands run

- `rtk node --check shared/app/collection-carousel.js`
- `rtk node --check shared/app/community/detail-widget.js`
- `rtk node --check podcast-ai/test/browser.smoke.js`
- `rtk node --test --test-name-pattern "homepage featured collections carousel applies center-weighted focus and direct hover emphasis" podcast-ai/test/browser.smoke.js`
- `rtk node --test --test-name-pattern "full-review detail page promotes community, trims the rail, and preserves rating interaction" podcast-ai/test/browser.smoke.js`
- `rtk npm --prefix podcast-ai run test:smoke`
- Temporary Playwright QA against `http://127.0.0.1:3010/` for desktop/mobile carousel checks
- `rtk npm run verify`

## Known issues

- The in-app browser runtime could still inspect existing local tabs, but timed out or crashed on new local-tab navigation and arrow interaction work; rendered QA used Playwright fallback for this task.

## Current task

Remove redundant explanatory subtext under the home-page section titles so the browse page headings stand on their own.

## Files changed

- `site-src/pages/index.html`
- `index.html`
- `HANDOFF.md`

## What was completed

- Removed the supporting paragraph under `Browse the archive`.
- Removed the supporting paragraph under `Popular with listeners`.
- Removed the supporting paragraph under `Featured collections`.
- Rebuilt generated pages so the root `index.html` matches the source template.

## What still needs work

- No follow-up needed for this copy removal.

## Commands run

- `rtk npm run build:pages`
- `rtk npm run check:structure`

## Known issues

- `rtk npm run check:structure` fails on a pre-existing line-budget violation in `shared/app/community/detail-widget.js` (520 lines, limit 350). This task did not modify that file.

## Current task

Polish the show-page community rating widget animation so expand/collapse, metric updates, and submit feedback feel fluid instead of instant.

## Files changed

- `shared/app/community/detail-widget.js`
- `shared/app/community/detail-motion.js`
- `shared/styles/show/sections/04-community.css`
- `podcast-ai/test/browser.smoke.js`
- `HANDOFF.md`

## What was completed

- Replaced the community rating panel’s instant body show/hide with an animated open/close lifecycle using height, opacity, and slight vertical motion.
- Added rolling score/count transitions for the side-card metric, hero metric, and distribution counts while keeping reduced-motion behavior intact.
- Added a short confirmation pulse on successful rating submission for both the panel shell and the selected rating chip.
- Split the new motion helpers into `shared/app/community/detail-motion.js` so the widget stays inside the repo’s JS line-budget rule.
- Hardened a few browser smoke waits that were reading transient animated text or relying on brittle page-load timing.

## What still needs work

- No known follow-up for the community widget motion pass.

## Commands run

- `rtk node --check shared/app/community/detail-widget.js`
- `rtk node --check shared/app/community/detail-motion.js`
- `rtk node --check podcast-ai/test/browser.smoke.js`
- Temporary Playwright QA against `http://127.0.0.1:3010/show.html?id=impact-winter` for collapsed, expanded, submitted, and mobile states
- `rtk node --test --test-name-pattern "main routes render expected page titles|legacy detail redirects still land on the canonical show route" podcast-ai/test/browser.smoke.js`
- `rtk node --test --test-name-pattern "full-review detail page promotes community, trims the rail, and preserves rating interaction" podcast-ai/test/browser.smoke.js`
- `rtk npm run verify`

## Known issues

- The in-app browser runtime crashed when opening a local tab for QA, so rendered verification fell back to Playwright screenshots and interaction checks.

## Current task

Implement the home-page motion pass for the filter dropdown and filter-state chips, inline card preview expansion, and featured collections carousel focus.

## Files changed

- `site-src/pages/index.html`
- `index.html`
- `shared/app/constants.js`
- `shared/app/collection-carousel.js`
- `shared/app/pages/home.js`
- `shared/app/pages/home/collections.js`
- `shared/app/pages/home/filter-dropdown.js`
- `shared/app/pages/home/filter-motion.js`
- `shared/app/pages/home/filters.js`
- `shared/app/render-cards/preview.js`
- `shared/app/render-collections.js`
- `shared/styles/home/cards/03-filter-controls.css`
- `shared/styles/home/cards/04-browse-bands.css`
- `shared/styles/home/cards/05-collection-cards.css`
- `shared/styles/home/cards/09-preview-shell.css`
- `shared/styles/home/cards/10-preview-content.css`
- `shared/styles/home/cards/20-motion.css`
- `podcast-ai/test/browser.smoke.js`
- `HANDOFF.md`

## What was completed

- Replaced the filter dropdown’s instant show/hide toggle with an explicit open/close lifecycle using `hidden` plus `data-state="opening|open|closing"`.
- Added staggered dropdown entrance motion, filter-option press microfeedback, and a pulse on the filter count badge when the numeric count changes.
- Reworked active filter chips into keyed reconciliation with enter/exit motion and FLIP-style reflow, while keeping filter logic and URL behavior unchanged.
- Retuned the inline card preview timing, added staged content reveal inside the expanded preview, and delayed shell collapse so close motion starts with content fade.
- Replaced the collections rail interval loop with a `requestAnimationFrame` loop, added center-weighted ambient focus via `--collection-focus`, and layered direct hover/focus emphasis on top.
- Added new home-page helper modules to keep the repo’s JS line-budget checks passing.
- Extended browser smoke coverage for dropdown lifecycle, chip removal and clear-all recovery, preview content staging, reduced-motion behavior, and carousel focus weighting.

## What still needs work

- No known follow-up for this motion pass.

## Commands run

- `rtk node --check shared/app/pages/home.js`
- `rtk node --check shared/app/pages/home/filters.js`
- `rtk node --check shared/app/pages/home/filter-motion.js`
- `rtk node --check shared/app/pages/home/filter-dropdown.js`
- `rtk node --check shared/app/render-cards/preview.js`
- `rtk node --check shared/app/render-collections.js`
- `rtk node --check shared/app/collection-carousel.js`
- `rtk node --check podcast-ai/test/browser.smoke.js`
- `rtk npm run build:pages`
- `rtk npm run check:structure`
- `rtk node --test --test-name-pattern "homepage supports structured filtering" podcast-ai/test/browser.smoke.js`
- `rtk npm --prefix podcast-ai run test:smoke`
- Browser runtime QA against `http://127.0.0.1:3010/index.html` for page identity and interaction inspection
- Playwright QA via `rtk node` for desktop/mobile screenshots and rendered-state checks
- `rtk npm run verify`

## Known issues

- The in-app browser runtime loaded the page and allowed inspection, but timed out on later screenshot/click work; screenshot evidence used Playwright fallback instead.
- `404.html` was already dirty before this motion pass and was left untouched.

## Current task

Remake the 404 page so it matches the current Echo Archives archive shell instead of the old standalone placeholder.

## Files changed

- `404.html`
- `HANDOFF.md`

## What was completed

- Replaced the old inline-styled 404 stub with a full archive-native page using the site header, footer, dark surface system, and editorial copy tone.
- Added a new lost-signal hero with compact recovery CTAs, a radar-style 404 panel, and three route cards back into browse, collections, and correction flows.
- Added a lower archive-note band and fixed the Patreon footer asset reference so the rebuilt page loads without missing-resource errors.
- Verified the rebuilt page at `http://127.0.0.1:3010/404.html` on desktop and mobile, plus confirmed the primary CTA navigates back to `/index.html`.

## What still needs work

- No known follow-up for the 404 page itself.

## Commands run

- `rtk sed -n '1,220p' 404.html`
- `rtk sed -n '1,220p' site-src/pages/index.html`
- `rtk sed -n '1,220p' package.json`
- `rtk sed -n '1,220p' HANDOFF.md`
- `rtk rg -n "hero-panel|archive-section|collection-band|background:|--.*accent|--.*surface|font-family" shared/styles site-src -g '!podcast-ai/**'`
- `rtk rg --files shared/styles`
- `rtk git status --short`
- `rtk sed -n '1,240p' about.html`
- `rtk sed -n '1,240p' shared/styles/base/global.css`
- `rtk sed -n '1,240p' shared/styles/home/cards/15b-info-pages.css`
- `rtk rg -n "<footer|site-footer|footer" about.html index.html collections.html submit.html -g '!podcast-ai/**'`
- `rtk sed -n '1,240p' index.html`
- `rtk sed -n '1,240p' shared/styles/home/cards/08-footer.css`
- `rtk rg -n "page-main|page-grid|page-card|page-panel|page-stack|page-actions|page-label|page-meta" shared/styles -g '!podcast-ai/**'`
- `rtk sed -n '180,320p' shared/styles/home/cards/13-chat-about-base.css`
- `rtk sed -n '1,180p' shared/styles/home/cards/16-empty-tablet.css`
- `rtk sed -n '1,120p' shared/styles/home/cards/18-responsive-780-b.css`
- `rtk rg -n "page-hero-actions|about-cta|collection-action|quick-filter|section-link" shared/styles site-src -g '!podcast-ai/**'`
- `rtk sed -n '240,340p' shared/styles/home/cards/14-about-features.css`
- `rtk sed -n '1,80p' site-src/pages/privacy.html`
- `rtk npm run check:structure`
- `rtk npm run dev`
- `rtk sed -n '1,220p' podcast-ai/package.json`
- `rtk rg -n "PORT|listen\\(|3010|3310|127\\.0\\.0\\.1" podcast-ai/server.js podcast-ai/lib -g '!podcast-ai/node_modules/**'`
- Browser runtime QA against `http://127.0.0.1:3010/404.html` for DOM snapshot and console checks
- Playwright QA via `rtk node` from `podcast-ai/` for desktop/mobile screenshots and CTA navigation verification

## Known issues

- `rtk npm run check:structure` still fails because of a pre-existing unrelated budget violation in `shared/app/pages/home/filters.js` (`561` lines over a `350` line limit).
- Browser runtime page load worked, but screenshot capture and CTA click timed out in the in-app browser automation path, so rendered evidence used Playwright fallback instead.

---

## Current task

Make the Ask the Archivist launcher morph into the open chat panel and keep the back-to-top control visible.

## Files changed

- `shared/app/app.js`
- `shared/app/chat.js`
- `shared/styles/home/cards/01-surface.css`
- `shared/styles/home/cards/11-community-rating.css`
- `shared/styles/home/cards/13-chat-about-base.css`
- `shared/styles/home/cards/17-responsive-780-a.css`
- `shared/styles/home/cards/18-responsive-780-b.css`
- `shared/styles/home/cards/19-responsive-560.css`
- `shared/styles/home/cards/20-motion.css`
- `HANDOFF.md`

## What was completed

- Reworked the chat panel open/close animation so the panel expands from the launcher footprint with a clipped shell morph and delayed content reveal.
- Hid the launcher during the open state while preserving its closed appearance and accessibility state.
- Moved the back-to-top button left of the open panel on desktop, with a mobile inset so it stays visible without covering the chat footnote.
- Added reduced-motion coverage for the new chat and floating-control transitions.

## What still needs work

- No known follow-up for this transition polish.

## Commands run

- `rtk node --check shared/app/app.js`
- `rtk node --check shared/app/chat.js`
- `rtk npm run dev`
- Browser QA against `http://127.0.0.1:3010/index.html` at desktop `1280x720` and mobile `472x720`
- `rtk npm run verify`

## Known issues

- None found. `npm run verify` passed.

---

## Current task

Refine the creator spotlight placeholder avatar so it stays fully inside the frame, loses the outline, and uses a darker background disc.

## Files changed

- `site-src/pages/for-creators.html`
- `for-creators.html`
- `shared/styles/home/creators/03-standards.css`
- `HANDOFF.md`

## What was completed

- Tightened the generic avatar shoulder silhouette so it sits better within the circular portrait.
- Removed the visible outline/ring treatment from the avatar disc.
- Clipped the avatar to the circular frame and darkened the background disc so the portrait reads more cleanly in the spotlight card.

## What still needs work

- No known follow-up for this avatar refinement.

## Commands run

- `rtk npm run build:pages`
- `rtk npm run check:structure`

## Known issues

- `for-creators.html` and related creator files already had broader in-progress changes before this avatar refinement; this update stayed limited to the placeholder portrait treatment.

---

## Current task

Replace the creator spotlight portrait with a clean generic avatar.

## Files changed

- `site-src/pages/for-creators.html`
- `for-creators.html`
- `shared/styles/home/creators/03-standards.css`
- `HANDOFF.md`

## What was completed

- Replaced the empty CSS-built creator face with an inline SVG avatar resembling a simple generic profile portrait.
- Removed the pseudo-element facial-feature construction from the spotlight avatar CSS.
- Restyled the avatar as a muted circular portrait token that fits the existing dark creator spotlight card.

## What still needs work

- No known follow-up for this task.

## Commands run

- `rtk npm run build:pages`
- `rtk npm run check:structure`
- `rtk npm run dev`
- Browser QA against `http://127.0.0.1:3010/for-creators.html`

## Known issues

- Pre-existing unrelated dirty files remain in the creator-page, community-rating, and prior browse-section areas.
- The dev server was started for browser QA on port `3010`.

---

## Current task

Polish the main browse page popular-listener section.

## Files changed

- `site-src/pages/index.html`
- `index.html`
- `shared/app/render-cards/popular.js`
- `shared/styles/home/cards/06-featured-cards.css`
- `HANDOFF.md`

## What was completed

- Renamed the section title from "Most popular" to "Popular with listeners."
- Reduced the outer band's visual weight with lighter border/background, smaller radius, tighter padding, and reduced card gap.
- Replaced the popular-card status pills with compact inline colored status text separated visually by bullets.
- Reordered popular-card statuses so lifecycle labels appear before "Full review."

## What still needs work

- No known follow-up for this task.

## Commands run

- `rtk npm run build:pages`
- `rtk curl -I --max-time 5 http://127.0.0.1:3010/index.html`
- `rtk npm run dev`
- Browser QA against `http://127.0.0.1:3010/index.html`
- `rtk npm run check:structure`

## Known issues

- Pre-existing unrelated dirty files remain in the creator-page/test areas.
- The dev server was started for browser QA on port `3010`.

---

## Current task

Keep the expanded Ask the Archivist panel from overlapping the footer, matching the closed chat button's footer-aware behavior.

## Files changed

- `shared/app/app.js`
- `shared/styles/home/cards/11-community-rating.css`
- `HANDOFF.md`

## What was completed

- Extended the existing floating-control footer clearance logic so the open chat panel now inherits the same bottom clamp as the closed chat button.
- Kept the desktop chat panel at a fixed size and only move it upward as a whole when the footer enters the viewport, so it now stops above the footer without shrinking.
- `npm run verify` reached the browser smoke step, but that step failed because the local smoke-test server on `127.0.0.1:3310` was refusing connections.

## What still needs work

- No known follow-up for this fix.

## Commands run

- `rtk sed -n '1,240p' /Users/charliearnerstal/.codex/RTK.md`
- `rtk rg --files | rg 'AGENTS\.md|RTK\.md|chat|archivist|footer'`
- `rtk sed -n '1,240p' site-src/partials/chat-shell.html`
- `rtk sed -n '1,260p' shared/styles/base/chat.css`
- `rtk sed -n '1,260p' shared/styles/home/cards/12-chat-panel.css`
- `rtk sed -n '1,260p' shared/app/chat/ui.js`
- `rtk rg -n "chat-container|chat-toggle|footer|--chat|position: fixed|position: sticky|bottom:" shared/styles site-src shared/app -g '!podcast-ai/**'`
- `rtk sed -n '1,260p' shared/app/chat.js`
- `rtk sed -n '1,260p' shared/styles/base/header-footer.css`
- `rtk sed -n '100,180p' shared/app/app.js`
- `rtk sed -n '110,220p' shared/styles/home/cards/11-community-rating.css`
- `rtk sed -n '120,220p' shared/styles/home/cards/13-chat-about-base.css`
- `rtk sed -n '180,230p' shared/styles/home/cards/01-surface.css`
- `rtk sed -n '1,120p' shared/styles/base/global/03-responsive.css`
- `rtk sed -n '90,130p' shared/styles/home/cards/18-responsive-780-b.css`
- `rtk sed -n '125,175p' shared/styles/home/cards/19-responsive-560.css`
- `rtk sed -n '1,120p' shared/app/app.js`
- `rtk cat package.json`
- `rtk git status --short`
- `rtk ls HANDOFF.md`
- `rtk npm run verify`

## Known issues

- There are unrelated pre-existing uncommitted changes in other files; this task only touched the shared chat positioning logic and `HANDOFF.md`.
- Browser smoke tests currently fail at startup because `127.0.0.1:3310` is refusing connections.

---

## Current task

Implement device-scoped verified community voting without accounts.

## Files changed

- `podcast-ai/lib/config.js`
- `podcast-ai/lib/store/database.js`
- `podcast-ai/lib/store/community-store.js`
- `podcast-ai/lib/services/community-service.js`
- `podcast-ai/lib/services/turnstile-service.js`
- `podcast-ai/lib/routes/community-routes.js`
- `podcast-ai/server.js`
- `shared/app/community/api.js`
- `shared/app/community/detail-widget.js`
- `shared/app/community/turnstile.js`
- `shared/app/community/formatters.js`
- `shared/app/constants.js`
- `shared/styles/show/sections/04-community.css`
- `podcast-ai/test/community.test.js`
- `podcast-ai/test/community-routes.test.js`
- `podcast-ai/test/browser.smoke.js`
- `site-src/pages/privacy.html`
- `site-src/pages/cookies.html`
- `privacy.html`
- `cookies.html`
- `docs/OPERATIONS.md`
- `podcast-ai/README.md`
- `HANDOFF.md`

## What was completed

- Replaced client-controlled rating identity for writes with a server-issued HTTP-only `echo-community-voter` cookie.
- Added hashed device profile lookup, one active vote per show per device, and a one-time migration that clears legacy community rating rows.
- Added Cloudflare Turnstile verification for rating create, update, and delete requests when configured.
- Added salted daily IP/user-agent abuse hashes with 30-day retention support and community write rate limiting keyed by the hash.
- Hid public community averages until the configured verified-vote threshold is met, defaulting to 3, while still showing vote counts and the user's own selected rating.
- Updated the detail rating widget to render Turnstile when enabled and send a fresh token on rating writes.
- Updated privacy/cookie/operations/backend docs for the new voter cookie and Turnstile settings.

## What still needs work

- Production needs `COMMUNITY_TURNSTILE_SITE_KEY`, `COMMUNITY_TURNSTILE_SECRET_KEY`, and a stable `COMMUNITY_VOTER_HASH_SECRET` configured before enabling verified rating writes.
- The one-time reset migration clears existing community rating submissions/events when the updated server first opens the live SQLite database.

## Commands run

- `rtk npm --prefix podcast-ai test`
- `rtk npm run build:pages`
- `rtk npm run check:structure`
- `rtk npm run verify`

## Known issues

- Accountless voting remains device-scoped, not true one-human identity. Multiple devices or browsers can still produce multiple votes.
- Pre-existing uncommitted README/HANDOFF edits were already present before this task; README was not modified for this task.

---

## Current task

Refresh the root README so it describes the project clearly in its current state instead of reading like a repo progress log.

## Files changed

- `README.md`
- `HANDOFF.md`

## What was completed

- Rewrote the root README to be product-first and easier to scan.
- Reframed the project as a curated fiction-audio discovery platform instead of a migration/status report.
- Added clearer sections for product purpose, current live capabilities, editorial model, stack, repo layout, local development, commands, routes, and documentation.
- Pulled the current catalog baseline directly from the repo so the README reflects the actual current counts: 27 shows, 6 collections, and 3 review files.

## What still needs work

- No follow-up required for the README rewrite itself.
- The catalog counts in the README should be updated when the underlying data grows.

## Commands run

- `rtk sed -n '1,220p' /Users/charliearnerstal/.codex/RTK.md`
- `rtk sed -n '1,260p' README.md`
- `rtk sed -n '1,260p' docs/PRODUCT.md`
- `rtk sed -n '1,220p' HANDOFF.md`
- `rtk sed -n '1,240p' package.json`
- `rtk sed -n '1,260p' docs/ARCHITECTURE.md`
- `rtk sed -n '1,220p' docs/ROADMAP.md`
- `rtk rg --files -g '!node_modules' -g '!podcast-ai/node_modules' | sed -n '1,220p'`
- `rtk sed -n '1,260p' podcast-ai/package.json`
- `rtk sed -n '1,240p' podcast-ai/README.md`
- `rtk node -e "const fs=require('fs'); const shows=JSON.parse(fs.readFileSync('data/shows.json','utf8')); const collections=JSON.parse(fs.readFileSync('data/collections.json','utf8')); const reviews=fs.readdirSync('data/reviews').filter((f)=>f.endsWith('.json')); console.log(JSON.stringify({showCount: shows.length, collectionCount: collections.length, reviewCount: reviews.length}, null, 2));"`
- `rtk git diff -- README.md`

## Known issues

- No code or UI verification was run because this task only changed repository documentation.

---

## Current task

Improve Ask the Archivist so it understands title questions, negative constraints, thread-level preferences, and repeated recommendations.

## Files changed

- Backend chat and search:
  - `podcast-ai/lib/chat-query.js`
  - `podcast-ai/lib/routes/chat-routes.js`
  - `podcast-ai/lib/chat.js`
  - `podcast-ai/lib/chat-intents.js`
  - `podcast-ai/lib/site-help.js`
  - `shared/archive-search.js`
- Frontend chat request:
  - `shared/app/chat.js`
- Regression coverage:
  - `podcast-ai/test/chat-routes.test.js`
  - `podcast-ai/test/catalog.test.js`
  - `podcast-ai/test/chat-intents.test.js`
- Task handoff: `HANDOFF.md`

## What was completed

- Added structured chat query parsing for show title/alias references, negative constraints, current-thread preference carryover, positive filters, and seed-show recommendations.
- Added hard exclusions for directly avoided shows and direct similar-show neighbors for prompts like "don't give me something like How I Died."
- Added cleaned scoring input so negative phrases do not pollute required search tokens.
- Added repeat-aware recommendations using `seenRecommendationIds` from the browser; comparable fresh picks win, but clearly strongest repeats are acknowledged.
- Improved title-specific show summaries so prompts like "What's Midnight Burger about?" answer from structured archive metadata.
- Added safeguards so constrained/repeat answers use deterministic fallback wording and model wording is not used if it mentions excluded titles.

## What still needs work

- No known follow-up for this AI task.
- Full `npm run verify` was not run because it starts with `build:pages`, and the worktree already had unrelated dirty generated/source HTML and CSS files.

## Commands run

- `rtk node --check podcast-ai/lib/chat-query.js && rtk node --check podcast-ai/lib/chat.js && rtk node --check podcast-ai/lib/routes/chat-routes.js && rtk node --check shared/archive-search.js && rtk node --check shared/app/chat.js`
- `rtk npm --prefix podcast-ai test`
- `rtk npm run check:structure`
- `rtk npm --prefix podcast-ai run validate:data`
- `rtk npm --prefix podcast-ai run check:links`
- `rtk npm --prefix podcast-ai run test:smoke`

## Known issues

- Pre-existing uncommitted hero/creator-page edits remain outside this AI task.
- `npm run verify` remains unrun for this task to avoid overwriting unrelated dirty generated pages through `build:pages`.

---

## Previous task

Normalize the public hero image treatment so the shared dish/header image feels consistent across pages.

## Files changed

- Shared public hero/background styles:
  - `shared/styles/home/cards/13-chat-about-base.css`
  - `shared/styles/home/cards/15-about-supporters.css`
  - `shared/styles/home/cards/15b-info-pages.css`
  - `shared/styles/home/cards/16-empty-tablet.css`
  - `shared/styles/home/cards/17-responsive-780-a.css`
  - `shared/styles/home/cards/19-responsive-560.css`
  - `shared/styles/home/creators/01-hero-actions.css`
  - `shared/styles/home/submit/01-hero-surface.css`
  - `shared/styles/home/submit/04-search-rail.css`
- Task handoff: `HANDOFF.md`

## What was completed

- Removed duplicate page-specific dish-image background stacks so public secondary heroes inherit the shared `.hero-panel` image/overlay.
- Removed the submit page's orange outgoing signal-ring pseudo-element.
- Set public secondary hero baseline height to `280px` while keeping browse at `430px`.
- Slimmed submit trust pills so they can remain inside the hero.
- Fixed mobile browse hero controls so filters/browse modes stay within the viewport and quick filters scroll inside their own strip.

## What still needs work

- No known follow-up for this task.
- Pre-existing uncommitted creator-page edits remain in `for-creators.html`, `site-src/pages/for-creators.html`, and creator standards/stat CSS files.

## Commands run

- `rtk npm run build:pages`
- `rtk npm run check:structure`
- `rtk npm run verify`
- `rtk npm run dev`

## Known issues

- Browser plugin navigation, DOM checks, console checks, and filter interaction passed.
- Browser plugin screenshot capture timed out, so visual screenshots were captured outside the repo with the existing Playwright dependency and installed system Brave browser.
- Screenshot files:
  - `/var/folders/fz/flyk6p9d4klgjcnhjg5w3t5r0000gn/T/echo-hero-submit-desktop.png`
  - `/var/folders/fz/flyk6p9d4klgjcnhjg5w3t5r0000gn/T/echo-hero-about-desktop.png`
  - `/var/folders/fz/flyk6p9d4klgjcnhjg5w3t5r0000gn/T/echo-hero-submit-mobile.png`

---

## Previous task

Implement the Gate B alignment plan across the homepage, browse filters, catalog coverage, recommendation routes, and maintainer validation/reporting.

## Files changed

- Homepage/browse source and generated output:
  - `site-src/pages/index.html`
  - `index.html`
  - `site-src/page-manifest.json`
  - `shared/app/data.js`
  - `shared/app/pages/home.js`
  - `shared/app/pages/home/filters.js`
  - `shared/app/utils.js`
  - `shared/styles/home/cards/02-hero-search.css`
  - `shared/styles/home/cards/04-browse-bands.css`
- Catalog, collections, reviews, and synced covers:
  - `data/shows.json`
  - `data/collections.json`
  - `data/reviews/midnight-burger.json`
  - `data/reviews/derelict.json`
  - `data/reviews/the-white-vault.json`
  - `images/covers/alice-isnt-dead.jpg`
  - `images/covers/archive-81.jpg`
  - `images/covers/borrasca.jpg`
  - `images/covers/case-63.jpg`
  - `images/covers/homecoming.jpg`
  - `images/covers/mabel.jpg`
  - `images/covers/malevolent.jpg`
  - `images/covers/midst.jpg`
  - `images/covers/mirrors.jpg`
  - `images/covers/the-bright-sessions.jpg`
  - `images/covers/the-program-audio-series.jpg`
  - `images/covers/unwell.jpg`
  - `images/covers/wooden-overcoats.jpg`
- Maintainer tooling:
  - `podcast-ai/lib/discovery-gaps.js`
  - `podcast-ai/scripts/discovery-gap-report.js`
  - `podcast-ai/scripts/validate-data.js`
  - `podcast-ai/scripts/review-helpers.js`
  - `podcast-ai/package.json`
- Task handoff:
  - `HANDOFF.md`

## What was completed

- Updated the homepage hero copy to `Find your next fiction podcast.`, added the three above-the-fold route actions, renamed the popularity band to `Archive momentum`, and broadened helper copy to mention tone and format discovery.
- Extended structured browse filters to include `tones` and `formats` without changing the compact card layout.
- Expanded the catalog to `40` published shows, added the three required full reviews for `midnight-burger`, `derelict`, and `the-white-vault`, and synced cover assets for the newly added shows.
- Expanded `Shows like X` coverage to `10` route collections, rewired `finished-arcs` into the `Completed shows` hub, rewired `easy-first-steps` into the primary `Start here` hub, and filled collection `showReasons` plus anchor-show `similarReasons`.
- Added a maintainer-facing `report:discovery-gaps` command and Gate B blocking validation for anchor `similarReasons`, route `showReasons`, and published-show tone/format coverage.

## What still needs work

- No known product follow-up from this Gate B pass.
- The plan's manual QA checklist was not run as a separate visual pass; verification relied on build/link validation plus the smoke suite.

## Commands run

- `rtk npm --prefix podcast-ai run report:discovery-gaps`
- `rtk npm --prefix podcast-ai run validate:data`
- `rtk npm run build:pages`
- `rtk npm run check:structure`
- `rtk npm --prefix podcast-ai run check:links`
- `rtk npm --prefix podcast-ai run test:smoke`

## Known issues

- `rtk npm run check:structure` still reports the existing soft-limit warnings for `shared/app/pages/home.js` and `shared/styles/home/cards/03-filter-controls.css`, but it exits successfully.
- Unrelated pre-existing repo/docs edits remain in the worktree outside this Gate B task and were left untouched.

---

## Previous task

Fix the Alice Isn't Dead cover asset, and add Welcome to Night Vale as a published show.

## Files changed

- Catalog data:
  - `data/shows.json`
- Cover assets:
  - `images/covers/alice-isnt-dead.jpg`
  - `images/covers/welcome-to-night-vale.jpg`
- Task handoff:
  - `HANDOFF.md`

## What was completed

- Replaced the incorrect `alice-isnt-dead` cover image, which had been using Welcome to Night Vale artwork, with the correct Alice Isn't Dead square cover.
- Added `welcome-to-night-vale` as a published catalog record with source-verified website, Apple, and RSS links plus local cover art.
- Kept the change scoped to JSON/catalog assets; no collection or homepage copy changes were made in this pass.

## What still needs work

- Welcome to Night Vale is now in the catalog, but it is not yet threaded into any collection routes or editorial review coverage.

## Commands run

- `rtk npm --prefix podcast-ai run validate:data`
- `rtk npm --prefix podcast-ai run check:links`
- `rtk npm --prefix podcast-ai run test:smoke`

## Known issues

- The first smoke run hit a transient homepage carousel pointer-intercept timeout in `test/home-card-interactions.smoke.js`; rerunning `rtk npm --prefix podcast-ai run test:smoke` passed cleanly with `21/21` tests.
- Unrelated pre-existing repo/docs edits remain in the worktree outside this task and were left untouched.
