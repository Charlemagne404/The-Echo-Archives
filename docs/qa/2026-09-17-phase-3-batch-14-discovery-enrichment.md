# Phase 3 Batch 14 — Discovery Enrichment QA

Date: 2026-09-17  
Scope: ten published, enrichment-eligible show records and nine curated collection sources  
Status: local source and generated-catalog validation only; not committed, deployed, or published

## 1. Scope and guardrails

Batch 14 continues the Phase 3 discovery-enrichment sequence after Batch 13. The post-Batch 13 queue contained 140 actionable eligible records. The first seven queue opportunities were dominated by sparse horror and folk-horror records, so this batch combines five anthology/folk/apocalyptic horror routes with Mars survival science fiction, licensed Gotham crime fiction, folklore-led supernatural mystery, alien-contact drama, and found-footage analog horror. The selected set keeps the existing discovery-quality priority order while widening the usable listening routes.

The existing source-of-truth rules were preserved:

- `catalog-src/shows/` and `catalog-src/collections/` remain authoritative; generated `data/` and `docs/generated/` files were rebuilt normally.
- Discovery values were added only where the record, existing objective source metadata, and an official, creator, publisher, provider, broadcaster, or feed source supported a useful classification.
- Every new `similarTo` edge received an explicit directional reason. Reciprocal copying was not used as a substitute for editorial judgment.
- The similarity scorer, public computed-match gate, thresholds, weights, and explanation policy were not changed. Computed candidates were not promoted into authored relationships.
- No raw creator, network, or provider string was promoted to a new typed entity relationship.
- No rating, review, community score, creator-verification claim, factual tag, genre, format, listen link, or lifecycle correction was added.
- Imported/factual-only records were not edited. Existing typed entity relationships and provenance were not rewritten.
- Rule-based collections and existing similarity-collection materialization were not manually changed. Only curated collection sources were extended.
- No content notes were added in this batch. The checked sources did not provide a sufficiently bounded warning set that needed to be represented as a new show-level note.

## 2. Selection analysis

The post-Batch 13 snapshot contained 752 published shows, 235 enrichment-eligible records, 367 shows with at least one collection, 385 without membership, and 140 actionable enrichment candidates. The selected records emphasize different discovery functions and evidence-backed structural signals rather than ten interchangeable horror entries. Existing collection coverage was retained; new placements were added only where a curated route matched a source-backed premise, listening form, or commitment profile.

| Record | Discovery function | Why this batch included it |
| --- | --- | --- |
| [HORROR ETERNAL](../../catalog-src/shows/horror-eternal.json) | Performed original-horror anthology | Adds psychological, supernatural, apocalyptic, and alien-horror routes to the sparse queue. |
| [Tales From Wolf Mountain](../../catalog-src/shows/tales-from-wolf-mountain.json) | Surreal short-run anthology | Adds radio plays, broadcasts, faith stories, and linked strange worlds across eight observed seasons. |
| [The Grey Rooms](../../catalog-src/shows/the-grey-rooms.json) | Serial afterlife horror anthology | Adds a full-cast door-and-death frame with substantial back-catalogue depth. |
| [The Town Whispers](../../catalog-src/shows/the-town-whispers.json) | Fogbound folk-horror serial | Adds a local eldritch route built around The Fort, folklore, and hidden community stories. |
| [Wake Of Corrosion](../../catalog-src/shows/wake-of-corrosion.json) | Bunker-broadcast apocalypse | Adds an uncollected survival route centered on Professor Ryan and Bunker A:12. |
| [Red Frontier](../../catalog-src/shows/red-frontier.json) | Compact Mars survival thriller | Adds a short, full-cast serious-sci-fi route; its other collection placements already cover isolation, survival, and headphones. |
| [Batman Unburied](../../catalog-src/shows/batman-unburied.json) | Licensed forensic Gotham thriller | Adds a bounded crime, memory, and identity route with a clear short-listen commitment. |
| [Bridgewater](../../catalog-src/shows/bridgewater.json) | Folklore-led supernatural mystery | Adds a full-cast Bridgewater Triangle route connecting folklore, relics, and the possibility of rewriting the past. |
| [Give Me Away](../../catalog-src/shows/give-me-away.json) | Alien-contact social science fiction | Adds a high-concept but character-grounded route about radical hospitality and shared consciousness. |
| [Observable Radio](../../catalog-src/shows/observable-radio.json) | Found-footage analog-horror anthology | Adds recorded evidence, alternate universes, and impossible signals to the archive's evidence-led routes. |

