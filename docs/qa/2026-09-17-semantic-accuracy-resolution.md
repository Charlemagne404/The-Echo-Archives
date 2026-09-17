# Semantic-accuracy resolution — 2026-09-17

This report records the application of the researched conclusions supplied with
the complete 36-record human review queue. The original queue remains intact in
`docs/qa/2026-09-17-semantic-accuracy-human-review-queue.md`; its resolution
ledger is the authoritative before/after record for that resolution snapshot.
The later post-recovery targeted fixes supersede the Fairies and Dragons,
Ponies and Knights row and add a researched Orbiting Human Circus format
correction. No ratings, reviews, or unrelated authored editorial content were
changed.

## 1. All 36 records: before → after

| # | Show | Disposition | Before → after |
| ---: | --- | --- | --- |
| 1 | The Awkward Screw | CORRECTED | `formats: episodic` → `serialized` |
| 2 | Attention HellMart Shoppers! | CORRECTED | `formats: episodic` → `episodic, serialized` |
| 3 | Afflicted | CORRECTED | `formats: serialized, full-cast, episodic` → `serialized, full-cast, anthology` |
| 4 | Camlann | CORRECTED | `formats: full-cast, serialized, episodic` → `full-cast, serialized` |
| 5 | Darkest Night | CORRECTED | `formats: episodic, anthology` → `anthology, serialized` |
| 6 | Doctor Who: Redacted | CORRECTED | `formats: serialized, full-cast, episodic` → `serialized, full-cast` |
| 7 | Fairies and Dragons, Ponies and Knights | CORRECTED | `formats: serialized, episodic` → `serialized` |
| 8 | Hi Nay | CORRECTED | `formats: serialized, episodic`; voice style absent → `serialized, episodic`; `voiceStyle: mixed` |
| 9 | King Falls AM | CONFIRMED | `formats: full-cast, serialized, episodic` → unchanged |
| 10 | The Black Tapes | CORRECTED | `formats: narrated, episodic, serialized` → `narrated, serialized` |
| 11 | The Cellar Letters | CORRECTED | `formats: episodic` → `serialized` |
| 12 | The Earth Collective | CORRECTED | `formats: serialized, narrated, episodic` → `serialized, narrated` |
| 13 | The Grey Rooms | CORRECTED | `formats: full-cast, anthology, serialized, episodic` → `full-cast, anthology, serialized` |
| 14 | The Liminal Lands | CORRECTED | `formats: serialized, episodic` → `serialized` |
| 15 | The McIlwraith Statements | CONFIRMED | `formats: episodic, narrated, serialized` → unchanged |
| 16 | The Radio Adventures of Dr. Floyd | CORRECTED | `formats: episodic, serialized` → `episodic` |
| 17 | The Rapscallion Agency | CORRECTED | `formats: serialized, episodic` → `serialized` |
| 18 | The Red Panda Adventures | CONFIRMED | `formats: full-cast, episodic` → unchanged |
| 19 | TANIS | CONFIRMED | `formats: full-cast, serialized`; `voiceStyle: primarily-narrated` → unchanged |
| 20 | WOE.BEGONE | CORRECTED | `formats: serialized, episodic`; `voiceStyle: primarily-narrated` → `serialized`; `voiceStyle: primarily-narrated` |
| 21 | The Land Whale Murders | CONFIRMED | `formats: serialized` → unchanged |
| 22 | Derelict | CONFIRMED | `formats: full-cast, serialized` → unchanged |
| 23 | The Amelia Project | CORRECTED | `formats: full-cast, anthology, serialized, episodic` → `full-cast, episodic, serialized` |
| 24 | the Dead Letter Office of Somewhere, Ohio | CONFIRMED | `formats: serialized, anthology` → unchanged |
| 25 | The Thrilling Adventure Hour | CONFIRMED | `formats: episodic, full-cast, anthology` → unchanged |
| 26 | Case 63 | CONFIRMED | `commitment: short`; `bestFor: short-under-five-hours` → unchanged |
| 27 | The Angel of Vine | CORRECTED | `commitment: medium`; `bestFor: short-under-five-hours` → `commitment: short`; `bestFor: short-under-five-hours` |
| 28 | Blood Ties | CONFIRMED | `commitment: medium` → unchanged |
| 29 | Don't Mind | CORRECTED | `commitment: long` → `medium` |
| 30 | DUST | CORRECTED | `commitment: long` → `medium` |
| 31 | Tales From Wolf Mountain | CORRECTED | `commitment: deep-dive` → `long` |
| 32 | Artifacts of the Arcane | CORRECTED | `commitment: deep-dive` → `long` |
| 33 | Give Me Away | CORRECTED | `commitment: deep-dive` → `long` |
| 34 | Our Fair City | CONFIRMED | `commitment: deep-dive` → unchanged |
| 35 | The Magnus Protocol | CORRECTED | `commitment: deep-dive` → `long` |
| 36 | Wake Of Corrosion | CONFIRMED | `commitment: deep-dive` → unchanged |

