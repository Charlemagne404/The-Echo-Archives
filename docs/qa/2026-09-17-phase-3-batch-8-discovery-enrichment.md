# Phase 3 Batch 8 — Discovery Enrichment QA

Date: 2026-09-17  
Scope: ten published, enrichment-eligible show records and eleven curated collection sources  
Status: local source and generated-catalog validation only; not committed, deployed, or published

## 1. Scope and guardrails

Batch 8 continues the Phase 3 discovery-enrichment sequence after Batch 7. The selection came from the current discovery-quality, similarity, collection-candidate, and entity-graph snapshots. It prioritizes remaining high-opportunity sparse records while widening the route mix through workplace and space comedy, intimate speculative fantasy, cybersecurity adventure, wilderness crime, archival mystery, supernatural investigation, political science fiction, and post-apocalyptic comedy.

The existing source-of-truth rules were preserved:

- `catalog-src/shows/` and `catalog-src/collections/` remain authoritative; generated `data/` and `docs/generated/` files were rebuilt normally.
- Editorial discovery fields were added only where the record and an official, creator, publisher, or provider source supported a useful classification.
- Every new `similarTo` edge received an explicit directional reason. Reciprocal copying was not used as a substitute for editorial judgment.
- The similarity scorer, public computed-match gate, thresholds, weights, and explanation policy were not changed. Computed candidates were not promoted into authored relationships.
- No raw creator, network, or provider string was promoted to a typed entity relationship.
- No rating, review, community score, creator-verification claim, lifecycle correction, or new controlled tag was added.
- Rule-based collections were not edited manually. Existing rule memberships were materialized through the normal catalog build.

## 2. Selection analysis

The post-Batch 7 snapshot contained 752 published shows, 235 enrichment-eligible records, 334 shows with at least one collection, and 418 without collection membership. The quality and candidate reports continued to show weak coverage in drama, serialized, and episodic routes. The selected records combine the strongest remaining opportunity gaps with distinct production forms and listening routes rather than adding another undifferentiated horror or science-fiction group.

| Record | Discovery function | Why this batch included it |
| --- | --- | --- |
| [Stellar Firma](../../catalog-src/shows/stellar-firma.json) | Semi-improvised workplace space comedy | Adds a high-volume, listener-shaped comedy route where corporate absurdity and planet design are the premise. |
| [The Far Meridian](../../catalog-src/shows/the-far-meridian.json) | Intimate moving-home speculative drama | Adds a quieter character-led route about agoraphobia, memory, and searching for a missing brother. |
| [The Rapscallion Agency](../../catalog-src/shows/the-rapscallion-agency.json) | Cybersecurity adventure spinoff | Adds a compact bridge from the Leviathan universe to Parisian tech adventure, young love, and found family. |
| [Dark Woods](../../catalog-src/shows/dark-woods.json) | Short wilderness crime thriller | Adds a grounded investigation with environmental consequence and a clear four-hour commitment route. |
| [Attention HellMart Shoppers!](../../catalog-src/shows/attention-hellmart-shoppers.json) | Workplace horror comedy | Adds a contained retail-comedy branch in which minimum-wage work collides with supernatural chaos. |
| [Blackwood](../../catalog-src/shows/blackwood.json) | Found-recording cryptid mystery | Adds a very compact recovered-investigation route built around a local legend, disappearances, and secrecy. |
| [Ghost Wax](../../catalog-src/shows/ghost-wax.json) | Full-cast necromantic investigation | Adds a deep supernatural mythology whose wax-cylinder testimony makes the archive frame literal. |
| [The Pasithea Powder](../../catalog-src/shows/the-pasithea-powder.json) | Political memory science fiction | Adds a long-form consequence route about war, memory alteration, and political prisoners. |
| [Hannahpocalypse](../../catalog-src/shows/hannahpocalypse.json) | Post-apocalyptic comedy horror | Adds a character-led rebuilding route where a last zombie, humans, and robots make survival personal. |
| [Modes of Thought in Anterran Literature](../../catalog-src/shows/modes-of-thought-in-anterran-literature.json) | Lecture-recording archaeological mystery | Adds an academic, institutional frame for ancient-civilization worldbuilding and hidden knowledge. |

## 3. Evidence anchors checked

These sources supported premise, setting, form, production framing, route length, or content-note decisions. They were not used to fabricate ratings, verification, or lifecycle state.

