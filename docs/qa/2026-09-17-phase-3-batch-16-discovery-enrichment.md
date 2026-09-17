# Phase 3 Batch 16 — Discovery Enrichment QA

Date: 2026-09-17  
Scope: eight published, enrichment-eligible show records and twelve curated collection sources  
Status: local source and generated-catalog validation only; not committed, deployed, or published

## 1. Scope and guardrails

Batch 16 continues the Phase 3 discovery-enrichment sequence after Batch 15. The post-Batch 15 queue contained 125 actionable eligible records. This batch selects eight records with distinct discovery functions: anthology horror, science-fiction horror, epistolary mystery, deep-ocean science fiction, satirical conspiracy comedy, supernatural fantasy, an in-world museum tour, and found-recording paranormal horror.

The existing source-of-truth rules were preserved:

- `catalog-src/shows/` and `catalog-src/collections/` remain authoritative; generated `data/` and `docs/generated/` files were rebuilt normally.
- Discovery values were added only where the record, existing objective source metadata, and an official, creator, publisher, provider, or feed source supported a useful classification.
- Every new `similarTo` edge received an explicit directional reason. Reciprocal copying was not used as a substitute for editorial judgment.
- The similarity scorer, public computed-match gate, thresholds, weights, and explanation policy were not changed. Computed candidates were not promoted into authored relationships.
- No raw creator, network, publisher, provider, or broadcaster string was promoted to a new typed entity relationship.
- No rating, review, community score, creator-verification claim, factual tag, genre, format, listen link, or lifecycle correction was added.
- Imported/factual-only records were not edited. Existing typed entity relationships and provenance were not rewritten.
- Rule-based collections and existing similarity-collection materialization were not manually changed. Only curated collection sources were extended.
- A bounded content-note set was added only for Syntax, using the warning cues exposed by its provider/source listing.

## 2. Selection analysis

The post-Batch 15 snapshot contained 752 published shows, 235 enrichment-eligible records, 368 shows with at least one collection, 384 without membership, and 125 actionable enrichment candidates. The selected records widen the graph beyond a single horror or science-fiction pattern while retaining source-backed routes for listeners who want anthology depth, full-cast immersion, short mysteries, satire, supernatural warmth, or long-form worldbuilding.

| Record | Discovery function | Why this batch included it |
| --- | --- | --- |
| [The NoSleep Podcast](../../catalog-src/shows/the-nosleep-podcast.json) | Rotating-voice original horror anthology | Adds a deep anthology route with changing voices, atmospheric production, and long-listen value. |
| [Syntax](../../catalog-src/shows/syntax.json) | Full-cast science-fiction horror serial | Adds a serious-sci-fi and survival route grounded in VINCULA, the Breach, Silas, and a high-pressure expedition. |
| [The Dead Letters Podcast](../../catalog-src/shows/the-dead-letters-podcast.json) | Epistolary historical mystery | Adds a compact multi-period mystery route built around five women and threatening letters. |
| [The Leviathan Chronicles](../../catalog-src/shows/the-leviathan-chronicles.json) | Full-cast deep-ocean science-fiction saga | Adds a long-form hidden-city and secret-history route with strong worldbuilding and survival intent. |
| [Two Flat Earthers Kidnap a Freemason](../../catalog-src/shows/two-flat-earthers-kidnap-a-freemason.json) | Satirical conspiracy dark comedy | Adds a warm-weird, easy-entry route that gives the graph a comic counterpoint to its thriller-heavy candidates. |
| [Where the Stars Fell](../../catalog-src/shows/where-the-stars-fell.json) | Character-led supernatural fantasy | Adds a small-town, rapture-adjacent supernatural route with warmth, humor, and a medium commitment. |
| [The Mistholme Museum of Mystery, Morbidity, and Mortality](../../catalog-src/shows/the-mistholme-museum-of-mystery-morbidity-and-mortality.json) | In-world museum anthology | Adds a strange-institution and audio-tour route with deep archive atmosphere and flexible anthology structure. |
| [The Sheridan Tapes](../../catalog-src/shows/the-sheridan-tapes.json) | Found-recording paranormal investigation | Adds a recovered-media route centered on Anna Sheridan's disappearance and Detective Sam Bailey's investigation. |

