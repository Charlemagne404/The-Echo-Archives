## Current task

Stabilize the shared header on secondary pages so `For creators` stays in the top nav, and add an easy return path on `Supporters`, `Privacy`, `Terms`, and `Cookies`.

## Files changed

- Shared generator/runtime: `tools/build-pages.js`, `script.js`, `shared/app/app.js`, `home.css`
- Secondary-page source content: `site-src/pages/privacy.html`, `site-src/pages/terms.html`, `site-src/pages/cookies.html`, `site-src/pages/supporters.html`
- Shared styling: `shared/styles/home/cards/14-about-features.css`, `shared/styles/home/cards/18-responsive-780-b.css`
- Regenerated public output: root `about.html`, `collection.html`, `collections.html`, `cookies.html`, `creator-standards.html`, `for-creators.html`, `index.html`, `privacy.html`, `show.html`, `submit.html`, `supporters.html`, `terms.html`

## What was completed

- Kept the primary nav fixed to `Browse`, `Collections`, `About`, `Submit`, `For creators` across generated pages.
- Removed the old behavior that swapped `Supporters`, `Privacy`, `Terms`, or `Cookies` into the fifth nav slot.
- Added a shared history-aware back CTA that returns to the previous in-site page when possible and falls back to `About` or `Browse` on direct visits.
- Added a small shared hero-actions layout so the new CTA works on desktop and mobile without changing the site’s overall header feel.

## What still needs work

- Nothing specific for this nav fix. Broader app/test issues below remain outside this change set.

## Commands run

- `rtk npm run build:pages`
- `rtk npm run verify`
- `rtk node /tmp/echo-nav-qa.mjs`
- `rtk node --input-type=module -e "...secondary page console check..."`

## Known issues

- `rtk npm run verify` still fails in the existing smoke suite at `podcast-ai/test/browser.smoke.js:1202` (`homepage expanding archive card supports stable hover, keyboard, touch, and compact anchored geometry`), which appears unrelated to this header/back-link change.
- The in-app Browser plugin hit a local crash/URL-policy state on this localhost target during QA, so final rendered validation used Playwright fallback instead.
