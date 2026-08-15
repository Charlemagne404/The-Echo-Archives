# Batch 008 cleaning report

Source: `008-deep-research-mixed-fiction-candidates.csv`

This batch was treated as research input only. No candidate was added to the actual catalogue, no importer was run, and importer behavior was not changed.

| Measure | Count |
| --- | ---: |
| Raw rows received | 297 |
| Existing-catalogue matches removed | 0 |
| Previous-backlog matches removed | 87 |
| Internal duplicates removed | 0 |
| Ambiguous candidates retained and flagged | 1 |
| New candidates accepted | 202 |
| Current master-backlog total | 1,331 |
| Current research-exclusion total | 1,531 |

Cleaning used exact title matching plus normalized punctuation, capitalization, apostrophes, leading articles, and known aliases. Creator or network attribution was used when checking possible same-title collisions.

Eight clear title-format repeats were removed against the previous backlog: `Camlann - An Audio Drama`, `Afflicted: A Horror Thriller Audio Drama`, `ROGUEMAKER: A Science Fiction Podcast`, `Woodbine: A Parkdale Haunts Production`, `Residents of Proserpina Park - A Mythology Audio Drama`, `Don't Look - A Horror Audio Drama`, `Brittle Tourniquet - Audio Drama`, and `Vampire: The Masquerade: Blood Doll Audio Drama`.

## Retained ambiguity

`Unfuck Your Life: An Audio Drama` was retained separately from the existing `Unfuck Your Life with Tog Chesterfield`. The shared title stem is insufficient to establish that they are the same production, and the new row has no creator or network attribution.

## Backlog reconciliation

There were 49 priority conflicts: 29 stronger incoming classifications were applied, while 20 lower incoming classifications were ignored in favor of existing priorities. Attribution was enriched or merged for `DC High Volume: Batman`, `Doctor Who: Redacted`, `Close Your Eyes`, `Crime Of the Week`, and `Bunker 8`.
