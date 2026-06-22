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
