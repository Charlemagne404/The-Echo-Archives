# Phase 3 Batch 23 — Discovery Enrichment QA

Date: 2026-09-17  
Scope: eleven published, enrichment-eligible show records receiving curated discovery profiles  
Status: local source and generated-catalog validation only; not committed, deployed, or published

## 1. Scope and guardrails

Batch 23 continues the sequential Phase 3 discovery-enrichment work after Batch 22. The post-Batch 22 graph had 752 published shows, 235 enrichment-eligible records, 517 imported/factual-only records, 7 editorial records, 224 curated discovery profiles, and 11 eligible records without a profile. All 235 eligible records already carried tones, tags, best-for routes, and authored similar-show links, so this batch completes the remaining profile queue rather than padding complete facet groups.

The selected records span performed survival science fiction, found-footage horror, investigative docudrama, space opera, alternating-perspective science-fiction horror, epistolary ghost drama, and episodic supernatural casework. The queue itself was concentrated in horror and science fiction, but the packet preserves useful distinctions between short limited routes, long serials, deep-dive catalogs, narrated investigations, and character-led ensembles.

The existing source-of-truth and safety rules were preserved:

- `catalog-src/shows/` remains authoritative; generated `data/` and `docs/generated/` files were rebuilt normally.
- Each profile was added only where the existing format, content, length, description, and official or publisher source supported the four controlled dimensions: voice style, narrative focus, intensity, and commitment.
- No imported/factual-only record was edited. No ratings, reviews, community scores, creator-verification claims, factual metadata, or lifecycle corrections were added.
- No collection source or collection membership was changed in this batch. Existing collection coverage and authored collection reasons were retained.
- The similarity scorer, weights, thresholds, public computed-match gate, and explanation policy were not changed. Computed candidates were not promoted into authored relationships.
- No raw creator, network, publisher, provider, or broadcaster string was promoted to a new typed entity relationship. Existing entity links and provenance were not rewritten.
- The profile values are bounded editorial discovery classifications, not claims about awards, ratings, verification, completion, or objective credit ownership.

## 2. Selection analysis

The pre-Batch 23 graph contained 752 published shows, 235 enrichment-eligible records, 371 shows with at least one collection, 381 without collection membership, 106 actionable candidates, and 11 eligible records without a curated `discovery` profile. The queue was reviewed against current format, content, length, existing facets, and source readiness. All eleven had enough source-backed form and route evidence for profile-only enrichment; the separate rating, entity, official-link, and lifecycle gaps on some records were left untouched.

| Record | Discovery function | Why this batch included it |
| --- | --- | --- |
| [Earth Eclipsed](../../catalog-src/shows/earth-eclipsed.json) | Full-cast dystopian science-fiction thriller | The official site and listing establish Dr. Alexine Prometh's kidnapping, the Abacus Project, a distant-future setting, and an immersive performed route of eight story episodes plus trailer material. |
| [Paralyzed](../../catalog-src/shows/paralyzed.json) | Full-cast psychological creature serial | 7 Lamb's official materials establish a voice-acted audio-drama production, while the local record supplies the five-season, 117-episode route and high-pressure nightmare/supernatural premise. |
| [End of All Hope](../../catalog-src/shows/end-of-all-hope.json) | Full-cast alien-invasion survival serial | 7 Lamb's publisher framing supports a performed apocalyptic survival story; the local record provides six seasons and 99 public episodes for a deep commitment classification. |
| [Archive 81](../../catalog-src/shows/archive-81.json) | Found-footage horror and occult investigation | The official site describes a fiction podcast about horror, cities, ritual, stories, and sound, with three seasons and two miniseries; the local record supports the current full-cast catalog. |
| [The Strange Case of Starship Iris](../../catalog-src/shows/the-strange-case-of-starship-iris.json) | Full-cast space-opera mystery | Procyon and Apple materials establish Violet Liu's survivor-led investigation, postwar frontier, found family, romance, secrets, jokes, and a 42-episode run. |
| [The Lovecraft Investigations](../../catalog-src/shows/the-lovecraft-investigations.json) | Mixed podcast-journalism horror investigation | The BBC source and local record support a performed investigative frame, Lovecraft-inspired mystery, 44-episode route, and high-intensity supernatural investigation. |
| [The Black Tapes](../../catalog-src/shows/the-black-tapes.json) | Narrated serialized paranormal docudrama | The official show page explicitly frames a journalist's search around an enigmatic paranormal investigator, with a serialized docudrama structure and multiple seasons. |
| [Janus Descending](../../catalog-src/shows/janus-descending.json) | Alternating-perspective science-fiction horror | No Such Thing's official page and press kit establish the two opposing timelines/perspectives, quarantined alien facility, survival stakes, and contained 13-episode story. |
| [Midnight Radio](../../catalog-src/shows/midnight-radio.json) | Full-cast epistolary ghost drama | The official listing identifies Bobbie Parker as writer, points to official transcripts, and supports the radio-correspondence and ghost-story framing of the ten-part route. |
| [COPPERHEART](../../catalog-src/shows/copperheart-a-riggstories-audio-drama.json) | Full-cast nuclear-winter science-fiction thriller | RiggStories' official page establishes the Area 51 reconstruction bunker, underground community, visitor, mature content, and ongoing multi-season audio-drama route. |
| [Mage In The Machine](../../catalog-src/shows/mage-in-the-machine.json) | Single-lead episodic supernatural casework | The official listing centers Oz Grimhallow, a cursed computer-repair technician who receives a new horrible case each episode; the local record supports a seven-episode short route. |

