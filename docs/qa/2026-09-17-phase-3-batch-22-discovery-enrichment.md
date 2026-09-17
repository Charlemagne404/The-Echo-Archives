# Phase 3 Batch 22 — Discovery Enrichment QA

Date: 2026-09-17  
Scope: ten published, enrichment-eligible show records receiving curated discovery profiles  
Status: local source and generated-catalog validation only; not committed, deployed, or published

## 1. Scope and guardrails

Batch 22 continues the sequential Phase 3 discovery-enrichment work after Batch 21. The post-Batch 21 graph had 752 published shows, 235 enrichment-eligible records, 517 imported/factual-only records, 7 editorial records, 214 curated discovery profiles, and 21 eligible records without a profile. All 235 eligible records already carried tones, tags, best-for routes, and authored similar-show links, so this batch continues the remaining profile queue rather than padding complete facet groups.

The selected records deliberately span different listening routes: an epistolary ghost story, a psychological thriller adaptation, a two-person time-travel session, environmental fiction paired with talks and soundscapes, communications-log science fiction, anthology oral histories, an audio-diary serial, classic radio adventure, a space sitcom, and a research-station mystery. The packet includes several science-fiction records because the queue is concentrated there, but it is not a single-format or horror-only run.

The existing source-of-truth and safety rules were preserved:

- `catalog-src/shows/` remains authoritative; generated `data/` and `docs/generated/` files were rebuilt normally.
- Each profile was added only where the existing format, content, length, description, and official or publisher source supported the four controlled dimensions: voice style, narrative focus, intensity, and commitment.
- No imported/factual-only record was edited. No ratings, reviews, community scores, creator-verification claims, factual metadata, or lifecycle corrections were added.
- No collection source or collection membership was changed in this batch. Existing collection coverage and authored collection reasons were retained.
- The similarity scorer, weights, thresholds, public computed-match gate, and explanation policy were not changed. Computed candidates were not promoted into authored relationships.
- No raw creator, network, publisher, provider, or broadcaster string was promoted to a new typed entity relationship. Existing entity links and provenance were not rewritten.
- The profile values are bounded editorial discovery classifications, not claims about awards, ratings, verification, completion, or objective credit ownership.

## 2. Selection analysis

The pre-Batch 22 graph contained 752 published shows, 235 enrichment-eligible records, 371 shows with at least one collection, 381 without collection membership, 106 actionable candidates, and 21 eligible records without a curated `discovery` profile. The queue was reviewed against current format, content, length, existing facets, and source readiness. The selected records were chosen to improve profile signal coverage across distinct listening routes while leaving unresolved collection and entity work for evidence review.

| Record | Discovery function | Why this batch included it |
| --- | --- | --- |
| [Mabel](../../catalog-src/shows/mabel.json) | Narrated, character-led supernatural serial | The official show framing centers ghosts, family secrets, strange houses, and missed connections; the local record supports a long narrated serial route. |
| [Borrasca](../../catalog-src/shows/borrasca.json) | Full-cast psychological thriller adaptation | QCODE's source framing and the official listing support an acted, high-intensity thriller with a contained two-season route and adult-content context. |
| [Case 63](../../catalog-src/shows/case-63.json) | Two-person time-displacement thriller | The official adaptation materials establish a performed session format, escalating time-travel mystery, and short episode/overall commitment signals. |
| [Forest 404](../../catalog-src/shows/forest-404.json) | Environmental thriller with companion nonfiction | The BBC format pairs a fictional environmental story episode with a talk and soundscape, making a mixed, plot-forward short route useful for discovery. |
| [Moonbase Theta, Out](../../catalog-src/shows/moonbase-theta-out.json) | Communications-log space serial | The official production page establishes the final moonbase shutdown, a five-person crew, and an extended story about isolation, love, humor, and tragedy. |
| [The Program](../../catalog-src/shows/the-program-audio-series.json) | Speculative anthology of performed accounts | The official site presents standalone stories about ordinary people living under a fused Money/State/God system, supporting a mixed, character-led long route. |
| [Girl in Space](../../catalog-src/shows/girl-in-space.json) | Audio-diary science-fiction serial | The official site and press materials establish a young scientist's diary on an abandoned station, its growth into a full cast, and a multi-episode long route. |
| [Flash Gordon and Buck Rogers Radio Adventurers](../../catalog-src/shows/flash-gordon-and-buck-rogers-radio-adventurers.json) | Classic performed radio adventure | The official listing identifies old-time radio science-fiction serials, a performed adventure format, and a bounded 15-episode catalog. |
| [EOS 10](../../catalog-src/shows/eos-10.json) | Character-led space sitcom | The official listing supports an acted comedy built around a space-station crew, alien and medical characters, and a long multi-season catalog. |
| [Red Valley](../../catalog-src/shows/red-valley.json) | Full-cast mystery drama about experimental science | The official site and press materials support a performed mystery, balanced investigation/character route, and substantial multi-season commitment. |

