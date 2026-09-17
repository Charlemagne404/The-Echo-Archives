# Phase 3 Batch 9 — Discovery Enrichment QA

Date: 2026-09-17  
Scope: ten published, enrichment-eligible show records and ten curated collection sources  
Status: local source and generated-catalog validation only; not committed, deployed, or published

## 1. Scope and guardrails

Batch 9 continues the Phase 3 discovery-enrichment sequence after Batch 8. The selection came from the current discovery-quality, similarity, collection-candidate, and entity-graph snapshots. The queue remains top-heavy with sparse horror and science-fiction records, so this batch deliberately varies the listening routes and production forms through space adventure, documentary/docudrama mystery, period epistolary horror, cyberpunk procedural, small-town supernatural mystery, and compact political science fiction.

The existing source-of-truth rules were preserved:

- `catalog-src/shows/` and `catalog-src/collections/` remain authoritative; generated `data/` and `docs/generated/` files were rebuilt normally.
- Editorial discovery fields were added only where the record and an official, creator, publisher, or provider source supported a useful classification.
- Every new `similarTo` edge received an explicit directional reason. Reciprocal copying was not used as a substitute for editorial judgment.
- The similarity scorer, public computed-match gate, thresholds, weights, and explanation policy were not changed. Computed candidates were not promoted into authored relationships.
- No raw creator, network, or provider string was promoted to a typed entity relationship.
- No rating, review, community score, creator-verification claim, lifecycle correction, or new controlled tag was added.
- Rule-based collections were not edited manually. Existing rule memberships were materialized through the normal catalog build.

## 2. Selection analysis

The post-Batch 8 snapshot contained 752 published shows, 235 enrichment-eligible records, 341 shows with at least one collection, and 411 without collection membership. The strongest remaining opportunities were sparse, collection-light records with only factual genres, formats, and tags. The selected set combines those gaps with distinct route potential rather than treating every candidate as the same horror or science-fiction recommendation.

| Record | Discovery function | Why this batch included it |
| --- | --- | --- |
| [Parkdale Haunt](../../catalog-src/shows/parkdale-haunt.json) | Haunted-house friendship and cult mystery | Adds a long-form Toronto horror route where friendship, family, ghosts, and real-estate anxiety are all part of the premise. |
| [The Awkward Screw](../../catalog-src/shows/the-awkward-screw.json) | Multi-species space adventure | Adds a short-episode, crew-led vessel route with explicit headphone framing and a clear found-family spine. |
| [The Cellar Letters](../../catalog-src/shows/the-cellar-letters.json) | Found-footage house horror | Adds a high-volume recovered-evidence route built around a new house, a locked cellar, and ghostly letters. |
| [The Great Chameleon War](../../catalog-src/shows/the-great-chameleon-war.json) | New Weird wilderness expedition | Adds a compact mature route with transdimensional reptiles, expedition records, and a shifting dreamscape. |
| [Wormwood: A Serialized Mystery](../../catalog-src/shows/wormwood-a-serialized-mystery.json) | Finished full-cast occult mystery | Adds a defined long-form arc around a murder vision, a secretive small town, and arcane conspiracy. |
| [Badlands Cola](../../catalog-src/shows/badlands-cola.json) | Desert-town PI and radio mystery | Adds a cinematic investigation whose fossils, cult history, radio frame, and publisher warnings support several precise routes. |
| [Coexistence](../../catalog-src/shows/coexistence.json) | Political post-collapse science fiction | Adds a bounded full-cast route about resource exhaustion, propaganda, evacuation, and rebellion. |
| [From Within: A Tale of the Macabre](../../catalog-src/shows/from-within-a-tale-of-the-macabre.json) | Period epistolary horror | Adds a 1930s mountain-community route whose letters and journals make the records themselves part of the mystery. |
| [Edict Zero - FIS](../../catalog-src/shows/edict-zero-fis.json) | Cyberpunk investigative procedural | Adds a deep-dive, headphone-oriented route with a special investigative unit, layered mysteries, and institutional power. |
| [Rabbits](../../catalog-src/shows/rabbits.json) | Documentary/docudrama game mystery | Adds a documentary-format investigation in which a missing friend and an ancient game blur fact, fiction, and survival stakes. |

## 3. Evidence anchors checked

These sources supported premise, setting, form, production framing, route length, or content-note decisions. They were not used to fabricate ratings, verification, or lifecycle state.

