# Phase 3 Batch 21 — Discovery Enrichment QA

Date: 2026-09-17  
Scope: ten published, enrichment-eligible show records receiving curated discovery profiles  
Status: local source and generated-catalog validation only; not committed, deployed, or published

## 1. Scope and guardrails

Batch 21 continues the sequential Phase 3 discovery-enrichment work after Batch 20. The post-Batch 20 graph had 752 published shows, 235 enrichment-eligible records, 517 imported/factual-only records, 7 editorial records, 204 curated discovery profiles, and 31 eligible records without a profile. All 235 eligible records already carried tones, tags, best-for routes, and authored similar-show links, so this batch continues the remaining profile queue rather than padding already-complete facet groups.

The selected records cover comedy mystery, supernatural ensemble drama, investigative thriller, workplace/speculative comedy, science fantasy, fantasy adventure, and broadcast-shaped small-town fiction. The batch includes three science-fiction or science-fantasy records, but it is not a single-genre packet and does not add another horror-only run.

The existing source-of-truth and safety rules were preserved:

- `catalog-src/shows/` remains authoritative; generated `data/` and `docs/generated/` files were rebuilt normally.
- Each profile was added only where the existing format, content, length, description, and official or publisher source supported the four controlled dimensions: voice style, narrative focus, intensity, and commitment.
- No imported/factual-only record was edited. No ratings, reviews, community scores, creator-verification claims, factual metadata, or lifecycle corrections were added.
- No collection source or collection membership was changed in this batch. Existing collection coverage and authored collection reasons were retained.
- The similarity scorer, weights, thresholds, public computed-match gate, and explanation policy were not changed. Computed candidates were not promoted into authored relationships.
- No raw creator, network, publisher, provider, or broadcaster string was promoted to a new typed entity relationship. Existing entity links and provenance were not rewritten.
- The profile values are bounded editorial discovery classifications, not claims about awards, ratings, verification, completion, or objective credit ownership.

## 2. Selection analysis

The pre-Batch 21 graph contained 752 published shows, 235 enrichment-eligible records, 371 shows with at least one collection, 381 without collection membership, 106 actionable candidates, and 31 eligible records without a curated `discovery` profile. The queue was reviewed against current format, content, length, existing facets, and source readiness. The selected records were chosen to improve profile signal coverage across distinct listening routes while leaving unresolved collection and entity work for evidence review.

| Record | Discovery function | Why this batch included it |
| --- | --- | --- |
| [Mockery Manor](../../catalog-src/shows/mockery-manor.json) | Full-cast black-comedy mystery | Long Cat Media frames a theme-park disappearance mystery around chaotic twins, and its official materials support a full-cast, multi-season production. |
| [Harbor](../../catalog-src/shows/harbor.json) | Character-led queer cryptid ensemble | The official show page centers siblings, found family, cryptids, workplace relationships, acting, and plot development in a small-town supernatural drama. |
| [How I Died](../../catalog-src/shows/how-i-died.json) | Full-cast paranormal forensic serial | Audiohm Media explicitly describes a full-cast serial fiction podcast about a forensic pathologist who can speak to the dead while investigating unsolved murders. |
| [Limetown](../../catalog-src/shows/limetown.json) | Investigative docudrama mystery | Two-Up's official page establishes the reporter-led disappearance investigation, radio-drama/docudrama framing, two seasons, and a substantial ensemble cast. |
| [Passenger List](../../catalog-src/shows/passenger-list.json) | Investigative aviation thriller | The official Radiotopia site supports the missing-flight investigation, Kaitlin Le's search, two story seasons, scripts, and a large performed cast. |
| [Oblivity](../../catalog-src/shows/oblivity.json) | Workplace space sitcom | The publisher describes a comedy podcast about a disgraced war hero overseeing a dysfunctional Pluto research team, with a full-cast science-fiction audio-drama presentation. |
| [Midst](../../catalog-src/shows/midst.json) | Narrated science-fantasy ensemble | Third Person's official studio page describes the Midst cosmos, three intertwined antiheroes, and the science-fantasy setting; the local record identifies its three narrators and long companion feed. |
| [We Fix Space Junk](../../catalog-src/shows/we-fix-space-junk.json) | Character-led dark sci-fi comedy | Battle Bird Productions describes the show as a dark sci-fi comedy about two repairwomen surviving space, debt, and difficult jobs, with a long multi-season run. |
| [Caravan](../../catalog-src/shows/caravan.json) | Full-cast weird-west fantasy adventure | The Whisperforge's official synopsis supports the Wound Canyon setting, supernatural bounty-hunter caravan, found-family premise, and contained ten-episode story season. |
| [King Falls AM](../../catalog-src/shows/king-falls-am.json) | Broadcast-shaped paranormal town comedy | The publisher feed listing describes a late-night AM talk-radio show in a paranormal mountain town, with recurring voices, inhabitants, and a 121-entry long run. |

