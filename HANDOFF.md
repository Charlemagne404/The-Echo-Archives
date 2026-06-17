## Current task

Implement the coordinated cleanup for truthful community ratings, canonical show schema, submission architecture, browse-page performance, and durable API hardening.

## Files changed

- `data/shows.json`
- `shared/archive-record.js`
- `shared/app/app.js`
- `shared/app/community.js`
- `shared/app/constants.js`
- `shared/app/data.js`
- `shared/app/pages/home.js`
- `shared/app/pages/submit.js`
- `shared/app/render-cards.js`
- `shared/app/render-show.js`
- `shared/app/submit/config.js`
- `shared/app/submit/utils.js`
- `shared/app/submit/state.js`
- `shared/app/submit/search.js`
- `shared/app/submit/validation.js`
- `shared/app/submit/api.js`
- `shared/app/submit/render.js`
- `podcast-ai/lib/catalog.js`
- `podcast-ai/lib/config.js`
- `podcast-ai/lib/routes/chat-routes.js`
- `podcast-ai/lib/routes/submission-routes.js`
- `podcast-ai/lib/services/community-service.js`
- `podcast-ai/lib/services/submission-service.js`
- `podcast-ai/lib/services/rate-limit-service.js`
- `podcast-ai/lib/store/database.js`
- `podcast-ai/lib/store/rate-limit-store.js`
- `podcast-ai/server.js`
- `podcast-ai/test/browser.smoke.js`
- `podcast-ai/test/catalog.test.js`
- `podcast-ai/test/community.test.js`
- `podcast-ai/test/submissions.test.js`
- `podcast-ai/test/rate-limit.test.js`
- `index.html`
- `show.html`
- `collection.html`
- `collections.html`
- `about.html`
- `submit.html`
- `privacy.html`
- `cookies.html`
- `terms.html`
- `supporters.html`

## What was completed

- Removed community-rating fallbacks to archive scores and standardized empty state rendering to `--/10` and `No ratings yet`.
- Moved shared show normalization into `shared/archive-record.js`, switched browser/server consumers to it, removed deprecated top-level aliases from `data/shows.json`, and made validation fail if those aliases return.
- Refactored submission handling so the backend uses `submissionService.submit(rawBody, requestContext)` and the frontend submit page is split into focused modules for state, search, validation, payload/networking, and rendering.
- Optimized the browse page to reuse keyed card shells, debounce search, avoid full resize rerenders except on breakpoint changes, and keep community-summary fetches cached.
- Added SQLite-backed rate limiting for chat, community writes, and submissions; set `trust proxy` to `loopback`; standardized `429` responses with `Retry-After`; removed `databasePath` from `/api/health`.
- Updated unit and smoke coverage for canonical schema rules, truthful community UI, submission paths, rate limiting, and browse behavior.

## What still needs work

- None found during validation and smoke coverage.

## Commands run

- `rtk npm run validate:data`
- `rtk npm test`
- `rtk npm run test:smoke`

## Known issues

- None currently known after the full test pass.
