# Phase 3 Batch 2 — Discovery enrichment QA

Date: 2026-09-16  
Status: complete; local source and generated catalog validated; not deployed or published.

This batch treats Batch 1 as evidence that coherent enrichment can work, not as a numerical template. The ten records were selected to preserve different starting conditions, then enriched as complete discovery packets. No minimum collection count, similarity count, quality score, or computed-similarity result was used as a target.

The authoritative edits are in `catalog-src/`. `data/` and `docs/generated/` were rebuilt with the normal catalog generator after the source edits. No entity registry, factual lifecycle state, verification state, archive rating, review, or controlled tag was changed.

## Research and method

Before editing, I read the Phase 1 factual QA, Phase 2 entity-graph QA, Batch 1 QA, the current discovery-quality report, `docs/DISCOVERY-ENRICHMENT.md`, `docs/SIMILARITY.md`, `docs/COLLECTION-CANDIDATES.md`, `docs/TAG_TAXONOMY.md`, `data/schema.md`, existing well-enriched records, and nearby authored similarity reasons.

The editorial classifications were checked against existing factual metadata and source material, including:

- [The Godfrey Audio Guide official site](https://thegodfreyaudioguide.com/)
- [The Hidden People source feed](https://www.spreaker.com/podcast/the-hidden-people--5762613)
- [Not Quite Dead official page](https://hangingslothstudios.com/not-quite-dead/) and [transcripts](https://hangingslothstudios.com/nqd-transcripts/)
- [Jackie the Ripper at Stak](https://stak.london/shows/jackie-the-ripper/)
- [The Cleansed at FinalRune](https://finalrune.com/the-cleansed/)
- [The Secret of St Kilda official page](https://thesecretofstkilda.carrd.co/)
- [The Harrowing production page](https://robertdelamere.co.uk/productions/?i=52)
- [Afflicted at ART19](https://art19.com/shows/afflicted)
- [The Walk in Apple Podcasts](https://podcasts.apple.com/us/podcast/the-walk/id1334736440?uo=4)
- [The Orbiting Human Circus at WNYC Studios](https://www.wnycstudios.org/podcasts/orbitinghumancircus)

Computed similarity below means the strict public policy in `shared/archive-similarity.js`, not the broader diagnostic candidate gate. Authored links are directional and are excluded from computed-match qualification.

## 1. Selected shows

The baseline scores below were captured before the source edit. “Facet groups” means the report’s useful `tones`, `tags`, `bestFor`, and `similarTo` groups; the quality score is the existing 17-dimension catalog-quality score.

| Show | Starting condition | Before | Why selected |
| --- | --- | ---: | --- |
| The Godfrey Audio Guide | Very sparse; no entity, collection, or recommendation route | 9/17; 1 facet group | Tests whether a factually clear but unusually thin museum-audio record benefits from specific framing without inventing tags or facts. |
| The Hidden People | Existing entity hub; no editorial route | 10/17; 1 facet group | Has Realm and Dayton Writers Movement relationships, so it tests whether a useful entity neighborhood can become a story-level route rather than a generic hub match. |
| Not Quite Dead | Fact-rich and entity-linked, but route-less | 11/17; 1 facet group | Tests a record with strong factual identity, existing themes/tags/content notes, and no collection or similarity surface. |
| Jackie the Ripper | Collection-rich but similarity/profile-poor | 13/17; 2 facet groups | Tests whether an already well-routed finished dark comedy needs a small number of editorial distinctions rather than more collection memberships. |
| The Cleansed | Existing sci-fi/finished collection routes, no editorial discovery packet | 11/17; 1 facet group | Tests a serious post-collapse sci-fi record with useful bridges into the existing survival graph. |
| The Secret of St Kilda | Collection-rich; one existing incoming link but no outgoing route/profile | 12/17; 1 facet group | Tests whether a collection anchor with existing graph context can become a better directional bridge. |
| The Harrowing | One existing collection; bounded source/reverification gap; no outgoing authored link | 11/17; 1 facet group | Tests a short, finished island-horror case where the strongest editorial outcome may be as a destination rather than an outgoing-link source. |
| Afflicted | Discovery-profile complete and collection-present, but no tone/theme/best-for/similarity route | 11/17; 1 facet group | Tests the value of completing a coherent content packet when several structural fields already exist. |
| The Walk | Partial profile; no collection, entity, or recommendation route | 9/17; 1 facet group | Tests listener-perspective, long-walk, and commitment metadata rather than conventional show-to-show genre matching. |
| The Orbiting Human Circus | Entity-rich, including the Night Vale hub; one existing rule collection; no editorial packet | 11/17; 1 facet group | Tests a surreal, musical, broadcast-framed bridge where entity overlap alone should not determine the recommendation. |

None of these records was selected to make the batch numerically resemble Batch 1. No selected record had the significant unresolved identity/factual uncertainty that Phase 1 or Phase 2 marked as a reason to defer enrichment.

## 2. Enrichment decisions

All selected records retained their existing factual genres, formats, descriptions, runtime/count data, listen links, official links, source provenance, entity relationships, lifecycle state, and ratings. Existing approved tags were retained; no new tag was added.

### The Godfrey Audio Guide

- Tones: `dark`, `weird`.
- Themes: `art and interpretation`, `museum mysteries`, `hidden histories`.
- `bestFor`: `headphones-on`, `late-night`.
- Content profile: original fiction; the fictional Annabelle H. Godfrey Historic Estate and Museum; an in-universe self-guided museum audio tour.
- Discovery profile: mixed voice style; balanced narrative focus; medium intensity; long commitment.
- Collection added: Headphones-on immersion — the museum-tour frame and layered exhibit details reward close listening.
- Authored similarity added: Godfrey → The Mistholme Museum of Mystery, Morbidity and Mortality. Reason: both use a fictional museum audio guide as the frame, while Mistholme is the more anthology-shaped branch.
- No content notes or tags were added. The record now describes a distinct museum/audio-tour experience rather than generic “weird horror.”

### The Hidden People

- Tones: `dark`, `tense`, `cinematic`.
- Themes: `folklore and fae`, `hidden-world discovery`, `belonging across worlds`.
- `bestFor`: `worldbuilding`, `binge-listening`.
- Content profile: original fiction; a modern world alongside a hidden realm of magic and monsters; a murder mystery that opens into a dark-fantasy adventure.
- Discovery profile: primarily acted; balanced narrative focus; variable intensity; deep-dive commitment.
- Collections added:
  - Fantasy detours and hidden worlds — the local mystery expands into Irish and Norse folklore, fae, magic, and monsters.
  - Worldbuilding deep dives — four observed seasons and the expanding hidden-world frame support a sustained deep dive.
- Authored similarity added: Hidden People → The Night Post. Reason: both take supernatural folklore into a populated world; Hidden People expands from murder mystery into fae fantasy, while The Night Post opens onto an arcane frontier of conscripted couriers.
- Existing Realm and Dayton Writers Movement entity relationships were retained. No new entity was inferred from the creator strings.

### Not Quite Dead

- Tones: `dark`, `tense`.
- Existing themes (`identity`, `Sexuality`, `vampires`) and content notes were retained rather than rewritten.
- `bestFor`: `late-night`, `binge-listening`.
- Content profile: original fiction; an A&E nurse’s hometown as the dead begin to walk; character-led horror-romance centered on Alfie and Casper.
- Discovery profile: primarily narrated; character-driven; high intensity; deep-dive commitment.
- Collection added: Late-night tension — gory vampire investigation and intimate horror-romance make this an after-dark route with sharper edges than a comfort listen.
- Authored similarity added: Not Quite Dead → I Am in Eskew. Reason: both use intimate narration to make identity and the body part of the horror; Not Quite Dead adds a gory queer romance, while I Am in Eskew turns the inward pressure toward an impossible city.
- No additional tags, content notes, or collection memberships were added. The controlled taxonomy did not offer a more precise supported tag that would improve the route.

### Jackie the Ripper

- Existing tones, themes, content profile, and content notes were retained.
- `bestFor`: `easy-entry`, `binge-listening`.
- Discovery profile: primarily acted; plot-driven; high intensity; medium commitment.
- No collection membership was added. Its existing three collection memberships already provide finished, episodic/comedy, and mystery routes; adding another would not add a distinct listening intent.
- Authored similarity added: Jackie the Ripper → Mockery Manor. Reason: both are full-cast dark comedies where an investigation drives an ensemble through a stylized setting; Jackie reimagines the Whitechapel murder case, while Mockery Manor makes a disappearing theme park the mystery.
- No new tags, notes, entities, ratings, or reviews were added.

### The Cleansed

- Tones: `bleak`, `tense`, `cinematic`.
- Themes: `post-collapse survival`, `community under pressure`, `military power`.
- `bestFor`: `serious-sci-fi`, `long-walks`.
- Content profile: original fiction; rural Maine and the remnants of old New York after an energy crisis; an ensemble survival drama centered on off-grid homesteaders and an arriving soldier.
- Discovery profile: primarily acted; plot-driven; high intensity; long commitment.
- Collections added:
  - Serious sci-fi — post-crisis survival, a rising military force, and an off-grid community keep the stakes consequential.
  - Survival pressure — homesteaders must decide what to do when a soldier brings warning of a military force rising after the energy crisis.
- Authored similarity added: The Cleansed → The Orphans. Reason: both make survival an ensemble problem after systemic collapse; The Cleansed stays in post-crisis Maine while The Orphans carries the group-and-threat tension into a hostile galaxy.
- The existing completed-drama and completed-sci-fi rule memberships were not manually edited. No new tag or factual field was needed.

### The Secret of St Kilda

- Tones: `dark`, `tense`.
- Themes: `redemption`, `island community`, `belief and sacrifice`.
- `bestFor`: `late-night`, `binge-listening`.
- Existing content profile and content notes were retained.
- Discovery profile: primarily acted; balanced; high intensity; medium commitment.
- No collection membership was added. Its existing three collection memberships already establish the island, folk-horror, and completed routes.
- Authored similarity added: The Secret of St Kilda → The Harrowing. Reason: both turn an isolated Scottish island into supernatural pressure; St Kilda begins with a con man’s attempted redemption and a community seeking a saviour, while The Harrowing begins with a storm-bound crime and an ancient evil.
- The existing directional October’s Children → The Secret of St Kilda link was retained; no reciprocal link was manufactured.

### The Harrowing

- Tones: `dark`, `tense`, `cinematic`.
- Themes: `island isolation`, `crime and consequence`, `ancient evil`.
- `bestFor`: `late-night`, `headphones-on`, `short-under-five-hours`.
- Content profile: original fiction; the remote Scottish island of Toll Mòr; an island crime during a once-in-a-century storm that gradually becomes supernatural horror.
- Discovery profile: primarily acted; plot-driven; high intensity; short commitment.
- Collections added:
  - Cold isolation horror — the remote island, storm-bound crime, and ancient power make the setting itself the source of pressure.
  - Short finished thrillers — the observed eight-episode finished arc keeps the crime and supernatural turn compact.
- No outgoing authored similarity was added. The evidence supported this show as a useful destination from St Kilda and Afflicted, but not a defensible additional source-to-target relationship without forcing symmetry.
- Incoming authored links after enrichment: The Secret of St Kilda → The Harrowing and Afflicted → The Harrowing.
- The existing Phase 2 source/reverification gap was not changed or concealed. No rating, review, tag, entity, or lifecycle claim was added.

### Afflicted

- Tones: `dark`, `tense`.
- Themes: `hoodoo and protection`, `small-town catastrophe`, `community under pressure`.
- `bestFor`: `late-night`, `binge-listening`.
- Content profile: original fiction; the small East Texas town of Gunnaway; a demonic book bound in human flesh drives a season of supernatural disasters.
- Content notes added from the episode-warning material: `grief`, `graphic murder`, `gore`, `medical trauma`, `natural disasters`, `mental health slurs`.
- Existing discovery profile retained: primarily acted; plot-driven; high intensity; medium commitment.
- Collection added: Late-night tension — a demonic book, supernatural disasters, and a town trying to understand the damage keep the horror pressure active after dark.
- Authored similarity added: Afflicted → The Harrowing. Reason: both turn a local catastrophe into supernatural horror; Afflicted uses an East Texas town, a demonic book, and hoodoo, while The Harrowing uses a remote Scottish island, an unsolved crime, and an ancient evil.
- No new tag, entity, rating, review, or broad “supernatural horror” tag was added. The warnings remain non-spoiler and specific.

### The Walk

- Tones: `tense`, `cinematic`.
- Themes: `listener agency`, `trust and mistaken identity`, `survival under lockdown`.
- `bestFor`: `headphones-on`, `long-walks`.
- Content profile: original fiction; the route from Inverness to Edinburgh after an electromagnetic pulse; a listener-perspective survival thriller in which the listener is the walker; a courier mission becomes an on-foot escape through a city under lockdown.
- Discovery profile updated from its partial state to: mixed voice style; plot-driven; high intensity; long commitment.
- Collections added:
  - Best for long walks — the continuous courier journey, checkpoints, pursuit, and alliance shifts are explicitly designed to carry a listener while walking.
  - Headphones-on immersion — listener perspective, movement, voices, and the EMP setting reward focused listening.
  - Survival pressure — the forced journey through a locked-down city makes every next step consequential.
- Authored similarity added: The Walk → Carrier. Reason: both make a forced journey the survival engine, but The Walk puts the listener inside an EMP escape from Inverness to Edinburgh while Carrier traps its danger in a loaded trailer on a dark highway.
- The source still has no website value in `officialLinks`; the Apple source and listener-perspective description were sufficient for editorial classification, so no factual official-link field was manufactured.

### The Orbiting Human Circus

- Tones: `warm`, `weird`, `cinematic`.
- Themes: `performance and identity`, `longing for escape`, `radio as a world`.
- `bestFor`: `headphones-on`, `warm-weird`.
- Content profile: original fiction; a fantastical radio show broadcast from the Eiffel Tower; a lonely janitor drawn into a surreal ensemble world; an immersive radio-show-within-a-show.
- Discovery profile: primarily acted; character-driven; medium intensity; medium commitment.
- Collections added:
  - Headphones-on immersion — music, ensemble performances, and the radio-show frame make the surreal world land in close listening.
  - Warm weird comfort — a moving musical fantasy turns a lonely janitor’s escape into a hospitable surreal-world route.
- Authored similarity added: Orbiting Human Circus → Welcome to Night Vale. Reason: both build surreal worlds through broadcast framing and recurring voices; Orbiting is a musical, character-led stage world, while Night Vale is a deadpan community bulletin.
- Existing Night Vale Presents entity relationships were retained. Shared production-company/entity evidence was not treated as sufficient by itself.

## 3. Before/after metrics

| Show | Quality | Useful facets | Tones | Themes | `bestFor` | Profile keys | Collections | Authored out / in | Diagnostic candidates | Public computed | Public surface |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| The Godfrey Audio Guide | 9 → 15 | 1 → 4 | 0 → 2 | 0 → 3 | 0 → 2 | 0 → 4 | 0 → 1 | 0/0 → 1/0 | 106 → 137 | 0 → 0 | No → Yes |
| The Hidden People | 10 → 16 | 1 → 4 | 0 → 3 | 0 → 3 | 0 → 2 | 0 → 4 | 0 → 2 | 0/0 → 1/0 | 191 → 242 | 0 → 0 | No → Yes |
| Not Quite Dead | 11 → 16 | 1 → 4 | 0 → 2 | 3 → 3 | 0 → 2 | 0 → 4 | 0 → 1 | 0/0 → 1/0 | 233 → 270 | 0 → 0 | No → Yes |
| Jackie the Ripper | 13 → 16 | 2 → 4 | 2 → 2 | 3 → 3 | 0 → 2 | 0 → 4 | 3 → 3 | 0/0 → 1/0 | 183 → 195 | 0 → 2 | No → Yes |
| The Cleansed | 11 → 16 | 1 → 4 | 0 → 3 | 0 → 3 | 0 → 2 | 0 → 4 | 2 → 4 | 0/0 → 1/0 | 201 → 220 | 0 → 2 | No → Yes |
| The Secret of St Kilda | 12 → 16 | 1 → 4 | 0 → 2 | 0 → 3 | 0 → 2 | 0 → 4 | 3 → 3 | 0/1 → 1/1 | 168 → 184 | 0 → 2 | No → Yes |
| The Harrowing | 11 → 15 | 1 → 3 | 0 → 3 | 0 → 3 | 0 → 3 | 0 → 4 | 1 → 3 | 0/0 → 0/2 | 187 → 203 | 0 → 2 | No → Yes |
| Afflicted | 11 → 15 | 1 → 4 | 0 → 2 | 0 → 3 | 0 → 2 | 4 → 4 | 2 → 3 | 0/0 → 1/0 | 168 → 182 | 0 → 2 | No → Yes |
| The Walk | 9 → 14 | 1 → 4 | 0 → 2 | 0 → 3 | 0 → 2 | 2 → 4 | 0 → 3 | 0/0 → 1/0 | 324 → 350 | 0 → 0 | No → Yes |
| The Orbiting Human Circus | 11 → 16 | 1 → 4 | 0 → 3 | 0 → 3 | 0 → 2 | 0 → 4 | 1 → 3 | 0/0 → 1/0 | 129 → 164 | 0 → 0 | No → Yes |

“Profile keys” counts the four discovery-profile keys (`voiceStyle`, `narrativeFocus`, `intensity`, `commitment`). “Diagnostic candidates” is the broad local similarity gate and is not a public recommendation count. A “public surface” means the show now has an outgoing authored route or a strict public computed route from its own record; incoming links are reported separately.

### Batch-level changes

| Measurement | Before | After | Change |
| --- | ---: | ---: | ---: |
| Mean quality score | 10.8/17 | 15.5/17 | +4.7 |
| Shows with at least 3 useful facet groups | 0/10 | 10/10 | +10 |
| Shows with tone coverage | 1/10 | 10/10 | +9 |
| Shows with theme coverage | 2/10 | 10/10 | +8 |
| Shows with `bestFor` coverage | 0/10 | 10/10 | +10 |
| Shows with all 4 discovery-profile keys | 2/10 | 10/10 | +8 |
| Shows with at least 1 collection | 6/10 | 10/10 | +4 |
| Shows with at least 2 collections | 4/10 | 8/10 | +4 |
| Materialized memberships across selected shows | 12 | 26 | +14 |
| New curated collection edges | 0 | 14 | +14 |
| Authored outgoing links from selected shows | 0 | 9 | +9 |
| Selected shows with at least one authored incoming link | 1 | 2 | +1 |
| Shows with strict public computed matches | 0/10 | 5/10 | +5 |
| Shows with a public recommendation surface | 0/10 | 10/10 | +10 |

These are measurements of the batch, not acceptance targets. In particular, the 14 new collection edges are unevenly distributed: some shows received none, while The Walk received three because the evidence supported three distinct listening intents.

### Catalog-wide context

The rebuilt catalog moved the following report measurements:

- Collection edges: 718 → 732; shows with at least one collection: 299 → 303; shows with at least two: 139 → 143.
- Shows with at least three useful facet groups: 81 → 91.
- Curated discovery profiles: 58 → 66.
- Tone coverage: 83 → 92; theme coverage: 92 → 100; `bestFor`: 81 → 91; authored similarity coverage: 81 → 90.
- Authored similarity links: 264 → 273, with 273 written reasons.
- Entity relationships remain unchanged at 132 public entities, 318 relationships, and 266 linked published shows.
- Controlled-tag state remains unchanged: 0 unknown tag uses and one unused approved tag (`Sleeper ship`).

## 4. Computed-similarity qualification analysis

The public policy remains unchanged: score at least 20, pair/source/target metadata coverage at least 65%, at least 3 metadata dimensions, at least 2 anchor dimensions, at least 2 specific discovery dimensions, and at least 2 explanation reasons. Public results also exclude authored and curated evidence.

| Show | Before | After | Qualification result and exact remaining failures |
| --- | --- | --- | --- |
| The Godfrey Audio Guide | 0; unqualified | 0; unqualified | No non-authored candidate reaches score 20. The cleanest near-match is Within the Wires at 16.8 and fails only `overall score < 20`; its coverage, dimensions, anchors, and explanation reasons pass. |
| The Hidden People | 0; unqualified | 0; unqualified | Uncanny Valley reaches 20.0 but fails pair coverage (0.614 < 0.65), target coverage (0.614 < 0.65), and specific dimensions (1 < 2). Marsfall reaches 19.3 and fails only the score floor. |
| Not Quite Dead | 0; unqualified | 0; unqualified | Spirit Box Radio and The Twelvelms Conspiracy reach 20.8 but fail pair coverage (0.614), target coverage (0.614), and specific dimensions (1). Spines reaches 18.5 and fails only the score floor. |
| Jackie the Ripper | 0; unqualified | 2; qualified | No remaining qualification failure. Public matches include Video Palace (22.8) and Homecoming (20.7). |
| The Cleansed | 0; unqualified | 2; qualified | No remaining qualification failure. Public matches include Impact Winter (23.5) and Ars Paradoxica (22.5). |
| The Secret of St Kilda | 0; unqualified | 2; qualified | No remaining qualification failure. Public matches include Afflicted (24.9) and Video Palace (20.7). |
| The Harrowing | 0; unqualified | 2; qualified | No remaining qualification failure. Public matches include Video Palace (25.6) and October’s Children (23.1). Its public computed qualification does not require an outgoing authored link. |
| Afflicted | 0; unqualified | 2; qualified | No remaining qualification failure. Public matches include The Secret of St Kilda (24.9) and Video Palace (22.8). |
| The Walk | 0; unqualified | 0; unqualified | No candidate reaches score 20. The strongest clean near-match is The Orphans at 18.4 and fails only `overall score < 20`; its pair/record coverage, dimensions, anchors, specific dimensions, and reasons pass. |
| The Orbiting Human Circus | 0; unqualified | 0; unqualified | Adventures in New America reaches 24.5 but fails pair coverage (0.571 < 0.65), target coverage (0.571 < 0.65), and specific dimensions (1 < 2). Lower candidates fail the score floor. |

No selected show failed because its explanation-reason requirement was missing. The recurring blockers were therefore evidence strength, not missing prose:

- Godfrey and Walk have several clean, well-covered candidates but their best scores remain below 20.
- Hidden People, Not Quite Dead, and Orbiting Human Circus have high raw/entity-hub candidates that fail target/pair coverage and the two-specific-dimensions requirement.
- Jackie, Cleansed, St Kilda, Harrowing, and Afflicted have enough shared discovery and factual anchors to qualify after coherent enrichment.

This is evidence that the public policy is doing more than ranking genre/format matches, but it also shows that valid manual routes can remain non-computed when the model’s score or target coverage is insufficient. No threshold or scoring weight was changed.

## 5. Discovery routes unlocked

The following are concrete routes created or strengthened by the resulting data:

- Headphones-on immersion → The Godfrey Audio Guide → authored similarity → The Mistholme Museum of Mystery, Morbidity and Mortality.
- Fantasy detours and hidden worlds → The Hidden People → authored similarity → The Night Post. The same record is now also reachable through Worldbuilding deep dives.
- Late-night tension → Not Quite Dead → authored similarity → I Am in Eskew, which already connects into its own authored neighborhood including Spines, Alice Isn’t Dead, and The Magnus Archives.
- Existing comedy/finished routes → Jackie the Ripper → authored similarity → Mockery Manor and its established dark-comedy mystery neighborhood.
- Serious sci-fi / Survival pressure → The Cleansed → authored similarity → The Orphans → existing space-survival routes including Starship Iris, Marsfall, and Solar.
- Existing October’s Children route → The Secret of St Kilda → authored similarity → The Harrowing. This remains directional; St Kilda was not given a reciprocal incoming/outgoing fiction of symmetry.
- Late-night tension → Afflicted → authored similarity → The Harrowing, creating a second route into the short island-horror record.
- Cold isolation horror / Short finished thrillers → The Harrowing → strict computed results including Video Palace and October’s Children, despite no outgoing authored link.
- Best for long walks / Headphones-on immersion / Survival pressure → The Walk → authored similarity → Carrier.
- Warm weird comfort / Headphones-on immersion → The Orbiting Human Circus → authored similarity → Welcome to Night Vale, with the existing Night Vale entity neighborhood retained as context rather than treated as the whole recommendation.

The five strict computed surfaces add additional routes: Jackie to Video Palace/Homecoming; Cleansed to Impact Winter/Ars Paradoxica; St Kilda to Afflicted/Video Palace; Harrowing to Video Palace/October’s Children; and Afflicted to St Kilda/Video Palace. These are model-qualified routes, not authored editorial claims.

## 6. Things deliberately NOT added

- No new controlled tags. The taxonomy already supported the useful distinctions; adding broad genre synonyms or forcing coverage into underrepresented areas would have inflated fields without improving choice.
- No entity relationships. Existing entity hubs for Hidden People and Orbiting Human Circus were retained, but raw creator/network strings were not promoted into new public entities. The entity graph was not used as a shortcut for editorial similarity.
- No factual rewrites. Existing descriptions, formats, genres, counts, runtimes, release state, official links, source provenance, and verification/research-gap state were not changed merely because the records were open.
- No Archive Ratings, Archive Takes, full reviews, or community content. Discovery enrichment is not a substitute for separate editorial work.
- No collection addition for Jackie the Ripper or The Secret of St Kilda. Their existing collection routes were already useful and distinct; the absence of a new membership is intentional.
- No generic collection additions for Godfrey, Hidden People, Not Quite Dead, Cleansed, Afflicted, or Orbiting where the collection intent was only adjacent. In particular, a museum audio tour was not treated as recovered recordings, a fae story was not automatically treated as folk horror, and a demonic-book story was not forced into every small-town or short-finished route.
- No extra collection for The Harrowing beyond cold isolation and short finished thrillers. Late-night is represented as a `bestFor` route, but a third curated collection was not needed.
- No reciprocal authored similarity for The Harrowing, no copied top-three computed candidates, and no authored edge was added to satisfy a quota.
- No additional content notes where the available source material did not support a genuinely useful listener warning. Afflicted received a bounded, non-spoiler set because episode-level warnings were available; the other records did not receive invented warnings.
- No similarity-threshold, score-weight, or public-policy change. A record that remained non-computed still received an authored or collection-backed route when that route was editorially defensible.

## 7. Problems discovered

1. **The diagnostic model still overweights structural overlap for sparse records.** Genre, format, episode length, and catalog length dominate the report’s candidate volume. A sparse record can have many diagnostic candidates without having enough story-level evidence for a public recommendation.

2. **Entity hubs can produce misleadingly strong raw candidates.** Hidden People → Uncanny Valley and Orbiting Human Circus → Adventures in New America score at or above 20 through shared entity/structural evidence, but both fail target coverage and the two-specific-dimension gate. Not Quite Dead’s Hanging Sloth/Eira neighborhood shows the same pattern.

3. **The public evidence floor can remain just out of reach after meaningful enrichment.** Godfrey and Walk have candidates with strong coverage, anchors, specific dimensions, and reasons, but their best clean scores remain 16.8 and 18.4. This looks like a score/model limitation for those cases, not a missing field that should be filled mechanically.

4. **Themes are curated free text rather than a controlled taxonomy.** This permits useful specificity, but it also creates synonym and reuse risk. `community under pressure` is meaningful for both Cleansed and Afflicted, yet future batches need continued review to prevent it becoming a generic default.

5. **Collection breadth is uneven for reasons beyond raw membership count.** The final candidate report still finds low-membership collections such as Anthology Horror and Episodic Mystery with no candidate evidence, while some rule-based collections are already broad. Collection definitions need editorial review where the evidence model cannot identify a defensible candidate; membership count alone is not a reason to add a show.

6. **The broader catalog remains structurally sparse.** There are still 449 published shows without a collection and 486 without a typed entity relationship. Entity-graph and collection gaps remain separate queues; this batch intentionally addressed only ten records and did not turn unresolved legacy creator/network values into relationships.

7. **Existing Phase 2 warnings remain visible.** Data validation still reports 43 source-backed entity type/relationship-role divergences and the catalog still reports 25 documented Phase 2 research-gap records. No selected record’s uncertainty was silently reclassified during enrichment.

8. **Content fields do not automatically improve the similarity score.** The added `content` framing improves show-detail meaning and editorial clarity, but it is not a scoring dimension. This is desirable for honesty, but it means quality and similarity measurements should not be treated as interchangeable.

## 8. Batch-type comparison

Batch 1 and Batch 2 were not matched samples, so the comparison is descriptive rather than a ranking.

| Batch | Starting mean | Ending mean | New authored outgoing links | New collection edges | Strict computed qualification | Public surfaces |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Batch 1 | 9.2/17 | 14.9/17 | 30 | 32 | 0/10 → 4/10 | 0/10 → 10/10 |
| Batch 2 | 10.8/17 | 15.5/17 | 9 | 14 | 0/10 → 5/10 | 0/10 → 10/10 |

The small sample suggests:

- **Collection-rich, similarity-poor records benefited most for computed qualification.** Jackie and St Kilda already had useful routes and enough factual structure; adding specific profile and similarity distinctions made strict matches available. Cleansed and Harrowing show a similar effect once serious survival/isolation distinctions were made.
- **Profile-complete but route-less records can convert efficiently.** Afflicted did not need a wholesale metadata rewrite. A small set of tone/theme/best-for/content-note decisions plus one defensible similarity created both authored and computed routes.
- **Existing entity relationships are useful context, not sufficient qualification.** Hidden People and Orbiting Human Circus gained meaningful human-authored routes, but their strongest entity-hub computed candidates failed coverage/specific-dimension gates.
- **Very sparse records gain useful manual routes before they gain computed qualification.** Godfrey now has a distinctive content packet and an authored museum bridge but no strict computed match. This is still a discovery improvement, not a failed enrichment.
- **Listener-intent enrichment can be valuable even when the model does not qualify a match.** The Walk gained three clear intent routes and an authored journey comparison, while all clean computed candidates remained below the score floor.
- **Strong factual metadata plus weak editorial metadata appears to be the most reliable overall starting condition for strict computed lift**, but that conclusion is tentative. It is based on five qualified records in a ten-show batch, not a general causal result.

The most useful lesson is not “add more fields.” It is that records with existing factual anchors and at least one meaningful route can often be made discoverable with a small, specific packet; records with sparse or hub-only evidence need authored editorial bridges, and some should remain outside strict computed qualification.

## 9. Recommended Batch 3

These are recommendations only; none was modified in this batch. They are selected to test the findings above while retaining factual readiness and variation:

| Show | Recommended starting condition to test |
| --- | --- |
| Batman Unburied | Entity-linked, one completed-drama route, and a partial profile; tests near-qualified enrichment without starting from zero. |
| Fairies and Dragons, Ponies and Knights | Entity-linked, existing fantasy route, and themes but no tone/best-for/profile; tests a family-fantasy hidden-world route. |
| Two Flat Earthers Kidnap a Freemason | Two entity links and two ongoing comedy/sci-fi routes but no editorial packet; tests whether existing structural breadth can become a distinctive comedy bridge. |
| Darkest Night | Entity-linked episodic horror with one existing route and little editorial metadata; tests whether an anthology/immersive case can be enriched without generic horror tagging. |
| Our Fair City | Entity-linked ongoing sci-fi with an existing route but no editorial packet; tests a long-running worldbuilding/community case. |
| Mayfair Watchers Society | Entity-linked and thematically seeded but uncollected and similarity-poor; tests a Bloody FM/entity-hub record without relying on the hub alone. |
| Wrong Station | No entity or collection, but two existing themes and a source-backed official page; tests a sparse anthology/strange-signal record. |
| The Two Princes | No entity or collection and only a partial profile; tests a concise family-fantasy/character route. |
| Blackwood | No entity or collection with a partial discovery profile; tests whether existing partial editorial context is more predictive than raw sparsity. |
| The Dragoning | Very sparse and unconnected; tests whether another extreme-sparse record repeats Godfrey’s manual-route pattern or reveals a genuine evidence floor. |

This proposed batch intentionally includes entity-plus-collection records, entity-hub records, collection-less records, partial profiles, and an extreme-sparse case. It does not assume every record should end with the same number of memberships or links.

## Validation

Commands run from the repository root:

- `npm run build:catalog` — passed; built artifacts for 752 shows, 46 collections, and 7 review companions.
- `npm run validate:data` — passed with 0 content-integrity errors across 752 shows, 46 collections, 132 entities, and 7 review companions. It reported the existing 43 entity type/relationship-role warnings.
- `npm run report:discovery-quality` — passed; final report shows 752 published shows, 303 with a collection, 91 with at least three useful facet groups, 66 curated profiles, and 25 documented Phase 2 research-gap records.
- `npm run report:similarity` — passed; final report shows 273 authored links/reasons, 100 theme signals, 92 tone signals, 91 `bestFor` signals, 57 voice-style signals, 59 narrative-focus signals, 100 intensity signals, and 47 commitment signals.
- `npm run report:collection-candidates -- --limit 8` — passed; final report shows 732 membership edges, 449 shows without membership, no invalid collection references, and no strong near-duplicate collection pairs.
- `npm run report:entity-graph` — passed; no invalid, unresolved, duplicate, or non-public entity relationships; the existing 43 type/role divergences remain review signals.
- `npm run report:catalog` — passed; missing similarity reasons 0, Phase 2 complete, blocking errors 0, taxonomy unknown/non-approved tags 0, generated drift clean.
- `npm run test:tools` — 81 passed, 2 failed, 3 skipped. The failures are environment-sensitive existing checks: the offsite-freshness test invokes GNU `stat -c` on macOS, and the deployment-script regression expects `/usr/bin/node`, which is absent in this environment. The three skipped tests require Restic, which is not installed. No enrichment-specific test failure was reported.
- `git diff --check` — passed.

No deployment, publication, threshold change, or broad page regeneration was performed.