| Record | Source anchor and supported signal |
| --- | --- |
| Stellar Firma | [Rusty Quill show page](https://rustyquill.com/show/stellar-firma/) — semi-improvised science-fiction comedy, Trexel and David 7, bespoke planet design, corporate station pressure, and cast/production framing. |
| The Far Meridian | [Whisperforge official page](https://www.whisperforge.org/thefarmeridian) — Peri's moving lighthouse, missing-brother search, mysterious places, and short-form full-cast production. |
| The Rapscallion Agency | [Official site](https://rapscallionagency.com/) and [episode archive](https://rapscallionagency.com/podcast/) — Lisette and Cluracan, cybersecurity work in Paris, cybernetic rat, corporate pursuit, and the Leviathan spinoff relationship. |
| Dark Woods | [Wolf Entertainment official page](https://wolfentertainment.com/podcast/darkwoods/) and [announcement](https://wolfentertainment.com/news/wolf-entertainment-announces-second-scripted-podcast-dark-woods/) — California redwoods, suspicious death, estranged investigators, scripted audio, and environmental/crime framing. |
| Attention HellMart Shoppers! | [Apple Podcasts listing](https://podcasts.apple.com/ca/podcast/attention-hellmart-shoppers/id1231095568) — HelloMart staff, store over the gates of hell, horror/comedy form, full cast, and observed episode count. |
| Blackwood | [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/blackwood/id1438804143) — Molly, Bryan, and Nathan's Bugman investigation, released recordings, disappearances, and production credits. |
| Ghost Wax | [Far and Tall Tales show page](https://farandtalltales.squarespace.com/ghost-wax) and [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/ghost-wax/id1649696002) — Owen Voncid as the last Reclaimer, supernatural testimony, wax cylinders, and fantasy-horror framing. |
| The Pasithea Powder | [Official site](https://www.pasitheapowder.com/) — Sophie Green, a war-damaged world, memory-altering powder, political prisoners, and serialized audio-drama framing. |
| Hannahpocalypse | [Red Fathom official page](https://redfathom.com/hannahpocalypse) and [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/hannahpocalypse/id1536198867) — last-zombie premise, post-apocalyptic setting, comedy/horror tone, friendship, robots, and mature-content warnings. |
| Modes of Thought in Anterran Literature | [Official site](https://www.modesofthoughtpodcast.com/) and [episode transcript](https://www.modesofthoughtpodcast.com/transcripts/episode01overview) — Harbridge University course frame, Anterran ruins beneath the Pacific, ancient writing, and recorded lectures. |

## 4. Enrichment decisions

Each selected record received a coherent packet rather than isolated labels. `content` records setting, point of view, source material, and framing; the discovery profile records voice, narrative focus, intensity, and commitment only where the listening shape was clear.

| Record | Tones / themes | Best-for routes | Profile | Curated routes | Authored similarity |
| --- | --- | --- | --- | --- | --- |
| Stellar Firma | `funny`, `chaotic`, `weird`; corporate absurdity, improvised worldbuilding, clones and identity | funny space, warm weird, worldbuilding | primarily acted; character-driven; medium; long | Funny space disasters; Warm weird comfort; Worldbuilding deep dives | MarsCorp |
| The Far Meridian | `melancholic`, `hopeful`, `weird`; agoraphobia and leaving home, missing brother, changing places and resurfaced memories | headphones on, late night, worldbuilding | primarily acted; character-driven; medium; medium | Fantasy detours and hidden worlds; Headphones-on immersion; Late-night tension | The Bright Sessions |
| The Rapscallion Agency | `tense`, `cinematic`, `warm`; refined cybersecurity/conspiracy themes into found family and young love, cybersecurity and hacking, freedom from powerful institutions | headphones on, binge listening, worldbuilding | primarily acted; plot-driven; high; short | Serious sci-fi; Headphones-on immersion; Worldbuilding deep dives | The Leviathan Chronicles |
| Dark Woods | `dark`, `tense`, `cinematic`; suspicious death in protected wilderness, estranged partnership, crime and environmental consequence | short under five hours, late night, headphones on | primarily acted; plot-driven; high; short | Late-night tension; Headphones-on immersion; Quick first listens | The Angel of Vine |
| Attention HellMart Shoppers! | `funny`, `chaotic`, `dark`; workplace exploitation, retail survival, bureaucracy versus supernatural chaos | easy entry, warm weird, binge listening | primarily acted; character-driven; variable; medium | Ensemble chaos with heart; existing rule-based episodic comedy and horror routes retained | Super Suits |
| Blackwood | `dark`, `tense`, `cinematic`; local legend and cryptids, amateur investigation, disappearances and secrecy | short under five hours, late night, headphones on | primarily acted; plot-driven; high; short | Found recordings and buried evidence; Late-night tension; Quick first listens | Limetown |
| Ghost Wax | `dark`, `tense`, `weird`; death testimony and memory, necromancy as investigation, order versus otherworldly threats | headphones on, late night, binge listening | primarily acted; plot-driven; high; long | Late-night tension; Headphones-on immersion; Worldbuilding deep dives; existing rule-based ongoing-horror route retained | The Magnus Archives |
| The Pasithea Powder | `tense`, `cinematic`, `dark`; war aftermath and memory, political prisoners and power, estranged relationships | serious sci-fi, worldbuilding, binge listening | primarily acted; plot-driven; high; long | Serious sci-fi; Headphones-on immersion; Worldbuilding deep dives | Ars Paradoxica |
| Hannahpocalypse | `funny`, `dark`, `hopeful`; life after the apocalypse, unlikely friendship, robots and rebuilding | warm weird, binge listening, long walks | primarily acted; character-driven; variable; medium | Ensemble chaos with heart; Survival pressure | World Gone Wrong |
| Modes of Thought in Anterran Literature | `weird`, `tense`, `cinematic`; ancient civilization and archaeology, knowledge and institutional secrecy, language and interpretation | worldbuilding, headphones on, binge listening | primarily acted; balanced; medium; medium | Found recordings and buried evidence; Fantasy detours and hidden worlds; Headphones-on immersion; Worldbuilding deep dives; existing rule-based ongoing-horror route retained | The Deca Tapes |

The content-note addition is limited to source-backed material: Hannahpocalypse records mature language, violence, and horror elements from the publisher/provider description. No entity links were added. Existing typed relationships were preserved, and raw creator/provider evidence remains outside the editorial enrichment scope.

## 5. Before/after metrics

The baseline is the catalog immediately before Batch 8, reconstructed from the post-Batch 7 generated artifacts. Quality uses the existing 17-dimension discovery-quality score. Facet groups are tones, tags, best-for routes, and similar-show links. Profile keys are the four optional discovery-profile keys. Authored counts are directional `outgoing / incoming` counts.

| Show | Quality | Facet groups | Profile keys | Structured content | Collections | Authored out / in |
| --- | ---: | ---: | ---: | --- | ---: | ---: |
| Stellar Firma | 10 → 16 | 1 → 4 | 0 → 4 | absent → present | 0 → 3 | 0/0 → 1/0 |
| The Far Meridian | 10 → 16 | 1 → 4 | 0 → 4 | absent → present | 0 → 3 | 0/0 → 1/0 |
| The Rapscallion Agency | 11 → 16 | 1 → 4 | 0 → 4 | absent → present | 0 → 3 | 0/0 → 1/0 |
| Dark Woods | 10 → 15 | 1 → 4 | 3 → 4 | absent → present | 0 → 3 | 0/0 → 1/0 |
| Attention HellMart Shoppers! | 9 → 14 | 1 → 4 | 0 → 4 | absent → present | 2 → 3 | 0/0 → 1/0 |
| Blackwood | 10 → 15 | 1 → 4 | 2 → 4 | absent → present | 0 → 3 | 0/0 → 1/0 |
| Ghost Wax | 10 → 15 | 1 → 4 | 0 → 4 | absent → present | 1 → 4 | 0/0 → 1/0 |
| The Pasithea Powder | 9 → 15 | 1 → 4 | 0 → 4 | absent → present | 0 → 3 | 0/0 → 1/0 |
| Hannahpocalypse | 10 → 16 | 1 → 4 | 0 → 4 | absent → present | 0 → 2 | 0/0 → 1/0 |
| Modes of Thought in Anterran Literature | 11 → 16 | 1 → 4 | 0 → 4 | absent → present | 1 → 5 | 0/0 → 1/0 |
| **Batch mean / total** | **10.0 → 15.5** | **10 → 40 facet groups** | **5 → 40 keys** | **0 → 10** | **4 → 32 memberships** | **0/0 → 10/0** |

The catalog-wide deltas are:

| Measurement | Before | After | Change |
| --- | ---: | ---: | ---: |
| Shows with three or more useful facet groups | 141/752 | 151/752 | +10 |
| Curated discovery profiles | 110/752 | 118/752 | +8 |
| Tone coverage | 142/752 | 152/752 | +10 |
| Theme coverage | 145/752 | 154/752 | +9 |
| Best-for coverage | 141/752 | 151/752 | +10 |
| Similar-show coverage | 139/752 | 149/752 | +10 |
| Authored similarity links / written reasons | 340/340 | 350/350 | +10 / +10 |
| Shows with authored outgoing routes | 139 | 149 | +10 |
| Collection membership edges | 820 | 848 | +28 |
| Shows with at least one collection | 334/752 | 341/752 | +7 |
| Shows with at least two collections | 173/752 | 182/752 | +9 |
| Strict computed source shows / edges | 74/118 | 81/133 | +7 / +15 |
| Public recommendation surface shows | 143/752 | 153/752 | +10 |

The current generated quality report also reports 84 enrichment-eligible shows missing at least one of tones, best-for routes, or similar-show links, down from 94 before the batch. Imported/factual-only records remain outside the editorial queue.

## 6. Strict computed-similarity qualification

The public policy remains unchanged: score at least 20; pair, source, and target metadata coverage at least 0.65; at least three metadata dimensions; at least two anchor dimensions; at least two specific discovery dimensions; and at least two explanation reasons. Authored links and curated similarity evidence are excluded from this computation.

After Batch 8, selected records contribute strict computed matches including The Far Meridian → Caravan and Ars Paradoxica; The Rapscallion Agency → The Invenios Expeditions; Dark Woods → Wake up, New Vilirth! and Blackwood; Blackwood → Crooked River and The Angel of Vine; Ghost Wax → The Night Post and Impact Winter; and Modes of Thought in Anterran Literature → The Night Post and Ghost Wax. Stellar Firma, Attention HellMart Shoppers!, The Pasithea Powder, and Hannahpocalypse did not clear the strict public computed gate in the current snapshot. These are computed archive matches, not authored editorial recommendations; they do not alter `similarTo` or the public policy.

Across the catalog, strict computed sources increased from 74 to 81 and edges from 118 to 133. The union of shows with an authored outgoing route or a strict computed route increased from 143 to 153. No thresholds, weights, or policy adapters changed.

## 7. Graph and collection health

The post-build collection-candidate report contains 848 membership edges, 341 shows with membership, 411 without membership, and 6,563 candidate edges across 320 shows. It still identifies weakly populated routes and rich-but-uncollected records as review signals rather than automatic assignments. The entity graph remains at 132 public entities, 318 relationship records, and 266 linked shows; 486 shows have no entity relationship. No invalid or unresolved entity links were introduced, and the existing 43 type/role divergence warnings remain.

The selection improves route coverage through workplace comedy, intimate speculative drama, cybersecurity adventure, wilderness crime, recovered recordings, necromantic investigation, political science fiction, and post-apocalyptic rebuilding. It does not force The Invenios Expeditions, Mayfair Watchers Society, The McIlwraith Statements, or The Dragoning into a collection without a more specific evidence-backed intent.

Post-Batch 8 weak coverage remains concentrated in drama at 42.1%, serialized at 45.0%, and episodic at 48.1%. These are queue signals for later review, not reasons to assign generic memberships without evidence.

## 8. Rejected or deferred decisions

- No new controlled tags were added; existing tags and free-text themes supplied the needed discovery signals.
- No entity links were added, including for selected records with recognizable publisher or provider names; a public entity relationship still requires a deliberate source-backed registry decision.
- Existing rule-based collection memberships were left to the build system; only curated collection sources were edited.
- The Rapscallion Agency received a short commitment profile because its observed run is bounded, but it was not placed in Quick first listens because the source does not provide a verified total runtime.
- Dark Woods and Blackwood received Quick first listens only because their observed runtimes are about 4.1 and 2.6 hours respectively. No similar shortcut was applied to longer or runtime-uncertain records.
- Hannahpocalypse received Ensemble chaos with heart and Survival pressure, but not an additional warm-comfort collection membership; its comedy/horror balance is already represented by the structured best-for route without broadening curated placement.
- No lifecycle correction was made for records whose current release or completion state remains unclear, including Blackwood, Attention HellMart Shoppers!, The Far Meridian, and The Pasithea Powder.
- No ratings, reviews, verification states, entity claims, similarity thresholds, collection rules, or public explanation policies were changed.

## 9. Validation and worktree boundary

Commands run after the source edits:

- `npm run build:catalog` — passed; built artifacts for 752 shows, 46 collections, and 7 review companions.
- `npm run validate:data` — passed with 0 integrity errors across 752 shows, 46 collections, 132 entities, and 7 review companions. The existing entity type/role divergence warnings remain; no invalid or unresolved entity links were introduced.
- `npm run report:discovery-quality -- --limit 12` — passed; 341 shows with collections, 151 with three or more useful facet groups, and 118 curated profiles.
- `npm run report:similarity -- --limit 12` — passed; 350 authored links with 350 written reasons and the unchanged similarity policy.
- `npm run report:collection-candidates -- --limit 12` — passed; 848 membership edges and 411 shows without membership.
- `npm run report:entity-graph -- --limit 12` — passed; 132 public entities, 318 known relationship records, 266 linked shows, and 486 zero-relationship shows. No entity links were added.
- `npm run report:catalog` — passed; Gate B complete, 0 blocking errors, 0 actionable RSS gaps, 25 documented research-gap records, and generated-output drift clean.
- `git diff --check` — passed.
- Focused catalog/discovery/similarity/candidate tests — passed: 40/40.

The worktree retains the prior Phase 3 changes plus the ten Batch 8 show sources, eleven Batch 8 collection-source changes, expected rebuilt catalog/search/status artifacts, and this QA report. No commit, push, deployment, or publication was performed.
