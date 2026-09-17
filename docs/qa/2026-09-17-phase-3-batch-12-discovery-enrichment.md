# Phase 3 Batch 12 — Discovery Enrichment QA

Date: 2026-09-17  
Scope: ten published, enrichment-eligible show records and seven curated collection sources  
Status: local source and generated-catalog validation only; not committed, deployed, or published

## 1. Scope and guardrails

Batch 12 continues the Phase 3 discovery-enrichment sequence after Batch 11. The post-Batch 11 queue still contained 145 actionable eligible records, with the leading opportunities concentrated in sparse horror, folk-horror, mystery, and speculative-fiction records. This batch deliberately mixes classic radio anthology, queer end-of-world narration, Appalachian eldritch mythology, gothic seasonal anthology, conspiracy docudrama, family curse thriller, sleep-apocalypse survival, Kafkaesque island horror, queer multi-series genre fiction, and river-faith folk horror.

The existing source-of-truth rules were preserved:

- `catalog-src/shows/` and `catalog-src/collections/` remain authoritative; generated `data/` and `docs/generated/` files were rebuilt normally.
- Discovery values were added only where the record, existing objective source metadata, and an official, creator, publisher, or provider source supported a useful classification.
- Every new `similarTo` edge received an explicit directional reason. Reciprocal copying was not used as a substitute for editorial judgment.
- The similarity scorer, public computed-match gate, thresholds, weights, and explanation policy were not changed. Computed candidates were not promoted into authored relationships.
- No raw creator, network, or provider string was promoted to a new typed entity relationship.
- No rating, review, community score, creator-verification claim, factual tag, genre, format, listen link, or lifecycle correction was added.
- Imported/factual-only records were not edited. Existing typed entity relationships and provenance were not rewritten.
- Rule-based collections and existing similarity-collection materialization were not manually changed. Only curated collection sources were extended.

The four new content-note sets are limited to source-supported warnings: graphic horror and explicit language for Campfire Radio Theater, graphic violence and hate speech for The Burned Photo, death/gore, body horror, and sudden loud noises for The Penumbra Podcast, and religious themes, human sacrifice, suicide, and body horror for The Silt Verses.

## 2. Selection analysis

The post-Batch 11 snapshot contained 752 published shows, 235 enrichment-eligible records, 361 shows with at least one collection, 391 without membership, and 145 actionable enrichment candidates. The selected records were the leading sparse opportunities with evidence for distinct listening routes, not ten mechanically identical records. Existing collection coverage was retained for records that already had useful placements; new placements were added only when the curated route matched the source-backed premise, structure, or observed length.

