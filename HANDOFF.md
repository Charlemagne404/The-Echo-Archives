## Current task

Keep the active-filter row fully hidden unless real filtering is active.

## Files changed

- `shared/styles/home/cards.css`
- `podcast-ai/test/browser.smoke.js`

## What was completed

- Confirmed the visible-empty-row bug was a CSS issue: `.active-browse-state { display: flex; }` was overriding the element’s `hidden` attribute.
- Added an explicit `.active-browse-state[hidden] { display: none !important; }` rule so the row disappears completely in the default archive state.
- Extended smoke coverage so the homepage now verifies the active-filter row is hidden on initial load and hidden again after clearing filters.

## What still needs work

- No known follow-up for this change.

## Commands run

- `rtk npm run test:smoke`

## Known issues

- None currently known for this change.
