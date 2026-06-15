## Current task

Move all top-level show folders into a new `shows/` directory and update archive paths to match.

## Files changed

- `HANDOFF.md`
- `data/schema.md`
- `data/shows.json`
- `data/shows_old.json`
- `docs/archive/DATA_MODEL.md`
- `docs/archive/FINAL_VISION.md`
- `docs/archive/legacy-redirects.json`

## What was completed

- Moved every top-level show-specific folder into `shows/`.
- Updated all catalog cover paths to point at `shows/...`.
- Updated legacy redirect manifest entries for the moved per-show redirect shims.
- Updated schema/archive docs that still showed the old root-level cover example path.

## What still needs work

- None from this move.

## Commands run

- `mkdir -p shows && mv 'Impact Winter' 'ars paradoxica' 'crystal-blue' 'deca tapes' 'derelict' 'desert-skies' 'earth eclipsed' 'eoah' 'eos10' 'from now' 'how i died' 'midnight burger' 'oz9' 'paralyzed' 'red valley' 'solar' 'spectre' 'station151' 'story' 'the phenomenon' 'the waystation' 'towe4' 'vast horizon' 'were alive' 'white-vault' 'windfall' 'wolf359' shows/`
- `rtk npm run check:links`
- `rtk npm test`

## Known issues

- None found during validation.
