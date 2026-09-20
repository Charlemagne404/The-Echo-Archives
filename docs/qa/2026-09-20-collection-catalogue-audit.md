# Collection catalogue audit

Date: 2026-09-20

This is a catalogue audit, not a Shows Like algorithm review. It evaluates whether the public collection set gives listeners useful discovery routes. Shows Like ranking and collection-page presentation were not changed.

## Executive finding

Echo has a healthy but uneven collection system.

- The current public set is 54 collections: 47 authored source collections plus 7 runtime-generated similarity companions. Before the conservative addition in this audit it was 53.
- The authored set is 20 curated collections, 10 rule-based collections, and 17 authored similarity collections. The public runtime set is 20 curated, 10 rule-based, and 24 similarity.
- There are 752 published shows and 1,158 public membership edges. 371 shows have at least one collection; 381 have none.
- All 235 non-imported records (228 indexed-only and 7 full-review) have collection membership. The uncovered population is imported metadata: 381 of 517 imported records.
- Structural membership quality is currently clean: zero invalid references, duplicate member IDs, invalid covers, anchor-in-members errors, or rule-membership drift.
- The main weakness is direct intent coverage, not raw membership. Comedy, horror, completion status, and listener-intent routes are comparatively strong. Thriller, fantasy, adventure, serialized, full-cast, narrated, tone, intensity, narrative-focus, and most theme/tag routes are present only indirectly.
- One route was added: Ongoing Mystery with 18 exact completionStatus=ongoing AND genres includes mystery matches. Other opportunities remain review-only.

The full deterministic report is reproducible with:

    npm run report:collection-catalogue
    npm run report:collection-catalogue -- --json
    npm run check:collection-catalogue

## Criteria used

These are review thresholds, not automatic deletion rules:

| Question | Audit signal |
| --- | --- |
| Is a route too sparse? | Curated/editorial: fewer than 8 members; rule-based: fewer than 4; similarity: fewer than 5 alternatives. |
| Is a curated route too broad? | 50+ members is a large-scale review; 10%+ of the published catalogue is a too-broad review signal. |
| Does membership fit the stated purpose? | For authored intent routes, fewer than half of members match an explicit intent tag or commitment is a purpose-fit review. 50–75% is a mixed-purpose review. This is a signal, not a semantic verdict. |
| Is it redundant? | Near-duplicate review requires at least 4 shared members and Jaccard >= 0.75. A contained-core review requires at least 5 shared members and shared/minimum-set >= 0.8. Large common cores are reported separately. |
| Does a missing route deserve review? | 8–30 members, bounded factual fields, no exact existing rule, no high-overlap nearest collection, and complete source fields. |
| Is it stable enough? | Rule routes must match their current rule exactly. Candidate routes expose a current-field stability proxy; historical stability is not claimed because the catalogue does not retain a membership history in the collection record. |

The audit deliberately separates:

- authored editorial intent;
- bounded factual rules;
- similarity routes generated from the existing runtime;
- “any membership” coverage, which can be incidental;
- direct route coverage, which requires an explicit rule or intent surface.

## Complete public inventory

### Authored source collections

