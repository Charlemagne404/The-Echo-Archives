# Phase 3 Batch 18 — Discovery Enrichment QA

Date: 2026-09-17  
Scope: eight published, enrichment-eligible show records and six curated collection sources  
Status: local source and generated-catalog validation only; not committed, deployed, or published

## 1. Scope and guardrails

Batch 18 continues the Phase 3 discovery-enrichment sequence after Batch 17. The post-Batch 17 queue contained 114 actionable eligible records, including seven records missing one or more of tone, best-for, or authored-similarity fields. This batch closes three of those high-yield facet gaps and adds five targeted collection routes for complete records that had only one or two memberships. The selection keeps the route work broader than the horror-heavy facet queue.

The existing source-of-truth rules were preserved:

- `catalog-src/shows/` and `catalog-src/collections/` remain authoritative; generated `data/` and `docs/generated/` files were rebuilt normally.
- Discovery values were added only where the record, existing objective source metadata, and an official, creator, publisher, provider, or feed source supported a useful classification.
- Knifepoint Horror, SCP Archives, and The Magnus Archives received bounded tone/theme/best-for/profile/content packets and independent directional authored similarity reasons.
- Love and Luck, Super Suits, Fawx & Stallion, The Godfrey Audio Guide, and The Archers received no new tones, themes, profiles, content notes, ratings, lifecycle fields, or authored similarity links. Their existing discovery data was retained.
- The similarity scorer, public computed-match gate, thresholds, weights, and explanation policy were not changed. Computed candidates were not promoted into authored relationships.
- No raw creator, network, publisher, provider, or broadcaster string was promoted to a new typed entity relationship. Existing entity links and provenance were not rewritten.
- Imported/factual-only records were not edited. No rating, review, community score, creator-verification claim, factual tag, genre, format, listen link, or lifecycle correction was added.
- Rule-based collections and existing similarity-collection materialization were not manually changed. Only six curated collection sources were extended, with a collection-specific `showReasons` value for every new edge.

## 2. Selection analysis

The pre-Batch 18 snapshot contained 752 published shows, 235 enrichment-eligible records, 371 shows with at least one collection, 381 without membership, and 114 actionable enrichment candidates. The remaining high-priority facet queue was concentrated in The Elmwood Strain, The Tower, The Magnus Protocol, and Shelterwood after this batch's three selected facet-gap records. The five route-only records were chosen from the current low-membership graph because their existing tone, tag, best-for, format, and source fields already supported a specific additional route.

| Record | Discovery function | Why this batch included it |
| --- | --- | --- |
| [Knifepoint Horror](../../catalog-src/shows/knifepoint-horror.json) | Single-narrator supernatural suspense anthology | A high-priority facet gap with strong official evidence for Soren Narnia's written, produced, and narrated standalone tales. |
| [SCP Archives](../../catalog-src/shows/scp-archives.json) | SCP Foundation case-file audio drama | A high-priority facet gap with official evidence for dossier-style anomalies, narration, additional actors, and immersive sound design. |
| [The Magnus Archives](../../catalog-src/shows/the-magnus-archives.json) | Serialized institutional horror anthology | A high-value facet gap in a flagship archive show; the official production page supports Jonathan Sims, the Magnus Institute, statements, and the accumulating mythology. |
| [Love and Luck](../../catalog-src/shows/love-and-luck.json) | Voicemail-framed queer magical romance | A one-membership, warm/hopeful record with an official low-friction romance and community-care premise suitable for Start here. |
| [Super Suits](../../catalog-src/shows/super-suits.json) | Superhero legal workplace comedy | A one-membership, warm/chaotic comedy with an explicit original-audio-comedy premise suitable for Warm weird comfort. |
| [Fawx & Stallion](../../catalog-src/shows/fawx-stallion.json) | Full-cast detective comedy | A two-membership record whose existing detective, friendship, and easy-entry signals support an additional Start here route. |
| [The Godfrey Audio Guide](../../catalog-src/shows/the-godfrey-audio-guide.json) | Museum-tour speculative mystery | A one-membership, sound-forward record whose existing museum, art, and late-night fields support a late-night route. |
| [The Archers](../../catalog-src/shows/the-archers.json) | Long-running village radio drama | A one-membership classic-radio record with existing small-town, family, and community signals suitable for Small-town strange signals. |

