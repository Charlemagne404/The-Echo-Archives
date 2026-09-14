# Echo Archives discovery schema audit — 2026-09-14

## Scope and method

This is a catalog-only audit of the authored split sources in
`catalog-src/shows/` and `catalog-src/collections/`. Counts below were
calculated from the current checkout with a read-only Node scan on 2026-09-14;
they are not estimates and are not a claim about live production usage.

The runtime contract is documented in `data/schema.md`, normalized by
`shared/archive-record.js`, checked by `backend/lib/catalog.js`, and checked
again at the raw-source boundary by `backend/lib/catalog-integrity.js`.

## Executive finding

The catalog already has a good factual spine for format, lifecycle, episode
counts, observed runtime, genres, and source-backed metadata. It is not yet a
strong discovery graph because the listener-facing synthesis layer is sparse:
only 73 of 752 published shows have tones, intensity, or best-for-style
curation, only 71 have reasoned similar-show links, and static popularity is
unpopulated. The right next step is selective enrichment of high-value records,
not a bulk metadata fill.

## Current inventory

| Measure | Current count |
| --- | ---: |
| Published shows | 752 |
| Imported / indexed-only / full-review | 517 / 228 / 7 |
| Collections | 46 |
| Similarity collections | 17 |
| Shows with at least one collection membership | 243 (32.3%) |
| Shows with no collection membership | 509 (67.7%) |
| Shows with reasoned `similarTo` links | 71 (9.4%) |
| Directed `similarTo` edges | 234 |
| Shows with static `popularity` data | 0 |

## Attribute coverage

| Existing field | Coverage / values | Discovery value | Main limitation |
| --- | --- | --- | --- |
| `genres` | 752/752; canonical | Strong broad routing | Genre does not describe production style, narrative focus, or intensity. |
| `formats` | 749/752; serialized-only 479, episodic-only 260, both 10, neither 3 | Strongest current discovery field | One array mixes voice style, structure, and series shape; it has no canonical mixed voice value. |
| `formats` voice labels | `full-cast` only 104, `narrated` only 24, both 1, neither 623 | Partially answers acted vs narrated | Only 129 records have an explicit voice signal, and the labels do not express degree or a hybrid. |
| `tones` | 73/752 (9.7%); all 66 indexed-only and 7 full-review | Good controlled vocabulary | Almost all shows, including every imported show, are missing it. |
| `content.intensity` | 73/752 (9.7%) | Useful seed for intensity | Free text uses seven variants: `low`, `low-medium`, `medium`, `medium-high`, `moderate`, `high`, `variable`; it is not a stable filter type. |
| `length` | episode count 743, average runtime 721, observed total hours 675, declared total hours 42 | Strong factual basis for commitment | Most counts are explicitly `at-least`; a listener-facing commitment bucket is absent. |
| lifecycle | `releaseStatus=unknown` 498; `completionStatus=unclear` 506 | Existing and usable when known | Unknown/unclear dominates; one record has an apparent `inactive` + `ongoing` combination. |
| `bestFor` | 71/752 (9.4%) | Useful listening-context routes | Sparse and partly overlaps collection intent. |
| `similarTo` + `similarReasons` | 71/752, 234 edges; current validator requires reasons | Strong model for explainable recommendations | Coverage is concentrated in indexed/full-review records; imported records cannot contribute. |
| `themes` / `tags` / `contentNotes` | 82 / 235 / 75 shows | Helpful supporting context | Coverage is too uneven to stand alone as a complete discovery model. |
| `popularity` | 0/752 populated | Schema slot exists | No static evidence for “popular entry point”; fallback/live community behavior is not catalog evidence. |

## Ability to answer the target questions

