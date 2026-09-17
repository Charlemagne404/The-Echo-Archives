# Phase 3 semantic accuracy audit — 2026-09-17

## Executive finding

The Phase 3 catalog passed structural and coverage validation, but coverage
was not evidence of semantic correctness. The audit found a real regression:
Dark Woods was labelled `episodic` because an RSS feed delivery field was
treated as story structure. The same risk appeared elsewhere, especially
where a show has recurring characters, case-shaped episodes, anthology
seasons, or an overarching arc.

The source catalog was corrected conservatively. The result is intentionally
less uniform: some values were removed, several hybrids were represented with
multiple existing labels, and 36 records were placed in a human-review queue.
The public schema still cannot express every important distinction, so the
queue is preferable to false precision.

## 1. Dark Woods root-cause analysis

### What was wrong

`catalog-src/shows/dark-woods.json` carried:

```json
"formats": ["episodic"]
```

The actual RSS feed has numbered, continuous chapters: “Over the Edge | Episode
One,” “Upstream | Episode Two,” through “Yes or No | Episode Eight (Season
Finale).” The descriptions continue the same disappearance investigation,
characters, task force, permits, and final confrontation. That is a
serialized listening experience, not a set of independent episodes.

Dark Woods now has:

```json
"formats": ["serialized"]
```

`limited-series` was not added because the catalog’s lifecycle fields remain
unknown/unclear; a finite observed feed is not proof of a completed limited
series.

### When it entered the catalog

The value was not first introduced by Phase 3. Commit `1b43c2ec` (2026-08-15,
“71 new shows indexed”) introduced `episodic` with deterministic feed-type
provenance from the RSS `itunes:type` value. The importer path in
`backend/lib/import/draft.js` maps RSS `feedType: "episodic"` directly to the
public `formats` array. The provenance was therefore factual about the feed
metadata, but it was not factual about narrative structure.

Commit `d4c2177e` (2026-09-14) added Dark Woods’s profile (`primarily-acted`,
`plot-driven`, `medium`), and Phase 3 Batch 8 in commit `40163e92` (2026-09-17)
added the tones, themes, best-for routes, content profile, intensity, higher
intensity, commitment, and authored similarity packet. Batch 8 used Wolf
Entertainment’s official page and announcement plus the existing source
metadata, but did not re-audit the inherited format against multiple episode
descriptions or the feed’s final episode.

### Why the reasoning was insufficient

The reasoning conflated three different things:

1. RSS distribution metadata (`itunes:type=episodic`);
2. episode-level titles and premises; and
3. whether a listener can understand each episode independently.

The official synopsis supports the setting and premise, but does not establish
episode independence. The stronger evidence was the sequence of official RSS
descriptions and the explicit season finale. The record had no field-level
editorial ledger requiring a structure decision to be re-justified when Phase 3
added discovery metadata.

### Same or similar failure pattern

The audit found the same pattern in eight inherited `episodic` values that
could be replaced with `serialized`: Badlands Cola, Dark Woods, From Within: A
Tale of the Macabre, Liminal, The Cipher, The Dead Letters Podcast, The Tower,
and Wake up, New Vilirth!. The broader pattern also affected records where the
right answer is hybrid or anthology-aware: Campfire Radio Theater, Darkest
Night, DUST, Petrified, Tales From Wolf Mountain, The Big Loop, The Other
Stories, The Thrilling Adventure Hour, Within the Wires, The Amelia Project,
the Dead Letter Office of Somewhere, Ohio, Hi Nay, The Liminal Lands, The
McIlwraith Statements, and WOE.BEGONE.

The Phase 3 batch notes show why this escaped a coverage-oriented campaign:
Batch 7 described The Cipher and Wake up, New Vilirth! from official listings,
Batch 8 described Dark Woods from official marketing material, Batch 9 used
period/epistolary premises for Badlands Cola and From Within, Batch 11 called
The Liminal Lands an episodic journey, Batch 13 described WOE.BEGONE as a
weekly mystery, Batch 16 described The Dead Letters Podcast as serialized
while retaining its old format, Batch 17 enriched Darkest Night and the
McIlwraith record, and Batch 20 explicitly described The Amelia Project as
individual client stories opening into a larger narrative. Those descriptions
were useful discovery evidence, but they were not a substitute for an
episode-level structure audit.

