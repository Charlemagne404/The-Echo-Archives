# Phase 3 Batch 13 — Discovery Enrichment QA

Date: 2026-09-17  
Scope: ten published, enrichment-eligible show records and ten curated collection sources  
Status: local source and generated-catalog validation only; not committed, deployed, or published

## 1. Scope and guardrails

Batch 13 continues the Phase 3 discovery-enrichment sequence after Batch 12. The post-Batch 12 queue contained 142 actionable eligible records. The selection starts with a mystery-docudrama route, literary genre anthology, British and Irish folk-horror investigation, licensed time-travel serial, science-fiction short-story magazine, workplace space comedy, ARG-shaped horror mystery, cozy ghost story, and Alaskan supernatural horror. The Dragoning is included as a graph-curation case because its discovery packet was already complete; it received collection placements only.

The existing source-of-truth rules were preserved:

- `catalog-src/shows/` and `catalog-src/collections/` remain authoritative; generated `data/` and `docs/generated/` files were rebuilt normally.
- Discovery values were added only where the record, existing objective source metadata, and an official, creator, publisher, provider, or broadcaster source supported a useful classification.
- Every new `similarTo` edge received an explicit directional reason. Reciprocal copying was not used as a substitute for editorial judgment.
- The similarity scorer, public computed-match gate, thresholds, weights, and explanation policy were not changed. Computed candidates were not promoted into authored relationships.
- No raw creator, network, or provider string was promoted to a new typed entity relationship.
- No rating, review, community score, creator-verification claim, factual tag, genre, format, listen link, or lifecycle correction was added.
- Imported/factual-only records were not edited. Existing typed entity relationships and provenance were not rewritten.
- Rule-based collections and existing similarity-collection materialization were not manually changed. Only curated collection sources were extended.
- Content notes were added only for WOE.BEGONE, where the official premise supports a violence cue; no broader warning set was inferred for the other nine records.

## 2. Selection analysis

The post-Batch 12 snapshot contained 752 published shows, 235 enrichment-eligible records, 364 shows with at least one collection, 388 without membership, and 142 actionable enrichment candidates. The selected records prioritize distinct discovery routes and sparse records with clear evidence rather than repeating one horror or science-fiction pattern. Existing collection coverage was retained; new placements were added only when a curated route matched a source-backed premise, listening form, or commitment profile.

| Record | Discovery function | Why this batch included it |
| --- | --- | --- |
| [The Last Movie](../../catalog-src/shows/the-last-movie.json) | Host-led mystery docudrama | Adds a film-legend investigation connected to the Public Radio Alliance mystery route. |
| [The Other Stories](../../catalog-src/shows/the-other-stories-sci-fi-horror-thriller-wtf-stories.json) | Short-form genre anthology | Adds a large, narrator-led route through self-contained science-fiction, horror, thriller, and strange-fiction stories. |
| [The Wyrd Side](../../catalog-src/shows/the-wyrd-side.json) | New Weird folk-horror investigation | Adds British and Irish folklore and paranormal investigation without relying on a generic horror label. |
| [Doctor Who: Redacted](../../catalog-src/shows/doctor-who-redacted.json) | Licensed full-cast time-travel serial | Adds a bounded Doctor Who investigation with a clear newcomer route and franchise context. |
| [Escape Pod](../../catalog-src/shows/escape-pod.json) | Science-fiction podcast magazine | Adds a long-running short-story anthology route with changing narrators and speculative settings. |
| [MarsCorp](../../catalog-src/shows/marscorp.json) | Workplace space comedy | Adds a warm, character-first branch to the funny-space-disasters and easy-entry routes. |
| [WOE.BEGONE](../../catalog-src/shows/woe-begone.json) | ARG-shaped horror-sci-fi mystery | Adds a deep, reality-bending technology and alternate-reality-game route. |
| [The Way We Haunt Now](../../catalog-src/shows/the-way-we-haunt-now.json) | Cozy ghost-story audio drama | Adds a welcoming found-family and afterlife route with a bounded character focus. |
| [The Dragoning](../../catalog-src/shows/the-dragoning.json) | Existing complete discovery packet | Adds missing curated graph routes only; no new discovery fields were needed. |
| [Uncanny Valley](../../catalog-src/shows/uncanny-valley.json) | Alaskan supernatural horror | Adds an isolation-horror route grounded in hidden pasts and a not-quite-human threat. |