| Record | Source anchor and supported signal |
| --- | --- |
| Parkdale Haunt | [Official show page](https://parkdalehaunt.com/) — award-winning horror fiction, friendship, ghosts, cults, family, a Toronto house, and the missing-friend investigation. |
| The Awkward Screw | [Official site](https://www.theawkwardscrew.com/) — Heavy-Repair vessel, four-person multi-species crew, Bell-Wave Galaxy, quest to save the universe, cast, and production credits. |
| The Cellar Letters | [Rusty Quill show page](https://rustyquill.com/show/the-cellar-letters/) — found-footage horror, Nate and Bella, a new East Coast house, nighttime knocking, locked cellar, and strange letters. |
| The Great Chameleon War | [Official show page](https://www.thegreatchameleonwar.com/) — surreal audio drama, transdimensional reptiles, Nesting Zone, Amanuensis expedition records, evolving dreamscape, and mature rating. |
| Wormwood: A Serialized Mystery | [Official about page](https://wormwoodshow.com/about-the-show/) — murder vision, hidden-town mystery, full-cast serialized form, supernatural horror, and third/final season. |
| Badlands Cola | [Official show page](https://www.badlandscola.com/) and [content warnings](https://www.badlandscola.com/content-warnings) — cinematic mystery/horror, eldritch fossils, PI and radio DJ, cult investigation, mature audience, violence, gore, abuse, and related warnings. |
| Coexistence | [Coex Studios page](https://coexstudios.carrd.co/) and [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/coexistence/id1484458838) — full-cast production, shattered Earth, environmental degradation, technological determinism, Tier City, evacuation, and rebellion. |
| From Within: A Tale of the Macabre | [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/from-within-a-tale-of-the-macabre/id1843424629) — 1930s setting, epistolary letters and journals, Blightwood, Sheriff Flynn, Dr. Cooper, Hattie Ogle, and a violent uncanny threat. |
| Edict Zero - FIS | [Series page](https://edictzero.com/edict-zero-fis-series/) and [official about page](https://edictzero.com/edict-zero-fis-series/about/) — cyberpunk science fiction, FIS investigations, New Earth, mystery-within-mysteries, full cast, cinematic soundscape, and headphone recommendation. |
| Rabbits | [Official about page](https://www.rabbitspodcast.com/about-1) — documentary/docudrama format, Carly Parker, missing friend Yumiko, ancient game, season structure, and survival-of-the-universe premise. |

## 4. Enrichment decisions

Each selected record received a coherent packet rather than isolated labels. `content` records setting, point of view, source material, and framing; the discovery profile records voice, narrative focus, intensity, and commitment. Badlands Cola is the only record receiving new content notes in this batch, and those notes are condensed from its publisher-provided warnings.

| Record | Tones / themes | Best-for routes | Profile | Curated routes | Authored similarity |
| --- | --- | --- | --- | --- | --- |
| Parkdale Haunt | `dark`, `tense`, `weird`; friendship under haunting, family and inherited secrets, home and real-estate anxiety | headphones on, late night, binge listening | primarily acted; plot-driven; high; long | Late-night tension; Headphones-on immersion | The Secret of St Kilda |
| The Awkward Screw | `warm`, `cinematic`, `hopeful`; multi-species found family, repair work and responsibility, spacefaring quest | headphones on, easy entry, worldbuilding | primarily acted; character-driven; medium; medium | Headphones-on immersion; Worldbuilding deep dives; Easy first steps | The Invenios Expeditions |
| The Cellar Letters | `dark`, `tense`, `weird`; new-house isolation, found letters and ghostly figures, domestic life gone wrong | headphones on, late night, binge listening | primarily narrated; plot-driven; high; long | Headphones-on immersion; Late-night tension; Found recordings and buried evidence | The Storage Papers |
| The Great Chameleon War | `weird`, `cinematic`, `dark`; transdimensional reptiles and portal worlds, surreal wilderness expedition, dreamscape and sanity | short under five hours, headphones on, worldbuilding | mixed; plot-driven; high; short | Headphones-on immersion; Late-night tension; Worldbuilding deep dives; Quick first listens | The Wyrd Side |
| Wormwood: A Serialized Mystery | `dark`, `tense`, `weird`; occult investigation, small-town secrets, tragic visions and dark conspiracy | headphones on, late night, binge listening | primarily acted; plot-driven; high; long | Headphones-on immersion; Late-night tension; Worldbuilding deep dives; Small-town strange signals; Finished arcs | The Lovecraft Investigations |
| Badlands Cola | `dark`, `tense`, `weird`; eldritch fossils and cults, private-investigator and radio-DJ partnership, desert-town nightmares | headphones on, late night, binge listening | primarily acted; plot-driven; high; medium | Headphones-on immersion; Late-night tension; Small-town strange signals | The Angel of Vine |
| Coexistence | `bleak`, `tense`, `cinematic`; resource exhaustion and environmental degradation, technological determinism, propaganda and rebellion | serious sci-fi, short under five hours, headphones on | primarily acted; plot-driven; high; short | Headphones-on immersion; Late-night tension; Worldbuilding deep dives; Quick first listens; Serious sci-fi; Survival pressure | The Next 5 Minutes |
| From Within: A Tale of the Macabre | `dark`, `tense`, `cinematic`; 1930s mountain community, letters and journals as evidence, violent uncanny threat | headphones on, late night, binge listening | mixed; plot-driven; high; medium | Headphones-on immersion; Late-night tension; Found recordings and buried evidence; Small-town strange signals | The Love Talker |
| Edict Zero - FIS | `tense`, `cinematic`, `weird`; law-enforcement investigation, mystery within mysteries, cyberpunk power and authority | serious sci-fi, headphones on, worldbuilding | primarily acted; plot-driven; high; deep dive | Headphones-on immersion; Late-night tension; Worldbuilding deep dives; Serious sci-fi; existing ongoing-sci-fi rule route retained | The Cipher |
| Rabbits | `tense`, `weird`, `cinematic`; a missing friend and an ancient game, conspiracy and reality, survival of humanity and the universe | headphones on, late night, binge listening | mixed; plot-driven; high; long | Headphones-on immersion; Late-night tension | The Polybius Conspiracy |

The added Badlands Cola content notes are: `explicit language`, `physical violence`, `blood/gore/injuries`, `emotional abuse`, `cults`, `death/dying`, and `consensual sex/sexual themes`. No entity links were added. Existing typed relationships were preserved, and raw creator/provider evidence remains outside the editorial enrichment scope.

## 5. Before/after metrics

The baseline is the catalog immediately after Batch 8, reconstructed from the current source state by removing only Batch 9 discovery/content fields and curated memberships. Quality uses the existing 17-dimension discovery-quality score. Facet groups are tones, tags, best-for routes, and similar-show links. Profile keys are the four optional discovery-profile keys. Authored counts are directional `outgoing / incoming` counts.

| Show | Quality | Facet groups | Profile keys | Structured content | Collections | Authored out / in |
| --- | ---: | ---: | ---: | --- | ---: | --- |
| Parkdale Haunt | 9 → 15 | 1 → 4 | 0 → 4 | absent → present | 0 → 2 | 0/0 → 1/0 |
| The Awkward Screw | 9 → 15 | 1 → 4 | 0 → 4 | absent → present | 0 → 3 | 0/0 → 1/0 |
| The Cellar Letters | 9 → 15 | 1 → 4 | 0 → 4 | absent → present | 0 → 3 | 0/0 → 1/0 |
| The Great Chameleon War | 9 → 15 | 1 → 4 | 0 → 4 | absent → present | 0 → 4 | 0/0 → 1/0 |
| Wormwood: A Serialized Mystery | 9 → 15 | 1 → 4 | 0 → 4 | absent → present | 0 → 5 | 0/0 → 1/0 |
| Badlands Cola | 10 → 15 | 1 → 4 | 2 → 4 | absent → present | 0 → 3 | 0/0 → 1/0 |
| Coexistence | 10 → 15 | 1 → 4 | 3 → 4 | absent → present | 0 → 6 | 0/0 → 1/0 |
| From Within: A Tale of the Macabre | 10 → 15 | 1 → 4 | 2 → 4 | absent → present | 0 → 4 | 0/0 → 1/0 |
| Edict Zero - FIS | 9 → 14 | 1 → 4 | 0 → 4 | absent → present | 1 → 5 | 0/0 → 1/0 |
| Rabbits | 10 → 16 | 1 → 4 | 0 → 4 | absent → present | 0 → 2 | 0/0 → 1/0 |
| **Batch mean / total** | **9.4 → 15.0** | **10 → 40 facet groups** | **7 → 40 keys** | **0 → 10** | **1 → 37 memberships** | **0/0 → 10/0** |

The catalog-wide deltas are:

| Measurement | Before | After | Change |
| --- | ---: | ---: | ---: |
| Shows with three or more useful facet groups | 151/752 | 161/752 | +10 |
| Curated discovery profiles | 118/752 | 125/752 | +7 |
| Tone coverage | 152/752 | 162/752 | +10 |
| Theme coverage | 154/752 | 164/752 | +10 |
| Best-for coverage | 151/752 | 161/752 | +10 |
| Similar-show coverage | 149/752 | 159/752 | +10 |
| Authored similarity links / written reasons | 350/350 | 360/360 | +10 / +10 |
| Shows with authored outgoing routes | 149 | 159 | +10 |
| Collection membership edges | 848 | 884 | +36 |
| Shows with at least one collection | 341/752 | 350/752 | +9 |
| Shows with at least two collections | 182/752 | 192/752 | +10 |
| Strict computed source shows / edges | 81/133 | 83/138 | +2 / +5 |
| Shows with an authored outgoing or strict computed route | 153 | 163 | +10 |

The current generated quality report also reports 74 enrichment-eligible shows missing at least one of tones, best-for routes, or similar-show links, down from 84 before the batch. Imported/factual-only records remain outside the editorial queue.

## 6. Strict computed-similarity qualification

The public policy remains unchanged: score at least 20; pair, source, and target metadata coverage at least 0.65; at least three metadata dimensions; at least two anchor dimensions; at least two specific discovery dimensions; and at least two explanation reasons. Authored links and curated similarity evidence are excluded from this computation.

After Batch 9, selected records contribute strict computed matches including Parkdale Haunt → Ghost Wax; Wormwood → Ghost Wax and Video Palace; Badlands Cola → From Within and Dark Woods; and From Within → Badlands Cola and Dark Woods. The other six selected records did not clear the strict public computed gate in the current snapshot. These are computed archive matches, not authored editorial recommendations; they do not alter `similarTo` or the public policy.

Across the catalog, strict computed sources increased from 81 to 83 and edges from 133 to 138. The union of shows with an authored outgoing route or a strict computed route increased from 153 to 163. No thresholds, weights, or policy adapters changed.

## 7. Graph and collection health

The post-build collection-candidate report contains 884 membership edges, 350 shows with membership, 402 without membership, and 6,790 candidate edges across 321 shows. It still identifies weakly populated routes and rich-but-uncollected records as review signals rather than automatic assignments. The entity graph remains at 132 public entities, 318 relationship records, and 266 linked shows; 486 shows have no entity relationship. No invalid or unresolved entity links were introduced, and the existing 43 type/role divergence warnings remain.

The selection improves route coverage through vessel-based space adventure, found-footage horror, New Weird expedition fiction, finished occult mystery, radio-framed desert investigation, political science fiction, period epistolary horror, cyberpunk procedural, and documentary/docudrama mystery. It does not force richer uncollected records such as The Invenios Expeditions, Mayfair Watchers Society, The McIlwraith Statements, or The Dragoning into a collection without a more specific evidence-backed intent.

The catalog report still identifies 560 shows with weak collection coverage. Drama, serialized, and episodic coverage remain the main broad signals for later review; they are not reasons to assign generic memberships without evidence.

## 8. Rejected or deferred decisions

- No new controlled tags were added; existing tags and free-text themes supplied the needed discovery signals.
- No entity links were added, including for records with identifiable production companies; a public entity relationship still requires a deliberate source-backed registry decision.
- Existing rule-based collection memberships were left to the build system; only curated collection sources were edited.
- Edict Zero - FIS received `deep-dive` and serious-science-fiction routes from its official episode and series framing, but its current source lifecycle fields were left unchanged despite differing historical/current source language.
- The Awkward Screw received easy-entry and worldbuilding routes, but not a comedy collection because the current authoritative record identifies drama and science fiction without an explicit comedy category.
- The Great Chameleon War received Quick first listens because its observed run is about 4.2 hours. Longer or runtime-uncertain records were not given the same shortcut.
- Rabbits was framed as documentary/docudrama rather than being relabeled as original fiction; no factual source-material claim was added beyond the official wording.
- Badlands Cola received condensed publisher-backed content notes, while no unsupported warning categories were added to the other nine records.
- No ratings, reviews, verification states, lifecycle fields, similarity thresholds, collection rules, or public explanation policies were changed.

## 9. Validation and worktree boundary

Commands run after the source edits:

- `npm run build:catalog` — passed; built artifacts for 752 shows, 46 collections, and 7 review companions.
- `npm run validate:data` — passed with 0 integrity errors across 752 shows, 46 collections, 132 entities, and 7 review companions. The existing entity type/role divergence warnings remain; no invalid or unresolved entity links were introduced.
- `npm run report:discovery-quality` — passed; 350 shows with collections, 161 with three or more useful facet groups, 125 curated profiles, and 74 eligible records missing at least one of tones, best-for, or similar-show routes.
- `npm run report:similarity -- --limit 12` — passed; 360 authored links with 360 written reasons and the unchanged similarity policy.
- `npm run report:collection-candidates` — passed; 884 membership edges, 402 shows without membership, and 6,790 candidate edges across 321 shows.
- `npm run report:entity-graph` — passed; 132 public entities, 318 known relationship records, 266 linked shows, and 486 zero-relationship shows. No entity links were added.
- `npm run report:catalog` — passed; Gate B complete, 0 blocking errors, 0 actionable RSS gaps, 25 documented research-gap records, and generated-output drift clean.
- `git diff --check` — passed.
- Focused catalog/discovery/similarity/candidate tests — passed: 40/40.

The worktree retains the prior Phase 3 changes plus the ten Batch 9 show sources, ten Batch 9 curated collection-source changes, expected rebuilt catalog/search/status artifacts, and this QA report. No commit, push, deployment, or publication was performed.
