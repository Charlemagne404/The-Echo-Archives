# Phase 3 Batch 4 — Discovery Enrichment QA

Date: 2026-09-16  
Scope: ten published, enrichment-eligible show records and nine curated collection sources  
Status: local source and generated-catalog validation only; not committed, deployed, or published

## 1. Scope and guardrails

Batch 4 continues the Phase 3 discovery-enrichment sequence after Batch 3. The selection was made from the post-Batch 3 graph and collection snapshots, not from alphabetical order or a similarity quota. The aim was to make episodic, anthology, narrated, community-radio, political-near-future, and folk-horror routes easier to reach while keeping the archive's recommendation graph understandable.

The batch followed the existing source-of-truth rules:

- `catalog-src/shows/` and `catalog-src/collections/` remain authoritative; `data/` and `docs/generated/` were rebuilt normally.
- Editorial fields were added only where the show record and an official or provider source supported a useful discovery classification.
- Authored `similarTo` edges received explicit directional reasons. No reciprocal edge was added for symmetry.
- The similarity diagnostic remained candidate generation only. The public computed policy was not changed, and computed matches were not promoted into authored relationships.
- No entity relationship was inferred from a raw creator, network, or provider string.
- No archive rating, listener review, community score, creator-verification claim, lifecycle correction, or new controlled tag was added.
- The rule-based `Anthology Horror` collection was not edited for Wrong Station because its factual catalog genre is drama; a manual membership would have bypassed the collection rule.

## 2. Selection analysis

The post-Batch 3 graph still showed a strong serialized/full-cast/horror-mystery center. Episodic and anthology records were comparatively underrepresented in authored routes, while the collection report still showed less than 50% membership coverage for the broad `episodic` and `serialized` format areas. The low-membership and rich-uncollected queues also continued to identify useful route gaps rather than missing factual data.

The ten records were selected for different discovery functions:

| Record | Discovery function | Why this batch included it |
| --- | --- | --- |
| [The Archers](../../catalog-src/shows/the-archers.json) | Ongoing community-radio / rural ensemble | Adds a warm, low-intensity episodic route that is not organized around horror, sci-fi, or mystery. |
| [DUST](../../catalog-src/shows/dust.json) | Science-fiction anthology | Adds an episodic, high-concept anthology bridge for AI, alternate futures, and survival without forcing a military-survival route. |
| [The Big Loop](../../catalog-src/shows/the-big-loop.json) | Self-contained speculative anthology | Turns an existing incoming endpoint into a usable character-led, sound-forward discovery record. |
| [The Night Post](../../catalog-src/shows/the-night-post.json) | Full-cast frontier fantasy | Converts three existing incoming authored links into a complete bridge with worldbuilding and courier-story context. |
| [The Phone Booth](../../catalog-src/shows/the-phone-booth.json) | Interview-led post-catastrophe drama | Adds an unusual fictional-interview form and a character-led route outside the dominant investigation cluster. |
| [The Dragoning](../../catalog-src/shows/the-dragoning.json) | Near-future audio dramedy / social satire | Adds a myth-in-modern-life route with a distinct gender-and-power premise; no existing collection was specific enough. |
| [The Earth Collective](../../catalog-src/shows/the-earth-collective.json) | Narrated survival worldbuilding | Adds a primarily narrated, long-form survival route and strengthens the underused worldbuilding/survival path. |
| [The Next 5 Minutes](../../catalog-src/shows/the-next-5-minutes.json) | Short political near-future fiction | Adds a compact climate, privatized-life, and political-resistance route rather than another long serial. |
| [Wrong Station](../../catalog-src/shows/wrong-station.json) | Full-cast weird-fiction anthology | Adds a long-form radio-texture route while preserving its existing drama genre and content notes. |
| [The Love Talker](../../catalog-src/shows/the-love-talker.json) | Appalachian folk-horror investigation | Extends the folk-horror route with missing women, community secrecy, and place-rooted tradition. |

## 3. Evidence anchors checked

