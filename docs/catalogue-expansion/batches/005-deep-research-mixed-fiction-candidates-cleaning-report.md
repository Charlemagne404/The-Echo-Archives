# Batch 005 cleaning report

Source: `005-deep-research-mixed-fiction-candidates.csv`

This batch was treated as research input only. No candidate was added to the actual catalogue, no importer was run, and importer behavior was not changed.

| Measure | Count |
| --- | ---: |
| Raw rows received | 230 |
| Existing-catalogue matches removed | 0 |
| Previous-backlog matches removed | 86 |
| Internal duplicates removed | 1 |
| Ambiguous candidates retained and flagged | 3 |
| New candidates accepted | 143 |
| Current master-backlog total | 1,064 |
| Current research-exclusion total | 1,264 |

Cleaning used exact title matching plus normalized punctuation, capitalization, apostrophes, leading articles, and known aliases. Creator or network attribution was used when checking possible same-title collisions.

Three clear title-format repeats were removed against the previous backlog:

- `The Flame: A Podcast Musical` → `The Flame`
- `Y2K Audio Drama` → `Y2K`
- `CrossBread — A Comedy Musical` → `CrossBread`

The two `UnTrue` representations within this batch were treated as one production; the later tagline-form row was removed as an internal duplicate.

## Retained ambiguities

These same/generic-title candidates were retained as separate backlog rows because the new attribution may identify a different production:

- `Bronzeville` — existing `Cinema Gypsy Productions`; Batch 5 `Wayland Productions`
- `The Hollow` — existing unattributed `Hollow`; Batch 5 `Gen-Z Media`
- `Starfall` — existing `Wizzard Wizzard Productions`; Batch 5 `Dash of Daring`

## Backlog reconciliation

There were 40 priority conflicts: 18 stronger incoming classifications were applied, while 22 lower incoming classifications were ignored in favor of existing priorities. Attribution was enriched or merged where complementary information was supplied, including `1865`, `The Fitzroy Diaries`, `The Shadows`, `Timestorm`, `The Alien Adventures of Finn Caspian`, `People Who Knew Me`, `Batman: The Audio Adventures`, `Tracks`, `Temujin`, `Powder Burns`, `Rex Rivetter: Private Eye`, `The One Stars`, `Where the Leaves Fall Purple`, `Candy Claus, Private Eye`, `The Kingmaker Histories`, `Boom: A Serial Drama`, and `The 12:37`.