## 3. Evidence anchors checked

These sources supported premise, setting, form, production framing, route length, or the one content-note decision. They were not used to fabricate ratings, verification, or lifecycle state.

| Record | Source anchor and supported signal |
| --- | --- |
| The Last Movie | [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/the-last-movie/id1360493241) — Nic Silver, MK, and a supposedly dangerous underground film; [Public Radio Alliance about page](https://www.publicradioalliance.com/about) — the connected production context. |
| The Other Stories | [Official show site](https://theotherstories.net/) and [press kit](https://theotherstories.net/press-kit/) — weekly short stories across science fiction, horror, thriller, and strange fiction; [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/the-other-stories-sci-fi-horror-thriller-wtf-stories/id1099630309) — the feed and observed anthology route. |
| The Wyrd Side | [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/the-wyrd-side/id1693650685) — Aiden Summers and Katherine Moore investigating the paranormal through British and Irish myths and legends. |
| Doctor Who: Redacted | [Official Doctor Who / BBC Sounds page](https://www.doctorwho.tv/news-and-features/bbc-sounds-spinoff-podcast-doctor-who-redacted) — Cleo, Abby, and Shawna, the Blue Box Files, a full-cast spinoff, and the licensed Doctor Who universe. |
| Escape Pod | [Official About page](https://escapepod.org/about-us/) — science-fiction podcast magazine, writers, narrators, weekly stories, and the long-running archive; [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/escape-pod/id73329293) — the observed short-story feed. |
| MarsCorp | [Definitely Human production page](https://definitelyhuman.co.uk/portfolio/marscorp/) — E.L. Hob, a terraforming colony on Mars, and scripted full-cast comedy; [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/marscorp/id1130424845) — the series feed. |
| WOE.BEGONE | [Official show site](https://woebegonepod.com/) — Mike Walters, an online game with real-life consequences, weekly horror/sci-fi framing, and a distinct soundtrack-led mystery; the premise supports a limited violence note. |
| The Way We Haunt Now | [Official show site](https://hauntnowpod.com/) — Eulalie Reed and Frankie Summerson, ghosts, friendship, found family, and the complete cozy-horror framing. |
| The Dragoning | [Official listen page](https://www.messengertheatreco.org/dragoning-listen) and [press kit](https://www.messengertheatreco.org/dragoning-press-kit) — the near-future dragon transformation premise, theatrical dramedy, and existing packet context. |
| Uncanny Valley | [Dayton Writers Movement show page](https://www.daytonwritersmovement.com/uncannyvalley) — Audrey's Alaskan fresh start, hidden past, full cast, and something that may only look human; [trigger page](https://www.daytonwritersmovement.com/triggers) — source boundary for checking warnings without adding unsupported categories. |

## 4. Enrichment decisions

Nine records received new discovery/content packets. The Dragoning retained its complete existing packet and was enriched only through curated memberships.

| Record | Tones / themes | Best-for routes | Profile | Authored similarity |
| --- | --- | --- | --- | --- |
| The Last Movie | `tense`, `weird`, `cinematic`; film and obsession, conspiracy and evidence, reality and fiction | late night, headphones on, binge listening | mixed; plot-driven; high; medium | Rabbits |
| The Other Stories | `dark`, `tense`, `weird`; short-form genre fiction, horror and the uncanny, changing story themes | easy entry, long walks, late night, headphones on | primarily narrated; plot-driven; variable; deep dive | The Truth |
| The Wyrd Side | `dark`, `tense`, `weird`; British and Irish folklore, paranormal investigation, myths and legends | late night, headphones on, worldbuilding, binge listening | primarily acted; plot-driven; high; medium | The Town Whispers |
| Doctor Who: Redacted | `tense`, `cinematic`; paranormal conspiracy, friendship and identity, time travel | easy entry, binge listening, headphones on | primarily acted; plot-driven; medium; medium | The Left Right Game |
| Escape Pod | `weird`, `hopeful`; short-form science fiction, speculative futures, science and technology | easy entry, long walks, headphones on, serious sci-fi | primarily narrated; balanced; variable; deep dive | The Truth |
| MarsCorp | `funny`, `warm`, `chaotic`; Mars colony life, workplace culture, adaptation and leadership | funny space disasters, easy entry, binge listening | primarily acted; character-driven; existing medium commitment retained | Wolf 359 |
| WOE.BEGONE | `dark`, `tense`, `weird`; power and technology, linear time, alternate reality games | worldbuilding, long walks, late night, headphones on, binge listening | primarily narrated; plot-driven; high; deep dive | Rabbits |
| The Way We Haunt Now | `warm`, `funny`, `hopeful`, `weird`; friendship and found family, life after death, identity and self-definition | easy entry, binge listening, warm weird, headphones on | primarily acted; character-driven; medium; medium | The Orbiting Human Circus |
| The Dragoning | existing `funny`, `dark`, `chaotic`; existing themes and content notes retained | existing binge listening and late-night routes retained | existing primarily acted; balanced; medium; long retained | existing The Orbiting Human Circus edge retained |
| Uncanny Valley | `dark`, `tense`, `cinematic`; Alaska and isolation, starting over and hidden pasts, fear of the not-quite-human | cold isolation horror, late night, headphones on, binge listening | primarily acted; plot-driven; high; medium | The Left Right Game |

The authored reasons are directional and source-specific:

- The Last Movie → Rabbits: both are Public Radio Alliance mysteries built around an apparently impossible cultural object, but one follows a dangerous film legend and the other a dangerous game.
- The Other Stories → The Truth: both are anthology routes into self-contained audio fiction, with The Other Stories emphasizing short horror, science fiction, and thriller pieces.
- The Wyrd Side → The Town Whispers: both follow investigators into folk-horror shaped by local myth, through different regional settings.
- Doctor Who: Redacted → The Left Right Game: both put ordinary protagonists inside full-cast speculative investigations, using different impossible-world premises.
- Escape Pod → The Truth: both provide large anthologies of self-contained audio fiction, with Escape Pod emphasizing science-fiction short stories and author/narrator context.
- MarsCorp → Wolf 359: both are character-first space comedies set in isolated workplaces, using a terraforming colony versus a station crew.
- WOE.BEGONE → Rabbits: both turn an apparently impossible game into a long-form investigation of power and reality.
- The Way We Haunt Now → The Orbiting Human Circus: both are warm, off-kilter character stories about belonging and identity, grounded in ghosts versus surreal radio fantasy.
- Uncanny Valley → The Left Right Game: both put an ordinary lead into a full-cast supernatural investigation, grounded in an isolated Alaskan setting versus an impossible road.

Structured content packets record only the supported framing:

- The Last Movie: the underground film legend and its reported screenings; TANIS host Nic Silver and MK investigating; serialized investigative mystery around a supposedly dangerous movie.
- The Other Stories: varied worlds across short genre-fiction stories; new characters and narrators in each standalone story; weekly horror, science-fiction, and thriller anthology.
- The Wyrd Side: the islands of Britain and Ireland and their myths and legends; Aiden Summers and Katherine Moore; serialized New Weird folk-horror investigation.
- Doctor Who: Redacted: the Doctor Who universe and contemporary UK; Cleo Proctor, Abby McPhail, and Shawna Thompson as the Blue Box Files team; licensed Doctor Who universe; full-cast serialized paranormal-conspiracy audio drama.
- Escape Pod: varied speculative futures and worlds; changing narrators and characters; weekly science-fiction podcast magazine.
- MarsCorp: a terraforming colony on Mars; station supervisor E.L. Hob and the MarsCorp crew; scripted full-cast workplace science-fiction comedy.
- WOE.BEGONE: an online game with real-life consequences and the technology behind it; Mike Walters and the people drawn into WOE.BEGONE; weekly horror-sci-fi mystery series.
- The Way We Haunt Now: life and what comes after in a world of ghosts; Eulalie Reed and Frankie Summerson; cozy horror audio drama about friendship and found family.
- Uncanny Valley: Alaska and the hidden dangers Audrey finds there; Audrey and an ensemble hiding from something; full-cast supernatural horror audio drama.

## 5. Curated collection placements

The batch adds 27 curated membership edges. Rule-based memberships regenerated from unchanged rules are not counted as authored batch edits, and the existing `folk-horror-and-old-gods` placement for The Wyrd Side was retained rather than counted as new.

| Collection | Added records |
| --- | --- |
| Best for long walks | The Other Stories; Escape Pod |
| Start here | The Other Stories; Doctor Who: Redacted; Escape Pod; MarsCorp; The Way We Haunt Now |
| Funny space disasters | MarsCorp |
| Cold isolation horror | Uncanny Valley |
| Time-bent and weird | Doctor Who: Redacted |
| Late-night tension | The Last Movie; The Wyrd Side; WOE.BEGONE; Uncanny Valley |
| Headphones-on immersion | The Last Movie; The Other Stories; The Wyrd Side; Doctor Who: Redacted; Escape Pod; WOE.BEGONE; The Way We Haunt Now; Uncanny Valley |
| Warm weird comfort | MarsCorp; The Way We Haunt Now; The Dragoning |
| Worldbuilding deep dives | WOE.BEGONE |
| Fantasy detours and hidden worlds | The Dragoning |

Every new curated edge carries a collection-specific `showReasons` explanation in the canonical collection source. No rule or similarity collection source was manually edited.

## 6. Before/after metrics

The baseline is the catalog immediately after Batch 12, reconstructed from the current source state by removing only Batch 13 discovery/content fields and the 27 Batch 13 curated memberships. Quality uses the existing 17-dimension discovery-quality score. Facet groups are tones, tags, best-for routes, and similar-show links. Profile keys are the four optional discovery-profile keys. Collection counts include existing rule/similarity memberships so the table describes the actual public catalog surface.

| Show | Quality | Facet groups | Profile keys | Structured content | Content notes | Collections | Authored similar links |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| The Last Movie | 10 → 16 | 1 → 4 | 0 → 4 | 0 → 3 keys | 0 → 0 | 0 → 2 | 0 → 1 |
| The Other Stories | 10 → 15 | 1 → 4 | 0 → 4 | 0 → 3 keys | 0 → 0 | 3 → 6 | 0 → 1 |
| The Wyrd Side | 10 → 15 | 1 → 4 | 0 → 4 | 0 → 3 keys | 0 → 0 | 1 → 3 | 0 → 1 |
| Doctor Who: Redacted | 11 → 15 | 1 → 4 | 3 → 3 | 0 → 4 keys | 0 → 0 | 2 → 5 | 0 → 1 |
| Escape Pod | 11 → 15 | 1 → 4 | 1 → 4 | 0 → 3 keys | 0 → 0 | 1 → 4 | 0 → 1 |
| MarsCorp | 11 → 15 | 1 → 4 | 2 → 4 | 0 → 3 keys | 0 → 0 | 1 → 4 | 0 → 1 |
| WOE.BEGONE | 10 → 15 | 1 → 4 | 0 → 4 | 0 → 3 keys | 0 → 1 | 2 → 5 | 0 → 1 |
| The Way We Haunt Now | 10 → 15 | 1 → 4 | 0 → 4 | 0 → 3 keys | 0 → 0 | 1 → 4 | 0 → 1 |
| The Dragoning | 14 → 15 | 4 → 4 | 4 → 4 | 4 → 4 keys | 2 → 2 | 0 → 2 | 1 → 1 |
| Uncanny Valley | 10 → 16 | 1 → 4 | 0 → 4 | 0 → 3 keys | 0 → 0 | 0 → 3 | 0 → 1 |
| **Batch mean / total** | **10.8 → 15.2** | **13 → 40 facet groups** | **10 → 39 keys** | **4 → 32 keys** | **2 → 3 notes** | **11 → 38 memberships** | **1 → 10** |

The catalog-wide deltas are:

| Measurement | Before | After | Change |
| --- | ---: | ---: | ---: |
| Published shows | 752 | 752 | unchanged |
| Enrichment-eligible / imported / editorial | 235 / 517 / 7 | 235 / 517 / 7 | unchanged |
| Shows with at least one collection | 364/752 | 367/752 | +3 |
| Shows with at least two collections | 212/752 | 219/752 | +7 |
| Shows with three or more useful facet groups | 190/752 | 199/752 | +9 |
| Curated discovery profiles | 154/752 | 160/752 | +6 |
| Tone coverage | 191/752 | 200/752 | +9 |
| Themes or content-note coverage | 193/752 | 202/752 | +9 |
| Best-for coverage | 190/752 | 199/752 | +9 |
| Similar-show source coverage | 189/752 | 198/752 | +9 |
| Authored similarity links / written reasons | 390/390 | 399/399 | +9 / +9 |
| Shows with authored outgoing routes | 189 | 198 | +9 |
| Collection membership edges | 959 | 986 | +27 |
| Shows without collection membership | 388 | 385 | -3 |
| Strict computed source shows / edges | 108/179 | 115/191 | +7 / +12 |
| Actionable eligible candidates | 142 | 140 | -2 |

The per-show `Authored similar links` column counts outgoing authored links from each selected record; the catalog-wide authored totals count all authored links and their written reasons. The generated discovery report leaves 140 actionable candidates in the full queue after this batch. Imported records remain outside the editorial work queue.

## 7. Strict computed-similarity qualification

The public policy remains unchanged: score at least 20; pair, source, and target metadata coverage at least 0.65; at least three metadata dimensions; at least two anchor dimensions; at least two specific discovery dimensions; at least two explanation reasons; and a maximum of two public computed matches per source. Authored links and curated similarity evidence are excluded from this computation.

The selected records that clear the strict public computed gate after Batch 13 are:

- The Last Movie → [TANIS](../../catalog-src/shows/tanis.json) (31.7), [Video Palace](../../catalog-src/shows/video-palace.json) (21.7). The top explanations are shared Public Radio Alliance production context plus shared tense/weird or cinematic and late-night/headphones-on signals.
- The Other Stories → [The Liminal Lands](../../catalog-src/shows/the-liminal-lands.json) (21.8), supported by shared dark/tense/weird tone and horror discovery tagging.
- The Wyrd Side → [The Love Talker](../../catalog-src/shows/the-love-talker.json) (20.8) and [Steal the Stars](../../catalog-src/shows/steal-the-stars.json) (20.3), supported by tone and genre/tag overlap.
- WOE.BEGONE → [The Call of the Void](../../catalog-src/shows/the-call-of-the-void.json) (20.0), supported by dark/tense/weird tone and science-fiction discovery tagging.
- The Way We Haunt Now → [The Two Princes](../../catalog-src/shows/the-two-princes.json) (20.9), supported by warm/hopeful tone and found-family tagging.
- Uncanny Valley → [The Hidden People](../../catalog-src/shows/the-hidden-people.json) (24.2) and [The Patron Saint of Suicides](../../catalog-src/shows/the-patron-saint-of-suicides.json) (23.5), supported by typed Realm/Dayton Writers Movement evidence and tone overlap.

Doctor Who: Redacted, Escape Pod, MarsCorp, and The Dragoning did not clear the strict computed gate in this snapshot. A computed match is a transparent archive signal, not an authored editorial recommendation; none of these results were written into `similarTo`.

The reconstructed pre-Batch 13 state had 108 strict computed source shows and 179 edges, with none of the ten selected records qualifying. The post-batch state has 115 strict computed source shows and 191 edges.

## 8. Graph and collection health

The post-build collection-candidate report contains 986 materialized membership edges, 367 shows with membership, 385 without membership, and 7,470 candidate edges across 328 shows. It reports zero invalid collection references, no near-duplicate collection pair, and a low-membership threshold of seven. Drama and serialized remain the broad underrepresented catalog areas at 45.1% and 49.1% coverage respectively. Candidate edges remain a review signal; no automatic memberships were accepted.

The post-build similarity report contains 399 authored links with 399 written reasons. Signal coverage is tone 200, theme 202, best-for 199, voice style 155, narrative focus 157, intensity 199, and commitment 150 out of 752 published records. The diagnostic scorer returned 180,638 candidate results with a 7.5–64.1 score range, 10.35 average, and 9.8 median. These diagnostics use the existing policy and are distinct from the stricter 115-source / 191-edge public computed gate above.

The entity graph remains at 132 public entities, 318 relationship records, and 266 linked shows; 486 shows have no entity relationship. No invalid or unresolved entity links were introduced, and the existing 43 type/role divergence warnings remain.

The catalog report remains at Gate B complete, zero blocking errors, six missing RSS fields, 25 documented research-gap records, zero actionable RSS gaps, and clean generated-output drift. The report's weak-collection-coverage measure remains 533; this is a broader quality diagnostic than the 385 shows with no collection membership used above.

This batch adds usable routes for conspiracy investigation, short-form literary genre fiction, regional folklore, licensed time travel, science-fiction magazines, workplace space comedy, ARG-shaped mystery, cozy afterlife stories, and isolated supernatural horror. It leaves unresolved entity evidence, lifecycle uncertainty, and uncollected records for later source review rather than filling gaps mechanically.

## 9. Rejected or deferred decisions

- No new controlled tags were added; the existing factual tags and free-text themes supplied the needed discovery signals.
- No entity links were added for the production companies, networks, publishers, or broadcasters associated with these records. Entity promotion remains a separate source-backed registry task.
- Existing rule-based and similarity-collection memberships were not manually edited.
- No release or completion state was inferred from current provider pages, episode counts, or old feed activity. Doctor Who: Redacted and The Way We Haunt Now retain their existing lifecycle values; the collection reason for Doctor Who describes its bounded observed run without changing lifecycle metadata.
- The Other Stories and Escape Pod were placed in long-walks and easy-entry routes from their short-story form and depth, not from an inferred completion state.
- No content notes were added for the other horror or supernatural records where the checked source did not provide a sufficiently specific warning set. WOE.BEGONE's single violence cue is intentionally limited to its official violent-game premise.
- The Dragoning received no new profile, facet, content, content-note, or authored-similarity values because its packet was already complete; only the missing warm-weird and fantasy-detour graph routes were added.
- No ratings, reviews, verification states, factual metadata, lifecycle fields, similarity thresholds, collection rules, or public explanation policies were changed.

## 10. Validation and worktree boundary

Commands run after the canonical source edits:

- `npm run build:catalog` — passed; built artifacts for 752 shows, 46 collections, and 7 review companions.
- `npm run validate:data` — passed with 0 integrity errors across 752 shows, 46 collections, 132 entities, and 7 review companions. The existing 43 entity type/role divergence warnings remain; no invalid or unresolved entity links were introduced.
- `npm run report:discovery-quality` — passed; 367 shows with collections, 219 with at least two collections, 199 with three or more useful facet groups, 160 curated profiles, and 140 actionable candidates.
- `npm run report:similarity` — passed; 399 authored links with 399 written reasons and the unchanged similarity policy.
- `npm run report:collection-candidates` — passed; 986 membership edges, 385 shows without membership, 7,470 candidate edges across 328 shows, and 0 invalid references.
- `npm run report:entity-graph` — passed; 132 public entities, 318 relationship records, 266 linked shows, and 486 zero-relationship shows. No entity links were added.
- `npm run report:catalog` — passed; Gate B complete, 0 blocking errors, 0 actionable RSS gaps, 25 documented research-gap records, and generated-output drift clean.
- `git diff --check` — passed.
- Focused catalog/discovery/similarity/candidate tests — passed: 40/40.
- A read-only Node comparison reconstructed the pre-Batch 13 graph and confirmed the strict computed-similarity delta from 108/179 to 115/191, with the selected computed matches listed above; no scorer or policy files were changed.

The worktree retains prior Phase 3 changes plus the ten Batch 13 show-source edits, ten curated collection-source updates, expected rebuilt catalog/search/status artifacts, and this QA report. No commit, push, deployment, or publication was performed. The queue still contains meaningful evidence-review work, so no stopping condition was reached.
