# Echo Archives current capability audit

**Audit date:** 2026-09-14  
**Repository:** `/Users/charliearnerstal/Documents/GitHub/The-Echo-Archives`  
**Audited commit:** `b250af9866525cca72bd1061bb302d083d974405` (`main`)  
**Scope:** read-only product and implementation audit

## How to read this audit

This report describes what the current checkout contains, not what a roadmap, old audit, or hosted deployment promises.

The evidence was checked in four layers:

1. Authored catalog and editorial source in `catalog-src/`, `data/`, `site-src/`, `shared/`, `backend/`, and `tools/`.
2. Runtime and public-page code, including the browser modules in `shared/app/` and server renderers/routes in `backend/`.
3. Read-only report commands already provided by the repository.
4. The local operational SQLite snapshot at `backend/data/community.sqlite`, queried through an immutable SQLite connection. This is useful for understanding implemented storage and the local snapshot, but it is not proof of production activity.

I did not run builds, tests, `npm verify`, enrichment writes, imports, migrations, deployment commands, or catalog edits. The only requested write is this report.

Where a feature is controlled by an environment variable, the report separates “implemented in code” from “active under repository defaults.” Live provider configuration, edge injection, DNS/TLS, hosted data, and real user activity remain outside this checkout’s evidence.

## Executive snapshot

The current product is substantially more than a title-and-link podcast directory. It already has an audio-fiction-specific vocabulary, a fast local search index, editorial collection routes, authored similarity relationships, a typed entity graph, explainable similarity infrastructure, community interaction flows, and internal catalog-quality tooling.

The strategic limitation is exposure and coverage. Most of the strongest systems are either only partially populated or only available to maintainers. The similarity engine can compare the catalog, but public “similar” results are still authored `similarTo` links and similarity collections. The entity graph is real, but only 229 of 752 shows have typed entity links. The discovery vocabulary is strong for the enriched segment but sparse across the 517 imported/factual-only shows. There is no durable listener account, history, favorites, recommendation feedback loop, or discovery funnel measurement.

### Current headline counts

| Capability | Current snapshot |
|---|---:|
| Published shows | 752 |
| Draft shows | 0 |
| Public collections | 46 |
| Unique shows in at least one collection | 243 (32.3%) |
| Collection membership edges | 620 |
| Authored `similarTo` links | 234 links across 71 shows |
| Public entities | 102 |
| Public directory entities | 48 organizations |
| Typed entity relationship edges | 279 |
| Shows with at least one typed entity link | 229 (30.5%) |
| Shows with archive ratings | 27 |
| Full-review shows | 7 |
| Shows with a populated `discovery` profile | 0 |
| Shows with populated tone | 73 |
| Shows with populated `bestFor` context | 71 |
| Shows with populated tags | 235 |
| Shows with at least one published listener review in the local DB | 0 |
| Active community rating submissions in the local DB | 0 |

The source/runtime reconciliation report found the generated show, collection, search-index, and catalog-status artifacts consistent with source at this commit. The same report exits non-zero because the catalog still has known content/research blockers, not because the runtime artifacts are out of sync.

# 1. Public discovery experience

## Homepage

The homepage is the primary discovery surface. Its product question is explicit: **“What should you listen to next?”** The implementation is in `site-src/pages/index.html` and `shared/app/pages/home/`.

The homepage currently provides:

- A cinematic archive hero with three preselected routes into the catalog:
  - `shows-like-midnight-burger`
  - `finished-arcs`
  - `shows-like-welcome-to-night-vale`
- Search with the prompt “Search titles, moods, tones, formats, or ‘like Midnight Burger’.”
- A filter menu for:
  - genre
  - tone
  - format
  - completion
  - review coverage
  - listening context / `bestFor`
  - tags
- Quick filter chips. The initial authored preferences are Sci-fi, Mystery, Horror, Comedy, Survival, and Time travel, but the client only keeps quick filters that occur in the available catalog facet data.
- Two browse order modes:
  - Default order
  - Recently updated
- A “Popular in the archive” area.
- A recently added area.
- A full archive show grid with incremental loading.
- A featured collections rail.
- A “Start from a show you like” rail backed by similarity collections.
- Archive stats for indexed shows, reviewed shows, collections, and update recency.
- A rating guide separating Archive Rating, Listener Review Score, and Community Rating.

The homepage loads `/data/search-index.json` and `/data/collections.json` through `shared/app/data.js`, then hydrates the search records with the published show records. Initial rendering loads 60 shows; “Load more” adds 60 at a time. The client also has an end-of-page continuation behavior after repeated downward attempts, so a large catalog does not appear as one enormous initial DOM payload.

The homepage changes the visible secondary sections when the user searches, filters, selects a collection, or changes sorting. In a constrained discovery state, the relevant results take priority over the popular, featured, and recently-added rails.

## Browse, filtering, and facets

Filter behavior is implemented in `shared/app/pages/home/filter-state.js`, `shared/app/pages/home/filters.js`, `shared/app/pages/home/url-state.js`, and `shared/app/data.js`.

Within one filter group, selected values are ORed. Across different groups, the groups are ANDed. For example, selecting `horror` and `mystery` permits either genre, while selecting `horror` plus `full-cast` requires both conditions. The state includes fallback buckets for `unclear` completion and `indexed-only` review coverage.

The available public groups are driven by actual catalog values rather than a hard-coded list:

| Group | Current behavior |
|---|---|
| Genre | Controlled genre values and query aliases such as sci-fi / science fiction |
| Tone | Controlled tone values where present |
| Format | Controlled format values where present |
| Coverage | Full review, spotlight, indexed-only, imported, and related review-status handling |
| Completion | Finished, ongoing, cancelled, unclear and release-state fallbacks |
| Best for | Listening-context routes such as long walks, binge listening, headphones on, and serious sci-fi |
| Tags | Visible tags with at least two catalog occurrences; singleton values are not promoted into the filter menu |

Filter values and search state persist in the URL. `shared/app/pages/home/url-state.js` reads and writes:

- `q`
- `collection`
- `sort`
- repeated `genre` values
- repeated filter-group IDs for other facet groups

Invalid values are discarded against the available facet options. State updates use `history.replaceState`, preserving the hash. This makes discovery routes linkable and refreshable without introducing a second routing system.

The show-card filter links are also real routes: show-page tags link back to the homepage with a tag selection, and `bestFor` links back to the appropriate home filter.

## Search-driven discovery

The homepage search is a local, client-side search over the generated search index. It debounces input by 150 ms, scores the catalog, then applies selected filters. It supports title searching but also discovery-oriented natural-language terms, creator/entity names, tags, moods/tones, formats, statuses, transcripts, content notes, and authored similarity target names.

The query parser understands “like”/“similar to” constructions. A query such as `shows like Midnight Burger` resolves the seed show and requires a direct authored `similarTo` relationship in either direction. It does not invoke the dynamic similarity engine. This distinction matters: the UX sounds broader than the current data path actually is.

For a non-empty query, cards can show the strongest matched discovery field rather than always repeating the same metadata. `shared/app/pages/home/search-presentation.js` chooses among creator, tags, best-for, genre, tone, format, and aliases and exposes the match as presentation context.

## Popularity, recency, and “hidden gems”

The homepage has a public popularity rail, but it is not a mature popularity system:

- `shared/app/pages/home/most-popular.js` initially uses a small fallback set: Midnight Burger, We’re Alive, Red Valley, and Derelict.
- It asynchronously loads community rating summaries for all published shows.
- It ranks by rating count, then average community rating, then title; it can fall back to the numeric catalog `popularity.score`, then the authored fallback IDs.
- The rail shows at most four cards and is only visible in the default unfiltered state.

