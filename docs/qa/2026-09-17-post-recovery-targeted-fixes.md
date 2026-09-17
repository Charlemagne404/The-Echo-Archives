# Post-recovery targeted fixes — 2026-09-17

Scope: only the four named format/framing corrections, removal of the generic
legacy-format recovery disclosure, current-count documentation, and the
requested deterministic rebuild and validation. No commit, push, deploy, or
publish was performed.

## Four show corrections

These before values describe the working-tree state at the start of this
targeted pass, not the older `HEAD` snapshot.

| Show | Before | After | Notes |
| --- | --- | --- | --- |
| The Awkward Screw | `formats: ["serialized"]`; internal framing: `full-cast episodic science-fiction adventure` | `formats: ["serialized"]`; internal framing: `full-cast serialized science-fiction adventure` | The serialized label was retained. The official description was not changed. |
| Fairies and Dragons, Ponies and Knights | `formats: ["serialized"]`; internal framing: `episodic all-ages story podcast with live-performance roots` | `formats: ["episodic", "serialized"]`; internal framing: `episodic, serialized all-ages story podcast with live-performance roots` | Canonical order is used. The official description, including its creator-supplied “episodic” wording, was not changed. |
| The Liminal Lands | `formats: ["serialized"]`; internal framing: `weekly episodic survival-horror journey`; similarity reason called it a `long-running episodic` world | `formats: ["serialized"]`; internal framing: `serialized survival-horror journey`; reason now describes a `solitary serialized journey` | The official description still says “weekly podcast”; that external cadence wording was not rewritten. |
| The Orbiting Human Circus | `formats: ["episodic"]` | `formats: ["episodic", "serialized"]` | Canonical order is used. No official description or authored similarity link was removed. |

Authored and generated formats now match for all four records. The generated
records are in `data/shows.json`; the authored records are in
`catalog-src/shows/`.

## Research-gap cleanup

Before this pass, the generated status reported **583 show records** with
`metadata.researchGaps`. That included **558** copies of this generic recovery
disclosure:

> Legacy narrative format is retained from pre-2026-09-17 catalog data but was not individually re-researched; RSS itunes:type is not sufficient narrative-structure evidence.

The exact generic disclosure was removed from **558 records**. After the
cleanup, the catalog has **29 genuine show-level research-gap records** with
**32 genuine gap entries**. `docs/generated/catalog-status.json` and
`docs/generated/catalog-status.md` now report 29, and no generic disclosure
remains in authored or generated show data.

Four records had both the generic disclosure and a real gap; only the generic
item was removed from each:

- `machina` — runtime/full-episode duration remains unverified.
- `route-6-6` — the canonical Spotify identity remains unresolved.
- `shelterwood` — the Season 2 release date remains unannounced.
- `wake-of-corrosion` — aggregate runtime remains unverified while the
  four-season, 73-primary-episode run remains preserved.

The 29 records retaining genuine gaps are:

`solar`, `the-deca-tapes`, `earth-eclipsed`, `windfall`, `the-waystation`,
`impact-winter`, `red-valley`, `midnight-burger`, `derelict`, `crystal-blue`,
`case-63`, `victoriocity`, `wake-of-corrosion`, `the-rapscallion-agency`,
`the-invenios-expeditions`, `blood-ties`, `our-fair-city`,
`two-flat-earthers-kidnap-a-freemason`, `edict-zero-fis`, `machina`,
`shelterwood`, `route-6-6`,
`fairies-and-dragons-ponies-and-knights`, `steal-the-stars`, `batman-unburied`,
`parkdale-haunt`, `the-harrowing`, `the-sojourn`, and `rosannas-secret`.

The historical fact that 558 formats came from weak legacy evidence remains in
`docs/qa/2026-09-17-semantic-format-recovery.md` and the related campaign QA
documentation; it is no longer duplicated as a show-level unresolved gap.

## Collections and similarity

The current authored collection materialization is **1,112 valid membership
entries across 371 shows**. The four rule collections whose current counts are
format-sensitive remain internally reconciled:

| Rule collection | Current members |
| --- | ---: |
| Anthology Horror | 12 |
| Episodic Comedy | 71 |
| Episodic Horror | 8 |
| Episodic Mystery | 3 |

There are zero rule-membership mismatches against current authored formats.
Fairies and Dragons is not a member of a format-rule collection; Orbiting was
already an Episodic Comedy member and remains one after gaining `serialized`;
The Liminal Lands remains in its existing ongoing/survival/worldbuilding
collections; and The Awkward Screw's existing curated memberships remain
unchanged.

The similarity report still finds **447 authored links with 447 reasons across
17 routes**. The only authored similarity-reason change in this targeted pass
is The Liminal Lands → Our Fair City; it no longer calls The Liminal Lands
“long-running episodic” and now describes its continuing serialized journey.
Existing Orbiting reasons remain accurate with the hybrid format. For example,
`catalog-src/shows/the-big-loop.json` still describes Orbiting as a “serialized
radio-show fantasy,” and `catalog-src/shows/the-thrilling-adventure-hour.json`
still describes it as “serialized musical fantasy.” No authored similarity
relationship was removed.

The current collection-candidate report produces **8,084 candidate edges across
331 shows**. The current computed similarity output includes both episodic and
serialized signals for Orbiting and both labels for Fairies where applicable.

