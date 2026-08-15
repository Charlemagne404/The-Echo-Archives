# Batch 006 cleaning report

Source: `006-deep-research-fiction-audio-candidates.csv`

This batch was treated as research input only. No candidate was added to the actual catalogue, no importer was run, and importer behavior was not changed.

| Measure | Count |
| --- | ---: |
| Raw rows received | 58 |
| Existing-catalogue matches removed | 11 |
| Previous-backlog matches removed | 16 |
| Internal duplicates removed | 0 |
| Ambiguous candidates retained/flagged | 1 flagged |
| New candidates accepted | 31 |
| Current master-backlog total | 1,095 |
| Current research-exclusion total | 1,295 |

Cleaning used exact title matching plus normalized punctuation, capitalization, apostrophes, leading articles, and known aliases. Creator or network attribution was used when checking possible same-title collisions.

`The White Vault` matched the current catalogue and was not added to the backlog. Its incoming `Creative Call` attribution conflicts with the existing indexed attribution, so the conflict was flagged rather than used to alter catalogue data. The related `The White Vault: Velez Rendezvous` and `The White Vault: Magellanica` titles were retained as distinct candidates.

There were 11 backlog priority conflicts: the existing higher-priority classification was preserved in each case, except that `The Night's End Podcast` was promoted from P3 to the incoming P2 classification.
