# Phase 3 Batch 5 — Discovery Enrichment QA

Date: 2026-09-16  
Scope: ten published, enrichment-eligible show records and six curated collection sources  
Status: local source and generated-catalog validation only; not committed, deployed, or published

## 1. Scope and guardrails

Batch 5 continues the Phase 3 discovery-enrichment sequence after Batch 4. The selection was made from the current discovery-quality, similarity, collection-candidate, and entity-graph snapshots. It emphasizes warm and all-ages routes, podcast musicals, old-time-radio forms, narrated nature fiction, comedy mystery, historical crime, workplace superhero comedy, and a compact space-fantasy bridge. This broadens discovery without turning the catalog into a generic genre directory or adding another horror-heavy cluster.

The batch followed the existing source-of-truth rules:

- `catalog-src/shows/` and `catalog-src/collections/` remain authoritative; `data/` and `docs/generated/` were rebuilt normally.
- Editorial discovery fields were added only where the catalog record and an official, creator, or provider source supported a useful classification.
- Authored `similarTo` edges received explicit directional reasons. No reciprocal edge was added merely for symmetry.
- The similarity diagnostic and public computed-match policy were not changed. Computed candidates were not promoted into authored relationships.
- No entity relationship was inferred from a raw creator, network, or provider string.
- No archive rating, listener review, community score, creator-verification claim, lifecycle correction, or new controlled tag was added.
- Rule-based collections were not edited manually. Existing rule memberships remain materialized by the normal build.

## 2. Selection analysis

The post-Batch 4 snapshot contained 752 published shows, 318 shows with at least one collection, 434 without membership, and 235 enrichment-eligible records. The collection report continued to show underrepresented drama, serialized, episodic, and crime areas. The selection also used the rich-but-uncollected queue as a review signal without forcing every candidate into a broad collection.

| Record | Discovery function | Why this batch included it |
| --- | --- | --- |
| [Love and Luck](../../catalog-src/shows/love-and-luck.json) | Voicemail-led queer romance | Provides a gentle, community-care route with a distinctive fictional radio-play form. |
| [36 Questions](../../catalog-src/shows/36-questions.json) | Compact podcast musical | Adds a bounded relationship musical and an audio-form bridge to other original musicals. |
| [The Radio Adventures of Dr. Floyd](../../catalog-src/shows/the-radio-adventures-of-dr-floyd.json) | Family-friendly old-time-radio adventure | Adds an all-ages, educational time-travel route that is neither horror nor military science fiction. |
| [The CryptoNaturalist](../../catalog-src/shows/the-cryptonaturalist.json) | Narrated imaginary nature | Adds poetry, field reports, cryptids, and a low-intensity narrated route for walks and curious listeners. |
| [Fawx & Stallion](../../catalog-src/shows/fawx-stallion.json) | Historical comedy mystery | Adds an 1889 London detective route with source-backed rivalry, friendship, and queer historical context. |
| [Crooked River](../../catalog-src/shows/crooked-river.json) | Serious historical crime | Adds a compact 1930s Cleveland crime route with explicit violence and murder notes. |
| [Super Suits](../../catalog-src/shows/super-suits.json) | Superhero workplace comedy | Adds a law-firm ensemble route with heroes, villains, an AI, and relationship stakes. |
| [Fairies and Dragons, Ponies and Knights](../../catalog-src/shows/fairies-and-dragons-ponies-and-knights.json) | All-ages fantasy performance | Strengthens the welcoming fantasy branch through a dragon-egg quest, original music, and live-performance roots. |
| [The Nebulous Saga](../../catalog-src/shows/the-nebulous-saga.json) | Compact space fantasy | Adds a short revenge-and-grief route with a pirate, cursed powers, and a space-opera bridge. |
| [The Thrilling Adventure Hour](../../catalog-src/shows/the-thrilling-adventure-hour.json) | Staged old-time-radio anthology | Adds a deep, genre-shifting performance route that connects classic radio, space western, and supernatural mystery. |

## 3. Evidence anchors checked

These sources supported premise, setting, form, production framing, or content-note decisions. They were not used to fabricate ratings, verification, or lifecycle state.