Current authored source coverage for `popularity.score` is zero, and the local community database has no active rating submissions. Therefore the current public rail is a combination of a static safety net and a runtime community-ranking path, not a validated archive-wide popularity model.

Recently added is catalog recency, not a listener history. `recently-added.js` sorts by catalog publication date and then update/title values. There is no hidden-gem score, quality-adjusted popularity score, rising-show mechanism, “because this is under-discovered” route, or engagement-adjusted long-tail ranking in the current implementation.

## Editorial and curated discovery

Editorial discovery is currently a meaningful product layer, not just a genre directory:

- The homepage features collection rails.
- `/collections` provides an intent-led directory.
- `/collections/:id` provides a route with description, tags, commitment, membership, reasons, and related collection navigation.
- The homepage contains “shows like” entry points.
- Collection cards use cover-art collages and are anchored to an actual show for similarity routes.
- Show cards can explain collection membership through `showReasons`.

The 46 current collections split into 20 curated, 9 rule-based, and 17 similarity routes. This collection layer is one of Echo’s clearest differentiators because its routes are framed around listening intent, tone, context, and neighboring shows rather than only genre.

## Creator-based discovery

The homepage can return a separate “Creators in archive” result panel. It resolves public entities and links them to `/creators/:id`. The matching is token-based substring matching over entity names and aliases, not the full fuzzy show-search scorer.

The public creator directory is organization-led. `/creators` provides searchable/sortable directory pages for production companies, studios, and networks, with featured organization shortcuts, type filters, show counts, last-reviewed context, and correction links. Person entities can have public show-page/detail surfaces and can be linked from shows, but `directory:false` people are intentionally excluded from the main organization grid.

## Personalized or semi-personalized discovery

There is no durable user-personalized browse surface. The following limited, semi-personalized behavior exists:

- An anonymous device can save one 1–10 community rating per show.
- The community rating widget can show “your rating” and a distribution to that device.
- If enabled, Ask the Archivist receives a current-page context, up to eight recent chat messages, prior recommendation IDs, positive constraints, exclusions, and “not like this show” constraints.
- The Archivist applies a repeat policy so a previously returned recommendation can be displaced by a fresh match when the score difference is not large.
- Archivist history is browser session storage, not an account profile.

There are no account-based preferences, favorites, bookmarks, recently viewed shows, listening progress, durable recommendation feedback, or user-specific home ranking.

## Random and exploration mechanisms

No random show button, shuffle route, surprise-me endpoint, random collection, or rotation mechanism was found in the public discovery code. Exploration is currently driven by search, filters, editorial routes, collection membership, authored similarity, entity navigation, recency, and the limited popular rail.

# 2. Show pages

The public show page is implemented through the shared renderer in `shared/app/render-show/` and server-side through `backend/lib/show-page-render.js`. The canonical routes are `/shows/:showId` and the legacy/query-compatible show route redirects toward the canonical form.

## Hero and decision console

The hero contains:

- Cover art.
- Breadcrumb navigation back to the archive and genre context.
- Compact status chips such as Top Rated, Full Review, Imported, and the current review-status signal.
- Show title and subtitle.
- Up to four key tag chips, each linking back to filtered browse.
- A decision console separating:
  - Archive Rating
  - Listener Review Score
  - Community Rating
  - runtime
  - format
  - public release/completion status
- A primary listening action.
- An archive review/note anchor.
- Facts & Links anchor.
- Share action.

The primary listening link order is intentionally practical: start link, website, Apple, Spotify, RSS, then other available listen links. Links open externally. This is a discovery-to-listening path, not an embedded player.

## Metadata and discovery context

The page can display:

- Full official description/summary.
- Archive take, spoiler-free review, and additional archive thoughts where editorial content exists.
- Archive rating.
- Listener Review Score.
- Public community rating and distribution when the public minimum is met.
- Genres, tags, tones, themes, best-for context, and formats when populated.
- Runtime and episode count.
- Season count.
- First/latest/next release dates where present.
- Release cadence.
- Release/completion state.
- Transcript availability, transcript languages, formats, and coverage notes.
- Official links and listening links.
- Cast, creators, and typed creator/production/studio/network entities.
- Creator verification status where populated.
- Metadata correction route.
- Imported/factual-only disclosure.

The “Best for” strip is especially easy to overlook: it converts listening context into direct browse routes. The facts panel also keeps objective metadata separate from editorial copy and community content.

## Reviews and ratings

A fully reviewed show can show its archive review even when it has no listener reviews. The listener review area is paginated through `/api/reviews/shows/:showId`; the server-rendered page includes the first review and the client can load more for the carousel.

Listener reviews support:

- title
- body
- 1–5 public rating stars
- spoiler level: spoiler-free, light spoilers, full spoilers
- alias/author name
- best-for context
- “worked best” context
- optional detailed categories: voice acting, sound design, story, characters, ads, and length
- helpful votes

Detailed category averages are only made public once the configured minimum rating count is reached. The default is three. This is a useful future discovery signal, but it is not currently represented as a populated local public dataset.

The anonymous community rating widget is separate. It accepts integer 1–10 ratings, shows a public average/distribution only at the configured minimum, and stores the device/profile relationship without requiring a Continental ID account. In production, community rating writes default to disabled unless explicitly configured; non-production defaults permit them.

## Related shows, collections, and entities

The page contains:

- “Try next” similar-show cards, currently sourced from authored `show.similarTo` targets with non-empty `similarReasons`.
- Collection memberships, with a compact initial set and an overflow/details path.
- Collection reasons where available.
- “More from” entity navigation, typically the strongest resolved creator, production company, studio, or network with at least three other linked shows.
- Entity facts grouped by typed role.
- Official creator/entity links.

The dynamic candidate results produced by `shared/archive-similarity.js` are not directly rendered in this section. The public show-page similarity experience is therefore more curated and narrower than the internal similarity engine.

## Imported-show transparency

Imported shows are not silently presented as editorially reviewed. The page explains that the factual source has been checked through the import process and keeps the absence of editorial review separate from ratings and listener content. This is important for trust and is an existing product capability, not just a documentation convention.

# 3. Search

## Architecture

The core search implementation is `shared/archive-search.js`. The build process produces `/data/search-index.json`; the browser loads and hydrates it through `shared/app/data.js`. The same shared search/scoring primitives are reused by the homepage and archive-grounded Archivist code.

This is a local index/search architecture rather than a remote search service. It avoids an extra runtime dependency and makes the public browse page fast, but it also means all relevance behavior is encoded in the shipped JavaScript and generated index.

## Searchable fields

The generated search record can include:

- title
- subtitle
- aliases
- description
- archive take, spoiler-free review, thoughts, and review paragraphs
- genres
- formats
- tags
- tones
- themes
- `discovery` profile values
- best-for values
- content notes
- creators and their resolved entity names/aliases
- legacy creator strings
- cast
- narrator
- languages and transcript languages
- transcript availability
- completion status
- review status
- facts
- credits
- availability
- titles of authored `similarTo` targets
- objective metadata notes

The search index intentionally mixes factual fields and editorial text for discovery. Results still preserve the distinction in the show-page UI; search itself is a relevance tool, not a claim that a review phrase is objective metadata.

## Query normalization and natural-language support

Normalization lowercases, expands punctuation and separators, and converts ampersands/underscores/hyphens into searchable spaces. It recognizes aliases including:

