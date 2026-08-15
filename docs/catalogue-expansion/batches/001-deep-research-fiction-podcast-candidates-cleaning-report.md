# Batch 001 cleaning report

Source: `001-deep-research-fiction-podcast-candidates.csv`

This batch was treated as research input only. No candidate was added to the actual catalogue, no importer was run, and importer behavior was not changed.

| Measure | Count |
| --- | ---: |
| Raw rows received | 300 |
| Existing-catalogue matches removed | 0 |
| Previous-backlog matches removed | 0 |
| Internal duplicates removed | 0 |
| Ambiguous candidates retained and flagged | 1 |
| New candidates accepted | 300 |
| Current master-backlog total | 300 |
| Current research-exclusion total | 500 |

Cleaning used exact title matching plus normalized punctuation, capitalization, apostrophes, leading articles, and known aliases. Creator or network attribution was used when checking possible same-title collisions.

## Retained ambiguity

`The Department of Variance of Somewhere, Ohio` was retained with `Rat Grimes` attribution. It shares a distinctive phrase and creator with the existing `the Dead Letter Office of Somewhere, Ohio`, but the titles are different productions; confirm the relationship during later catalogue review rather than collapsing them at intake.
