## Current task

Revamp the Creator standards, Privacy, Terms, and Cookies pages so they are no longer placeholder-like while staying simple and aligned with the dark archive identity.

## Files changed

- Source page templates: `site-src/pages/creator-standards.html`, `site-src/pages/privacy.html`, `site-src/pages/terms.html`, `site-src/pages/cookies.html`
- Shared info-page styles: `shared/styles/home/cards/15b-info-pages.css`, `shared/styles/home/cards/15c-info-pages-responsive.css`, `shared/styles/home/cards.css`
- Runtime fix: `shared/app/chat.js`
- Cache/version plumbing: `home.css`, `script.js`, `tools/build-pages.js`
- Generated public HTML refreshed by `npm run build:pages`
- Task handoff: `HANDOFF.md`

## What was completed

- Replaced the simple policy card stacks with restrained archive-styled hero sections, three-card summaries, section navigation rails, and readable document cards.
- Reworked Creator standards into clearer verification, submission, metadata, editorial-boundary, and review-process sections.
- Updated Privacy/Cookies copy to reflect current implementation details, including browser storage and the maintainer session cookie.
- Fixed `[data-open-chat]` launchers so the Creator standards CTA opens Ask the Archivist instead of closing immediately.
- Added mobile spacing so the fixed chat button does not cover info-page text.

## What still needs work

- No known follow-up for these pages.
- This was not a legal review; copy is implementation-grounded policy text.

## Commands run

- `rtk npm run build:pages`
- `rtk npm run check:structure`
- `rtk npm run verify`
- `rtk npm run dev`

## Browser QA

- Checked `http://127.0.0.1:3010/creator-standards.html`, `/privacy.html`, `/terms.html`, and `/cookies.html`.
- Verified desktop `1440x900` and mobile `390x844` layouts: no horizontal overflow, text fit checks passed, no console warnings/errors.
- Verified the Privacy map `Cookies` link updates the URL hash.
- Verified the Creator standards `Ask the Archivist` button opens the chat panel after the shared launcher fix.

## Known issues

- Full verification passes in the current workspace.
- There are unrelated pre-existing worktree changes outside this pass; they were not reverted.
