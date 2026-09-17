# Phase 3 Batch 11 — Discovery Enrichment QA

Date: 2026-09-17  
Scope: ten published, enrichment-eligible show records and ten curated collection sources  
Status: local source and generated-catalog validation only; not committed, deployed, or published

## 1. Scope and guardrails

Batch 11 follows the Batch 10 graph review. The queue remained top-heavy with sparse horror and science-fiction records, while the broad collection report still showed drama and serialized coverage below 50%. This batch therefore selected a deliberately wider route mix: compact comedy-horror, narrated community drama, rural radio drama, colony science fiction, episodic survival horror, sensitive crime investigation, urban horror, paranormal road mystery, interstellar adventure, and surreal mystery-comedy.

The existing source-of-truth rules were preserved:

- `catalog-src/shows/` and `catalog-src/collections/` remain authoritative; generated `data/` and `docs/generated/` files were rebuilt normally.
- Discovery values were added only where the record, its existing source metadata, and an official, creator, publisher, or provider source supported a useful classification.
- Every new `similarTo` edge received an explicit directional reason. Reciprocal copying was not used as a substitute for editorial judgment.
- The similarity scorer, public computed-match gate, thresholds, weights, and explanation policy were not changed. Computed candidates were not promoted into authored relationships.
- No raw creator, network, or provider string was promoted to a typed entity relationship.
- No rating, review, community score, creator-verification claim, factual tag, genre, format, listen link, or lifecycle correction was added.
- Imported/factual-only records were not edited. Existing typed entity relationships and provenance were not rewritten.
- Rule-based collections and existing similarity-collection materialization were not manually changed. Only curated collection sources were extended.

The three new content-note blocks are limited to direct premise/provider-supported warnings: suicide and suicidal ideation for The Patron Saint of Suicides, violence and gore for The Horror of Dolores Roach, and hallucinations and mental health themes for The Imperfection.

## 2. Selection analysis

The post-Batch 10 snapshot contained 752 published shows, 235 enrichment-eligible records, 356 shows with collection membership, 396 without membership, and 151 actionable candidates. The selected set intentionally includes two records with existing collection coverage and one record with an existing profile, because their gaps represented useful under-covered route types rather than a reason to fill the queue mechanically.

