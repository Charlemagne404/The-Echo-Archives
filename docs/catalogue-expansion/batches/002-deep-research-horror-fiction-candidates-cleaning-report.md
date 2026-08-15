# Batch 002 cleaning report

Source: `002-deep-research-horror-fiction-candidates.csv`

This batch was treated as research input only. No candidate was added to the actual catalogue, no importer was run, and importer behavior was not changed.

| Measure | Count |
| --- | ---: |
| Raw rows received | 300 |
| Existing-catalogue matches removed | 0 |
| Previous-backlog matches removed | 30 |
| Internal duplicates removed | 0 |
| Ambiguous candidates retained and flagged | 5 |
| New candidates accepted | 270 |
| Current master-backlog total | 570 |
| Current research-exclusion total | 770 |

Cleaning used exact title matching plus normalized punctuation, capitalization, apostrophes, leading articles, and known aliases. Creator or network attribution was used when checking possible same-title collisions.

## Backlog reconciliation

The 30 prior-backlog matches were not appended again. Higher-priority classifications were preserved for all conflicts: 20 rows moved to the stronger Batch 2 priority, while two Batch 2 downgrades (`Bloodthirsty Hearts` and `The Monster Hunters`) retained their existing P1 classification. The 8 remaining matches had the same priority.

Useful attribution updates were applied to existing backlog rows:

- `The Road of Shadows`: `Mark R. Healy / Beyond the Dark Productions`
- `Woodbine`: `Alex Nursall & Emily Kellogg`

Existing attribution was preserved where Batch 2 was blank or only reordered/abbreviated the same names.

## Retained ambiguities

These candidates were retained because they may be distinct productions, but their missing attribution or close title relationship warrants later identity review:

- `Bunker 8` versus the existing backlog entry `The Bunker`
- `Aftershocks` versus the existing backlog entry `Aftershock`
- `The Harrowing of Minerva Damson` versus the existing backlog entry `The Harrowing`
- `The Veil Radio Dramas` versus the existing backlog entry `The Veil`
- `Tales of the Monster Hunters` versus the existing backlog entry `The Monster Hunters`

`The Department of Variance of Somewhere, Ohio` was also present as a prior-backlog duplicate; its earlier ambiguity flag from Batch 1 remains in force and was not re-counted as a new accepted candidate here.
