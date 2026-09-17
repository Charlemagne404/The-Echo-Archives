# Phase 3 Batch 20 — Discovery Enrichment QA

Date: 2026-09-17  
Scope: ten published, enrichment-eligible show records receiving curated discovery profiles  
Status: local source and generated-catalog validation only; not committed, deployed, or published

## 1. Scope and guardrails

Batch 20 continues the sequential Phase 3 discovery-enrichment work after Batch 19. The post-Batch 19 graph had no remaining eligible facet blind spots: all 235 enrichment-eligible records already carried tones, tags, best-for routes, and authored similar-show links. The next actionable discovery gap was the 41 eligible records without a curated `discovery` profile. This batch adds profiles to ten of those records across anthology, fantasy, comedy, family adventure, historical drama, speculative fiction, and radio-storytelling routes.

The existing source-of-truth and safety rules were preserved:

- `catalog-src/shows/` remains authoritative; generated `data/` and `docs/generated/` files were rebuilt normally.
- Each profile was added only where the existing format, content, length, description, and official or publisher source supported the four controlled dimensions: voice style, narrative focus, intensity, and commitment.
- No imported/factual-only record was edited. No ratings, reviews, community scores, creator-verification claims, factual metadata, or lifecycle corrections were added.
- No collection source or collection membership was changed in this batch. Existing collection coverage and authored collection reasons were retained.
- The similarity scorer, weights, thresholds, public computed-match gate, and explanation policy were not changed. Computed candidates were not promoted into authored relationships.
- No raw creator, network, publisher, provider, or broadcaster string was promoted to a new typed entity relationship. Existing entity links and provenance were not rewritten.
- The profile values are bounded editorial discovery classifications, not claims about awards, ratings, completion, or objective credit ownership.

## 2. Selection analysis

The pre-Batch 20 snapshot contained 752 published shows, 235 enrichment-eligible records, 371 shows with at least one collection, 381 without collection membership, 106 actionable candidates, and 41 eligible records without a curated discovery profile. The batch deliberately avoids another horror-heavy packet: only StarTripper!! is primarily science-fiction, while the other selections cover warm comedy, fantasy, anthology, historical drama, family adventure, detective mystery, and serialized audio drama.

| Record | Discovery function | Why this batch included it |
| --- | --- | --- |
| [Story](../../catalog-src/shows/story.json) | Seasonal full-cast genre anthology | The official 7 Lamb catalog describes a new fictional tale, genre, plot, and characters for each season, supporting a variable-intensity, plot-led anthology profile. |
| [Windfall](../../catalog-src/shows/windfall.json) | Serialized speculative family and class drama | Rogue Dialogue's official page supports the three-brother ensemble, the sky-city world, political/military pressure, and epic serialized worldbuilding. |
| [The Amelia Project](../../catalog-src/shows/the-amelia-project.json) | Interview-shaped black-comedy mystery | The official show page supports the secret agency, eccentric clients, comedy/mystery blend, recurring cast, and a larger narrative emerging from individual stories. |
| [Victoriocity](../../catalog-src/shows/victoriocity.json) | Full-cast alternate-history detective comedy | The official site identifies a detective comedy podcast set in Even Greater London, with a murder investigation and widening conspiracy. |
| [StarTripper!!](../../catalog-src/shows/startripper.json) | First-person comedic space travelogue | The official site frames Feston Pyxis's search for good experiences across the stars and identifies the short-form comedic, immersive route. |
| [Greater Boston](../../catalog-src/shows/greater-boston.json) | Interwoven speculative ensemble drama | The official show site supports a full-cast speculative drama in an alternate Boston that blends the historical and fantastical across a long serialized run. |
| [Tumanbay](../../catalog-src/shows/tumanbay.json) | Epic historical-fantasy political drama | The official site supports the vast empire, city-scale setting, rebellion pressure, and four-season epic-fantasy structure. |
| [The Once and Future Nerd](../../catalog-src/shows/the-once-and-future-nerd.json) | Long-form original fantasy quest | The official site identifies an original fantasy audio drama with a chronological episode guide, books, ensemble characters, and an ongoing quest structure. |
| [Brimstone Valley Mall](../../catalog-src/shows/brimstone-valley-mall.json) | Serialized demon-band comedy | The official site supports the 1999 mall setting, misfit demon band, missing singer, deadline, and ordered serialized listening path. |
| [Mission: Rejected](../../catalog-src/shows/mission-rejected.json) | Full-cast spy-comedy adventure | The official site describes the rejected agents' backup team and explicitly calls the show a full-cast comedy audio adventure with a monthly episode pattern. |

