## Current task

Remake the placeholder submit page into a concept-faithful dynamic intake surface with real per-mode form states, richer payloads, and matching moderation/storage behavior.

## Files changed

- `submit.html`
- `home.css`
- `shared/styles/home/submit.css`
- `shared/app/pages/submit.js`
- `podcast-ai/lib/routes/submission-routes.js`
- `podcast-ai/lib/services/submission-service.js`
- `podcast-ai/test/submissions.test.js`
- `podcast-ai/test/browser.smoke.js`
- `HANDOFF.md`

## What was completed

- Rebuilt `/submit.html` around the concept structure: cinematic hero, intake-path selector, step rail, dynamic left form, and right guidance rail.
- Added a submit-page header `Ask the Archivist` trigger and hid the floating chat button on this page so the concept layout stays clean.
- Moved submit-specific styling into `shared/styles/home/submit.css` and tuned the breakpoints so the concept-width layout stays in the desktop two-column structure longer.
- Replaced the old select/hide-show placeholder form with a config-driven submit runtime that swaps between `show`, `correction`, `listener-review`, and `creator-verification`.
- Added the new UI primitives called for by the plan: searchable archive-entry picker, repeatable link rows, segmented choices, chip multi-selects, 5-star rating, and live counters/helper text.
- Expanded the submission route/service contract to accept and persist the richer structured payloads in `payload_json`, with source-bearing fields in `provenance_json`.
- Updated backend unit tests and browser smoke coverage for the new submit-page interactions and payload normalization.
- Verified the page visually against all four submit concepts with headless Playwright screenshots for desktop states plus a mobile pass.

## What still needs work

- The live page intentionally ships empty inputs, while the concept images use filled example content. Layout and styling were matched to the concepts, but the production form does not preload example submission text.

## Commands run

- `rtk npm test` (in `podcast-ai/`)
- `rtk npm run test:smoke` (in `podcast-ai/`)
- `PORT=3320 SERVE_STATIC=true STATIC_ROOT=/Users/charliearnerstal/Documents/GitHub/The-Echo-Archives DB_PATH=/tmp/echo-submit-debug.sqlite OLLAMA_URL=http://127.0.0.1:9/api/generate rtk npm run dev` (for visual QA only)
- Headless Playwright screenshot checks against `http://127.0.0.1:3320/submit.html`

## Known issues

- The worktree contains unrelated existing modifications outside this task; they were left untouched.