| Collection | Type | Members | Review signal |
| --- | --- | ---: | --- |
| Headphones-on immersion | curated | 107 | large; too-broad review |
| Late-night tension | curated | 99 | large; too-broad review |
| Worldbuilding deep dives | curated | 54 | large-scale review |
| Best for long walks | curated | 46 | — |
| Quick first listens | curated | 46 | — |
| Serious sci-fi | curated | 42 | — |
| Survival pressure | curated | 36 | — |
| Start here | curated | 33 | — |
| Warm weird comfort | curated | 28 | — |
| Completed shows | curated | 23 | — |
| Fantasy detours and hidden worlds | curated | 21 | — |
| Found recordings and buried evidence | curated | 18 | — |
| Ensemble chaos with heart | curated | 16 | — |
| Cold isolation horror | curated | 15 | — |
| Comedy with a mystery | curated | 15 | mixed-purpose review |
| Small-town strange signals | curated | 14 | — |
| Funny space disasters | curated | 10 | — |
| Short finished thrillers | curated | 10 | — |
| Folk horror and old gods | curated | 9 | — |
| Time-bent and weird | curated | 9 | — |
| Ongoing Sci-Fi | rule-based | 76 | — |
| Episodic Comedy | rule-based | 71 | — |
| Completed Drama | rule-based | 63 | — |
| Ongoing Comedy | rule-based | 52 | — |
| Completed Sci-Fi | rule-based | 29 | — |
| Ongoing Horror | rule-based | 26 | — |
| Ongoing Mystery | rule-based | 18 | added in this audit |
| Anthology Horror | rule-based | 12 | — |
| Episodic Horror | rule-based | 8 | — |
| Episodic Mystery | rule-based | 3 | sparse; below declared minimum |
| Shows like Welcome to Night Vale | similarity | 10 | — |
| Shows like Malevolent | similarity | 9 | — |
| Shows like The Magnus Archives | similarity | 9 | — |
| Shows like Midnight Burger | similarity | 8 | — |
| Shows like Wolf 359 | similarity | 8 | — |
| Shows like Ars Paradoxica | similarity | 7 | — |
| Shows like Limetown | similarity | 7 | — |
| Shows like The Amelia Project | similarity | 7 | — |
| Shows like The Bright Sessions | similarity | 7 | — |
| Shows like The White Vault | similarity | 7 | — |
| Shows like Derelict | similarity | 6 | — |
| Shows like Impact Winter | similarity | 6 | — |
| Shows like Midst | similarity | 6 | — |
| Shows like Oz 9 | similarity | 6 | — |
| Shows like Station 151 | similarity | 6 | — |
| Shows like Tower 4 | similarity | 6 | — |
| Shows like We're Alive | similarity | 6 | — |

### Runtime-generated public similarity companions

These are included in the public audit, but are not authored source records and were not regenerated or ranked by this task.

| Collection | Type | Alternatives | Review signal |
| --- | --- | ---: | --- |
| Shows like Mage In The Machine | generated similarity | 4 | sparse review |
| Shows like Marsfall | generated similarity | 4 | sparse review |
| Shows like StarTripper!! | generated similarity | 4 | sparse review |
| Shows like The Lovecraft Investigations | generated similarity | 4 | sparse review |
| Shows like The Strange Case of Starship Iris | generated similarity | 4 | sparse review |
| Shows like Victoriocity | generated similarity | 4 | sparse review |
| Shows like Video Palace | generated similarity | 4 | sparse review |

The generated companions are flagged because they fall below the audit’s generic similarity-size threshold. That is a review signal only; the Shows Like ranking algorithm remains out of scope.

## Membership and coverage

### Membership concentration

| Membership count per show | Shows |
| ---: | ---: |
| 0 | 381 |
| 1 | 121 |
| 2 | 55 |
| 3 | 63 |
| 4 | 43 |
| 5 | 39 |
| 6 | 25 |
| 7 | 12 |
| 8 | 2 |
| 9 | 4 |
| 10 | 3 |
| 11 | 1 |
| 12 | 1 |
| 15 | 1 |
| 17 | 1 |

The concentration is strongly review-status-dependent:

| Review status | Shows | Covered | Membership edges |
| --- | ---: | ---: | ---: |
| indexed-only | 228 | 228 | 920 |
| full-review | 7 | 7 | 73 |
| imported | 517 | 136 | 165 |

This means “381 shows without a collection” should not be treated as a collection-curation failure alone. It is primarily the imported-record boundary. Automatically turning imported genre/format fields into public routes would weaken the distinction between source facts and reviewed discovery metadata.

### Direct route coverage

“Any collection” means a show happens to belong to at least one public collection. “Direct route” means an authored rule or intent route explicitly exposes that facet. Direct route coverage is the more useful measure for listener intent.