## 2. Records inspected and corrected

The audit programmatically profiled all 752 published records and then
semantically audited all 235 Phase 3/enrichment-eligible records. The 517
`imported` records were kept outside subjective enrichment scope; they were
included in aggregate integrity and generated-output validation only.

| Measure | Result |
| --- | ---: |
| Published records profiled | 752 |
| Phase 3/enrichment-eligible records semantically inspected | 235 |
| Show records corrected | 46 |
| Records in human review queue | 36 |
| Show records with format corrections | 25 |
| Show records with discovery-profile corrections | 22 |
| Show records with best-for corrections | 2 |
| Show records with provenance/format evidence updates | 15 |
| Authored similarities removed | 0 |

The 46 corrected source records are in `catalog-src/shows/`; generated
`data/shows.json`, `data/search-index.json`, and `data/collections.json` were
rebuilt from those sources.

### Corrected format values

- Removed eight inaccurate `episodic` values and replaced them with
  `serialized`.
- Added `serialized` to 13 records, `anthology` to 13 records, and
  `limited-series` to two records where the primary evidence supported those
  labels.
- Used existing multi-value support for hybrids instead of inventing a new
  public field.

Current enrichment-eligible format counts are: `serialized` 202, `episodic`
47, `anthology` 30, `limited-series` 11, `full-cast` 105, `narrated` 25, and
`long-running` 3. These are overlapping multi-value counts, not a partition.

### Corrected commitment values

There were 22 commitment changes. Two were removed entirely because the
available observed/at-least runtime could not defend a bucket:
Campfire Radio Theater (`short`) and HORROR ETERNAL (`deep-dive`). The other
20 were corrected using the documented approximate runtime boundaries and
clear exact, finished, or sufficiently scoped evidence. Examples include
`long` to `deep-dive` for Hello From The Hallowoods, Stellar Firma, and
Wormwood; `medium` to `long` for Palimpsest, StarTripper!!, The Milkman of St.
Gaff’s, and Two Flat Earthers Kidnap a Freemason; and `long` to `medium` for
Girl in Space, Harbor, Red Valley, The Black Tapes, The Radio Adventures of
Dr. Floyd, Victoriocity, and Windfall.

## 3. Values removed because evidence was insufficient

Four discovery values were removed rather than guessed:

- `discovery.commitment: short` from Campfire Radio Theater;
- `discovery.commitment: deep-dive` from HORROR ETERNAL;
- `bestFor: short-under-five-hours` from Homecoming, whose current episode
  count did not establish a short total;
- `bestFor: short-under-five-hours` from Video Palace, whose exact observed
  total was about 5.8 hours.

The eight inaccurate `episodic` format values are counted separately as
semantic corrections, not merely missing evidence. No tones, themes, or
authored similarity links were deleted solely to preserve coverage. Low
confidence in those areas is represented in the queue and report rather than
silently presented as certainty.

## 4. Most common inference mistakes

1. Treating RSS `itunes:type` or a provider `feedType` as narrative structure.
2. Treating individual episode titles and premises as proof of episodic
   independence.
3. Treating any overarching plot as proof of fully serialized structure while
   ignoring case-based, anthology, or season-anthology behavior.
4. Treating “anthology,” “interviews,” “statements,” or “radio show” as a
   complete format classification without checking framing stories and
   recurring characters.
5. Mapping `full-cast` or `narrated` directly to the dominant voice style.
6. Assigning commitment from episode count or an incomplete observed runtime
   without respecting `at-least`, active-feed, and unknown-lifecycle scope.
7. Reusing generic tones and listening routes across many records because they
   fit the genre, rather than because they describe the particular listening
   experience.
8. Letting computed similarity or rule-derived collection membership survive
   a change to the field that justified it without a downstream check.

The repetition scan found `dark|tense|cinematic` on 36 eligible records and
`dark|tense|weird` on 34. The most repeated best-for sets were
`late-night|headphones-on|binge-listening` (19), the same three values in a
different order (17), and `short-under-five-hours|late-night|headphones-on`
(8). Repetition is a warning signal, not proof that a particular show is
misclassified, so these values were not mass-deleted. They remain an editorial
copy/evidence review concern rather than an automated correction rule.

## 5. Fields with the highest observed correction rate