- sci-fi, sci fi, science fiction, scifi
- full-cast/full cast/fullcast
- narrated, single narrator, solo narrator, one narrator
- completed, complete, finished
- ongoing, active, unfinished
- full review, reviewed, review first
- easy entry, easy to jump into, easy to get into
- funny space disasters
- cold isolation horror
- headphones on
- binge listening/bingeable
- transcripts/captions

The parser creates phrase/n-gram variants, removes conversational stop words, and recognizes structured field clauses. When a structured alias is recognized, the query requires a corresponding field match rather than treating the phrase as generic text.

The “like” parser resolves a seed show by title/alias phrase. It supports forms such as:

- `shows like X`
- `similar to X`
- `what is X similar to`
- `X like`

For a seed recommendation query, direct authored links are required. This is not a fuzzy semantic similarity search and does not use the internal dynamic comparison index.

## Scoring and fuzzy matching

The implementation uses weighted deterministic scoring. The most important score bands are:

| Signal | Representative score behavior |
|---|---:|
| Exact title | +120 |
| Title starts with query | +90 |
| Title token alignment | +72 |
| Title token prefix/fuzzy | up to +66 |
| Exact/partial alias | +76 / +36 |
| Tags | +30 / +16 |
| Best-for | +28 / +15 |
| Genres | +26 / +14 |
| Tones | +24 / +12 |
| Formats | +24 / +12 |
| Creators/entities | +24 / +12 |
| Completion status | +24 / +12 |
| Review coverage | +22 / +10 |
| Similar target title | +24 / +12 |
| Description | +12 |
| Archive text | +10 |
| Token coverage | proportional bonus up to +20 |
| Imported non-exact result | small penalty |

Fuzzy matching uses edit distance with a same-first-character guard. Tokens shorter than four characters do not fuzzy-match; four-to-seven-character tokens allow distance one; longer tokens allow distance two. Prefix matches are preferred before fuzzy matches.

Results are finally ordered by score, then rating evidence, then title. The homepage applies its facet state after scoring, so a query remains relevance-ranked inside the selected facet set.

## Entity and collection search

Entity matching is a separate homepage result block. It checks public resolved entity names and aliases with token substring matching and returns up to four results. It is not the full fuzzy search scorer.

Collection search is also separate. `/collections` uses case-insensitive substring matching against collection title, description, label, commitment, kind, intent tags, and member show title/genre/tone/tag fields. It does not use the show search index’s weighted fuzzy algorithm.

There is no unified cross-entity/collection/show search endpoint and no public autocomplete component. The browse search inputs are ordinary text inputs, and the collection search explicitly sets `autocomplete="off"`. No `datalist`, suggestion dropdown, search-as-you-type entity picker, or recent-query UI was found.

## Empty states and analytics

The homepage empty state suggests broadening the query, clearing filters, browsing collections, using Ask the Archivist when enabled, or submitting/correcting catalog information. Collection and entity empty states also provide recovery language rather than rendering a dead end.

No custom search event, query log, click-through event, or search-success metric is implemented in the repository. The optional analytics integration is described in section 9.

# 4. Collections and editorial discovery

## Definition and membership model

Collections are authored in `catalog-src/collections/` and loaded/validated by `backend/lib/catalog.js` and the catalog schema. A collection contains:

- `id`
- `title`
- `description`
- `label`
- `kind`
- `intentTags`
- `commitment`
- `coverShowIds`
- ordered `showIds`
- per-show `showReasons`
- `featured`
- `order`
- created/updated timestamps

The ordered `showIds` snapshot is what the public runtime renders. Membership is not inferred in the browser. The complete `showReasons` field allows a collection to explain why a show belongs rather than merely list it.

The source also supports automation metadata. Rule-based definitions use a small number of factual clauses. Semantic definitions can point at a configured local AI service, with confidence, operational evidence, overrides, and audit events kept outside the public runtime. Manual removals/overrides and protected descriptions are represented so automatic regeneration does not silently undo editorial judgment.

Current source coverage:

- 20 curated collections
- 9 rule-based collections
- 17 similarity collections
- 46 total collections
- 38 collections with intent tags
- 46 collections with complete show-reason coverage
- 17 collections with an anchor show
- 6 featured collections
- 620 show-membership edges
- 243 unique shows appearing in any collection

All nine automated collections in the current source use rule mode. No authored semantic collection was found in the current collection set.

## Public collection directory

`/collections` presents collections as discovery routes, not as generic genre folders. It includes:

- a mood/context hero
- intent chips such as long walks, easy first step, late night, headphones on, serious sci-fi, funny space, cold horror, time-bent, finished, quick listens, warm weird, binge listening, and worldbuilding
- a “related collections”/similarity section with an initial five and “Show 5 more” behavior
- a featured route section
- the full collection directory
- collection search
- sort options:
  - editorial order
  - newest
  - rating
  - popularity
  - title
  - show count
- empty-state recovery language

The collection card uses a cover collage of up to four member shows, title/description, intent chips, show count, and commitment/kind metadata. Similarity collections use their anchor show as the primary visual anchor.

## Collection detail

`/collections/:id` includes:

- breadcrumb
- title, description, label, and hero intent tags
- share action
- “At a glance” metadata for show count, route type, anchor show, and update date
- ordered show cards
- per-membership reasons
- “All collections” navigation
- related collections based on shared intent, shared shows, and kind

Collection membership feeds the similarity engine as a factual/editorial signal and can produce shared-collection reasons. This means editorial curation is already part of the reusable discovery substrate, not an isolated presentation feature.

## Management and candidate tooling

The maintainer collection UI and reports support candidate generation, review, rule execution, and collection audit workflows. The local operational DB currently contains 26 collection candidate records: 14 approved and 12 proposed. These records are not equivalent to public collection memberships; public membership comes from the catalog snapshot.

`npm run report:collection-candidates` is read-only and currently reports 4,450 candidate edges across 273 shows after the similarity/evidence gates. It also identifies low-membership collections, richly described uncollected shows, thin catalog areas, and unsupported broad-genre-only candidates. This is substantial internal discovery infrastructure that is not yet a listener-facing recommendation queue.

# 5. Creator/entity graph

## Supported entity types and roles

The typed graph is implemented in `shared/archive-entities.js`, with source records in `catalog-src/entities.json` and typed links on shows.

Supported entity types:

- `person`
- `production-company`
- `studio`
- `network`

Supported relationship roles:

- creator
- production company
- studio
- network

The graph deliberately treats typed `entityLinks` as the public relationship source. Legacy `creatorId`, `networkId`, and free-text creator/network values are evidence or compatibility metadata, not stable public foreign keys.

## Public behavior

Public entity resolution only returns public entities with links to published shows. Show pages render typed entity facts and role labels. Entity detail routes are `/creators/:id` even though the route name is product-language shorthand for multiple entity types.

The public `/creators` directory is organization-first:

- production companies
- studios
- networks

It supports all/type filters, name or show-count sorting, search, featured organizations, organization counts, connected-show counts, last-reviewed information, FAQs, and correction routes. People marked `directory:false` remain available where useful on show/detail surfaces but are not promoted into the organization directory.

The homepage can surface matching entity names beside show results. Show pages can show “More from” one strong linked entity when that entity has enough neighboring shows. Links are never generated from raw creator strings alone.

## Current graph coverage

| Graph measure | Current source snapshot |
|---|---:|
| Total entities | 102 |
| Public entities | 102 |
| Public directory organizations | 48 |
| Person entities | 32 |
| Production companies | 53 |
| Networks | 12 |
| Studios | 5 |
| Typed relationship edges | 279 |
| Shows with typed entity links | 229 / 752 (30.5%) |
| Shows with no typed entity link | 523 / 752 |
| Shows with at most one typed relationship | 708 / 752 |
| Indexable entities with at least two linked shows | 62 / 102 |
| One-show entities | 40 |
| Zero-show public entities | 0 |