The selection addresses the current profile queue without editing records whose evidence was too thin or whose remaining gaps are primarily entity, collection, or factual-source research questions.

## 3. Evidence anchors checked

These sources supported premise, form, production framing, or listening commitment. They were not used to fabricate ratings, verification, or lifecycle state.

| Record | Source anchor and supported signal |
| --- | --- |
| Mockery Manor | [Long Cat Media — Mockery Manor](https://www.longcatmedia.com/mockery-manor) and [official Apple Podcasts listing](https://podcasts.apple.com/us/podcast/mockery-manor/id1481983747) — twin-led mystery, theme-park setting, full-cast presentation, and four-season structure. |
| Harbor | [Official Harbor site](https://harborpodcast.com/) — siblings, cryptids, found family, character development, acting, and supernatural plot framing. |
| How I Died | [Audiohm Media — How i Died](https://audiohmmedia.com/howidied/) — forensic pathologist premise, ghosts, full-cast serial fiction, mature-audience framing, and named cast. |
| Limetown | [Two-Up Productions — Limetown podcast](https://twoupproductions.com/limetown/podcast) — six-part origin, two seasons, reporter-led investigation, docudrama/radio-drama framing, and extensive episode casts. |
| Passenger List | [Passenger List official site](https://passengerlist.org/) and [Season 1 episode page](https://passengerlist.org/episode/1) — missing Flight 702 investigation, Kaitlin Le's lead, scripts, credits, and performed ensemble. |
| Oblivity | [Official Oblivity site](https://www.oblivitypodcast.com/) and [official Apple Podcasts listing](https://podcasts.apple.com/us/podcast/oblivity/id1453760605) — comedy sitcom premise, Pluto research team, full-cast science-fiction audio drama, and two-season feed. |
| Midst | [Third Person official studio page](https://www.thirdperson.media/) — Midst science-fantasy setting, three antiheroes, and the creators' narrated multimedia story context. |
| We Fix Space Junk | [Battle Bird Productions](https://battlebird.productions/) and [official Apple Podcasts listing](https://podcasts.apple.com/us/podcast/we-fix-space-junk/id1360406263) — dark sci-fi comedy, two repairwomen, survival/debt pressure, full-cast sitcom framing, and extended serial run. |
| Caravan | [The Whisperforge — CARAVAN](https://www.whisperforge.org/caravan) and [Season 1 page](https://www.whisperforge.org/caravan/season-1) — weird-west adventure, Wound Canyon, supernatural caravan, found-family stakes, performances, and ten numbered episodes. |
| King Falls AM | [Official Apple Podcasts listing](https://podcasts.apple.com/us/podcast/king-falls-am/id1016760065) — late-night AM talk-radio frame, paranormal mountain-town setting, recurring inhabitants, and 121 public episodes across the run. |

## 4. Enrichment decisions

The ten packets use only the controlled profile vocabulary already accepted by the catalog schema:

| Record | Curated discovery profile |
| --- | --- |
| Mockery Manor | Primarily acted; plot-driven; medium intensity; long commitment. The official full-cast murder mystery and four-season feed support a forward plot engine with a substantial but bounded listening route. |
| Harbor | Primarily acted; character-driven; medium intensity; long commitment. The official page emphasizes siblings, found family, relationships, acting, and a two-season supernatural story rather than nonstop escalation. |
| How I Died | Primarily acted; plot-driven; high intensity; long commitment. The forensic murder cases, paranormal premise, mature-audience framing, full-cast serial form, and four-season catalog support a high-pressure investigation route. |
| Limetown | Mixed; plot-driven; high intensity; medium commitment. Reporter narration, interviews, acted scenes, and a disappearance investigation support the mixed docudrama form; two seasons and twelve numbered story episodes keep the commitment contained. |
| Passenger List | Mixed; plot-driven; high intensity; medium commitment. The investigation uses reporting, recordings, scripts, and a performed ensemble around a missing-flight conspiracy across two story seasons. |
| Oblivity | Primarily acted; character-driven; medium intensity; medium commitment. The sitcom and dysfunctional research-team premise make crew chemistry central, while two seasons and twelve numbered story episodes keep the route approachable. |
| Midst | Primarily narrated; balanced; medium intensity; deep-dive commitment. Three narrators carry a large science-fantasy world and interwoven antihero story across three main seasons and an extensive companion feed. |
| We Fix Space Junk | Primarily acted; character-driven; medium intensity; deep-dive commitment. The two repairwomen, friendship, debt, and job-to-job structure are character-led, while the seven-season catalog supports a deep route. |
| Caravan | Primarily acted; character-driven; high intensity; short commitment. The cast-led weird-west adventure is anchored in Samir and the caravan's relationships, while the official ten-episode Season 1 structure is a contained route with adult content warnings. |
| King Falls AM | Primarily acted; balanced; medium intensity; deep-dive commitment. The late-night broadcast frame, recurring town ensemble, paranormal incidents, and 100 numbered story episodes support an extended listen without claiming a completed ending. |

No structured content keys, content-warning notes, tags, collections, ratings, similar-show links, or entity links were changed. The only authored source additions are the four profile keys per selected show, plus source-update dates on records whose prior date was older.

## 5. Collection and entity boundary

This batch made no curated collection edits. The current graph still contains 1,115 materialized membership edges, 371 shows with membership, and 381 without membership. The collection-candidate report remains a review aid; no automatic candidate was accepted.

This batch also made no entity edits. The entity graph remains source-backed at 132 public entities, 318 relationship records, and 266 linked shows. Profile work does not promote legacy creator or network strings into typed relationships.

## 6. Before/after metrics

The baseline is the generated catalog immediately after Batch 20, reconstructed from the current source state by removing only the new `discovery` objects for these ten records. Quality uses the existing 17-dimension discovery-quality score. Facet groups are tones, tags, best-for routes, and similar-show links. Profile keys are the four controlled discovery-profile keys. Structured-content counts are object keys, not a claim that each key has equal weight. Collection and authored-similarity counts show the unchanged public catalog surface.

| Show | Quality | Facet groups | Profile keys | Structured content | Content notes | Collections | Authored similar links |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Mockery Manor | 15 → 16 | 4 → 4 | 0 → 4 | 4 → 4 keys | 1 → 1 | 5 → 5 | 3 → 3 |
| Harbor | 15 → 16 | 4 → 4 | 0 → 4 | 4 → 4 keys | 3 → 3 | 2 → 2 | 3 → 3 |
| How I Died | 16 → 17 | 4 → 4 | 0 → 4 | 4 → 4 keys | 2 → 2 | 3 → 3 | 3 → 3 |
| Limetown | 15 → 16 | 4 → 4 | 0 → 4 | 4 → 4 keys | 1 → 1 | 6 → 6 | 3 → 3 |
| Passenger List | 14 → 15 | 4 → 4 | 0 → 4 | 4 → 4 keys | 1 → 1 | 6 → 6 | 3 → 3 |
| Oblivity | 14 → 15 | 4 → 4 | 0 → 4 | 4 → 4 keys | 1 → 1 | 5 → 5 | 3 → 3 |
| Midst | 15 → 16 | 4 → 4 | 0 → 4 | 4 → 4 keys | 2 → 2 | 7 → 7 | 4 → 4 |
| We Fix Space Junk | 15 → 16 | 4 → 4 | 0 → 4 | 4 → 4 keys | 1 → 1 | 6 → 6 | 3 → 3 |
| Caravan | 15 → 16 | 4 → 4 | 0 → 4 | 4 → 4 keys | 1 → 1 | 5 → 5 | 3 → 3 |
| King Falls AM | 14 → 15 | 4 → 4 | 0 → 4 | 4 → 4 keys | 1 → 1 | 6 → 6 | 3 → 3 |
| **Batch mean / total** | **14.8 → 15.8** | **40 → 40 facet groups** | **0 → 40 keys** | **40 → 40 keys** | **14 → 14 notes** | **51 → 51 memberships** | **31 → 31** |

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
| Curated discovery profiles | 204/752 | 214/752 | +10 |
| Tone / tag / best-for / similar source coverage | 235/752 each | 235/752 each | unchanged |
| Voice-style signal coverage | 200/752 | 210/752 | +10 |
| Narrative-focus signal coverage | 201/752 | 211/752 | +10 |
| Intensity signal coverage | 232/752 | 232/752 | unchanged; existing `content.intensity` already supplied coverage for these records |
| Commitment signal coverage | 195/752 | 205/752 | +10 |
| Authored similarity links / written reasons | 447/447 | 447/447 | unchanged |
| Collection membership edges | 1115 | 1115 | unchanged |
| Shows without collection membership | 381 | 381 | unchanged |
| Actionable eligible candidates | 106 | 106 | unchanged |
| Strict computed source shows / edges | 154/265 | 156/271 | +2 / +6 |

The profile queue falls from 31 eligible records without a curated profile to 21. The catalog remains intentionally asymmetric: imported records continue to carry factual metadata without editorial discovery fields.

## 7. Strict computed-similarity qualification

The public computed policy remains unchanged: score at least 20; pair, source, and target metadata coverage at least 0.65; at least three metadata dimensions; at least two anchor dimensions; at least two specific discovery dimensions; at least two explanation reasons; and a maximum of two public computed matches per source. Authored links and curated similarity evidence are excluded from this computation.

The current strict snapshot contains 156 source shows and 271 edges, compared with 154 source shows and 265 edges after Batch 20. The selected-source bounded check returned:

- How I Died → Station 151 (27.8) and The Magnus Protocol (24.6).
- Limetown → Spines (23.2) and Homecoming (21.4).
- Mockery Manor → Mission: Rejected (22.2) and Greater Boston (21.3).
- Caravan → The Far Meridian (28.3) and The Once and Future Nerd (22.6).
- Oblivity → We Fix Space Junk (24.4) and Stellar Firma (21.2).
- King Falls AM → The Amelia Project (22.9) and Midnight Burger (21.7).
- We Fix Space Junk → Oblivity (24.4) and Wooden Overcoats (20.0).
- Passenger List → Homecoming (23.5) and Jackie the Ripper (22.3).
- Harbor and Midst did not return a selected strict match in this bounded check.

These remain computed archive matches, not authored editorial recommendations; none were written into `similarTo`.

## 8. Graph and collection health

The post-build collection-candidate report contains 1,115 materialized membership edges, 371 shows with membership, 381 without membership, and 8,073 candidate edges across 333 unique shows. It reports no richly connected uncollected records in the selected top band, zero invalid collection references, and no near-duplicate collection pair. The low-membership threshold remains seven; drama and serialized remain broad underrepresented catalog areas at 45.5% and 49.5% coverage respectively. Candidate edges remain a review signal; no automatic memberships were accepted.

The post-build similarity report contains 447 authored links with 447 written reasons. Signal coverage is entity 266, genre 752, format 749, tone 235, theme 235, tag 235, best-for 235, voice style 210, narrative focus 211, intensity 232, commitment 205, release profile 283, shared collection 235, episode length 748, catalog length 751, and rating profile 27 out of 752 published records. The diagnostic scorer returned 188,600 candidate results with a 7.5–67.1 score range, 10.52 average, and 9.9 median; 2 sparse, 516 medium, and 234 enriched records. Candidate coverage remained 752/752 at least one, 752/752 at least three, 750/752 at least five, and 750/752 at least eight; candidate-count statistics were 3 minimum / 248 median / 484 maximum / 250.8 average. These diagnostics use the existing policy and are distinct from the stricter 156-source / 271-edge public computed gate above.

The entity graph remains at 132 public entities, 318 relationship records, and 266 linked shows; 486 shows have no entity relationship. No invalid or unresolved entity links were introduced, and the existing 43 type/role divergence warnings remain. All 1,115 materialized collection memberships resolve to published shows, and all 46 non-empty collections retain complete reasons.

The catalog report remains at Gate B complete, zero blocking errors, six missing RSS fields, 25 documented research-gap records, zero actionable RSS gaps, zero editorial gaps, zero taxonomy errors, and clean generated-output drift. The weak-collection-coverage measure remains 502; this is broader than the 381 shows with no collection membership used above.

This batch improves similarity evidence and route explanation for ten established catalog records without altering their factual surface or authored recommendation graph. The remaining 21 profile gaps, 381 uncollected shows, and 486-show deliberate entity-research queue remain meaningful evidence-review work; no stopping condition was reached.

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
- `npm run report:discovery-quality` — passed; 214 curated profiles, 235 shows with three or more useful facet groups, 371 shows with collections, 250 with at least two collections, and 106 actionable candidates.
- `npm run report:similarity` — passed; 447 authored links with 447 written reasons, 188,600 diagnostic candidates, and the unchanged similarity policy.
- `npm run report:collection-candidates` — passed; 1,115 membership edges, 381 shows without membership, 8,073 candidate edges across 333 shows, and 0 invalid references.
- `npm run report:entity-graph` — passed; 132 public entities, 318 relationship records, 266 linked shows, and 486 zero-relationship shows. No entity links were added.
- `npm run report:catalog` — passed; Gate B complete, 0 blocking errors, 0 actionable RSS gaps, 25 documented research-gap records, 0 editorial gaps, 0 taxonomy errors, and generated-output drift clean.
- Read-only profile integrity check — passed; 10 selected records, all four controlled profile values present, and no errors.
- `git diff --check` — passed after the QA report was added.
- Focused catalog/discovery/similarity/candidate tests — passed: 43/43.
- A bounded read-only computed-match comparison confirmed 156 strict source shows / 271 edges and the selected-source results above without changing scorer or policy files.

The worktree retains prior Phase 3 changes plus ten Batch 21 show-source profile updates, expected rebuilt catalog/search/status artifacts, and this QA report. No commit, push, deployment, or publication was performed. The queue still contains meaningful evidence-review work, so no stopping condition was reached.
