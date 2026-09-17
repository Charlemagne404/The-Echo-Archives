# Phase 3 Batch 7 — Discovery Enrichment QA

Date: 2026-09-17  
Scope: ten published, enrichment-eligible show records and nine curated collection sources  
Status: local source and generated-catalog validation only; not committed, deployed, or published

## 1. Scope and guardrails

Batch 7 continues the Phase 3 discovery-enrichment sequence after Batch 6. The selection came from the current discovery-quality, similarity, collection-candidate, and entity-graph snapshots. It deliberately mixes comedy, dark comedy, cybercrime, radio apocalypse, branded mystery, queer surreal fiction, anthology horror, supernatural mystery, and political/speculative drama so the batch does not simply extend one horror or science-fiction cluster.

The existing source-of-truth rules were preserved:

- `catalog-src/shows/` and `catalog-src/collections/` remain authoritative; generated `data/` and `docs/generated/` files were rebuilt normally.
- Editorial discovery fields were added only where the record and an official, creator, publisher, or provider source supported a useful classification.
- Every new `similarTo` edge received an explicit directional reason. Reciprocal copying was not used as a substitute for editorial judgment.
- The similarity scorer, public computed-match gate, thresholds, weights, and explanation policy were not changed. Computed candidates were not promoted into authored relationships.
- No raw creator, network, or provider string was promoted to a typed entity relationship.
- No rating, review, community score, creator-verification claim, lifecycle correction, or new controlled tag was added.
- Rule-based collections were not edited manually. Existing rule memberships were materialized through the normal catalog build.

## 2. Selection analysis

The post-Batch 6 snapshot contained 752 published shows, 235 enrichment-eligible records, 326 shows with at least one collection, and 426 without collection membership. The quality and candidate reports continued to show weak coverage in drama, serialized, and episodic routes, while the current queue contained a large number of sparse horror and science-fiction records. The selected records were chosen for factual readiness, poor connectivity, route diversity, and bridge potential rather than broad genre-only placement.

