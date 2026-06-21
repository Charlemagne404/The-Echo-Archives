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
