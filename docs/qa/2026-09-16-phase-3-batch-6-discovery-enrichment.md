# Phase 3 Batch 6 — Discovery Enrichment QA

Date: 2026-09-16  
Scope: ten published, enrichment-eligible show records and seven curated collection sources  
Status: local source and generated-catalog validation only; not committed, deployed, or published

## 1. Scope and guardrails

Batch 6 continues the Phase 3 discovery-enrichment sequence after Batch 5. The selection came from the current discovery-quality, similarity, collection-candidate, and entity-graph snapshots. It deliberately broadens the route mix through serialized crime, noir mystery, supernatural revenge, fairy-tale workplace comedy, family radio adventure, anthology fiction, intergenerational historical drama, portal fantasy, apocalyptic friendship comedy, and epic fantasy. The batch does not simply extend the existing horror and science-fiction clusters.

The existing source-of-truth rules were preserved:

- `catalog-src/shows/` and `catalog-src/collections/` remain authoritative; generated `data/` and `docs/generated/` files were rebuilt normally.
- Editorial discovery fields were added only where the record and an official, creator, publisher, or provider source supported a useful classification.
- Every new `similarTo` edge received an explicit directional reason. Reciprocal copying was not used as a substitute for editorial judgment.
- The similarity scorer, public computed-match gate, thresholds, weights, and explanation policy were not changed. Computed candidates were not promoted into authored relationships.
- No raw creator, network, or provider string was promoted to a typed entity relationship.
- No rating, review, community score, creator-verification claim, lifecycle correction, or new controlled tag was added.
- Rule-based collections were not edited manually. Existing rule memberships were materialized through the normal catalog build.

## 2. Selection analysis

The post-Batch 5 snapshot contained 752 published shows, 235 enrichment-eligible records, 322 shows with at least one collection, and 430 without collection membership. The candidate report continued to show weak coverage in drama, serialized, episodic, and crime routes. The selection also used poor connectivity and bridge potential as review signals while avoiding broad genre-only placement.

| Record | Discovery function | Why this batch included it |
| --- | --- | --- |
| [Blood Ties](../../catalog-src/shows/blood-ties.json) | Serialized corporate-family thriller | Connects family legacy, medical power, and crime-pressure routes without relying on another supernatural or space setting. |
| [The Angel of Vine](../../catalog-src/shows/the-angel-of-vine.json) | Recovered-tape Hollywood noir | Adds a compact investigative mystery with a distinctive recording frame and a bridge to evidence-led fiction. |
| [Unkillable](../../catalog-src/shows/unkillable.json) | Dark comic supernatural revenge | Adds a bounded, narrated route for listeners who want bleak supernatural fiction without a long commitment. |
| [Alba Salix, Royal Physician](../../catalog-src/shows/alba-salix-royal-physician.json) | Fairy-tale hospital workplace comedy | Strengthens warm, weird, ensemble discovery through a specific care-and-workplace premise. |
| [Eleanor Amplified](../../catalog-src/shows/eleanor-amplified.json) | Family-friendly radio adventure | Adds an accessible all-ages route built around reporting, resourcefulness, and media literacy. |
| [The Truth](../../catalog-src/shows/the-truth.json) | Cinematic fiction anthology | Adds a deep anthology route whose production form and changing premises help listeners discover short fiction. |
| [Red for Revolution](../../catalog-src/shows/red-for-revolution.json) | Intergenerational historical audio drama | Adds a queer-love and liberation route with a compact, source-backed two-era structure. |
| [Second Shift](../../catalog-src/shows/second-shift.json) | Full-cast portal fantasy | Bridges college-life character stakes, belonging, and larger fantasy journeys. |
| [World Gone Wrong](../../catalog-src/shows/world-gone-wrong-a-fictional-chat-show-about-friendship-at-the-end-of-the-world.json) | Apocalyptic friendship chat show | Adds a conversational comedy route where everyday relationships carry the speculative premise. |
| [The Thieves Guild](../../catalog-src/shows/the-thieves-guild.json) | Full-cast epic fantasy serial | Adds a long-form political and magical route with a clear underdog-to-leader arc. |

## 3. Evidence anchors checked

These sources supported premise, setting, form, production framing, route length, or content-note decisions. They were not used to fabricate ratings, verification, or lifecycle state.

