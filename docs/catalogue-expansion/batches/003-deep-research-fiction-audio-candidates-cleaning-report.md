# Batch 003 cleaning report

Source: `003-deep-research-fiction-audio-candidates.csv`

This batch was treated as research input only. No candidate was added to the actual catalogue, no importer was run, and importer behavior was not changed.

| Measure | Count |
| --- | ---: |
| Raw rows received | 297 |
| Existing-catalogue matches removed | 0 |
| Previous-backlog matches removed | 110 |
| Internal duplicates removed | 0 |
| Ambiguous candidates retained and flagged | 1 |
| New candidates accepted | 187 |
| Current master-backlog total | 757 |
| Current research-exclusion total | 957 |

Cleaning used exact title matching plus normalized punctuation, capitalization, apostrophes, leading articles, and known aliases. Creator or network attribution was used when checking possible same-title collisions.

The 110 prior-backlog matches include 106 normalized title matches and four obvious title-format duplicates:

- `36 Questions – The Podcast Musical` → `36 Questions`
- `Calling Darkness` → `Calling Darkness Podcast`
- `CrossBread — A Comedy Musical` → `CrossBread`
- `FETIDUS: The Foundation for the Ethical Treatment of the Innocently Damned, Undead and Supernatural` → `FETIDUS`

## Backlog reconciliation

There were 58 priority conflicts. The stronger incoming classification was applied for 36 rows; 22 lower incoming classifications were ignored in favor of the existing higher priority.

Complementary attribution was preserved or merged where useful, including `I Am in Eskew`, `A Scottish Podcast`, `Eeler's Choice`, `Desperado`, `Ethics Town`, `Folxlore`, `Return Home`, `Seminar`, `Clockwork Bird`, `Soul Operator`, `The Kingery`, `Cryptid Counselor`, `Before The Tone`, and `36 Questions`.

`Vega: A Sci-Fi Adventure Podcast` supplied `Ivuoma Okoro`, while the existing backlog record has `Ivuoma Hall`. The existing attribution was retained and the conflict is flagged for source verification rather than guessed resolution.

## Retained ambiguity

`The Night Shift Podcast` was retained separately from the existing `Night Shift` entry because the titles may represent different productions, but the candidate supplied no creator or network attribution. Confirm identity during later review.