There is no gold-standard human label set, so a true error rate cannot be
calculated from validation output. The following is correction incidence in
the 46-record audit set, not proof that every unchanged value is correct:

| Field | Corrected records | Interpretation |
| --- | ---: | --- |
| `formats` | 25/46 | Highest concrete error signal; inherited provider structure and hybrid/anthology distinctions were the main problem. |
| `discovery.commitment` | 22/46 | Runtime bucket boundaries and incomplete feeds produced many plausible but indefensible values. |
| provenance supporting `formats` | 15/46 | Evidence was added or corrected so future structure decisions are reviewable. |
| `bestFor` | 2/46 | Short-listening routes were removed when runtime evidence did not support them. |
| `voiceStyle`, `narrativeFocus`, `intensity` | 0 corrected; 36 queued across related cases | These fields have the highest unresolved semantic risk because synopsis-level evidence rarely establishes the whole listening experience. |

The campaign’s 235/235 facet coverage therefore remains a coverage statistic,
not an accuracy statistic. Repeated combinations such as dark/tense/cinematic,
dark/tense/weird, and late-night/headphones-on/binge-listening were treated as
signals for review, not as automatic proof of error.

## 6. Phase 3 batches and reasoning patterns associated with errors

The Dark Woods error crossed campaign boundaries:

- Phase 1/import (`1b43c2ec`) created the provider-derived `episodic` value.
- The Phase 3 profile pass (`d4c2177e`) added subjective profile fields without
  revalidating the format’s meaning.
- Batch 8 (`docs/qa/2026-09-17-phase-3-batch-8-discovery-enrichment.md`) added
  the Dark Woods discovery packet from official marketing and premise
  evidence, but not a multi-episode structure review.

The same reasoning pattern was found in these Phase 3 materials:

| Batch | Audit signal |
| --- | --- |
| 7 | The Cipher and Wake up, New Vilirth! had serial evidence in the batch notes while their inherited episodic labels remained. |
| 8 | Dark Woods was treated as a short episodic route; the official synopsis did not establish episode independence. |
| 9 | Badlands Cola and From Within were enriched from strong premises/format descriptions without a full structure ledger. |
| 11 | The Liminal Lands was described as episodic despite continuous journey evidence. |
| 13 | WOE.BEGONE’s weekly chapter framing was not separated from its multi-season serial arc. |
| 14 | HORROR ETERNAL and Tales From Wolf Mountain used anthology evidence, but commitment was inferred from incomplete active-feed totals. |
| 16 | The Dead Letters Podcast was explicitly called serialized while the public format remained episodic. |
| 17 | Darkest Night and The McIlwraith Statements needed anthology/case/serial boundary review. |
| 19 | The Tower’s official miniseries description contradicted the inherited episodic value. |
| 20 | The Amelia Project explicitly combines client stories and an expanding narrative, exposing the hybrid taxonomy gap. |

The operational pattern is more important than any one batch: Phase 3 packets
recorded rich editorial rationale, but not field-level evidence for every
high-risk classification. The campaign therefore passed consistency checks
while still allowing plausible semantic errors.

## 7. Similarity and collection relationships corrected downstream

No authored `similarTo` edge or `similarReasons` value was removed. A review
of all authored similarities touching the 46 corrected records found no reason
that depended solely on the removed format or commitment value; the reasons
remain specific to story, tone, production, or listening route.

Three rule-derived collection sources were updated:

- Added Campfire Radio Theater, Darkest Night, The Other Stories, and the Dead
  Letter Office of Somewhere, Ohio to `anthology-horror` after anthology
  evidence was confirmed.
- Removed The Tower from `episodic-horror` after its serialized/miniseries
  structure was confirmed.
- Removed The Dead Letters Podcast from `episodic-mystery` after its serial
  structure was confirmed.

The generated collection artifact now reflects four anthology-horror additions,
one episodic-horror removal, and one episodic-mystery removal. No manual
similarity route was left standing on a field that this audit removed.

## 8. Records requiring human review

The full queue is [HUMAN REVIEW QUEUE](./2026-09-17-semantic-accuracy-human-review-queue.md).
It contains 36 records:

- 25 structure/format/presentation cases, including recurring-character,
  procedural, anthology, narrated-documentary, and hybrid cases;
- 11 additional commitment cases where active or at-least runtime evidence
  does not safely determine the current bucket.

