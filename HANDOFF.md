## Current task

Keep expanded browse-card previews fully inside the viewport when cards on the left or right edge open.

## Files changed

- `shared/app/home-preview.js`
- `podcast-ai/test/browser.smoke.js`
- `HANDOFF.md`

## What was completed

- Updated the home-card preview positioning helper to clamp the expanded panel horizontally within the viewport while keeping the existing card-anchored animation and layout.
- Kept the preview width behavior intact unless viewport space requires clamping, with a small inset on desktop and mobile so edge cards no longer spill off-screen.
- Updated browser smoke assertions so left-edge, right-edge, touch, and narrow-touch previews now verify that the expanded panel stays within the viewport.

## What still needs work

- No follow-up work identified from this fix.

## Commands run

- `rtk npm run test:smoke`

## Known issues

- The worktree contains unrelated existing modifications outside this task; they were left untouched.
