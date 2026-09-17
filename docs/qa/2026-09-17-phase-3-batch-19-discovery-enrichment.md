# Phase 3 Batch 19 — Discovery Enrichment QA

Date: 2026-09-17  
Scope: nine published, enrichment-eligible show records and six curated collection sources  
Status: local source and generated-catalog validation only; not committed, deployed, or published

## 1. Scope and guardrails

Batch 19 continues the sequential Phase 3 discovery-enrichment work after Batch 18. The post-Batch 18 queue contained 111 actionable eligible records. A fresh graph review found four exact records below three useful facet groups: The Elmwood Strain, The Tower, The Magnus Protocol, and Shelterwood. The Harrowing had complete facet coverage but no authored similarity links. The remaining five selections were diverse, low-membership route opportunities supported by existing source data rather than mechanical backfill.

The existing source-of-truth and safety rules were preserved:

- `catalog-src/shows/` and `catalog-src/collections/` remain authoritative; generated `data/` and `docs/generated/` files were rebuilt normally.
- Discovery values were added only where the show record and an official, creator, publisher, provider, or feed source supported a useful classification.
- The Elmwood Strain, The Tower, The Magnus Protocol, and Shelterwood received bounded discovery/content packets and independent directional authored similarity reasons. The Harrowing received authored similarity links only.
- The Big Loop, Twilight Histories, The Dragoning, and Crooked River received only one curated collection placement each; no show-source discovery, content, rating, verification, or lifecycle fields were added for these route-only records.
- Imported/factual-only records were not edited. No ratings, reviews, community scores, creator-verification claims, factual metadata, or lifecycle corrections were added.
- The similarity scorer, weights, thresholds, public computed-match gate, and explanation policy were not changed. Computed candidates were not promoted into authored relationships.
- No raw creator, network, publisher, provider, or broadcaster string was promoted to a new typed entity relationship. Existing entity links and provenance were not rewritten.
- Rule-based collections and existing similarity-collection materialization were not manually changed. Every new curated collection edge has an explicit collection-specific `showReasons` value.

## 2. Selection analysis

The pre-Batch 19 snapshot contained 752 published shows, 235 enrichment-eligible records, 371 shows with at least one collection, 381 without collection membership, and 111 actionable candidates. The exact remaining sub-three-facet queue was the first four records below. The Harrowing was selected because its route and source fields were complete but its authored similarity surface was empty. The four route-only selections were chosen to extend underrepresented drama, serialized, anthology, speculative, historical, and comedy paths without adding weak or repetitive horror metadata.

| Record | Discovery function | Why this batch included it |
| --- | --- | --- |
| [The Elmwood Strain](../../catalog-src/shows/the-elmwood-strain.json) | Psychedelic biological and small-town return horror | One of the four remaining exact facet gaps, with official show/feed evidence for its dark, tense, weird premise and a high-value late-night route. |
| [The Tower](../../catalog-src/shows/the-tower.json) | Experimental isolated-tower mystery | One of the four remaining exact facet gaps; the official Tin Can Audio page supports the tower, the abandoned city, Kiri, payphones, and buried secrets. |
| [The Magnus Protocol](../../catalog-src/shows/the-magnus-protocol.json) | Serialized institutional archive horror | One of the four remaining exact facet gaps; the official Rusty Quill page supports its O.I.A.R. setting, Magnus Institute legacy, and dangerous archive framing. |
| [Shelterwood](../../catalog-src/shows/shelterwood.json) | Docu-horror and found-footage suburban mystery | One of the four remaining exact facet gaps, with official evidence for the missing-sister investigation and impossible neighborhood premise. |
| [The Harrowing](../../catalog-src/shows/the-harrowing.json) | Storm-bound island crime and ancient evil | Complete facet coverage but no authored outgoing similarity links; official show evidence supports two directional adjacent-horror recommendations. |
| [The Big Loop](../../catalog-src/shows/the-big-loop.json) | Self-contained strange-fiction anthology | A one-membership record with an existing anthology/self-contained signal suitable for an additional Start here route. |
| [Twilight Histories](../../catalog-src/shows/twilight-histories.json) | Alternate histories and parallel-world stories | A one-membership record with an existing speculative/worldbuilding signal suitable for Worldbuilding deep dives. |
| [The Dragoning](../../catalog-src/shows/the-dragoning.json) | Satirical speculative audio drama about women and dragons | A two-membership record with existing ensemble/speculative/comedy signals suitable for Ensemble chaos with heart. |
| [Crooked River](../../catalog-src/shows/crooked-river.json) | Short Depression-era historical crime narrative | A one-membership record with a source-backed historical, narrative, late-night branch suitable for Late-night tension. |

