# Batch 004 cleaning report

Source: `004-deep-research-fiction-audio-candidates.csv`

This batch was treated as research input only. No candidate was added to the actual catalogue, no importer was run, and importer behavior was not changed.

| Measure | Count |
| --- | ---: |
| Raw rows received | 300 |
| Existing-catalogue matches removed | 0 |
| Previous-backlog matches removed | 136 |
| Internal duplicates removed | 0 |
| Ambiguous candidates retained and flagged | 4 |
| New candidates accepted | 164 |
| Current master-backlog total | 921 |
| Current research-exclusion total | 1121 |

Cleaning used exact title matching plus normalized punctuation, capitalization, apostrophes, leading articles, and known aliases. Creator or network attribution was used when checking possible same-title collisions.

Three title matches were retained as separate candidates rather than collapsed because the supplied attribution may identify different productions:

- `Black Box` — existing `QCODE`; Batch 4 `Reverb`
- `The Grotto` — existing `Athena Lee`; Batch 4 `Athena S. Kye`
- `The Night Shift` — existing unattributed `Night Shift`; Batch 4 `Nocturne Studios`

`Mage and Machine` was also retained separately from the existing `Mage In The Machine` because the title wording and attribution do not establish an obvious duplicate.

## Backlog reconciliation

Existing higher-priority classifications were preserved. Attribution was enriched or merged where the new input supplied complementary information, including `Escape Pod`, `Celeritas`, `Tides`, `The Minister of Chance`, `The Springheel Saga`, `The Deep Vault`, `A Scottish Podcast`, `PodCastle`, `The Mask of Inanna`, `HG World`, `Ostium Podcast`, `Spirit Box Radio`, `Timestorm`, `Afflicted`, `Hollow Disciple`, `The Twelvelms Conspiracy`, and `Dead Space: Deep Cover`.

There were 62 priority conflicts: 41 stronger incoming classifications were applied, while 21 lower incoming classifications were ignored in favor of existing priorities.