The enrichment used the existing catalog record plus the following source anchors. These sources supported premise, setting, form, production framing, or content-note decisions; they were not used to fabricate ratings or lifecycle state.

| Record | Source anchor and supported signal |
| --- | --- |
| The Archers | [BBC programme page](https://www.bbc.co.uk/programmes/b006qpgr) — Ambridge/community-serial source anchor already present in the record. |
| DUST | [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/dust/id1482669176) — Gunpowder & Sky science-fiction audio stories and seasonal anthology framing. |
| The Big Loop | [Official About page](https://www.thebiglooppodcast.com/about) and [official listening page](https://www.thebiglooppodcast.com/listen) — self-contained anthology stories with a sound-forward presentation. |
| The Night Post | [Official site](https://www.nightpostpod.com/) — Gilt City, conscripted couriers, and an arcane frontier. |
| The Phone Booth | [Michael Frazel's official page](https://www.michaelfrazel.com/thephonebooth) — Mojave phone-booth framing and neo-Western radio-play form; the [Apple listing](https://podcasts.apple.com/us/podcast/the-phone-booth/id1490026718) supports the fictional interview premise. |
| The Dragoning | [Messenger Theatre listening page](https://www.messengertheatreco.org/dragoning-listen) — audio dramedy and women transforming into dragons as the central social premise. |
| The Earth Collective | [Official site](https://www.theearthcollectivestory.com/) and [Apple listing](https://podcasts.apple.com/us/podcast/the-earth-collective/id1033364998) — rolling cities, a historical first-person frame, and survival under planetary pressure. Lifecycle state was left unchanged. |
| The Next 5 Minutes | [Acast episode source](https://shows.acast.com/ear-candy-presents-the-next-5-minutes/episodes/helen) — written/directed audio-fiction production anchor; the repository description supplies the Australia 2035 and political-satire details. |
| Wrong Station | [Official site](https://www.wrongstation.com/) and [official content warnings](https://www.wrongstation.com/content-warnings) — original horror/weird-fiction anthology and existing mature/disturbing-imagery warning context. |
| The Love Talker | [Official site](https://thelovetalker.com/) — Appalachian border setting and the place-rooted folk-horror premise already reflected in the record. |

The direct BBC page was not relied on for new prose when the lookup was robots-blocked; the record's existing official BBC URL, feed, and provider sources remained sufficient for this pass.

## 4. Enrichment decisions

Each selected record received a coherent packet rather than isolated labels. The `content` object records setting, point of view, source material, and framing; the profile records voice, narrative focus, intensity, and commitment only where the listening shape was clear.

| Record | Tones / themes | Best-for routes | Profile | Curated routes | Authored similarity |
| --- | --- | --- | --- | --- | --- |
| The Archers | `warm`, `melancholic`; community and belonging, family obligation, rural change | long walks, binge listening | primarily acted; character-driven; low; deep dive | Best for long walks | None; the record is intentionally collection-led. |
| DUST | `cinematic`, `tense`, `weird`; AI and consciousness, alternate futures, human survival | headphones on, serious sci-fi, worldbuilding | mixed; balanced; variable; long | Serious sci-fi; Headphones-on immersion | The Big Loop; Twilight Histories. |
| The Big Loop | `weird`, `melancholic`, `cinematic`; human connection, finite lives, infinite universe | headphones on, late night, binge listening | primarily acted; character-driven; medium; medium | Headphones-on immersion | The Orbiting Human Circus; The Dead Letter Office of Somewhere, Ohio. |
| The Night Post | `dark`, `weird`, `cinematic`; survival and tradition, belief and belonging across worlds | worldbuilding, headphones on, long walks | primarily acted; balanced; high; long | Best for long walks; Worldbuilding deep dives; Fantasy detours and hidden worlds | Camlann; The Silt Verses. |
| The Phone Booth | `melancholic`, `hopeful`, `weird`; superpower and identity, memory and testimony, life after catastrophe | headphones on, binge listening, late night | primarily acted; character-driven; medium; medium | Headphones-on immersion | The Bright Sessions; The Amelia Project. |
| The Dragoning | `funny`, `dark`, `chaotic`; gender and power, social upheaval, myth in modern life; retained violence and gendered-violence notes | binge listening, late night | primarily acted; balanced; medium; long | None; no existing collection intent was exact enough. | The Orbiting Human Circus. |
| The Earth Collective | `bleak`, `cinematic`, `hopeful`; collective memory, survival on the move, humanity under pressure | long walks, worldbuilding, headphones on | primarily narrated; plot-driven; high; long | Best for long walks; Serious sci-fi; Survival pressure; Worldbuilding deep dives | The Orphans; Our Fair City. |
| The Next 5 Minutes | `bleak`, `tense`, `chaotic`; climate collapse, privatised public life, political resistance; added violence/forced-labour/political-violence notes | short under five hours, late night, headphones on | primarily acted; plot-driven; high; short | Serious sci-fi; Quick first listens; Survival pressure | The Deca Tapes; The Cleansed. |
| Wrong Station | `dark`, `weird`, `cinematic`; retained horror/speculative-fiction themes and existing mature/disturbing-imagery notes | long walks, headphones on, late night | primarily acted; balanced; high; deep dive | Best for long walks; Late-night tension; Headphones-on immersion | The Big Loop; The Thrilling Adventure Hour. |
| The Love Talker | `dark`, `bleak`, `tense`; missing women, community secrecy, folk tradition and place; retained mature-themes note | late night, headphones on, binge listening | primarily acted; plot-driven; high; medium | Late-night tension; Folk horror and old gods | Old Gods of Appalachia; The Secret of St Kilda. |

No new controlled tag was needed. Existing tags already provided the factual hooks for the recommendation diagnostic, while the free-text themes and content packets supplied the distinct editorial signals.

## 5. Before/after metrics

The baseline is the generated catalog at `HEAD`, immediately after Batch 3. Quality uses the existing 17-dimension discovery-quality score. Useful facets are tones, tags, best-for routes, and authored similar-show links. Authored counts are directional `outgoing / incoming` counts; incoming links were not rewritten to create reciprocity.

| Show | Quality | Useful facets | Profile keys | Collections | Authored out / in | Strict computed | Public surface |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| The Archers | 9 → 14 | 1 → 3 | 0 → 4 | 0 → 1 | 0/0 → 0/0 | 0 → 0 | No → No; collection-led |
| DUST | 9 → 15 | 1 → 4 | 0 → 4 | 0 → 2 | 0/0 → 2/0 | 0 → 0 | No → Yes |
| The Big Loop | 9 → 15 | 1 → 4 | 0 → 4 | 0 → 1 | 0/1 → 2/3 | 0 → 0 | No → Yes |
| The Night Post | 9 → 15 | 1 → 4 | 0 → 4 | 0 → 3 | 0/3 → 2/3 | 0 → 2 | No → Yes |
| The Phone Booth | 9 → 15 | 1 → 4 | 0 → 4 | 0 → 1 | 0/0 → 2/0 | 0 → 0 | No → Yes |
| The Dragoning | 9 → 14 | 1 → 4 | 0 → 4 | 0 → 0 | 0/0 → 1/0 | 0 → 0 | No → Yes |
| The Earth Collective | 9 → 15 | 1 → 4 | 0 → 4 | 0 → 4 | 0/0 → 2/0 | 0 → 0 | No → Yes |
| The Next 5 Minutes | 9 → 15 | 1 → 4 | 0 → 4 | 0 → 3 | 0/0 → 2/0 | 0 → 0 | No → Yes |
| Wrong Station | 10 → 15 | 1 → 4 | 0 → 4 | 0 → 3 | 0/1 → 2/1 | 0 → 0 | No → Yes |
| The Love Talker | 9 → 15 | 1 → 4 | 0 → 4 | 0 → 2 | 0/0 → 2/0 | 0 → 0 | No → Yes |
| **Batch mean / total** | **9.1 → 14.8** | **10 → 39 facet groups** | **0 → 40 keys** | **0 → 20 memberships** | **0 → 17 outgoing** | **0/10 → 1/10** | **0/10 → 9/10** |

Batch-level changes:

| Measurement | Before | After | Change |
| --- | ---: | ---: | ---: |
| Shows with three or more useful facet groups | 0/10 | 10/10 | +10 |
| Tone coverage | 0/10 | 10/10 | +10 |
| Best-for coverage | 0/10 | 10/10 | +10 |
| Themes or content-note coverage | 1/10 | 10/10 | +9 |
| Similar-show coverage | 0/10 | 9/10 | +9 |
| Four discovery-profile keys | 0/10 | 10/10 | +10 |
| Shows with at least one collection | 0/10 | 9/10 | +9 |
| Shows with at least two collections | 0/10 | 6/10 | +6 |
| Authored outgoing links | 0 | 17 | +17 |
| Strict computed qualification | 0/10 | 1/10 | +1 |
| Public recommendation surface | 0/10 | 9/10 | +9 |

Catalog-wide after-batch snapshot:

| Metric | After Batch 3 | After Batch 4 | Change |
| --- | ---: | ---: | ---: |
| Authored similarity links / written reasons | 289 / 289 | 306 / 306 | +17 / +17 |
| Shows with authored outgoing routes | 100 | 109 | +9 |
| Unique authored targets | 78 | 85 | +7 |
| Unique authored endpoint shows | 118 | 125 | +7 |
| Strict computed source shows | 55 | 55 | unchanged |
| Strict computed recommendation edges | 93 | 94 | +1 |
| Public recommendation surface shows | 104/752 | 113/752 | +9 |
| Collection membership edges | 741 | 761 | +20 |
| Shows with at least one collection | 309/752 | 318/752 | +9 |
| Shows with at least two collections | 146/752 | 152/752 | +6 |
| Shows with three or more useful facet groups | 101/752 | 111/752 | +10 |
| Shows with a curated discovery profile | 74/752 | 84/752 | +10 |

The generated catalog now reports 112 shows with tones, 117 with themes, 111 with best-for routes, 109 with similar-show links, 75 with `voiceStyle`, 78 with `narrativeFocus`, 119 with `intensity`, and 66 with `commitment`. These are coverage signals, not quality guarantees.

## 6. Strict computed-similarity qualification

The public policy remains unchanged: score at least 20; pair, source, and target metadata coverage at least 0.65; at least three metadata dimensions; at least two anchor dimensions; at least two specific discovery dimensions; and at least two explanation reasons. Authored links and curated similarity evidence are excluded from this computation.

The table reports the strongest clean non-authored near-match after enrichment. A listed failure is an exact policy failure for that candidate, not an editorial rejection.

| Show | Strict result | Strongest clean near-match | Remaining policy failure |
| --- | --- | --- | --- |
| The Archers | Unqualified | Hi Nay — 17.5 | Score 17.5 < 20; the coverage, dimensions, anchors, specific signals, and reasons pass. |
| DUST | Unqualified | The Orphans — 18.2 | Score 18.2 < 20; the other policy requirements pass. |
| The Big Loop | Unqualified | The Phone Booth — 18.1 | Score 18.1 < 20; the other policy requirements pass. |
| The Night Post | Qualified: The Orphans 21.5 and Impact Winter 20.2 | The Orphans — 21.5 | None. |
| The Phone Booth | Unqualified | The Two Princes — 18.6 | Score 18.6 < 20; the other policy requirements pass. |
| The Dragoning | Unqualified | Our Fair City — 15.1 | Score 15.1 < 20; the other policy requirements pass. |
| The Earth Collective | Unqualified | Within the Wires — 16.9 | Score 16.9 < 20; the other policy requirements pass. |
| The Next 5 Minutes | Unqualified | The Hyacinth Disaster — 18.6 | Score 18.6 < 20; the other policy requirements pass. |
| Wrong Station | Unqualified | Hi Nay — 17.7 | Score 17.7 < 20; the other policy requirements pass. |
| The Love Talker | Unqualified | Afflicted — 19.7 | Score 19.7 < 20; the other policy requirements pass. |

This is the intended conservative outcome: the enriched records become more legible and more manually reachable without lowering the public confidence floor or turning broad metadata overlap into an editorial recommendation. The Night Post's two computed matches are separately labeled as computed; its authored Camlann and The Silt Verses routes remain editorial links.

## 7. Graph and collection health

The batch adds 17 directional authored edges and 20 curated collection memberships. It increases authored endpoint breadth by seven unique shows and recommendation-surface coverage by nine source shows. Strict computed edges increase by one, while the number of strict computed source shows stays at 55; this indicates that the graph grew mainly through deliberate editorial bridges rather than a threshold relaxation.

New route shapes include:

- a long-running community-radio route through The Archers;
- an episodic science-fiction anthology bridge through DUST and The Big Loop;
- a courier/frontier fantasy route through The Night Post;
- a fictional-interview and post-catastrophe character route through The Phone Booth;
- a narrated survival/worldbuilding route through The Earth Collective;
- a compact political-near-future route through The Next 5 Minutes;
- a full-cast weird-anthology route through Wrong Station; and
- a place-rooted Appalachian folk-horror route through The Love Talker.

The post-build collection report still identifies 434 published shows without any collection membership. It also keeps The Invenios Expeditions, Mayfair Watchers Society, The McIlwraith Statements, and The Dragoning in the rich-uncollected review area. Batch 4 intentionally left the latter four without forced memberships when no existing collection intent was specific enough; the queue remains a review signal, not an instruction to fill every gap.

## 8. Rejected or deferred decisions

- No new controlled tags were added; the current taxonomy already expressed the relevant factual signals.
- No entity links were added. Existing legacy creator/network evidence remains a manual research queue, not a relationship source.
- Wrong Station was not inserted into rule-based `Anthology Horror`; its drama genre does not meet that rule's horror condition.
- The Dragoning was left outside curated collections rather than being padded into a broad fantasy or comedy route.
- The Archers received a Best for long walks route but no similarity edge because no specific, source-backed bridge was stronger than the collection route.
- The Earth Collective's lifecycle state was left unchanged despite provider presentation changes; this pass only enriched discovery fields.
- No rating, review, creator verification, listener score, or community claim was created.
- No similarity threshold, score weight, collection rule, or public explanation policy was changed.

## 9. Validation and worktree boundary

Commands run after the source edits:

- `npm run build:catalog` — passed; built artifacts for 752 shows, 46 collections, and 7 review companions.
- `npm run validate:data` — passed with 0 integrity errors. The existing 43 entity type/role divergence warnings remain source-backed review signals and were not changed by this batch.
- `npm run report:discovery-quality` — passed; 752 published shows, 318 with collections, 111 with three or more useful facet groups, 84 curated profiles.
- `npm run report:similarity` — passed; 306 curated links with 306 reasons and 17 similarity routes.
- `npm run report:collection-candidates -- --limit 8` — passed; 761 membership edges and 434 shows without membership.
- `npm run report:entity-graph` — passed; 132 public entities, 318 known relationship records, 266 linked shows, and 486 zero-relationship shows. No entity links were added.
- `npm run report:catalog` — passed; Gate B complete, 0 blocking errors, 0 actionable RSS gaps, 25 documented research-gap records, and generated-output drift clean.
- `git diff --check` — passed.
- Focused catalog/similarity/candidate tests — passed: 29/29.

The full `npm run test:tools` suite was also run: 81 passed, 2 failed, and 3 skipped. The two failures are environment-specific and unrelated to this catalog batch: macOS `stat` rejects the Linux-only `-c` option in the monitoring test, and an operations test expects `/usr/bin/node`, which is absent in this host. The three Restic tests were skipped because Restic is not installed. No code changes were made to work around these host/tooling conditions.

The worktree contains only the ten show sources, nine collection sources, the expected rebuilt catalog/search/status artifacts, and this QA report. No unrelated changes were found, and no commit, push, deployment, or publication was performed.
