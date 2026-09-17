# Phase 3 Batch 17 — Discovery Enrichment QA

Date: 2026-09-17  
Scope: eight published, enrichment-eligible show records and nine curated collection sources  
Status: local source and generated-catalog validation only; not committed, deployed, or published

## 1. Scope and guardrails

Batch 17 continues the Phase 3 discovery-enrichment sequence after Batch 16. The post-Batch 16 queue contained 118 actionable eligible records. The pre-batch graph review found seven high-priority records with missing tone, best-for, or authored-similarity fields, plus three richly described and highly connected shows with no collection membership. The first group was dominated by horror records, so this batch combines one full packet with seven route-specific placements across science fiction, fantasy, comedy, supernatural mystery, and strange small-town listening.

The existing source-of-truth rules were preserved:

- `catalog-src/shows/` and `catalog-src/collections/` remain authoritative; generated `data/` and `docs/generated/` files were rebuilt normally.
- Discovery values were added only where the record, existing objective source metadata, and an official, creator, publisher, provider, or feed source supported a useful classification.
- The seven route-only records received no new tones, themes, profiles, content notes, ratings, lifecycle fields, or authored similarity links. Their existing discovery data was retained.
- Darkest Night received a bounded tone/theme/best-for/profile/content packet and two directional authored similarity reasons grounded in its binaural recovered-memory form.
- The similarity scorer, public computed-match gate, thresholds, weights, and explanation policy were not changed. Computed candidates were not promoted into authored relationships.
- No raw creator, network, publisher, provider, or broadcaster string was promoted to a new typed entity relationship. Existing entity links and provenance were not rewritten.
- Imported/factual-only records were not edited. No rating, review, community score, creator-verification claim, factual tag, genre, format, listen link, or lifecycle correction was added.
- Rule-based collections and existing similarity-collection materialization were not manually changed. Only nine curated collection sources were extended, with a collection-specific `showReasons` value for every new edge.

## 2. Selection analysis

The pre-Batch 17 snapshot contained 752 published shows, 235 enrichment-eligible records, 368 shows with at least one collection, 384 without membership, and 118 actionable enrichment candidates. The collection-candidate report identified three richly connected, richly described uncollected records: The Invenios Expeditions, Mayfair Watchers Society, and The McIlwraith Statements. Those were prioritized for route coverage. Darkest Night was selected for the only full discovery packet because its source evidence cleanly supported a distinct immersive anthology profile. The remaining route placements add practical listening paths without filling already-complete metadata mechanically.

| Record | Discovery function | Why this batch included it |
| --- | --- | --- |
| [Darkest Night](../../catalog-src/shows/darkest-night.json) | Binaural recovered-memory horror anthology | Highest-yield full packet in this batch: the official description directly supports listener-centered recovered memories, headphone immersion, rotating performances, and a hidden conspiracy. |
| [The Invenios Expeditions](../../catalog-src/shows/the-invenios-expeditions.json) | Globe-spanning ocean adventure | One of the three richly connected uncollected records; adds serious-sci-fi, worldbuilding, and survival routes while leaving its unverified runtime and lifecycle fields unchanged. |
| [Mayfair Watchers Society](../../catalog-src/shows/mayfair-watchers-society.json) | Full-cast small-town creature anthology | One of the three richly connected uncollected records; adds practical long-walk, late-night, headphone, and small-town routes without duplicating its existing facets. |
| [The McIlwraith Statements](../../catalog-src/shows/the-antique-shop.json) | Narrated ghost investigation | One of the three richly connected uncollected records; adds late-night and headphone routes grounded in its statement format and supernatural investigation. |
| [Victoriocity](../../catalog-src/shows/victoriocity.json) | Serialized Victorian mystery-comedy | Extends a connected show into the long-walk route using its existing observed episode length and comedy/mystery profile. |
| [The Once and Future Nerd](../../catalog-src/shows/the-once-and-future-nerd.json) | Long-form full-cast fantasy | Extends the worldbuilding route into a long-walk listening context; existing content notes and fantasy fields were retained. |
| [The Two Princes](../../catalog-src/shows/the-two-princes.json) | Compact romantic fantasy | Adds a bounded quick-first-listen route using the existing observed episode count and short episode length. |
| [King Falls AM](../../catalog-src/shows/king-falls-am.json) | Long-running paranormal radio comedy | Adds a warm-weird route to complement its existing small-town, comedy, and Night Vale-adjacent placements. |

