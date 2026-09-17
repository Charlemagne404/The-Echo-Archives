# Phase 3 Batch 10 — Discovery Enrichment QA

Date: 2026-09-17  
Scope: ten published, enrichment-eligible show records and nine curated collection sources  
Status: local source and generated-catalog validation only; not committed, deployed, or published

## 1. Scope and guardrails

Batch 10 continues the Phase 3 discovery-enrichment sequence after Batch 9. The post-Batch 9 queue still favored sparse horror and science-fiction records, so this batch mixes technology and grief science fiction, licensed superhero mystery, found-media horror, call-in folklore, family post-climate-change adventure, AI workplace drama, small-town comedy mystery, Antarctic isolation horror, an alien-heist anthology, and New Orleans speculative mystery.

The existing source-of-truth rules were preserved:

- `catalog-src/shows/` and `catalog-src/collections/` remain authoritative; generated `data/` and `docs/generated/` files were rebuilt normally.
- Discovery fields were added only where the record and an official, creator, publisher, or provider source supported a useful classification.
- Every new `similarTo` edge received an explicit directional reason. Reciprocal copying was not used as a substitute for editorial judgment.
- The similarity scorer, public computed-match gate, thresholds, weights, and explanation policy were not changed. Computed candidates were not promoted into authored relationships.
- No raw creator, network, or provider string was promoted to a typed entity relationship.
- No rating, review, community score, creator-verification claim, or lifecycle correction was added. In particular, The Call of the Void's official page says it is complete, but the catalog's existing lifecycle fields were left unchanged within this enrichment scope.
- Rule-based collections were not edited manually. Existing similarity-collection memberships were also left to their existing materialization; only curated collection sources were updated.
- Imported/factual-only records, objective descriptions, tags, genres, formats, listen links, entity fields, and provenance were not rewritten.

## 2. Selection analysis

The post-Batch 9 snapshot contained 752 published shows, 235 enrichment-eligible records, 350 shows with at least one collection, 402 without collection membership, and 157 actionable enrichment candidates. The selected records were the leading sparse opportunities with evidence for distinct discovery routes, rather than ten mechanically similar horror or science-fiction entries.