The selection addresses the current profile queue without editing records whose evidence was too thin or whose remaining gaps are primarily entity, collection, or factual-source research questions.

## 3. Evidence anchors checked

These sources supported premise, form, production framing, or listening commitment. They were not used to fabricate ratings, verification, or lifecycle state.

| Record | Source anchor and supported signal |
| --- | --- |
| Mabel | [Official Mabel site](https://mabelpodcast.com/) — ghosts, family secrets, strange houses, and missed connections. |
| Borrasca | [QCODE's official Borrasca page](https://qcodemedia.com/borrasca), [official Apple Podcasts listing](https://podcasts.apple.com/us/podcast/borrasca/id1513640702) — psychological-thriller adaptation framing, adult-content context, and the serialized story route. |
| Case 63 | [Spotify newsroom: Case 63 English adaptation](https://newsroom.spotify.com/2022-10-24/mind-bending-chilean-podcast-gets-english-adaptation-with-case-63-starring-julianne-moore-and-oscar-isaac/), [official Apple Podcasts listing](https://podcasts.apple.com/us/podcast/case-63/id1703294291) — performed psychiatric-session premise, time-travel mystery, and short-form episodes. |
| Forest 404 | [BBC programme page](https://www.bbc.co.uk/programmes/p06tqsg3) and [official Apple Podcasts listing](https://podcasts.apple.com/us/podcast/forest-404/id1458519430) — environmental thriller, companion talks, and soundscapes. |
| Moonbase Theta, Out | [Monkeyman Productions — Moonbase Theta, Out](https://monkeymanproductions.com/moonbase-theta-out/) — final moonbase, five-person crew, shutdown countdown, isolation, love, humor, and tragedy. |
| The Program | [Official The Program site](https://www.programaudioseries.com/) — science-fiction anthology, fused social system, and standalone ordinary-person stories. |
| Girl in Space | [Official Girl in Space site](https://www.girlinspacepodcast.com/) and [official press page](https://www.girlinspacepodcast.com/press/) — abandoned-station audio diary, later full-cast form, 13 episodes plus finale, and episode lengths. |
| Flash Gordon and Buck Rogers Radio Adventurers | [Official Apple Podcasts listing](https://podcasts.apple.com/us/podcast/flash-gordon-and-buck-rogers-radio-adventurers/id1826418314) — old-time radio serials, science-fiction adventure, host framing, and 15-episode route. |
| EOS 10 | [Official Apple Podcasts listing](https://podcasts.apple.com/us/podcast/eos-10/id928069318) — space-station doctors and crew, alien-prince and pirate characters, comedy, five seasons, and 40 episodes. |
| Red Valley | [Official Red Valley site](https://www.redvalleypod.com/) and [official press page](https://www.redvalleypod.com/press.html) — full-cast audio drama, mystery about experimental science, and four-season run. |

## 4. Enrichment decisions

The ten packets use only the controlled profile vocabulary already accepted by the catalog schema:

| Record | Curated discovery profile |
| --- | --- |
| Mabel | Primarily narrated; character-driven; medium intensity; long commitment. The official ghost-and-family framing and narrated serial form support a character-led route with a substantial catalog. |
| Borrasca | Primarily acted; plot-driven; high intensity; medium commitment. The performed thriller adaptation and escalating psychological/supernatural investigation support high pressure within a contained two-season route. |
| Case 63 | Primarily acted; plot-driven; high intensity; short commitment. The two-person session format and increasingly destabilizing time-travel mystery make plot progression and high tension central, while the short episodes keep the route compact. |
| Forest 404 | Mixed; plot-driven; medium intensity; short commitment. Fiction, talks, and soundscapes create a mixed presentation; the environmental story supplies the plot engine and the short episode structure keeps the route approachable. |
| Moonbase Theta, Out | Mixed; character-driven; medium intensity; deep-dive commitment. Communications logs expand into a full-cast story where crew relationships carry the long-form moonbase narrative. |
| The Program | Mixed; character-driven; medium intensity; long commitment. Anthology accounts combine performed and narrated framing, with ordinary people's experiences carrying the speculative premise across a substantial catalog. |
| Girl in Space | Mixed; character-driven; medium intensity; long commitment. The audio diary grows into a full-cast serial, and the abandoned-station premise is carried by the protagonist's isolation, relationships, and gradual reveal. |
| Flash Gordon and Buck Rogers Radio Adventurers | Primarily acted; plot-driven; medium intensity; medium commitment. Classic performed serial adventure is action-forward, while the 15-episode feed remains a bounded route. |
| EOS 10 | Primarily acted; character-driven; low intensity; long commitment. The space-station sitcom is carried by crew chemistry and comic situations across five seasons rather than sustained danger. |
| Red Valley | Primarily acted; balanced; medium intensity; long commitment. The full-cast mystery balances experimental-science investigation with character and relationship development across four seasons. |

No structured content keys, content-warning notes, tags, collections, ratings, similar-show links, or entity links were changed. The only authored source additions are the four profile keys per selected show, plus source-update dates on records whose prior date was older.

## 5. Collection and entity boundary

This batch made no curated collection edits. The current graph still contains 1,115 materialized membership edges, 371 shows with membership, and 381 without membership. The collection-candidate report remains a review aid; no automatic candidate was accepted.

This batch also made no entity edits. The entity graph remains source-backed at 132 public entities, 318 relationship records, and 266 linked shows. Profile work does not promote legacy creator or network strings into typed relationships.

## 6. Before/after metrics

The baseline is the generated catalog immediately after Batch 21, reconstructed from the current source state by removing only the new `discovery` objects for these ten records. Quality uses the existing 17-dimension discovery-quality score. Facet groups are tones, tags, best-for routes, and similar-show links. Profile keys are the four controlled discovery-profile keys. Structured-content counts are object keys, not a claim that each key has equal weight. Collection and authored-similarity counts show the unchanged public catalog surface.

| Show | Quality | Facet groups | Profile keys | Structured content | Content notes | Collections | Authored similar links |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Mabel | 14 → 15 | 4 → 4 | 0 → 4 | 4 → 4 keys | 2 → 2 | 4 → 4 | 3 → 3 |
| Borrasca | 15 → 16 | 4 → 4 | 0 → 4 | 4 → 4 keys | 2 → 2 | 2 → 2 | 3 → 3 |
| Case 63 | 14 → 15 | 4 → 4 | 0 → 4 | 4 → 4 keys | 1 → 1 | 8 → 8 | 3 → 3 |
| Forest 404 | 15 → 16 | 4 → 4 | 0 → 4 | 4 → 4 keys | 1 → 1 | 6 → 6 | 3 → 3 |
| Moonbase Theta, Out | 14 → 15 | 4 → 4 | 0 → 4 | 4 → 4 keys | 1 → 1 | 5 → 5 | 3 → 3 |
| The Program | 14 → 15 | 4 → 4 | 0 → 4 | 4 → 4 keys | 2 → 2 | 5 → 5 | 3 → 3 |
| Girl in Space | 14 → 15 | 4 → 4 | 0 → 4 | 4 → 4 keys | 2 → 2 | 3 → 3 | 3 → 3 |
| Flash Gordon and Buck Rogers Radio Adventurers | 14 → 15 | 4 → 4 | 0 → 4 | 4 → 4 keys | 1 → 1 | 4 → 4 | 3 → 3 |
| EOS 10 | 15 → 16 | 4 → 4 | 0 → 4 | 4 → 4 keys | 1 → 1 | 7 → 7 | 3 → 3 |
| Red Valley | 16 → 17 | 4 → 4 | 0 → 4 | 4 → 4 keys | 5 → 5 | 5 → 5 | 3 → 3 |
| **Batch mean / total** | **14.5 → 15.5** | **40 → 40 facet groups** | **0 → 40 keys** | **40 → 40 keys** | **18 → 18 notes** | **49 → 49 memberships** | **30 → 30** |

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
| Curated discovery profiles | 214/752 | 224/752 | +10 |
| Tone / tag / best-for / similar source coverage | 235/752 each | 235/752 each | unchanged |
| Voice-style signal coverage | 210/752 | 220/752 | +10 |
| Narrative-focus signal coverage | 211/752 | 221/752 | +10 |
| Intensity signal coverage | 232/752 | 232/752 | unchanged; existing `content.intensity` already supplied coverage for these records |
| Commitment signal coverage | 205/752 | 215/752 | +10 |
| Authored similarity links / written reasons | 447/447 | 447/447 | unchanged |
| Collection membership edges | 1115 | 1115 | unchanged |
| Shows without collection membership | 381 | 381 | unchanged |
| Actionable eligible candidates | 106 | 106 | unchanged |
| Strict computed source shows / edges | 156/271 | 164/283 | +8 / +12 |

The profile queue falls from 21 eligible records without a curated profile to 11. The catalog remains intentionally asymmetric: imported records continue to carry factual metadata without editorial discovery fields.

## 7. Strict computed-similarity qualification

The public computed policy remains unchanged: score at least 20; pair, source, and target metadata coverage at least 0.65; at least three metadata dimensions; at least two anchor dimensions; at least two specific discovery dimensions; at least two explanation reasons; and a maximum of two public computed matches per source. Authored links and curated similarity evidence are excluded from this computation.

The current strict snapshot contains 164 source shows and 283 edges, compared with 156 source shows and 271 edges after Batch 21. The selected-source bounded check returned:

- Borrasca → The Burned Photo (30.1) and The Edge of Sleep (29.1).
- Mabel → I Am in Eskew (21.0) and Spines (20.8).
- EOS 10 → MarsCorp (21.1) and Alba Salix, Royal Physician (20.3).
- Moonbase Theta, Out → The Bright Sessions (20.6).
- Red Valley → Mirrors (20.2).
- Case 63, Forest 404, The Program, Girl in Space, and Flash Gordon and Buck Rogers Radio Adventurers did not return a selected strict match in this bounded check.

These remain computed archive matches, not authored editorial recommendations; none were written into `similarTo`.

## 8. Graph and collection health

The post-build collection-candidate report contains 1,115 materialized membership edges, 371 shows with membership, 381 without membership, and 8,078 candidate edges across 333 unique shows. It reports no richly connected uncollected records in the selected top band, zero invalid collection references, and no near-duplicate collection pair. The low-membership threshold remains seven; the collection-candidate report remains a review signal and no automatic memberships were accepted.

The post-build similarity report contains 447 authored links with 447 written reasons. Signal coverage is entity 266, genre 752, format 749, tone 235, theme 235, tag 235, best-for 235, voice style 220, narrative focus 221, intensity 232, commitment 215, release profile 283, shared collection 235, episode length 748, catalog length 751, and rating profile 27 out of 752 published records. The diagnostic scorer returned 189,138 candidate results with a 7.5–67.1 score range, 10.53 average, and 9.9 median; 2 sparse, 516 medium, and 234 enriched records. Candidate coverage remained 752/752 at least one, 752/752 at least three, 750/752 at least five, and 750/752 at least eight; candidate-count statistics were 3 minimum / 248 median / 485 maximum / 251.51 average. These diagnostics use the existing policy and are distinct from the stricter 164-source / 283-edge public computed gate above.

The entity graph remains at 132 public entities, 318 relationship records, and 266 linked shows; 486 shows have no entity relationship. No invalid or unresolved entity links were introduced, and the existing 43 type/role divergence warnings remain. All 1,115 materialized collection memberships resolve to published shows, and all 46 non-empty collections retain complete reasons.

The catalog report remains at Gate B complete, zero blocking errors, six missing RSS fields, 25 documented research-gap records, zero actionable RSS gaps, zero editorial gaps, zero taxonomy errors, and clean generated-output drift. The weak-collection-coverage measure remains 502; this is broader than the 381 shows with no collection membership used above.

This batch improves discovery-profile signal coverage and route explanation for ten established catalog records without altering their factual surface or authored recommendation graph. The remaining 11 profile gaps, 381 uncollected shows, and 486-show deliberate entity-research queue remain meaningful evidence-review work; no stopping condition was reached.

## 9. Rejected or deferred decisions

- No new controlled tags were added; existing factual tags supplied the discovery context needed for these profiles.
- No entity links were added. Exact registry-match candidates remain zero, and deliberate entity research requires source-backed review rather than automatic promotion.
- No collection memberships were added despite the broader collection blind spot; this batch was intentionally scoped to the next profile queue and did not force unrelated route placements.
- No ratings, reviews, community scores, creator-verification states, factual descriptions, official/listen links, content notes, or lifecycle values were changed.
- No computed strict match was promoted to authored `similarTo`, and no reciprocal authored relationship was created.
- Profile values were chosen from the existing controlled vocabulary and supported by the selected records' format, content, length, and official-source framing. Remaining records without comparable evidence were deferred.
- Similarity weights, thresholds, sparse policy, collection rules, public explanations, and generated-catalog schemas were not changed.

## 10. Validation and worktree boundary

Commands run after the canonical source edits:

- `npm run build:catalog` — passed; built artifacts for 752 shows, 46 collections, and 7 review companions.
- `npm run validate:data` — passed with 0 integrity errors across 752 shows, 46 collections, 132 entities, and 7 review companions. The existing 43 entity type/role divergence warnings remain; no invalid or unresolved entity links were introduced.
- `npm run report:discovery-quality` — passed; 224 curated profiles, 235 shows with three or more useful facet groups, 371 shows with collections, 250 with at least two collections, and 106 actionable candidates.
- `npm run report:similarity` — passed; 447 authored links with 447 written reasons, 189,138 diagnostic candidates, and the unchanged similarity policy.
- `npm run report:collection-candidates` — passed; 1,115 membership edges, 381 shows without membership, 8,078 candidate edges across 333 shows, and 0 invalid references.
- `npm run report:entity-graph` — passed; 132 public entities, 318 relationship records, 266 linked shows, and 486 zero-relationship shows. No entity links were added.
- `npm run report:catalog` — passed; Gate B complete, 0 blocking errors, 0 actionable RSS gaps, 25 documented research-gap records, 0 editorial gaps, 0 taxonomy errors, and generated-output drift clean.
- Read-only profile integrity check — passed; 10 selected records, all four controlled profile values present, and no errors.
- `git diff --check` — passed after the QA report was added.
- Focused catalog/discovery/similarity/candidate tests — passed: 43/43.
- A bounded read-only computed-match comparison confirmed 164 strict source shows / 283 edges and the selected-source results above without changing scorer or policy files.

The worktree retains prior Phase 3 changes plus ten Batch 22 show-source profile updates, expected rebuilt catalog/search/status artifacts, and this QA report. No commit, push, deployment, or publication was performed. The queue still contains meaningful evidence-review work, so no stopping condition was reached.