| Record | Source anchor and supported signal |
| --- | --- |
| Blood Ties | [Wondery show page](https://wondery.com/shows/Blood-Ties/) and [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/blood-ties/id1484142154) — family legacy, medical-corporate pressure, and serialized fictional-thriller framing. |
| The Angel of Vine | [Official site](https://angelofvine.com/) — a journalist, a 1950s private eye, a Hollywood murder, and recovered recordings. |
| Unkillable | [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/unkillable/id407417916) — a murdered protagonist, supernatural revenge, dark comedy, and the compact audio-novel route. |
| Alba Salix, Royal Physician | [Official Alba Salix site](https://albasalix.com/alba-salix/) — a witch physician, a fairy-tale hospital, and the staff-centered comedy premise. |
| Eleanor Amplified | [WHYY programme page](https://whyy.org/programs/eleanor-amplified/) — family-friendly radio adventure, reporting, and media-literacy framing. |
| The Truth | [Official about page](https://www.thetruthpodcast.com/about) — short-form fiction anthology, naturalistic performances, film-style editing, and original music. |
| Red for Revolution | [Radiotopia programme page](https://www.radiotopia.fm/podcasts/red-for-revolution) — Black women, queer love, intergenerational memory, liberation, and the present/1971 structure. |
| Second Shift | [Official site](https://www.secondshiftpodcast.com/) — three Boston students shifted into a magical world and searching for a way home. |
| World Gone Wrong | [Audacious Machine Creative page](https://www.audaciousmachinecreative.com/world-gone-wrong) — fictional chat-show framing, friendship at the end of the world, acid rain, and monsters. |
| The Thieves Guild | [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/the-thieves-guild/id1703512598) and [Podcast Alchemy](https://podcastalchemy.studio/) — full-cast serialized fantasy, Ralan, political conflict, forgotten magic, and secret societies. |

## 4. Enrichment decisions

Each selected record received a coherent packet rather than isolated labels. `content` records setting, point of view, source material, and framing; the discovery profile records voice, narrative focus, intensity, and commitment only where the listening shape was clear.

| Record | Tones / themes | Best-for routes | Profile | Curated routes | Authored similarity |
| --- | --- | --- | --- | --- | --- |
| Blood Ties | `dark`, `tense`, `cinematic`; family legacy, corporate medicine, power and obsession | late night, headphones on, binge listening | primarily acted; plot-driven; high; medium | Late-night tension | The Angel of Vine |
| The Angel of Vine | `dark`, `tense`, `cinematic`; classic noir, investigative journalism, Hollywood murder | short under five hours, late night, headphones on | primarily acted; plot-driven; high; medium | Late-night tension; Headphones-on immersion | The Deca Tapes |
| Unkillable | `dark`, `funny`, `bleak`; revenge after death, undead body, moral consequences | short under five hours, late night, headphones on | primarily narrated; character-driven; high; short | Late-night tension; Quick first listens | The Amelia Project |
| Alba Salix, Royal Physician | `funny`, `warm`, `weird`; care and healing, workplace friction, fantasy bureaucracy | easy entry, binge listening, warm weird | existing acted voice profile; character-driven; medium; long | Warm weird comfort; Ensemble chaos with heart; existing completed-drama route retained | Super Suits |
| Eleanor Amplified | `funny`, `warm`, `hopeful`; journalism and media literacy, family adventure, resourcefulness | easy entry, binge listening, long walks | existing acted/plot-driven/long profile; low intensity | Best for long walks; existing episodic-comedy and completed-drama routes retained | The Radio Adventures of Dr. Floyd |
| The Truth | `cinematic`, `weird`, `funny`; human connection, surreal premises, unexpected consequences | headphones on, long walks, easy entry | primarily acted; balanced; variable; deep dive | Headphones-on immersion; Best for long walks; existing episodic route retained | The Big Loop |
| Red for Revolution | `hopeful`, `melancholic`, `cinematic`; queer love, intergenerational memory, Black women's liberation | short under five hours, headphones on, easy entry | primarily acted; character-driven; medium; short | Quick first listens; Headphones-on immersion; existing completed-drama route retained | Love and Luck |
| Second Shift | `warm`, `hopeful`, `cinematic`; displacement and belonging, consequences of action, meaning of home | worldbuilding, binge listening, long walks | primarily acted; character-driven; medium; long | Fantasy detours and hidden worlds; Best for long walks; existing completed-drama route retained | Camlann |
| World Gone Wrong | `funny`, `warm`, `chaotic`; friendship under pressure, apocalypse adaptation, everyday weirdness | binge listening, long walks, warm weird | primarily acted; character-driven; variable; long | Ensemble chaos with heart; Best for long walks; existing ongoing sci-fi and comedy routes retained | Super Suits |
| The Thieves Guild | `cinematic`, `tense`, `hopeful`; political intrigue, forgotten magic, unexpected leadership | worldbuilding, long walks, binge listening | primarily acted; plot-driven; variable; deep dive | Fantasy detours and hidden worlds; Best for long walks | Second Shift |

No entity links were added. Existing typed relationships were preserved, and raw creator/provider evidence remains outside the editorial enrichment scope. No new `contentNotes` object was needed for this batch; existing notes were preserved.

## 5. Before/after metrics

The baseline is the catalog immediately before Batch 6, reconstructed from the pre-batch source state and the post-Batch 5 generated artifacts. Quality uses the existing 17-dimension discovery-quality score. Facet groups are tones, tags, best-for routes, and similar-show links. Authored counts are directional `outgoing / incoming` counts.

| Show | Quality | Facet groups | Profile keys | Content signal | Collections | Authored out / in |
| --- | ---: | ---: | ---: | --- | ---: | ---: |
| Blood Ties | 9 → 15 | 1 → 4 | 0 → 4 | absent → present | 0 → 1 | 0/0 → 1/0 |
| The Angel of Vine | 9 → 15 | 1 → 4 | 0 → 4 | absent → present | 0 → 2 | 0/0 → 1/1 |
| Unkillable | 9 → 15 | 1 → 4 | 0 → 4 | absent → present | 0 → 2 | 0/0 → 1/0 |
| Alba Salix, Royal Physician | 11 → 15 | 1 → 4 | 2 → 4 | absent → present | 1 → 3 | 0/0 → 1/0 |
| Eleanor Amplified | 11 → 15 | 1 → 4 | 3 → 4 | absent → present | 1 → 3 | 0/0 → 1/0 |
| The Truth | 10 → 15 | 1 → 4 | 0 → 4 | absent → present | 2 → 4 | 0/0 → 1/0 |
| Red for Revolution | 10 → 15 | 1 → 4 | 0 → 4 | absent → present | 1 → 3 | 0/0 → 1/0 |
| Second Shift | 10 → 15 | 1 → 4 | 0 → 4 | absent → present | 1 → 3 | 0/0 → 1/1 |
| World Gone Wrong | 11 → 16 | 1 → 4 | 0 → 4 | absent → present | 2 → 4 | 0/1 → 1/1 |
| The Thieves Guild | 10 → 16 | 1 → 4 | 0 → 4 | absent → present | 0 → 2 | 0/0 → 1/0 |
| **Batch mean / total** | **10.0 → 15.2** | **10 → 40 facet groups** | **5 → 40 keys** | **0 → 10** | **8 → 27 memberships** | **0/2 → 10/3** |

The catalog-wide deltas are:

| Measurement | Before | After | Change |
| --- | ---: | ---: | ---: |
| Shows with three or more useful facet groups | 121/752 | 131/752 | +10 |
| Curated discovery profiles | 92/752 | 100/752 | +8 |
| Tone coverage | 122/752 | 132/752 | +10 |
| Theme coverage | 125/752 | 135/752 | +10 |
| Best-for coverage | 121/752 | 131/752 | +10 |
| Similar-show coverage | 119/752 | 129/752 | +10 |
| Authored similarity links / written reasons | 320/320 | 330/330 | +10 / +10 |
| Shows with authored outgoing routes | 119 | 129 | +10 |
| Collection membership edges | 774 | 793 | +19 |
| Shows with at least one collection | 322/752 | 326/752 | +4 |
| Shows with at least two collections | 157/752 | 164/752 | +7 |
| Strict computed source shows / edges | 58/97 | 65/104 | +7 / +7 |
| Public recommendation surface shows | 123/752 | 133/752 | +10 |

The current generated quality report also reports 104 enrichment-eligible shows missing at least one of tones, best-for routes, or similar-show links, down from 114 before the batch. Imported/factual-only records remain outside the editorial queue.

## 6. Strict computed-similarity qualification

The public policy remains unchanged: score at least 20; pair, source, and target metadata coverage at least 0.65; at least three metadata dimensions; at least two anchor dimensions; at least two specific discovery dimensions; and at least two explanation reasons. Authored links and curated similarity evidence are excluded from this computation.

After Batch 6, selected records contribute strict computed matches including The Angel of Vine → Video Palace, The Truth → Wrong Station and The Thrilling Adventure Hour, Red for Revolution → 36 Questions, Second Shift → Fairies and Dragons, Ponies and Knights, and World Gone Wrong → Unwell. These are computed archive matches, not authored editorial recommendations; they do not alter `similarTo` or the public policy.

Across the catalog, strict computed sources increased from 58 to 65 and edges from 97 to 104. The union of shows with an authored outgoing route or a strict computed route increased from 123 to 133. No thresholds, weights, or policy adapters changed.

## 7. Graph and collection health

The post-build collection-candidate report contains 793 membership edges, 326 shows with membership, 426 without membership, and 6,093 candidate edges across 316 shows. It still identifies weakly populated routes and rich-but-uncollected records as review signals rather than automatic assignments. The entity graph remains at 132 public entities, 318 relationship records, and 266 linked shows; 486 shows have no entity relationship. No invalid or unresolved entity links were introduced, and the existing 43 type/role divergence warnings remain.

The selection improves route coverage through crime pressure, noir investigation, dark comedy, family adventure, anthology form, queer historical drama, portal fantasy, conversational apocalypse, and epic fantasy. It does not force The Invenios Expeditions, Mayfair Watchers Society, The McIlwraith Statements, or The Dragoning into a collection without a more specific evidence-backed intent.

## 8. Rejected or deferred decisions

- No new controlled tags were added; existing tags and free-text themes supplied the needed discovery signals.
- No entity links were added; raw creator/provider evidence remains a factual research queue.
- Existing rule-based collection memberships were left to the build system; only curated collection sources were edited.
- Blood Ties was routed to late-night tension rather than a broad crime or drama bucket because its strongest evidence is pressure, betrayal, and corporate-family thriller tone.
- Unkillable was routed to quick first listens and late-night tension, not a long horror route, because the observed audio-novel route is compact and its strongest bridge is dark comedy plus supernatural revenge.
- The Truth was routed through headphones and long walks, not a single genre collection, because its anthology form deliberately varies premise and mood.
- Eleanor Amplified was treated as an accessible family adventure rather than a generic comedy placement.
- The Thieves Guild was placed in a fantasy discovery route and long walks, but not serious sci-fi; the source evidence is epic fantasy with political intrigue and forgotten magic.
- No ratings, reviews, verification states, listener claims, entity claims, similarity thresholds, collection rules, or public explanation policies were changed.

## 9. Validation and worktree boundary

Commands run after the source edits:

- `npm run build:catalog` — passed; built artifacts for 752 shows, 46 collections, and 7 review companions.
- `npm run validate:data` — passed with 0 integrity errors across 752 shows, 46 collections, 132 entities, and 7 review companions. The existing entity type/role divergence warnings remain; no invalid or unresolved entity links were introduced.
- `npm run report:discovery-quality -- --limit 12` — passed; 326 shows with collections, 131 with three or more useful facet groups, and 100 curated profiles.
- `npm run report:similarity -- --limit 12` — passed; 330 authored links with 330 written reasons and the unchanged similarity policy.
- `npm run report:collection-candidates -- --limit 12` — passed; 793 membership edges and 426 shows without membership.
- `npm run report:entity-graph -- --limit 12` — passed; 132 public entities, 318 known relationship records, 266 linked shows, and 486 zero-relationship shows. No entity links were added.
- `npm run report:catalog` — passed; Gate B complete, 0 blocking errors, 0 actionable RSS gaps, 25 documented research-gap records, and generated-output drift clean.
- `git diff --check` — passed.
- Focused catalog/discovery/similarity/candidate tests — passed: 40/40.

The worktree retains the prior Phase 3 changes plus the ten Batch 6 show sources, seven Batch 6 collection-source changes, expected rebuilt catalog/search/status artifacts, and this QA report. No commit, push, deployment, or publication was performed.