The queue records the current value, the specific reason it may be wrong, the
missing evidence, and the exact human decision needed. It does not silently
remove every uncertain value because some may be correct after a human review.

## 9. Schema and taxonomy limitations exposed

The current schema in `data/schema.md` is not expressive enough for every
distinction the audit needed:

- `formats` combines production mode (`full-cast`, `narrated`), story
  structure (`episodic`, `serialized`, `anthology`), and series shape
  (`limited-series`, `long-running`). Multiple values are allowed, but there
  is no precedence or explicit `hybrid`, `procedural`,
  `episodic-with-overarching-arc`, or `season-anthology` value.
- RSS feed type is stored as objective import evidence, but the public format
  field can be mistaken for the same thing. The importer must not be treated
  as an editorial structure classifier.
- `commitment` is one bucket with no public qualifier for exact, observed,
  lower-bound, active-feed, or unknown totals. Incomplete feeds should be able
  to remain unresolved without losing useful episode-level runtime data.
- Discovery fields have no required public evidence pointer or confidence
  ledger. A value can therefore look as authoritative as a factual provider
  field even when it came from a synopsis-level inference.
- `voiceStyle` has a `mixed` value, but the format array does not provide an
  equally clear hybrid structure model.

The correct response is not to force every show into the nearest existing
label. If the product wants to expose these distinctions, the schema needs a
deliberate taxonomy change and a migration plan; until then, omission and
human review are safer.

## 10. Confidence assessment of the remaining enriched catalog

Confidence was assessed internally but not added to the public schema:

- **HIGH:** corrected serial/anthology decisions backed by multiple official
  episode descriptions, explicit official format language, or clear exact
  runtime/lifecycle evidence. Dark Woods is in this group for its structure;
  its subjective profile remains narrower and separately reasoned.
- **MEDIUM:** most remaining format and discovery values supported by an
  official premise plus some feed/runtime evidence, but without a complete
  episode-level ledger. This includes many unchanged tones, themes, best-for,
  narrative-focus, and intensity values.
- **LOW / human review:** the 36 queued records, especially hybrid structure,
  dominant voice style, and commitment on active or at-least feeds. These
  values should be removed or held when the human review cannot defend them.

After correction, the enrichment-eligible inventory is still broad: 235/235
have tones, themes, best-for, and authored similarity coverage; 231 have
`voiceStyle`, 232 have `narrativeFocus`, 227 have `intensity`, and 224 have a
commitment value. Those counts must not be read as confidence scores. The
remaining catalog is materially safer than the pre-audit state, but not fully
semantically verified.

## 11. Validation

All normal catalog and generated-output checks were run after rebuilding:

| Command | Result |
| --- | --- |
| `rtk npm run build:catalog` | Passed; 752 shows, 46 collections, 7 review companions. |
| `rtk npm run validate:data` | Passed; zero catalog/content-integrity errors. |
| `rtk npm run report:catalog` | Passed; zero blocking errors and zero actionable RSS gaps. |
| `rtk npm run report:similarity` | Passed; 447 authored links with 447 reasons; 17 similarity routes; candidate gate coverage 752/752. |
| `rtk npm run report:collection-candidates` | Passed; 8,098 candidate edges; no invalid rules or broad-genre-only promotions. |
| `rtk npm run report:discovery-quality` | Passed; coverage report generated. |
| `rtk npm run report:entity-graph` | Passed; 1,117/1,117 authored collection memberships valid; zero invalid entity links. |
| `rtk npm run report:provenance` | Passed; report generated. It still records legacy/unknown provenance for the catalog, so this is not evidence of complete editorial provenance. |
| `rtk npm run build:pages` | Passed. |
| `rtk npm run check:generated` | Passed; generated HTML boundary valid. |
| `rtk npm run check:structure` | Passed with existing soft-limit warnings for large app/style files and cover assets. |
| `rtk git diff --check` | Passed. |

`rtk npm run test:tools` completed with 81 passing, 3 skipped, and 2
environment-specific failures:

- `monitoring.test.js`: the macOS `stat` implementation rejects the fixture’s
  GNU `-c` option;
- `operations.test.js`: the release fixture invokes `/usr/bin/node`, which is
  absent in this environment.

These failures are unrelated to the catalog edits and were not “fixed” by
changing deployment or operations code.

No deployment, commit, push, or publication was performed.