| Record | Discovery function | Why this batch included it |
| --- | --- | --- |
| [Anticrastination](../../catalog-src/shows/anticrastination.json) | Podcast-within-a-podcast comedy | Adds a short, warm, chaotic comedy route with an unusually clear production premise. |
| [Death by Dying](../../catalog-src/shows/death-by-dying.json) | Dark small-town mystery comedy | Connects grief, strange deaths, and eccentric community discovery without relying on a conventional crime-procedural frame. |
| [Motherhacker](../../catalog-src/shows/motherhacker.json) | Compact cybercrime family thriller | Adds a phone-driven identity-theft route where economic desperation and family survival carry the stakes. |
| [Marvel's Wolverine: The Long Night](../../catalog-src/shows/marvels-wolverine-the-long-night.json) | Licensed serialized Alaskan murder mystery | Adds a cinematic investigative route and a bridge between branded fiction, serial mystery, and headphones-on listening. |
| [Blackout](../../catalog-src/shows/blackout.json) | Radio-framed infrastructure-collapse thriller | Adds a community-survival route whose radio perspective makes communication part of the premise. |
| [The Cipher](../../catalog-src/shows/the-cipher.json) | BBC sci-fi investigation | Adds a compact, high-production puzzle route built around a serial-killer investigation and possible alien contact. |
| [Petrified](../../catalog-src/shows/petrified.json) | Sound-rich Irish horror anthology | Adds a geographically specific folklore-and-fear branch with a changing cast and episodic structure. |
| [Dreamboy](../../catalog-src/shows/dreamboy.json) | Queer, music-forward surreal mystery | Adds a character-led route where music, dreams, transformation, and unexplained deaths are part of the discovery signal. |
| [Don't Mind](../../catalog-src/shows/dont-mind.json) | Place-bound supernatural mystery anthology | Adds a Fool & Scholar mystery route centered on displaced people, hostile places, and hidden histories. |
| [Wake up, New Vilirth!](../../catalog-src/shows/wake-up-new-vilirth.json) | Political dystopian sci-fi drama | Adds a short, full-cast speculative route grounded in debt, class conflict, political power, and return. |

## 3. Evidence anchors checked

These sources supported premise, setting, form, production framing, route length, or content-note decisions. They were not used to fabricate ratings, verification, or lifecycle state.

| Record | Source anchor and supported signal |
| --- | --- |
| Anticrastination | [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/anticrastination/id1895962344) and [official site](https://anticrastination.com/) — a fictional podcast team, goal-setting premise, and comedy framing. |
| Death by Dying | [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/death-by-dying/id1437812269) and [official site](https://deathbydyingpod.com/) — Crestfall, an obituary writer, strange deaths, dark comedy, and content warnings for gore and bodily harm. |
| Motherhacker | [Apple Podcasts listing](https://podcasts.apple.com/ca/podcast/motherhacker/id1487213874) — Bridget's phone-based vishing and identity-theft work, family pressure, and compact scripted form. |
| Marvel's Wolverine: The Long Night | [Marvel's official page](https://www.marvel.com/watch/digital-series/marvel-s-wolverine) and [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/marvels-wolverine-the-long-night/id1586688442) — Sally Pierce and Tad Marshall, Burns, Alaska, mysterious deaths, Logan, and serialized full-cast fiction. |
| Blackout | [QCODE official page](https://qcodemedia.com/blackout) — Simon, a small-town radio DJ, a nationwide grid collapse, and family/community survival. |
| The Cipher | [Apple Podcasts listing](https://podcasts.apple.com/gb/podcast/the-cipher/id1543887425) — Sabrina, the Parallax, a serial killer who may not be from this world, full cast, and sound-designed BBC fiction. |
| Petrified | [Acast show page](https://shows.acast.com/petrified) — horror fiction from a darker Ireland, written/directorial and production credits, and immersive sound-rich framing. |
| Dreamboy | [Night Vale Presents official page](https://www.nightvalepresents.com/dreamboy/) — Dane, Pepper Heights/Cleveland, the zoo, dreams, unexplained deaths, music, and performance-led surreal fiction. |
| Don't Mind | [Fool & Scholar official page](https://www.foolandscholar.com/sealskin-rock) and [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/dont-mind/id1578479107) — Cruxmont, Sealskin Rock, remote locations, anthology mystery, cast, and sound design. |
| Wake up, New Vilirth! | [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/wake-up-new-vilirth/id1821942072) and [official site](https://www.wakeupnewvilirth.com/) — Rhea, debt, wealthy and civic power, political climate, full-cast drama, and warnings for violence, abuse, and substance abuse. |

## 4. Enrichment decisions

Each selected record received a coherent packet rather than isolated labels. `content` records setting, point of view, source material, and framing; the discovery profile records voice, narrative focus, intensity, and commitment only where the listening shape was clear.

| Record | Tones / themes | Best-for routes | Profile | Curated routes | Authored similarity |
| --- | --- | --- | --- | --- | --- |
| Anticrastination | `funny`, `warm`, `chaotic`; self-esteem and validation, reinventing yourself, creative failure | easy entry, short under five hours, warm weird | primarily acted; character-driven; medium; short | Easy first steps; Quick first listens; existing ongoing-comedy route retained | World Gone Wrong |
| Death by Dying | `dark`, `funny`, `weird`; small-town secrets, death and grief, community in crisis | easy entry, late night, binge listening | primarily acted; balanced; medium; variable | Small-town strange signals; Comedy with a mystery; existing ongoing-comedy route retained | The Amelia Project |
| Motherhacker | `dark`, `tense`, `funny`; family survival, identity theft, economic desperation | short under five hours, late night, headphones on | primarily acted; plot-driven; medium; short | Easy first steps; Late-night tension; Headphones-on immersion; Quick first listens | Homecoming |
| Marvel's Wolverine: The Long Night | `dark`, `tense`, `cinematic`; Alaska investigation, serial killings, outsider identity | binge listening, late night, headphones on | primarily acted; plot-driven; high; short | Late-night tension; Headphones-on immersion; Quick first listens | Limetown |
| Blackout | `dark`, `tense`, `cinematic`; community after collapse, family survival, radio communication | long walks, late night, headphones on | primarily acted; plot-driven; high; medium | Best for long walks; Late-night tension; Survival pressure; Small-town strange signals | We're Alive |
| The Cipher | `tense`, `cinematic`, `weird`; cryptic puzzles, serial-killer investigation, alien contact | binge listening, late night, headphones on | primarily acted; plot-driven; high; short | Serious sci-fi; Headphones-on immersion; Quick first listens | The Lovecraft Investigations |
| Petrified | `dark`, `tense`, `cinematic`; ordinary lives under supernatural threat, darker Ireland, folklore and fear | headphones on, late night, binge listening | primarily acted; balanced; high; long | Late-night tension; Headphones-on immersion; Folk horror and old gods | The Truth |
| Dreamboy | `weird`, `dark`, `cinematic`; queer desire and identity, dreams and transformation, unexplained deaths | headphones on, late night, binge listening | primarily acted; character-driven; variable; medium | Late-night tension; Headphones-on immersion | The Big Loop |
| Don't Mind | `dark`, `tense`, `weird`; family displacement, haunted places, hidden histories | headphones on, late night, binge listening | primarily acted; balanced; high; long | Late-night tension; Headphones-on immersion | The White Vault |
| Wake up, New Vilirth! | `dark`, `tense`, `cinematic`; class conflict and debt, political power, return and consequence | serious sci-fi, worldbuilding, headphones on | primarily acted; plot-driven; high; short | Serious sci-fi; Headphones-on immersion; Quick first listens | Within the Wires |

The two content-note additions are limited to source-backed material: Death by Dying records gore, dead bodies, and bodily harm; Wake up, New Vilirth! records violence, abuse, and substance abuse. No entity links were added. Existing typed relationships were preserved, and raw creator/provider evidence remains outside the editorial enrichment scope.

## 5. Before/after metrics

The baseline is the catalog immediately before Batch 7, reconstructed from the post-Batch 6 generated artifacts. Quality uses the existing 17-dimension discovery-quality score. Facet groups are tones, tags, best-for routes, and similar-show links. Authored counts are directional `outgoing / incoming` counts.

| Show | Quality | Facet groups | Profile keys | Content signal | Collections | Authored out / in |
| --- | ---: | ---: | ---: | --- | ---: | ---: |
| Anticrastination | 10 → 15 | 1 → 4 | 0 → 4 | absent → present | 1 → 3 | 0/0 → 1/0 |
| Death by Dying | 10 → 15 | 1 → 4 | 0 → 4 | absent → present | 2 → 3 | 0/0 → 1/0 |
| Motherhacker | 9 → 15 | 1 → 4 | 0 → 4 | absent → present | 0 → 4 | 0/0 → 1/0 |
| Marvel's Wolverine: The Long Night | 9 → 15 | 1 → 4 | 0 → 4 | absent → present | 0 → 3 | 0/0 → 1/0 |
| Blackout | 9 → 15 | 1 → 4 | 0 → 4 | absent → present | 0 → 4 | 0/0 → 1/0 |
| The Cipher | 9 → 15 | 1 → 4 | 0 → 4 | absent → present | 0 → 3 | 0/0 → 1/0 |
| Petrified | 9 → 15 | 1 → 4 | 0 → 4 | absent → present | 0 → 3 | 0/0 → 1/0 |
| Dreamboy | 10 → 15 | 1 → 4 | 0 → 4 | absent → present | 0 → 2 | 0/0 → 1/0 |
| Don't Mind | 10 → 15 | 1 → 4 | 0 → 4 | absent → present | 0 → 2 | 0/0 → 1/0 |
| Wake up, New Vilirth! | 9 → 15 | 1 → 4 | 0 → 4 | absent → present | 0 → 3 | 0/0 → 1/0 |
| **Batch mean / total** | **9.4 → 15.0** | **10 → 40 facet groups** | **0 → 40 keys** | **0 → 10** | **3 → 30 memberships** | **0/0 → 10/0** |

The catalog-wide deltas are:

| Measurement | Before | After | Change |
| --- | ---: | ---: | ---: |
| Shows with three or more useful facet groups | 131/752 | 141/752 | +10 |
| Curated discovery profiles | 100/752 | 110/752 | +10 |
| Tone coverage | 132/752 | 142/752 | +10 |
| Theme coverage | 135/752 | 145/752 | +10 |
| Best-for coverage | 131/752 | 141/752 | +10 |
| Similar-show coverage | 129/752 | 139/752 | +10 |
| Authored similarity links / written reasons | 330/330 | 340/340 | +10 / +10 |
| Shows with authored outgoing routes | 129 | 139 | +10 |
| Collection membership edges | 793 | 820 | +27 |
| Shows with at least one collection | 326/752 | 334/752 | +8 |
| Shows with at least two collections | 164/752 | 173/752 | +9 |
| Strict computed source shows / edges | 65/104 | 74/118 | +9 / +14 |
| Public recommendation surface shows | 133/752 | 143/752 | +10 |

The current generated quality report also reports 94 enrichment-eligible shows missing at least one of tones, best-for routes, or similar-show links, down from 104 before the batch. Imported/factual-only records remain outside the editorial queue.

## 6. Strict computed-similarity qualification

The public policy remains unchanged: score at least 20; pair, source, and target metadata coverage at least 0.65; at least three metadata dimensions; at least two anchor dimensions; at least two specific discovery dimensions; and at least two explanation reasons. Authored links and curated similarity evidence are excluded from this computation.

After Batch 7, selected records contribute strict computed matches including Marvel's Wolverine: The Long Night → The Angel of Vine and Blackout; Blackout → Borrasca and From Now; The Cipher → Wake up, New Vilirth! and Wolverine; Petrified → Mayfair Watchers Society; Don't Mind → Vast Horizon; and Wake up, New Vilirth! → The Cipher and Rats Under Eden. Anticrastination, Death by Dying, Motherhacker, and Dreamboy did not clear the strict public computed gate in the current snapshot. These are computed archive matches, not authored editorial recommendations; they do not alter `similarTo` or the public policy.

Across the catalog, strict computed sources increased from 65 to 74 and edges from 104 to 118. The union of shows with an authored outgoing route or a strict computed route increased from 133 to 143. No thresholds, weights, or policy adapters changed.

## 7. Graph and collection health

The post-build collection-candidate report contains 820 membership edges, 334 shows with membership, 418 without membership, and 6,347 candidate edges across 316 shows. It still identifies weakly populated routes and rich-but-uncollected records as review signals rather than automatic assignments. The entity graph remains at 132 public entities, 318 relationship records, and 266 linked shows; 486 shows have no entity relationship. No invalid or unresolved entity links were introduced, and the existing 43 type/role divergence warnings remain.

The selection improves route coverage through comedy, cybercrime, branded investigation, radio survival, anthology form, queer surreal fiction, supernatural mystery, and political speculative drama. It does not force The Invenios Expeditions, Mayfair Watchers Society, The McIlwraith Statements, or The Dragoning into a collection without a more specific evidence-backed intent.

Post-Batch 7 weak coverage remains concentrated in drama at 41.2%, serialized at 43.8%, and episodic at 47.4%. These are queue signals for later review, not reasons to assign generic memberships without evidence.

## 8. Rejected or deferred decisions

- No new controlled tags were added; existing tags and free-text themes supplied the needed discovery signals.
- No entity links were added; raw creator/provider evidence remains a factual research queue.
- Existing rule-based collection memberships were left to the build system; only curated collection sources were edited.
- The Cipher, Wolverine, and Wake up, New Vilirth! were given Quick first listens based on observed episode counts and bounded routes, but no `short-under-five-hours` best-for label was added where the observed runtime was above that threshold.
- The Truth-style anthology bridge was not reused as a broad anthology rule; Petrified's authored route is narrow and source-backed, while its computed relationship to The Truth remains computed.
- No incoming reciprocal authored links were fabricated. Computed candidates such as Wolverine ↔ The Cipher remain computed unless separately justified by editorial evidence.
- No ratings, reviews, verification states, entity claims, similarity thresholds, collection rules, or public explanation policies were changed.

## 9. Validation and worktree boundary

Commands run after the source edits:

- `npm run build:catalog` — passed; built artifacts for 752 shows, 46 collections, and 7 review companions.
- `npm run validate:data` — passed with 0 integrity errors across 752 shows, 46 collections, 132 entities, and 7 review companions. The existing entity type/role divergence warnings remain; no invalid or unresolved entity links were introduced.
- `npm run report:discovery-quality -- --limit 12` — passed; 334 shows with collections, 141 with three or more useful facet groups, and 110 curated profiles.
- `npm run report:similarity -- --limit 12` — passed; 340 authored links with 340 written reasons and the unchanged similarity policy.
- `npm run report:collection-candidates -- --limit 12` — passed; 820 membership edges and 418 shows without membership.
- `npm run report:entity-graph -- --limit 12` — passed; 132 public entities, 318 known relationship records, 266 linked shows, and 486 zero-relationship shows. No entity links were added.
- `npm run report:catalog` — passed; Gate B complete, 0 blocking errors, 0 actionable RSS gaps, 25 documented research-gap records, and generated-output drift clean.
- `git diff --check` — passed.
- Focused catalog/discovery/similarity/candidate tests — passed: 40/40.

The worktree retains the prior Phase 3 changes plus the ten Batch 7 show sources, nine Batch 7 collection-source changes, expected rebuilt catalog/search/status artifacts, and this QA report. No commit, push, deployment, or publication was performed.
