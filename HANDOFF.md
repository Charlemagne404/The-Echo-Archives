## Current task

Polish the `What you can do` and `How it works` sections on the `for-creators` page so they feel less flat while keeping the existing dark archive identity, section order, and creator flows intact.

## Files changed

- Creator page source: `site-src/pages/for-creators.html`
- Action/process section styles: `shared/styles/home/creators/01-hero-actions.css`
- Step marker styling: `shared/styles/home/creators/02-process-spotlight.css`
- Creator responsive rules: `shared/styles/home/creators/04-responsive.css`
- Generated page output: `for-creators.html`
- Task handoff: `HANDOFF.md`

## What was completed

- Added small structural wrappers inside the creator action cards so icon, copy, and CTA rows align consistently and hold equal-height behavior more cleanly.
- Reworked the `What you can do` cards with subtler icon halos, stronger title/body/CTA hierarchy, a restrained footer divider, and calmer card depth.
- Differentiated `How it works` from the action cards by adding a simplified desktop process rail, stronger numbered markers, and a cleaner step header layout.
- Converted the process section into a true vertical sequence on narrow screens by hiding the horizontal rail and adding a left-side connector treatment.
- Rebuilt the generated page output and validated the updated sections visually on desktop and responsive mobile using the local app.
- Ran the full repo verification suite; it passes, including the existing creators-page smoke coverage.

## What still needs work

- No known follow-up from this pass for these two sections.
- The mobile screenshots still show the existing fixed page controls near the lower-right edge when that part of the page is in view; this pass did not change those global controls.

## Commands run

- `rtk npm run build:pages`
- `PORT=3310 SERVE_STATIC=true STATIC_ROOT=/Users/charliearnerstal/Documents/GitHub/The-Echo-Archives DB_PATH=/tmp/echo-archives-ui.sqlite OLLAMA_URL=http://127.0.0.1:9/api/generate rtk npm --prefix podcast-ai run dev`
- `rtk npx playwright --version`
- `rtk node -e 'const { chromium } = require("playwright"); ...'`
- `rtk npm run verify`

## Known issues

- Full verification passes in the current workspace.
- There are unrelated existing worktree changes outside this pass, including prior `for-creators` and creator stylesheet edits already present before these action/process section updates.