| Record | Discovery function | Why this batch included it |
| --- | --- | --- |
| [Campfire Radio Theater](../../catalog-src/shows/campfire-radio-theater.json) | Fully dramatized paranormal anthology | Adds a classic-radio, soundscaped horror route with short, self-contained tales. |
| [Hello From The Hallowoods](../../catalog-src/shows/hello-from-the-hallowoods.json) | Queer end-of-world forest serial | Adds a long-running narrator-led community route where queer identity and hope persist inside cosmic horror. |
| [Old Gods of Appalachia](../../catalog-src/shows/old-gods-of-appalachia.json) | Appalachian folk-horror mythology | Adds regional, eldritch, mining, and generational worldbuilding to the sparse queue. |
| [Palimpsest](../../catalog-src/shows/palimpsest.json) | Gothic seasonal anthology | Adds mostly single-voiced, memory-driven ghost stories with self-contained seasonal routes. |
| [TANIS](../../catalog-src/shows/tanis.json) | Conspiracy and information investigation | Adds a host-led docudrama route where truth, research, and fiction blur across a deep back catalogue. |
| [The Burned Photo](../../catalog-src/shows/the-burned-photo.json) | Family-curse supernatural thriller | Adds a bounded two-season route driven by two women tracing a multi-generational threat. |
| [The Edge of Sleep](../../catalog-src/shows/the-edge-of-sleep.json) | Compact sleep-apocalypse survival thriller | Adds a full-cast, under-five-hour pressure story with an unusually clear first-listen route. |
| [The Milkman of St. Gaff's](../../catalog-src/shows/the-milkman-of-st-gaffs.json) | Kafkaesque island mystery | Adds a narrator-led local society whose vocation, secrecy, and hidden rules carry the horror. |
| [The Penumbra Podcast](../../catalog-src/shows/the-penumbra-podcast.json) | Queer multi-series genre fiction | Adds discovery structure for Juno Steel, Second Citadel, and Thirst without collapsing them into one genre. |
| [The Silt Verses](../../catalog-src/shows/the-silt-verses.json) | River-faith folk-horror serial | Adds a full-cast pilgrimage through outlawed faith, police pursuit, ritual, and state power. |

## 3. Evidence anchors checked

These sources supported premise, setting, form, production framing, route length, or content-note decisions. They were not used to fabricate ratings, verification, or lifecycle state.

| Record | Source anchor and supported signal |
| --- | --- |
| Campfire Radio Theater | [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/campfire-radio-theater/id492465503) — modern audio-drama horror anthology, fully dramatized production, soundscape/original-music framing, short episode length, and an episode warning for explicit language and graphic horror content. |
| Hello From The Hallowoods | [Official show site](https://www.thehallowoods.com/) — queer horror, cosmic narrator, connected residents of a forest at the end of the world, bittersweet hope, and current long-running serialized episodes. |
| Old Gods of Appalachia | [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/old-gods-of-appalachia/id1485435369) and [official site](https://www.oldgodsofappalachia.com/) — alternate Appalachia, horror anthology, old gods, mining-related danger, narration/performance, sound design, music, and a six-season observed run. |
| Palimpsest | [Palimpsest Productions show page](https://palimpsestproductions.com/our-shows/) and [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/palimpsest/id1288069795) — mostly single-voiced audio drama, memory/identity/haunting, five seasons, stand-alone episodes, and recurring-house gothic framing. |
| TANIS | [Official About page](https://tanispodcast.com/about/) and [Public Radio Alliance shows page](https://www.publicradioalliance.com/shows) — serialized bi-weekly docudrama, Nic Silver as host, the myth of Tanis, conspiracy/information themes, and science-fiction/reality ambiguity. |
| The Burned Photo | [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/the-burned-photo/id1587021539) — Felicia and Kira, multi-generational family curse, Doctor Joachim, QCODE/Vertigo production, and an episode warning for hate speech and graphic violence. |
| The Edge of Sleep | [QCODE show page](https://qcodemedia.com/theedgeofsleep) and [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/the-edge-of-sleep/id1479444959) — QCODE/Wood Elf survival thriller, night watchman and survivor group, global sleep-death premise, full-cast form, and compact observed run. |
| The Milkman of St. Gaff's | [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/the-milkman-of-st-gaffs/id1526124070) and [creator site](https://www.howiemilkman.com/) — Howie, the island of St. Gaff's, milkmen's hidden secret, serialized fantasy/horror, and narrator-led framing. |
| The Penumbra Podcast | [Official show site](https://www.thepenumbrapodcast.com/) and [official episode/feed page](https://shows.acast.com/the-penumbra-podcast) — Juno Steel's Mars sci-fi noir, Second Citadel's fantasy war, Thirst's future-America competition, queer genre-fiction framing, and feed-level trigger warnings for death/gore, body horror, and sudden loud noises. |
| The Silt Verses | [Official Listen Now page](https://www.thesiltverses.com/listen-now) — Carpenter and Faulkner's river pilgrimage, outlawed god, police manhunt, rural territories, three-season plan, global cast, and explicit warnings for religious references, human sacrifice, suicide, and body horror. |

## 4. Enrichment decisions

Each selected record received a coherent packet. `content` records setting, point of view, source material, and framing; the discovery profile records voice, narrative focus, intensity, and commitment. Content notes were added only where official or provider episode/feed warnings supplied a clear cue.

| Record | Tones / themes | Best-for routes | Profile | New curated routes | Authored similarity |
| --- | --- | --- | --- | --- | --- |
| Campfire Radio Theater | `dark`, `tense`, `cinematic`; paranormal encounters, anthology storytelling, classic radio atmosphere | headphones on, late night | primarily acted; plot-driven; high; short | Late-night tension; Headphones-on immersion | The NoSleep Podcast |
| Hello From The Hallowoods | `dark`, `hopeful`, `melancholic`, `weird`; queer identity and community, end-of-world hope, survival and connection, cosmic horror | binge listening, long walks, late night, headphones on | primarily narrated; character-driven; high; long | Best for long walks; Worldbuilding deep dives; Late-night tension | Welcome to Night Vale |
| Old Gods of Appalachia | `dark`, `bleak`, `tense`, `cinematic`; alternate Appalachia, folk horror and eldritch mythology, mining and extraction, generational histories | worldbuilding, long walks, late night, headphones on, binge listening | primarily narrated; plot-driven; high; deep dive | Headphones-on immersion; existing long-walk, worldbuilding, and folk-horror routes retained | The Silt Verses |
| Palimpsest | `dark`, `melancholic`, `weird`, `cinematic`; memory and identity, ghosts and hauntings, women at the center of uncanny stories, self-contained seasonal stories | late night, headphones on, binge listening | primarily narrated; character-driven; medium; medium | Late-night tension; Headphones-on immersion | Mabel |
| TANIS | `dark`, `tense`, `weird`; conspiracy and information, nature of truth, myth and investigation, blurred reality and fiction | binge listening, late night, long walks, headphones on | primarily narrated; plot-driven; medium; deep dive | Best for long walks; Late-night tension | Rabbits |
| The Burned Photo | `dark`, `tense`, `cinematic`; multi-generational curse, family lineages, women confronting supernatural threat, 18th-century sorcerer | late night, headphones on, binge listening | primarily acted; plot-driven; high; medium | Late-night tension | The Left Right Game |
| The Edge of Sleep | `dark`, `tense`, `cinematic`; sleep and death, global epidemic, survivor groups, uncovering a hidden cause | short under five hours, binge listening, late night, headphones on | primarily acted; plot-driven; high; short | Quick first listens; Survival pressure; Late-night tension | Blackout |
| The Milkman of St. Gaff's | `dark`, `weird`, `tense`; island social order, secretive milkmen, identity and vocation, alternate-reality horror | late night, binge listening, worldbuilding, headphones on | primarily narrated; plot-driven; high; medium | Worldbuilding deep dives; Late-night tension; existing folk-horror route retained | The Town Whispers |
| The Penumbra Podcast | `funny`, `cinematic`, `weird`, `hopeful`; queer genre fiction, private investigation and companionship, friendship across enemy lines, climate pressure and entertainment violence | worldbuilding, long walks, headphones on, binge listening | primarily acted; balanced; high; deep dive | Comedy with a mystery; existing long-walk, worldbuilding, and fantasy routes retained | The Strange Case of Starship Iris |
| The Silt Verses | `dark`, `bleak`, `tense`, `cinematic`; outlawed faith and pilgrimage, police manhunt and state power, ritual and sacrifice, rural territories and strange gods | worldbuilding, long walks, late night, headphones on, binge listening | primarily acted; plot-driven; high; deep dive | Late-night tension; Headphones-on immersion; existing long-walk, worldbuilding, and folk-horror routes retained | I Am in Eskew |

Structured content packets:

- Campfire Radio Theater: different settings across self-contained paranormal tales; an ensemble of characters in each dramatized story; original fiction; fully dramatized, soundscaped horror anthology.
- Hello From The Hallowoods: the forest at the end of the world; a cosmic narrator following increasingly connected residents; original fiction; serialized queer horror podcast.
- Old Gods of Appalachia: an alternate Appalachia shaped by old gods and dangerous mines; a narrator and shifting characters across linked horror tales; original fiction; serialized folk-horror anthology.
- Palimpsest: a recurring house across different times and places; a woman at the center of each seasonal story; original fiction; mostly single-voiced gothic audio drama.
- TANIS: the Pacific Northwest and the elusive myth of Tanis; host Nic Silver and his research into a surprising mystery; serialized investigative docudrama. The source did not warrant a stronger source-material label.
- The Burned Photo: the lives of two women linked by a multi-generational curse; Felicia and Kira as they investigate the curse's origin; fiction based on a Reddit thread; full-cast serialized supernatural thriller.
- The Edge of Sleep: a world where everyone who slept has died; night watchman Dave Torres and a band of survivors; original fiction; full-cast survival thriller.
- The Milkman of St. Gaff's: the island of St. Gaff's and its milk stations; Howie as he joins the island's milkmen; original fiction; narrator-led serialized fantasy-horror.
- The Penumbra Podcast: Mars, the Second Citadel, and a near-future America; Juno Steel and the ensemble storylines across the Penumbra; original fiction; multi-series queer audio drama.
- The Silt Verses: a great black river and the rural territories along it; Carpenter and Faulkner on pilgrimage under police pursuit; original fiction; full-cast folk-horror serial.

## 5. Before/after metrics

The baseline is the catalog immediately after Batch 11, reconstructed from the current source state by removing only Batch 12 discovery/content fields and Batch 12 curated memberships. Quality uses the existing 17-dimension discovery-quality score. Facet groups are tones, tags, best-for routes, and similar-show links. Profile keys are the four optional discovery-profile keys. Collection counts include existing rule/similarity memberships so the table describes the actual public catalog surface.

| Show | Quality | Facet groups | Profile keys | Structured content | Collections | Authored out / in |
| --- | ---: | ---: | ---: | --- | ---: | --- |
| Campfire Radio Theater | 10 → 15 | 1 → 4 | 0 → 4 | absent → 4 keys | 2 → 4 | 0/0 → 1/0 |
| Hello From The Hallowoods | 10 → 15 | 1 → 4 | 0 → 4 | absent → 4 keys | 1 → 4 | 0/1 → 1/1 |
| Old Gods of Appalachia | 10 → 15 | 1 → 4 | 0 → 4 | absent → 4 keys | 5 → 6 | 0/3 → 1/3 |
| Palimpsest | 10 → 15 | 1 → 4 | 0 → 4 | absent → 4 keys | 1 → 3 | 0/0 → 1/0 |
| TANIS | 10 → 16 | 1 → 4 | 0 → 4 | absent → 3 keys | 0 → 2 | 0/0 → 1/0 |
| The Burned Photo | 10 → 16 | 1 → 4 | 0 → 4 | absent → 4 keys | 0 → 1 | 0/0 → 1/0 |
| The Edge of Sleep | 10 → 16 | 1 → 4 | 0 → 4 | absent → 4 keys | 0 → 3 | 0/1 → 1/1 |
| The Milkman of St. Gaff's | 10 → 15 | 1 → 4 | 0 → 4 | absent → 4 keys | 2 → 4 | 0/0 → 1/0 |
| The Penumbra Podcast | 10 → 15 | 1 → 4 | 0 → 4 | absent → 4 keys | 5 → 6 | 0/1 → 1/1 |
| The Silt Verses | 10 → 15 | 1 → 4 | 0 → 4 | absent → 4 keys | 4 → 6 | 0/1 → 1/2 |
| **Batch mean / total** | **10.0 → 15.3** | **10 → 40 facet groups** | **0 → 40 keys** | **0 → 39 keys** | **20 → 39 memberships** | **0/7 → 10/8** |

The catalog-wide deltas are:

| Measurement | Before | After | Change |
| --- | ---: | ---: | ---: |
| Published shows | 752 | 752 | unchanged |
| Enrichment-eligible / imported / editorial | 235 / 517 / 7 | 235 / 517 / 7 | unchanged |
| Shows with at least one collection | 361/752 | 364/752 | +3 |
| Shows with at least two collections | 208/752 | 212/752 | +4 |
| Shows with three or more useful facet groups | 180/752 | 190/752 | +10 |
| Curated discovery profiles | 144/752 | 154/752 | +10 |
| Tone coverage | 181/752 | 191/752 | +10 |
| Themes or content-note coverage | 183/752 | 193/752 | +10 |
| Best-for coverage | 180/752 | 190/752 | +10 |
| Similar-show source coverage | 179/752 | 189/752 | +10 |
| Authored similarity links / written reasons | 380/380 | 390/390 | +10 / +10 |
| Shows with authored outgoing routes | 179 | 189 | +10 |
| Collection membership edges | 940 | 959 | +19 |
| Shows without collection membership | 391 | 388 | -3 |
| Eligible shows missing one or more of tone, best-for, or similar routes | 55 | 45 | -10 |
| Strict computed source shows / edges | 100/166 | 108/179 | +8 / +13 |
| Shows with an authored outgoing or strict computed route | 183 | 193 | +10 |

The generated discovery report leaves 142 actionable candidates in the full queue immediately after the selected records are enriched; typed-entity and other non-facet gaps remain, while imported records stay outside the editorial queue.

## 6. Strict computed-similarity qualification

The public policy remains unchanged: score at least 20; pair, source, and target metadata coverage at least 0.65; at least three metadata dimensions; at least two anchor dimensions; at least two specific discovery dimensions; and at least two explanation reasons. Authored links and curated similarity evidence are excluded from this computation.

The selected records that clear the strict public computed gate after Batch 12 are:

- Campfire Radio Theater → Petrified (21.8), Dark Woods (20.3).
- Hello From The Hallowoods → The Milkman of St. Gaff's (20.8).
- TANIS → Ghost Wax (20.4), Parkdale Haunt (20.0).
- The Burned Photo → Blackout (33.2), The Edge of Sleep (29.4).
- The Edge of Sleep → The Burned Photo (29.4), From Now (28.2).
- The Milkman of St. Gaff's → Alice Isn't Dead (24.0), Ghost Wax (22.1).
- The Penumbra Podcast → Midnight Burger (20.5).
- The Silt Verses → The Liberty Podcast (21.6).

Old Gods of Appalachia and Palimpsest did not clear the strict computed gate in this snapshot. These are computed archive matches, not authored editorial recommendations; they do not alter `similarTo` or the public policy. The reconstructed pre-Batch 12 state had 100 strict computed sources and 166 edges, with none of the ten selected records qualifying; the post-batch state has 108 sources and 179 edges.

## 7. Graph and collection health

The post-build collection-candidate report contains 959 materialized membership edges, 364 shows with membership, 388 without membership, and 7,322 candidate edges across 328 shows. It reports zero invalid collection references, no near-duplicate collection pair, a low-membership threshold of seven, and drama/serialized as the broad underrepresented catalog areas at 44.7% and 48.7% coverage respectively. Candidate edges remain a review signal; no automatic memberships were accepted.

The entity graph remains at 132 public entities, 318 relationship records, and 266 linked shows; 486 shows have no entity relationship. No invalid or unresolved entity links were introduced, and the existing 43 type/role divergence warnings remain.

The batch adds usable routes for classic radio, queer community horror, regional mythology, gothic seasonal stories, conspiracy investigation, family-curse thriller, compact survival, strange local society, multi-series queer genre fiction, and political folk horror. It leaves unresolved entity evidence, lifecycle uncertainty, and uncollected records for later source review rather than filling gaps mechanically.

## 8. Rejected or deferred decisions

- No new controlled tags were added; the existing factual tags and free-text themes supplied the needed discovery signals.
- No entity links were added for the production companies, networks, or publishers associated with these records. Entity promotion remains a separate source-backed registry task.
- Existing rule-based and similarity-collection memberships were not manually edited.
- No release or completion state was inferred from current provider pages, episode counts, or old feed activity. TANIS, The Burned Photo, The Edge of Sleep, Palimpsest, and The Silt Verses retain their existing lifecycle values.
- The batch did not add TANIS to the recovered-evidence collection: the official source supports hosted investigative docudrama, but not a sufficiently clear recovered-recordings format for that route.
- The batch did not add records to completed-show or short-finished routes when the current catalog lifecycle fields remain unknown or unclear. The Edge of Sleep was added to Quick first listens only because its observed run is about 3.9 hours, not because completion was inferred.
- Campfire Radio Theater's content notes condense an explicit episode warning into a show-level cue; they do not claim every story has identical content.
- The Burned Photo's graphic-violence and hate-speech notes reflect the provider episode warning and are not a quality judgment.
- The Penumbra Podcast's death/gore, body-horror, and sudden-loud-noise notes reflect provider/feed trigger-warning material and are not exhaustive across every storyline.
- The Silt Verses' warning set follows the official show's published content warnings; no additional categories were inferred from the premise.
- The Burned Photo's Reddit-thread source wording was retained as factual framing only; no adaptation or rights conclusion was added.
- No ratings, reviews, verification states, factual metadata, lifecycle fields, similarity thresholds, collection rules, or public explanation policies were changed.

## 9. Validation and worktree boundary

Commands run after the source edits:

- `npm run build:catalog` — passed; built artifacts for 752 shows, 46 collections, and 7 review companions.
- `npm run validate:data` — passed with 0 integrity errors across 752 shows, 46 collections, 132 entities, and 7 review companions. The existing entity type/role divergence warnings remain; no invalid or unresolved entity links were introduced.
- `npm run report:discovery-quality` — passed; 364 shows with collections, 190 with three or more useful facet groups, 154 curated profiles, and 45 eligible records missing at least one of tones, best-for, or similar-show routes.
- `npm run report:similarity` — passed; 390 authored links with 390 written reasons and the unchanged similarity policy.
- `npm run report:collection-candidates` — passed; 959 membership edges, 388 shows without membership, 7,322 candidate edges across 328 shows, and 0 invalid references.
- `npm run report:entity-graph` — passed; 132 public entities, 318 relationship records, 266 linked shows, and 486 zero-relationship shows. No entity links were added.
- `npm run report:catalog` — passed; Gate B complete, 0 blocking errors, 0 actionable RSS gaps, 25 documented research-gap records, and generated-output drift clean.
- `git diff --check` — passed.
- Focused catalog/discovery/similarity/candidate tests — passed: 40/40.
- A read-only Node comparison reconstructed the pre-Batch 12 graph and confirmed the strict computed-similarity delta from 100/166 to 108/179; no scorer or policy files were changed.

The worktree retains the prior Phase 3 changes plus the ten Batch 12 show-source edits, seven curated collection-source changes, expected rebuilt catalog/search/status artifacts, and this QA report. No commit, push, deployment, or publication was performed.