| Dimension | Strong direct coverage | Partial direct coverage | Indirect-only / gap |
| --- | --- | --- | --- |
| Genre | comedy 59%, horror 52% | drama 9%, sci-fi 36%, mystery 36% | thriller 0%, fantasy 0%, adventure 0%, supernatural 0% |
| Format | — | episodic 31%, anthology 40% | serialized 0%, full-cast 0%, narrated 0%, limited-series 0% |
| Listener intent | headphones-on 85%, late-night 93%, worldbuilding 87%, easy-entry 96%, long-walks 98%, short 79%, serious-sci-fi 94%, warm-weird 96%, cold-isolation-horror 87%, funny-space-disasters 100% | binge-listening 19%, deep-dive 45% | no direct route for long or medium commitment |
| Tone | — | — | tense, dark, cinematic, weird, funny, hopeful, warm, bleak, chaotic, melancholic are all indirect-only |
| Theme | — | sci-fi 44% | mystery, survival, thriller, comedy, found family, identity are indirect-only |
| Discovery profile | — | — | voice style, narrative focus, and intensity have no direct route |
| Completion | ongoing 65%, finished 97% | — | — |
| Release status | completed 53% | — | active and inactive are indirect-only |
| Setting | — | — | no repeated controlled value reaches the 8-show minimum |

The strongest current discovery system is listener-intent curation. The weakest meaningful public surfaces are direct genre routes outside comedy/horror, format routes outside episodic/anthology, and profile/tone/theme routes. The catalogue has enough metadata for some of these, but not enough semantic normalization to justify mass route creation.

## Overlap and redundancy

There are no strict near-duplicates under the Jaccard threshold. The following pairs deserve human review because they share a large core or one route is mostly contained by another:

| Pair | Shared | Jaccard | Shared / smaller set | Signal |
| --- | ---: | ---: | ---: | --- |
| Late-night tension / Headphones-on immersion | 66 | .471 | .667 | large common core |
| Serious sci-fi / Survival pressure | 20 | .345 | .556 | large common core |
| Late-night tension / Anthology Horror | 11 | .110 | .917 | contained core |
| Headphones-on immersion / Anthology Horror | 11 | .102 | .917 | contained core |
| Funny space disasters / Shows like Wolf 359 | 7 | .636 | .875 | contained core |
| Ongoing Horror / Episodic Horror | 7 | .259 | .875 | contained core |
| Shows like Tower 4 / Ongoing Mystery | 6 | .333 | 1.000 | contained core |
| Found recordings and buried evidence / Shows like Limetown | 6 | .316 | .857 | contained core |
| Shows like Tower 4 / Ongoing Horror | 6 | .231 | 1.000 | contained core |
| Start here / Shows like The Amelia Project | 6 | .176 | .857 | contained core |
| Shows like The Amelia Project / Ongoing Comedy | 6 | .113 | .857 | contained core |
| Shows like Wolf 359 / Shows like Oz 9 | 5 | .556 | .833 | contained core |
| Funny space disasters / Shows like Oz 9 | 5 | .455 | .833 | contained core |
| Serious sci-fi / Shows like Derelict | 5 | .116 | .833 | contained core |

These are not automatic merge recommendations. Similarity routes answer “something like X”; authored routes answer a mood, format, status, or listening-intent question. Shared membership is expected where those intents intersect.

## Weak, broad, or inconsistent routes

### Sparse

- Episodic Mystery has 3 members against a declared minimum of 4. It should be reviewed for whether the route is worth keeping, whether the minimum is appropriate for this route, or whether it should remain a surfaced but intentionally narrow route.
- The 7 generated similarity companions have 4 alternatives each. This is a signal for runtime/product review only and does not authorize changing similarity ranking.

### Broad

- Headphones-on immersion has 107 members (14.2% of the published catalogue).
- Late-night tension has 99 members (13.2%).
- Worldbuilding deep dives has 54 members and is a large-scale review, but not a “too broad” signal under the 10% threshold.

The two largest routes are not automatically useless: their explicit intent fit is 96% and 93%. The question is whether their breadth makes them less useful as collection pages than more specific routes, not whether their members are invalid.

### Purpose fit