Role coverage across shows is uneven: creator-role links touch 45 shows, production-company links 154, studio links 9, and network links 64. The relationship count can exceed the number of linked shows because a show can have multiple roles/entities.

## Developer-only graph infrastructure

`npm run report:entity-graph` produces a read-only graph report with connected/zero/weakly-linked shows, role and entity-type coverage, top entities, bipartite density, unresolved legacy evidence, and research queues. It currently reports 523 shows requiring source-backed/manual entity research.

`npm run report:entity-candidates` detects candidates from legacy creator/network/credit evidence without writing entities or relationships. The current report finds:

- 63 relationship candidates across 68 shows
- 6 supporting credit leads without a safe public role
- 1 existing-entity candidate
- 68 new-entity candidates
- compound evidence on 91 shows across 201 values
- 199 manual-review batches

These tools are meaningful enrichment infrastructure, but most of their output is not exposed to listeners until a maintainer verifies and publishes the links.

The graph does not currently model typed cast, writer, director, composer, character, or voice-performer relationships. Cast information exists as sparse/free-text metadata on some shows, but it is not a full public entity graph.

# 6. Similarity and recommendations

## Core implementation

The reusable deterministic engine is `shared/archive-similarity.js`. It exposes `createSimilarityIndex`, `compareShows`, `getSimilarShows`, metadata coverage profiles, field frequencies, dimensions, and explanations. The report CLI is `tools/report-similarity.js` and the public module is also referenced through the catalog/shared runtime layer.

The engine compares published shows only. It indexes curated collection memberships and similarity collections and resolves typed entity entries when available.

## Scoring dimensions

The current dimensions and weights are:

| Dimension | Weight | Notes |
|---|---:|---|
| Curated relationship | 30 | Authored `similarTo` or anchor similarity-collection evidence; treated as curated evidence |
| Shared creator/entity | 14 | Role-sensitive and frequency-adjusted |
| Genre | 10 | Common genre values count less than rare values |
| Format | 10 | Also an anchor dimension |
| Tone | 5 | Discovery dimension |
| Theme | 5 | Discovery dimension |
| Discovery tag | 3 | Discovery dimension |
| Best for | 3 | Listening-context dimension |
| Narrative focus | 3 | Currently no populated `discovery` coverage |
| Release/completion profile | 3 | Controlled release state |
| Episode length | 4 | Requires comparable runtime metadata; match threshold is 60% closeness |
| Shared collection | 2 | Curated membership, frequency-adjusted |
| Catalogue size | 2 | Episode/season size, match threshold is 55% closeness |
| Voice style | 2 | Currently no populated `discovery` coverage |
| Intensity | 2 | Uses `discovery.intensity`, falling back to `content.intensity` |
| Commitment | 2 | Currently no populated `discovery` coverage |
| Archive rating profile | 0 | Evidence/explanation only; never affects similarity score |

The effective score is an explainable sum of dimension contributions, capped conceptually at 100. Set dimensions use overlap ratio and a distinctiveness factor. Shared values are frequency-weighted across the catalog using a logarithmic signal-distinctiveness calculation, so a rare shared tag/entity can matter more than a ubiquitous value such as drama or serialized.

Entity overlap is role-aware. A shared creator is stronger than a shared network, and the strongest shared role controls the entity contribution. Collection overlap is also distinctiveness-adjusted and can explain the shared collection by title.

Release state is derived from controlled completion/release fields. Episode length uses average episode minutes, then median. Catalogue size uses episode count, then season count. Archive ratings can explain comparable rating profiles but deliberately cannot turn editorial rating agreement into a recommendation score.

Descriptions, free-form archive reviews, archive takes, popularity, unknown release states, review-status text, and generic structure are not score dimensions. This is a conservative choice that prevents prose or missingness from masquerading as factual similarity.

## Coverage and gates

Each record receives a metadata coverage profile. The profile records available/missing dimensions, weights, coverage groups, and per-dimension availability. Pair comparisons record source and target coverage separately, so missing metadata is not treated as a negative preference.

The normal candidate gate requires:

- score at least 8
- at least two matched metadata dimensions
- at least one matched anchor dimension

Sparse records with coverage below 35% use a lower score floor of 7.5, but the two-dimension/one-anchor gate still applies. Authored editorial relationships are eligible as curated evidence even when the target is sparse.

The anchor dimensions include entity, format, release profile, shared collection, episode length, and catalogue length. This reduces the chance that one broad genre match creates a recommendation by itself.

## Current report output

`npm run report:similarity` currently reports:

- 752 published shows
- 234 authored similarity links with 234 written reasons
- 17 similarity collections
- 229 shows with typed entity links
- 100% of shows with at least one candidate
- 99.9% with at least three candidates
- 99.3% with at least five candidates
- 99.3% with at least eight candidates
- 218.03 candidates per show on average
- 222.5 median candidates per show
- score range 7.5–57.8 among returned candidate results
- 163,956 returned candidate results in the report run

The candidate volume is intentionally broad for reporting, but the score distribution is telling: the median returned score is 9.6 and most reasons are genre, format, episode length, or catalogue size. Stronger scores are much rarer. The engine is a useful substrate and audit tool; it is not yet a finished public recommendation ranker.

Signal coverage used by the engine is currently:

- genre: 752 / 752
- format: 749 / 752
- episode length: 743 / 752
- catalogue length: 751 / 752
- release profile: 254 / 752
- shared collection: 97 / 752
- typed entity: 229 / 752
- tone: 73 / 752
- theme: 82 / 752
- tag: 235 / 752
- best-for: 71 / 752
- legacy intensity fallback: 73 / 752
- discovery voice style: 0
- discovery narrative focus: 0
- discovery commitment: 0
- archive rating profile: 27 / 752, evidence only

The sparse segment is only three shows under the report’s coverage bands, but the much larger issue is the gap between factual availability and audio-fiction-specific enrichment. The engine can run on genre/format/length, but the strongest strategic signals—tone, intent, voice, narrative focus, intensity, commitment, and entity relationships—are not broadly populated.

## Public exposure

Publicly exposed similarity currently means:

- authored `similarTo` cards on show pages
- authored reasons in “Try next” cards
- similarity collections in the collection directory
- collection membership and shared-collection context
- the homepage “Start from a show you like” routes
- the search parser’s direct authored “shows like X” path

The dynamic `getSimilarShows` results, score breakdown, coverage profile, candidate report, and similarity explanations are not rendered as a general public “because these dimensions match” recommender. This is the largest exposure gap in an otherwise serious internal system.

# 7. Discovery metadata

## Schema and controlled vocabulary

The canonical schema is documented in `data/schema.md` and enforced through `tools/lib/catalog-schema.js`, with normalization in `shared/archive-record.js`.

The relevant controlled fields include:

- genres: sci-fi, fantasy, horror, mystery, thriller, comedy, drama, adventure, science, supernatural
- tones: dark, bleak, tense, warm, funny, chaotic, hopeful, cinematic, weird, melancholic
- formats: full-cast, narrated, serialized, episodic, anthology, limited-series, long-running
- `bestFor`: long-walks, binge-listening, late-night, headphones-on, worldbuilding, easy-entry, serious-sci-fi, funny-space-disasters, cold-isolation-horror, short-under-five-hours
- releaseStatus: active, completed, hiatus, inactive, unknown
- completionStatus: ongoing, finished, cancelled, unclear
- reviewStatus: full-review, spotlight, indexed-only, imported, planned
- discovery.voiceStyle: primarily-acted, primarily-narrated, mixed
- discovery.narrativeFocus: character-driven, plot-driven, balanced
- discovery.intensity: low, medium, high, variable
- discovery.commitment: single-sitting, short, medium, long, deep-dive