## 3. Evidence anchors checked

These sources supported premise, setting, form, production framing, route length, or the bounded content-note decision. They were not used to fabricate ratings, verification, or lifecycle state.

| Record | Source anchor and supported signal |
| --- | --- |
| The NoSleep Podcast | [Official show site](https://www.thenosleeppodcast.com/) and [official about page](https://www.thenosleeppodcast.com/about) — original horror fiction anthology, rotating stories/voices, and atmospheric music and sound production. |
| Syntax | [Official show site](https://syntaxpodcast.org/) and [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/syntax/id1613894378) — science-fiction horror audio drama, VINCULA/Breach setting, Silas and the expedition, full-cast framing, and provider warning cues. |
| The Dead Letters Podcast | [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/the-dead-letters-podcast/id1475811138) — five women, mysterious letters, historical spread, danger/death framing, and the documented concluding episode. |
| The Leviathan Chronicles | [Official show site](https://www.leviathanchronicles.com/) and [official about page](https://www.leviathanchronicles.com/about/) — hidden city in the Pacific trenches, immortals, Macallan, factions, and full-cast science-fiction saga. |
| Two Flat Earthers Kidnap a Freemason | [Good Pointe show page](https://goodpointepodcasts.com/2fekafep1), [official transcript page](https://goodpointepodcasts.com/2fekaf-transcripts), and [project campaign page](https://www.indiegogo.com/en/projects/goodpointe/two-flat-earthers-kidnap-a-freemason-audio-drama) — Randy, Gayle, the Freemason, conspiracy culture, and satirical dark-comedy framing. |
| Where the Stars Fell | [Official show site](https://wherethestarsfell.com/) — Dr. Edison Tucker, Lucille Kensington, Jerusalem, Oregon, the guardian-angel/Antichrist premise, rapture framing, and cast/crew context. |
| The Mistholme Museum of Mystery, Morbidity, and Mortality | [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/the-mistholme-museum-of-mystery-morbidity-and-mortality/id1506017781) — Audio Tour Guide, strange museum exhibits, written/performed/edited-by-creator framing, and serialized in-world tour structure. |
| The Sheridan Tapes | [Apple Podcasts listing](https://podcasts.apple.com/us/podcast/the-sheridan-tapes/id1508614133) and [official press kit](https://homesteadonthecorner.com/wp-content/uploads/2022/12/the-sheridan-tapes-press-kit-2022.pdf) — missing writer Anna Sheridan, recovered cassettes, Detective Sam Bailey, and serialized horror/mystery found-media framing. |

## 4. Enrichment decisions

All eight records received a coherent discovery packet. The packets distinguish route language from objective metadata and retain existing factual fields. Only Syntax received new `contentNotes`.

| Record | Tones / themes | Best-for routes | Profile | Authored similarity |
| --- | --- | --- | --- | --- |
| The NoSleep Podcast | `dark`, `tense`, `weird`; original horror anthology, nightmare/uncanny fiction, changing voices | long walks, late night, headphones on, binge listening | mixed; plot-driven; high; deep dive | The Other Stories |
| Syntax | `dark`, `tense`, `weird`; biotech/artifacts, expedition beyond the Breach, identity and survival | serious sci-fi, headphones on, late night, worldbuilding, binge listening | primarily acted; plot-driven; high; deep dive | The Call of the Void |
| The Dead Letters Podcast | `dark`, `tense`, `weird`; mysterious letters, women across history, death warnings/family secrets | easy entry, late night, headphones on, binge listening | primarily acted; plot-driven; high; medium | The Cellar Letters |
| The Leviathan Chronicles | `dark`, `tense`, `cinematic`; hidden city/immortals, deep-ocean society, global conspiracy/survival | serious sci-fi, worldbuilding, long walks, headphones on, binge listening | primarily acted; plot-driven; high; deep dive | The Strata |
| Two Flat Earthers Kidnap a Freemason | `funny`, `dark`, `chaotic`; conspiracy culture, kidnapping/certainty, satirical seasons | easy entry, warm weird, binge listening | primarily acted; character-driven; variable; medium | The Subjective Truth |
| Where the Stars Fell | `funny`, `weird`, `hopeful`; immortality/identity, guardian angel/Antichrist, small-town rapture | easy entry, warm weird, worldbuilding, binge listening | primarily acted; character-driven; variable; medium | The Way We Haunt Now |
| The Mistholme Museum of Mystery, Morbidity, and Mortality | `dark`, `weird`, `funny`; strange exhibits, artifacts/hidden histories, the guide and tour rules | worldbuilding, headphones on, late night, binge listening | mixed; balanced; variable; deep dive | The Magnus Archives |
| The Sheridan Tapes | `dark`, `tense`, `weird`; missing writer/recovered media, investigation/impossible encounters, love/loss/legacy | late night, headphones on, worldbuilding, binge listening | mixed; plot-driven; high; deep dive | The Storage Papers |

The authored reasons are directional and source-specific:

- The NoSleep Podcast → The Other Stories: both offer deep anthologies of standalone genre fiction with changing voices and stories; NoSleep stays focused on original horror with atmospheric music, while The Other Stories ranges more broadly across science fiction, horror, thriller, and strange fiction.
- Syntax → The Call of the Void: both are psychological science-fiction horror dramas that turn an impossible discovery into a widening threat; Syntax follows Silas and a breach team into an alien depth, while The Call of the Void builds its pressure around a world-stilling entity and human consequences.
- The Dead Letters Podcast → The Cellar Letters: both use letters and recovered writing as the engine of a serialized mystery; Dead Letters follows five women receiving warnings across history, while The Cellar Letters turns inherited correspondence into a darker investigation.
- The Leviathan Chronicles → The Strata: both are long-form science-fiction dramas built around layered societies and survival under pressure; Leviathan descends into a hidden city of immortals and secret histories, while The Strata stays in a class-divided metropolis with a courier at its center.
- Two Flat Earthers Kidnap a Freemason → The Subjective Truth: both come from Good Pointe and use conspiracy-shaped investigations to examine how people construct certainty; Two Flat turns that premise into satirical dark comedy, while The Subjective Truth follows a paranormal docudrama investigation.
- Where the Stars Fell → The Way We Haunt Now: both are warm, character-led supernatural dramas about finding a way to live with the impossible; Where the Stars Fell puts an immortal and a guardian angel in a town awaiting the rapture, while The Way We Haunt Now builds its connection through ghosts and found family.
- The Mistholme Museum → The Magnus Archives: both frame strange encounters through an institutional archive of unsettling stories; Mistholme uses an audio-tour guide and dangerous exhibits, while The Magnus Archives builds its supernatural record through statements from the Magnus Institute.
- The Sheridan Tapes → The Storage Papers: both turn recovered recordings into the spine of a serialized paranormal investigation; Sheridan follows Detective Sam Bailey through Anna Sheridan's cassettes, while The Storage Papers begins with an abandoned unit and the papers hidden inside it.

Structured content packets record only the supported framing:

- The NoSleep Podcast: original fiction; varied settings across original horror stories; rotating characters and narrators across standalone stories; anthology horror podcast with atmospheric music and sound effects.
- Syntax: original fiction; VINCULA's research facilities and the world beyond the Breach; Silas Caldwell and a team of scientists and explorers; serialized full-cast science-fiction horror audio drama.
- The Dead Letters Podcast: original fiction; multiple historical periods connected by the letters; five women whose lives are shaped by mysterious warnings; serialized mystery audio drama.
- The Leviathan Chronicles: original fiction; the hidden city of Leviathan in the deep Pacific trenches and the wider world; Macallan Orsel and the factions drawn into Leviathan's immortal conflict; long-running full-cast science-fiction audio saga.
- Two Flat Earthers Kidnap a Freemason: original fiction; the contemporary internet-conspiracy world; Randy Dunning, Gayle Kruger, and the Freemason they kidnap for answers; serialized satirical dark comedy with stand-alone seasons.
- Where the Stars Fell: original fiction; Jerusalem, Oregon; Dr. Edison Tucker and Lucille Kensington as their housemate mystery widens; serialized supernatural fantasy audio drama.
- The Mistholme Museum: original fiction; the Mistholme Museum and its strange or potentially magical exhibits; the Audio Tour Guide introducing visitors to the museum's histories; serialized anthology delivered as an in-world audio tour.
- The Sheridan Tapes: original fiction; the Pacific Northwest and the impossible encounters captured in Anna Sheridan's tapes; Detective Sam Bailey piecing together Anna Sheridan's disappearance; serialized horror mystery built from found recordings.

Syntax's bounded content notes are: `death and violence`, `religious sacrifice`, `explicit language`, `loud or surprising noises`, and `panic and anxiety attacks`. No other selected record received content notes in this batch.

## 5. Curated collection placements

The batch adds 28 curated membership edges. Existing rule/similarity memberships were regenerated from unchanged inputs and are not counted as authored batch edits.

| Collection | Added records |
| --- | --- |
| Best for long walks | The NoSleep Podcast; The Leviathan Chronicles |
| Serious sci-fi | Syntax; The Leviathan Chronicles |
| Late-night tension | The NoSleep Podcast; Syntax; The Dead Letters Podcast; The Mistholme Museum; The Sheridan Tapes |
| Headphones-on immersion | The NoSleep Podcast; Syntax; The Leviathan Chronicles; The Mistholme Museum; The Sheridan Tapes |
| Worldbuilding deep dives | Syntax; The Leviathan Chronicles; Where the Stars Fell; The Sheridan Tapes |
| Quick first listens | The Dead Letters Podcast |
| Short finished thrillers | The Dead Letters Podcast |
| Easy first steps | Two Flat Earthers Kidnap a Freemason; Where the Stars Fell |
| Warm weird comfort | Two Flat Earthers Kidnap a Freemason; Where the Stars Fell |
| Comedy with a mystery | Two Flat Earthers Kidnap a Freemason |
| Survival pressure | Syntax; The Leviathan Chronicles |
| Fantasy detours and hidden worlds | Where the Stars Fell |

Existing memberships were retained, including Where the Stars Fell in Small-town strange signals, The Sheridan Tapes in Found recordings and buried evidence, and all unchanged rule/similarity materialization. Every new curated edge carries a collection-specific `showReasons` explanation in its canonical source. No rule or similarity collection source was manually changed.

## 6. Before/after metrics

The baseline is the generated catalog immediately after Batch 15, reconstructed from the current source state by removing only Batch 16 discovery/content fields and the 28 Batch 16 curated memberships. Quality uses the existing 17-dimension discovery-quality score. Facet groups are tones, tags, best-for routes, and similar-show links. Profile keys are the four optional discovery-profile keys. Collection counts include existing rule/similarity memberships so the table describes the actual public catalog surface.

| Show | Quality | Facet groups | Profile keys | Structured content | Content notes | Collections | Authored similar links |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| The NoSleep Podcast | 10 → 15 | 1 → 4 | 0 → 4 | 0 → 4 keys | 0 → 0 | 3 → 6 | 0 → 1 |
| Syntax | 11 → 16 | 1 → 4 | 0 → 4 | 0 → 4 keys | 0 → 5 | 2 → 7 | 0 → 1 |
| The Dead Letters Podcast | 11 → 16 | 1 → 4 | 0 → 4 | 0 → 4 keys | 0 → 0 | 1 → 4 | 0 → 1 |
| The Leviathan Chronicles | 11 → 16 | 1 → 4 | 0 → 4 | 0 → 4 keys | 0 → 0 | 1 → 6 | 0 → 1 |
| Two Flat Earthers Kidnap a Freemason | 11 → 16 | 1 → 4 | 0 → 4 | 0 → 4 keys | 0 → 0 | 2 → 5 | 0 → 1 |
| Where the Stars Fell | 11 → 16 | 1 → 4 | 0 → 4 | 0 → 4 keys | 0 → 0 | 1 → 5 | 0 → 1 |
| The Mistholme Museum | 11 → 16 | 1 → 4 | 0 → 4 | 0 → 4 keys | 0 → 0 | 3 → 5 | 0 → 1 |
| The Sheridan Tapes | 11 → 16 | 1 → 4 | 0 → 4 | 0 → 4 keys | 0 → 0 | 1 → 4 | 0 → 1 |
| **Batch mean / total** | **10.9 → 15.9** | **8 → 32 facet groups** | **0 → 32 keys** | **0 → 32 keys** | **0 → 5 notes** | **13 → 42 memberships** | **0 → 8** |

The catalog-wide deltas are:

| Measurement | Before | After | Change |
| --- | ---: | ---: | ---: |
| Published shows | 752 | 752 | unchanged |
| Enrichment-eligible / imported / editorial | 235 / 517 / 7 | 235 / 517 / 7 | unchanged |
| Shows with at least one collection | 368/752 | 368/752 | unchanged |
| Shows with at least two collections | 233/752 | 237/752 | +4 |
| Shows with at least one useful facet | 235/752 | 235/752 | unchanged |
| Shows with three or more useful facet groups | 219/752 | 227/752 | +8 |
| Curated discovery profiles | 178/752 | 186/752 | +8 |
| Tone coverage | 220/752 | 228/752 | +8 |
| Themes or content-note coverage | 222/752 | 230/752 | +8 |
| Best-for coverage | 219/752 | 227/752 | +8 |
| Similar-show source coverage | 218/752 | 226/752 | +8 |
| Authored similarity links / written reasons | 421/421 | 429/429 | +8 / +8 |
| Shows with authored outgoing routes | 218 | 226 | +8 |
| Collection membership edges | 1054 | 1082 | +28 |
| Shows without collection membership | 384 | 384 | unchanged |
| Actionable eligible candidates | 125 | 118 | -7 |
| Strict computed source shows / edges | 132/223 | 139/236 | +7 / +13 |

The generated discovery report leaves 118 actionable candidates in the full queue after this batch. Imported records remain outside the editorial work queue.

## 7. Strict computed-similarity qualification

The public policy remains unchanged: score at least 20; pair, source, and target metadata coverage at least 0.65; at least three metadata dimensions; at least two anchor dimensions; at least two specific discovery dimensions; at least two explanation reasons; and a maximum of two public computed matches per source. Authored links and curated similarity evidence are excluded from this computation.

The selected records that clear the strict public computed gate after Batch 16 are:

- Syntax → [The Leviathan Chronicles](../../catalog-src/shows/the-leviathan-chronicles.json) (21.6) and [The Parkdale Haunt](../../catalog-src/shows/parkdale-haunt.json) (20.4).
- The Dead Letters Podcast → [Badlands Cola](../../catalog-src/shows/badlands-cola.json) (21.0).
- The Leviathan Chronicles → [We're Alive](../../catalog-src/shows/were-alive.json) (22.4) and Syntax (21.6).
- Two Flat Earthers Kidnap a Freemason → [Hannahpocalypse](../../catalog-src/shows/hannahpocalypse.json) (21.3) and [World Gone Wrong](../../catalog-src/shows/world-gone-wrong-a-fictional-chat-show-about-friendship-at-the-end-of-the-world.json) (21.1).
- The Sheridan Tapes → [The Hidden People](../../catalog-src/shows/the-hidden-people.json) (23.0) and [Marvel's Wolverine: The Long Night](../../catalog-src/shows/marvels-wolverine-the-long-night.json) (20.9).

The NoSleep Podcast, Where the Stars Fell, and The Mistholme Museum did not clear the strict computed gate in this snapshot. These are computed archive matches, not authored editorial recommendations; none of the computed results were written into `similarTo`.

The reconstructed pre-Batch 16 state had 132 strict computed source shows and 223 edges, with none of the eight selected records qualifying. The post-batch state has 139 strict computed source shows and 236 edges.

## 8. Graph and collection health

The post-build collection-candidate report contains 1,082 materialized membership edges, 368 shows with membership, 384 without membership, and 7,919 candidate edges across 331 unique shows. It reports zero invalid collection references, no near-duplicate collection pair, and a low-membership threshold of seven. Drama and serialized remain broad underrepresented catalog areas at 45.3% and 49.3% coverage respectively. Candidate edges remain a review signal; no automatic memberships were accepted.

The post-build similarity report contains 429 authored links with 429 written reasons. Signal coverage is entity 266, genre 752, format 749, tone 228, theme 230, tag 235, best-for 227, voice style 182, narrative focus 183, intensity 225, commitment 177, release profile 283, shared collection 228, episode length 748, catalog length 751, and rating profile 27 out of 752 published records. The diagnostic scorer returned 185,710 candidate results with a 7.5–63.8 score range, 10.45 average, and 9.8 median; 2 sparse, 518 medium, and 232 enriched records. These diagnostics use the existing policy and are distinct from the stricter 139-source / 236-edge public computed gate above.

The entity graph remains at 132 public entities, 318 relationship records, and 266 linked shows; 486 shows have no entity relationship. No invalid or unresolved entity links were introduced, and the existing 43 type/role divergence warnings remain.

The catalog report remains at Gate B complete, zero blocking errors, six missing RSS fields, 25 documented research-gap records, zero actionable RSS gaps, and clean generated-output drift. The report's weak-collection-coverage measure is 515; this is a broader quality diagnostic than the 384 shows with no collection membership used above.

This batch adds usable routes for anthology depth, full-cast science-fiction horror, historical letter mysteries, deep-ocean worldbuilding, satirical conspiracy comedy, supernatural warmth, in-world museum strangeness, and found-recording investigation. It leaves unresolved entity evidence, lifecycle uncertainty, and uncollected records for later source review rather than filling gaps mechanically.

## 9. Rejected or deferred decisions

- No new controlled tags were added; existing factual tags and free-text themes supplied the needed discovery signals.
- No entity links were added for the creators, production companies, networks, publishers, providers, or broadcasters associated with these records. Entity promotion remains a separate source-backed registry task.
- Existing rule-based and similarity-collection memberships were not manually edited.
- No release or completion state was inferred from current provider pages, episode counts, or feed activity. The selected records retain their existing lifecycle values.
- The Dead Letters placement in Short finished thrillers uses the existing curated route and the provider's documented concluding episode as a bounded listening-path signal; it does not change lifecycle fields or assert a newly verified completion fact.
- No additional content notes were added where the checked sources did not provide a sufficiently specific warning set. Syntax's five notes retain bounded source-supported wording only.
- No ratings, reviews, verification states, factual metadata, lifecycle fields, similarity thresholds, collection rules, or public explanation policies were changed.

## 10. Validation and worktree boundary

Commands run after the canonical source edits:

- `npm run build:catalog` — passed; built artifacts for 752 shows, 46 collections, and 7 review companions.
- `npm run validate:data` — passed with 0 integrity errors across 752 shows, 46 collections, 132 entities, and 7 review companions. The existing 43 entity type/role divergence warnings remain; no invalid or unresolved entity links were introduced.
- `npm run report:discovery-quality` — passed; 368 shows with collections, 237 with at least two collections, 227 with three or more useful facet groups, 186 curated profiles, and 118 actionable candidates.
- `npm run report:similarity` — passed; 429 authored links with 429 written reasons and the unchanged similarity policy.
- `npm run report:collection-candidates` — passed; 1,082 membership edges, 384 shows without membership, 7,919 candidate edges across 331 shows, and 0 invalid references.
- `npm run report:entity-graph` — passed; 132 public entities, 318 relationship records, 266 linked shows, and 486 zero-relationship shows. No entity links were added.
- `npm run report:catalog` — passed; Gate B complete, 0 blocking errors, 0 actionable RSS gaps, 25 documented research-gap records, and generated-output drift clean.
- `git diff --check` — passed.
- Focused catalog/discovery/similarity/candidate tests — passed: 40/40.
- A read-only Node comparison reconstructed the pre-Batch 16 graph and confirmed the per-record quality, facet, profile, content, collection, and authored-route deltas above, plus the strict computed-similarity delta from 132/223 to 139/236. No scorer or policy files were changed.

The worktree retains prior Phase 3 changes plus the eight Batch 16 show-source edits, twelve curated collection-source updates, expected rebuilt catalog/search/status artifacts, and this QA report. No commit, push, deployment, or publication was performed. The queue still contains meaningful evidence-review work, so no stopping condition was reached.