The four exact facet gaps were addressed where source evidence was ready. Lower-evidence records, entity gaps, and imported records remain in the queue for later review rather than being filled mechanically.

## 3. Evidence anchors checked

These sources supported premise, setting, form, production framing, or route intent. They were not used to fabricate ratings, verification, or lifecycle state.

| Record | Source anchor and supported signal |
| --- | --- |
| The Elmwood Strain | [Violet Hour Media official show page](https://www.violethourmedia.com/elmwood-strain/), the local official RSS source, and the [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/the-elmwood-strain/id1546393799) — show premise, dark/tense/weird framing, and the return-home/small-town horror route. |
| The Tower | [Tin Can Audio official show page](https://www.tincanaudio.co.uk/thetower) — experimental audio-drama miniseries, an abandoned tower/city, Kiri's isolation, payphones, and buried secrets. |
| The Magnus Protocol | [Rusty Quill official show page](https://rustyquill.com/show/the-magnus-protocol/) — official follow-on, O.I.A.R., the Magnus Institute legacy, Alice and Sam, and the dangerous institutional archive frame. |
| Shelterwood | [Official Shelterwood site](https://shelterwood.carrd.co/) — docu-horror/found-footage framing, the missing-sister investigation, the impossible neighborhood, and transcript-oriented presentation. |
| The Harrowing | [Acast show page](https://shows.acast.com/the-harrowing) — once-in-a-century storm, remote Scottish island, crime, ancient evil, and ensemble cast framing. |
| The Big Loop | [Official About page](https://www.thebiglooppodcast.com/about) plus the local show source — creator/production anchor and the existing self-contained anthology premise. |
| Twilight Histories | [Official show site](https://twilighthistories.com/) plus the local official feed metadata — alternate-history and parallel-world framing already represented in the source record. |
| The Dragoning | [Messenger Theatre Company official show page](https://www.messengertheatreco.org/the-dragoning) — audio-drama format, women-and-dragons premise, satirical speculative-fiction framing, cast, and production. |
| Crooked River | The local official show source, its official feed anchor, and the creator's [official biography](https://www.dave-beazley.com/about) — Depression-era historical crime and the existing short, narrative-driven route. |

The Twilight Histories page was treated as a source anchor for the local record rather than as a reason to invent new factual fields. Where a crawler did not expose a page cleanly, the corresponding local official feed/source metadata was retained as the evidence boundary.

## 4. Enrichment decisions

The five full packets are bounded to the evidence anchors above:

| Record | New discovery packet |
| --- | --- |
| The Elmwood Strain | Tones `dark`, `tense`, `weird`; themes `psychedelic biological horror`, `small-town psychosis`, `trauma and returning home`; best-for `late-night`, `headphones-on`, `binge-listening`; profile primarily acted, plot-driven, high intensity, medium commitment; four structured content keys for source material, setting, central conflict, and production; authored similarities to Shelterwood and The Town Whispers. |
| The Tower | Tones `dark`, `cinematic`, `melancholic`; themes `isolation and escape`, `a city built around the sky`, `payphones and buried secrets`; best-for `late-night`, `headphones-on`, `short-under-five-hours`; profile primarily acted, plot-driven, medium intensity, short commitment; four structured content keys; authored similarities to The Far Meridian and The Milkman of St. Gaff's. |
| The Magnus Protocol | Existing themes retained and extended with `institutional aftermath` and `dangerous archives and bureaucratic risk`; tones `dark`, `tense`, `weird`; best-for `late-night`, `headphones-on`, `binge-listening`, `worldbuilding`; profile primarily acted, plot-driven, high intensity, deep-dive commitment; four structured content keys; authored similarities to The Magnus Archives and WOE.BEGONE. |
| Shelterwood | Existing tones, themes, and structured content retained; best-for `late-night`, `headphones-on`, `binge-listening`; profile primarily acted, plot-driven, high intensity, medium commitment; authored similarities to Limetown and The Black Tapes. |
| The Harrowing | No new facet or content fields; authored similarities to The White Vault and The Town Whispers, with directional reasons distinguishing its storm-bound Scottish-island crime/ancient-evil premise from each adjacent recommendation. |

The authored similarity reasons are directional and independently written. They explain both the shared discovery signal and the meaningful distinction between the source show and each target; no reciprocal links were copied into the target records.

## 5. Curated collection placements

The batch adds six curated membership edges. Existing rule/similarity memberships were regenerated from unchanged inputs and are not counted as authored batch edits.

| Collection | Added record and reason |
| --- | --- |
| Cold isolation horror | The Elmwood Strain — a return-home mystery that turns a small-town setting into psychedelic biological horror and sustained isolation. |
| Headphones-on immersion | The Tower — a contained, sound-led mystery built around Kiri's isolation, an abandoned tower, payphones, and buried secrets. |
| Late-night tension | Crooked River — a short historical crime narrative whose Depression-era river setting and steady investigation suit a focused late-night listen. |
| Start here | The Big Loop — self-contained strange stories offer a low-commitment way into the archive's more experimental anthology branch. |
| Worldbuilding deep dives | Twilight Histories — alternate histories and parallel worlds reward listeners who want to follow the speculative premise beyond a single episode. |
| Ensemble chaos with heart | The Dragoning — a satirical women-and-dragons audio drama combines ensemble energy with the warmer, character-led side of speculative fiction. |

Existing memberships were retained. Magnus Protocol, Shelterwood, and The Harrowing were not given additional collection placements because each already had a useful membership surface in the current graph. No rule-based or similarity collection source was manually changed, and every new curated edge has a collection-specific reason in its canonical source.

## 6. Before/after metrics

The baseline is the generated catalog immediately after Batch 18, reconstructed from the current source state by removing only the Batch 19 discovery/content fields and authored similarity links for the five full-packet records and the six Batch 19 curated memberships. Quality uses the existing 17-dimension discovery-quality score. Facet groups are tones, tags, best-for routes, and similar-show links. Profile keys are the four optional discovery-profile keys. Structured-content counts are object keys, not a claim that each key has equal weight. Collection counts include existing rule/similarity memberships so the table describes the actual public catalog surface.

| Show | Quality | Facet groups | Profile keys | Structured content | Content notes | Collections | Authored similar links |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| The Elmwood Strain | 11 → 16 | 1 → 4 | 0 → 4 | 0 → 4 keys | 0 → 0 | 2 → 3 | 0 → 2 |
| The Tower | 11 → 16 | 1 → 4 | 0 → 4 | 0 → 4 keys | 0 → 0 | 1 → 2 | 0 → 2 |
| The Magnus Protocol | 12 → 16 | 1 → 4 | 0 → 4 | 0 → 4 keys | 0 → 0 | 1 → 1 | 0 → 2 |
| Shelterwood | 13 → 16 | 2 → 4 | 0 → 4 | 4 → 4 keys | 0 → 0 | 4 → 4 | 0 → 2 |
| The Harrowing | 15 → 16 | 3 → 4 | 4 → 4 | 3 → 3 keys | 0 → 0 | 3 → 3 | 0 → 2 |
| The Big Loop | 15 → 15 | 4 → 4 | 4 → 4 | 4 → 4 keys | 0 → 0 | 1 → 2 | 2 → 2 |
| Twilight Histories | 15 → 15 | 4 → 4 | 4 → 4 | 4 → 4 keys | 0 → 0 | 1 → 2 | 2 → 2 |
| The Dragoning | 15 → 15 | 4 → 4 | 4 → 4 | 4 → 4 keys | 2 → 2 | 2 → 3 | 1 → 1 |
| Crooked River | 15 → 15 | 4 → 4 | 4 → 4 | 4 → 4 keys | 3 → 3 | 1 → 2 | 1 → 1 |
| **Batch mean / total** | **13.6 → 15.6** | **24 → 36 facet groups** | **20 → 36 keys** | **23 → 35 keys** | **5 → 5 notes** | **16 → 22 memberships** | **6 → 16** |

The catalog-wide deltas are:

| Measurement | Before | After | Change |
| --- | ---: | ---: | ---: |
| Published shows | 752 | 752 | unchanged |
| Enrichment-eligible / imported / editorial | 235 / 517 / 7 | 235 / 517 / 7 | unchanged |
| Shows with at least one collection | 371/752 | 371/752 | unchanged |
| Shows with at least two collections | 246/752 | 250/752 | +4 |
| Shows with at least one useful facet | 235/752 | 235/752 | unchanged |
| Shows with three or more useful facet groups | 231/752 | 235/752 | +4 |
| Curated discovery profiles | 190/752 | 194/752 | +4 |
| Tone coverage | 232/752 | 235/752 | +3 |
| Themes or content-note coverage | 233/752 | 235/752 | +2 |
| Best-for coverage | 231/752 | 235/752 | +4 |
| Similar-show source coverage | 230/752 | 235/752 | +5 |
| Authored similarity links / written reasons | 437/437 | 447/447 | +10 / +10 |
| Collection membership edges | 1109 | 1115 | +6 |
| Shows without collection membership | 381 | 381 | unchanged |
| Actionable eligible candidates | 111 | 106 | -5 |
| Strict computed source shows / edges | 147/249 | 149/254 | +2 / +5 |

The generated reports show 106 actionable eligible candidates after this batch. Imported records remain outside the editorial work queue.

## 7. Strict computed-similarity qualification

The public computed policy remains unchanged: score at least 20; pair, source, and target metadata coverage at least 0.65; at least three metadata dimensions; at least two anchor dimensions; at least two specific discovery dimensions; at least two explanation reasons; and a maximum of two public computed matches per source. Authored links and curated similarity evidence are excluded from this computation.

The bounded post-Batch 19 check showed these selected-source matches above the strict gate:

- The Elmwood Strain → The Love Talker (21.2) and The Wyrd Side (20.7).
- The Magnus Protocol → Ghost Wax (22.2) and Malevolent (21.8).
- Shelterwood → Crystal Blue (23.9) and SCP Archives (21.6).
- The Harrowing → Video Palace (23.9) and The Edge of Sleep (23.3).
- The Tower did not produce a selected strict match in this bounded check.

The strict snapshot moved from 147 source shows / 249 edges after Batch 18 to 149 / 254 after Batch 19. These remain computed archive matches, not authored editorial recommendations; none of them were written into `similarTo`.

## 8. Graph and collection health

The post-build collection-candidate report contains 1,115 materialized membership edges, 371 shows with membership, 381 without membership, and 8,050 candidate edges across 333 unique shows. It reports no richly connected uncollected records in the selected top band, zero invalid collection references, and no near-duplicate collection pair. The low-membership threshold remains seven; drama and serialized remain broad underrepresented catalog areas at 45.5% and 49.5% coverage respectively. Candidate edges remain a review signal; no automatic memberships were accepted.

The post-build similarity report contains 447 authored links with 447 written reasons. Signal coverage is entity 266, genre 752, format 749, tone 235, theme 235, tag 235, best-for 235, voice style 190, narrative focus 191, intensity 232, commitment 185, release profile 283, shared collection 235, episode length 748, catalog length 751, and rating profile 27 out of 752 published records. The diagnostic scorer returned 187,276 candidate results with a 7.5–67.2 score range, 10.49 average, and 9.9 median; 2 sparse, 516 medium, and 234 enriched records. These diagnostics use the existing policy and are distinct from the stricter 149-source / 254-edge public computed gate above.

The entity graph remains at 132 public entities, 318 relationship records, and 266 linked shows; 486 shows have no entity relationship. No invalid or unresolved entity links were introduced, and the existing 43 type/role divergence warnings remain. All 1,115 materialized collection memberships resolve to published shows, and all 46 non-empty collections retain complete reasons.

The catalog report remains at Gate B complete, zero blocking errors, six missing RSS fields, 25 documented research-gap records, zero actionable RSS gaps, zero editorial gaps, zero taxonomy errors, and clean generated-output drift. The weak-collection-coverage measure is 502; this is a broader quality diagnostic than the 381 shows with no collection membership used above.

This batch improves discovery routes for return-home biological horror, isolated-tower mystery, institutional archive horror, docu-horror, storm-bound island crime, strange-fiction anthologies, alternate histories, satirical speculative drama, and historical crime. The remaining queue still contains meaningful evidence-review work, including uncollected records and entity/source gaps; no stopping condition was reached.

## 9. Rejected or deferred decisions

- No new controlled tags were added; existing factual tags and bounded themes supplied the needed discovery signals.
- No entity links were added for the selected shows. Exact registry-match candidates remained zero, and deliberate entity research requires source review rather than automatic promotion.
- Existing rule-based and similarity-collection memberships were not manually edited.
- No release or completion state was inferred from current provider pages, episode counts, or feed activity. Existing lifecycle values were retained.
- No ratings, reviews, community scores, creator-verification states, or content-warning notes were changed.
- The Magnus Protocol, Shelterwood, and The Harrowing did not receive extra curated collection placements because their existing memberships already provide useful route coverage.
- Route-only records received no show-source packet or speculative metadata beyond the single collection-specific placement described above.
- The remaining lower-evidence and imported records were deferred rather than padded with generic facets, and no similarity thresholds, weights, or public explanation policies were changed.

## 10. Validation and worktree boundary

Commands run after the canonical source edits and final profile correction:

- `npm run build:catalog` — passed; built artifacts for 752 shows, 46 collections, and 7 review companions.
- `npm run validate:data` — passed with 0 integrity errors across 752 shows, 46 collections, 132 entities, and 7 review companions. The existing 43 entity type/role divergence warnings remain; no invalid or unresolved entity links were introduced.
- `npm run report:discovery-quality` — passed; 371 shows with collections, 250 with at least two collections, 235 with three or more useful facet groups, 194 curated profiles, and 106 actionable candidates.
- `npm run report:similarity` — passed; 447 authored links with 447 written reasons and the unchanged similarity policy.
- `npm run report:collection-candidates` — passed; 1,115 membership edges, 381 shows without membership, 8,050 candidate edges across 333 shows, and 0 invalid references.
- `npm run report:entity-graph` — passed; 132 public entities, 318 relationship records, 266 linked shows, and 486 zero-relationship shows. No entity links were added.
- `npm run report:catalog` — passed; Gate B complete, 0 blocking errors, 0 actionable RSS gaps, 25 documented research-gap records, 0 editorial gaps, 0 taxonomy errors, and generated-output drift clean.
- `git diff --check` — passed after the final generated outputs.
- Focused catalog/discovery/similarity/candidate tests — passed: 43/43.
- Read-only graph comparisons confirmed the per-record and catalog-wide deltas above without changing scorer or policy files.

The worktree retains prior Phase 3 changes plus five Batch 19 show-source updates, six curated collection-source updates, expected rebuilt catalog/search/status artifacts, and this QA report. No commit, push, deployment, or publication was performed. The queue still contains meaningful evidence-review work, so no stopping condition was reached.