## 37 deltas versus the 36-record queue

The recovery report's historical **37 intentional format deltas** and the
semantic-resolution queue's **36 records** are different populations, not a
one-to-one ledger. The queue contains 25 structure/format/presentation cases
and 11 commitment cases. Twenty-three queue records overlap the recovery-time
format-delta set. The exact 14 recovery-time format deltas outside that queue
are:

`Badlands Cola`, `Campfire Radio Theater`, `Dark Woods`, `From Within: A Tale
of the Macabre`, `HORROR ETERNAL`, `Liminal`, `Petrified`, `The Big Loop`,
`The Cipher`, `The Dead Letters Podcast`, `The Other Stories`, `The Tower`,
`Wake up, New Vilirth!`, and `Within the Wires`.

Consequently, there is no single missing queue record that can be identified as
the “37th” delta. No data was altered to force the historical counts to match.
The targeted research of The Orbiting Human Circus is an additional current
format delta, so the current source-vs-`HEAD` format-delta count is **38**.
This accounting is documented in both the recovery report and the resolution
report.

## Historical collection counts

The **1,048** count in the semantic-resolution report is the generated
resolution snapshot before the later format recovery. The **1,115** count in
the post-campaign cleanup report is its pre-recovery cleanup snapshot. The
current post-recovery state is **1,112** valid membership entries across 371
shows. These historical reports were clarified rather than rewritten as if
their earlier snapshots never existed. Current-state documentation points to
the current generated reports.

## Validation

| Command/check | Result |
| --- | --- |
| `npm run build:catalog` | Passed; 752 shows, 46 collections, 7 review companions |
| `npm run validate:data` | Passed; 0 integrity errors across 752 shows, 46 collections, 132 entities, and 7 review companions; existing entity role/type warnings remain |
| `npm run report:discovery-quality` | Passed; 752 published shows; 749/752 have formats; current materialized memberships are 1,112 across 371 shows |
| `npm run report:similarity` | Passed; 447 authored links/reasons, 17 routes; all 752 shows meet the report's minimum candidate bands |
| `npm run report:collection-candidates` | Passed; 8,084 candidate edges across 331 shows |
| `npm run report:entity-graph` | Passed; 1,112 valid memberships, 371 shows with membership, 266 connected shows |
| `npm run report:provenance` | Passed; 752 shows scanned |
| `npm run report:catalog` | Passed; Gate B complete, 0 blockers, 29 remaining show-level research-gap records |
| `npm --prefix backend test -- test/import-service.test.js test/import-adapters.test.js test/import-resolution.test.js test/catalog.test.js test/catalog-invariants.test.js test/catalog-integrity.test.js` | Passed; the package test script expanded to the full backend test glob: 367/367 |
| `npm run check:generated` | Passed; generated HTML boundary valid; 170 generated pages ignored/untracked and 32 authored HTML files preserved |
| `git diff --check` | Passed |

The three already-empty format records were not changed:
`catalog-src/shows/captain-kayato-and-the-catsairs.json`,
`catalog-src/shows/edict-zero-fis.json`, and
`catalog-src/shows/the-sherwood-society.json` still have the same empty format
arrays as `HEAD`. There are zero `removed-rss-feed-type` markers in
`catalog-src/` or `data/`; the marker remains only in the intentional importer
guard, tests, and historical QA wording.

No authored rating/review fields changed in the current source diff, and no
files under `catalog-src/reviews/` or `data/reviews/` changed.

## Review and commit boundaries

The targeted correction itself is validated, but the shared worktree is not a
single safe commit. The current diff includes 621 authored show files, four
pre-existing collection-source files, generated catalog artifacts, campaign
code/tests, unrelated UI/runtime edits, and five existing untracked campaign QA
reports. Examples of the broad recovery pattern are the repeated provenance
deletions in `catalog-src/shows/13-minutes-or-less.json` and
`catalog-src/shows/zoic.json`; those are distinct from the four named semantic
corrections and should remain reviewable as campaign/recovery work.

Recommended commit boundaries:

1. Targeted authored correction and generic-gap cleanup: the four named show
   files plus the 558 exact generic-gap removals.
2. Deterministic generated outputs: `data/shows.json`,
   `data/collections.json`, `data/search-index.json`, and the two
   `docs/generated/catalog-status.*` files, committed with or immediately after
   the authored data according to repository policy.
3. Documentation: this report and the clarified
   `semantic-format-recovery`, `semantic-accuracy-resolution`,
   `post-campaign-cleanup-review`, `CURRENT_STATE`, and `ROADMAP` documents.
4. Earlier campaign changes: `backend/lib/catalog.js`,
   `backend/lib/import/draft.js`, the existing backend tests, and the four
   collection-source files.
5. Unrelated user work: `shared/app/pages/home.js`,
   `shared/app/pages/home/results.js`, `shared/app/pages/home/state.js`,
   `shared/app/scroll-restoration-boot.js`, `script.js`, `sw.js`, and the
   unrelated `backend/test/show-detail-navigation.smoke.js` change.

## Disposition

The targeted corrections are internally reconciled and pass the requested
validation. The overall worktree is **NEEDS MANUAL REVIEW** before committing
because the recovery/campaign diff and unrelated user edits remain interleaved;
this report does not authorize committing them as one change.