| Listener question | Current answerability | Evidence-based assessment |
| --- | --- | --- |
| Heavily narrated or primarily acted? | Partial | `formats` gives a coarse signal for 129 shows; `content.pov` exists for 78 but is free text. There is no canonical `mixed` or degree-aware value. |
| Serialized or episodic? | Good, with three gaps | `formats` covers 749 shows, though 10 carry both labels and 3 carry neither. The array is usable but semantically overloaded. |
| Character-driven or plot-driven? | Weak | No controlled field. `content.pov` and `facts.structure` are sparse prose (78 and 30 shows) and do not consistently answer the question. |
| General tone? | Partial for curated records | The controlled `tones` vocabulary is sound, but coverage is only 73/752. |
| How intense is it? | Partial and inconsistent | `content.intensity` exists on the same 73 records as tones, but its values are free-text variants rather than a stable scale; content warnings remain a separate need. |
| Listening commitment? | Factual basis, no normalized answer | Episode counts and runtime are unusually well covered, but total runtime is often observed/at-least and no show-level bucket exists. |
| Completed or ongoing? | Partial | Known lifecycle values are useful, but `unknown`/`unclear` covers roughly two-thirds of the catalog. Do not infer completion from an old or quiet feed. |
| What else appeals to the same listener? | Strong infrastructure, sparse graph | Reasoned show-to-show links and purpose-led collections exist, but 681 shows have no outgoing `similarTo` set and 509 have no collection membership. |
| Popular entry point or hidden gem? | Not currently answerable from catalog data | No show has static popularity data. Editorial ratings, featured state, collection hubs, and incoming similarity links are not popularity measurements. Do not add a guessed `hiddenGem` flag. |

## Small model extension implemented

An optional `discovery` object is now part of the schema/template and is
validated in both catalog validation paths:

```json
{
  "discovery": {
    "voiceStyle": "primarily-acted",
    "narrativeFocus": "balanced",
    "intensity": "medium",
    "commitment": "short"
  }
}
```

The four fields are intentionally controlled and optional. No existing show
was populated or rewritten. A populated profile is treated as curated data and
is rejected on `reviewStatus: "imported"` records. The profile is retained in
runtime records and the generated search-index projection so later filters,
recommendation constraints, or Archivist responses can use it without another
schema migration.

This does not replace existing data:

- `formats` remains the compatibility source for broad format labels such as
  `serialized`, `episodic`, `full-cast`, and `narrated`.
- `content.intensity` remains valid legacy metadata; new canonical intensity
  curation belongs in `discovery.intensity`.
- `length` remains the factual source for runtime and episode evidence.
- `completionStatus` / `releaseStatus`, collections, and reasoned similarity
  remain separate concerns.

## Population rules for later

1. Populate only a reviewed subset where the signal changes what a listener
   would choose. Leave the object absent when the evidence is weak.
2. `voiceStyle` describes the dominant listening experience: use
   `primarily-acted` when performed scenes carry the show, `primarily-narrated`
   when sustained narration carries it, and `mixed` when both modes are
   materially important. Do not mechanically map `full-cast` to acted or
   `narrated` to solo narration.
3. `narrativeFocus` is a whole-show editorial classification, not a genre or
   POV label. Use `character-driven`, `plot-driven`, or `balanced` after
   considering the full available arc; do not infer it from a title, one
   episode, or a marketing adjective.
4. `intensity` is the overall pressure/weight of the listening experience, not
   a substitute for `contentNotes`. Use `low`, `medium`, `high`, or `variable`;
   keep specific violence, horror, or other warnings in `contentNotes`.
5. `commitment` describes the current listenable catalog, using these
   approximate runtime buckets: `single-sitting` up to 2 hours, `short` over
   2–5 hours, `medium` over 5–15 hours, `long` over 15–30 hours, and
   `deep-dive` over 30 hours. Prefer verified `length.totalHours`; use observed
   totals only when their scope and qualifier are clear. For incomplete feeds,
   omit the bucket rather than implying a final total.
6. Record or retain source evidence for factual inputs in the existing
   provenance/import fields. Keep the editorial decision reviewable in the
   curation/review workflow; do not auto-populate these fields from RSS
   keywords, embeddings, or unreviewed AI suggestions.
7. Treat popularity as a separate, time-sensitive measurement. Future
   `popularity.score` values should carry a documented basis and observation
   date, and “hidden gem” should be derived only after there is a trustworthy
   popularity signal plus a separate quality/curation signal.

## Validation and compatibility

The extension is additive: records without `discovery` remain valid, existing
generated catalog data is unchanged until a record is intentionally enriched,
and no deployment or publication action was taken. Focused tests cover valid
profiles, invalid values/shapes, imported-record restrictions, raw-source
validation, and search-index preservation.
