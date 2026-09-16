# Phase 3 Batch 3 QA — Discovery graph breadth and balance

Date: 2026-09-16  
Scope: ten indexed-only published shows selected after a combined Batch 1 and Batch 2 graph analysis  
Status: source and generated catalog updated locally; not deployed or published

## Scope and method

Batch 3 was selected to change the shape of the discovery graph rather than repeat the easiest high-yield enrichment pattern. The selection analysis combined the post-Batch 1 and post-Batch 2 catalog snapshots, authored-similarity graph, strict public-computed gate, collection membership, discovery profiles, format/genre coverage, and entity-hub connectivity.

`catalog-src/` remained authoritative. The generated catalog was rebuilt with `npm run build:catalog` so the existing similarity and discovery reports could evaluate the new data. Static pages were not broadly regenerated and nothing was deployed.

An unrelated worktree edit changes The Desert Skies Archive Rating from 6 to 7. It is outside the Batch 3 source set, was preserved, and is excluded from the batch deltas below; generated artifacts reflect the current worktree.

Tones, themes, best-for routes, profiles, content framing, collection placement, and authored similarity reasons are Echo editorial classifications. They are not creator-supplied ratings or reviews. Factual premise, format, production, runtime, and source framing were checked against the existing objective source packet and the following research anchors. No genre, format, release state, completion state, entity relationship, verification state, Archive Rating, or review was changed as part of Batch 3.

### Research anchors

