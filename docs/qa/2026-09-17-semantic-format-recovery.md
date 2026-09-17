# Semantic-format recovery - 2026-09-17

This report documents the surgical repair of the immediately preceding
semantic-resolution pass. The worktree was not reset, checked out, stashed, or
reverted. Existing Phase 1-3 work, Batches 1-23, human review/rating changes,
Desert Skies changes, and unrelated user changes were preserved.

## Root cause and pre-change count

The preceding pass correctly changed the importer rule, but then applied its
conclusion retroactively across the catalog. It treated every existing
`metadata.import.fields.formats` value with
`method: "deterministic-feed-type"` as if it were an unresearched RSS
`itunes:type` inference. It removed narrative labels without researching each
show's actual structure and replaced the provenance with
`removed-rss-feed-type`.

The read-only recovery inventory, before this recovery changed anything, found
558 source records carrying that mechanical marker. The preceding pass's
all-source snapshot had identified 563 records and 564 inferred narrative
labels; five reviewed records had already been converted to researched
exceptions by the time this recovery began. Every one of the 558 remaining
records had a non-empty pre-pass format array in the repository baseline, and
all 558 baseline provenance methods were `deterministic-feed-type`.

## Recovery result

- Collateral records restored: **558**.
- Narrative format labels restored: **558**.
- Restored arrays matched the pre-pass arrays exactly: **558/558**.
- Restored format distribution: `episodic` 218, `serialized` 328,
  `full-cast + serialized` 6, `full-cast + serialized + limited-series` 1,
  `serialized + anthology` 3, `episodic + full-cast` 1, and
  `serialized + narrated` 1.
- Source records still carrying `removed-rss-feed-type`: **0**.
- Source records with empty `formats` because of that marker: **0**.
- During recovery, restored records received an existing
  `metadata.researchGaps` entry stating that the legacy format was retained but
  not individually re-researched. That temporary show-level disclosure was
  removed in the targeted post-recovery cleanup; the old RSS format provenance
  was removed and no fake high-confidence RSS verification was added.

The three source records that still have `formats: []` are
`captain-kayato-and-the-catsairs`, `edict-zero-fis`, and
`the-sherwood-society`. None has the removal marker, so none is a consequence
of this mechanical purge. Edict Zero already has an unrelated runtime research
gap.

## Intentionally researched format decisions retained

The following 37 format arrays remain intentionally different from the clean
baseline because they were individually researched in the human-review or
additional source-backed correction work. They were not restored:

| Show | Retained formats |
| --- | --- |
| Afflicted | `serialized, full-cast, anthology` |
| Attention HellMart Shoppers! | `episodic, serialized` |
| Badlands Cola | `serialized` |
| Camlann | `full-cast, serialized` |
| Campfire Radio Theater | `episodic, anthology` |
| Dark Woods | `serialized` |
| Darkest Night | `anthology, serialized` |
| Doctor Who: Redacted | `serialized, full-cast` |
| Don't Mind | `serialized, anthology` |
| DUST | `episodic, anthology` |
| Fairies and Dragons, Ponies and Knights | `serialized` |
| From Within: A Tale of the Macabre | `serialized` |
| Hi Nay | `serialized, episodic` |
| HORROR ETERNAL | `episodic, anthology` |
| Liminal | `serialized, limited-series` |
| Petrified | `episodic, anthology` |
| Tales From Wolf Mountain | `serialized, anthology` |
| The Amelia Project | `full-cast, episodic, serialized` |
| The McIlwraith Statements | `episodic, narrated, serialized` |
| The Awkward Screw | `serialized` |
| The Big Loop | `episodic, anthology` |
| The Black Tapes | `narrated, serialized` |
| The Cellar Letters | `serialized` |
| The Cipher | `serialized` |
| the Dead Letter Office of Somewhere, Ohio | `serialized, anthology` |
| The Dead Letters Podcast | `serialized` |
| The Earth Collective | `serialized, narrated` |
| The Grey Rooms | `full-cast, anthology, serialized` |
| The Liminal Lands | `serialized` |
| The Other Stories | `episodic, anthology` |
| The Radio Adventures of Dr. Floyd | `episodic` |
| The Rapscallion Agency | `serialized` |
| The Thrilling Adventure Hour | `episodic, full-cast, anthology` |
| The Tower | `serialized, limited-series` |
| Wake up, New Vilirth! | `serialized` |
| Within the Wires | `serialized, anthology` |
| WOE.BEGONE | `serialized` |