The remaining facet-gap candidates were not backfilled mechanically. The batch uses the strongest three source packets ready in the current graph and preserves the next review queue for a later evidence pass rather than forcing repetitive or weak metadata.

## 3. Evidence anchors checked

These sources supported premise, setting, form, production framing, or route intent. They were not used to fabricate ratings, verification, or lifecycle state.

| Record | Source anchor and supported signal |
| --- | --- |
| Knifepoint Horror | [SpectreVision official show page](https://www.spectrevision.com/podcasts/knifepoint-horror) — supernatural suspense, Soren Narnia's writing/production/narration, and the single-narrator form. |
| SCP Archives | [Official SCP Archives about page](https://scparchives.com/about-us) — collaborative SCP Foundation fiction, dossier-style entries, Jon Grilz narration, additional actors, and immersive sound design. |
| The Magnus Archives | [Rusty Quill official show page](https://rustyquill.com/show/the-magnus-archives/) — horror fiction anthology, the Magnus Institute archive, Jonathan Sims, recurring cast, statements, and the serialized mythology. |
| Love and Luck | [Official about page](https://www.loveandluckpodcast.com/about) — fictional radio play told through voicemails, queer romance, magic, community care, healthy relationships, and happy endings. |
| Super Suits | [Faustian Nonsense official show page](https://www.faustiannonsense.com/super-suits) — original audio comedy, superhero/supervillain legal workplace, Harper Hallo, and ensemble cast. |
| Fawx & Stallion | [Official cast and crew page](https://www.224bbaker.com/cast-crew-1) and [official listen page](https://www.224bbaker.com/listen) — full-cast detective-comedy production and the Fawx/Stallion partnership used by the existing discovery fields. |
| The Godfrey Audio Guide | [Official show site](https://thegodfreyaudioguide.com/) — the museum audio-guide premise and strange exhibit framing already represented by the local source record. |
| The Archers | [BBC programme page](https://www.bbc.co.uk/programmes/b006qpgr) and [official RSS feed](https://podcasts.files.bbci.co.uk/b006qpgr.rss) — maintained BBC programme/feed sources for the existing village-radio record; no new factual fields were inferred in this batch. |

## 4. Enrichment decisions

The three full packets are bounded to the evidence anchors above:

| Record | New discovery packet |
| --- | --- |
| Knifepoint Horror | Tones `dark`, `tense`, `bleak`; themes `supernatural suspense`, `uncanny encounters`, `anthology storytelling`; best-for `late-night`, `headphones-on`, `binge-listening`; profile primarily narrated, plot-driven, high intensity, deep-dive commitment; content describes original fiction, varied supernatural-suspense settings, Soren Narnia narrating each story, and a single-narrator atmospheric anthology. |
| SCP Archives | Tones `dark`, `tense`, `weird`; themes `SCP Foundation case files`, `containment protocols and anomalies`, `institutional horror`; best-for `late-night`, `headphones-on`, `binge-listening`; profile primarily narrated, plot-driven, high intensity, deep-dive commitment; content describes SCP Foundation collaborative fiction, anomalous case files, narration plus additional actors, and episodic audio-drama adaptation with immersive sound. |
| The Magnus Archives | Tones `dark`, `tense`, `weird`; existing themes retained and extended with `archives and institutional secrecy` and `esoteric research`; best-for `late-night`, `headphones-on`, `binge-listening`, `worldbuilding`; profile primarily acted, plot-driven, high intensity, deep-dive commitment; content describes the Magnus Institute archive, Jonathan Sims and recurring voices, and statements accumulating into a larger supernatural mythology. |

The six new authored relationships are directional and independently explained:

- Knifepoint Horror → The Magnus Archives: both build supernatural horror through a strong narrated voice and a record of disturbing cases; Knifepoint Horror stays with Soren Narnia's standalone tales, while The Magnus Archives turns institutional statements into a serialized mythology.
- Knifepoint Horror → The Other Stories: both offer deep anthologies of standalone genre fiction with a strong narrated voice; Knifepoint Horror stays with supernatural suspense, while The Other Stories ranges across science fiction, horror, thriller, and strange fiction.
- SCP Archives → The Magnus Archives: both turn institutional records of the supernatural into audio horror; SCP Archives adapts Foundation files with narration, actors, and immersive sound, while The Magnus Archives builds its case statements into a serialized mythology.
- SCP Archives → The Other Stories: both use a changing anthology of strange fiction as the entry point; SCP Archives stays with anomalous files and containment language, while The Other Stories moves across science fiction, horror, thriller, and WTF premises.
- The Magnus Archives → Knifepoint Horror: both build supernatural horror through a strong narrated voice and a record of disturbing cases; The Magnus Archives turns institutional statements into a serialized mythology, while Knifepoint Horror stays with standalone tales of suspense.
- The Magnus Archives → SCP Archives: both make an archive of anomalous cases the engine of the horror; The Magnus Archives follows the Magnus Institute's statements as they accumulate into mythology, while SCP Archives adapts Foundation files with additional actors and immersive sound.

The five route-only records only receive the following collection placements: Love and Luck in Start here, Super Suits in Warm weird comfort, Fawx & Stallion in Start here, The Godfrey Audio Guide in Late-night tension, and The Archers in Small-town strange signals. No new content notes were added.

## 5. Curated collection placements

The batch adds 12 curated membership edges. Existing rule/similarity memberships were regenerated from unchanged inputs and are not counted as authored batch edits.

| Collection | Added records |
| --- | --- |
| Late-night tension | Knifepoint Horror; SCP Archives; The Magnus Archives; The Godfrey Audio Guide |
| Headphones-on immersion | Knifepoint Horror; SCP Archives; The Magnus Archives |
| Worldbuilding deep dives | The Magnus Archives |
| Start here | Love and Luck; Fawx & Stallion |
| Warm weird comfort | Super Suits |
| Small-town strange signals | The Archers |

Existing memberships were retained, including Knifepoint Horror and SCP Archives in their existing horror/similarity routes, The Magnus Archives in Anthology Horror, Love and Luck in Warm weird comfort, and The Archers in Best for long walks. No rule or similarity collection source was manually changed, and every new curated edge has an explicit collection-specific reason in its canonical source.

## 6. Before/after metrics

The baseline is the generated catalog immediately after Batch 17, reconstructed from the current source state by removing only the Batch 18 discovery/content fields for Knifepoint Horror, SCP Archives, and The Magnus Archives and the 12 Batch 18 curated memberships. Quality uses the existing 17-dimension discovery-quality score. Facet groups are tones, tags, best-for routes, and similar-show links. Profile keys are the four optional discovery-profile keys. Structured-content counts are object keys, not a claim of four equally weighted facts. Collection counts include existing rule/similarity memberships so the table describes the actual public catalog surface.

| Show | Quality | Facet groups | Profile keys | Structured content | Content notes | Collections | Authored similar links |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Knifepoint Horror | 11 → 16 | 1 → 4 | 0 → 4 | 0 → 4 keys | 0 → 0 | 4 → 6 | 0 → 2 |
| SCP Archives | 11 → 16 | 1 → 4 | 0 → 4 | 0 → 4 keys | 0 → 0 | 3 → 5 | 0 → 2 |
| The Magnus Archives | 12 → 16 | 1 → 4 | 0 → 4 | 0 → 4 keys | 0 → 0 | 1 → 4 | 0 → 2 |
| Love and Luck | 16 → 16 | 4 → 4 | 4 → 4 | 4 → 4 keys | 0 → 0 | 1 → 2 | 1 → 1 |
| Super Suits | 16 → 16 | 4 → 4 | 4 → 4 | 4 → 4 keys | 0 → 0 | 1 → 2 | 1 → 1 |
| Fawx & Stallion | 15 → 15 | 4 → 4 | 4 → 4 | 4 → 4 keys | 2 → 2 | 2 → 3 | 2 → 2 |
| The Godfrey Audio Guide | 15 → 15 | 4 → 4 | 4 → 4 | 3 → 3 keys | 0 → 0 | 1 → 2 | 1 → 1 |
| The Archers | 15 → 15 | 4 → 4 | 4 → 4 | 4 → 4 keys | 0 → 0 | 1 → 2 | 1 → 1 |
| **Batch mean / total** | **13.9 → 15.6** | **23 → 32 facet groups** | **20 → 32 keys** | **19 → 31 keys** | **2 → 2 notes** | **14 → 26 memberships** | **6 → 12** |

The catalog-wide deltas are:

| Measurement | Before | After | Change |
| --- | ---: | ---: | ---: |
| Published shows | 752 | 752 | unchanged |
| Enrichment-eligible / imported / editorial | 235 / 517 / 7 | 235 / 517 / 7 | unchanged |
| Shows with at least one collection | 371/752 | 371/752 | unchanged |
| Shows with at least two collections | 241/752 | 246/752 | +5 |
| Shows with at least one useful facet | 235/752 | 235/752 | unchanged |
| Shows with three or more useful facet groups | 228/752 | 231/752 | +3 |
| Curated discovery profiles | 187/752 | 190/752 | +3 |
| Tone coverage | 229/752 | 232/752 | +3 |
| Themes or content-note coverage | 231/752 | 233/752 | +2 |
| Best-for coverage | 228/752 | 231/752 | +3 |
| Similar-show source coverage | 227/752 | 230/752 | +3 |
| Authored similarity links / written reasons | 431/431 | 437/437 | +6 / +6 |
| Shows with authored outgoing routes | 227 | 230 | +3 |
| Collection membership edges | 1097 | 1109 | +12 |
| Shows without collection membership | 381 | 381 | unchanged |
| Actionable eligible candidates | 114 | 111 | -3 |
| Strict computed source shows / edges | 140/238 | 147/249 | +7 / +11 |

The generated discovery report leaves 111 actionable candidates in the full queue after this batch. Imported records remain outside the editorial work queue.

## 7. Strict computed-similarity qualification

The public policy remains unchanged: score at least 20; pair, source, and target metadata coverage at least 0.65; at least three metadata dimensions; at least two anchor dimensions; at least two specific discovery dimensions; at least two explanation reasons; and a maximum of two public computed matches per source. Authored links and curated similarity evidence are excluded from this computation.

The selected records that clear the strict public computed gate after Batch 18 are:

- Knifepoint Horror → [The NoSleep Podcast](../../catalog-src/shows/the-nosleep-podcast.json) (22.3) and [SCP Archives](../../catalog-src/shows/scp-archives.json) (20.5).
- SCP Archives → [WOE.BEGONE](../../catalog-src/shows/woe-begone.json) (23.2) and [HORROR ETERNAL](../../catalog-src/shows/horror-eternal.json) (21.9).
- The Magnus Archives → [The Magnus Protocol](../../catalog-src/shows/the-magnus-protocol.json) (28.0) and [Bridgewater](../../catalog-src/shows/bridgewater.json) (20.3).
- Fawx & Stallion → [MarsCorp](../../catalog-src/shows/marscorp.json) (20.2).
- Super Suits → [The Land Whale Murders](../../catalog-src/shows/the-land-whale-murders.json) (20.0).

Love and Luck, The Godfrey Audio Guide, and The Archers did not clear the strict computed gate in this snapshot. These are computed archive matches, not authored editorial recommendations; none of the computed results were written into `similarTo`.

The reconstructed pre-Batch 18 state had 140 strict computed source shows and 238 edges. The post-batch state has 147 strict computed source shows and 249 edges. The route-only collection additions changed computed evidence for existing candidates, but no computed result was promoted.

## 8. Graph and collection health

The post-build collection-candidate report contains 1,109 materialized membership edges, 371 shows with membership, 381 without membership, and 8,000 candidate edges across 331 unique shows. It reports no richly connected uncollected records in the selected top band, zero invalid collection references, no near-duplicate collection pair, and a low-membership threshold of seven. Drama and serialized remain broad underrepresented catalog areas at 45.5% and 49.5% coverage respectively. Candidate edges remain a review signal; no automatic memberships were accepted.

The post-build similarity report contains 437 authored links with 437 written reasons. Signal coverage is entity 266, genre 752, format 749, tone 232, theme 233, tag 235, best-for 231, voice style 186, narrative focus 187, intensity 229, commitment 181, release profile 283, shared collection 233, episode length 748, catalog length 751, and rating profile 27 out of 752 published records. The diagnostic scorer returned 186,714 candidate results with a 7.5–63.7 score range, 10.47 average, and 9.9 median; 2 sparse, 517 medium, and 233 enriched records. These diagnostics use the existing policy and are distinct from the stricter 147-source / 249-edge public computed gate above.

The entity graph remains at 132 public entities, 318 relationship records, and 266 linked shows; 486 shows have no entity relationship. No invalid or unresolved entity links were introduced, and the existing 43 type/role divergence warnings remain. All 1,109 materialized collection memberships resolve to published shows, and all 46 non-empty collections retain complete reasons.

The catalog report remains at Gate B complete, zero blocking errors, six missing RSS fields, 25 documented research-gap records, zero actionable RSS gaps, zero editorial gaps, zero taxonomy errors, and clean generated-output drift. The report's weak-collection-coverage measure is 506; this is a broader quality diagnostic than the 381 shows with no collection membership used above.

This batch improves route coverage for narrated supernatural suspense, collaborative case-file horror, institutional archive horror, queer magical romance, superhero workplace comedy, detective comedy, museum mystery, and village radio drama. It leaves the remaining four facet-gap records, entity gaps, lifecycle uncertainty, and lower-evidence uncollected records for later source review rather than filling them mechanically.

## 9. Rejected or deferred decisions

- No new controlled tags were added; existing factual tags and bounded themes supplied the needed discovery signals.
- No entity links were added for the creators, production companies, networks, publishers, providers, or broadcasters associated with the selected records. Entity promotion remains a separate source-backed registry task.
- Existing rule-based and similarity-collection memberships were not manually edited.
- No release or completion state was inferred from current provider pages, episode counts, or feed activity. The selected records retain their existing lifecycle values.
- No additional content notes were added. The selected records' existing warning fields remain unchanged.
- The Magnus Archives content and discovery fields were added without changing its existing completed/finished lifecycle state or its existing typed Rusty Quill/Jonathan Sims relationships.
- The horror-heavy remainder of the facet queue was left for a later evidence and diversity review; no weak substitute metadata was written.
- No ratings, reviews, verification states, factual metadata, lifecycle fields, similarity thresholds, collection rules, or public explanation policies were changed.

## 10. Validation and worktree boundary

Commands run after the canonical source edits:

- `npm run build:catalog` — passed; built artifacts for 752 shows, 46 collections, and 7 review companions.
- `npm run validate:data` — passed with 0 integrity errors across 752 shows, 46 collections, 132 entities, and 7 review companions. The existing 43 entity type/role divergence warnings remain; no invalid or unresolved entity links were introduced.
- `npm run report:discovery-quality` — passed; 371 shows with collections, 246 with at least two collections, 231 with three or more useful facet groups, 190 curated profiles, and 111 actionable candidates.
- `npm run report:similarity` — passed; 437 authored links with 437 written reasons and the unchanged similarity policy.
- `npm run report:collection-candidates` — passed; 1,109 membership edges, 381 shows without membership, 8,000 candidate edges across 331 shows, and 0 invalid references.
- `npm run report:entity-graph` — passed; 132 public entities, 318 relationship records, 266 linked shows, and 486 zero-relationship shows. No entity links were added.
- `npm run report:catalog` — passed; Gate B complete, 0 blocking errors, 0 actionable RSS gaps, 25 documented research-gap records, 0 editorial gaps, 0 taxonomy errors, and generated-output drift clean.
- `git diff --check` — passed before this report was written; it will be rerun after the report is added.
- Focused catalog/discovery/similarity/candidate tests — passed: 43/43.
- A read-only Node comparison reconstructed the pre-Batch 18 graph and confirmed the per-record quality, facet, profile, content, collection, authored-route, and strict computed-similarity deltas above. No scorer or policy files were changed.

The worktree retains prior Phase 3 changes plus seven Batch 18 show-source updates, six curated collection-source updates, expected rebuilt catalog/search/status artifacts, and this QA report. The Archers source was already timestamped 2026-09-17 and required no show-file edit. No commit, push, deployment, or publication was performed. The queue still contains meaningful evidence-review work, so no stopping condition was reached.
