## Current task

Refine the `Submit a new show` form so tag selection and listen-link row management behave cleanly, reduce the oversized remove icon, and add hybrid typed/custom tag entry.

## Files changed

- `shared/app/pages/submit.js`
- `shared/styles/home/submit.css`
- `podcast-ai/test/browser.smoke.js`
- `HANDOFF.md`

## What was completed

- Fixed the tag picker event flow so it no longer immediately closes itself when opened and selected tags now apply cleanly.
- Fixed listen-link row syncing so changing a link type updates the visible badge immediately, and new rows now default to the next unused platform instead of duplicating the first option.
- Reduced the listen-link remove icon to a compact 16px mark while keeping the tap target intact.
- Reworked the show-tag control into a hybrid picker: users can still click suggestions from the menu, but they can now type into the field, see broader matching suggestions, and press `Enter` to create a custom tag when needed.
- Follow-up polish: the tag menu is now closed by default, opens only from the chevron or active typing, closes again after selection/submit, and renders as an overlay instead of pushing the rest of the form downward.
- Follow-up polish: the tag menu now properly honors its hidden state in CSS, and the 8-tag cap is explicit. Once full, the input and chevron disable and a visible `Tag limit reached (8/8). Remove one to add another.` message is shown.
- Added browser smoke coverage for tag selection, link-type badge syncing, sequential link defaults, and the smaller remove icon.
- Added smoke coverage for typed custom-tag creation (`ghost story` -> `Ghost Story`) in the submit form.

## What still needs work

- `npm test` still has an unrelated existing failure in `podcast-ai/test/site-structure.test.js` complaining that `submit.html` does not include the module runtime entry.

## Commands run

- `rtk npm start`
- `rtk npm run test:smoke`
- `rtk npm test`
- Browser plugin checks against `http://127.0.0.1:3010/submit.html`
- Local Playwright screenshot capture to `/tmp/echo-submit-fix-desktop.png`, `/tmp/echo-submit-fix-mobile.png`, and `/tmp/echo-submit-fix-mobile-form.png`

## Known issues

- Browser plugin interaction and console checks worked, but its screenshot API timed out on this page, so screenshot verification used local Playwright captures instead.
- The worktree contains unrelated existing modifications; they were left in place.

## Update 2026-06-14

- Replaced all remaining footer references to the older Continental logo asset with `images/C2-new-white.png` in the static site pages.
- Files touched for this swap: `about.html`, `collection.html`, `collections.html`, `cookies.html`, `index.html`, `privacy.html`, `show.html`, `submit.html`, `supporters.html`, and `terms.html`.
- Verification run: repo-wide search confirmed only `C2-new-white.png` remains in page markup.
