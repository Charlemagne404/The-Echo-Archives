## Current task

Match the `What creators can update` and `What stays independent` cards on `/for-creators.html` to `For Creators concept 1`, including larger concept-aligned icons, a single-column independence list, and archive-accent footer links.

## Files changed

- `for-creators.html`
- `shared/styles/home/creators.css`
- `podcast-ai/test/browser.smoke.js`
- `HANDOFF.md`

## What was completed

- Reworked both creator list cards to use fixed icon slots and concept-matching spacing.
- Replaced the list-card inline SVGs with sourced Lucide-style outline icons for consistent metaphors and stroke treatment.
- Kept `What creators can update` as a two-column desktop list and changed `What stays independent` to a single vertical desktop column.
- Set the independence icons to a muted gray and locked both footer links to the archive orange/red accent.
- Extended the smoke test to assert the two standards links and the single-column independence layout on desktop.
- Verified the change with browser checks plus local Playwright desktop/mobile section screenshots.

## What still needs work

- Mobile still shows the existing floating action buttons over the lower-right edge of the scrolled section in screenshot-based QA. The card content remains readable, but the overlay is still present.

## Commands run

- `rtk rg -n` / `rtk sed -n` inspection on the creators page, styles, and smoke coverage
- `rtk curl -L https://unpkg.com/lucide-static@latest/icons/...`
- `rtk npm run test:smoke`
- `rtk node --input-type=module - <<'NODE' ...` local Playwright desktop/mobile section screenshots

## Known issues

- Browser-plugin screenshot capture timed out on this page, so final image evidence came from the existing local Playwright install instead.