Rich optional metadata includes aliases, themes, content notes, languages, transcript languages, official links, release dates, cast, creators, popularity, facts, credits, availability, content, verification, objective notes, `similarTo`, and `similarReasons`.

Imported records are intentionally prevented from receiving editorial fields. The schema requires discovery tags for ordinary published records, but the 517 imported/factual-only records are intentionally policy-sparse. This is a trust boundary rather than an accidental omission, although it creates a large discovery-coverage gap.

## Current source coverage

The following counts are current authored source counts for 752 published shows. A field is counted when it is populated after the repository’s normal record normalization; values can still have different depths or quality.

| Field | Shows with data | Coverage | Interpretation |
|---|---:|---:|---|
| Genres | 752 | 100.0% | Core taxonomy is complete |
| Formats | 749 | 99.6% | Three shows lack a usable format |
| Tags | 235 | 31.3% | Enrichment segment only; imported records are policy-sparse |
| Tones | 73 | 9.7% | Strong strategic facet but thin coverage |
| Themes | 82 | 10.9% | Useful but sparse |
| Best-for context | 71 | 9.4% | Useful listening-intent layer, sparse overall |
| Content notes | 75 | 10.0% | Content discovery/safety signal, sparse |
| Discovery profile object | 0 | 0.0% | Schema exists, no populated profiles |
| Discovery voice style | 0 | 0.0% | No current populated values |
| Discovery narrative focus | 0 | 0.0% | No current populated values |
| Discovery intensity | 0 | 0.0% | Legacy `content.intensity` exists on 73 instead |
| Discovery commitment | 0 | 0.0% | Collection-level commitment exists separately |
| Legacy `content.intensity` | 73 | 9.7% | Used as similarity fallback |
| Episode count | 743 | 98.8% | Strong factual coverage |
| Season count | 621 | 82.6% | Good but incomplete |
| Average episode minutes | 721 | 95.9% | Strong runtime comparison coverage |
| Median episode minutes | 679 | 90.3% | Strong fallback/detail coverage |
| Declared total hours | 42 | 5.6% | Sparse declared value |
| Observed runtime-derived total hours | 675 | 89.8% | Existing report-derived coverage is much better |
| First release date | 746 | 99.2% | Strong factual coverage |
| Latest release date | 747 | 99.3% | Strong factual coverage |
| Known release status | 254 | 33.8% | 498 remain unknown |
| Known completion status | 246 | 32.7% | 506 remain unclear/unknown |
| Official links | 712 | 94.7% | Strong but not complete |
| Listening links | 752 | 100.0% | At least one usable listen path per published show |
| Aliases | 716 | 95.2% | Strong search support |
| Cast | 29 | 3.9% | Sparse and not graph-linked |
| Archive rating | 27 | 3.6% | Editorial rating is intentionally selective |
| Popularity score | 0 | 0.0% | No static authored popularity values |
| Authored `similarTo` | 71 | 9.4% | 234 directed links |
| Archive review content of any kind | 67 | 8.9% | Broader than full-review status |
| Full review status | 7 | 0.9% | Deep editorial review coverage |
| Creator-verified flag | 0 | 0.0% | Verification request flow exists; current source has no populated public flag |

The review-status split is 517 imported, 228 indexed-only, and 7 full-review at the current source snapshot. The internal discovery-quality report groups 235 records as enrichment-eligible and treats imported records separately.

## Coverage interpretation

Echo has a complete core identity layer—title, description, genre, and mostly format/links/runtime—but its unusual audio-fiction discovery layer is concentrated in a smaller enriched segment. The product can already express the right concepts; it does not yet have those concepts populated across the catalog.

This distinction is important for planning. Adding another filter component would not solve the primary limitation. The highest-leverage work is source-backed enrichment, entity resolution, coverage-aware ranking, and exposing the existing routes with honest fallback behavior.

# 8. Ratings, reviews, submissions, and user signals

## Archive editorial signals

Archive ratings and archive review text are authored catalog fields. The current source has 27 archive ratings and 7 full-review companions. Archive ratings are explicitly editorial perspective and are not the same as listener/community ratings.

The similarity engine can compare rating profiles as explanation-only evidence, but ratings do not affect its score. This prevents a high-rated show from becoming “similar” merely because another show is highly rated.

## Community ratings

The community rating system is implemented end to end:

- The browser creates or reuses an anonymous profile via `/api/community/profiles/anonymous`.
- A device/voter secret is stored client-side and represented server-side through an HTTP-only voter cookie and hashed identifiers.
- A show can receive one integer rating from 1 to 10 per device/profile.
- Users can update or clear their rating.
- Summary APIs return average, counts, distribution, and the viewer’s rating.
- Public summaries are suppressed until the minimum public count is met; the default is three.
- Rate limits, abuse hashes, optional Turnstile, and retention controls exist.

The local SQLite snapshot currently has:

- 1 community profile
- 0 active rating submissions
- 20 rating events
- 752 synchronized podcast rows

That proves the storage and route path exist in this checkout; it does not prove that the hosted site has no ratings.

## Listener reviews

Listener reviews have a separate submission, moderation, publication, and public-read path. The review service:

- validates show linkage to a known published show
- requires a 1–5 rating, title, and review text
- supports spoiler levels
- stores best-for/worked-best context
- supports detailed audio-fiction-relevant categories
- publishes only accepted/approved content
- exposes paginated public reviews
- exposes public category summaries only at a minimum rating count
- supports device-level helpful voting

The current local DB has zero `published_listener_reviews` and zero helpful votes. The schema/service exists, but the local snapshot has no active public listener-review corpus.

## Submissions and moderation

`backend/lib/services/submission-service.js` and the submit UI support four main submission types:

- new show
- metadata correction
- listener review
- creator verification request

Correction subtypes include broken links, metadata, status, credits, creator page, artwork, and other. Creator-page corrections include missing page, name/alias, organization type, show connection, official links, description, and other.

Show submissions require at least an official or listening link. Listener reviews require review text and a rating, with optional structured discovery feedback. Creator-verification requests can include role, evidence method, proof/email, requested updates, and official links.

The workflow uses moderation states such as new, in-review, accepted, rejected, and needs-follow-up. User-submitted content does not auto-publish under the current service design.

The local DB currently has zero show submissions. Again, this is local operational state, not a claim about production.

## Other user signals

| Signal | Status in current implementation |
|---|---|
| Anonymous community rating | Implemented and public on show pages; local snapshot has no active submissions |
| Listener review | Implemented, moderated, and publicly rendered when published; local snapshot has none |
| Review helpful vote | Implemented; local snapshot has none |
| Show submission | Implemented and moderated; local snapshot has none |
| Metadata correction | Implemented and moderated |
| Creator verification request | Implemented as a request flow; no current populated public verified flags |
| External listening-link click tracking | No repository-managed custom event tracking found; links are ordinary outbound links |
| Recently viewed/history | Not implemented |
| Favorites/bookmarks | Not implemented |
| Durable accounts | Not implemented for discovery; Continental ID is not required for the public discovery flow |
| Recommendation feedback | No explicit “more/less like this” or accepted/rejected recommendation signal |
| Session-level Archivist context | Implemented only when Archivist is enabled; browser-session history, not durable personalization |

# 9. Analytics and discovery measurement

## Provider/system

