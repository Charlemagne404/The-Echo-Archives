# Phase 3 Batch 1 QA — Focused editorial discovery enrichment

Date: 2026-09-16  
Scope: ten indexed-only published shows  
Status: source and generated catalog updated locally; not deployed or published

## Scope and method

This was the first pass allowed to add subjective discovery metadata after the Phase 1 factual cleanup and Phase 2 entity reconciliation work. The objective was to make a small set of trustworthy but poorly connected records useful in the discovery graph, not to maximize field completion.

`catalog-src/` remained authoritative. The generated catalog was rebuilt with `npm run build:catalog` so reports and the existing show-page renderer could evaluate the new data. Static pages were not broadly regenerated and nothing was deployed.

Factual source material was used to understand each show’s premise, format, runtime, content warnings, and production framing. Tones, themes, best-for routes, profiles, collection placement, and similarity reasons are Echo editorial classifications, not creator-supplied facts. No release status, completion status, verification state, entity relationship, Archive Rating, or review was changed.

### Research anchors

- [The Viridian Wild on Apple Podcasts](https://podcasts.apple.com/ie/podcast/the-viridian-wild/id1475844469)
- [The Orphans on Apple Podcasts](https://podcasts.apple.com/gb/podcast/the-orphans/id1155883792)
- [The Polybius Conspiracy on Apple Podcasts](https://podcasts.apple.com/us/podcast/the-polybius-conspiracy/id1640573819) and [Digital Campfire](https://thedigitalcampfire.us/)
- [The Dead Letter Office of Somewhere, Ohio](https://somewhereohio.com/podcast/the-dead-letter-office-of-somewhere-ohio)
- [I Am in Eskew](https://www.iamineskew.com/), including its [episode](https://www.iamineskew.com/episodes) and [transcript](https://www.iamineskew.com/transcripts) pages
- [The Hyacinth Disaster](https://www.davidecarlson.net/hyacinth)
- [Out of Place](https://midnightdisease.net/out-of-place)
- [Within the Wires](https://www.nightvalepresents.com/withinthewires)
- [Hi Nay on Apple Podcasts](https://podcasts.apple.com/us/podcast/hi-nay/id1549371727) and its [creator site](https://hinaypod.podbean.com/)
- [October’s Children episode 1](https://octoberschildrenpodcast.captivate.fm/episode/1-where-the-k-mart-used-to-be)

## 1. Selected shows

| Show | Why it was selected |
| --- | --- |
| The Viridian Wild | A compact magical-creature investigation with reliable factual metadata but no usable mood, commitment, collection, or similarity route. |
| The Orphans | A multi-season, cinematic survival sci-fi record with enough factual shape to support meaningful space-survival and worldbuilding distinctions. |
| The Polybius Conspiracy | A short hybrid documentary-fiction investigation whose artifact, conspiracy, and recorded-evidence hooks can bridge several existing routes. |
| the Dead Letter Office of Somewhere, Ohio | A strongly distinctive horror-comedy/archive premise with official content-warning material but no discovery packet. |
| I Am in Eskew | A factually established long-form narrated horror show whose atmosphere and isolation were not yet represented in the discovery layer. |
| The Hyacinth Disaster | A short full-cast spacecraft-survival record with a clear deadline and strong adjacency to existing serious-sci-fi routes. |
| Out of Place | A plot-led artifact investigation with alternate-history and institutional-secrecy potential, but no collection or authored similarity routes. |
| Within the Wires | A large, sound-led found-audio work with existing typed entities but no editorial discovery packet or routes. |
| Hi Nay | A long-running supernatural drama with an unusually specific Filipina immigrant, family, and babaylan premise that can add cultural and folkloric breadth. |
| October’s Children | A compact full-cast paranormal mystery with a clear small-college-town and creature-threat hook, suitable for short-listening routes. |

Not selected for this batch: Not Quite Dead and Wrong Station. Both already had more useful editorial material than the chosen records, so their marginal discovery gain was lower for this first pass.

## 2. Enrichment decisions

Existing controlled tags were reviewed against `catalog-src/tag-taxonomy.json`. All ten already had adequate approved tags, so no new tags were added and no accurate tags were rewritten.

### The Viridian Wild

- Tones: `dark`, `weird`.
- Themes: `field research`, `magical creatures`, `wilderness danger`.
- Best for: `short-under-five-hours`, `late-night`.
- Discovery profile: commitment `short`. The observed runtime supports a short route; the available source material did not justify a voice-style or narrative-focus classification.
- Content notes: `animal death`, `human death`, `wilderness injury`, based on the source warning material.
- Collections added:
  - Fantasy detours and hidden worlds — “A mythozoologist's field journey uses magical creatures to open a hidden-world route one encounter at a time.”
  - Quick first listens — “Its observed run is about 2.4 hours, making the creature-investigation premise an unusually compact entry point.”
- Authored similarities:
  - The Night Post — “Both make supernatural fieldwork feel like a journey into a living frontier, but The Night Post shifts the emphasis from creature study to tradition and survival.”
  - The Left Right Game — “A stronger investigation-led route for listeners who want expeditions into phenomena that do not obey ordinary rules.”
  - Old Gods of Appalachia — “Folklore and the natural world carry real danger here; choose this for a broader mythology branch rather than a single investigator.”

### The Orphans

- Tones: `cinematic`, `tense`.
- Themes: `survival`, `identity`, `found family`.
- Best for: `serious-sci-fi`, `headphones-on`, `long-walks`.
- Discovery profile: `primarily-acted`, `balanced`, `high` intensity, `long` commitment. The full-cast form and multi-season survival scope support the production and commitment classifications; the balanced focus preserves the show’s character and survival strands.
- Content notes: `violence`, `survival peril`.
- Collections added:
  - Serious sci-fi — “Cinematic survival in a harsh connected universe keeps the pressure on the science-fiction premise.”
  - Survival pressure — “Castaways, hostile worlds, and emotionally entangled AIs make each next decision part of survival.”
  - Worldbuilding deep dives — “Five seasons revisit the same galaxy from new vantage points, rewarding listeners who want scope beyond one mission.”
  - Best for long walks — “A multi-season connected galaxy gives a longer walk an ensemble survival story with room to expand.”
- Authored similarities:
  - The Strange Case of Starship Iris — “Both follow ensemble survivors after interstellar conflict; Starship Iris leans harder into identity, resistance, and found family.”
  - Marsfall — “Another high-pressure full-cast space-survival story, with hostile worlds, alien contact, and AI systems driving the danger.”
  - Solar — “A tighter crew-survival listen where spacecraft failure forces separate characters to solve the same crisis from different compartments.”

### The Polybius Conspiracy

- Tones: `tense`, `weird`.
- Themes: `urban legend`, `obsession`, `truth and belief`.
- Best for: `short-under-five-hours`, `headphones-on`, `late-night`.
- Discovery profile: `mixed`, plot-driven, `medium` intensity, `short` commitment. “Mixed” reflects the documentary-fiction construction rather than a claim about a particular cast arrangement.
- Content notes: deliberately left empty because the available source descriptions did not provide a sufficiently specific spoiler-free warning set.
- Collections added:
  - Found recordings and buried evidence — “A hybrid documentary-fiction investigation makes the recovered-story frame part of the arcade mystery.”
  - Quick first listens — “A compact 3.5-hour investigation gives listeners a focused doorway into archive mysteries.”
  - Late-night tension — “Pacific Northwest arcade lore, conspiracy, and uncertain reality give the investigation a quietly unnerving after-dark route.”
- Authored similarities:
  - The Deca Tapes — “Recorded evidence, a contained puzzle, and instructions whose source becomes the mystery connect the two shows at the level of form and investigation.”
  - Video Palace — “A media artifact opens into conspiracy and obsession; choose this for a darker occult branch of the analog mystery.”
  - Limetown — “Hybrid investigative fiction uses documentary texture and gaps in testimony to make the central mystery feel real.”

### the Dead Letter Office of Somewhere, Ohio

- Tones: `dark`, `weird`, `funny`.
- Themes: `community and belonging`, `identity`, `the uncanny in ordinary places`.
- Best for: `headphones-on`, `late-night`, `binge-listening`.
- Discovery profile: balanced narrative focus, `medium` intensity, `medium` commitment. Voice style was left unresolved because the source material establishes a solo creator/performance model without cleanly mapping to the controlled voice-style options.
- Content notes: `body horror`, `derealization`, `disturbing imagery`, grounded in the official episode material.
- Collections added:
  - Headphones-on immersion — “Solo performance, original scoring, and two-story episodes reward close listening to texture and voice.”
  - Late-night tension — “Dead letters, surreal lost mail, and horror-comedy make ordinary nighttime listening feel pleasantly off-kilter.”
  - Shows like Welcome to Night Vale — “A strange civic archive and dark comedy offer a more intimate, horror-forward branch of community-scale weirdness.”
- Authored similarities:
  - Welcome to Night Vale — “Darkly funny weird fiction where ordinary civic and administrative life becomes the doorway to surreal danger.”
  - The Storage Papers — “A record-keeping frame turns strange incidents into a growing archive; The Storage Papers is the more case-file-driven route.”
  - Mabel — “Intimate, voice-led supernatural storytelling about memory, family secrets, and the feeling that a place is listening.”

### I Am in Eskew

- Tones: `bleak`, `weird`, `dark`.
- Themes: `isolation`, `identity`, `institutional control`.
- Best for: `cold-isolation-horror`, `headphones-on`, `worldbuilding`.
- Discovery profile: existing `primarily-narrated` and `long` commitment retained; added character-driven narrative focus and `high` intensity. The official episodes and transcripts support a central diaristic perspective, recurring identity pressure, and explicit body-horror warnings.
- Content notes: `body horror`, `graphic violence`, `disturbing behavior`.
- Collections added:
  - Cold isolation horror — “A man trapped in an ever-changing city turns isolation, hostile space, and body horror into the core listening pressure.”
  - Headphones-on immersion — “Diary-like narration and an ever-changing city reward focused listening to the clues accumulating beneath the horror.”
  - Shows like The Magnus Archives — “Daily records of a bizarre place gradually widen into a larger mythology, making it a more intimate urban route into case-file horror.”
- Existing Completed Drama membership was retained.
- Authored similarities:
  - Spines — “Narrated horror driven by a central character's missing knowledge, identity crisis, and steadily widening occult threat.”
  - Alice Isn’t Dead — “Solitary first-person travel through impossible places, with the emotional search carrying the horror as much as the plot.”
  - The Magnus Archives — “Recorded accounts and investigations accumulate into an expanding mythology; The Magnus Archives offers a more explicit archive and case-file structure.”

### The Hyacinth Disaster

- Tones: `tense`, `cinematic`.
- Themes: `survival`, `corporate exploitation`, `crew loyalty`.
- Best for: `short-under-five-hours`, `serious-sci-fi`, `headphones-on`.
- Discovery profile: `primarily-acted`, plot-driven, `high` intensity, `short` commitment. The full-cast Jovian mission, sister-ship deadline, and observed runtime support the classification.
- Content notes: deliberately left empty; the premise communicates survival danger, but the source packet did not expose a specific warning set that would add more than the existing Survival tag.
- Collections added:
  - Serious sci-fi — “A deadline-driven Jovian mission keeps the science-fiction stakes focused on work, systems, and survival.”
  - Survival pressure — “The crew has to reach a sister ship before the window closes; the premise is all next decisions and dwindling time.”
  - Quick first listens — “Seven episodes and roughly three observed hours make the disaster route easy to try without a long-series commitment.”
  - Headphones-on immersion — “Full-cast mission pressure and a compact space setting benefit from an uninterrupted listen.”
- Authored similarities:
  - Solar — “Tight full-cast spacecraft survival after a mission failure, with crew decisions carrying the momentum.”
  - Derelict — “Industrial-scale sci-fi mystery puts a dangerous discovery inside a high-pressure corporate operation.”
  - The Waystation — “A shorter station-and-recordings route for listeners who want unexplained space danger without a long commitment.”

### Out of Place

- Tones: `tense`, `weird`.
- Themes: `alternate histories`, `investigation`, `institutional secrecy`.
- Best for: `headphones-on`, `late-night`, `worldbuilding`.
- Discovery profile: existing plot-driven narrative focus retained; added `medium` intensity and `medium` commitment. Voice style remains unresolved because the source record does not justify a controlled voice classification.
- Content notes: deliberately left empty; no reliable spoiler-free warning set was exposed.
- Collections added:
  - Serious sci-fi — “Artifacts from another reality turn scientific curiosity and institutional secrecy into the show's central pressure.”
  - Headphones-on immersion — “The brown-paper-bag artifact frame rewards close attention to what each object reveals and withholds.”
  - Shows like Ars Paradoxica — “A plot-led speculative investigation belongs here for listeners who want ideas and institutions to drive the mystery.”
- Authored similarities:
  - Ars Paradoxica — “Idea-forward investigation where scientific anomalies become personal and institutional secrets reshape the story.”
  - Red Valley — “Both treat experimental science, memory, and hidden institutions as the engine of the mystery.”
  - The Polybius Conspiracy — “Artifact-led investigations blur the line between documented history and an impossible story.”

### Within the Wires

- Tones: `weird`, `bleak`, `cinematic`.
- Themes: `political control`, `memory and identity`, `resistance`.
- Best for: `headphones-on`, `worldbuilding`, `long-walks`.
- Discovery profile: `primarily-narrated`, balanced narrative focus, `medium` intensity, `deep-dive` commitment. The official description of season-specific in-universe audio forms and the ten-season alternate-universe scope supports all four choices.
- Content notes: deliberately left empty; the political and dystopian themes are discovery signals rather than sufficiently specific content warnings.
- Collections added:
  - Headphones-on immersion — “Found audio, museum guides, relaxation tapes, and original music make form and sound central to the experience.”
  - Found recordings and buried evidence — “Its in-universe recordings and institutional documents are not just presentation; they are the evidence the listener has to interpret.”
  - Worldbuilding deep dives — “Ten standalone-but-connected seasons gradually map an alternate universe and its political history.”
  - Best for long walks — “Ten connected seasons and a slow-build alternate history reward an uninterrupted long listen.”
- Existing Night Vale Presents, Jeffrey Cranor, and Joseph Fink entity links were retained; no new entity work was attempted.
- Authored similarities:
  - Alice Isn’t Dead — “Both turn voice-led travel and recorded testimony into a surreal conspiracy, with the world widening as the narrator keeps listening.”
  - The Deca Tapes — “In-universe recordings reveal a controlled system one voice and instruction at a time.”
  - Limetown — “Found-audio and documentary texture make the act of assembling a missing record part of the story.”

### Hi Nay

- Tones: `dark`, `tense`.
- Themes: `family legacy`, `immigration`, `Filipino folklore`.
- Best for: `long-walks`, `binge-listening`, `late-night`.
- Discovery profile: character-driven narrative focus, `variable` intensity, `deep-dive` commitment. Voice style was left unresolved rather than inferred from the drama label.
- Content notes: `violence`, `death`, `supernatural peril`, reflecting the show’s episode-level warning practice and supernatural-horror premise.
- Collections added:
  - Best for long walks — “A 100-hour-plus ongoing supernatural run offers a deep episodic route for listeners who want a long companion.”
  - Folk horror and old gods — “Filipino supernatural tradition and a babaylan family put inherited knowledge and place at the center of the danger.”
  - Worldbuilding deep dives — “A long-running family and community story gives listeners room to stay with its supernatural world rather than sample a single case.”
- Authored similarities:
  - Old Gods of Appalachia — “Tradition-centered supernatural horror where family, place, and inherited stories carry real consequences; the cultural settings are distinct.”
  - Hello From The Hallowoods — “Long-form queer supernatural fiction where identity, community, and hope have to survive the horror.”
  - The Night Post — “A tradition-and-frontier route for listeners who want supernatural danger rooted in a living culture rather than a generic monster hunt.”

### October’s Children

- Tones: `dark`, `tense`, `cinematic`.
- Themes: `found family`, `small-town secrets`, `creature intrusion`.
- Best for: `short-under-five-hours`, `late-night`, `headphones-on`.
- Discovery profile: `primarily-acted`, balanced narrative focus, `high` intensity, `short` commitment. The full-cast format, escalating creature threat, and observed runtime support the classification.
- Content notes: `gore`, `loud noises`, based on the official episode warning.
- Collections added:
  - Quick first listens — “At roughly four observed hours, its full-cast paranormal setup is a compact first route into the archive.”
  - Late-night tension — “The escalating creature threat and boundary-blurring premise suit a tense after-dark listen.”
- A Small-town strange signals membership was considered and rejected: the collection is specifically oriented toward broadcast/local-static routes, while this show’s source material does not establish that framing.
- Authored similarities:
  - Unwell — “Small-town supernatural ensemble where relationships and local secrets matter as much as the threat.”
  - Bridgewater — “A folklore-led mystery starts with a local question and opens onto a larger supernatural history.”
  - The Secret of St Kilda — “Full-cast remote-community thriller where strange inhabitants and escalating supernatural pressure close in.”

## 3. Before/after metrics

The baseline was captured before source edits. `Diagnostic candidates` is the count returned by the conservative similarity gate before the stricter public threshold; it is intentionally not treated as public recommendation coverage. `Public computed` is the stricter public evidence threshold used by the show-page renderer.

| Show | Quality score | Useful facet groups | Tones | Themes | Best-for | Profile keys | Collections | Authored out / in | Diagnostic / public computed | Public recommendation surface |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| The Viridian Wild | 8/17 → 14/17 | 1 → 4 | 0 → 2 | 0 → 3 | 0 → 2 | 0 → 1 | 0 → 2 | 0/0 → 3/0 | 202/0 → 225/0 | No → Yes |
| The Orphans | 9/17 → 15/17 | 1 → 4 | 0 → 2 | 0 → 3 | 0 → 3 | 0 → 4 | 0 → 4 | 0/0 → 3/0 | 242/0 → 265/2 | No → Yes |
| The Polybius Conspiracy | 9/17 → 15/17 | 1 → 4 | 0 → 2 | 0 → 3 | 0 → 3 | 0 → 4 | 0 → 3 | 0/0 → 3/1 | 151/0 → 180/1 | No → Yes |
| the Dead Letter Office of Somewhere, Ohio | 9/17 → 15/17 | 1 → 4 | 0 → 3 | 0 → 3 | 0 → 3 | 0 → 3 | 0 → 3 | 0/0 → 3/0 | 314/0 → 361/0 | No → Yes |
| I Am in Eskew | 11/17 → 15/17 | 1 → 4 | 0 → 3 | 0 → 3 | 0 → 3 | 2 → 4 | 1 → 4 | 0/0 → 3/0 | 168/0 → 188/0 | No → Yes |
| The Hyacinth Disaster | 9/17 → 15/17 | 1 → 4 | 0 → 2 | 0 → 3 | 0 → 3 | 0 → 4 | 0 → 4 | 0/0 → 3/0 | 138/0 → 165/2 | No → Yes |
| Out of Place | 9/17 → 14/17 | 1 → 4 | 0 → 2 | 0 → 3 | 0 → 3 | 1 → 3 | 0 → 3 | 0/0 → 3/0 | 331/0 → 365/0 | No → Yes |
| Within the Wires | 10/17 → 16/17 | 1 → 4 | 0 → 3 | 0 → 3 | 0 → 3 | 0 → 4 | 0 → 4 | 0/0 → 3/0 | 292/0 → 338/0 | No → Yes |
| Hi Nay | 9/17 → 15/17 | 1 → 4 | 0 → 2 | 0 → 3 | 0 → 3 | 0 → 3 | 0 → 3 | 0/0 → 3/0 | 220/0 → 248/0 | No → Yes |
| October’s Children | 9/17 → 15/17 | 1 → 4 | 0 → 3 | 0 → 3 | 0 → 3 | 0 → 4 | 0 → 2 | 0/0 → 3/0 | 169/0 → 189/2 | No → Yes |

### Batch-level change

| Measure | Before | After |
| --- | ---: | ---: |
| Mean discovery-quality score | 9.2/17 | 14.9/17 |
| Shows with three or more useful facet groups | 0/10 | 10/10 |
| Tone coverage | 0/10 | 10/10 |
| Theme coverage | 0/10 | 10/10 |
| Best-for coverage | 0/10 | 10/10 |
| Discovery-profile coverage | 2/10 | 10/10 |
| Shows with at least one collection | 1/10 | 10/10 |
| Shows with at least two collections | 0/10 | 10/10 |
| Collection membership edges touching the batch | 1 | 32 |
| Authored outgoing similarity edges | 0 | 30 |
| Selected shows with an authored incoming link | 0 | 1 |
| Shows meeting the public computed-similarity evidence threshold | 0/10 | 4/10 |
| Shows with a public recommendation surface in the renderer | 0/10 | 10/10 |

The single authored incoming link is Out of Place → The Polybius Conspiracy. Authored relationships remain directional; no reverse links were added merely for symmetry.

### Catalog-wide context after the batch

- Published shows with at least one collection: 290 → 299 (39.8%).
- Published shows with at least two collections: 129 → 139 (18.5%).
- Collection membership edges: 687 → 718.
- Published shows with three or more useful facet groups: 71 → 81 (10.8%).
- Published shows with a curated discovery profile: 50 → 58 (7.7%).
- Authored similarity links/reasons: 234/234 → 264/264.
- Unknown or non-approved tag uses after enrichment: 0.
- Collection records with complete show reasons after enrichment: 46/46.

## 4. Discovery routes unlocked

- `The White Vault → Survival pressure → The Orphans → authored similarity → Marsfall / Solar / The Strange Case of Starship Iris`. This adds a multi-season connected-galaxy route to an established isolation-survival entry point.
- `The Deca Tapes → Found recordings and buried evidence → The Polybius Conspiracy → authored similarity → Video Palace / Limetown`. This turns a recorded-puzzle collection into a bridge toward the previously unconnected arcade investigation.
- `Ars Paradoxica → Shows like Ars Paradoxica → Out of Place → authored similarity → Red Valley / The Polybius Conspiracy`. This adds an artifact-led alternate-history branch without pretending that every anomaly is time travel.
- `The Magnus Archives → Shows like The Magnus Archives → I Am in Eskew → authored similarity → Spines / Alice Isn’t Dead`. This creates an intimate, city-scale route out of the larger case-file mythology.
- `Welcome to Night Vale → Shows like Welcome to Night Vale → the Dead Letter Office of Somewhere, Ohio → authored similarity → The Storage Papers / Mabel`. This adds a horror-forward administrative/archive branch to the community-weirdness route.
- `Old Gods of Appalachia → Folk horror and old gods → Hi Nay → authored similarity → Hello From The Hallowoods / The Night Post`. This broadens the folkloric route without collapsing distinct cultural settings into one generic tag.
- `Quick first listens → The Viridian Wild / The Polybius Conspiracy / The Hyacinth Disaster / October’s Children`. The short-runtime collection now has several different hooks rather than one repeated genre shape.
- Public computed evidence now appears for The Orphans (Impact Winter and The Hyacinth Disaster), The Polybius Conspiracy (The Hyacinth Disaster), The Hyacinth Disaster (The Polybius Conspiracy and The Orphans), and October’s Children (Video Palace and The Waystation). These are computed matches, not authored endorsements.

The new authored graph has one internal Batch 1 edge and 29 outward edges to established catalog records. That distribution is intentionally bridge-heavy rather than a closed horror or sci-fi clique.

## 5. Things deliberately not added

- No new controlled tags. Existing approved tags already captured the primary hooks; adding synonyms would have increased redundancy rather than discovery value.
- No new typed entity relationships. Nine of the ten selected shows still lack an explicit entity link. Raw creator/owner strings and official show pages were not treated as enough to create a Phase 2 relationship without a registry match and source-backed role decision.
- No release-status or completion-status changes. In particular, no show was placed in a finished-only collection merely because its Apple or publisher page presented a bounded season or series.
- No Archive Ratings, full reviews, `archiveTake`, or review-style opinion text.
- No `short-finished-thrillers` membership for the short investigation shows because the current catalog completion state was not the focus of this editorial pass.
- No content notes for The Polybius Conspiracy, The Hyacinth Disaster, Out of Place, or Within the Wires where the source packet did not expose a sufficiently specific spoiler-free warning set.
- No voice-style guesses for the Dead Letter Office, Out of Place, or Hi Nay, and no narrative-focus guess for The Viridian Wild. Partial profiles were preferable to false precision.
- No Small-town strange signals membership for October’s Children after review. A small-town setting alone did not satisfy that collection’s broadcast/local-static intent.
- No automatic adoption of the highest computed similarity candidates. Diagnostic lists were inspected, but authored links were added only where a listener-facing reason could name the actual connective tissue.

## 6. Problems discovered

### Similarity model

The diagnostic gate is useful for discovery but noisy for sparse records. After enrichment, the ten records still returned approximately 165–365 diagnostic candidates each, while only four reached the stricter public evidence threshold. Genre, format, episode length, and catalog length remain the most common scored reasons; they are useful for candidate generation but weak as editorial explanations. The public gate is appropriately conservative, but it means authored curation remains important for records without a high-coverage target match.

### Collection definitions

Collection intent is materially more specific than a shared genre or setting. October’s Children initially looked like a Small-town strange signals candidate from its town setting, but the collection’s broadcast/local-static language did not fit. Removing that edge reduced the batch from 33 to 32 collection memberships and improved editorial defensibility.

### Entity graph boundary

Discovery enrichment can make a show useful without resolving its entity graph. That is a deliberate boundary, not a missing field to fill automatically. The post-batch entity report still shows 486 published shows without typed relationships; this batch did not change that number.

### Taxonomy

The existing approved taxonomy was sufficient for all ten records. There were 0 unknown tag uses and 0 non-approved tag uses after the pass. The report still identifies one approved but unused tag, `Sleeper ship`; it was not relevant enough to add to this batch.

### Public artifact boundary

The generated catalog and renderer checks now contain the recommendation surfaces, but static pages were intentionally not rebuilt and the site was not deployed. Local evidence therefore proves source/generated integration and renderer behavior, not hosted-page freshness, DNS, or production delivery.

## 7. Recommended Batch 2

Do not modify these records as part of Batch 1. They are the next approximately ten Phase 2-ready candidates, chosen to extend the bridges established here:

| Show | Recommended reason |
| --- | --- |
| Batman Unburied | High-production serialized genre fiction; evaluate voice, intensity, and commitment without letting the franchise identity substitute for discovery metadata. |
| Jackie the Ripper | A likely period/mystery bridge; verify its actual narrative focus and listening commitment before classifying it. |
| Fairies and Dragons, Ponies and Knights | Already has a hidden-world route; deepen its audience/commitment profile without making the gentler all-ages tone look interchangeable with adult fantasy horror. |
| The Cleansed | Strong post-crisis survival premise suitable for a serious-sci-fi/survival bridge if the source packet supports the production profile. |
| The Orbiting Human Circus | A valuable surreal/cosmic bridge that can keep the graph from collapsing into conventional horror and military sci-fi. |
| The Secret of St Kilda | Remote-island folk horror can connect the folk-horror route to the short full-cast thriller route without needing generic supernatural tags. |
| Two Flat Earthers Kidnap a Freemason | A comedy/conspiracy edge case; test whether its actual experience belongs in comedy-with-a-mystery or a different route. |
| Rosanna’s Secret | Review the factual packet first, then determine whether its mystery hook supports a specific collection or similarity route. |
| Darkest Night | A candidate for audio-forward horror enrichment; verify content-warning granularity and whether its presentation is acted, narrated, or mixed. |
| The Harrowing | Remote-community supernatural pressure is a strong possible bridge to October’s Children and The Secret of St Kilda, pending a complete source-backed packet. |

Notably, Not Quite Dead and Wrong Station remain viable later candidates, but they should follow a different question: whether their existing metadata can support genuinely distinctive routes rather than simply receiving more horror labels.

## Validation

- `npm run validate:data` — passed; 0 integrity errors across 752 shows, 46 collections, 132 entities, and 7 review companions. Existing entity type/role warnings remain outside this batch.
- `npm run report:discovery-quality` — passed; generated snapshot reflects 299 shows with a collection, 139 with at least two, 81 with three or more useful facet groups, and 58 with curated profiles.
- `npm run report:similarity` — passed; 264 authored links and 264 written reasons; 17 similarity routes.
- `npm run report:collection-candidates` — passed; 718 membership edges, no invalid references, and no near-duplicate collection pair detected.
- `npm run report:entity-graph` — passed; no invalid relationship records, unknown entity references, or non-public entity references.
- `npm run report:catalog` — passed; Gate B complete, 0 blocking errors, 0 missing similarity reasons, and generated output drift clean.
- `npm run test:tools` — 81 passed, 2 failed, 3 skipped. The two failures are pre-existing environment-specific checks: macOS `stat` rejecting GNU `-c` in `monitoring.test.js`, and an operations regression fixture expecting `/usr/bin/node`. Discovery-enrichment, similarity, show-page-render, catalog, and collection-report tests passed; three Restic tests were skipped because Restic is not installed.
- `git diff --check` — passed.
- `npm run build:catalog` — passed. No page-wide build, deployment, or publication was run.