| Record | Discovery function | Why this batch included it |
| --- | --- | --- |
| [Rosanna's Secret](../../catalog-src/shows/rosannas-secret.json) | Compact comedy-horror vampire fiction | Adds a narrator-led, lightly macabre romance/comedy route with an unusually small observed first taste. |
| [The Fitzroy Diaries](../../catalog-src/shows/the-fitzroy-diaries.json) | Narrated community drama | Adds an intimate Melbourne neighborhood route with family, isolation, reconnection, and a clearly bounded three-season run. |
| [The Archers](../../catalog-src/shows/the-archers.json) | Ongoing rural radio drama | Adds a classic, episodic community-serial bridge into the underrepresented drama/radio lane; only its similar-show link was missing. |
| [The Liberty Podcast](../../catalog-src/shows/the-liberty-podcast.json) | Colony politics and space-opera science fiction | Adds a long-form Atrius/Fringe route with civil war, frontier exploration, and institutional power. |
| [The Liminal Lands](../../catalog-src/shows/the-liminal-lands.json) | Episodic survival and found-media horror | Adds a solitary, long-running speculative survival journey distinct from the archive's full-cast anthology routes. |
| [The Patron Saint of Suicides](../../catalog-src/shows/the-patron-saint-of-suicides.json) | Sensitive crime and intervention investigation | Adds a full-cast psychological investigation whose hotline, suicide-prevention, and trust themes require an explicit content note. |
| [The Horror of Dolores Roach](../../catalog-src/shows/the-horror-of-dolores-roach.json) | Urban survival horror | Adds a Gimlet/Spotify route about incarceration pressure, underground exclusion, and an escalating supernatural threat. |
| [The Left Right Game](../../catalog-src/shows/the-left-right-game.json) | Paranormal road investigation | Adds a bounded QCODE route where a journalist's recordings lead an expedition into an impossible game. |
| [The Sojourn](../../catalog-src/shows/the-sojourn.json) | Interstellar adventure and alien diplomacy | Adds a full-cast space-opera branch with resource scarcity, military history, and a larger inhabited universe. |
| [The Imperfection](../../catalog-src/shows/the-imperfection.json) | Surreal mystery-comedy | Adds a warm, weird full-cast route about friendship, hallucination, hidden places, and the search for truth. |

## 3. Evidence anchors checked

These sources supported premise, setting, form, production framing, route length, or content-note decisions. They were not used to fabricate ratings, verification, or lifecycle state.

| Record | Source anchor and supported signal |
| --- | --- |
| Rosanna's Secret | [official show page](https://samanthavhutton.com/podcast/rosannas-secret-2/) and [official YouTube series playlist](https://www.youtube.com/playlist?list=PLQHiDb_oo19OUDZ83ovUHm36acdM2degU) — vampire premise, village setting, narrator/creator context, strange supporting characters, and the existing short observed episode route. |
| The Fitzroy Diaries | [ABC Listen program page](https://www.abc.net.au/listen/programs/the-fitzroy-diaries) and [ABC series page](https://www.abc.net.au/listen/programs/the-fitzroy-diaries/9962814) — Fitzroy/Carlton setting, a woman walking through the neighborhood, family and neighbor relationships, cast, writer, and production framing. |
| The Archers | [BBC programme page](https://www.bbc.co.uk/programmes/b006qpgr), [BBC RSS feed](https://podcasts.files.bbci.co.uk/b006qpgr.rss), and [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/the-archers/id265970428?uo=4) — ongoing rural Ambridge community drama, episodic radio form, and current availability. |
| The Liberty Podcast | [Fool & Scholar's Liberty page](https://www.foolandscholar.com/critical-research) and [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/the-liberty-podcast/id1046992703) — serialized sci-fi audio drama, Atrius/Fringe setting, Dr. Kovski expedition, cast, and production context. |
| The Liminal Lands | [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/the-liminal-lands/id1631178384) and [creator feed page](https://creators.spotify.com/pod/profile/freddie-alexander4/) — hostile new reality, missing-family search, weekly/ongoing episodic route, and survival framing. |
| The Patron Saint of Suicides | [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/the-patron-saint-of-suicides/id1518151181) and [publisher show page](https://redcircle.com/shows/the-patron-saint-of-suicides) — full-cast fiction, private hotline, suicide-prevention intervention, detective investigation, creator, and production context. |
| The Horror of Dolores Roach | [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/the-horror-of-dolores-roach/id1437288075) and [creator page](https://www.aaronmarkwastaken.com/dolores-roach) — Washington Heights, underground tunnels, survival/in-carceration pressure, Gimlet production, cast, and episode-level violent imagery supporting a concise warning. |
| The Left Right Game | [QCODE show page](https://qcodemedia.com/theleftrightgame) and [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/the-left-right-game/id1498806952) — Tessa Thompson's journalist lead, paranormal expedition, supernatural world, full-cast limited-series form, recordings, and complete-series label. |
| The Sojourn | [official audio-drama page](https://www.thesojournaudiodrama.com/) — full cast, interstellar expedition, Tantalus Cluster, famine/resource stakes, alien threat, military/family conflict, and immersive sound/score. |
| The Imperfection | [Wolf at the Door show page](https://www.wlfdr.com/imperfection), [official show page](https://theimperfectionpodcast.com/about), and [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/the-imperfection/id1621232187) — hallucination premise, missing psychiatrist, hidden New York spaces, friendship/trust, full-cast production, and the source-backed mental-health content note. |

## 4. Enrichment decisions

Each selected record received a coherent discovery packet. `content` records setting, point of view, and framing; the structured discovery profile records voice, narrative focus, intensity, and commitment. The Archers already had those profile fields and received only a deliberate similarity bridge. No content-note block was added where the source did not expose a sufficiently specific warning.

| Record | Tones / themes | Best-for routes | Profile | New curated routes | Authored similarity |
| --- | --- | --- | --- | --- | --- |
| Rosanna's Secret | `funny`, `weird`, `dark`; vampire secrecy, romance and transformation, identity and adaptation | easy entry, warm weird | primarily narrated; character-driven; medium; short | Warm weird comfort; Quick first listens | Welcome to Night Vale |
| The Fitzroy Diaries | `warm`, `hopeful`, `melancholic`; community and belonging, family life, urban change, reconnection after isolation | long walks, binge listening | primarily narrated; character-driven; low; medium | Best for long walks; Completed shows | Love and Luck |
| The Archers | existing `warm`, `melancholic`; existing community/belonging, family-obligation, and rural-change themes retained | existing long walks, binge listening | existing primarily acted; character-driven; low; deep dive retained | none | Love and Luck |
| The Liberty Podcast | `dark`, `tense`, `cinematic`; colony isolation and civil war, frontier exploration, institutional power and citizenship, lawless borderlands | worldbuilding, serious sci-fi, long walks, binge listening | primarily acted; plot-driven; high; deep dive | Best for long walks; Worldbuilding deep dives; Serious sci-fi; Headphones-on immersion; Survival pressure | Vast Horizon |
| The Liminal Lands | `dark`, `tense`, `weird`; survival in a hostile reality, finding missing family, understanding the unknown | binge listening, long walks, late night | primarily narrated; plot-driven; high; long | Best for long walks; Worldbuilding deep dives; Late-night tension; Survival pressure; existing ongoing/episodic routes retained | Our Fair City |
| The Patron Saint of Suicides | `dark`, `tense`, `weird`; suicide prevention and intervention, criminal investigation, power and responsibility, trust and complicity | late night, headphones on, binge listening | primarily acted; plot-driven; high; medium | Late-night tension; Headphones-on immersion | Homecoming |
| The Horror of Dolores Roach | `dark`, `tense`, `weird`; survival and reinvention, incarceration and exclusion, paranoia and self-preservation, underground communities | late night, headphones on, binge listening | primarily acted; character-driven; high; medium | Late-night tension | Quiet Part Loud |
| The Left Right Game | `dark`, `tense`, `cinematic`; paranormal investigation, disappearance and evidence, rules of an impossible journey, group survival and trust | headphones on, late night, binge listening | primarily acted; plot-driven; high; short | Headphones-on immersion; Late-night tension; Survival pressure; Completed shows; Found recordings and buried evidence | The Edge of Sleep; existing incoming link from The Viridian Wild retained |
| The Sojourn | `tense`, `cinematic`, `hopeful`; interstellar exploration and survival, famine and resource scarcity, military duty and family power, alien conflict and diplomacy | worldbuilding, serious sci-fi, headphones on | primarily acted; plot-driven; high; medium | Worldbuilding deep dives; Serious sci-fi; Headphones-on immersion; Survival pressure; existing Ongoing Sci-Fi retained | Crystal Blue |
| The Imperfection | `funny`, `weird`, `warm`; friendship and trust, mental health and perception, secret societies and hidden places, searching for truth | easy entry, short under five hours, warm weird | primarily acted; balanced; medium; short | Warm weird comfort; Quick first listens; existing comedy/mystery routes retained | The Amelia Project |

Structured content framing added:

- Rosanna's Secret: a village setting and narrator-led comedy-horror vampire framing, retaining its existing source-material and point-of-view fields.
- The Fitzroy Diaries: Fitzroy/Carlton setting, walking-observer point of view, and narrated community-drama framing.
- The Liberty Podcast: Atrius/Fringe setting, Dr. Kovski-led expedition point of view, and serialized science-fiction audio-drama framing.
- The Liminal Lands: hostile-reality setting, lone traveler searching for missing family, and weekly episodic survival-horror framing.
- The Patron Saint of Suicides: city/hotline investigation setting, Haven Otomo and detective-led point of view, and full-cast investigative framing.
- The Horror of Dolores Roach: Washington Heights and underground New York setting, Dolores-led survival point of view, and serialized urban-horror framing.
- The Left Right Game: road/supernatural-world setting, Alice Sharman and expedition recordings, and full-cast limited-series investigation framing.
- The Sojourn: Tantalus Cluster/distant-nebula setting, Cassandra Farren and Elizabeth Ancelet expedition point of view, and full-cast interstellar-adventure framing.
- The Imperfection: New York/hidden-borough setting, Charlie and Amber-led patient ensemble, and full-cast surreal mystery-comedy framing.

## 5. Before/after metrics

The baseline is the generated catalog immediately after Batch 10, reconstructed from the current source state by removing only Batch 11 discovery/content fields, authored links, and curated memberships. Quality uses the existing 17-dimension discovery-quality score. Facet groups are tones, tags, best-for routes, and similar-show links. Profile keys are the four optional discovery-profile keys. Collection counts include existing rule and similarity memberships so the table describes the actual public catalog surface.

| Show | Quality | Facet groups | Profile keys | Structured content keys | Collections | Authored out / in |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Rosanna's Secret | 10 → 16 | 1 → 4 | 0 → 4 | 2 → 4 | 0 → 2 | 0/0 → 1/0 |
| The Fitzroy Diaries | 10 → 15 | 1 → 4 | 0 → 4 | 0 → 3 | 1 → 3 | 0/0 → 1/0 |
| The Archers | 14 → 15 | 3 → 4 | 4 → 4 | 4 → 4 | 1 → 1 | 0/0 → 1/0 |
| The Liberty Podcast | 10 → 16 | 1 → 4 | 0 → 4 | 0 → 3 | 0 → 5 | 0/0 → 1/0 |
| The Liminal Lands | 10 → 15 | 1 → 4 | 0 → 4 | 0 → 3 | 3 → 7 | 0/0 → 1/0 |
| The Patron Saint of Suicides | 10 → 16 | 1 → 4 | 0 → 4 | 0 → 3 | 0 → 2 | 0/0 → 1/0 |
| The Horror of Dolores Roach | 10 → 16 | 1 → 4 | 0 → 4 | 0 → 3 | 0 → 1 | 0/0 → 1/0 |
| The Left Right Game | 10 → 16 | 1 → 4 | 0 → 4 | 0 → 3 | 0 → 5 | 0/1 → 1/1 |
| The Sojourn | 10 → 15 | 1 → 4 | 0 → 4 | 0 → 3 | 1 → 5 | 0/0 → 1/0 |
| The Imperfection | 11 → 16 | 1 → 4 | 0 → 4 | 0 → 3 | 3 → 5 | 0/0 → 1/0 |
| **Batch mean / total** | **10.5 → 15.6** | **12 → 40 facet groups** | **0 → 36 keys** | **6 → 31 keys** | **9 → 36 memberships** | **0/1 → 10/1** |

The catalog-wide deltas are:

| Measurement | Before | After | Change |
| --- | ---: | ---: | ---: |
| Published shows | 752 | 752 | unchanged |
| Enrichment-eligible / imported / editorial | 235 / 517 / 7 | 235 / 517 / 7 | unchanged |
| Shows with at least one collection | 356/752 | 361/752 | +5 |
| Shows with at least two collections | 202/752 | 208/752 | +6 |
| Collection membership edges | 913 | 940 | +27 |
| Shows with three or more useful facet groups | 171/752 | 180/752 | +9 |
| Curated discovery profiles | 135/752 | 144/752 | +9 |
| Tone coverage | 172/752 | 181/752 | +9 |
| Theme coverage | 174/752 | 183/752 | +9 |
| Best-for coverage | 171/752 | 180/752 | +9 |
| Similar-show source coverage | 169/752 | 179/752 | +10 |
| Authored similarity links / written reasons | 370/370 | 380/380 | +10 / +10 |
| Shows with authored outgoing routes | 169 | 179 | +10 |
| Eligible shows missing one or more of tone, best-for, or similar routes | 64 | 55 | -9 |
| Strict computed source shows / edges | 89/148 | 100/166 | +11 / +18 |
| Shows with an authored outgoing or strict computed route | 173 | 183 | +10 |

The full discovery report leaves 145 actionable candidates because typed-entity and other non-facet gaps remain; imported records remain outside that editorial queue.

## 6. Strict computed-similarity qualification

The public policy remains unchanged: score at least 20; pair, source, and target metadata coverage at least 0.65; at least three metadata dimensions; at least two anchor dimensions; at least two specific discovery dimensions; and at least two explanation reasons. Authored links and curated similarity evidence are excluded from this computation.

Selected records that clear the strict public computed gate in the post-Batch 11 snapshot:

- The Liberty Podcast → The White Vault (27.2) and Don't Mind (27.0).
- The Liminal Lands → The Cellar Letters (22.1).
- The Patron Saint of Suicides → Station 151 (25.0) and The Deca Tapes (24.6).
- The Horror of Dolores Roach → Sandra (27.2) and Motherhacker (24.6).
- The Left Right Game → From Now (27.2) and Blackout (27.0).
- The Sojourn → The Cleansed (22.2) and Marsfall (21.4).
- The Imperfection → Modes of Thought in Anterran Literature (24.8).

Rosanna's Secret, The Fitzroy Diaries, and The Archers did not clear the strict computed gate in this snapshot. These are computed archive matches, not authored editorial recommendations; they do not alter `similarTo` or the public policy.

Across the catalog, strict computed sources increased from 89 to 100 and edges from 148 to 166. The union of shows with an authored outgoing route or a strict computed route increased from 173 to 183. No thresholds, weights, or policy adapters changed.

## 7. Graph and collection health

The post-build collection-candidate report contains 940 materialized membership edges, 361 shows with membership, 391 without membership, and 7,148 candidate edges across 328 shows. It reports zero invalid collection references and no near-duplicate collection pair. Drama remains the largest broad desert at 44.4% collection coverage, and serialized shows remain at 48.1%; candidate edges remain a review signal and no automatic memberships were accepted.

The entity graph remains at 132 public entities, 318 relationship records, and 266 linked shows; 486 shows have no entity relationship. No invalid or unresolved entity links were introduced, and the existing 43 type/role divergence warnings remain.

The batch raises route coverage for community drama, colony/worldbuilding science fiction, episodic survival, sensitive investigation, urban horror, paranormal road mystery, and surreal mystery-comedy. It leaves the remaining sparse anthology-horror queue and source-backed entity promotion work for later review rather than assigning generic metadata.

## 8. Rejected or deferred decisions

- No new controlled tags were added; existing factual tags and free-text themes supplied the needed discovery signals.
- No entity links were added for the production companies, networks, studios, or publishers associated with these records. Entity promotion remains a separate source-backed registry task.
- The existing lifecycle values were not changed. The Left Right Game's provider label says complete, but that evidence was used only for its bounded curated route; no release/completion field was rewritten.
- The Sojourn's official page announces an upcoming volume and the catalog's existing research gap remains intact; no count, RSS, or active/ongoing field was corrected.
- Rosanna's Secret retains the current one-observed-episode and no-canonical-RSS uncertainty. Its Quick first listens membership explicitly describes that limited observed evidence rather than claiming the full series is short or finished.
- The Patron Saint of Suicides received a concise suicide-related warning because the source premise is explicit. The note is a content-safety cue, not a clinical claim, rating, or quality judgment.
- The Horror of Dolores Roach received only `violence and gore`; no unsupported warning list was inferred from the title or secondary commentary.
- The Imperfection received only `hallucinations and mental health themes`; no diagnosis or clinical interpretation was added.
- The Archers was given one deliberate similarity bridge despite already having its profile and three useful facets, because ongoing rural radio drama remained a sparse route in the broader graph.
- No ratings, reviews, verification states, factual metadata, similarity thresholds, collection rules, or public explanation policies were changed.

## 9. Validation and worktree boundary

Commands run after the source edits:

- `npm run build:catalog` — passed; built artifacts for 752 shows, 46 collections, and 7 review companions.
- `npm run validate:data` — passed with 0 integrity errors across 752 shows, 46 collections, 132 entities, and 7 review companions. The existing entity type/role divergence warnings remain; no invalid or unresolved entity links were introduced.
- `npm run report:discovery-quality` — passed; 361 shows with collections, 180 with three or more useful facet groups, 144 curated profiles, and 55 eligible records missing at least one of tones, best-for, or similar-show routes.
- `npm run report:similarity` — passed; 380 authored links with 380 written reasons and the unchanged similarity policy.
- `npm run report:collection-candidates` — passed; 940 membership edges, 391 shows without membership, 7,148 candidate edges across 328 shows, and 0 invalid references.
- `npm run report:entity-graph` — passed; 132 public entities, 318 known relationship records, 266 linked shows, and 486 zero-relationship shows. No entity links were added.
- `npm run report:catalog` — passed; Gate B complete, 0 blocking errors, 0 actionable RSS gaps, 25 documented research-gap records, and generated-output drift clean.
- `git diff --check` — passed.
- Focused catalog/discovery/similarity/candidate tests — passed: 40/40.

The worktree retains the prior Phase 3 changes plus the ten Batch 11 show-source edits, ten curated collection-source changes, expected rebuilt catalog/search/status artifacts, and this QA report. No commit, push, deployment, or publication was performed.