The site build can inject a deferred Plausible script through `tools/build-pages.js` when `PLAUSIBLE_DOMAIN` is configured and the page manifest marks the page as analytics-enabled. The page manifest includes analytics intent for many public pages, but the repository default has no domain configured. Therefore “analytics-enabled in the manifest” does not mean a Plausible script is necessarily present in a built/hosted deployment.

The privacy page explicitly says the reviewed repository build does not embed Plausible by default and that Cloudflare may inject RUM at the edge depending on production settings. That is a deployment/provider boundary, not repository-owned product instrumentation.

The backend also contains access observability/logging for HTTP operations when enabled. Those logs are operational request telemetry, not a discovery event model.

## Custom discovery events

No repository-managed custom event implementation was found for:

- search submitted
- search query/result count
- filter selected
- show opened
- collection opened
- creator/entity opened
- listening-link click
- review started/submitted
- community rating saved/cleared
- correction submitted
- creator verification submitted
- recommendation shown/clicked/accepted/rejected
- browse-to-listen funnel completion

There is no `/api/analytics` event collector, `window.plausible` event call, event-name registry, `sendBeacon` implementation, or equivalent custom discovery telemetry in the current code search.

## Privacy constraints

The project already has a comparatively clear privacy boundary:

- no account is required for public browse
- community rating identity is anonymous/pseudonymous and hashed server-side
- community abuse identifiers have retention controls
- Archivist history is session storage when enabled
- imported catalog facts and editorial ratings are kept separate
- optional provider/edge analytics is disclosed separately from repository behavior

The tradeoff is measurement blindness. Echo currently cannot reliably answer which discovery paths produce show opens, listening-link clicks, successful searches, collection exploration, or high-quality listener feedback.

# 10. Internal tooling

The following tools already exist for discovery/catalog work. The report commands below were run read-only for this audit. No write-capable enrichment or build command was run.

| Command/tool | Problem it solves | Current role |
|---|---|---|
| `npm run report:catalog` | Catalog integrity, reviews, similarity-reason completeness, collection coverage, RSS/content gaps, generated drift | Read-only catalog health report; currently exits 1 because known content/research blockers remain |
| `npm run report:discovery-quality` | Segment-level coverage and discovery blind spots | Read-only prioritization report for imported/enrichment/editorial records |
| `npm run report:similarity` | Candidate quality, score distribution, coverage, dimensions, explanations, examples | Read-only similarity engine report; supports `--show=derelict --limit=8` |
| `npm run report:collection-candidates` | Find evidence-backed membership candidates and underrepresented routes | Read-only candidate report; uses similarity/collection rules and filters broad weak matches |
| `npm run report:entity-graph` | Typed graph coverage, weak/unlinked shows, role/type distribution, queues | Read-only graph report; no external lookups or writes |
| `npm run report:entity-candidates` | Convert legacy creator/network/credit evidence into reviewable entity/link leads | Read-only manual-review batches; supports `--include-linked`, `--all`, `--json`, `--csv` |
| `npm run report:provenance` | Source/provenance and record lineage checks | Read-only provenance report |
| `npm run validate:data` | Schema and catalog integrity validation | Read-only validation command; not run in this audit because the requested audit was inspection-only |
| `npm run catalog:enrich:discovery -- --list` | List enrichment queue | Write-capable tool family; listing/dry-run paths exist, but not invoked here |
| `npm run catalog:enrich:discovery -- --next` | Show the next enrichment candidate | Supports manual source-backed enrichment; `--write` is required for mutation |
| `npm run catalog:enrich:discovery -- --id <show-id>` | Inspect one show’s controlled discovery fields and gaps | Manual enrichment workflow; imported records are refused |
| `backend/scripts/entity-graph-report.js` | Underlying entity graph report | Direct script behind `report:entity-graph` |
| `backend/scripts/entity-enrichment-candidates.js` | Underlying entity candidate detector | Direct script behind `report:entity-candidates` |
| `tools/lib/catalog-artifacts.js` | Shared generation of shows, collections, search index, status, and related runtime artifacts | Prevents separate hand-built data paths |
| `/maintainer/imports.html` | Review imported catalog candidates and source evidence | Protected maintainer UI |
| `/maintainer/collections.html` | Review/run collection candidate and rule workflows | Protected maintainer UI |

The existence of `catalog:enrich:discovery` is important: the project has a controlled path for populating tone, best-for, tags, themes, content notes, discovery profile, and explicit similarity reasons. The current gap is coverage and public exposure, not absence of a workflow.

# 11. Current data coverage

## Catalog and editorial coverage

The current authored source contains 752 published shows and no drafts. The following source/runtime and report values are the most important snapshot:

| Area | Current value |
|---|---:|
| Published shows | 752 |
| Imported/factual-only shows | 517 |
| Indexed-only shows | 228 |
| Full-review shows | 7 |
| Collections | 46 |
| Collection membership edges | 620 |
| Unique shows in collections | 243 |
| Shows in no collection | 509 |
| Shows in two or more collections | 115 |
| Authored similar links | 234 |
| Shows with reasoned similarity | 71 |
| Public entities | 102 |
| Entity edges | 279 |
| Shows with typed entity links | 229 |
| Shows with no typed entity link | 523 |
| Shows with archive rating | 27 |
| Static popularity score coverage | 0 |

The collection membership distribution is skewed: 509 shows are in no collection, 128 are in one, 31 in two, and a smaller long tail is in three or more. This supports the discovery-quality report’s conclusion that collection reach is meaningful but not catalog-wide.

## Discovery-quality report

`npm run report:discovery-quality` divides the catalog into:

- 517 imported/factual-only records
- 235 enrichment-eligible records
- 7 editorial records

It reports:

- useful discovery facet coverage: 235 / 752 (31.3%)
- three or more useful discovery groups: 71 / 752 (9.4%)
- curated discovery profile: 0 / 752
- typed entity links: 229 / 752 (30.5%)
- collection membership: 243 / 752 (32.3%)
- archive ratings among eligible records: 27 / 235 (11.5%)
- 186 eligible candidates with an actionable gap
- 509 shows with no collection membership
- 523 shows with no typed entity relationship
- 164 / 235 eligible shows missing tone, best-for, or authored similarity coverage

The report identifies 76 unusually rich records and 24 unusually sparse records among the enrichment/editorial segment. Imported records are intentionally excluded from the sparse-enrichment queue because their factual-only state is policy-driven.

## Similarity coverage

The similarity report sees enough core factual metadata to compare nearly the entire catalog, but the distribution is not evenly strategic:

- genre and episode/runtime signals are nearly complete
- format is nearly complete
- release/completion, collections, entities, tones, themes, tags, and best-for are partial
- the new `discovery` profile is empty
- candidate counts are very high, while most scores are near the minimum gate

This means Echo can currently produce broad candidate neighborhoods, but the audio-fiction-specific explanation quality will improve sharply only as discovery and entity fields are populated.

## Local operational snapshot

The immutable `backend/data/community.sqlite` inspection found:

- `podcasts`: 752
- `podcasts_with_pages`: 752
- `community_profiles`: 1
- active rating submissions: 0
- rating events: 20
- published listener reviews: 0
- listener-review helpful votes: 0
- show submissions: 0
- collection candidates: 26 (14 approved, 12 proposed)
- collection events: 70
- catalog import candidates: 1,985, including a mixed set of failed, needs-review, published, ready, approved, proposed, duplicate, and rejected records

These are local database state counts, not hosted-activity counts. They do show that the operational schema has more workflow state than the current public interaction corpus suggests.

# 12. Architecture

The relevant data path is:

```text
catalog-src/ + entities.json + collections/
        |
        v
backend/lib/catalog.js + catalog-integrity.js + archive-record normalization
        |
        +--> tools/build-catalog.js
        |       |
        |       +--> data/shows.json
        |       +--> data/collections.json
        |       +--> data/entities.json
        |       +--> data/search-index.json
        |       +--> data/catalog-status.json and supporting artifacts
        |
        +--> backend runtime loaders
                |
                +--> server-rendered show/collection/entity pages
                +--> JSON data routes
                +--> community/review/submission APIs

data/search-index.json + shared/archive-search.js
        |
        +--> homepage query/filter/search presentation
        +--> entity result panel
        +--> Archivist query context

data/collections.json + shared/app/pages/collections.js
        |
        +--> collection directory/detail pages
        +--> collection membership/reasons
        +--> collection-related similarity evidence

catalog entities + entityLinks + shared/archive-entities.js
        |
        +--> show facts / More from
        +--> public organization directory and entity pages
        +--> entity graph/candidate reports

shows + collections + entities + shared/archive-similarity.js
        |
        +--> dynamic compare/getSimilarShows/reporting
        +--> authored similarTo and similarity-collection public routes
```

Important shared modules to reuse rather than duplicate:

- `shared/archive-record.js`: normalization and record-shape rules.
- `shared/archive-search.js`: normalization, aliases, structured clauses, fuzzy scoring, and result presentation support.
- `shared/archive-similarity.js`: all dimension definitions, gates, coverage, scoring, and reasons.
- `shared/archive-entities.js`: public entity visibility, typed roles, entity matching, More From selection, and page links.
- `backend/lib/catalog.js` and `backend/lib/catalog-integrity.js`: source/runtime loading and validation.
- `tools/lib/catalog-artifacts.js`: generated artifact assembly.
- `shared/app/pages/home/`: URL-persisted discovery state, filters, result loading, popular/recent sections, and entity results.
- `shared/app/render-show/`: show-page discovery metadata, ratings, collections, entity facts, and relationships.
- `backend/lib/services/community-service.js`, `published-listener-review-service.js`, and `submission-service.js`: existing public signal/moderation APIs.

The operational SQLite database is intentionally separate from the static catalog. Ratings, review publication, moderation, collection candidates, imports, and abuse/retention state do not belong in generated catalog JSON.

# 13. Competitive capability assessment

## Already strong

1. **Audio-fiction-native discovery vocabulary.** Echo has controlled tone, listening-context, format, completion, transcript, intensity, and thematic concepts rather than relying only on genre and title.

2. **Intent-led editorial routes.** The 46 collection routes include long walks, headphones, late night, serious sci-fi, warm weird, cold horror, easy entry, finished arcs, and similar-show paths. This is a better discovery model for audio fiction than a flat directory taxonomy.

3. **Explainable similarity foundation.** The similarity engine has explicit dimensions, gates, coverage profiles, frequency weighting, anchor requirements, sparse behavior, and reason objects. It does not blindly conflate ratings or prose with factual similarity.

4. **Separation of editorial, listener, and community perspectives.** Archive Rating, Listener Review Score, Community Rating, archive review content, and creator verification are visually and logically separated. Creator verification does not imply approval of ratings or reviews.

5. **Compact discovery-to-listening show pages.** A user can see why a show may fit, how long it is, what format it uses, where to listen, its status, transcripts, reviews, collections, similar routes, and entity connections without leaving the page.

6. **Typed creator/entity graph with intentional visibility rules.** The system models people, companies, studios, and networks; supports role-aware links; provides organization-first directory behavior; and avoids creating public pages from raw unresolved creator strings.

7. **Source-backed editorial integrity model.** Imported records are visibly distinct from reviewed records; similarity reasons and collection reasons are explicit; catalog validation checks references and completeness; and operational candidate/audit state is separated from public snapshot data.

8. **Search quality beyond title matching.** Alias expansion, structured discovery phrases, fuzzy/prefix matching, creator/entity fields, transcript/content-note fields, completion/review status, and direct “shows like X” syntax are all implemented locally.

9. **Moderated community contribution loop.** Show submissions, correction requests, listener reviews, creator verification, helpful votes, rating abuse controls, and public-only publication are already represented in coherent services/routes/UI.

10. **Catalog/discovery reporting infrastructure.** There are dedicated reports for catalog integrity, discovery quality, similarity, collection candidates, entity graph coverage, and entity enrichment candidates. This gives future work a measurable base and helps avoid speculative catalog expansion.

## Exists but is underused

| Capability | Why listeners currently benefit little |
|---|---|
| Dynamic similarity engine | It compares 752 shows and produces reasons, but public show pages use authored `similarTo` and collections rather than dynamic candidates |
| Entity graph | 102 entities and candidate tooling exist, but 523 shows lack typed links and only 229 shows expose graph relationships |
| Collection candidate generation | 4,450 evidence-backed candidate edges are reportable, but candidate review is maintainer-facing and not a listener discovery surface |
| Archivist | Archive-grounded query analysis, constraints, exclusions, page context, recommendations, and fallback answers exist, but `ARCHIVIST_ENABLED` defaults to false and the AI path depends on local Ollama configuration |
| Discovery enrichment workflow | `catalog:enrich:discovery` and quality reports can prioritize source-backed enrichment, but tone/best-for/tags/themes are still sparse and the discovery profile is empty |
| Listener-review categories | The schema and public UI can collect voice acting, sound design, story, characters, ads, and length, but the local public review corpus is empty |
| Popularity ranking | Runtime community ranking exists with fallback behavior, but static popularity is empty and there is no hidden-gem or quality-adjusted long-tail mechanism |
| Similarity explanations | Reason objects are detailed internally, but the public UI does not yet explain dynamically why a candidate is recommended |

## Partially implemented

- **Catalog-wide discovery profile:** the schema, normalization, search-index flattening, similarity dimensions, and enrichment queue exist, but zero shows currently populate `discovery.voiceStyle`, `narrativeFocus`, `intensity`, or `commitment`.
- **Creator discovery:** public directories, entity pages, role-aware links, and reports exist, but coverage is only 30.5% of shows and the graph does not yet include typed cast/authoring/performance roles.
- **Community signal loop:** anonymous ratings and moderated listener reviews are operationally implemented, but there is no local public activity corpus to drive discovery ranking and no explicit recommendation-feedback event.
- **Collection automation:** rule-based infrastructure, candidate records, overrides, and audit events exist; the current public snapshot has rule-based collections but no authored semantic collection and no automatic listener-facing “generated route” behavior.
- **Popularity/discovery ranking:** recent and popular rails exist, but popularity scores are unpopulated and no hidden-gem/rising/quality-adjusted rank exists.
- **Archivist:** query understanding and recommendation safeguards are substantial, but public availability, model-provider readiness, and outcome feedback are not established by repository defaults.
- **Discovery measurement:** optional pageview/provider hooks exist, but custom search-to-listen measurement does not.

## Genuine gaps

These are capabilities that were not found as implemented public product systems, even though some have adjacent foundations:

1. **Durable listener personalization.** There is no account-backed or durable anonymous profile that remembers favorites, history, exclusions, completed shows, listening progress, or recommendation feedback across sessions.

2. **Unified cross-archive autocomplete/search.** Show search, collection search, and entity matching are separate systems. There is no public suggestion experience that unifies shows, creators, collections, genres, tones, and intents as the user types.

3. **Discovery funnel measurement.** Echo cannot currently measure query success, filter usefulness, collection-to-show progression, creator navigation, show-to-listen clicks, or recommendation acceptance through repository-owned events.

