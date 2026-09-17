# Phase 3 Batch 15 — Discovery Enrichment QA

Date: 2026-09-17  
Scope: ten published, enrichment-eligible show records and eleven curated collection sources  
Status: local source and generated-catalog validation only; not committed, deployed, or published

## 1. Scope and guardrails

Batch 15 continues the Phase 3 discovery-enrichment sequence after Batch 14. The post-Batch 14 queue contained 134 actionable eligible records. This batch selects ten records from the leading opportunity queue while widening the listening routes: supernatural and survival thrillers, alternate-history fantasy, AI horror, dark comedy, dreamscape horror, warm science fiction, dystopian science fiction, paranormal docudrama, and a classic epistolary adaptation.

The existing source-of-truth rules were preserved:

- `catalog-src/shows/` and `catalog-src/collections/` remain authoritative; generated `data/` and `docs/generated/` files were rebuilt normally.
- Discovery values were added only where the record, existing objective source metadata, and an official, creator, publisher, provider, or feed source supported a useful classification.
- Every new `similarTo` edge received an explicit directional reason. Reciprocal copying was not used as a substitute for editorial judgment.
- The similarity scorer, public computed-match gate, thresholds, weights, and explanation policy were not changed. Computed candidates were not promoted into authored relationships.
- No raw creator, network, publisher, provider, or broadcaster string was promoted to a new typed entity relationship.
- No rating, review, community score, creator-verification claim, factual tag, genre, format, listen link, or lifecycle correction was added.
- Imported/factual-only records were not edited. Existing typed entity relationships and provenance were not rewritten.
- Rule-based collections and existing similarity-collection materialization were not manually changed. Only curated collection sources were extended.
- Content notes were added only where the checked official or provider source supported a bounded warning set: The Hatred, Deviser, How to Win Friends and Disappear People, and Liminal.

## 2. Selection analysis

The post-Batch 14 snapshot contained 752 published shows, 235 enrichment-eligible records, 368 shows with at least one collection, 384 without membership, and 134 actionable enrichment candidates. The selected records combine the leading sparse opportunities with different discovery functions, rather than repeating one horror or science-fiction pattern. Existing collection coverage was retained; new placements were added only when a curated route matched a source-backed premise, listening form, or commitment profile.

| Record | Discovery function | Why this batch included it |
| --- | --- | --- |
| [The Hatred | A Supernatural Thriller Miniseries](../../catalog-src/shows/the-hatred-a-supernatural-thriller-miniseries.json) | Supernatural thriller miniseries | Adds a short, high-pressure curse and mistaken-identity route to the late-night and finished-thriller paths. |
| [Carrier](../../catalog-src/shows/carrier.json) | Immersive highway survival thriller | Adds a compact unknown-cargo route with strong headphones and survival intent. |
| [Artifacts of the Arcane](../../catalog-src/shows/artifacts-of-the-arcane.json) | Alternate-history fantasy serial | Adds a magic-returning Manhattan route with worldbuilding and long-listen value. |
| [Deviser](../../catalog-src/shows/deviser.json) | One-person AI science-fiction horror | Adds a compact, serious-sci-fi route grounded in recolonization, identity, and survival. |
| [How to Win Friends and Disappear People](../../catalog-src/shows/how-to-win-friends-and-disappear-people.json) | Dark supernatural character comedy | Adds a vampire/familiar relationship route with mystery, codependency, and adult tone. |
| [Liminal](../../catalog-src/shows/liminal.json) | Cerebral dreamscape horror miniseries | Adds a short, easy-entry altered-reality route with a clear four-episode commitment. |
| [The Chronicles of Astrimos](../../catalog-src/shows/the-chronicles-of-astrimos.json) | Warm full-cast science-fiction adventure | Adds missing curated routes around easy entry, short commitment, and worldbuilding; its core packet was already present. |
| [The Strata](../../catalog-src/shows/the-strata.json) | Dystopian ensemble science fiction | Adds a deep, systems-and-survival route anchored in a class-divided metropolis. |
| [The Subjective Truth](../../catalog-src/shows/the-subjective-truth.json) | Paranormal investigative docudrama | Adds a missing-person and high-strangeness route with a warmer comic edge. |
| [Re: Dracula](../../catalog-src/shows/re-dracula.json) | Epistolary gothic adaptation | Adds a compact, full-cast classic-literature route with strong late-night atmosphere. |