## 3. Evidence anchors checked

These sources supported premise, setting, form, production framing, route length, or source boundaries for discovery decisions. They were not used to fabricate ratings, verification, or lifecycle state.

| Record | Source anchor and supported signal |
| --- | --- |
| HORROR ETERNAL | [Monster Forge Radio announcement](https://www.monsterforgeproductions.com/post/monster-forge-radio-debuts-with-the-horror-eternal-a-terrifying-new-podcast-created-by-roy-burdi) and [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/horror-eternal/id1700342943) — original horror anthology, psychological/supernatural/apocalyptic premise, alien-contact story route, and Roy Burdine's written/performed framing. |
| Tales From Wolf Mountain | [Wolf Mountain Workshop](https://www.wolfmountainworkshop.org/) and [Apple Podcasts listing](https://podcasts.apple.com/ca/podcast/tales-from-wolf-mountain/id1725674186) — short-run audio fiction, radio plays, broadcasts, sermons, surreal seasons, and the observed eight-season depth. |
| The Grey Rooms | [Official About page](https://thegreyrooms.com/about/) and [official home page](https://thegreyrooms.com/) — Raymond's Grey Rooms frame, doors and deaths, varied authors/settings/characters, horror anthology form, and mature-audience boundary. |
| The Town Whispers | [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/the-town-whispers/id1528922538) and [Acast show page](https://shows.acast.com/thetownwhispers) — The Fort, fog, eldritch terror, folk horror, Cole Weavers' narration, and the serial feed. |
| Wake Of Corrosion | [Publisher Acast feed](https://feeds.acast.com/public/shows/63213152f8ec070013e1c1c2), [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/wake-of-corrosion/id1566786218?uo=4), and the [follow page](https://www.wakeofcorrosion.com/follow/) — Bunker A:12, Professor Ryan, apocalyptic horror, and the existing explicit-content/discretion boundary. The standalone site currently resolves to an expired Podpage, so no new content-note or lifecycle claim was derived from it. |
| Red Frontier | [Publisher RSS feed](https://feeds.megaphone.fm/redfrontier-spot) and [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/red-frontier/id1690676876?uo=4) — Commander Taylor Fullerton, an isolated Mars colonization mission, vanished crew, mysterious epidemic, full-cast cast list, and exact 11-episode/2.4-hour observed route. |
| Batman Unburied | [Official Spotify show](https://open.spotify.com/show/3pUWoZ6fC2qA02D3X0CeMb), [Spotify announcement](https://newsroom.spotify.com/2020-09-29/david-goyer-warner-bros-and-dc-set-to-bring-batman-unburied-to-spotify/), and [DC source page](https://www.dc.com/blog/2020/09/29/david-s-goyer-warner-bros-and-dc-to-bring-batman-unburied-to-spotify) — Bruce Wayne's missing Batman identity, forensic pathology, the Harvester investigation, full-cast licensed DC framing, and the Spotify production context. |
| Bridgewater | [Grim & Mild show page](https://www.grimandmild.com/bridgewater) and [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/bridgewater/id1574751423?uo=4) — folklore professor Jeremy Bradshaw, a rediscovered relic, the supernatural thriller framing, and the Bridgewater setting. |
| Give Me Away | [Gideon Media show page](https://www.gideon-media.com/give-me-away) and [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/give-me-away/id1575422580?uo=4) — the Ghosthouse, uploaded extraterrestrial political prisoners, shared consciousness, Graham Shapiro, radical hospitality, full-cast production, and social/ethical framing. |
| Observable Radio | [Official About page](https://www.observableradio.com/about-the-show), [official site](https://www.observableradio.com/), and [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/observable-radio/id1707920301) — monthly found-footage anthology, analog horror, retro science fiction, The Tower's alternate universes in crisis, and the unnamed Observer cataloguing signals. |

## 4. Enrichment decisions

All ten records received a coherent discovery packet. Existing objective content on Red Frontier was retained rather than rewritten; the other nine records received new structured content where the source framing was clear.

| Record | Tones / themes | Best-for routes | Profile | Authored similarity |
| --- | --- | --- | --- | --- |
| HORROR ETERNAL | `dark`, `tense`, `weird`; psychological terror, supernatural dread, apocalyptic suspense | late night, headphones on, binge listening | primarily narrated; plot-driven; high; deep dive | The NoSleep Podcast |
| Tales From Wolf Mountain | `dark`, `weird`, `cinematic`; surreal short fiction, apocalyptic worlds, radio broadcasts and belief | long walks, worldbuilding, headphones on, binge listening | mixed; balanced; variable; deep dive | The Other Stories |
| The Grey Rooms | `dark`, `tense`, `cinematic`; death and afterlife, choices and consequences, anthology worlds | late night, headphones on, worldbuilding, binge listening | primarily acted; balanced; high; deep dive | The NoSleep Podcast |
| The Town Whispers | `dark`, `tense`, `weird`; small-town folklore, eldritch terror and folk horror, fogbound communities | late night, headphones on, worldbuilding, binge listening | primarily narrated; plot-driven; high; deep dive | Old Gods of Appalachia |
| Wake Of Corrosion | `dark`, `bleak`, `tense`; apocalyptic survival, bunker broadcasts and investigation, eldritch horror | cold isolation horror, late night, headphones on, binge listening | mixed; plot-driven; high; deep dive | Red Frontier |
| Red Frontier | `dark`, `tense`, `cinematic`; Mars colonization, isolation and quarantine, epidemic and survival | serious sci-fi, short under five hours, cold isolation horror, headphones on | primarily acted; plot-driven; high; short | The Edge of Sleep |
| Batman Unburied | `dark`, `tense`, `cinematic`; crime and investigation, memory and identity, psychological horror | easy entry, short under five hours, headphones on, binge listening | existing primarily acted; plot-driven; medium; new short commitment | Bridgewater |
| Bridgewater | `dark`, `tense`, `weird`; folklore and the supernatural, memory and the past, rewriting fate | late night, headphones on, worldbuilding, binge listening | primarily acted; plot-driven; high; medium | The Left Right Game |
| Give Me Away | `warm`, `tense`, `hopeful`; radical hospitality and community, alien consciousness and consent, shared identity and belonging | serious sci-fi, worldbuilding, headphones on, binge listening | primarily acted; character-driven; medium; deep dive | Steal the Stars |
| Observable Radio | `dark`, `tense`, `weird`; found footage and analog horror, alternate universes in crisis, communication and impossible signals | late night, headphones on, worldbuilding, binge listening | mixed; balanced; high; medium | The Last Movie |

The authored reasons are directional and source-specific:

- HORROR ETERNAL → The NoSleep Podcast: both are original horror anthologies built from standalone scares; HORROR ETERNAL leans into psychological, supernatural, apocalyptic, and alien dread, while The NoSleep Podcast ranges across narrated and full-cast nightmare stories.
- Tales From Wolf Mountain → The Other Stories: both offer a deep anthology route through short genre fiction; Wolf Mountain connects radio plays, broadcasts, sermons, and surreal seasons into larger worlds, while The Other Stories keeps a more direct weekly short-story format.
- The Grey Rooms → The NoSleep Podcast: both are atmospheric horror anthologies with changing settings and characters; The Grey Rooms threads its stories through Raymond's serial afterlife journey, while The NoSleep Podcast presents a broader collection of nightmare tales.
- The Town Whispers → Old Gods of Appalachia: both use folkloric entities and inherited regional myth to make place feel dangerous; The Town Whispers concentrates its dread in The Fort, while Old Gods of Appalachia spreads it across an alternate Appalachian history.
- Wake Of Corrosion → Red Frontier: both are isolated survival mysteries shaped by an unexplained catastrophe; Wake Of Corrosion uses bunker broadcasts in a nightmare-ridden Britain, while Red Frontier follows a lone Mars colonist and a vanished crew.
- Red Frontier → The Edge of Sleep: both are compact full-cast survival thrillers where a small group confronts a lethal epidemic; Red Frontier isolates its lead on Mars, while The Edge of Sleep makes staying awake the condition of survival.
- Batman Unburied → Bridgewater: both are full-cast serialized mysteries centered on a lead investigating a destabilizing past; Batman Unburied uses Bruce Wayne's missing identity and forensic cases, while Bridgewater follows a folklore professor and a rediscovered relic.
- Bridgewater → The Left Right Game: both are full-cast supernatural investigations where a familiar world opens onto impossible rules; Bridgewater follows a folklore professor and a rediscovered relic, while The Left Right Game follows a journalist into an uncanny road journey.
- Give Me Away → Steal the Stars: both are high-concept full-cast science fiction grounded in a single person's difficult choices; Give Me Away explores radical hospitality and shared consciousness, while Steal the Stars turns a secret alien discovery into a forbidden-love heist.
- Observable Radio → The Last Movie: both make recorded evidence part of an impossible mystery; Observable Radio uses found footage and signals from alternate universes, while The Last Movie follows a host-led investigation into a dangerous film legend.

Structured content packets record only the supported framing:

- HORROR ETERNAL: different worlds shaped by psychological, supernatural, apocalyptic, and alien horror; Roy Burdine's performed characters across standalone stories; original fiction; episodic horror anthology shifting between psychological terror, supernatural dread, and apocalyptic suspense.
- Tales From Wolf Mountain: Other-Earth, Wolf Mountain, the City Unending, and surreal worlds across short-run seasons; changing survivors, pilgrims, believers, and residents across linked stories; original fiction; serialized short-run anthology of radio plays, broadcasts, sermons, and surreal fiction.
- The Grey Rooms: the Grey Rooms and the impossible places behind its doors; Raymond and recurring passengers experiencing other people's final moments; original fiction; full-cast horror anthology threaded through a serial afterlife mystery.
- The Town Whispers: The Fort, a fogbound town of underground wells and eldritch folklore; Cole Weavers' narrator and the people whose stories surface in The Fort; original fiction; narrative horror serial about folk horrors and eldritch terror.
- Wake Of Corrosion: a nightmare-ridden post-apocalyptic Britain and Bunker A:12; Professor Ryan and the survivors listening to and making bunker broadcasts; serialized apocalyptic audio drama built around shelter broadcasts and investigation.
- Red Frontier: existing content packet retained — a one-way Mars colonization mission, Commander Taylor Fullerton, original fiction, and a mission drama shaped by isolation, quarantine, and a mysterious epidemic.
- Batman Unburied: Gotham City and the forensic investigation around the Harvester; Bruce Wayne as a forensic pathologist who cannot remember being Batman; licensed DC/Batman universe; full-cast serialized psychological crime thriller.
- Bridgewater: Bridgewater, Massachusetts and the Bridgewater Triangle; folklore professor Jeremy Bradshaw and the people drawn into his past; full-cast supernatural mystery thriller about a relic and the possibility of rewriting the past.
- Give Me Away: the Ghosthouse spaceship and the communities asked to share minds with its passengers; Graham Shapiro as he volunteers for a second consciousness; original fiction; full-cast serialized science-fiction drama about radical hospitality and alien consciousness.
- Observable Radio: alternate universes in crisis and the static beneath their communication network; the unnamed Observer cataloguing impossible signals; original fiction; found-footage anthology of analog horror and retro science fiction.

## 5. Curated collection placements

The batch adds 29 curated membership edges. Existing rule/similarity memberships are not counted as authored batch edits. Red Frontier's five existing curated placements and The Town Whispers' two existing curated placements were retained rather than counted as new.

| Collection | Added records |
| --- | --- |
| Best for long walks | Tales From Wolf Mountain |
| Worldbuilding deep dives | Tales From Wolf Mountain; The Grey Rooms; The Town Whispers; Bridgewater; Give Me Away; Observable Radio |
| Late-night tension | HORROR ETERNAL; The Grey Rooms; The Town Whispers; Wake Of Corrosion; Batman Unburied; Bridgewater; Observable Radio |
| Headphones-on immersion | HORROR ETERNAL; Tales From Wolf Mountain; The Grey Rooms; The Town Whispers; Wake Of Corrosion; Batman Unburied; Bridgewater; Give Me Away; Observable Radio |
| Cold isolation horror | Wake Of Corrosion |
| Survival pressure | Wake Of Corrosion |
| Quick first listens | Red Frontier; Batman Unburied |
| Serious sci-fi | Give Me Away |
| Found recordings and buried evidence | Observable Radio |

Every new curated edge carries a collection-specific `showReasons` explanation in the canonical collection source. No rule or similarity collection source was manually edited.

## 6. Before/after metrics

The baseline is the catalog immediately after Batch 13, reconstructed from the current source state by removing only Batch 14 discovery/content fields and the 29 Batch 14 curated memberships. Quality uses the existing 17-dimension discovery-quality score. Facet groups are tones, tags, best-for routes, and similar-show links. Profile keys are the four optional discovery-profile keys. Collection counts include existing rule/similarity memberships so the table describes the actual public catalog surface.

| Show | Quality | Facet groups | Profile keys | Structured content | Content notes | Collections | Authored similar links |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| HORROR ETERNAL | 10 → 15 | 1 → 4 | 0 → 4 | 0 → 4 keys | 0 → 0 | 1 → 3 | 0 → 1 |
| Tales From Wolf Mountain | 10 → 15 | 1 → 4 | 0 → 4 | 0 → 4 keys | 0 → 0 | 1 → 4 | 0 → 1 |
| The Grey Rooms | 10 → 15 | 1 → 4 | 0 → 4 | 0 → 4 keys | 0 → 0 | 2 → 5 | 0 → 1 |
| The Town Whispers | 10 → 15 | 1 → 4 | 0 → 4 | 0 → 4 keys | 0 → 0 | 2 → 5 | 0 → 1 |
| Wake Of Corrosion | 10 → 16 | 1 → 4 | 0 → 4 | 0 → 3 keys | 0 → 0 | 0 → 4 | 0 → 1 |
| Red Frontier | 10 → 15 | 1 → 4 | 0 → 4 | 4 → 4 keys | 0 → 0 | 5 → 6 | 0 → 1 |
| Batman Unburied | 11 → 15 | 1 → 4 | 3 → 4 | 0 → 4 keys | 0 → 0 | 1 → 4 | 0 → 1 |
| Bridgewater | 11 → 16 | 1 → 4 | 0 → 4 | 0 → 3 keys | 0 → 0 | 1 → 4 | 0 → 1 |
| Give Me Away | 11 → 16 | 1 → 4 | 0 → 4 | 0 → 4 keys | 0 → 0 | 1 → 4 | 0 → 1 |
| Observable Radio | 11 → 16 | 1 → 4 | 0 → 4 | 0 → 4 keys | 0 → 0 | 1 → 5 | 0 → 1 |
| **Batch mean / total** | **10.4 → 15.4** | **10 → 40 facet groups** | **3 → 40 keys** | **4 → 38 keys** | **0 → 0 notes** | **15 → 44 memberships** | **0 → 10** |

The catalog-wide deltas are:

| Measurement | Before | After | Change |
| --- | ---: | ---: | ---: |
| Published shows | 752 | 752 | unchanged |
| Enrichment-eligible / imported / editorial | 235 / 517 / 7 | 235 / 517 / 7 | unchanged |
| Shows with at least one collection | 367/752 | 368/752 | +1 |
| Shows with at least two collections | 219/752 | 226/752 | +7 |
| Shows with three or more useful facet groups | 199/752 | 209/752 | +10 |
| Curated discovery profiles | 160/752 | 169/752 | +9 |
| Tone coverage | 200/752 | 210/752 | +10 |
| Themes or content-note coverage | 202/752 | 212/752 | +10 |
| Best-for coverage | 199/752 | 209/752 | +10 |
| Similar-show source coverage | 198/752 | 208/752 | +10 |
| Authored similarity links / written reasons | 399/399 | 409/409 | +10 / +10 |
| Shows with authored outgoing routes | 198 | 208 | +10 |
| Collection membership edges | 986 | 1015 | +29 |
| Shows without collection membership | 385 | 384 | -1 |
| Eligible shows missing one or more of tones, best-for routes, or similarity links | 36 | 26 | -10 |
| Strict computed source shows / edges | 115/191 | 123/204 | +8 / +13 |
| Actionable eligible candidates | 140 | 134 | -6 |

The generated discovery report leaves 134 actionable candidates in the full queue after this batch. Imported records remain outside the editorial work queue.

## 7. Strict computed-similarity qualification

The public policy remains unchanged: score at least 20; pair, source, and target metadata coverage at least 0.65; at least three metadata dimensions; at least two anchor dimensions; at least two specific discovery dimensions; at least two explanation reasons; and a maximum of two public computed matches per source. Authored links and curated similarity evidence are excluded from this computation.

The selected records that clear the strict public computed gate after Batch 14 are:

- HORROR ETERNAL → [WOE.BEGONE](../../catalog-src/shows/woe-begone.json) (23.6), [The Liminal Lands](../../catalog-src/shows/the-liminal-lands.json) (21.8), supported by shared dark/tense/weird tone and listening context or horror discovery tagging.
- Tales From Wolf Mountain → [Within the Wires](../../catalog-src/shows/within-the-wires.json) (20.4), supported by shared weird/cinematic tone and long-walk/worldbuilding/headphones-on context.
- Wake Of Corrosion → [The Liberty Podcast](../../catalog-src/shows/the-liberty-podcast.json) (20.6), supported by shared dark/tense tone and science-fiction discovery tagging.
- Red Frontier → [Sandra](../../catalog-src/shows/sandra.json) (28.6) and [Motherhacker](../../catalog-src/shows/motherhacker.json) (28.3), supported by shared Gimlet production context and tense/dark/cinematic tone overlap.
- Batman Unburied → [The Harrowing](../../catalog-src/shows/the-harrowing.json) (22.9) and [From Now](../../catalog-src/shows/from-now.json) (21.3), supported by shared dark/tense/cinematic tone and investigation or easy-entry discovery signals.
- Bridgewater → [The Last Movie](../../catalog-src/shows/the-last-movie.json) (23.9) and [The Patron Saint of Suicides](../../catalog-src/shows/the-patron-saint-of-suicides.json) (22.4), supported by shared tone/tag or late-night/headphones-on/binge-listening signals.

Tales From Wolf Mountain, The Grey Rooms, The Town Whispers, Give Me Away, and Observable Radio otherwise did not clear the strict computed gate in this snapshot. These are computed archive matches, not authored editorial recommendations; none of the computed results were written into `similarTo`.

The reconstructed pre-Batch 14 state had 115 strict computed source shows and 191 edges, with none of the ten selected records qualifying. The post-batch state has 123 strict computed source shows and 204 edges.

## 8. Graph and collection health

The post-build collection-candidate report contains 1,015 materialized membership edges, 368 shows with membership, 384 without membership, and 7,648 candidate edges across 329 shows. It reports zero invalid collection references, no near-duplicate collection pair, and a low-membership threshold of seven. Drama and serialized remain the broad underrepresented catalog areas at 45.3% and 49.3% coverage respectively. Candidate edges remain a review signal; no automatic memberships were accepted.

The post-build similarity report contains 409 authored links with 409 written reasons. Signal coverage is tone 210, theme 212, best-for 209, voice style 164, narrative focus 166, intensity 208, and commitment 160 out of 752 published records. The diagnostic scorer returned 182,266 candidate results with a 7.5–64 score range, 10.38 average, and 9.8 median. These diagnostics use the existing policy and are distinct from the stricter 123-source / 204-edge public computed gate above.

The entity graph remains at 132 public entities, 318 relationship records, and 266 linked shows; 486 shows have no entity relationship. No invalid or unresolved entity links were introduced, and the existing 43 type/role divergence warnings remain.

The catalog report remains at Gate B complete, zero blocking errors, six missing RSS fields, 25 documented research-gap records, zero actionable RSS gaps, and clean generated-output drift. The report's weak-collection-coverage measure is 526; this is a broader quality diagnostic than the 384 shows with no collection membership used above.

This batch adds usable routes for original-horror anthology, surreal short fiction, serial afterlife horror, folk-horror geography, bunker apocalypse, compact Mars survival, licensed psychological crime, folklore mystery, alien-contact ethics, and analog found footage. It leaves unresolved entity evidence, lifecycle uncertainty, and uncollected records for later source review rather than filling gaps mechanically.

## 9. Rejected or deferred decisions

- No new controlled tags were added; the existing factual tags and free-text themes supplied the needed discovery signals.
- No entity links were added for the creators, networks, production companies, publishers, or broadcasters associated with these records. Entity promotion remains a separate source-backed registry task.
- Existing rule-based and similarity-collection memberships were not manually edited.
- No release or completion state was inferred from current provider pages, episode counts, or old feed activity. The selected records retain their existing lifecycle values.
- Wake Of Corrosion's standalone site currently resolves to an expired Podpage. The publisher feed and existing catalog description were sufficient for premise discovery, but not for adding a new show-level content-note taxonomy or correcting lifecycle fields.
- Red Frontier's existing structured content and collection routes were retained. Its new quick-first-listens membership is based on the observed 2.4-hour run and does not change its unclear completion state.
- Batman Unburied's short commitment is based on the current catalog's observed 10 full episodes and roughly 4.8 hours; no new completion or provider-status claim was inferred.
- No content notes were added to the horror, supernatural, or analog records because the checked sources did not support a bounded new warning set for this batch.
- No ratings, reviews, verification states, factual metadata, lifecycle fields, similarity thresholds, collection rules, or public explanation policies were changed.

## 10. Validation and worktree boundary

Commands run after the canonical source edits:

- `npm run build:catalog` — passed; built artifacts for 752 shows, 46 collections, and 7 review companions.
- `npm run validate:data` — passed with 0 integrity errors across 752 shows, 46 collections, 132 entities, and 7 review companions. The existing 43 entity type/role divergence warnings remain; no invalid or unresolved entity links were introduced.
- `npm run report:discovery-quality` — passed; 368 shows with collections, 226 with at least two collections, 209 with three or more useful facet groups, 169 curated profiles, and 134 actionable candidates.
- `npm run report:similarity` — passed; 409 authored links with 409 written reasons and the unchanged similarity policy.
- `npm run report:collection-candidates` — passed; 1,015 membership edges, 384 shows without membership, 7,648 candidate edges across 329 shows, and 0 invalid references.
- `npm run report:entity-graph` — passed; 132 public entities, 318 relationship records, 266 linked shows, and 486 zero-relationship shows. No entity links were added.
- `npm run report:catalog` — passed; Gate B complete, 0 blocking errors, 0 actionable RSS gaps, 25 documented research-gap records, and generated-output drift clean.
- `git diff --check` — passed.
- Focused catalog/discovery/similarity/candidate tests — passed: 40/40.
- A read-only Node comparison reconstructed the pre-Batch 14 graph and confirmed the strict computed-similarity delta from 115/191 to 123/204, with the selected computed matches listed above; no scorer or policy files were changed.

The worktree retains prior Phase 3 changes plus the ten Batch 14 show-source edits, nine curated collection-source updates, expected rebuilt catalog/search/status artifacts, and this QA report. No commit, push, deployment, or publication was performed. The queue still contains meaningful evidence-review work, so no stopping condition was reached.