The top post-Batch 16 missing-facet candidates also included Knifepoint Horror, SCP Archives, The Elmwood Strain, The Tower, The Magnus Archives, The Magnus Protocol, and Shelterwood. They were deferred because the queue was heavily concentrated in horror and this batch had stronger diversification and route-coverage opportunities ready; no weak or filler metadata was added to them.

## 3. Evidence anchors checked

These sources supported premise, setting, form, production framing, route length, or the bounded content decision. They were not used to fabricate ratings, verification, or lifecycle state.

| Record | Source anchor and supported signal |
| --- | --- |
| Darkest Night | [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/darkest-night/id1163871694) — binaural audio-drama framing, listener-centered immersion, original performed chapters, and anthology episode structure. The local official RSS description remains the factual description source. |
| The Invenios Expeditions | [Official season page](https://theinveniosexpeditions.com/episodes/season-1/), [creator update](https://www.patreon.com/posts/invenios-update-102589638), and [launch update](https://www.patreon.com/posts/invenios-may-128757520) — Captain Tulley/Oberlin continuation, ocean expedition and treasure-hunting premise, Christof Laputka, and the Leviathan Audio Productions context. |
| Mayfair Watchers Society | [Apple Podcasts listing](https://podcasts.apple.com/gb/podcast/mayfair-watchers-society/id1646154626) — Bloody FM original fiction, Trevor Henderson creatures, Mayfair setting, and full-cast episode framing. |
| The McIlwraith Statements | [Ghostly Thistle official site](https://ghostlythistle.com/) — Sarah McIlwraith, the IPP study, ghosts, and the show's official production context. The local lifecycle remains unknown/unclear. |
| Victoriocity | [Official show site](https://www.victoriocity.com/) and [official support page](https://www.victoriocity.com/support) — Victorian alternate-history setting, serialized mystery-comedy, and creator-supported production context. |
| The Once and Future Nerd | [Official site](https://onceandfuturenerd.com/), [project page](https://onceandfuturenerd.com/about/the-project/), and [episode guide](https://onceandfuturenerd.com/episode-guide/) — full-cast serial fantasy, chapter/book structure, and the adult-language, violence, and sexuality warnings already retained in the local record. |
| The Two Princes | [Apple Podcasts listing](https://podcasts.apple.com/gb/podcast/the-two-princes/id1464586861) — Spotify Original fantasy premise, writing/directing, and compact episode format. |
| King Falls AM | [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/king-falls-am/id1016760065) — late-night AM setting, paranormal small-town premise, and the observed long-running episode catalogue. |

## 4. Enrichment decisions

Darkest Night was the only selected record that needed a new discovery packet. Its additions are intentionally compact:

- Tones: `dark`, `tense`, `cinematic`.
- Themes: `recovered memories and death`, `conspiracy and hidden science`, and `immersive supernatural horror`.
- Best-for routes: `late-night`, `headphones-on`, and `binge-listening`.
- Profile: mixed voice style, plot-driven narrative focus, high intensity, and medium commitment.
- Structured content: original fiction; recovered memories of the recently deceased; the listener at the center of each memory; binaural horror audio drama with a rotating cast and hidden master conspiracy.
- Authored similarity: The Magnus Archives and The Black Tapes, each with its own directional explanation.

The other seven show-source edits only advance `updatedAt` to 2026-09-17; their discovery packets, content notes, factual metadata, and authored relationships remain unchanged. In particular, no new lifecycle conclusion was inferred for The Invenios Expeditions, Mayfair Watchers Society, or The McIlwraith Statements, and the existing content warnings for The Once and Future Nerd were retained.

The new Darkest Night reasons are directional and source-specific:

- Darkest Night → [The Magnus Archives](../../catalog-src/shows/the-magnus-archives.json): both build supernatural horror through a curated record of disturbing cases; Darkest Night places the listener inside recovered memories of the dead, while The Magnus Archives unfolds its mystery through institutional statements.
- Darkest Night → [The Black Tapes](../../catalog-src/shows/the-black-tapes.json): both use recovered evidence and a hidden conspiracy to turn a bounded investigation into escalating supernatural danger; Darkest Night makes the recovered memory binaural, while The Black Tapes follows a skeptical investigation of paranormal cases.

No reciprocal copy was added to either target record.

## 5. Curated collection placements

The batch adds 15 curated membership edges. Existing rule/similarity memberships were regenerated from unchanged inputs and are not counted as authored batch edits.

| Collection | Added records |
| --- | --- |
| Best for long walks | Mayfair Watchers Society; Victoriocity; The Once and Future Nerd |
| Serious sci-fi | The Invenios Expeditions |
| Worldbuilding deep dives | The Invenios Expeditions |
| Survival pressure | The Invenios Expeditions |
| Late-night tension | Darkest Night; Mayfair Watchers Society; The McIlwraith Statements |
| Headphones-on immersion | Darkest Night; Mayfair Watchers Society; The McIlwraith Statements |
| Small-town strange signals | Mayfair Watchers Society |
| Quick first listens | The Two Princes |
| Warm weird comfort | King Falls AM |

Existing memberships were retained, including The Once and Future Nerd in Worldbuilding deep dives, Victoriocity in Warm weird comfort, and King Falls AM in Small-town strange signals. No rule or similarity collection source was manually changed, and every new curated edge has an explicit collection-specific reason in its canonical source.

## 6. Before/after metrics

The baseline is the generated catalog immediately after Batch 16, reconstructed from the current source state by removing only the Batch 17 Darkest Night discovery/content fields and the 15 Batch 17 curated memberships. Quality uses the existing 17-dimension discovery-quality score. Facet groups are tones, tags, best-for routes, and similar-show links. Profile keys are the four optional discovery-profile keys. Collection counts include existing rule/similarity memberships so the table describes the actual public catalog surface.

| Show | Quality | Facet groups | Profile keys | Structured content | Content notes | Collections | Authored similar links |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Darkest Night | 10 → 15 | 1 → 4 | 0 → 4 | 0 → 4 keys | 0 → 0 | 1 → 3 | 0 → 2 |
| The Invenios Expeditions | 15 → 16 | 4 → 4 | 3 → 3 | 4 → 4 keys | 0 → 0 | 0 → 3 | 2 → 2 |
| Mayfair Watchers Society | 15 → 16 | 4 → 4 | 4 → 4 | 4 → 4 keys | 1 → 1 | 0 → 4 | 2 → 2 |
| The McIlwraith Statements | 15 → 16 | 4 → 4 | 4 → 4 | 4 → 4 keys | 0 → 0 | 0 → 2 | 1 → 1 |
| Victoriocity | 14 → 14 | 4 → 4 | 0 → 0 | 4 → 4 keys | 1 → 1 | 4 → 5 | 4 → 4 |
| The Once and Future Nerd | 14 → 14 | 4 → 4 | 0 → 0 | 4 → 4 keys | 3 → 3 | 2 → 3 | 3 → 3 |
| The Two Princes | 14 → 14 | 4 → 4 | 4 → 4 | 4 → 4 keys | 0 → 0 | 2 → 3 | 1 → 1 |
| King Falls AM | 14 → 14 | 4 → 4 | 0 → 0 | 4 → 4 keys | 1 → 1 | 5 → 6 | 3 → 3 |
| **Batch mean / total** | **13.9 → 14.9** | **29 → 32 facet groups** | **15 → 19 keys** | **28 → 32 keys** | **6 → 6 notes** | **14 → 29 memberships** | **16 → 18** |

The catalog-wide deltas are:

| Measurement | Before | After | Change |
| --- | ---: | ---: | ---: |
| Published shows | 752 | 752 | unchanged |
| Enrichment-eligible / imported / editorial | 235 / 517 / 7 | 235 / 517 / 7 | unchanged |
| Shows with at least one collection | 368/752 | 371/752 | +3 |
| Shows with at least two collections | 237/752 | 241/752 | +4 |
| Shows with at least one useful facet | 235/752 | 235/752 | unchanged |
| Shows with three or more useful facet groups | 227/752 | 228/752 | +1 |
| Curated discovery profiles | 186/752 | 187/752 | +1 |
| Tone coverage | 228/752 | 229/752 | +1 |
| Themes or content-note coverage | 230/752 | 231/752 | +1 |
| Best-for coverage | 227/752 | 228/752 | +1 |
| Similar-show source coverage | 226/752 | 227/752 | +1 |
| Authored similarity links / written reasons | 429/429 | 431/431 | +2 / +2 |
| Shows with authored outgoing routes | 226 | 227 | +1 |
| Collection membership edges | 1082 | 1097 | +15 |
| Shows without collection membership | 384 | 381 | -3 |
| Actionable eligible candidates | 118 | 114 | -4 |
| Strict computed source shows / edges | 139/236 | 140/238 | +1 / +2 |

The generated discovery report leaves 114 actionable candidates in the full queue after this batch. Imported records remain outside the editorial work queue.

## 7. Strict computed-similarity qualification

The public policy remains unchanged: score at least 20; pair, source, and target metadata coverage at least 0.65; at least three metadata dimensions; at least two anchor dimensions; at least two specific discovery dimensions; at least two explanation reasons; and a maximum of two public computed matches per source. Authored links and curated similarity evidence are excluded from this computation.

The selected records that clear the strict public computed gate after Batch 17 are:

- Darkest Night → [Campfire Radio Theater](../../catalog-src/shows/campfire-radio-theater.json) (22.7) and [From Within: A Tale of the Macabre](../../catalog-src/shows/from-within-a-tale-of-the-macabre.json) (21.2).
- The Invenios Expeditions → The Rapscallion Agency (28.7).
- Mayfair Watchers Society → [Petrified](../../catalog-src/shows/petrified.json) (21.4).
- The Once and Future Nerd → [Caravan](../../catalog-src/shows/caravan.json) (20.5).
- The Two Princes → [The Way We Haunt Now](../../catalog-src/shows/the-way-we-haunt-now.json) (20.7).

The McIlwraith Statements, Victoriocity, and King Falls AM did not clear the strict computed gate in this snapshot. These are computed archive matches, not authored editorial recommendations; none of the computed results were written into `similarTo`.

The reconstructed pre-Batch 17 state had 139 strict computed source shows and 236 edges. The post-batch state has 140 strict computed source shows and 238 edges. The two new strict edges are a diagnostic consequence of the new Darkest Night packet; the route-only collection additions also changed computed evidence for existing candidates, but no computed result was promoted.

## 8. Graph and collection health

The post-build collection-candidate report contains 1,097 materialized membership edges, 371 shows with membership, 381 without membership, and 7,943 candidate edges across 331 unique shows. It reports no richly connected uncollected records in the selected top band, zero invalid collection references, no near-duplicate collection pair, and a low-membership threshold of seven. Drama and serialized remain broad underrepresented catalog areas at 45.5% and 49.5% coverage respectively. Candidate edges remain a review signal; no automatic memberships were accepted.

The post-build similarity report contains 431 authored links with 431 written reasons. Signal coverage is entity 266, genre 752, format 749, tone 229, theme 231, tag 235, best-for 228, voice style 183, narrative focus 184, intensity 226, commitment 178, release profile 283, shared collection 232, episode length 748, catalog length 751, and rating profile 27 out of 752 published records. The diagnostic scorer returned 186,078 candidate results with a 7.5–63.8 score range, 10.46 average, and 9.8 median; 2 sparse, 517 medium, and 233 enriched records. These diagnostics use the existing policy and are distinct from the stricter 140-source / 238-edge public computed gate above.

The entity graph remains at 132 public entities, 318 relationship records, and 266 linked shows; 486 shows have no entity relationship. No invalid or unresolved entity links were introduced, and the existing 43 type/role divergence warnings remain. All 1,097 materialized collection memberships resolve to published shows, and all 46 non-empty collections retain complete reasons.

The catalog report remains at Gate B complete, zero blocking errors, six missing RSS fields, 25 documented research-gap records, zero actionable RSS gaps, zero editorial gaps, zero taxonomy errors, and clean generated-output drift. The report's weak-collection-coverage measure is 511; this is a broader quality diagnostic than the 381 shows with no collection membership used above.

This batch improves route coverage for immersive anthology horror, oceanic science-fiction adventure, creature folklore, narrated ghost mystery, Victorian mystery-comedy, long-form fantasy, compact romantic fantasy, and warm paranormal comedy. It leaves entity gaps, lifecycle uncertainty, and lower-evidence horror candidates for later source review rather than filling them mechanically.

## 9. Rejected or deferred decisions

- No new controlled tags were added; existing factual tags and the Darkest Night themes supplied the needed discovery signals.
- No entity links were added for the creators, production companies, networks, publishers, providers, or broadcasters associated with the selected records. Entity promotion remains a separate source-backed registry task.
- Existing rule-based and similarity-collection memberships were not manually edited.
- No release or completion state was inferred from current provider pages, episode counts, or feed activity. The selected records retain their existing lifecycle values.
- The Invenios Expeditions was routed into serious sci-fi, worldbuilding, and survival pressure without using its unverified runtime to claim a long-walk or short-commitment fit.
- The McIlwraith Statements was routed into late-night and headphones-on immersion without changing its local unknown/unclear lifecycle state, even though its official production site describes the show as complete.
- No additional content notes were added. The existing warnings for Mayfair Watchers Society, Victoriocity, The Once and Future Nerd, and King Falls AM remain unchanged.
- The horror-heavy missing-facet candidates were deferred for a later evidence and diversity review; no weak substitute metadata was written.
- No ratings, reviews, verification states, factual metadata, lifecycle fields, similarity thresholds, collection rules, or public explanation policies were changed.

## 10. Validation and worktree boundary

Commands run after the canonical source edits:

- `npm run build:catalog` — passed; built artifacts for 752 shows, 46 collections, and 7 review companions.
- `npm run validate:data` — passed with 0 integrity errors across 752 shows, 46 collections, 132 entities, and 7 review companions. The existing 43 entity type/role divergence warnings remain; no invalid or unresolved entity links were introduced.
- `npm run report:discovery-quality` — passed; 371 shows with collections, 241 with at least two collections, 228 with three or more useful facet groups, 187 curated profiles, and 114 actionable candidates.
- `npm run report:similarity` — passed; 431 authored links with 431 written reasons and the unchanged similarity policy.
- `npm run report:collection-candidates` — passed; 1,097 membership edges, 381 shows without membership, 7,943 candidate edges across 331 shows, and 0 invalid references.
- `npm run report:entity-graph` — passed; 132 public entities, 318 relationship records, 266 linked shows, and 486 zero-relationship shows. No entity links were added.
- `npm run report:catalog` — passed; Gate B complete, 0 blocking errors, 0 actionable RSS gaps, 25 documented research-gap records, 0 editorial gaps, 0 taxonomy errors, and generated-output drift clean.
- `git diff --check` — passed before this report was written; it will be rerun after the report is added.
- Focused catalog/discovery/similarity/candidate tests — passed: 40/40.
- A read-only Node comparison reconstructed the pre-Batch 17 graph and confirmed the per-record quality, facet, profile, content, collection, authored-route, and strict computed-similarity deltas above. No scorer or policy files were changed.

The worktree retains prior Phase 3 changes plus the eight Batch 17 show-source updates, nine curated collection-source updates, expected rebuilt catalog/search/status artifacts, and this QA report. No commit, push, deployment, or publication was performed. The queue still contains meaningful evidence-review work, so no stopping condition was reached.