## 3. Evidence anchors checked

These sources supported premise, setting, form, production framing, route length, or the bounded content-note decisions. They were not used to fabricate ratings, verification, or lifecycle state.

| Record | Source anchor and supported signal |
| --- | --- |
| The Hatred | [Radio Madhouse show page](https://radiomadhouse.com/main/the-hatred/) and [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/the-hatred-a-supernatural-thriller-miniseries/id1809248562) — original supernatural thriller, Dave Kelly, mistaken identity, curse, and miniseries framing. |
| Carrier | [QCODE show page](https://qcodemedia.com/carrier), [Dan Blank's creator page](https://www.heydanblank.com/carrier), and [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/carrier/id1468956772) — truck-driver premise, unknown trailer, lonely highway, immersive scripted thriller, and observed short run. |
| Artifacts of the Arcane | [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/artifacts-of-the-arcane/id1767476635) and [Jake Kerr's official site](https://jakekerr.com/) — alternate-history Manhattan, returning magic, Tommy Black, magical artifacts, and full-cast fantasy serial context. |
| Deviser | [Official show site](https://www.deviser.ca/), [About page](https://www.deviser.ca/about/), [official content warnings](https://www.deviser.ca/content-warnings/), and [Rusty Quill show page](https://rustyquill.com/show/deviser/) — AI, recolonization, Son's identity, one-person acted format, and the explicit violence/self-harm/mature-themes boundary. |
| How to Win Friends and Disappear People | [QCODE show page](https://qcodemedia.com/how-to-win-friends-and-disappear-people) and [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/how-to-win-friends-and-disappear-people/id1666596092) — Nancy and El, vampire/familiar relationship, New York setting, full-cast supernatural thriller, and provider warning cues. |
| Liminal | [Acorn Arts & Entertainment show page](https://www.acornartsandentertainment.com/liminal) — “a horror podcast mini series,” four episodes, cerebral horror/science fiction, dreamscape premise, and the source's drug-reference boundary. |
| The Chronicles of Astrimos | [Echoverse official page](https://www.echoverse.com/the-chronicles-of-astrimos) and [Simplecast feed](https://chronicles-of-astrimos.simplecast.com/) — inherited LP, Martin Jennison, parallel radio-serial world, full-cast adventure, and existing content packet. |
| The Strata | [Official show site](https://www.thestratapodcast.com/) and [official subscribe page](https://www.thestratapodcast.com/subscribe) — dystopian metropolis, courier and underworld framing, connected ensemble, and serialized science-fiction route. |
| The Subjective Truth | [Good Pointe official show page](https://goodpointepodcasts.com/the-subjective-truth), [Good Pointe home](https://goodpointepodcasts.com/), and [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/the-subjective-truth-an-audio-drama/id1476957977) — Carson National Forest, Graham Anderson, missing-person investigation, high strangeness, and paranormal docudrama framing. |
| Re: Dracula | [Official project site](https://redracula.live/) and [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/re-dracula/id1679833472) — Bram Stoker adaptation, diaries/letters/telegrams, full-cast production, chronological real-time release framing, and compact observed route. |

## 4. Enrichment decisions

All ten records received a coherent discovery packet. Existing content on The Chronicles of Astrimos was retained rather than rewritten; the other nine records received new structured content where the source framing was clear.

| Record | Tones / themes | Best-for routes | Profile | Authored similarity |
| --- | --- | --- | --- | --- |
| The Hatred | `dark`, `tense`, `cinematic`; mistaken identity, grief and revenge, supernatural curse | short under five hours, late night, headphones on, binge listening | primarily acted; plot-driven; high; short | The Edge of Sleep |
| Carrier | `dark`, `tense`, `cinematic`; isolated highway, unknown cargo, survival and trust | short under five hours, headphones on, late night, binge listening | primarily acted; plot-driven; high; short | The Edge of Sleep |
| Artifacts of the Arcane | `cinematic`, `weird`, `hopeful`; forgotten magic and industrialization, alternate-history Manhattan, family legacy and magical artifacts | worldbuilding, long walks, headphones on, binge listening | primarily acted; plot-driven; medium; deep dive | The Thieves Guild |
| Deviser | `dark`, `tense`, `weird`; AI and humanity, recolonization and survival, identity and self-knowledge | serious sci-fi, short under five hours, late night, headphones on | primarily acted; plot-driven; high; short | Malevolent |
| How to Win Friends and Disappear People | `dark`, `funny`, `weird`; vampire and familiar bond, toxic friendship and codependency, identity and belonging | late night, headphones on, binge listening | primarily acted; character-driven; medium; medium | The Horror of Dolores Roach; The Amelia Project |
| Liminal | `dark`, `tense`, `weird`; dreamscape and altered reality, brotherhood and rescue, identity and perception | short under five hours, easy entry, headphones on, binge listening | primarily acted; plot-driven; high; short | The Call of the Void |
| The Chronicles of Astrimos | `funny`, `cinematic`, `hopeful`; family legacy and memory, alternate worlds, space rescue and survival | easy entry, short under five hours, worldbuilding, headphones on | primarily acted; plot-driven; medium; short | The Strange Case of Starship Iris; Midnight Burger |
| The Strata | `dark`, `tense`, `cinematic`; dystopian class divide, courier and criminal underworld, health and survival under scarcity | serious sci-fi, long walks, worldbuilding, headphones on, binge listening | primarily acted; balanced; high; deep dive | The Program Audio Series |
| The Subjective Truth | `tense`, `weird`, `funny`; missing-person investigation, contested reality, paranormal theories and high strangeness | late night, headphones on, binge listening | mixed; plot-driven; variable; medium | Rabbits |
| Re: Dracula | `dark`, `tense`, `cinematic`; Dracula adaptation, epistolary storytelling, gothic horror | short under five hours, late night, headphones on, binge listening | primarily acted; plot-driven; high; short | The Night Post |

The authored reasons are directional and source-specific:

- The Hatred → The Edge of Sleep: both are compact supernatural thrillers that turn an ordinary protagonist's situation into a widening high-pressure mystery; The Hatred centers mistaken identity and a curse, while The Edge of Sleep makes sleep itself the survival problem.
- Carrier → The Edge of Sleep: both are immersive, compact survival thrillers where an everyday journey becomes a high-concept threat; Carrier stays on a lonely highway with an unknown trailer.
- Artifacts of the Arcane → The Thieves Guild: both are Jake Kerr's full-cast fantasy serials with large magical worlds and clear central quests; Artifacts shifts the route into an alternate 1938 Manhattan where magic is returning.
- Deviser → Malevolent: both come from Harlan Guthrie and turn existential pressure into dark, mystery-shaped horror; Deviser is the tighter science-fiction branch built around AI, recolonization, and a shipboard discovery.
- How to Win Friends and Disappear People → The Horror of Dolores Roach: both turn outsider survival and reinvention into dark supernatural stories with a sharp social edge; How to Win Friends keeps its danger in Nancy and El's vampire-familiar relationship.
- How to Win Friends and Disappear People → The Amelia Project: both use a strange, secretive relationship to drive a funny mystery route; How to Win Friends moves that chemistry into a darker vampire thriller in contemporary New York.
- Liminal → The Call of the Void: both are Acorn science-fiction horror dramas with a strong psychological edge; Liminal keeps the pressure on a four-episode dreamscape rescue.
- The Chronicles of Astrimos → The Strange Case of Starship Iris: both are full-cast serialized science-fiction adventures with ensemble energy; Astrimos adds a parallel 1960s-radio-serial frame.
- The Chronicles of Astrimos → Midnight Burger: both offer a warmer, funnier route through expansive science fiction; Astrimos pairs its space drama with a contemporary mystery and classic-radio flavor.
- The Strata → The Program Audio Series: both explore systems, control, and survival in speculative worlds; The Strata grounds that pressure in an ageing courier and class-divided city.
- The Subjective Truth → Rabbits: both begin with a disappearance and widen into conspiratorial questions about reality; The Subjective Truth takes a paranormal docudrama route through treasure hunting and high strangeness.
- Re: Dracula → The Night Post: both use atmospheric supernatural settings and ensemble voice-led storytelling; Re: Dracula is a chronological classic adaptation, while The Night Post follows an original arcane frontier.

Structured content packets record only the supported framing:

- The Hatred: original fiction; ordinary life disrupted by a supernatural curse; Dave Kelly's investigation through mistaken-identity encounters; serialized supernatural thriller miniseries.
- Carrier: original fiction; a dark and lonely highway; a truck driver's journey with an unknown trailer; seven-part immersive scripted thriller.
- Artifacts of the Arcane: original fiction; alternate-history 1938 Manhattan where magic is nearly forgotten; Tommy Black and allies escaping with the Staff of Light; full-cast fantasy serial audiobook.
- Deviser: original fiction; spaceship bound for Earth after an attempt to recolonize it; Son's awakening and discovery; one-person acted science-fiction horror miniseries.
- How to Win Friends and Disappear People: original fiction; millennial New York City; Nancy's relationship with a mysterious neighbor and vampire familiar; ten-episode full-cast supernatural thriller.
- Liminal: original fiction; a terrifying dreamscape reached through a science-fiction premise; Dominic and Caleb trying to pull their brother back; four-episode cerebral horror mini-series.
- The Chronicles of Astrimos: existing original-fiction, setting, point-of-view, and framing-device values retained; no factual rewrite was needed.
- The Strata: original fiction; dystopian metropolis The Strata; connected stories anchored by an ageing courier and underworld ganglord; serialized science-fiction drama.
- The Subjective Truth: original fiction; Carson National Forest and high-strangeness cases; Graham Anderson investigating Buddha Kline's disappearance; serialized paranormal docudrama.
- Re: Dracula: Bram Stoker's novel; the story's locations and documents; full cast voicing diaries, letters, telegrams, and other documents; chronological adaptation released in real time.

## 5. Curated collection placements

The batch adds 39 curated membership edges. Existing rule/similarity memberships were regenerated from unchanged inputs and are not counted as authored batch edits.

| Collection | Added records |
| --- | --- |
| Best for long walks | Artifacts of the Arcane; The Strata |
| Start here | Liminal; The Chronicles of Astrimos |
| Serious sci-fi | Deviser; The Strata |
| Late-night tension | The Hatred; Carrier; Deviser; How to Win Friends and Disappear People; The Strata; The Subjective Truth; Re: Dracula |
| Headphones-on immersion | The Hatred; Carrier; Artifacts of the Arcane; Deviser; How to Win Friends and Disappear People; Liminal; The Strata; The Subjective Truth; Re: Dracula |
| Quick first listens | The Hatred; Carrier; Deviser; Liminal; The Chronicles of Astrimos; Re: Dracula |
| Worldbuilding deep dives | Artifacts of the Arcane; The Chronicles of Astrimos; The Strata |
| Fantasy detours and hidden worlds | Artifacts of the Arcane |
| Short finished thrillers | The Hatred; Carrier |
| Comedy with a mystery | How to Win Friends and Disappear People; The Subjective Truth |
| Survival pressure | Carrier; Deviser; The Strata |

Every new curated edge carries a collection-specific `showReasons` explanation in the canonical collection source. No rule or similarity collection source was manually edited.

## 6. Before/after metrics

The baseline is the catalog immediately after Batch 14, reconstructed from the current source state by removing only Batch 15 discovery/content fields and the 39 Batch 15 curated memberships. Quality uses the existing 17-dimension discovery-quality score. Facet groups are tones, tags, best-for routes, and similar-show links. Profile keys are the four optional discovery-profile keys. Collection counts include existing rule/similarity memberships so the table describes the actual public catalog surface.

| Show | Quality | Facet groups | Profile keys | Structured content | Content notes | Collections | Authored similar links |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| The Hatred | 10 → 14 | 1 → 4 | 3 → 4 | 0 → 4 keys | 0 → 2 | 1 → 5 | 0 → 1 |
| Carrier | 11 → 16 | 1 → 4 | 0 → 4 | 0 → 4 keys | 0 → 0 | 1 → 6 | 0 → 1 |
| Artifacts of the Arcane | 11 → 16 | 1 → 4 | 0 → 4 | 0 → 4 keys | 0 → 0 | 1 → 5 | 0 → 1 |
| Deviser | 11 → 16 | 1 → 4 | 0 → 4 | 0 → 4 keys | 0 → 3 | 2 → 7 | 0 → 1 |
| How to Win Friends and Disappear People | 11 → 16 | 1 → 4 | 0 → 4 | 0 → 4 keys | 0 → 3 | 1 → 4 | 0 → 2 |
| Liminal | 11 → 16 | 1 → 4 | 0 → 4 | 0 → 4 keys | 0 → 2 | 2 → 5 | 0 → 1 |
| The Chronicles of Astrimos | 11 → 16 | 1 → 4 | 0 → 4 | 4 → 4 keys | 0 → 0 | 4 → 7 | 0 → 2 |
| The Strata | 11 → 16 | 1 → 4 | 0 → 4 | 0 → 4 keys | 0 → 0 | 1 → 7 | 0 → 1 |
| The Subjective Truth | 11 → 16 | 1 → 4 | 0 → 4 | 0 → 4 keys | 0 → 0 | 1 → 4 | 0 → 1 |
| Re: Dracula | 11 → 16 | 1 → 4 | 0 → 4 | 0 → 4 keys | 0 → 0 | 1 → 4 | 0 → 1 |
| **Batch mean / total** | **10.9 → 15.8** | **10 → 40 facet groups** | **3 → 40 keys** | **4 → 40 keys** | **0 → 10 notes** | **15 → 54 memberships** | **0 → 12** |

The catalog-wide deltas are:

| Measurement | Before | After | Change |
| --- | ---: | ---: | ---: |
| Published shows | 752 | 752 | unchanged |
| Enrichment-eligible / imported / editorial | 235 / 517 / 7 | 235 / 517 / 7 | unchanged |
| Shows with at least one collection | 368/752 | 368/752 | unchanged |
| Shows with at least two collections | 226/752 | 233/752 | +7 |
| Shows with three or more useful facet groups | 209/752 | 219/752 | +10 |
| Curated discovery profiles | 169/752 | 178/752 | +9 |
| Tone coverage | 210/752 | 220/752 | +10 |
| Themes or content-note coverage | 212/752 | 222/752 | +10 |
| Best-for coverage | 209/752 | 219/752 | +10 |
| Similar-show source coverage | 208/752 | 218/752 | +10 |
| Authored similarity links / written reasons | 409/409 | 421/421 | +12 / +12 |
| Shows with authored outgoing routes | 208 | 218 | +10 |
| Collection membership edges | 1015 | 1054 | +39 |
| Shows without collection membership | 384 | 384 | unchanged |
| Actionable eligible candidates | 134 | 125 | -9 |
| Strict computed source shows / edges | 123/204 | 132/223 | +9 / +19 |

The generated discovery report leaves 125 actionable candidates in the full queue after this batch. Imported records remain outside the editorial work queue.

## 7. Strict computed-similarity qualification

The public policy remains unchanged: score at least 20; pair, source, and target metadata coverage at least 0.65; at least three metadata dimensions; at least two anchor dimensions; at least two specific discovery dimensions; at least two explanation reasons; and a maximum of two public computed matches per source. Authored links and curated similarity evidence are excluded from this computation.

The selected records that clear the strict public computed gate after Batch 15 are:

- The Hatred → [Carrier](../../catalog-src/shows/carrier.json) (22.8) and [Blackwood](../../catalog-src/shows/blackwood.json) (21.6).
- Carrier → [Blackout](../../catalog-src/shows/blackout.json) (31.7) and [From Now](../../catalog-src/shows/from-now.json) (29.3).
- Deviser → [Carrier](../../catalog-src/shows/carrier.json) (23.4) and [The Hatred](../../catalog-src/shows/the-hatred-a-supernatural-thriller-miniseries.json) (21.0).
- How to Win Friends and Disappear People → [Blackout](../../catalog-src/shows/blackout.json) (26.7) and [The Burned Photo](../../catalog-src/shows/the-burned-photo.json) (26.7).
- Liminal → [Wake up, New Vilirth](../../catalog-src/shows/wake-up-new-vilirth.json) (21.2) and [Rats Under Eden](../../catalog-src/shows/rats-under-eden.json) (20.9).
- The Chronicles of Astrimos → [Crystal Blue](../../catalog-src/shows/crystal-blue.json) (21.9) and [Oblivity](../../catalog-src/shows/oblivity.json) (20.0).

Artifacts of the Arcane, The Strata, The Subjective Truth, and Re: Dracula did not clear the strict computed gate in this snapshot. These are computed archive matches, not authored editorial recommendations; none of the computed results were written into `similarTo`.

The reconstructed pre-Batch 15 state had 123 strict computed source shows and 204 edges, with none of the ten selected records qualifying. The post-batch state has 132 strict computed source shows and 223 edges.

## 8. Graph and collection health

The post-build collection-candidate report contains 1,054 materialized membership edges, 368 shows with membership, 384 without membership, and 7,795 candidate edges across 331 unique shows. It reports zero invalid collection references, no near-duplicate collection pair, and a low-membership threshold of seven. Drama and serialized remain the broad underrepresented catalog areas at 45.3% and 49.3% coverage respectively. Candidate edges remain a review signal; no automatic memberships were accepted.

The post-build similarity report contains 421 authored links with 421 written reasons. Signal coverage is entity 266, genre 752, format 749, tone 220, theme 222, tag 235, best-for 219, voice style 174, narrative focus 175, intensity 217, commitment 169, release profile 283, shared collection 223, episode length 748, catalog length 751, and rating profile 27 out of 752 published records. The diagnostic scorer returned 184,088 candidate results with a 7.5–63.9 score range, 10.43 average, and 9.8 median; 2 sparse, 523 medium, and 227 enriched records. These diagnostics use the existing policy and are distinct from the stricter 132-source / 223-edge public computed gate above.

The entity graph remains at 132 public entities, 318 relationship records, and 266 linked shows; 486 shows have no entity relationship. No invalid or unresolved entity links were introduced, and the existing 43 type/role divergence warnings remain.

The catalog report remains at Gate B complete, zero blocking errors, six missing RSS fields, 25 documented research-gap records, zero actionable RSS gaps, and clean generated-output drift. The report's weak-collection-coverage measure is 519; this is a broader quality diagnostic than the 384 shows with no collection membership used above.

This batch adds usable routes for compact supernatural thrillers, unknown-cargo survival, alternate-history fantasy, AI horror, vampire relationship drama, dreamscape horror, warm radio-flavored science fiction, dystopian systems fiction, paranormal investigation, and epistolary gothic horror. It leaves unresolved entity evidence, lifecycle uncertainty, and uncollected records for later source review rather than filling gaps mechanically.

## 9. Rejected or deferred decisions

- No new controlled tags were added; the existing factual tags and free-text themes supplied the needed discovery signals.
- No entity links were added for the creators, production companies, networks, publishers, providers, or broadcasters associated with these records. Entity promotion remains a separate source-backed registry task.
- Existing rule-based and similarity-collection memberships were not manually edited.
- No release or completion state was inferred from current provider pages, episode counts, or feed activity. The selected records retain their existing lifecycle values.
- The short-finished-thrillers placements use the existing curated route and observed bounded thriller/miniseries evidence; they do not change lifecycle fields or assert a new completion fact.
- The Chronicles of Astrimos received no new content because its existing structured packet was already complete; its new work is limited to facet/profile and curated graph coverage.
- No additional content notes were added where the checked sources did not provide a sufficiently specific warning set. The four note-bearing records retain bounded source-supported wording only.
- No ratings, reviews, verification states, factual metadata, lifecycle fields, similarity thresholds, collection rules, or public explanation policies were changed.

## 10. Validation and worktree boundary

Commands run after the canonical source edits:

- `npm run build:catalog` — passed; built artifacts for 752 shows, 46 collections, and 7 review companions.
- `npm run validate:data` — passed with 0 integrity errors across 752 shows, 46 collections, 132 entities, and 7 review companions. The existing 43 entity type/role divergence warnings remain; no invalid or unresolved entity links were introduced.
- `npm run report:discovery-quality` — passed; 368 shows with collections, 233 with at least two collections, 219 with three or more useful facet groups, 178 curated profiles, and 125 actionable candidates.
- `npm run report:similarity` — passed; 421 authored links with 421 written reasons and the unchanged similarity policy.
- `npm run report:collection-candidates` — passed; 1,054 membership edges, 384 shows without membership, 7,795 candidate edges across 331 shows, and 0 invalid references.
- `npm run report:entity-graph` — passed; 132 public entities, 318 relationship records, 266 linked shows, and 486 zero-relationship shows. No entity links were added.
- `npm run report:catalog` — passed; Gate B complete, 0 blocking errors, 0 actionable RSS gaps, 25 documented research-gap records, and generated-output drift clean.
- `git diff --check` — passed.
- Focused catalog/discovery/similarity/candidate tests — passed: 40/40.
- A read-only Node comparison reconstructed the pre-Batch 15 graph and confirmed the strict computed-similarity delta from 123/204 to 132/223, with the selected computed matches listed above; no scorer or policy files were changed.

The worktree retains prior Phase 3 changes plus the ten Batch 15 show-source edits, eleven curated collection-source updates, expected rebuilt catalog/search/status artifacts, and this QA report. No commit, push, deployment, or publication was performed. The queue still contains meaningful evidence-review work, so no stopping condition was reached.
