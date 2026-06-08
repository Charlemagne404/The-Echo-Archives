## Current task

Consolidate the repo documentation into a smaller active set without losing important planning, architecture, or operational context.

## Files changed

- `README.md`
- `AGENTS.md`
- `HANDOFF.md`
- `MEMORY.md`
- `TODO.md`
- `docs/PRODUCT.md`
- `docs/ROADMAP.md`
- `docs/ARCHITECTURE.md`
- `docs/OPERATIONS.md`
- moved historical planning docs into `docs/archive/`
- moved `To-Do.txt` into `docs/archive/`
- moved the dated mobile QA report into `docs/qa/`
- moved design feedback files into `docs/research/feedback/`

## What was completed

- Replaced the overlapping active docs with four source-of-truth files: product, roadmap, architecture, and operations.
- Preserved detailed historical material by moving retired docs into `docs/archive/` instead of deleting them.
- Moved the point-in-time mobile QA report into `docs/qa/`.
- Moved feedback snapshots out of the repo root into `docs/research/feedback/`.
- Simplified `README.md` so the active doc set is obvious.
- Turned `MEMORY.md` and `TODO.md` into purposeful support files instead of empty placeholders.

## What still needs work

- Future doc changes should update the consolidated source files instead of reintroducing one-off planning docs.
- If archived docs stop being useful later, a smaller second-pass archive cleanup may still be worth doing.

## Commands run

- `rtk rg --files ...`
- `rtk rg -n "^#|^##|^###" ...`
- `rtk wc -l ...`
- `rtk sed -n ...`
- `rtk mkdir -p docs/archive docs/qa docs/research/feedback`
- `rtk mv ...`

## Known issues

- `docs/archive/` still contains a large amount of historical detail by design. The active surface is smaller, but the archive itself is not yet pruned beyond this first consolidation pass.