## 2. Confirmed-correct records

The confirmed format records are King Falls AM, The McIlwraith Statements, The
Red Panda Adventures, TANIS, The Land Whale Murders, Derelict, the Dead Letter
Office of Somewhere, Ohio, and The Thrilling Adventure Hour. The confirmed
commitment records are Case 63, Blood Ties, Our Fair City, and Wake Of
Corrosion. Their researched values were retained.

## 3. Corrected records

The remaining 24 queue entries were corrected exactly to the supplied research:
17 format/profile records and 7 commitment records. The five commitment/runtime
records received source-backed length corrections where the research supplied
an exact count or aggregate value; the four remaining runtime-unknown cases
retain an explicit gap rather than an invented duration.

## 4. RSS narrative-format root cause and code fix

The importer previously appended `objective.feedType === "serial"` as public
`serialized` and `objective.feedType === "episodic"` as public `episodic` in
`backend/lib/import/draft.js`. That conflated RSS delivery metadata with the
listener-facing narrative structure.

The fix removes those two mappings. `backend/lib/import/adapters/rss.js` still
parses and retains `itunes:type` as objective feed metadata and provenance. An
explicit source format from categories, keywords, or maintainer research can
still become a public format. When an RSS candidate has only the unsupported
narrative signal, the prepared record keeps formats empty and records
`removed-rss-feed-type` with zero confidence and the feed source evidence.

The importer and catalog publication gates were adjusted only for this explicit
state: a source-backed imported record may retain its verified genre without
filling the missing narrative format with a guess. The general two-signal
discovery rule remains enforced for records without this provenance state.

## 5. Additional RSS-derived regressions found elsewhere

The intermediate all-source scan identified 563 records whose format provenance
had been `deterministic-feed-type`, representing 564 inferred
`episodic`/`serialized` labels. That scan removed those narrative labels across
the full 752-record source catalog. Independently evidenced non-narrative
formats such as `full-cast`, `narrated`, `anthology`, and `limited-series` were
retained. This was an overbroad retroactive change and is superseded by
`docs/qa/2026-09-17-semantic-format-recovery.md`: the 558 collateral records
were restored, and no source or generated catalog record retains the
`removed-rss-feed-type` marker. The marker remains only in the importer
regression path for future candidates and in the regression fixtures.

No ratings, reviews, or raw creator/entity strings were changed as part of this
scan. The four rule-derived collections whose membership depended on the
affected episodic signal were reconciled in authored source:

| Collection | Before | After |
| --- | ---: | ---: |
| Anthology Horror | 11 | 12 |
| Episodic Comedy | 71 | 9 |
| Episodic Horror | 13 | 7 |
| Episodic Mystery | 4 | 2 |

## 6. Commitment and runtime source corrections

The final researched commitment values are: The Angel of Vine `short`, Don't
Mind `medium`, DUST `medium`, Tales From Wolf Mountain `long`, Artifacts of the
Arcane `long`, Give Me Away `long`, and The Magnus Protocol `long`; the other
four commitment values were confirmed.

The source length records now use primary-episode counts rather than stale
provider snapshots where applicable:

- Case 63: 2 seasons and 20 primary episodes; aggregate runtime remains unknown.
- The Angel of Vine: 10 full episodes and approximately 4.2 hours.
- Blood Ties: 3 seasons and 26 primary episodes; aggregate runtime remains unknown because the observed provider set was partial.
- Our Fair City: an exact eight-season complete run; aggregate runtime remains unknown.
- Wake Of Corrosion: an exact four-season, 73-primary-episode concluding run; the stale partial runtime is removed.

Runtime calculations in the importer continue to use full episodes only;
bonus and trailer entries remain visible in episode counts but do not inflate
the primary runtime. The four records without a verified aggregate duration
carry `metadata.researchGaps` matching the runtime gate.

## 7. Downstream collection and similarity changes

At this resolution snapshot, before the subsequent format recovery, the
generated catalog had 1,048 valid collection-membership edges across 322 shows,
down from 1,115 edges across 371 shows, reflecting only the reconciled rule
memberships. Collection reasons were regenerated for the retained and newly
matching members. The later recovery restored the current count to 1,112 across
371 shows. No authored `similarTo` link was removed:
the similarity report still finds 447 authored links with 447 written reasons
and 17 similarity routes. Computed similarity qualification was rerun against
the corrected facets; at that resolution snapshot, format coverage was 205/752,
and the output remained deterministic with collection, entity, genre, runtime,
and other available signals.