- [The Red Panda Adventures — Decoder Ring Theatre](https://decoderringtheatre.com/shows/red-panda-adventures/)
- [The Two Princes — official RSS source](https://feeds.megaphone.fm/tp-spot) and [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/the-two-princes/id1464586861)
- [Twilight Histories — official site](https://www.twilighthistories.com/) and [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/twilight-histories/id475159941)
- [The Rats Under Eden — show listing](https://open.spotify.com/show/3WUi7K1jMWgkZh38wZhmLg) and the source RSS already recorded in the catalog
- [The Invenios Expeditions — official site](https://theinveniosexpeditions.com/)
- [Our Fair City — Audacious Machine Creative](https://www.audaciousmachinecreative.com/our-fair-city)
- [Ghostly Thistle — home of The McIlwraith Statements](https://ghostlythistle.com/)
- [The Land Whale Murders — official site](https://www.landwhalepod.com/)
- [Camlann — Tin Can Audio](https://www.tincanaudio.co.uk/camlann)
- [Mayfair Watchers Society — official site](https://mayfairwatchers.com/) and [Apple Podcasts listing](https://podcasts.apple.com/gb/podcast/mayfair-watchers-society/id1646154626)

## 1. Combined Batch 1 and Batch 2 analysis

### What the first 20 enrichments changed

Batch 1 began with the sparser set: a 9.2/17 mean quality score. It added 30 authored outgoing links and moved the selected records from one to 32 materialized collection memberships, a delta of 31. Four of ten selected records met the strict public computed threshold, while all ten gained a public recommendation surface through authored or computed routes.

Batch 2 began with a more moderately enriched set: a 10.8/17 mean quality score. It added nine authored outgoing links and 14 materialized collection memberships. Five of ten selected records met the strict public computed threshold, and all ten gained a public recommendation surface.

The comparison is descriptive rather than causal, but it answers the editorial-efficiency question clearly enough for selection:

| Batch | Starting mean | Ending mean | New authored links | Collection-membership delta | New graph-bearing edges | Strict computed lift | Public-surface lift |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Batch 1 — mostly sparse | 9.2/17 | 14.9/17 | 30 | 31 | 61 | +4/10 | +10/10 |
| Batch 2 — moderately enriched | 10.8/17 | 15.5/17 | 9 | 14 | 23 | +5/10 | +10/10 |

Using new authored links plus changed collection memberships as the comparable graph-bearing change unit, Batch 2 produced more strict qualification and public-surface lift per change. Its quality gain was also larger per graph-bearing change: approximately 0.20 quality points per change versus 0.09 in Batch 1. Batch 1 still produced more total authored breadth and more manual routes. The result supports a mixed strategy: use moderately complete records when a strict computed bridge is plausible, and reserve sparse records for genuinely distinctive territory where a human-authored route is useful even without computed qualification.

### Authored similarity concentration after Batch 2

After Batch 2, the authored graph contained 273 links, 90 source shows, 68 unique targets, and 102 unique endpoint shows. Multi-label counts across endpoint shows exposed a clear concentration pattern:

- Mystery: 40/102 endpoint shows (39.2%) versus 55/752 catalog shows (7.3%).
- Thriller: 35/102 (34.3%) versus 51/752 (6.8%).
- Horror: 35/102 (34.3%) versus 67/752 (8.9%).
- Adventure: 12/102 (11.8%) versus 18/752 (2.4%).
- Fantasy: 12/102 (11.8%) versus 26/752 (3.5%).
- Sci-fi: 47/102 (46.1%) versus 289/752 (38.4%): only moderately overrepresented because the catalog base is large.
- Comedy: 21/102 (20.6%) versus 186/752 (24.7%), and drama: 69/102 (67.6%) versus 696/752 (92.6%), were not overrepresented relative to their catalog bases.

Format concentration was stronger:

- Serialized: 94/102 endpoint shows (92.2%) versus 489/752 catalog shows (65.0%).
- Full-cast: 70/102 (68.6%) versus 105/752 (14.0%).
- Narrated: 16/102 (15.7%) versus 25/752 (3.3%).
- Anthology: 7/102 (6.9%) versus 17/752 (2.3%).
- Episodic: only 11/102 (10.8%) versus 270/752 (35.9%).

The graph was therefore not simply “too sci-fi.” It was especially concentrated around serialized, full-cast, mystery/thriller/horror adjacency. Episodic and anthology records were the most obvious format-shaped opportunity, while fantasy and adventure had useful but narrow representation.

Themes also clustered around sci-fi, mystery, survival, thriller, conspiracy, identity, isolation, found family, memory, and space. These are useful signals, but the theme field remains curated free text rather than a closed taxonomy, so theme counts are diagnostic rather than a reason to manufacture new labels.

### Collection hubs after Batch 2

The densest hubs were:

- Rule-driven lifecycle/genre hubs: Ongoing Sci-Fi 76, Episodic Comedy 71, Completed Drama 63, Ongoing Comedy 52, Completed Sci-Fi 29, and Ongoing Horror 26.
- Curated listening hubs: Late-night tension 25, Headphones-on immersion 22, Serious sci-fi 21, Completed shows 20, Worldbuilding deep dives 20, and Survival pressure 17.

These are useful navigation hubs, but they were already dense enough that Batch 3 did not treat membership count as a target. The new placements were made only where a collection’s listening intent matched a specific source-backed premise.

### Weakly connected catalog areas

After Batch 2, the eligible-record route view identified the following deserts:

- Episodic shows: 10/55 eligible records had a public surface (18.2%); only 11/55 had authored outgoing routes (20.0%).
- Anthology shows: 3/17 had a public surface (17.6%).
- Drama was the largest weakly surfaced genre: 61/184 eligible records had a public surface (33.2%).
- Fantasy: 9/26 had a public surface (34.6%). Sci-fi: 44/102 (43.1%).
- The broader catalog had 449 published shows without a collection and 486 without a typed entity relationship. The latter remains a separate factual reconciliation queue, not a reason to infer new public entities.

### Existing entity hubs with poor discovery connectivity

The entity graph was not changed during Batch 3. Its weakest multi-show hubs after Batch 2 included:

| Entity hub | Shows | Shows with authored connectivity | Collection-covered shows |
| --- | ---: | ---: | ---: |
| Realm | 21 | 5 (23.8%) | 8 (38.1%) |
| Bloody FM | 17 | 5 (29.4%) | 11 (64.7%) |
| iHeartPodcasts | 13 | 2 (15.4%) | 2 (15.4%) |
| QCODE | 10 | 4 (40.0%) | 5 (50.0%) |
| Rusty Quill | 8 | 2 (25.0%) | 4 (50.0%) |
| Tin Can Audio | 5 | 0 (0.0%) | 2 (40.0%) |
| Faustian Nonsense | 6 | 0 (0.0%) | 1 (16.7%) |
| GZM Shows | 6 | 0 (0.0%) | 2 (33.3%) |
| Good Story Guild | 4 | 0 (0.0%) | 1 (25.0%) |

This made `camlann`, `mayfair-watchers-society`, and `our-fair-city` useful candidates for different reasons: they could connect records inside under-connected hubs while also addressing format or narrative deserts. No entity relationship was added merely to improve the counts.

### Strict computed-similarity blockers after the first 20

Across the 11 selected records that remained unqualified after Batches 1 and 2, the strongest clean near-match showed this pattern:

- The score floor was the most common blocker: 8/11 rows had a best clean candidate below 20. This included six Batch 1 records and Godfrey plus The Walk from Batch 2.
- Pair metadata coverage, target-record coverage, and the two-specific-dimensions requirement were each a blocker in four rows when the B1 Viridian case is counted alongside the three high-scoring B2 cases.
- Batch 2’s distinctive failure mode was a candidate at or above 20 that still failed the evidence floor: The Hidden People, Not Quite Dead, and The Orbiting Human Circus each had high raw candidates with pair/target coverage around 0.614 and only one specific discovery dimension.
- No strongest near-match failed because of missing explanation reasons or anchor dimensions. The recurring issue was evidence composition and score, not missing prose.

This is why Batch 3 includes both moderately complete near-threshold candidates and sparse records whose value is a new format, setting, production shape, or audience route. It does not assume that all ten should qualify under the computed policy.

## 2. Batch 3 selection

The ten records were selected for different graph functions. The set intentionally includes seven episodic formats, two anthology formats, one narrated format, three fantasy-labeled records, two adventure-labeled records, a musical outlier, and several records tied to under-connected production hubs. Several records overlap more than one category; the point is route diversity, not a new taxonomy.

| Record | Discovery function | Source-backed anchor | Collection decision | Authored route decision |
| --- | --- | --- | --- | --- |
| [The Red Panda Adventures](../../catalog-src/shows/the-red-panda-adventures.json) | Long-running pulp adventure; adds episodic/full-cast breadth and an adventure route | 1930s Toronto, classic radio/pulp framing, The Red Panda and The Flying Squirrel | Best for long walks | Victoriocity; The Thrilling Adventure Hour |
| [The Two Princes](../../catalog-src/shows/the-two-princes.json) | Compact relationship-led fantasy and queer/found-bond route | Rupert and Amir’s royal romance against an end-of-world threat | Start here; Fantasy detours and hidden worlds | The Penumbra Podcast |
| [Twilight Histories](../../catalog-src/shows/twilight-histories.json) | Episodic anthology bridge for alternate history, time travel, and immersive soundscape listening | Each episode visits a different alternate-history world with full soundscapes | Time-bent and weird | Ars Paradoxica; The Big Loop |
| [The Rats Under Eden](../../catalog-src/shows/the-rats-under-eden-an-audio-drama-musical.json) | Short musical/dystopian route, distinct from the standard horror and space-survival cluster | A musical podcast about resistance to the oppressive regime of Eden City | Quick first listens | The Deca Tapes |
| [The Invenios Expeditions](../../catalog-src/shows/the-invenios-expeditions.json) | Ocean/adventure bridge into a weakly connected Leviathan hub; close to strict computed qualification | Globe-trotting treasure-hunting vessel and direct Leviathan Chronicles saga continuation | No collection added; no existing curated route was specific enough and runtime remains unverified | The Leviathan Chronicles; Tumanbay |
| [Our Fair City](../../catalog-src/shows/our-fair-city.json) | Episodic post-apocalyptic workplace/community route in an Audacious Machine hub | Dystopian future Hartford, subterranean city, and HartLife governance | Ensemble chaos with heart; existing Ongoing Sci-Fi rule membership retained | World Gone Wrong |
| [The McIlwraith Statements](../../catalog-src/shows/the-antique-shop.json) | Narrated episodic statement/investigation route; retains the catalog’s existing ID even though the title is McIlwraith Statements | Sarah McIlwraith recounts the IPP study and searches for the truth behind its disaster | No collection added; no current collection intent was exact enough | The Magnus Archives |
| [The Land Whale Murders](../../catalog-src/shows/the-land-whale-murders.json) | Period comedy-mystery bridge that broadens comedy without relying on a space setting | Gilded Age satire of birders, murders, and confectionery capers | Comedy with a mystery | Victoriocity; Mockery Manor |
| [Camlann](../../catalog-src/shows/camlann.json) | Fantasy/survival bridge for an under-connected Tin Can Audio hub; adds episodic/full-cast breadth | Post-apocalyptic Wales, Arthurian folklore, three survivors, and a dog | Fantasy detours and hidden worlds; Survival pressure | The Two Princes; The Hidden People |
| [Mayfair Watchers Society](../../catalog-src/shows/mayfair-watchers-society.json) | Full-cast anthology/community-creature route for a weakly connected Bloody FM hub | Mayfair community framing and Trevor Henderson creatures | No manual anthology-horror membership; it is rule-based and the factual genre remains drama | Wrong Station; The McIlwraith Statements |

### Enrichment decisions

The records received source-backed editorial discovery packets without factual rewrites:

- The Red Panda Adventures: cinematic/funny/tense; pulp justice, masked identity, partnership; long walks, binge listening, headphones on; primarily acted, plot-driven, medium intensity, deep-dive commitment.
- The Two Princes: warm/hopeful/tense; queer love, found family, duty and identity, end-of-world stakes; easy entry, binge listening, warm weird; retained primarily acted and added character-driven, medium intensity, medium commitment.
- Twilight Histories: cinematic/weird/tense; alternate histories, time travel, parallel worlds, historical divergence; headphones on, worldbuilding, long walks; mixed voice style, balanced focus, variable intensity, deep-dive commitment.
- The Rats Under Eden: dark/cinematic/tense; religious power, resistance, oppression; short under five hours, headphones on, late night; retained primarily acted, plot-driven, medium intensity, and added short commitment.
- The Invenios Expeditions: cinematic/tense/hopeful; retained Treasure hunting and Ocean exploration, adding crew loyalty and global conspiracy; headphones on, binge listening, worldbuilding; primarily acted, plot-driven, high intensity. Commitment was left unresolved because the source record explicitly says runtime is unverified.
- Our Fair City: funny/weird/bleak; workplace survival, community under pressure, post-apocalyptic rebuilding, institutional control; long walks, binge listening, worldbuilding; primarily acted, balanced, variable intensity, deep-dive commitment.
- The McIlwraith Statements: bleak/weird/melancholic; ghosts and hauntings, investigation, memory and truth; headphones on, late night, binge listening; primarily narrated, character-driven, medium intensity, medium commitment.
- The Land Whale Murders: funny/weird/warm; historical mystery, birding and obsession, murder and spectacle, confectionery capers; binge listening and warm weird; primarily acted, plot-driven, medium intensity, medium commitment.
- Camlann: dark/hopeful/cinematic; Arthurian folklore, found family, survival after collapse, folkloric monsters; headphones on, worldbuilding, binge listening; primarily acted, character-driven, high intensity, short commitment.
- Mayfair Watchers Society: dark/weird/tense; retained Small-town secrets and Urban legends, adding creature folklore and community under pressure; late night, headphones on, binge listening; primarily acted, balanced, high intensity, deep-dive commitment.

All ten received specific authored reasons. No similarity-link or collection count was used as an acceptance quota: three records intentionally received no collection membership, and each authored edge was retained only where the reason named a meaningful premise, form, setting, or listening-function bridge.

## 3. Before/after metrics

The baseline is the generated catalog after Batch 2. Quality is the existing 17-dimension discovery-quality score. Useful facets are tones, tags, best-for routes, and similar-show links. “Public surface” means the renderer has either an outgoing authored route or at least one strict public computed route.

| Show | Quality | Useful facets | Profile keys | Collections | Authored out / in | Strict public computed | Public surface |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| The Red Panda Adventures | 9 → 15 | 1 → 4 | 0 → 4 | 0 → 1 | 0/0 → 2/0 | 0 → 0 | No → Yes |
| The Two Princes | 9 → 14 | 1 → 4 | 1 → 4 | 0 → 2 | 0/0 → 1/1 | 0 → 0 | No → Yes |
| Twilight Histories | 9 → 15 | 1 → 4 | 0 → 4 | 0 → 1 | 0/0 → 2/0 | 0 → 0 | No → Yes |
| The Rats Under Eden | 9 → 14 | 1 → 4 | 3 → 4 | 0 → 1 | 0/0 → 1/0 | 0 → 0 | No → Yes |
| The Invenios Expeditions | 11 → 15 | 1 → 4 | 0 → 3 | 0 → 0 | 0/0 → 2/0 | 0 → 0 | No → Yes |
| Our Fair City | 11 → 16 | 1 → 4 | 0 → 4 | 1 → 2 | 0/0 → 1/0 | 0 → 1 | No → Yes |
| The McIlwraith Statements | 10 → 15 | 1 → 4 | 0 → 4 | 0 → 0 | 0/0 → 1/1 | 0 → 0 | No → Yes |
| The Land Whale Murders | 9 → 15 | 1 → 4 | 0 → 4 | 0 → 1 | 0/0 → 2/0 | 0 → 0 | No → Yes |
| Camlann | 10 → 16 | 1 → 4 | 0 → 4 | 0 → 2 | 0/0 → 2/0 | 0 → 0 | No → Yes |
| Mayfair Watchers Society | 11 → 15 | 1 → 4 | 0 → 4 | 0 → 0 | 0/0 → 2/0 | 0 → 0 | No → Yes |
| **Batch total / mean** | **9.8 → 15.0** | **10/10 at 4 after** | **2/10 → 10/10 with any profile** | **1 → 10 materialized memberships across 7 shows** | **0 → 16 outgoing** | **0/10 → 1/10** | **0/10 → 10/10** |

### Batch-level changes

| Measurement | Before | After | Change |
| --- | ---: | ---: | ---: |
| Mean discovery-quality score | 9.8/17 | 15.0/17 | +5.2 |
| Shows with three or more useful facet groups | 0/10 | 10/10 | +10 |
| Tone coverage | 0/10 | 10/10 | +10 |
| Theme or content-note coverage | 2/10 | 10/10 | +8 |
| Best-for coverage | 0/10 | 10/10 | +10 |
| Any curated discovery profile | 2/10 | 10/10 | +8 |
| All four discovery-profile keys | 0/10 | 8/10 | +8 |
| Shows with at least one collection | 1/10 | 7/10 | +6 |
| Shows with at least two collections | 0/10 | 3/10 | +3 |
| Materialized memberships across selected shows | 1 | 10 | +9 |
| Authored outgoing links from selected shows | 0 | 16 | +16 |
| Shows meeting the strict public computed threshold | 0/10 | 1/10 | +1 |
| Shows with a public recommendation surface | 0/10 | 10/10 | +10 |

The selected set was intentionally uneven. The Invenios Expeditions, The McIlwraith Statements, and Mayfair Watchers Society did not receive a collection because no existing collection intent was specific enough. Our Fair City’s Ongoing Sci-Fi membership is rule-derived and was not manually added.

## 4. Computed-similarity qualification analysis

The public policy was unchanged: score at least 20; pair, source, and target metadata coverage at least 0.65; at least three metadata dimensions; at least two anchor dimensions; at least two specific discovery dimensions; and at least two explanation reasons. Authored targets and curated evidence remain excluded from computed qualification.

The table reports the strongest clean non-authored near-match after enrichment. “Pass” means the requirement passed for that candidate; the listed failures are exact policy failures, not editorial judgments.

| Show | Strict result | Strongest clean near-match | Exact remaining failures |
| --- | --- | --- | --- |
| The Red Panda Adventures | Unqualified | Marsfall — 14.5 | Overall score 14.5 < 20. Pair/source/target coverage, dimensions, anchors, specific dimensions, and reasons pass. |
| The Two Princes | Unqualified | The Orbiting Human Circus — 16.8 | Overall score 16.8 < 20. All other listed requirements pass. |
| Twilight Histories | Unqualified | Midnight Burger — 15.8 | Overall score 15.8 < 20. All other listed requirements pass. |
| The Rats Under Eden | Unqualified | The Polybius Conspiracy — 14.1 | Overall score 14.1 < 20. All other listed requirements pass. |
| The Invenios Expeditions | Unqualified | The Rapscallion Agency — 20.3 | Pair coverage 0.629 < 0.65 and target coverage 0.629 < 0.65. Score, dimensions, anchors, specific dimensions, and reasons pass. |
| Our Fair City | Qualified | Unwell — 21.5 | No remaining failure. This is a strict computed route; the authored World Gone Wrong route remains separate. |
| The McIlwraith Statements | Unqualified | I Am in Eskew — 16.2 | Overall score 16.2 < 20. All other listed requirements pass. |
| The Land Whale Murders | Unqualified | the Dead Letter Office of Somewhere, Ohio — 19.1 | Overall score 19.1 < 20. All other listed requirements pass. |
| Camlann | Unqualified | Land's End: A Shepherd's Tale — 18.6 | Overall score 18.6 < 20; pair coverage 0.571 < 0.65; target coverage 0.571 < 0.65; specific dimensions 1 < 2. Metadata dimensions, anchors, and reasons pass. |
| Mayfair Watchers Society | Unqualified | Shelterwood — 18.0 | Overall score 18.0 < 20. All other listed requirements pass. |

The five records whose best candidate remains below the score floor were not padded with generic themes or forced into public computed results. The Invenios Expeditions is the useful near-threshold case: its score clears 20, but the target record does not provide enough comparable metadata for the pair/target coverage floor. Camlann shows the combined structural-and-specific evidence failure that the first 20 records also surfaced.

## 5. Rejected enrichment decisions

- No new controlled tags were added. Existing tags already express the primary factual hooks, and adding synonyms would have increased taxonomy noise.
- No entity links were created. The hub strategy was used to select records, not to infer relationships from creator strings or production proximity.
- No rule-based collection was edited manually. In particular, Mayfair Watchers Society was not inserted into Anthology Horror because that collection is rule-derived and its factual genre remains drama.
- The Red Panda Adventures was not added to an episodic-mystery collection merely because its source tags include Mystery; its catalog genre remains drama/adventure and the selected route is pulp adventure.
- The Invenios Expeditions was left outside collections because there is no precise existing ocean/adventure collection intent and its runtime is explicitly unverified. It also received no commitment classification.
- The McIlwraith Statements was left outside collections because no existing collection exactly describes narrated paranormal statements and the record’s existing ID/title mismatch was preserved rather than cleaned up opportunistically.
- Mayfair Watchers Society was left outside curated collections even though it has late-night/headphones best-for signals; those hubs were already dense, and no more specific collection was justified.
- Our Fair City retained its existing rule-derived Ongoing Sci-Fi membership. Only Ensemble chaos with heart was manually added.
- No new content notes were invented. Mayfair’s existing Horror note was retained; the other records did not expose a sufficiently specific spoiler-free warning set for this pass.
- No Archive Ratings, Archive Takes, reviews, listener ratings, community content, or creator verification claims were added.
- No public similarity threshold, scoring weight, taxonomy rule, or explanation policy was changed.

## Discovery routes unlocked

- Best for long walks → The Red Panda Adventures → authored Victoriocity / The Thrilling Adventure Hour.
- Start here → The Two Princes → authored The Penumbra Podcast; Camlann now points back into the same fantasy neighborhood from Survival pressure.
- Time-bent and weird → Twilight Histories → Ars Paradoxica / The Big Loop, adding an episodic anthology branch.
- Quick first listens → The Rats Under Eden → The Deca Tapes, adding a musical short-form dystopian branch.
- The Invenios Expeditions → The Leviathan Chronicles / Tumanbay, connecting an ocean-adventure record into a weakly connected production hub.
- Ensemble chaos with heart → Our Fair City → World Gone Wrong, adding an episodic workplace/community route and a strict computed path to Unwell.
- The McIlwraith Statements → The Magnus Archives; Mayfair Watchers Society also points to McIlwraith to connect anthology creature stories with narrated statements.
- Comedy with a mystery → The Land Whale Murders → Victoriocity / Mockery Manor, adding a Gilded Age route outside the dominant horror cluster.
- Fantasy detours and hidden worlds plus Survival pressure → Camlann → The Two Princes / The Hidden People.
- Mayfair Watchers Society → Wrong Station / The McIlwraith Statements, creating a full-cast local-creature anthology bridge without forcing a rule-based collection membership.

These are directional authored relationships. No reciprocal link was added for symmetry, and strict computed routes remain separately labeled by the renderer.

## 6. Discovery graph health after 30 enriched records

The following catalog-wide snapshots use the same generated-artifact measurement for each stage. “Public recommendation surface” includes authored outgoing routes and strict computed routes; strict computed sources and edges are shown separately so authored and computed discovery are not conflated.

| Metric | After Batch 1 | After Batch 2 | After Batch 3 |
| --- | ---: | ---: | ---: |
| Authored similarity links / written reasons | 264 / 264 | 273 / 273 | 289 / 289 |
| Shows with authored outgoing routes | 81 | 90 | 100 |
| Unique authored targets | 62 | 68 | 78 |
| Unique authored endpoint shows | 91 | 102 | 118 |
| Strict computed source shows | 49 | 53 | 55 |
| Strict computed recommendation edges | 80 | 91 | 93 |
| Public recommendation surface shows | 84/752 (11.2%) | 94/752 (12.5%) | 104/752 (13.8%) |
| Collection membership edges | 718 | 732 | 741 |
| Shows with at least one collection | 299/752 | 303/752 | 309/752 |
| Shows with at least two collections | 139/752 | 143/752 | 146/752 |
| Shows with three or more useful facet groups | 81/752 | 91/752 | 101/752 |
| Shows with a curated discovery profile | 58/752 | 66/752 | 74/752 |

### Authored similarity distribution after Batch 3

The authored endpoint set is now 118 unique shows. Counts are multi-label: one endpoint can contribute to more than one genre or format. The relative column compares endpoint share with catalog share; it is a concentration signal, not a quality score.

#### Genre

| Genre | Authored endpoints | Endpoint share | Catalog share | Relative concentration |
| --- | ---: | ---: | ---: | ---: |
| Drama | 83 | 70.3% | 92.6% | 0.76x |
| Sci-fi | 56 | 47.5% | 38.4% | 1.24x |
| Mystery | 40 | 33.9% | 7.3% | 4.64x |
| Thriller | 37 | 31.4% | 6.8% | 4.63x |
| Horror | 35 | 29.7% | 8.9% | 3.33x |
| Comedy | 25 | 21.2% | 24.7% | 0.86x |
| Fantasy | 15 | 12.7% | 3.5% | 3.68x |
| Adventure | 14 | 11.9% | 2.4% | 4.95x |
| Supernatural | 7 | 5.9% | 1.3% | 4.46x |

Batch 3 increased fantasy from 12 to 15 endpoints, adventure from 12 to 14, comedy from 21 to 25, and sci-fi from 47 to 56. The important improvement was not eliminating sci-fi; it was adding distinct episodic, anthology, narrated, musical, ocean-adventure, historical-comedy, and folklore routes around it.

#### Format

| Format | Authored endpoints | Endpoint share | Catalog share | Relative concentration |
| --- | ---: | ---: | ---: | ---: |
| Serialized | 101 | 85.6% | 65.0% | 1.32x |
| Full-cast | 76 | 64.4% | 14.2% | 4.53x |
| Episodic | 21 | 17.8% | 35.9% | 0.50x |
| Narrated | 17 | 14.4% | 3.3% | 4.34x |
| Anthology | 10 | 8.5% | 2.3% | 3.75x |
| Limited-series | 7 | 5.9% | 1.2% | 4.96x |
| Long-running | 3 | 2.5% | 0.4% | 6.38x |

Episodic endpoint coverage improved from 11 to 21 shows, but it remains below the catalog’s format share. Anthology improved from seven to ten endpoints and remains small in absolute terms. Full-cast remains heavily represented because many earlier authored routes are in that format; the count is useful, but it should not become a default proxy for quality.

### Most-connected shows

The current authored graph is still led by a small set of established hubs:

| Show | Incoming | Outgoing | Total authored degree |
| --- | ---: | ---: | ---: |
| Midnight Burger | 15 | 4 | 19 |
| The White Vault | 13 | 4 | 17 |
| Archive 81 | 12 | 3 | 15 |
| Ars Paradoxica | 11 | 4 | 15 |
| Oz 9 | 10 | 4 | 14 |
| Desert Skies | 9 | 3 | 12 |
| Solar | 9 | 3 | 12 |
| Malevolent | 8 | 4 | 12 |
| EOS 10 | 8 | 3 | 11 |
| The Waystation | 8 | 3 | 11 |

The top five targets receive 61 of 289 authored links (21.1%); the top ten receive 103 (35.6%). This is still concentrated, but it is not worsening at the top-target level: after Batch 2 the corresponding shares were 60/273 (22.0%) and 102/273 (37.4%). Batch 3 added 16 links and 10 new unique targets, including several targets outside the previous top-target set.

### Most-connected collections

| Collection | Kind | Members |
| --- | --- | ---: |
| Ongoing Sci-Fi | rule-based | 76 |
| Episodic Comedy | rule-based | 71 |
| Completed Drama | rule-based | 63 |
| Ongoing Comedy | rule-based | 52 |
| Completed Sci-Fi | rule-based | 29 |
| Ongoing Horror | rule-based | 26 |
| Late-night tension | curated | 25 |
| Headphones-on immersion | curated | 22 |
| Serious sci-fi | curated | 21 |
| Completed shows | curated | 20 |
| Worldbuilding deep dives | curated | 20 |
| Survival pressure | curated | 18 |

The top six are largely rule-driven. Among curated collections, late-night, headphones, serious sci-fi, completed shows, worldbuilding, and survival remain the main hubs. Batch 3 added only nine membership edges and did not inflate the broadest hubs indiscriminately.

### Major remaining discovery deserts

After Batch 3:

- 443/752 published shows still have no collection membership.
- 486/752 still have no typed entity relationship; this is a factual/source-reconciliation problem, not an editorial similarity problem.
- Of the 235 enrichment-eligible shows, 161 still lack any curated discovery profile. The 517 imported/factual-only shows remain intentionally outside the editorial queue.
- Episodic shows now have 17/55 eligible records with a public surface (30.9%), but 38 remain outside a public recommendation route.
- Anthology shows have 5/17 with a public surface (29.4%).
- Drama has 70/184 eligible records with a public surface (38.0%), leaving the largest genre-shaped desert by absolute count.
- Fantasy has 12/26 surfaced (46.2%), and sci-fi has 49/102 (48.0%); both improved in breadth but still have substantial unconnected pockets.
- The most concerning entity-hub deserts remain Faustian Nonsense (0/6 authored), GZM Shows (0/6), Good Story Guild (0/4), iHeartPodcasts (2/13), Realm (5/21), and Rusty Quill (2/8). Tin Can Audio improved to 1/5 through Camlann, and Bloody FM improved to 6/17 through Mayfair, but neither is broadly connected.

### Signs of clustering or recommendation monoculture

There is a real but bounded monoculture risk:

- Mystery, thriller, horror, adventure, and fantasy remain overrepresented among authored endpoints relative to their catalog bases.
- Serialized and full-cast records remain dominant, while episodic records are still under-connected.
- Midnight Burger, The White Vault, Archive 81, Ars Paradoxica, and Oz 9 remain the most common authored destinations.

There is not yet evidence of a new top-target concentration spike caused by Batch 3. The top-five and top-ten shares fell slightly, and the endpoint set grew from 102 to 118. The more important remaining risk is route sameness below the top-target statistics: many different shows still enter discovery through the same late-night, full-cast, serialized, horror/mystery shape.

### Similarity-policy and taxonomy questions to investigate later

The first 30 enriched records suggest questions, not immediate policy changes:

1. Should future experiments test whether a strict computed match needs at least one discovery-specific signal from both records, rather than allowing structural anchors and one-sided metadata to carry a near-match?
2. Should the score model distinguish “same production form” from “same listener territory” more explicitly, especially for the overrepresented full-cast/serialized cluster?
3. Would a controlled theme vocabulary or alias layer reduce free-text drift among alternate-history, community-pressure, found-family, survival, folklore, and investigation signals without flattening useful editorial specificity?
4. Should episodic, anthology, narrated, musical, and interactive forms receive clearer taxonomy or collection affordances before additional enrichment is attempted?
5. Should entity-hub connectivity be reported as context only, or should future editorial tooling expose hub deserts as a separate bridge-building queue?

No similarity threshold, score weight, public gate, collection rule, or theme taxonomy was changed in this batch. These are follow-up investigations only.

## 7. Validation

Commands run from the repository root:

- `npm run build:catalog` — passed; built artifacts for 752 shows, 46 collections, and 7 review companions.
- `npm run validate:data` — passed with 0 content-integrity errors across 752 shows, 46 collections, 132 entities, and 7 review companions. The existing 43 entity type/relationship-role warnings remain.
- `npm run report:discovery-quality` — passed; final report shows 309 shows with a collection, 101 with at least three useful facet groups, 74 curated discovery profiles, and 25 documented Phase 2 research-gap records.
- `npm run report:similarity` — passed; final report shows 289 authored links/reasons, 108 theme signals, 102 tone signals, 101 `bestFor` signals, 65 voice-style signals, 68 narrative-focus signals, 109 intensity signals, and 56 commitment signals.
- `npm run report:collection-candidates -- --limit 8` — passed; final report shows 741 materialized membership edges, 443 shows without membership, no invalid collection references, and no strong near-duplicate collection pairs.
- `npm run report:entity-graph` — passed; no invalid, unresolved, duplicate, or non-public entity relationships; the existing type/role divergences remain review signals.
- `npm run report:catalog` — passed; missing similarity reasons 0, Phase 2 complete, blocking errors 0, taxonomy unknown/non-approved tags 0, generated drift clean.
- `npm run test:tools` — completed with 81 passing tests, 2 known environment-sensitive failures, and 3 Restic-dependent skips. The failures are the macOS `stat -c` offsite-freshness check and a deployment-script regression expecting `/usr/bin/node`; no enrichment-specific test failure was reported.
- `npm run check:structure` — completed with the repository’s existing soft-limit warnings for large shared files and referenced cover assets; no new structure-specific error was reported.
- `git diff --check` — passed.

No deployment, publication, threshold change, or broad page regeneration was performed.
