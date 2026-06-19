## Current task

Implement the future-proof structural plan: add a root command surface, generate committed root HTML from authored sources, split oversized runtime/style modules, move active-vs-archival assets into clearer locations, and add repo guardrails.

## Files changed

- Root tooling and docs: `package.json`, `tools/build-pages.js`, `tools/check-structure.js`, `README.md`, `docs/ARCHITECTURE.md`, `docs/OPERATIONS.md`, `.github/workflows/verify.yml`, `.gitignore`, `HANDOFF.md`
- Generated-page source and output: `site-src/`, root `index.html`, `about.html`, `collections.html`, `collection.html`, `show.html`, `submit.html`, `for-creators.html`, `creator-standards.html`, `supporters.html`, `privacy.html`, `terms.html`, `cookies.html`
- Runtime/module splits: `shared/app/chat/`, `shared/app/community/`, `shared/app/home-preview/`, `shared/app/pages/home/`, `shared/app/pages/submit/`, `shared/app/render-cards/`, `shared/app/render-show/`, `shared/app/submit/config/`, `shared/app/submit/render/`
- Style splits: `shared/styles/base/global/`, `shared/styles/home/cards/`, `shared/styles/home/creators/`, `shared/styles/home/submit/`, `shared/styles/show/sections/`
- Ownership moves: `shared/config/legacy-redirects.json`, `docs/archive/data/shows_old.json`, `docs/research/concepts/`
- Tests touched: `podcast-ai/test/site-structure.test.js`, `podcast-ai/test/browser.smoke.js`

## What was completed

- Added a root command surface with `dev`, `build:pages`, `check:structure`, and `verify`.
- Introduced `site-src/` plus a page manifest and shared partials, then regenerated committed root HTML with a generated-file banner.
- Moved the active redirect manifest to `shared/config/legacy-redirects.json` and updated tests to read it there.
- Moved archival-only data and concept assets out of active runtime paths.
- Removed tracked `tmp/` ownership and ignored future temp output.
- Split the large runtime JS files under `shared/app/` so the line-cap guard now passes across the whole runtime tree.
- Split oversized CSS entry files into import-based partials while keeping the public CSS entry filenames stable.
- Added repo-level structure checks and CI, including a stale-generated-output gate in GitHub Actions.
- Updated docs so source/output/runtime/archive boundaries are explicit.
- Verified the page generator is deterministic across consecutive runs.

## What still needs work

- Review whether the legacy show-page cover path for `midnight-burger` should be normalized. Manual browser QA found a 404 request for `shared/styles/show/sections/shows/midnight burger/MidnightBurger.jpeg`, which appears to be pre-existing catalog or asset-path drift rather than a refactor regression.

## Commands run

- `rtk npm run build:pages`
- `rtk npm run check:structure`
- `rtk npm run verify`
- `rtk npm --prefix podcast-ai run validate:data`
- `rtk npm --prefix podcast-ai run check:links`
- `rtk npm --prefix podcast-ai test`
- `rtk npm --prefix podcast-ai run test:smoke`
- `rtk proxy node - <<'NODE' ...` for deterministic page-build verification and targeted Playwright route/runtime checks

## Known issues

- `npm run test:smoke` is quiet until completion in this environment, so progress looks like a hang even though the suite passes after about 47 seconds.
- The `midnight-burger` detail page still requests one missing image asset path during manual Playwright QA.