The researched queue's confirmed-but-unchanged format records, including King
Falls AM, The Red Panda Adventures, TANIS, The Land Whale Murders, Derelict,
and the other confirmations, were also left untouched. The 36-record
resolution ledger remains in
`docs/qa/2026-09-17-semantic-accuracy-resolution.md`; its voice-style,
commitment, best-for, and runtime conclusions were not rolled back.

## Format-delta accounting

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

## Future RSS inference prevention

The root-cause code fix remains in place:

- `backend/lib/import/draft.js` no longer maps RSS `itunes:type=episodic` to
  public `formats: ["episodic"]`.
- It no longer maps RSS `itunes:type=serial` to public
  `formats: ["serialized"]`.
- `backend/lib/import/adapters/rss.js` still retains the feed type as
  objective feed metadata.
- The importer regression tests cover both values, explicit source full-cast
  behavior, and primary-runtime handling.

The publication exception for a future imported candidate with only a source
genre and unsupported RSS narrative signal remains in
`backend/lib/catalog.js`. It does not affect restored legacy records because
their marker was removed and their retained formats are explicitly disclosed
as a research gap.

## Downstream reconciliation

After source recovery, deterministic catalog and page builds were run. The
four affected rule collections were reconciled against the restored final
formats while preserving the researched anthology additions:

| Collection | Final members |
| --- | ---: |
| Anthology Horror | 12 |
| Episodic Comedy | 71 |
| Episodic Horror | 8 |
| Episodic Mystery | 3 |

Generated artifacts were rebuilt, including `data/shows.json`,
`data/collections.json`, `data/search-index.json`, and the catalog-status
outputs. Final downstream snapshots report 1,112 valid collection-membership
edges across 371 shows, 447 authored similarity links with 447 reasons, 17
similarity routes, and 8,084 collection-candidate edges.

## Final diff audit

- Source show files changed overall: **620**. This includes legitimate earlier
  and parallel work; it is not a recovery-only count.
- Recovery-time source format arrays intentionally different from `HEAD`: **37**;
  the current post-recovery targeted state is **38** after the Orbiting Human
  Circus correction.
- Recovery records: **558**, all restored to their baseline arrays.
- Remaining source or generated records with the mechanical marker: **0**.
- Remaining unrelated empty-format records caused by the marker: **0**.

The literal `removed-rss-feed-type` remains only where it is required for the
future inference guard, its publication compatibility branch, regression
fixtures/assertions, and historical QA wording:

- `backend/lib/import/draft.js` - future candidates receive the explicit
  zero-confidence gap marker when RSS is the only unsupported narrative signal.
- `backend/lib/catalog.js` - the corresponding imported-record publication
  exception remains guarded.
- `backend/test/catalog.test.js` and
  `backend/test/import-service.test.js` - regression fixtures verify the guard.
- `docs/qa/2026-09-17-semantic-accuracy-resolution.md` - historical wording
  now explicitly says its intermediate 558-marker state was superseded by this
  recovery.
- This report - documents the marker audit and final zero-record source state.

No catalog source or generated catalog record retains the marker.

## Validation

| Command/check | Result |
| --- | --- |
| `npm run build:catalog` | Passed; 752 shows, 46 collections, 7 review companions |
| `npm run build:pages` | Passed |
| `npm run validate:data` | Passed; 0 integrity errors; existing entity role/type warnings remain |
| `npm run report:discovery-quality` | Passed; 749/752 format coverage |
| `npm run report:similarity` | Passed; 447 authored links, 17 routes |
| `npm run report:collection-candidates` | Passed; 8,084 candidate edges across 331 shows |
| `npm run report:entity-graph` | Passed; 1,112 valid memberships, 371 shows with membership |
| `npm run report:provenance` | Passed; 752 shows scanned |
| `npm run report:catalog` | Passed; Gate B complete, 0 blockers, 29 remaining show-level research-gap records |
| `npm run check:generated` | Passed; 170 generated pages ignored/untracked, 32 authored HTML preserved |
| Focused importer/catalog/entity regressions | Passed; 76/76 |
| `npm --prefix backend test` | Passed; 367/367 |
| `git diff --check` | Passed |

No commit, push, deploy, or publish was performed.