| Record | Source anchor and supported signal |
| --- | --- |
| Love and Luck | [Official about page](https://www.loveandluckpodcast.com/about) — Melbourne setting, queer romance, magic, community care, and a fictional radio play told through voicemails. |
| 36 Questions | [Two-Up official podcast page](https://twoupproductions.com/36-questions/podcast) — three-part podcast musical centered on rescuing a marriage through the 36 questions. |
| The Radio Adventures of Dr. Floyd | [Official site](https://doctorfloyd.com/) — family-friendly old-time-radio format, Dr. Floyd, and educational history/time-travel framing. |
| The CryptoNaturalist | [Official about page](https://www.cryptonaturalist.com/about) — scripted fiction about imaginary nature, cryptids, poetry, field reports, and the classic nature-documentary tradition. |
| Fawx & Stallion | [Official press page](https://www.224bbaker.com/press) — 1889 London, overlooked detectives, comedy/mystery, and the show's stated comparison titles. |
| Crooked River | [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/crooked-river/id1626300977) — historical crime premise, Cleveland setting, fictional leads among real figures, episode scope, and mature content context. |
| Super Suits | [Faustian Nonsense official page](https://www.faustiannonsense.com/super-suits) — original audio comedy, superhero/villain law firm, Harper, Malcolm, L.O.I.S., and Megalopolis. |
| Fairies and Dragons, Ponies and Knights | [Dirt Road Theater official page](https://www.dirtroadtheater.com/fadpak) — all-ages episodic fantasy, dragon egg, live Zoom performance, guest artists, and original music. |
| The Nebulous Saga | [Official site](https://www.thenebuloussaga.com/) — space pirate Dolion, grief, cursed powers, the Nova Alliance, and the six-episode first route. |
| The Thrilling Adventure Hour | [Show Patreon page](https://www.patreon.com/thrillingadventurehour/about) — new time-podcast work in the style of old-time radio and the recurring genre-segment archive. |

## 4. Enrichment decisions

Each selected record received a coherent packet rather than isolated labels. The `content` object records distinctive setting, point of view, source material, and framing; the profile records voice, narrative focus, intensity, and commitment only where the listening shape was clear.

| Record | Tones / themes | Best-for routes | Profile | Curated routes | Authored similarity |
| --- | --- | --- | --- | --- | --- |
| Love and Luck | `warm`, `hopeful`; queer romance, community care, healthy relationships | easy entry, binge listening, warm weird | primarily acted; character-driven; low; long | Warm weird comfort | The Two Princes |
| 36 Questions | `melancholic`, `hopeful`, `cinematic`; marriage repair, intimacy, love and commitment | headphones on, short under five hours, easy entry | primarily acted; character-driven; medium; short | Quick first listens; Headphones-on immersion | Love and Luck; The Rats Under Eden |
| Dr. Floyd | `funny`, `warm`, `hopeful`; time travel, learning through adventure, hero-villain rivalry | long walks, easy entry, warm weird | primarily acted; plot-driven; low; long | Best for long walks; Warm weird comfort | The Thrilling Adventure Hour; FADPAK |
| The CryptoNaturalist | `warm`, `weird`, `funny`; imaginary nature, cryptids, poetry and field reports | easy entry, warm weird, long walks | primarily narrated; balanced; low; long | Best for long walks; Warm weird comfort | Welcome to Night Vale |
| Fawx & Stallion | `funny`, `warm`, `cinematic`; retained mystery plus rivalry/friendship, queer historical life, and police power/injustice | easy entry, binge listening, headphones on | primarily acted; character-driven; medium; long | None added; existing coverage retained | Victoriocity; Wooden Overcoats |
| Crooked River | `bleak`, `tense`, `cinematic`; post-Prohibition crime, Great Depression, real history and fictional leads; added graphic-violence, murder, and dismemberment notes | short under five hours, late night, headphones on | existing acted/plot-driven/high profile plus short commitment | Quick first listens | The Land Whale Murders |
| Super Suits | `funny`, `chaotic`, `warm`; superhero law, workplace friendship, powers and responsibility | binge listening, easy entry, warm weird | primarily acted; balanced; medium; medium | Ensemble chaos with heart | MarsCorp |
| FADPAK | `warm`, `hopeful`, `funny`; retained family/friendship/adventure plus community performance and imagination/play | easy entry, binge listening, warm weird | primarily acted; character-driven; low; long | Warm weird comfort; existing fantasy route retained | Dr. Floyd |
| The Nebulous Saga | `cinematic`, `tense`, `melancholic`; vengeance and grief, identity and humanity, space piracy and alliance | headphones on, short under five hours, worldbuilding | mixed; plot-driven; medium; short | Quick first listens; Fantasy detours and hidden worlds | StarTripper!!; The Orphans |
| The Thrilling Adventure Hour | `funny`, `warm`, `cinematic`; old-time-radio genre play, space western, supernatural mystery | long walks, binge listening, warm weird | primarily acted; balanced; medium; deep dive | Best for long walks | The Orbiting Human Circus |

No entity links were added. Existing typed entity links on Love and Luck and Super Suits were preserved; raw creator/network evidence remains in the separate factual research queue.

## 5. Before/after metrics

The baseline is the catalog immediately before Batch 5, reconstructed from the pre-batch source state and the post-Batch 4 generated artifacts. Quality uses the existing 17-dimension discovery-quality score. Facet groups are tones, tags, best-for routes, and similar-show links. Authored counts are directional `outgoing / incoming` counts.

| Show | Quality | Facet groups | Discovery keys | Collections | Authored out / in |
| --- | ---: | ---: | ---: | ---: | ---: |
| Love and Luck | 11 → 16 | 1 → 4 | 1 → 4 | 0 → 1 | 0/0 → 1/1 |
| 36 Questions | 11 → 16 | 1 → 4 | 0 → 4 | 1 → 3 | 0/0 → 2/0 |
| The Radio Adventures of Dr. Floyd | 10 → 15 | 1 → 4 | 0 → 4 | 1 → 3 | 0/0 → 2/1 |
| The CryptoNaturalist | 10 → 15 | 1 → 4 | 0 → 4 | 1 → 3 | 0/0 → 1/0 |
| Fawx & Stallion | 11 → 15 | 1 → 4 | 0 → 4 | 2 → 2 | 0/0 → 2/0 |
| Crooked River | 10 → 15 | 1 → 4 | 3 → 4 | 0 → 1 | 0/0 → 1/0 |
| Super Suits | 10 → 16 | 1 → 4 | 0 → 4 | 0 → 1 | 0/0 → 1/0 |
| FADPAK | 12 → 16 | 1 → 4 | 0 → 4 | 1 → 2 | 0/0 → 1/1 |
| The Nebulous Saga | 9 → 15 | 1 → 4 | 0 → 4 | 0 → 2 | 0/0 → 2/0 |
| The Thrilling Adventure Hour | 10 → 15 | 1 → 4 | 0 → 4 | 2 → 3 | 0/2 → 1/3 |
| **Batch mean / total** | **10.4 → 15.4** | **10 → 40 facet groups** | **4 → 40 keys** | **8 → 21 memberships** | **0/2 → 14/6** |

The table's collection total is the sum of each selected show's materialized memberships; authored totals count only links originating in the selected records. The catalog-wide deltas are:

| Measurement | Before | After | Change |
| --- | ---: | ---: | ---: |
| Shows with three or more useful facet groups | 111/752 | 121/752 | +10 |
| Curated discovery profiles | 84/752 | 92/752 | +8 |
| Tone coverage | 112/752 | 122/752 | +10 |
| Theme coverage | 117/752 | 125/752 | +8 |
| Best-for coverage | 111/752 | 121/752 | +10 |
| Similar-show coverage | 109/752 | 119/752 | +10 |
| Authored similarity links / written reasons | 306/306 | 320/320 | +14 / +14 |
| Shows with authored outgoing routes | 109 | 119 | +10 |
| Unique authored target shows | 85 | 92 | +7 |
| Collection membership edges | 761 | 774 | +13 |
| Shows with at least one collection | 318/752 | 322/752 | +4 |
| Shows with at least two collections | 152/752 | 157/752 | +5 |
| Strict computed source shows / edges | 55/94 | 58/97 | +3 / +3 |
| Public recommendation surface shows | 113/752 | 123/752 | +10 |

The current generated quality report also reports 114 enrichment-eligible shows missing at least one of tones, best-for routes, or similar-show links, down from the pre-batch 124. Imported/factual-only records remain outside the editorial queue.

## 6. Strict computed-similarity qualification

The public policy remains unchanged: score at least 20; pair, source, and target metadata coverage at least 0.65; at least three metadata dimensions; at least two anchor dimensions; at least two specific discovery dimensions; and at least two explanation reasons. Authored links and curated similarity evidence are excluded from this computation.

Before Batch 5, none of the selected records produced a strict public computed match. After enrichment, Crooked River qualifies for The Next 5 Minutes at 22.1 and Super Suits qualifies for The Land Whale Murders at 20.7. The other eight selected records remain below the public confidence floor. These are computed archive matches, not authored editorial recommendations.

Across the catalog, strict computed sources increased from 55 to 58 and edges from 94 to 97. The union of shows with an authored outgoing route or a strict computed route increased from 113 to 123; no thresholds, weights, or policy adapters changed.

## 7. Graph and collection health

The post-build collection-candidate report contains 774 membership edges, 322 shows with membership, 430 without membership, and 5,883 candidate edges across 316 shows. It continues to identify Small-town strange signals, Short finished thrillers, several similarity routes, and anthology/episodic routes as low-membership review areas. The rich-uncollected queue still includes The Invenios Expeditions, Mayfair Watchers Society, The McIlwraith Statements, and The Dragoning.

Poorly represented areas remain drama at 39.8% collection coverage, serialized at 41.9%, Crime at 42.9%, and episodic at 46.3%; Corporate remains 25%. These are prioritization signals, not instructions to pad collections.

Batch 5 adds new route shapes through queer community-care romance, original musical form, all-ages radio adventure, narrated imaginary nature, historical detective comedy, compact historical crime, superhero workplace ensemble, and space fantasy. It does not create a new top-target hub through reciprocal copying, and it leaves The Dragoning uncollected because no existing collection intent was specific enough.

## 8. Rejected or deferred decisions

- No new controlled tags were added; existing tags plus free-text themes supplied the needed discovery signals.
- No entity links were added; factual creator/network evidence remains a deliberate research queue.
- Fawx & Stallion received no extra collection membership because its existing routes already provided coverage and no additional intent was precise enough.
- Crooked River was placed in Quick first listens but not Short finished thrillers because its completion state remains unclear.
- The Nebulous Saga was placed in Quick first listens and Fantasy detours rather than being forced into Serious sci-fi; its strongest distinctive evidence is the compact space-fantasy quest.
- The all-ages and old-time-radio records were routed through warm, long-walk, and performance-oriented collections rather than broad genre-only placements.
- No ratings, reviews, verification states, listener claims, entity claims, similarity thresholds, collection rules, or public explanation policies were changed.

## 9. Validation and worktree boundary

Commands run after the source edits:

- `npm run build:catalog` — passed; built artifacts for 752 shows, 46 collections, and 7 review companions.
- `npm run validate:data` — passed with 0 integrity errors across 752 shows, 46 collections, 132 entities, and 7 review companions. The existing entity type/role divergence warnings remain; no invalid or unresolved entity links were introduced.
- `npm run report:discovery-quality -- --limit 12` — passed; 322 shows with collections, 121 with three or more useful facet groups, and 92 curated profiles.
- `npm run report:similarity -- --limit 12` — passed; 320 authored links with 320 written reasons and the unchanged similarity policy.
- `npm run report:collection-candidates -- --limit 12` — passed; 774 membership edges and 430 shows without membership.
- `npm run report:entity-graph -- --limit 12` — passed; 132 public entities, 318 known relationship records, 266 linked shows, and 486 zero-relationship shows. No entity links were added.
- `npm run report:catalog` — passed; Gate B complete, 0 blocking errors, 0 actionable RSS gaps, 25 documented research-gap records, and generated-output drift clean.
- `git diff --check` — passed.
- Focused catalog/discovery/similarity/candidate tests — passed: 40/40.

The worktree retains the prior Batch 4 changes plus the ten Batch 5 show sources, six Batch 5 collection sources, expected rebuilt catalog/search/status artifacts, and this QA report. No commit, push, deployment, or publication was performed.