No curated route fell below the hard 50% purpose-fit threshold. Comedy with a mystery is the only mixed-purpose signal at 67%. Survival pressure is 78%, and Ensemble chaos with heart is 75%; both merit editorial review if the intended promise is narrower than the current membership. These fit percentages are exact metadata matches, not a replacement for human semantic review.

## Conservative missing-route shortlist

The candidate report only considers bounded completionStatus + genres and formats + genres combinations with 8–30 members. It excludes free-text settings, unnormalized themes, and discovery profile fields that the current rule engine cannot safely express.

| Candidate | Members | Why it is useful | Decision |
| --- | ---: | --- | --- |
| Full-cast thriller | 30 | Large, direct format + genre intent; full-cast is currently indirect-only | review only |
| Anthology drama | 28 | Direct format + genre route with a meaningful listener question | review only |
| Full-cast comedy | 24 | Strong format signal and comedy already has strong genre coverage | review only |
| Serialized fantasy | 23 | Addresses a direct genre gap and a dominant format | review only |
| Finished thriller | 18 | Clear commitment/status intent and a direct thriller gap | review only |
| Narrated drama | 16 | Clear voice-format question, but requires editorial copy review | review only |
| Finished mystery | 15 | Direct status + genre route, distinct from ongoing mystery | review only |
| Ongoing thriller | 15 | Clear route; still needs comparison with existing broad collections | review only |
| Serialized adventure | 15 | Useful format + genre route, but adventure is a smaller facet | review only |
| Finished horror | 14 | Clear status route, but overlaps existing horror routes | review only |
| Anthology sci-fi | 13 | Clear format + genre route | review only |
| Narrated horror | 13 | Useful listening-style route, but nearest-route overlap needs human review | review only |

### Added route

Ongoing Mystery was the only route added because it met the strongest conservative case:

- 18 exact current matches;
- uses the existing two-clause factual rule model;
- repairs a meaningful direct mystery/status gap;
- is distinct from Episodic Mystery;
- has complete current rule membership and member reasons;
- does not require any new ranking logic or collection-page change.

No other candidate was mass-generated. The shortlist is intentionally a review queue, not a page-generation backlog.

## Metadata-backed generation opportunities

The current metadata can support useful automation in a bounded way:

- completionStatus + genres supports clean ongoing/finished [genre] routes where the count and purpose remain meaningful.
- formats + genres supports a small review queue for format-led listener intent.
- bestFor is already the strongest direct semantic dimension and should remain curated/intent-governed rather than mechanically exploded.
- discovery.voiceStyle, narrativeFocus, and intensity have enough repeated values to be interesting, but the collection rule engine does not currently support those fields. Adding them would be a product/schema decision, not a safe report-only shortcut.
- content.setting is not ready for generated routes: 224 usable values are currently effectively unique, so there is no controlled setting taxonomy at the 8-show threshold.
- Themes and tags have repeated values, but many are high-cardinality or broad. They should require a controlled taxonomy plus editorial intent before becoming public collections.

The tooling reports candidate opportunities as the catalogue evolves, records nearest existing routes and overlap, and exposes a current-field confidence proxy. It does not write candidates or generate pages automatically.

## Automated membership validation

The check:collection-catalogue command validates:

- unknown show references;
- duplicate member IDs;
- invalid cover references;
- invalid or member-included similarity anchors;
- orphaned/missing reasons as warnings;
- exact rule-membership drift against the current published show set.

The current public catalogue passes with 0 errors and 0 warnings. Strategic flags are deliberately non-failing so the check catches data corruption without turning every editorial review signal into a build failure.

## Files and boundaries

Added:

- tools/lib/collection-catalogue-audit.js
- tools/report-collection-catalogue.js
- tools/test/collection-catalogue-audit.test.js
- catalog-src/collections/ongoing-mystery.json
- this report

Updated:

- catalog-src/collections/_order.json
- generated catalogue artifacts via build:catalog
- package.json scripts for the report and check

Shows Like ranking, recommendation scoring, and collection page layouts were not modified. No deployment, commit, or push was performed.