This batch completes the remaining profile queue without editing records whose other gaps require a separate evidence workflow.

## 3. Evidence anchors checked

These sources supported premise, form, production framing, or listening commitment. They were not used to fabricate ratings, verification, or lifecycle state.

| Record | Source anchor and supported signal |
| --- | --- |
| Earth Eclipsed | [Official Earth Eclipsed site](https://www.eartheclipsed.com/) and [official Apple Podcasts listing](https://podcasts.apple.com/us/podcast/earth-eclipsed/id1544552983) — distant-future immersive audio series, Dr. Prometh's kidnapping, the Abacus Project, cast/episode structure, and short story route. |
| Paralyzed | [7 Lamb Productions' Paralyzed page](https://www.7lamb.com/audiodramas/paralyzed) and [7 Lamb Productions about page](https://www.7lamb.com/about-us) — psychological creature-horror premise, high-end audio drama, voice acting, and production framing. |
| End of All Hope | [7 Lamb Productions' End of All Hope page](https://www.7lamb.com/audiodramas/end-of-all-hope) and [official Apple Podcasts listing](https://podcasts.apple.com/ca/podcast/end-of-all-hope/id1040046560) — alien-invasion survival premise, performed serial, and long-running season route. |
| Archive 81 | [Official Archive 81 site](https://www.archive81.com/) and [official Apple Podcasts listing](https://podcasts.apple.com/us/podcast/archive-81/id1098194172) — found-footage fiction, horror/city/ritual framing, sound-led presentation, and season/miniseries structure. |
| The Strange Case of Starship Iris | [Procyon Podcasts — Starship Iris](https://www.procyonpodcastnetwork.com/starship-iris) and [official Apple Podcasts listing](https://podcasts.apple.com/us/podcast/the-strange-case-of-starship-iris/id1193720457) — survivor-led space mystery, performed ensemble, found family, secrets, and 42-episode catalog. |
| The Lovecraft Investigations | [BBC programme page](https://www.bbc.co.uk/programmes/m002xnkw) — BBC investigative audio-drama framing, contemporary podcast journalism, and Lovecraft-inspired supernatural mystery. |
| The Black Tapes | [Official Black Tapes show page](https://theblacktapespodcast.com/new-page-1-1-1) — bi-weekly serialized docudrama, journalist Alex Reagan, paranormal investigator, and season structure. |
| Janus Descending | [Official Janus Descending page](https://www.nosuchthingradio.com/janus-descending) and [official press kit](https://www.nosuchthingradio.com/janus-descending-press-kit) — science-fiction horror, alternating timelines, quarantined facilities, survival stakes, and public transcripts. |
| Midnight Radio | [Official Apple Podcasts listing](https://podcasts.apple.com/us/podcast/midnight-radio/id1393315066) — Bobbie Parker's authorship, radio correspondence, ghost-story framing, official transcript pointer, and content-warning context. |
| COPPERHEART | [Official RiggStories Copperheart page](https://riggstories.com/copperheart) and [official Apple Podcasts listing](https://podcasts.apple.com/us/podcast/copperheart-a-riggstories-audio-drama/id1457844882) — sci-fi thriller audio drama, reconstruction bunker, Area 51 setting, full-cast episode route, and mature-audience framing. |
| Mage In The Machine | [Official Apple Podcasts listing](https://podcasts.apple.com/us/podcast/mage-in-the-machine/id1815145178) — single-lead supernatural case premise, episodic structure, seven episodes, and high-intensity horror framing. |

## 4. Enrichment decisions

The eleven packets use only the controlled profile vocabulary already accepted by the catalog schema:

| Record | Curated discovery profile |
| --- | --- |
| Earth Eclipsed | Primarily acted; plot-driven; high intensity; short commitment. The full-cast kidnapping and Abacus Project thriller is plot-forward, high-pressure, and contained to one short story season. |
| Paralyzed | Primarily acted; plot-driven; high intensity; deep-dive commitment. The voice-acted creature-horror serial is driven by escalating nightmares and supernatural threat across five seasons and 117 episodes. |
| End of All Hope | Primarily acted; plot-driven; high intensity; deep-dive commitment. The performed alien-invasion survival story is threat- and movement-led, with six seasons and 99 public episodes. |
| Archive 81 | Mixed; plot-driven; high intensity; long commitment. Found recordings, investigative framing, and full-cast fiction combine into a plot-led occult mystery with three seasons and two miniseries. |
| The Strange Case of Starship Iris | Primarily acted; character-driven; medium intensity; long commitment. The ensemble's relationships, found family, identity, romance, and survivor adjustment are central even as the mystery advances across 42 episodes. |
| The Lovecraft Investigations | Mixed; plot-driven; high intensity; long commitment. Podcast journalism, interviews, and acted investigation combine around a high-stakes supernatural mystery across 44 episodes. |
| The Black Tapes | Primarily narrated; plot-driven; high intensity; long commitment. Alex Reagan's journalist-led account and paranormal investigation make narrated investigative progression the primary route across the multi-season catalog. |
| Janus Descending | Primarily acted; plot-driven; high intensity; short commitment. The performed alternating perspectives reveal a survival story in crossing timelines, while 13 episodes keep the route contained. |
| Midnight Radio | Primarily acted; character-driven; low intensity; short commitment. The full-cast correspondence and ghost-story framing keep relationships, memory, and what is left behind at the center of a ten-part route. |
| COPPERHEART | Primarily acted; plot-driven; high intensity; deep-dive commitment. The full-cast bunker thriller is organized around a dangerous arrival and the community's survival under nuclear-winter conditions across a substantial catalog. |
| Mage In The Machine | Primarily narrated; plot-driven; high intensity; short commitment. A single lead receives a new supernatural case in each episode, with an unfolding mythology and seven-episode route. |

No structured content keys, content-warning notes, tags, collections, ratings, similar-show links, or entity links were changed. The only authored source additions are the four profile keys per selected show, plus source-update dates on records whose prior date was older.

## 5. Collection and entity boundary

This batch made no curated collection edits. The current graph still contains 1,115 materialized membership edges, 371 shows with membership, and 381 without membership. The collection-candidate report remains a review aid; no automatic candidate was accepted.

This batch also made no entity edits. The entity graph remains source-backed at 132 public entities, 318 relationship records, and 266 linked shows. Profile work does not promote legacy creator or network strings into typed relationships.

## 6. Before/after metrics

The baseline is the generated catalog immediately after Batch 22, reconstructed from the current source state by removing only the new `discovery` objects for these eleven records. Quality uses the existing 17-dimension discovery-quality score. Facet groups are tones, tags, best-for routes, and similar-show links. Profile keys are the four controlled discovery-profile keys. Structured-content counts are object keys, not a claim that each key has equal weight. Collection and authored-similarity counts show the unchanged public catalog surface.

| Show | Quality | Facet groups | Profile keys | Structured content | Content notes | Collections | Authored similar links |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Earth Eclipsed | 16 → 17 | 4 → 4 | 0 → 4 | 4 → 4 keys | 1 → 1 | 2 → 2 | 3 → 3 |
| Paralyzed | 16 → 17 | 4 → 4 | 0 → 4 | 4 → 4 keys | 2 → 2 | 3 → 3 | 3 → 3 |
| End of All Hope | 16 → 17 | 4 → 4 | 0 → 4 | 4 → 4 keys | 1 → 1 | 4 → 4 | 3 → 3 |
| Archive 81 | 15 → 16 | 4 → 4 | 0 → 4 | 4 → 4 keys | 2 → 2 | 9 → 9 | 3 → 3 |
| The Strange Case of Starship Iris | 15 → 16 | 4 → 4 | 0 → 4 | 4 → 4 keys | 1 → 1 | 3 → 3 | 4 → 4 |
| The Lovecraft Investigations | 15 → 16 | 4 → 4 | 0 → 4 | 4 → 4 keys | 2 → 2 | 6 → 6 | 4 → 4 |
| The Black Tapes | 14 → 15 | 4 → 4 | 0 → 4 | 4 → 4 keys | 1 → 1 | 7 → 7 | 3 → 3 |
| Janus Descending | 15 → 16 | 4 → 4 | 0 → 4 | 4 → 4 keys | 2 → 2 | 6 → 6 | 3 → 3 |
| Midnight Radio | 14 → 15 | 4 → 4 | 0 → 4 | 4 → 4 keys | 1 → 1 | 4 → 4 | 3 → 3 |
| COPPERHEART | 14 → 15 | 4 → 4 | 0 → 4 | 4 → 4 keys | 3 → 3 | 3 → 3 | 3 → 3 |
| Mage In The Machine | 14 → 15 | 4 → 4 | 0 → 4 | 4 → 4 keys | 3 → 3 | 5 → 5 | 4 → 4 |
| **Batch mean / total** | **14.9 → 15.9** | **44 → 44 facet groups** | **0 → 44 keys** | **44 → 44 keys** | **19 → 19 notes** | **52 → 52 memberships** | **36 → 36** |

The catalog-wide deltas are:

| Measurement | Before | After | Change |
| --- | ---: | ---: | ---: |
| Published shows | 752 | 752 | unchanged |
| Enrichment-eligible / imported / editorial | 235 / 517 / 7 | 235 / 517 / 7 | unchanged |
| Shows with explicit entity relationships | 266/752 | 266/752 | unchanged |
| Shows with a creator-role entity relationship | 61/752 | 61/752 | unchanged |
| Shows with at least one collection | 371/752 | 371/752 | unchanged |
| Shows with at least two collections | 250/752 | 250/752 | unchanged |
| Shows with at least one useful facet | 235/752 | 235/752 | unchanged |
| Shows with three or more useful facet groups | 235/752 | 235/752 | unchanged |
| Curated discovery profiles | 224/752 | 235/752 | +11 |
| Tone / tag / best-for / similar source coverage | 235/752 each | 235/752 each | unchanged |
| Voice-style signal coverage | 220/752 | 231/752 | +11 |
| Narrative-focus signal coverage | 221/752 | 232/752 | +11 |
| Intensity signal coverage | 232/752 | 232/752 | unchanged; existing `content.intensity` already supplied coverage for these records |
| Commitment signal coverage | 215/752 | 226/752 | +11 |
| Authored similarity links / written reasons | 447/447 | 447/447 | unchanged |
| Collection membership edges | 1115 | 1115 | unchanged |
| Shows without collection membership | 381 | 381 | unchanged |
| Actionable eligible candidates | 106 | 106 | unchanged |
| Strict computed source shows / edges | 164/283 | 170/296 | +6 / +13 |

The profile queue falls from 11 eligible records without a curated profile to zero. Imported records remain intentionally outside this editorial profile workflow.

## 7. Strict computed-similarity qualification

The public computed policy remains unchanged: score at least 20; pair, source, and target metadata coverage at least 0.65; at least three metadata dimensions; at least two anchor dimensions; at least two specific discovery dimensions; at least two explanation reasons; and a maximum of two public computed matches per source. Authored links and curated similarity evidence are excluded from this computation.

The current strict snapshot contains 170 source shows and 296 edges, compared with 164 source shows and 283 edges after Batch 22. The selected-source bounded check returned:

- Earth Eclipsed → Solar (22.8) and The Waystation (21.6).
- Paralyzed → End of All Hope (29.1) and The Magnus Protocol (24.0).
- End of All Hope → Paralyzed (29.1) and Crystal Blue (27.9).
- Archive 81 → How I Died (22.9) and Ghost Wax (21.6).
- The Strange Case of Starship Iris → Marsfall (21.6) and The Bright Sessions (21.6).
- The Lovecraft Investigations → Ghost Wax (22.9) and Borrasca (22.2).
- The Black Tapes → Alice Isn't Dead (22.6) and Spines (22.4).
- Janus Descending → Red Frontier (22.0) and Forest 404 (20.7).
- COPPERHEART → End of All Hope (23.8) and Marsfall (23.6).
- Mage In The Machine → SCP Archives (21.3) and Campfire Radio Theater (20.7).
- Midnight Radio did not return a selected strict match in this bounded check.

These remain computed archive matches, not authored editorial recommendations; none were written into `similarTo`.

## 8. Graph and collection health

The post-build collection-candidate report contains 1,115 materialized membership edges, 371 shows with membership, 381 without membership, and 8,089 candidate edges across 333 unique shows. It reports no richly connected uncollected records in the selected top band, zero invalid collection references, and no near-duplicate collection pair. The low-membership threshold remains seven; the collection-candidate report remains a review signal and no automatic memberships were accepted.

The post-build similarity report contains 447 authored links with 447 written reasons. Signal coverage is entity 266, genre 752, format 749, tone 235, theme 235, tag 235, best-for 235, voice style 231, narrative focus 232, intensity 232, commitment 226, release profile 283, shared collection 235, episode length 748, catalog length 751, and rating profile 27 out of 752 published records. The diagnostic scorer returned 189,694 candidate results with a 7.5–67.1 score range, 10.56 average, and 9.9 median; 2 sparse, 516 medium, and 234 enriched records. Candidate coverage remained 752/752 at least one, 752/752 at least three, 750/752 at least five, and 750/752 at least eight; candidate-count statistics were 3 minimum / 248 median / 485 maximum / 252.25 average. These diagnostics use the existing policy and are distinct from the stricter 170-source / 296-edge public computed gate above.

The entity graph remains at 132 public entities, 318 relationship records, and 266 linked shows; 486 shows have no entity relationship. No invalid or unresolved entity links were introduced, and the existing 43 type/role divergence warnings remain. All 1,115 materialized collection memberships resolve to published shows, and all 46 non-empty collections retain complete reasons.

The catalog report remains at Gate B complete, zero blocking errors, six missing RSS fields, 25 documented research-gap records, zero actionable RSS gaps, zero editorial gaps, zero taxonomy errors, and clean generated-output drift. The weak-collection-coverage measure remains 502; this is broader than the 381 shows with no collection membership used above.

This batch completes the current evidence-backed curated-profile queue without altering the factual surface or authored recommendation graph. The remaining 381 uncollected shows, 486-show deliberate entity-research queue, 1 editorial rating gap, and other source/rating gaps remain meaningful review work; no global stopping condition was reached.

## 9. Rejected or deferred decisions

- No new controlled tags were added; existing factual tags supplied the discovery context needed for these profiles.
- No entity links were added. Exact registry-match candidates remain zero, and deliberate entity research requires source-backed review rather than automatic promotion.
- No collection memberships were added despite the broader collection blind spot; this batch was intentionally scoped to completing the profile queue and did not force unrelated route placements.
- No ratings, reviews, community scores, creator-verification states, factual descriptions, official/listen links, content notes, or lifecycle values were changed.
- No computed strict match was promoted to authored `similarTo`, and no reciprocal authored relationship was created.
- Profile values were chosen from the existing controlled vocabulary and supported by the selected records' format, content, length, and official-source framing. Remaining non-profile gaps were deferred to their relevant evidence workflows.
- Similarity weights, thresholds, sparse policy, collection rules, public explanations, and generated-catalog schemas were not changed.

## 10. Validation and worktree boundary

Commands run after the canonical source edits:

- `npm run build:catalog` — passed; built artifacts for 752 shows, 46 collections, and 7 review companions.
- `npm run validate:data` — passed with 0 integrity errors across 752 shows, 46 collections, 132 entities, and 7 review companions. The existing 43 entity type/role divergence warnings remain; no invalid or unresolved entity links were introduced.
- `npm run report:discovery-quality` — passed; 235 curated profiles, 235 shows with three or more useful facet groups, 371 shows with collections, 250 with at least two collections, and 106 actionable candidates.
- `npm run report:similarity` — passed; 447 authored links with 447 written reasons, 189,694 diagnostic candidates, and the unchanged similarity policy.
- `npm run report:collection-candidates` — passed; 1,115 membership edges, 381 shows without membership, 8,089 candidate edges across 333 shows, and 0 invalid references.
- `npm run report:entity-graph` — passed; 132 public entities, 318 relationship records, 266 linked shows, and 486 zero-relationship shows. No entity links were added.
- `npm run report:catalog` — passed; Gate B complete, 0 blocking errors, 0 actionable RSS gaps, 25 documented research-gap records, 0 editorial gaps, 0 taxonomy errors, and generated-output drift clean.
- Read-only profile integrity check — passed; 11 selected records, all four controlled profile values present, and no errors.
- `git diff --check` — passed after the QA report was added.
- Focused catalog/discovery/similarity/candidate tests — passed: 43/43.
- A bounded read-only computed-match comparison confirmed 170 strict source shows / 296 edges and the selected-source results above without changing scorer or policy files.

The worktree retains prior Phase 3 changes plus eleven Batch 23 show-source profile updates, expected rebuilt catalog/search/status artifacts, and this QA report. No commit, push, deployment, or publication was performed. The curated profile queue is complete, but the collection and entity evidence queues remain material, so no global stopping condition was reached.