The selection addresses the profile queue where evidence was strongest and broadens the profile distribution without padding imported records or making speculative changes to the remaining entity and collection queues.

## 3. Evidence anchors checked

These sources supported premise, form, production framing, or listening commitment. They were not used to fabricate ratings, verification, or lifecycle state.

| Record | Source anchor and supported signal |
| --- | --- |
| Story | [7 Lamb audio-drama catalog](https://www.7lamb.com/audiodramas) and [Story page](https://www.7lamb.com/audiodramas/story) — seasonal fictional tales with a new genre, plot, and characters. |
| Windfall | [Rogue Dialogue official page](https://roguedialogue.com/windfall) — redirected official about page describing the sky-city, three brothers, rebellion history, and serialized audio-drama origin. |
| The Amelia Project | [Official show page](https://ameliapodcast.com/) — audio-drama format, secret agency premise, comedy/mystery, cast, and client stories that open into a larger narrative. |
| Victoriocity | [Official show site](https://www.victoriocity.com/) — detective-comedy framing, Even Greater London setting, murder investigation, and conspiracy. |
| StarTripper!! | [Official show site](https://startripperhq.com/) — Feston Pyxis travelogue, galaxy-wide episodic premise, and comedic short-form/immersive framing. |
| Greater Boston | [Official show site](https://www.greaterbostonshow.com/) — full-cast speculative audio drama, alternate Boston, real/unreal and historical/fantastical blend, and long episode run. |
| Tumanbay | [Official show site](https://tumanbay.co.uk/) — epic fantasy, vast empire and city, rebellion-scale stakes, four seasons, and production/presentation credits. |
| The Once and Future Nerd | [Official show site](https://onceandfuturenerd.com/) — original fantasy audio drama, official start guide, chronological episode guide, and long-form book structure. |
| Brimstone Valley Mall | [Official show site](https://www.brimstonevalleymall.com/) — 1999 suburban mall, five misfit demons, missing band member, deadline, and ordered listening. |
| Mission: Rejected | [Official show site](https://www.missionrejected.com/) — backup agents, full-cast comedy audio adventure, monthly episode cadence, and six-season run. |

## 4. Enrichment decisions

The ten packets use only the controlled profile vocabulary already accepted by the catalog schema:

| Record | Curated discovery profile |
| --- | --- |
| Story | Primarily acted; plot-driven; variable intensity; medium commitment. The seasonal anthology format and changing plots support a flexible but accessible commitment classification. |
| Windfall | Primarily acted; balanced; medium intensity; long commitment. The official family ensemble and serialized city-scale conflict justify a longer, relationship-and-plot-balanced route. |
| The Amelia Project | Primarily acted; balanced; medium intensity; deep-dive commitment. Client episodes and an expanding serial mystery both matter, and the current feed is a substantial long run. |
| Victoriocity | Primarily acted; plot-driven; medium intensity; long commitment. The detective investigation and conspiracy provide the forward engine across the observed multi-season run. |
| StarTripper!! | Primarily narrated; character-driven; low intensity; medium commitment. The official travelogue premise centers Feston’s experiences and a lighter episodic escape route. |
| Greater Boston | Primarily acted; balanced; medium intensity; deep-dive commitment. The full-cast, interwoven speculative ensemble and long catalog support a deep serial listen without reducing it to plot alone. |
| Tumanbay | Primarily acted; plot-driven; high intensity; deep-dive commitment. The official empire/rebellion framing and four-season epic structure support sustained stakes and a long commitment. |
| The Once and Future Nerd | Primarily acted; plot-driven; high intensity; deep-dive commitment. The original fantasy quest, long book structure, and existing content warning support an immersive long-form adventure. |
| Brimstone Valley Mall | Primarily acted; plot-driven; medium intensity; medium commitment. The missing-singer deadline and ordered serialized story provide a clear plot engine within a contained two-season run. |
| Mission: Rejected | Primarily acted; plot-driven; medium intensity; deep-dive commitment. The full-cast backup-agent premise and six-season catalog support an action-comedy route that rewards continued listening. |

No structured content keys, content-warning notes, tags, collections, ratings, similar-show links, or entity links were changed. The only authored source additions are the four profile keys per selected show.

## 5. Collection and entity boundary

This batch made no curated collection edits. The current graph still contains 1,115 materialized membership edges, 371 shows with membership, and 381 without membership. The collection-candidate report remains a review aid; no automatic candidate was accepted.

This batch also made no entity edits. The entity graph remains source-backed at 132 public entities, 318 relationship records, and 266 linked shows. Profile work does not promote legacy creator or network strings into typed relationships.

## 6. Before/after metrics

The baseline is the generated catalog immediately after Batch 19, reconstructed from the current source state by removing only the new `discovery` objects for these ten records. Quality uses the existing 17-dimension discovery-quality score. Facet groups are tones, tags, best-for routes, and similar-show links. Profile keys are the four controlled discovery-profile keys. Structured-content counts are object keys, not a claim that each key has equal weight. Collection and authored-similarity counts show the unchanged public catalog surface.

| Show | Quality | Facet groups | Profile keys | Structured content | Content notes | Collections | Authored similar links |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Story | 16 → 17 | 4 → 4 | 0 → 4 | 4 → 4 keys | 1 → 1 | 3 → 3 | 3 → 3 |
| Windfall | 16 → 17 | 4 → 4 | 0 → 4 | 4 → 4 keys | 1 → 1 | 2 → 2 | 3 → 3 |
| The Amelia Project | 14 → 15 | 4 → 4 | 0 → 4 | 4 → 4 keys | 1 → 1 | 8 → 8 | 4 → 4 |
| Victoriocity | 14 → 15 | 4 → 4 | 0 → 4 | 4 → 4 keys | 1 → 1 | 5 → 5 | 4 → 4 |
| StarTripper!! | 14 → 15 | 4 → 4 | 0 → 4 | 4 → 4 keys | 0 → 0 | 5 → 5 | 4 → 4 |
| Greater Boston | 14 → 15 | 4 → 4 | 0 → 4 | 4 → 4 keys | 1 → 1 | 6 → 6 | 3 → 3 |
| Tumanbay | 15 → 16 | 4 → 4 | 0 → 4 | 4 → 4 keys | 1 → 1 | 5 → 5 | 3 → 3 |
| The Once and Future Nerd | 14 → 15 | 4 → 4 | 0 → 4 | 4 → 4 keys | 3 → 3 | 3 → 3 | 3 → 3 |
| Brimstone Valley Mall | 14 → 15 | 4 → 4 | 0 → 4 | 4 → 4 keys | 1 → 1 | 2 → 2 | 3 → 3 |
| Mission: Rejected | 15 → 16 | 4 → 4 | 0 → 4 | 4 → 4 keys | 1 → 1 | 4 → 4 | 3 → 3 |
| **Batch mean / total** | **14.6 → 15.6** | **40 → 40 facet groups** | **0 → 40 keys** | **40 → 40 keys** | **11 → 11 notes** | **43 → 43 memberships** | **33 → 33** |

The catalog-wide deltas are:

| Measurement | Before | After | Change |
| --- | ---: | ---: | ---: |
| Published shows | 752 | 752 | unchanged |
| Enrichment-eligible / imported / editorial | 235 / 517 / 7 | 235 / 517 / 7 | unchanged |
| Shows with explicit entity relationships | 266/752 | 266/752 | unchanged |
| Shows with a creator-role entity relationship | 61/752 | 61/752 | unchanged |
| Shows with at least one collection | 371/752 | 371/752 | unchanged |
| Shows with at least two collections | 250/752 | 250/752 | unchanged |
| Shows with at least one useful facet | 235/752 | 235/752 | unchanged |
| Shows with three or more useful facet groups | 235/752 | 235/752 | unchanged |
| Curated discovery profiles | 194/752 | 204/752 | +10 |
| Tone / tag / best-for / similar source coverage | 235/752 each | 235/752 each | unchanged |
| Voice-style signal coverage | 190/752 | 200/752 | +10 |
| Narrative-focus signal coverage | 191/752 | 201/752 | +10 |
| Intensity signal coverage | 232/752 | 232/752 | unchanged; existing `content.intensity` already supplied coverage for these records |
| Commitment signal coverage | 185/752 | 195/752 | +10 |
| Authored similarity links / written reasons | 447/447 | 447/447 | unchanged |
| Collection membership edges | 1115 | 1115 | unchanged |
| Shows without collection membership | 381 | 381 | unchanged |
| Actionable eligible candidates | 106 | 106 | unchanged |
| Strict computed source shows / edges | 149/254 | 154/265 | +5 / +11 |

The profile queue falls from 41 eligible records without a curated profile to 31. The catalog remains intentionally asymmetric: imported records continue to carry factual metadata without editorial discovery fields.

## 7. Strict computed-similarity qualification

The public computed policy remains unchanged: score at least 20; pair, source, and target metadata coverage at least 0.65; at least three metadata dimensions; at least two anchor dimensions; at least two specific discovery dimensions; at least two explanation reasons; and a maximum of two public computed matches per source. Authored links and curated similarity evidence are excluded from this computation.

The current strict snapshot contains 154 source shows and 265 edges, compared with 149 source shows and 254 edges after Batch 19. The selected-source bounded check returned:

- Story → Crystal Blue (23.2) and Tower 4 (22.3), with shared Bloody FM / 7 Lamb production evidence.
- The Amelia Project → The Thrilling Adventure Hour (23.4).
- Greater Boston → Mission: Rejected (22.5) and The Once and Future Nerd (20.4).
- Tumanbay → Vast Horizon (23.6) and The Once and Future Nerd (20.4).
- The Once and Future Nerd → Caravan (20.5) and Greater Boston (20.4).
- Brimstone Valley Mall → Mission: Rejected (20.9).
- Mission: Rejected → Greater Boston (22.5) and Brimstone Valley Mall (20.9).
- Windfall, Victoriocity, and StarTripper!! did not return a selected strict match in this bounded check.

These remain computed archive matches, not authored editorial recommendations; none were written into `similarTo`.

## 8. Graph and collection health

The post-build collection-candidate report contains 1,115 materialized membership edges, 371 shows with membership, 381 without membership, and 8,056 candidate edges across 333 unique shows. It reports no richly connected uncollected records in the selected top band, zero invalid collection references, and no near-duplicate collection pair. The low-membership threshold remains seven; drama and serialized remain broad underrepresented catalog areas at 45.5% and 49.5% coverage respectively. Candidate edges remain a review signal; no automatic memberships were accepted.

The post-build similarity report contains 447 authored links with 447 written reasons. Signal coverage is entity 266, genre 752, format 749, tone 235, theme 235, tag 235, best-for 235, voice style 200, narrative focus 201, intensity 232, commitment 195, release profile 283, shared collection 235, episode length 748, catalog length 751, and rating profile 27 out of 752 published records. The diagnostic scorer returned 187,988 candidate results with a 7.5–67.1 score range, 10.5 average, and 9.9 median; 2 sparse, 516 medium, and 234 enriched records. These diagnostics use the existing policy and are distinct from the stricter 154-source / 265-edge public computed gate above.

The entity graph remains at 132 public entities, 318 relationship records, and 266 linked shows; 486 shows have no entity relationship. No invalid or unresolved entity links were introduced, and the existing 43 type/role divergence warnings remain. All 1,115 materialized collection memberships resolve to published shows, and all 46 non-empty collections retain complete reasons.

The catalog report remains at Gate B complete, zero blocking errors, six missing RSS fields, 25 documented research-gap records, zero actionable RSS gaps, zero editorial gaps, zero taxonomy errors, and clean generated-output drift. The weak-collection-coverage measure remains 502; this is broader than the 381 shows with no collection membership used above.

This batch improves recommendation scoring and route explanation for a varied group of established catalog records without altering their factual surface. The remaining 31 profile gaps, 381 uncollected shows, and 486-show deliberate entity-research queue remain meaningful evidence-review work; no stopping condition was reached.

## 9. Rejected or deferred decisions

- No new controlled tags were added; existing factual tags supplied the discovery context needed for these profiles.
- No entity links were added. Exact registry-match candidates remain zero, and deliberate entity research requires source-backed review rather than automatic promotion.
- No collection memberships were added despite the broader collection blind spot; this batch was intentionally scoped to the next profile queue and did not force unrelated route placements.
- No ratings, reviews, community scores, creator-verification states, factual descriptions, official/listen links, content notes, or lifecycle values were changed.
- No computed strict match was promoted to authored `similarTo`, and no reciprocal authored relationship was created.
- Profile values were chosen from the existing controlled vocabulary and supported by the selected records' format, content, length, and official-source framing. Remaining records without comparable evidence were deferred.
- Similarity weights, thresholds, sparse policy, collection rules, public explanations, and generated-catalog schemas were not changed.

## 10. Validation and worktree boundary

Commands run after the canonical source edits:

- `npm run build:catalog` — passed; built artifacts for 752 shows, 46 collections, and 7 review companions.
- `npm run validate:data` — passed with 0 integrity errors across 752 shows, 46 collections, 132 entities, and 7 review companions. The existing 43 entity type/role divergence warnings remain; no invalid or unresolved entity links were introduced.
- `npm run report:discovery-quality` — passed; 204 curated profiles, 235 shows with three or more useful facet groups, 371 shows with collections, 250 with at least two collections, and 106 actionable candidates.
- `npm run report:similarity` — passed; 447 authored links with 447 written reasons, 187,988 diagnostic candidates, and the unchanged similarity policy.
- `npm run report:collection-candidates` — passed; 1,115 membership edges, 381 shows without membership, 8,056 candidate edges across 333 shows, and 0 invalid references.
- `npm run report:entity-graph` — passed; 132 public entities, 318 relationship records, 266 linked shows, and 486 zero-relationship shows. No entity links were added.
- `npm run report:catalog` — passed; Gate B complete, 0 blocking errors, 0 actionable RSS gaps, 25 documented research-gap records, 0 editorial gaps, 0 taxonomy errors, and generated-output drift clean.
- Read-only profile integrity check — passed; 10 selected records, all four controlled profile values present, and no errors.
- `git diff --check` — passed after the QA report was added.
- Focused catalog/discovery/similarity/candidate tests — passed: 43/43.
- A bounded read-only computed-match comparison confirmed 154 strict source shows / 265 edges and the selected-source results above without changing scorer or policy files.

The worktree retains prior Phase 3 changes plus ten Batch 20 show-source profile updates, expected rebuilt catalog/search/status artifacts, and this QA report. No commit, push, deployment, or publication was performed. The queue still contains meaningful evidence-review work, so no stopping condition was reached.