| Record | Discovery function | Why this batch included it |
| --- | --- | --- |
| [LifeAfter/The Message](../../catalog-src/shows/lifeafter-the-message.json) | Technology, grief, and alien-contact science fiction | Connects two short serialized dramas through alien cryptology, digital resurrection, institutional danger, and a close character mystery. |
| [Marvel's Wolverine: The Lost Trail](../../catalog-src/shows/marvels-wolverine-the-lost-trail.json) | Licensed New Orleans superhero mystery | Adds a direct sequel route with a full-cast investigation, missing humans and mutants, and redemption under pressure. |
| [The Storage Papers](../../catalog-src/shows/the-storage-papers.json) | Long-form recovered-evidence horror | Turns an abandoned storage unit and its documentation into a deep serialized paranormal archive, with explicit episode-level warnings available. |
| [A Voice From Darkness](../../catalog-src/shows/a-voice-from-darkness.json) | Call-in folklore and supernatural radio | Adds a voice-led, case-based route where a parapsychologist helps callers facing the supernatural and strange. |
| [Iowa Chapman and The Last Dog](../../catalog-src/shows/iowa-chapman-and-the-last-dog.json) | Family post-climate-change adventure | Adds a short, hopeful survival journey centered on a girl protecting a possible last dog in a world changed by climate collapse. |
| [Sandra](../../catalog-src/shows/sandra.json) | AI workplace and identity drama | Adds a compact scripted route about the company behind a popular artificial intelligence and the employee working behind the curtain. |
| [Sorry About The Murder](../../catalog-src/shows/sorry-about-the-murder.json) | Small-town comedy mystery | Adds an immediately legible hockey-town murder hook and a comic detective route outside the archive's supernatural-heavy mystery cluster. |
| [Station Blue](../../catalog-src/shows/station-blue.json) | Antarctic isolation horror | Adds a compact atmospheric route where identity, mental illness, grief, and a possibly supernatural research station overlap. |
| [Steal the Stars](../../catalog-src/shows/steal-the-stars.json) | Full-cast UFO and institutional-secrecy science fiction | Adds a serious science-fiction branch built around a crashed UFO, forbidden love, and an alien heist. |
| [The Call of the Void](../../catalog-src/shows/the-call-of-the-void.json) | Completed New Orleans speculative mystery | Adds a finished three-season route pairing a tour guide and palm-reading outcast against sudden insanity and a world-stilling entity. |

## 3. Evidence anchors checked

These sources supported premise, setting, form, production framing, route length, or content-note decisions. They were not used to fabricate ratings, verification, or lifecycle state.

| Record | Source anchor and supported signal |
| --- | --- |
| LifeAfter/The Message | [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/lifeafter-the-message/id1045990056) and [Panoply show page](https://panoply.fm/podcasts/themessage/) — two connected GE Podcast Theater/Panoply dramas, alien transmission, digital resurrection, technology limits, Ross's FBI perspective, and scripted fiction framing. |
| Marvel's Wolverine: The Lost Trail | [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/marvels-wolverine-the-lost-trail/id1343499710) and [Marvel's launch page](https://www.marvel.com/articles/podcasts/listen-to-marvel-s-wolverine-the-lost-trail-episode-1-now) — sequel to The Long Night, Logan's New Orleans redemption search, missing humans and mutants, and cast/production credits. |
| The Storage Papers | [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/the-storage-papers/id1474505415) and [official site](https://www.thestoragepapers.com/) — abandoned storage-unit documentation, independent fiction-horror framing, Jeremy's investigation, acting/production credits, and episode content warnings including horror, profanity, gore, possession, imprisonment, child peril, violence, demonic themes, hallucinations, and loud vocal effects. |
| A Voice From Darkness | [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/a-voice-from-darkness/id1476177944) and [official site](https://vfdarkness.com/) — horror audio drama in call-in-radio form, Dr. Malcolm Ryder, supernatural callers, American folklore/magical-realism positioning, and creator Jac Rhys. |
| Iowa Chapman and The Last Dog | [GZM Shows](https://gzmshows.com/shows/) and [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/iowa-chapman-and-the-last-dog/id1566566662) — GZM family-audio context, the girl-and-dog adventure, climate-changed future, risen seas, scarce resources, vanished animals, and the journey to Haven. |
| Sandra | [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/sandra/id1369393683) and [Gimlet show page](https://www.gimletmedia.com/sandra) — scripted Gimlet fiction, Helen's job at the company behind Sandra, AI/corporate/identity premise, and cast/production framing. |
| Sorry About The Murder | [Official show page](https://www.sorryaboutthemurder.ca/) — Beavermount, Ontario, a Zamboni driver solving a grisly murder, hockey-night stakes, and the show's comic local framing. |
| Station Blue | [Self Hunter Studio page](https://www.selfhunterstudio.com/station-blue) — audio-drama form, atmospheric isolation horror, remote Antarctica, caretaker Matthew Leads, identity and mental-illness themes, and possible supernatural presence. |
| Steal the Stars | [Macmillan Podcasts](https://podcasts.macmillan.com/podcast/stories-from-among-the-stars/) and [Macmillan's full-cast recording page](https://us.macmillan.com/books/9781427294913/stealthestars/) — science-fiction anthology framing, full original cast, forbidden love, crashed UFO, alien heist, and smart/compelling science-fiction positioning. |
| The Call of the Void | [Acorn Arts & Entertainment show page](https://www.acornartsandentertainment.com/thevoid) — New Orleans story, tour guide and palm-reading outcast, sudden insanity, entity seeking perfect stillness, scripted-podcast recognition, and completed three-season science-fiction audio-drama status. |

## 4. Enrichment decisions

Each selected record received a coherent packet. `content` records setting, point of view, source material, and framing; the discovery profile records voice, narrative focus, intensity, and commitment. The Storage Papers and Sorry About The Murder received content notes only where provider or publisher warnings were explicit.

| Record | Tones / themes | Best-for routes | Profile | New curated routes | Authored similarity |
| --- | --- | --- | --- | --- | --- |
| LifeAfter/The Message | `tense`, `cinematic`, `melancholic`; alien transmission and cryptology, digital resurrection and grief, technology versus institutional power | headphones on, late night, binge listening | primarily acted; balanced; high; medium | Serious sci-fi; Late-night tension; Headphones-on immersion | The Bright Sessions |
| Marvel's Wolverine: The Lost Trail | `dark`, `tense`, `cinematic`; redemption after trauma, missing humans and mutants, New Orleans investigation | late night, headphones on, binge listening | primarily acted; plot-driven; high; medium | Late-night tension; Headphones-on immersion | Marvel's Wolverine: The Long Night |
| The Storage Papers | `dark`, `tense`, `weird`; recovered documents and case files, paranormal events, everyday life hiding horror | headphones on, late night, binge listening | primarily acted; plot-driven; high; deep dive | Late-night tension; Headphones-on immersion; existing Found recordings and buried evidence retained | Archive 81 |
| A Voice From Darkness | `dark`, `tense`, `weird`; American folklore and magical realism, call-in supernatural cases, parapsychology and the strange | late night, headphones on, binge listening | primarily narrated; balanced; medium; medium | Late-night tension; Headphones-on immersion; existing Shows like The Magnus Archives route retained | The Magnus Archives |
| Iowa Chapman and The Last Dog | `hopeful`, `warm`, `tense`; climate change and overconsumption, girl-and-dog bond, survival and animal loss | short under five hours, easy entry, long walks | primarily acted; plot-driven; medium; short | Best for long walks; Start here; Quick first listens; Survival pressure | The Earth Collective |
| Sandra | `tense`, `weird`, `cinematic`; artificial intelligence and identity, corporate secrecy and labor, manufactured intimacy and escape | short under five hours, headphones on, serious sci-fi | primarily acted; character-driven; medium; short | Serious sci-fi; Headphones-on immersion; Quick first listens | LifeAfter/The Message |
| Sorry About The Murder | `funny`, `warm`, `chaotic`; small-town community, hockey and local identity, amateur detective work | easy entry, long walks, binge listening | primarily acted; plot-driven; medium; medium | Best for long walks; Start here; Comedy with a mystery; existing Ongoing Comedy route retained | Death by Dying |
| Station Blue | `dark`, `bleak`, `tense`; Antarctic isolation, identity and mental illness, grief and possible supernatural reality | cold isolation horror, short under five hours, headphones on, late night | mixed; character-driven; high; short | Cold isolation horror; Late-night tension; Headphones-on immersion; Quick first listens | The White Vault |
| Steal the Stars | `tense`, `cinematic`, `weird`; forbidden love and duty, crashed UFO and alien discovery, institutional secrecy and heist | serious sci-fi, headphones on, binge listening | primarily acted; plot-driven; high; medium | Serious sci-fi; Late-night tension; Headphones-on immersion | The Cipher |
| The Call of the Void | `dark`, `tense`, `weird`; New Orleans and sudden insanity, occult investigation and palm-reading, cosmic entity and perfect stillness | headphones on, late night, binge listening | primarily acted; plot-driven; high; long | Serious sci-fi; Late-night tension; Headphones-on immersion | The Lovecraft Investigations |

The Storage Papers content notes are: `general horror`, `profanity`, `gore`, `possession`, `imprisonment`, `adolescent in peril`, `implied death of a child`, `violence`, `demonic themes`, `hallucinations`, `loud sound effects`, and `yelling and screaming`. Sorry About The Murder carries the source warning set `violence`, `excessive drinking`, `outdated ideas`, and `murder`.

No entity links were added. Existing typed relationships, raw creator evidence, factual tags, and lifecycle fields remain unchanged.

## 5. Before/after metrics

The baseline is the catalog immediately after Batch 9, reconstructed from the current source state by removing only Batch 10 discovery/content fields and Batch 10 curated memberships. Quality uses the existing 17-dimension discovery-quality score. Facet groups are tones, tags, best-for routes, and similar-show links. Profile keys are the four optional discovery-profile keys. Collection counts include existing similarity/rule memberships so the table describes the actual public catalog surface.

| Show | Quality | Facet groups | Profile keys | Structured content | Collections | Authored out / in |
| --- | ---: | ---: | ---: | --- | ---: | --- |
| LifeAfter/The Message | 9 → 14 | 1 → 4 | 0 → 4 | absent → present | 1 → 4 | 0/0 → 1/0 |
| Marvel's Wolverine: The Lost Trail | 9 → 15 | 1 → 4 | 0 → 4 | absent → present | 0 → 2 | 0/0 → 1/0 |
| The Storage Papers | 9 → 14 | 1 → 4 | 0 → 4 | absent → present | 1 → 3 | 0/0 → 1/0 |
| A Voice From Darkness | 10 → 15 | 1 → 4 | 0 → 4 | absent → present | 1 → 3 | 0/0 → 1/0 |
| Iowa Chapman and The Last Dog | 10 → 16 | 1 → 4 | 0 → 4 | absent → present | 0 → 4 | 0/0 → 1/0 |
| Sandra | 10 → 16 | 1 → 4 | 0 → 4 | absent → present | 0 → 3 | 0/0 → 1/0 |
| Sorry About The Murder | 10 → 15 | 1 → 4 | 0 → 4 | absent → present | 1 → 4 | 0/0 → 1/0 |
| Station Blue | 10 → 16 | 1 → 4 | 0 → 4 | absent → present | 0 → 4 | 0/0 → 1/0 |
| Steal the Stars | 10 → 16 | 1 → 4 | 0 → 4 | absent → present | 0 → 3 | 0/0 → 1/0 |
| The Call of the Void | 10 → 16 | 1 → 4 | 0 → 4 | absent → present | 0 → 3 | 0/0 → 1/0 |
| **Batch mean / total** | **9.7 → 15.3** | **10 → 40 facet groups** | **0 → 40 keys** | **0 → 10** | **4 → 33 memberships** | **0/0 → 10/0** |

The catalog-wide deltas are:

| Measurement | Before | After | Change |
| --- | ---: | ---: | ---: |
| Published shows | 752 | 752 | unchanged |
| Enrichment-eligible / imported / editorial | 235 / 517 / 7 | 235 / 517 / 7 | unchanged |
| Shows with three or more useful facet groups | 161/752 | 171/752 | +10 |
| Curated discovery profiles | 125/752 | 135/752 | +10 |
| Tone coverage | 162/752 | 172/752 | +10 |
| Theme coverage | 164/752 | 174/752 | +10 |
| Best-for coverage | 161/752 | 171/752 | +10 |
| Similar-show source coverage | 159/752 | 169/752 | +10 |
| Authored similarity links / written reasons | 360/360 | 370/370 | +10 / +10 |
| Shows with authored outgoing routes | 159 | 169 | +10 |
| Collection membership edges | 884 | 913 | +29 |
| Shows with at least one collection | 350/752 | 356/752 | +6 |
| Shows with at least two collections | 192/752 | 202/752 | +10 |
| Eligible shows missing one or more of tone, best-for, or similar routes | 74 | 64 | -10 |
| Strict computed source shows / edges | 83/138 | 89/148 | +6 / +10 |
| Shows with an authored outgoing or strict computed route | 163 | 173 | +10 |

The generated discovery report leaves 151 actionable candidates in the full queue because typed-entity and other non-facet gaps remain; imported records remain outside that editorial queue.

## 6. Strict computed-similarity qualification

The public policy remains unchanged: score at least 20; pair, source, and target metadata coverage at least 0.65; at least three metadata dimensions; at least two anchor dimensions; at least two specific discovery dimensions; and at least two explanation reasons. Authored links and curated similarity evidence are excluded from this computation.

After Batch 10, selected records that clear the strict public computed gate include The Call of the Void → Badlands Cola and Wake up, New Vilirth!; Sandra → Motherhacker and Homecoming; Marvel's Wolverine: The Lost Trail → Blackout and Blood Ties; and Sorry About The Murder → The Land Whale Murders and Anticrastination. The other six selected records did not clear the strict computed gate in this snapshot. These are computed archive matches, not authored editorial recommendations; they do not alter `similarTo` or the public policy.

Across the catalog, strict computed sources increased from 83 to 89 and edges from 138 to 148. The union of shows with an authored outgoing route or a strict computed route increased from 163 to 173. No thresholds, weights, or policy adapters changed.

## 7. Graph and collection health

The post-build collection-candidate report contains 913 materialized membership edges, 356 shows with membership, 396 without membership, and 7,009 candidate edges across 328 shows. It reports zero invalid collection references, no near-duplicate collection pair, a low-membership threshold of seven, and drama/serialized as the broad underrepresented catalog areas. Candidate edges remain a review signal; no automatic memberships were accepted.

The entity graph remains at 132 public entities, 318 relationship records, and 266 linked shows; 486 shows have no entity relationship. No invalid or unresolved entity links were introduced, and the existing 43 type/role divergence warnings remain.

The batch raises route coverage for compact starts, family survival, small-town comedy mystery, AI workplace science fiction, cold isolation, serious science fiction, and after-dark headphone listening. It leaves richer uncollected records and unresolved entity evidence for later source review rather than assigning generic memberships.

## 8. Rejected or deferred decisions

- No new controlled tags were added; the existing factual tags and free-text themes supplied the needed discovery signals.
- No entity links were added for the production companies, networks, or publishers associated with these records. Entity promotion remains a separate source-backed registry task.
- Existing rule-based and similarity collection memberships were not manually edited.
- No completion or release status was inferred from provider labels, user reviews, old feeds, or an official page within this discovery-only batch. The Call of the Void's official completed-series language was used only in its content framing.
- The Storage Papers received condensed provider-backed warnings rather than every episode's full warning prose. No unsupported warning categories were added.
- Sorry About The Murder received its explicit source warning set, including outdated ideas, without turning the warning into a rating or quality judgment.
- Steal the Stars uses `science-fiction audio stories` as source material because the publisher describes the feed as an anthology of audio stories; no stronger adaptation/originality claim was added.
- The selected records were not added to broad or weakly supported collection routes such as generic worldbuilding, folk horror, or completed-show routes when the local lifecycle fields did not support that decision.
- No ratings, reviews, verification states, factual metadata, lifecycle fields, similarity thresholds, collection rules, or public explanation policies were changed.

## 9. Validation and worktree boundary

Commands run after the source edits:

- `npm run build:catalog` — passed; built artifacts for 752 shows, 46 collections, and 7 review companions.
- `npm run validate:data` — passed with 0 integrity errors across 752 shows, 46 collections, 132 entities, and 7 review companions. The existing entity type/role divergence warnings remain; no invalid or unresolved entity links were introduced.
- `npm run report:discovery-quality` — passed; 356 shows with collections, 171 with three or more useful facet groups, 135 curated profiles, and 64 eligible records missing at least one of tones, best-for, or similar-show routes.
- `npm run report:similarity -- --limit 12` — passed; 370 authored links with 370 written reasons and the unchanged similarity policy.
- `npm run report:collection-candidates` — passed; 913 membership edges, 396 shows without membership, 7,009 candidate edges across 328 shows, and 0 invalid references.
- `npm run report:entity-graph` — passed; 132 public entities, 318 known relationship records, 266 linked shows, and 486 zero-relationship shows. No entity links were added.
- `npm run report:catalog` — passed; Gate B complete, 0 blocking errors, 0 actionable RSS gaps, 25 documented research-gap records, and generated-output drift clean.
- `git diff --check` — passed.
- Focused catalog/discovery/similarity/candidate tests — passed: 40/40.

The worktree retains the prior Phase 3 changes plus the ten Batch 10 show sources, nine curated collection-source changes, expected rebuilt catalog/search/status artifacts, and this QA report. No commit, push, deployment, or publication was performed.
