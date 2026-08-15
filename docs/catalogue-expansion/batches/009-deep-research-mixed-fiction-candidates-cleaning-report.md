# Batch 009 cleaning report

Source: `009-deep-research-mixed-fiction-candidates.csv`

This batch was treated as research input only. No candidate was added to the actual catalogue, no importer was run, and importer behavior was not changed.

| Measure | Count |
| --- | ---: |
| Raw rows received | 121 |
| Existing-catalogue matches removed | 0 |
| Previous-backlog matches removed | 26 |
| Internal duplicates removed | 18 |
| Ambiguous candidates retained/flagged | 0 |
| New candidates accepted | 77 |
| Current master-backlog total | 1,408 |
| Current research-exclusion total | 1,608 |

Cleaning used exact title matching plus normalized punctuation, capitalization, apostrophes, leading articles, and known aliases. Creator or network attribution was used when checking possible same-title collisions.

The 18 internal duplicate rows were consolidated by retaining the strongest priority and, when priorities tied, the more informative attribution. This included repeated entries for `Mystery Fiction Mondays`, `Time-Travel Fiction Tuesdays`, `Listen with Other`, `A World Of Trouble`, `Pilot Light`, and other repeated titles.

There were 16 priority conflicts: 4 stronger incoming classifications were applied, while 12 lower incoming classifications were ignored in favor of existing priorities. Attribution was enriched for `A World Of Trouble`, `The Sound Of Home`, `Choose the Bear`, `Crossroads: A 48 Hour Audio Drama Festival`, `Into the Dark of the Woods`, `The Chronicles of Astrimos`, `The Scorched Earth`, `Keyshawn Solves It`, `Interstellar Intercoms`, `The Tree Whisperer`, `For King and Country`, `GLITCH: Twisted Tech Tales`, `Grim Death and Bill the Electrocuted Criminal`, `The Sherwood Society`, and `Faithfully Yours Mozart: The Courtship`.
