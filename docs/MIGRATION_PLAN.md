# Migration Plan

## Guiding rules

- move in small phases
- keep the existing design unless a change is required for data rendering
- preserve production behavior until parity is confirmed
- avoid deleting manual pages before the reusable replacements are proven
- keep rollback easy at every stage

## Baseline inventory

Current full review pages:

- `Impact Winter/impact-winter.html`
- `ars paradoxica/ars-paradoxica.html`
- `oz9/oz9.html`

Current indexed shows:

- Solar
- Story
- From Now
- The Deca Tapes
- Earth Eclipsed
- Vast Horizon
- How I Died
- Windfall
- The Waystation
- We're Alive
- Impact Winter
- Oz 9
- Ars Paradoxica
- Red Valley
- The White Vault
- EOS 10
- Desert Skies
- Wolf 359
- Station 151
- Midnight Burger
- Spectre
- The Phenomenon
- Paralyzed
- Derelict
- Crystal Blues
- End of all Hope
- Tower 4

## Phase 0 - Documentation and audit

Goals:

- document the current architecture
- confirm the catalog inventory
- identify duplicated data
- identify naming inconsistencies and broken paths
- document what already works well

Concrete tasks:

- compare homepage cards against `podcast-data.json`
- inventory missing detail pages
- normalize future slug rules
- identify current tag vocabulary duplicates and near-duplicates
- document deploy/runtime assumptions

Known issues already visible:

- backend parses `index.html` as catalog input
- only 3 of 27 indexed shows have detail pages
- title, folder, and slug naming is inconsistent
- homepage filters and collections are hardcoded

Rollback safety:

- documentation only
- no runtime change

## Phase 1 - Catalog source of truth

Goals:

- create `data/shows.json`
- migrate homepage card data into it
- include enough fields for current cards plus review status
- do not change the UI yet

Concrete tasks:

- define schema conventions in `data/schema.md`
- create stable ids for every indexed show
- map current homepage card fields into structured records
- merge the 3 `podcast-data.json` entries into the new structure
- mark missing detail pages with `reviewStatus: indexed-only`

Rollback safety:

- no page rendering change yet
- old HTML remains authoritative until data parity is verified

## Phase 2 - Dynamic homepage rendering

Goals:

- generate homepage cards from `shows.json`
- keep current layout and styling
- generate result count from data
- generate filter chips from data where practical

Concrete tasks:

- add a data loader in `script.js` or a new frontend module
- render cards into the existing grid shell
- preserve disabled-card behavior for indexed-only shows if needed
- compare rendered output with the current handwritten homepage before removing hardcoded cards

Rollback safety:

- keep the old manual card markup available behind a branch or temporary backup commit
- ship only after visual parity is confirmed

## Phase 3 - Better discovery

Goals:

- create `data/collections.json`
- make collections real archive objects
- expand discovery beyond raw card browsing

Suggested initial collections:

- Best for long walks
- Shows like Derelict
- Shows like Midnight Burger
- Completed shows
- Serious sci-fi
- Funny space disasters
- Cold isolation horror
- Short shows under 5 hours

Rollback safety:

- additive only
- can keep the current 3 homepage collection cards until the new collection model is stable

## Phase 4 - Reusable show pages

Goals:

- create a generic show detail template
- load show content by id
- migrate one existing full review first

Concrete tasks:

- build `show.html?id=...`
- migrate Impact Winter first because it is the strongest current example
- confirm content parity with the current static page
- migrate Ars Paradoxica and Oz 9 after the template is stable

Rollback safety:

- keep original static detail pages until the reusable page has confirmed parity
- redirect later, not immediately

## Phase 5 - Submit flow and trust signals

Goals:

- replace generic contact framing with a proper submit flow
- make the archive feel more trustworthy and alive

Concrete tasks:

- create `submit.html`
- add show count
- add full review count
- add last updated date
- add an `about.html` page
- explain curation and rating policy

Rollback safety:

- Tally can remain in place temporarily even if the wrapper page changes

## Phase 6 - Community ratings polish

Goals:

- keep anonymous ratings
- separate archive rating from community rating in the UI
- avoid overstating tiny sample sizes

Concrete tasks:

- only show public average after enough votes
- add simple anti-spam or rate-limit protection later
- decide whether homepage cards should display community signals or only show pages should
- keep comments and public user reviews out of scope

Rollback safety:

- existing rating endpoints already stand alone
- UI polish can ship independently of catalog migration

## Phase 7 - Public launch readiness

Goals:

- make the archive launchable as a real discovery product

Concrete tasks:

- improve SEO metadata
- add Open Graph metadata
- add sitemap
- create a creator correction flow
- verify mobile experience
- prepare launch messaging for audio drama communities

Rollback safety:

- mostly additive
- no architectural reason to block on this until earlier phases are stable

## Recommended execution order

1. lock down the schema and ids
2. migrate data without changing rendering
3. render the homepage from data
4. introduce reusable show pages
5. refine discovery and trust signals

## Non-goals during migration

- no total frontend rewrite
- no forced framework migration
- no accounts platform
- no comments/forum layer
- no large moderation system

The point is to make the archive scalable without breaking its identity.