`bestFor` values were not mechanically changed. Case 63 and The Angel of Vine
retain the researched `short-under-five-hours` route; commitment corrections
were applied independently of editorial listening routes.

## 8. Format-delta accounting

The recovery-time count of 37 intentional format deltas is a repository-wide
format-delta set, not a one-to-one copy of the 36-record semantic-resolution
queue. That queue contains 25 structure/format/presentation cases and 11
commitment cases. Twenty-three of its records are in the recovery-time format
delta set; the other 14 recovery-time format deltas came from separate,
source-backed work:

`Badlands Cola`, `Campfire Radio Theater`, `Dark Woods`, `From Within: A Tale
of the Macabre`, `HORROR ETERNAL`, `Liminal`, `Petrified`, `The Big Loop`,
`The Cipher`, `The Dead Letters Podcast`, `The Other Stories`, `The Tower`,
`Wake up, New Vilirth!`, and `Within the Wires`.

Therefore there is no single missing queue row that accounts for a “37th”
delta; the two counts describe different populations. The targeted
post-recovery correction additionally researched `The Orbiting Human Circus`,
so the current intentional format-delta count is 38. No record was altered to
make the historical counts match.

## 9. Regression tests added or updated

- `backend/test/import-service.test.js` now verifies that RSS `itunes:type`
  remains objective metadata and never creates a public narrative format,
  including both `episodic` and `serial` fixtures. It also verifies the
  explicit removal provenance, source full-cast behavior, and primary runtime
  exclusion of a bonus episode.
- `backend/test/import-adapters.test.js` verifies that bonus and trailer items
  do not enter `totalObservedHours`.
- `backend/test/catalog.test.js` verifies that generic published records still
  need two approved discovery signals, while an imported record with explicit
  removed RSS narrative inference may retain its source-backed genre.
- `backend/test/entity-graph-report.test.js` updates the expected collection
  coverage to the reconciled authored membership snapshot.

The focused catalog/import/adapter run passed 73/73 tests. The full backend
suite passed 367/367 tests.

## 10. Generated artifacts changed

The normal generators were run after source edits. Tracked generated outputs
updated by the catalog rebuild include:

- `data/shows.json`
- `data/collections.json`
- `data/search-index.json`
- `docs/generated/catalog-status.json`
- `docs/generated/catalog-status.md`

The page generator was also run; the generated HTML boundary reports 170
generated pages as ignored/untracked and preserves 32 authored HTML files. The
read-only report commands refreshed their existing generated snapshots,
including the catalog status and catalogue expansion progress outputs.

## 11. Validation results

| Command or check | Result |
| --- | --- |
| `npm run build:catalog` | Passed; 752 shows, 46 collections, 7 review companions |
| `npm run build:pages` | Passed |
| `npm run validate:data` | Passed; 0 content-integrity errors across 752 shows, 46 collections, 132 entities, and 7 review companions; existing entity role/type warnings remain |
| `npm run report:catalog` | Passed; Gate B complete, 0 blocking errors, 0 actionable RSS gaps, 0 taxonomy errors |
| `npm run report:discovery-quality` | Passed; 752 published shows, 235 enrichment-eligible, 7 editorial |
| `npm run report:similarity` | Passed; 447 authored links and 17 similarity routes |
| `npm run report:collection-candidates` | Passed; 7,605 candidate edges across 264 shows |
| `npm run report:entity-graph` | Passed; 1,048 valid collection memberships and 266 connected shows |
| `npm run report:provenance` | Passed; 752 shows scanned and existing legacy/unknown provenance disclosed |
| `npm run check:generated` | Passed |
| `npm run check:structure` | Passed with existing soft line-length and cover-size warnings |
| `npm run test:tools` | 81 passed, 3 skipped, 2 unrelated environment failures |
| `npm --prefix backend test` | Passed; 367/367 |
| `git diff --check` | Passed |

The two tool-suite failures are outside this semantic-accuracy change: the
monitoring test invokes GNU `stat -c` against the current BSD/macOS `stat`, and
the deployment-shell regression fixture hard-codes `/usr/bin/node`, which is
absent in this environment. No files in those test areas were changed here.

## 12. Contradictions to the researched resolution list

None were found within the original 36-record queue. Repository-local source
evidence did not contradict the supplied researched conclusions. All 36 queue
entries are resolved, and the queue ends with **0 unresolved entries** for that
audit; the later targeted Fairies and Orbiting decisions are documented above.

No commit, push, deploy, or publish was performed.
