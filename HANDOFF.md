## Current task

Add a protected maintainer submissions workspace so archive intake can be reviewed in the browser instead of by inspecting raw files or SQLite directly.

## Files changed

- Backend config and routes: `podcast-ai/lib/config.js`, `podcast-ai/lib/maintainer-auth.js`, `podcast-ai/lib/routes/maintainer-routes.js`, `podcast-ai/server.js`
- Submission storage and service layer: `podcast-ai/lib/store/database.js`, `podcast-ai/lib/store/submission-store.js`, `podcast-ai/lib/services/submission-service.js`
- Maintainer UI source: `site-src/page-manifest.json`, `site-src/pages/maintainer/submissions.html`, `site-src/pages/maintainer/report.html`
- Maintainer runtime and styles: `shared/app/app.js`, `shared/app/pages/maintainer.js`, `shared/app/maintainer/*`, `shared/styles/home/maintainer.css`, `shared/styles/home/maintainer/*`, `home.css`, `script.js`, `site-src/partials/header.html`, `tools/build-pages.js`
- Tests and docs: `podcast-ai/test/maintainer.test.js`, `podcast-ai/test/site-structure.test.js`, `docs/OPERATIONS.md`, `docs/ARCHITECTURE.md`, `podcast-ai/README.md`
- Regenerated public output: root generated HTML plus `maintainer/submissions.html` and `maintainer/submissions/report.html`

## What was completed

- Added passphrase-gated maintainer session handling with cookie-backed access for the internal queue and report routes.
- Added typed submission listing, filtering, detail fetch, and review update APIs, including `priority`, `review_notes`, `reviewed_by`, and `reviewed_at` support.
- Added a browser queue view with login, summary cards, filters, paginated list/detail layout, and review-state save actions.
- Added a print-friendly HTML report view for the same queue data.
- Fixed nested-route asset loading by switching generated shared asset URLs to absolute site-root paths.
- Fixed hidden-state rendering so the auth and app shells swap correctly on both queue and report pages.
- Added maintainer backend test coverage and kept the full repo verify green.

## What still needs work

- No functional follow-up is required for this pass unless you want publish-helper actions wired into the maintainer queue later.

## Commands run

- `rtk npm run build:pages`
- `rtk npm run check:structure`
- `rtk npm --prefix podcast-ai test`
- `rtk npm run verify`

## Known issues

- None found in the final pass. Manual browser QA covered login, queue rendering, review-state saving, report rendering, and mobile layout on `http://127.0.0.1:3415/maintainer/submissions.html`.