4. **A full contributor/performance entity graph.** Typed creator/company/studio/network links exist, but cast is sparse free text and there are no public typed writer, director, actor, voice-performer, composer, character, or role-based audio-fiction connections.

5. **Hidden-gem and long-tail discovery ranking.** The product has a popular rail and community-rating infrastructure, but it has no public mechanism for surfacing under-discovered shows by combining quality, fit, coverage, freshness, and low exposure. “Popular” and “not yet widely discovered” are not modeled as distinct discovery goals.

The sparse tone/best-for/status/discovery-profile coverage is classified as a partial implementation rather than a total gap: the schema, filters, search aliases, similarity dimensions, enrichment CLI, and quality reports already exist.

# 14. Best next opportunities

The following opportunities are ranked by strategic value and reuse of existing Echo infrastructure. They are recommendations only; none is implemented by this audit.

## 1. Expose explainable dynamic similarity on show pages and “shows like” search

**Why:** This is the clearest way to turn Echo’s internal advantage into a public product capability. A visitor should be able to see a small set of candidates with reasons such as shared voice/format, similar episode length, shared listening context, common entity, and shared collection, with coverage-aware wording.

**Build upon:** `shared/archive-similarity.js`, `getSimilarShows`, `metadataCoverage`, dimension reasons, the 17 similarity collections, authored `similarTo`/`similarReasons`, `shared/app/render-show/relationships.js`, and the existing `shows like X` search syntax.

**Guardrail:** Keep authored editorial relationships visually distinct from computed candidates. Do not expose low-score genre/format neighbors as equivalent to curated recommendations.

## 2. Convert entity candidate queues into a richer creator/company discovery network

**Why:** Creator/company/network exploration is difficult for generic podcast directories to replicate if it is source-backed and role-aware. Linking the existing 523 unlinked shows would dramatically improve “More from,” creator pages, and similarity anchors.

**Build upon:** `catalog-src/entities.json`, typed `entityLinks`, `shared/archive-entities.js`, public organization/entity renderers, `report:entity-graph`, `report:entity-candidates`, creator correction submissions, and the existing `More from` selector.

**Guardrail:** Preserve the current rule that raw creator strings do not become public entity pages or speculative relationships. Require source-backed role verification.

## 3. Launch a coverage-aware “find your listening fit” discovery layer

**Why:** Echo already has the concepts users actually need—tone, best-for context, format, completion, runtime, transcripts, and review coverage—but many are buried in filters and sparse data. A guided route could ask for intent/commitment and produce a compact result set while gracefully falling back to factual filters for less-enriched shows.

**Build upon:** homepage URL state and filter groups, `archive-search.js` aliases/structured clauses, `bestFor`, tone/format/status fields, collection intent tags, runtime/episode-length data, and empty-state recovery actions.

**Guardrail:** Make data confidence visible. Do not infer an audio-fiction mood or performance style from a generic genre alone.

## 4. Use the existing enrichment and candidate reports as a catalog compounding loop

**Why:** The strongest strategic metadata is currently concentrated in 235 enrichment-eligible shows. Completing tone, best-for, themes, tags, release/completion states, discovery profile fields, similarity reasons, and entity links would improve search, collections, similarity, and future Archivist answers simultaneously.

**Build upon:** `catalog:enrich:discovery`, `report:discovery-quality`, `report:collection-candidates`, `report:similarity`, `report:entity-candidates`, schema-controlled fields, source/provenance rules, and maintainer review UIs.

**Guardrail:** Keep imported/factual-only records distinct from editorial enrichment; use source-backed unknowns rather than filling every field for completeness’s sake.

## 5. Add privacy-respecting discovery event measurement

**Why:** Without search, collection, creator, show-open, and listen-click outcomes, Echo cannot know which of its differentiated routes work. Measurement would allow ranking and curation to be tuned from actual behavior instead of intuition.

**Build upon:** the existing optional Plausible injection, page manifest, privacy/cookie copy, backend request observability, homepage/search/collection/entity/show modules, and current community/submission services.

**Guardrail:** Use a small documented event vocabulary, avoid ad-tech profiling, and distinguish pageviews from product events. Do not claim production analytics based only on repository configuration.

## 6. Give Ask the Archivist a controlled public launch path

**Why:** The Archivist already understands archive-specific constraints, negative preferences, show detail questions, collection context, and recommendation repetition. It is a natural interface for the long tail of nuanced audio-fiction taste.

**Build upon:** `archive-context.js`, `chat-query.js`, `chat-intents.js`, `site-help.js`, `scoreCatalog`, similarity/reporting data, page context, and the session-history UI.

**Guardrail:** Keep recommendations catalog-grounded, show source/factual uncertainty, preserve fallback answers when Ollama is unavailable, and add recommendation outcome signals before treating it as a learning system.

## 7. Create a hidden-gem route separate from popularity

**Why:** Echo’s mission is discovery, not just ranking the already-known shows. A “quietly excellent,” “under-discovered,” or “archive sleeper” route could combine editorial quality, fit to intent, catalog coverage, low exposure, and freshness without pretending that low activity means quality.

**Build upon:** archive ratings/review status, community rating summaries, collection coverage, similarity metadata coverage, recently-added logic, and the eventual event vocabulary.

**Guardrail:** Do not invent popularity or user counts. Start with an explicitly labeled heuristic and explain the evidence used.

# Initial assumptions corrected during inspection

Several plausible assumptions were wrong or too broad after checking the implementation:

- **“The current creator count is the documented 101/278 snapshot.”** The current authored checkout reports 102 public entities, 279 typed edges, and 229 linked shows. Older QA/memory snapshots are stale relative to this checkout and were not used as final counts.
- **“Shows like X already means dynamic similarity.”** It does not. The public parser resolves direct authored `similarTo` relationships; the dynamic similarity engine is a separate internal/reporting capability.
- **“The similarity engine must already power the show-page related section.”** It does not. Public `Try next` cards come from authored links with reasons, while computed candidates remain internal.
- **“The popular rail is a hidden-gem/popularity model.”** It is a four-card runtime rail using community summaries when available, then catalog popularity/fallback IDs. Static popularity coverage is zero, and hidden-gem ranking is absent.
- **“The site has a complete discovery profile because the schema supports it.”** The schema and scorer support voice style, narrative focus, discovery intensity, and commitment, but zero shows currently populate the `discovery` profile.
- **“Creator pages are a directory of every person and creator string.”** The public directory is intentionally organization-led. `directory:false` people can remain on show/detail surfaces without being promoted into organization grids, and raw strings do not create public pages.
- **“Plausible analytics is active because the page manifest enables analytics.”** The build injects the script only when `PLAUSIBLE_DOMAIN` is configured. The repository default has no configured domain, and no custom discovery events were found.
- **“Community ratings/reviews are already providing a populated recommendation signal.”** The services and UI exist, but the local operational snapshot has zero active rating submissions, zero published listener reviews, and zero helpful votes.
- **“There must be a random discovery control somewhere.”** No random, shuffle, surprise-me, or random-collection mechanism was found in the public discovery implementation.
- **“Collections are only manually authored.”** The public snapshot is authored, but the repository also has rule-based automation definitions, candidate records, audit events, overrides, and maintainer tools. No current authored semantic collection was found.

## Bottom line

Echo already possesses the ingredients of an unusually good audio-fiction discovery product: an archive-specific vocabulary, intent routes, explainable similarity, typed entities, compact show decision pages, moderated community signals, and unusually strong internal reporting. The next strategic move is not to add another generic directory feature. It is to expose and compound what is already there while filling the coverage gaps honestly: dynamic explanations, verified creator connections, intent/profile enrichment, privacy-respecting measurement, and eventually durable listener taste.
