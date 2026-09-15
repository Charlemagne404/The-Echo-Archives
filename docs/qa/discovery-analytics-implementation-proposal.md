# Privacy-respecting discovery analytics implementation proposal

**Status:** Superseded on 2026-09-15 by the implemented first-party collector and maintainer dashboard. Retained as a historical design record; use [`docs/ANALYTICS.md`](../ANALYTICS.md) for the current event contract, storage, privacy, and operational behavior.

**Scope:** Public discovery behavior in The Echo Archives. This proposal does not cover advertising, marketing attribution, cross-site tracking, user profiling, audio playback telemetry, or maintainer operations.

## Executive recommendation

Echo should add a small client-side Plausible wrapper and seven controlled events:

1. `Search Used`
2. `Filter Changed`
3. `Filters Cleared`
4. `Collection Opened`
5. `Entity Opened`
6. `Show Opened`
7. `Listen Link Opened`

`Show Opened` should carry a controlled `recommendation_source` property. That makes it the recommendation click event as well as the general show-discovery event, so an individual click is not counted twice as both `Recommendation Opened` and `Show Opened`.

Do not add recommendation impressions, contribution events, a server-side analytics endpoint, an Echo-owned visitor/session identifier, redirect URLs, or raw search-query telemetry in v1.

The proposed funnel is:

```text
search / filter / collection / entity / recommendation interaction
                         |
                         v
                    Show Opened
                         |
                         v
                 Listen Link Opened
```

The events are aggregate signals, not a user history. Plausible may provide provider-side session/funnel reporting, but Echo should not create an account ID, device ID, fingerprint, analytics cookie, or database join to force user-level attribution.

The most important precondition is query redaction. Echo's search state is written into `?q=` by the existing URL-state code. Custom properties must never contain that value, and the effective Plausible configuration must be verified to remove all query parameters from the URL sent for pageviews and custom events. The current checkout does not contain an explicit URL-sanitizing Plausible configuration, and production provider behavior cannot be inferred from the repository.

## Evidence and boundary of this review

This proposal is based on the current checkout, including the current working-tree implementation. At inspection time, `main` tracked `origin/main` but had many pre-existing modified generated/source files and an unrelated untracked `docs/qa/echo-current-capability-audit.md`. Those changes were preserved and not used as an authorization to edit anything else.

The current source-data snapshot contains 752 published shows and 46 collections: 20 `curated`, 9 `rule-based`, and 17 `similarity`. It also contains authored `similarTo` links and resolved public entities. These counts are useful for sizing, but they are not production traffic or production analytics evidence.

Relevant implementation evidence:

* [Build-time Plausible injection](../../tools/build-pages.js#L343-L355) reads `PLAUSIBLE_DOMAIN` and an optional `PLAUSIBLE_SCRIPT_SRC`.
* [Page eligibility](../../site-src/page-manifest.json#L1-L217) enables analytics on the public home, collection, show, entity, information, and submit pages when the domain is configured; offline and maintainer pages are excluded.
* [The frontend bootstrap](../../shared/app/app.js#L1-L88) initializes page modules but currently has no analytics helper or provider-active state.
* [Home result rendering](../../shared/app/pages/home/results.js#L176-L230) already knows the local result count, active browse descriptors, query state, and visible show cards.
* [The search engine](../../shared/archive-search.js#L393-L458) recognizes `shows like ...` patterns locally, and [structured clauses](../../shared/archive-search.js#L745-L781) are derived from controlled archive vocabulary.
* [Show-page relationships](../../shared/app/render-show/relationships.js#L30-L115) currently distinguish authored/curated relationships from computed similarity matches.
* [Direct listening links](../../shared/app/render-show/hero.js#L15-L23) and [facts links](../../shared/app/render-show/facts.js#L142-L162) use controlled provider keys and direct external anchors.

No current repository search found a custom discovery-event implementation, `trackDiscoveryEvent`-style wrapper, or repository-owned event sink.

## 1. Current analytics architecture

### What exists in the repository

The current analytics capability is a build-time external script tag:

```text
backend/.env, if present
        |
        v
tools/build-pages.js
        |
        +-- PLAUSIBLE_DOMAIN is empty -> no tag
        |
        +-- includeAnalytics=false -> no tag
        |
        v
<script defer data-domain="..." src="..."></script>
```

`tools/build-pages.js` loads `backend/.env` with `process.loadEnvFile` when that file exists. `PLAUSIBLE_DOMAIN` is required for injection. `PLAUSIBLE_SCRIPT_SRC` can override the default `https://plausible.io/js/script.js`; an empty override suppresses the tag. The tag is inserted through `site-src/partials/head.html` using the `analyticsScript` template value.

The root [backend README](../../backend/README.md#L75-L76) documents both variables. The [environment example](../../.env.example#L44-L45) leaves both empty. The deployment policy says staging must keep both empty and production should supply them only when production analytics are intentionally enabled ([environment matrix](../../deploy/ENVIRONMENT.md#L43-L64), [validator](../../deploy/validate-env.js#L88-L93)).

### Repository defaults versus capability versus production facts

| Question | Repository capability | Repository default/current evidence | What cannot be proven from checkout |
| --- | --- | --- | --- |
| Can Plausible be injected? | Yes, during `npm run build:pages`. | The current generated checkout has no `data-domain`/Plausible tag because no `backend/.env` was present during inspection. | Whether a production build was made with `PLAUSIBLE_DOMAIN`. |
| Which pages can receive it? | Any manifest entry with `includeAnalytics` not set to `false`. | Public discovery pages are eligible; offline and maintainer pages are not. 404/500 are technically eligible even though they are `noindex`. | The exact deployed manifest/build output. |
| Are custom events implemented? | The external Plausible script could receive them. | No repository-owned event calls or helper exist. | Whether an edge/proxy injects events outside this repository. |
| Does the frontend know analytics is active? | It could feature-detect a provider function. | No runtime flag, `data-*` flag, or provider check is currently exposed to page modules. | Whether a browser can reach Plausible in production. |
| Is Plausible active in production? | The deployment configuration permits intentional activation. | Not established. | Production environment, deployed HTML, CSP, provider dashboard, and network traces. |

The public app bundle is loaded as a module after the shared archive scripts. The helper can therefore be imported from the app bundle and can safely no-op if `window.plausible` is absent. It should not assume that a script tag being present means that the provider is reachable.

### CSP and security implications

The backend currently sets `script-src` and `connect-src` to permit `https://plausible.io`, in addition to self and Cloudflare Turnstile ([security headers](../../backend/server.js#L175-L197)). The default Plausible script and its normal event endpoint are therefore compatible with the current policy.

The override is not unrestricted in practice: a `PLAUSIBLE_SCRIPT_SRC` on another host would need matching `script-src` and `connect-src` allowances. A future self-hosted/proxied deployment must specify the exact script and event endpoint and update CSP intentionally. Do not broaden CSP to arbitrary hosts. A custom helper should make no inline network request and should not bypass CSP.

Before enabling analytics, the provider integration should also be tested with a real browser network capture. Plausible documents a JavaScript custom-event call of the form `plausible('Event', { props: {...} })` and scalar custom properties ([custom events](https://plausible.io/docs/custom-event-goals), [custom properties](https://plausible.io/docs/custom-props/for-custom-events)). Echo should use that public API rather than sending directly to the Events API or recreating visitor recognition.

### URL/query privacy precondition

`shared/app/pages/home/url-state.js` writes the search query to `q`, and the home page also uses the query in visible result-summary copy. The query is needed for shareable navigation, but it is not needed for analytics.

Plausible's current documentation says its normal reporting strips most query parameters by default, while also documenting that event URLs are derived from the browser URL and that a `transformRequest` option can replace the URL. The current Echo checkout contains no explicit `transformRequest`, manual-pageview, or query-redaction configuration. Therefore:

1. Do not send `q` as an event property.
2. Do not send the current URL, referrer, document title, or result-summary text as a custom property.
3. Before production activation, use an explicit provider configuration that overwrites the event URL to `origin + pathname` with no search or hash, including pageviews. If the provider's standard configuration is relied upon instead, verify the actual payload and provider version first.
4. Do not allow UTM or other attribution parameters to reintroduce free-form query data for Echo's discovery events. If campaign attribution is ever desired, it needs a separate privacy review.

This is a small build/integration concern, not a backend product-analytics requirement. It is a rollout gate because “the custom event omitted the query” is not enough to prove that the provider never received it through the page URL.

### Backend request observability is not product analytics

When enabled, [access observability](../../backend/lib/access-observability.js#L1-L72) emits `http_request` records containing a request ID, method, route template, status, duration, and a weekly rotating HMAC-derived client pseudonym. It intentionally excludes raw IP, headers, bodies, and query strings. It is disabled by default and is wired through `ACCESS_LOG_ENABLED` in [server setup](../../backend/server.js#L501-L513).

That system should remain operational telemetry. It cannot observe a local filter toggle, a client-side search result state, a card's recommendation source, or a browser's direct click to Spotify/Apple/RSS. Reusing it for product analytics would also mix different purposes, retention rules, access controls, and pseudonym semantics. Product events should go through the optional provider only, with no new Echo database table or request route.

Community ratings and submissions are also separate systems. Rating writes use an anonymous/pseudonymous profile, a cookie/local profile, abuse hashes, and Turnstile; submission requests contain user-entered fields and operational metadata. None of those identifiers or payloads should be reused for discovery analytics.

## 2. Goals and non-goals

### Goals

The v1 model should answer, in aggregate:

* whether people use archive search and whether it returns results;
* which controlled filters are selected, removed, and associated with result/open behavior;
* whether collections and public entities are explored;
* which internal discovery surfaces lead to a show open;
* whether a show-page visit leads to an intent to open a listening provider;
* whether authored, computed, collection-based, or entity-based recommendation links are clicked;
* whether zero-result searches are followed by recovery actions.

### Non-goals

Do not use this system to:

* build a database of what individual people type or listen to;
* infer identity, age, interests outside Echo, or personal profiles;
* record audio playback, completion, or behavior on Spotify/Apple/official sites;
* track across sites or follow a person after they leave Echo;
* capture review text, submission text, email, verification evidence, IP addresses, user-agent strings, device IDs, or fingerprints;
* replace community/moderation records or backend operational logs;
* add automatic tracking to every button, hover, scroll, carousel movement, page impression, or animation.

## 3. Proposed controlled event vocabulary

### Final v1 event set

| Event | Purpose | Trigger | Likely implementation location | v1 status |
| --- | --- | --- | --- | --- |
| `Search Used` | Measure meaningful local search attempts, result availability, structured search use, and recovery from zero results. | After the existing live-search debounce settles a non-empty normalized query, or when a non-empty query is loaded from a deliberate internal navigation. Deduplicate the same query/filter state during one page lifecycle. | `shared/app/pages/home.js` / `shared/app/pages/home/results.js`, with safe query-shape output from `shared/archive-search.js`; analogous collection/entity directory modules only if those searches are included in v1. | Essential |
| `Filter Changed` | Show which controlled facets people add/remove and whether the resulting state has useful result volume. | After a real facet/intent/entity-type state change, not when the filter menu opens. | `shared/app/pages/home.js`, `shared/app/pages/home/filter-menu.js`, `shared/app/pages/collections.js`, and `shared/app/pages/entity-directory.js` as applicable. | Essential |
| `Filters Cleared` | Measure explicit recovery from over-constrained states and whether users abandon or reset filters. | Only when at least one filter/search state is active and a clear action actually changes it. | Home clear handlers and equivalent collection/entity clear/reset handlers. | Essential |
| `Collection Opened` | Measure which curated, rule-based, and similarity listening paths are explored. | On an internal click to a published collection route. | Common link handler plus `shared/app/render-collections.js`, `shared/app/render-show/relationships.js`, server-rendered collection/entity/show renderers. | Essential |
| `Entity Opened` | Measure whether creator, studio, network, or person pages are used as discovery routes. | On an internal click to a public `/creators/:id` route. | Common link handler plus entity result/card renderers and show/entity page renderers. | Essential |
| `Show Opened` | Count internal show opens and identify the discovery source, including recommendation clicks without a second event. | On an internal click to a published show route. | Common link handler, with explicit source metadata added to client/server card renderers. | Essential |
| `Listen Link Opened` | Measure an intent to leave Echo for a listening provider. | On a direct external listen-link click from the show hero or facts/links section. | Common outbound-link handler plus `shared/app/render-show/hero.js`, `shared/app/render-show/facts.js`, and server-rendered equivalents. | Essential |

`Recommendation Opened` is intentionally not a separate v1 event. A recommendation is successful when its target show is opened; `Show Opened` has a `recommendation_source` property. This avoids double-counting and keeps one show-open denominator.

`Recommendation Shown` is not a v1 event. DOM rendering is not proof that a person saw a card, and Echo has carousels, lazy images, hidden membership routes, and cloned carousel cards. A later impression event needs an explicit visibility definition and a browser test before it is useful.

### Strict property contract

Plausible custom properties should be scalar values only. Echo should send no more than the following small allowlist per event. Values not in the enumerations below should be rejected or mapped to `unknown`; arbitrary strings should fail closed.

#### `Search Used`

Allowed keys:

* `discovery_surface`: `home_archive`, `collections_directory`, or `entity_directory`.
* `query_kind`: `text`, `shows_like_resolved`, or `shows_like_unresolved`.
* `structured_clause_group`: `none`, `genre`, `format`, `completion`, `review`, `best_for`, `transcript`, or `multiple`.
* `result_count_bucket`: `0`, `1`, `2-4`, `5-9`, `10-24`, or `25+`.
* `active_filter_count_bucket`: `0`, `1`, `2-3`, or `4+`.
* `recovery_context`: `none`, `after_zero_results`, or `unknown`.

`query_kind` is derived locally. The existing parser recognizes `shows like ...`/similar forms and resolves a matching catalog show without needing a server request. `structured_clause_group` is a coarse summary of the existing controlled clauses, not a copy of the query. Do not send the raw query, normalized query, tokens, matched title, seed title, seed show ID, free-form result explanation, or URL.

For v1, `Search Used` should focus on the home archive search, where show result counts are meaningful. Collection-directory and entity-directory searches can use the same event only if their result-count semantics are explicitly mapped; otherwise defer them rather than mixing collection/entity counts with show counts.

#### `Filter Changed`

Allowed keys:

* `discovery_surface`: `home_archive`, `collections_directory`, or `entity_directory`.
* `filter_group`: `genres`, `tones`, `formats`, `bestFor`, `completionStatus`, `reviewStatus`, `tags`, `intent`, or `entityType`.
* `filter_action`: `added` or `removed`.
* `filter_value`: a value from the visible, approved, controlled option list for that group. It must not come from arbitrary user text.
* `active_filter_count_bucket`: `0`, `1`, `2-3`, or `4+`.
* `result_count_bucket`: `0`, `1`, `2-4`, `5-9`, `10-24`, or `25+`.
* `recovery_context`: `none`, `after_zero_results`, or `unknown`.

Do not send filter labels copied from the DOM, the whole selected-filter array, tag-search input text, the page URL, or a raw search query. Sort changes are not `Filter Changed` events in v1; they are a separate presentation choice and can be reconsidered later.

#### `Filters Cleared`

Allowed keys:

* `discovery_surface`: `home_archive`, `collections_directory`, or `entity_directory`.
* `clear_scope`: `all` or `group`.
* `filter_group`: one of the `Filter Changed.filter_group` values, required only for `clear_scope=group`.
* `cleared_filter_count_bucket`: `1`, `2-3`, or `4+`.
* `had_search`: boolean.
* `result_count_bucket_before`: `0`, `1`, `2-4`, `5-9`, `10-24`, or `25+`.

Do not emit an event for a no-op clear. This event is the primary same-page signal for zero-result recovery: a clear after `result_count_bucket_before=0`, followed by a non-zero search or show open, is an aggregate recovery pattern.

#### `Collection Opened`

Allowed keys:

* `collection_id`: the published collection's controlled public ID; never a title or URL.
* `collection_kind`: `curated`, `rule-based`, or `similarity`.
* `discovery_surface`: `home_collection_rail`, `collections_featured`, `collections_directory`, `show_page_membership`, `entity_page_related`, `collection_page_related`, or `internal_navigation`.

Do not send the collection title, description, reason text, anchor-show title, current query, URL, referrer, or a user-entered collection search.

#### `Entity Opened`

Allowed keys:

* `entity_id`: the published resolved entity's controlled public ID.
* `entity_type`: `person`, `production-company`, `studio`, `network`, or `unknown`.
* `discovery_surface`: `home_entity_results`, `entity_directory_featured`, `entity_directory_card`, `show_page_credit`, `entity_page_related`, or `internal_navigation`.

Do not send raw creator strings, aliases, names copied from free-form data, contact information, evidence URLs, or query text. Unresolved creator names remain display-only in Echo and must never become analytics entity IDs.

#### `Show Opened`

Allowed keys:

* `show_id`: the published show’s controlled public ID.
* `discovery_surface`: `home_archive_grid`, `home_popular_rail`, `home_recent_rail`, `home_collection_rail`, `collection_page_grid`, `entity_page_grid`, `show_similar`, `show_more_from`, `collection_membership`, `internal_link`, or `unknown_internal`.
* `browse_state`: `default`, `search`, `filtered`, or `search_and_filtered`.
* `result_type`: `show_card`, `search_result`, `collection_member`, `entity_member`, `similar_show`, or `more_from`.
* `recommendation_source`: `none`, `authored_similarity`, `computed_similarity`, `similarity_collection`, `collection_membership`, `creator_more_from`, `homepage_collection`, or `unknown`.
* `result_position_bucket`: `1`, `2-4`, `5-9`, `10-24`, `25+`, or `unknown`.
* `content_profile`: `full_review`, `imported`, `indexed_only`, or `unknown`.
* `collection_id`: required only when the source is a known collection surface.
* `entity_id`: required only when the source is a known entity surface.

`collection_id` and `entity_id` are public catalog identifiers, not user identifiers. They should be sent only from validated source metadata. Do not send the show title, description, rating value, review count, current URL, referrer, search query, recommendation reason, exact position beyond the bucket, or source show title/ID. In v1, `recommendation_source` is enough to compare authored versus computed performance; do not add the source show ID.

The current show-page relationship renderer already exposes `curated` and `computed` groups. Map them to `authored_similarity` and `computed_similarity` in a controlled marker. Similarity collection cards map to `similarity_collection`; the current entity “More from” module maps to `creator_more_from`; regular collection membership maps to `collection_membership`.

#### `Listen Link Opened`

Allowed keys:

* `show_id`: the current published show’s controlled public ID.
* `provider`: `start`, `website`, `apple`, `spotify`, `rss`, or `other`.
* `link_role`: `primary` or `alternate`.
* `discovery_surface`: `show_page_hero` or `show_page_facts`.
* `content_profile`: `full_review`, `imported`, `indexed_only`, or `unknown`.

Provider must come from Echo’s controlled link key, not from parsing an arbitrary hostname. Unknown keys map to `other`. Do not send the external URL, hostname, path, tracking parameters, title, referrer, or any destination response.

### Common forbidden-property rules

The helper should reject, never silently serialize, any property named or shaped like:

`query`, `search`, `search_text`, `normalized_query`, `url`, `href`, `referrer`, `title`, `description`, `review`, `review_text`, `submission`, `submission_text`, `email`, `alias`, `creator_name`, `evidence`, `ip`, `user_agent`, `device_id`, `profile_id`, `voter_cookie`, `session_id`, `fingerprint`, or arbitrary nested objects/arrays.

The configured Plausible provider may process network metadata under its own service terms. Echo should not add another copy of IP, user-agent, device identity, or persistent identity to the event payload.

## 4. Discovery funnel model

Echo is primarily a client-side, public, link-based archive. Its meaningful journey is not a registration funnel. It is:

```text
Home search or filter
Home collection rail / collection directory
Home entity match / entity directory
Show-page collection or recommendation
             |
             v
        Show Opened
             |
             v
    Listen Link Opened
```

Search and filters can lead directly to a show card. Collections and entities are intermediate discovery surfaces. A show page can lead to another show through authored similarity, computed similarity, collection membership, or More from. A listening click is the strongest available product-level signal that a visitor decided to try the show elsewhere.

### Measuring the funnel without accounts

Use aggregate event sequences in the configured Plausible dashboard. Do not create an Echo session ID or copy the community profile ID into analytics. The provider may be able to build a privacy-respecting funnel from its own session model; that is provider behavior, not an Echo-owned identity contract.

Useful reports would be:

* `Search Used` by `query_kind`, `result_count_bucket`, and `structured_clause_group`.
* `Filter Changed` followed by `Show Opened`, grouped by `filter_group` and controlled `filter_value`.
* `Collection Opened` followed by `Show Opened`, grouped by `collection_id` and `collection_kind`.
* `Entity Opened` followed by `Show Opened`, grouped by `entity_type`.
* `Show Opened` followed by `Listen Link Opened`, grouped by `recommendation_source`, `discovery_surface`, and provider.

The headline “percentage of meaningful discovery interactions eventually leading to a listening action” should be defined as:

```text
sessions with a qualifying discovery event and a later Listen Link Opened
--------------------------------------------------------------------------
sessions with a qualifying discovery event
```

The result is an approximate provider-session funnel, not a verified person-level conversion rate. More defensible source-specific reporting is:

```text
Listen Link Opened events from show pages reached by a known source
-------------------------------------------------------------------
Show Opened events carrying that known source
```

That second form may require provider-side funnel support because Echo should not persist source context across pages. If the provider cannot associate the two events without an identifier, report the two aggregate counts separately and do not add a hidden tracking ID merely to improve attribution.

### What this cannot measure accurately

Privacy-preserving, best-effort client analytics cannot establish:

* that a page or card was actually seen rather than rendered;
* that an external provider successfully opened or played the show;
* how long someone listened or whether they finished;
* events from visitors who block scripts, leave before dispatch, or use an offline page;
* a complete path for direct page loads, browser back/forward behavior, or cross-device use;
* a unique-person conversion rate independent of Plausible’s own aggregate/session method;
* the exact query that caused a result or the exact reason a person abandoned it.

These limitations are acceptable for directional discovery improvement. They should be shown in the dashboard/runbook rather than hidden behind a falsely precise conversion metric.

## 5. Search measurement plan

### What the current implementation already provides

The home search is local. `createHomeSearchPerformanceCache` scores the in-memory published catalog, and `home/results.js` knows the full matching result count before rendering the visible slice. The search index includes title, creator/entity, genre, tone, format, discovery, review, and related fields. There is no search API, query log, or server-side search database.

The parser also handles similarity language. `resolveSeedShow` recognizes forms such as `shows like X`, and `prepareQuery` records a local seed record. `buildRequiredClauses` maps approved terms to fields such as genres, formats, completion status, review status, best-for, and transcript availability.

### Safe v1 design

For each settled non-empty search state, send only:

* which search surface was used;
* `text` versus `shows_like_resolved` versus `shows_like_unresolved`;
* a coarse structured-clause group;
* a result-count bucket;
* an active-filter-count bucket;
* whether the local page is recovering from a previous zero-result state.

The browser may use the raw input to search. It must not send the input, its normalized form, its tokens, a title extracted from it, or a stable seed ID to Plausible in v1. That means Echo can answer whether “shows like” searches generally resolve and lead to results, without constructing a media-interest database or exposing the exact show a visitor typed.

### Search event timing and duplicate prevention

The current home search is live and debounced at 150 ms. An implementation should add a slightly longer analytics settle window or use the existing result-render boundary, then:

* emit only for a non-empty normalized query;
* deduplicate the same normalized query plus filter-state signature in memory for the current page lifecycle;
* avoid emitting for every intermediate keystroke where the user is still typing, if a commit/settle signal is available;
* treat an initial non-empty `q` state as an event only when it came from a deliberate internal discovery link, or mark its origin `unknown` rather than pretending the query was typed;
* never emit for the tag-picker's local search input, unless it is later given its own intentionally scoped event;
* retain only the previous result-state category in memory (`zero`, `nonzero`, `unknown`), not the prior query.

The exact “settled” behavior should be tested against keyboard input, paste, browser back/forward, URL restoration, and the two synchronized home inputs.

### Zero-result recovery

`Search Used.result_count_bucket=0` identifies a zero-result attempt. `Filters Cleared.result_count_bucket_before=0` identifies an explicit clear from that state. A subsequent `Search Used` with a non-zero bucket, `Filter Changed` with a non-zero bucket, or `Show Opened` on the same provider session indicates recovery directionally.

Do not add a special “recovery success” event in v1. It would require maintaining more session state and would duplicate the meaning of the existing events. If the dashboard later needs a one-step recovery goal, define it as a provider-side funnel from zero-result `Search Used` to a later non-zero `Search Used` or `Show Opened`.

## 6. Recommendation measurement

### Current recommendation/discovery sources

The current checkout has the following relevant sources:

* authored `show.similarTo` relationships with editorial reasons;
* computed similarity matches from `shared/archive-similarity.js`, now surfaced in the show-page “Try next” renderer as a separate `computed` group;
* similarity collections and their `showReasons`/anchor-show routes;
* ordinary collection membership and membership reasons;
* creator/entity “More from”, selected from resolved typed entities with at least three other linked shows;
* homepage collection rails, popular and recently-added rails, and the default/search/filtered archive grid;
* search-driven `shows like X` behavior, classified locally by the search engine;
* Ask the Archivist, if enabled, which is currently a session-storage conversation feature and must not be treated as a general free-form analytics source without a separate design.

The public show renderer already exposes recommendation source markers for curated/authored and computed groups. Other renderers need explicit source metadata because DOM ancestry alone is brittle and would misclassify collection cards, entity cards, and carousel clones.

### v1 source mapping

| Product surface | `Show Opened.recommendation_source` |
| --- | --- |
| Authored `similarTo` / “Curated by the archive” | `authored_similarity` |
| Computed “Computed archive matches” | `computed_similarity` |
| Similarity collection show card | `similarity_collection` |
| Show opened from a collection membership route | `collection_membership` |
| Entity “More from” card | `creator_more_from` |
| Homepage collection rail card | `homepage_collection` |
| Popular/recent/default/search/filtered archive card | `none` (with `discovery_surface` and `browse_state`) |

Use public `collection_id` and `entity_id` only where the source is known. Do not send recommendation explanation text or a source-show identifier in v1.

### Why impressions wait

An impression event is useful only with a defensible denominator. Echo renders lazy cards, uses a collection carousel with cloned cards (`data-collection-clone`), renders hidden overflow routes, and may prerender server-side HTML before the app hydrates. Counting card creation would overstate exposure; counting viewport entry requires an IntersectionObserver policy, clone suppression, deduplication, and tests for responsive layouts.

Phase 2 may add:

* `Recommendation Shown`, only for a non-clone target card that meets a defined visibility threshold;
* `recommendation_source` and `placement` with a fixed allowlist;
* one impression per target/source/placement per page lifecycle;
* no title, reason text, query, or user ID.

Until then, report recommendation opens as click counts and do not call them click-through rates.

## 7. Outbound listening clicks

### Current implementation

Echo stores controlled `listenLinks` keys. The current public renderers prioritize `start`, `website`, `apple`, `spotify`, and `rss`. Hero and facts links are direct external anchors with `target="_blank"` and `rel="noreferrer"`; there is no repository-owned redirect or tracking URL.

### Recommendation

Track `Listen Link Opened` entirely in the browser, before the default navigation, using a controlled data marker such as provider key, link role, show ID, and show-page surface. Do not parse or transmit the destination URL.

Let the browser follow the direct link. A best-effort Plausible call may be lost when the provider is blocked or the browser leaves immediately; that is preferable to delaying or breaking a listening action. If a later browser test demonstrates unacceptable loss for same-tab links, a bounded provider callback may be considered, but it must preserve the default action with a strict timeout and must not introduce a redirect endpoint.

The event means “visitor expressed intent to try this provider”, not “visitor listened”. Provider values should be normalized from Echo’s own link-key enum; unknown values become `other`.

## 8. Plausible integration approach

### Proposed helper location and API

Add one small module at:

```text
shared/app/discovery-analytics.js
```

The helper should own event names, property allowlists, enum validation, scalar normalization, and the provider no-op boundary. It should not own page-specific discovery logic.

Proposed pseudocode, not production code:

```js
const DISCOVERY_EVENTS = new Set([
  "Search Used",
  "Filter Changed",
  "Filters Cleared",
  "Collection Opened",
  "Entity Opened",
  "Show Opened",
  "Listen Link Opened",
]);

export function trackDiscoveryEvent(name, props = {}) {
  if (!DISCOVERY_EVENTS.has(name)) return false;

  const safeProps = validateAndNormalizeDiscoveryProps(name, props);
  if (!safeProps) return false;

  if (typeof window === "undefined" || typeof window.plausible !== "function") {
    return false;
  }

  try {
    window.plausible(name, {
      props: safeProps,
      // The actual integration must provide a query-free event URL.
      url: `${window.location.origin}${window.location.pathname}`,
    });
    return true;
  } catch (_error) {
    return false;
  }
}
```

The `url` option above illustrates the privacy intent, not a final provider configuration. Automatic pageviews still need a query-redaction configuration; the helper alone cannot repair a pageview that was already emitted by the standard script. The implementation must verify the supported Plausible script API and network payload before rollout.

The helper should:

* no-op on analytics-disabled pages, missing `window.plausible`, blocked script, provider errors, invalid event names, or invalid properties;
* never log user input to the console;
* reject unknown keys and non-scalar values;
* keep event names in one constant map;
* keep allowlists in one place;
* use only public controlled catalog IDs and enumerations;
* avoid queues, localStorage, cookies, beacons to an Echo endpoint, or persistent IDs;
* be safe when a provider callback is unavailable.

### Caller pattern

Page modules should pass already-classified controlled values:

```js
trackDiscoveryEvent("Show Opened", {
  show_id: show.id,
  discovery_surface: "show_similar",
  browse_state: "default",
  result_type: "similar_show",
  recommendation_source: "computed_similarity",
  result_position_bucket: "2-4",
  content_profile: "full_review",
});
```

The common click layer should be delegated and source-marker driven. Renderers should add explicit, validated metadata to internal anchors rather than making the helper infer semantics from titles, CSS classes, text, or parent layout. The handler must ignore cloned carousel nodes and must stop after the nearest qualifying anchor so one click produces at most one event.

### Frontend versus build changes

The helper itself can be included in the existing module bundle without changing the manifest or adding a new provider. `site-src/partials/head.html` can remain the insertion point for the existing script.

However, the query-redacted automatic-pageview precondition may require a small change to the build-time Plausible snippet/configuration in `tools/build-pages.js`, or an approved external Plausible script configuration. That is a provider/privacy integration change, not a new analytics backend. It must also remain compatible with the nonce/CSP model and the current staging rule that keeps Plausible disabled.

## 9. Testing strategy

No tests were run for this read-only proposal. The future implementation should add focused unit and browser coverage without requiring a live Plausible account.

### Helper/unit tests

Test that:

* missing `window.plausible` is a no-op and returns without throwing;
* a provider function that throws does not affect the caller;
* an unknown event name is rejected;
* every allowed event/property combination validates;
* unknown keys, arrays, objects, URLs, emails, review text, submission text, raw queries, IPs, user agents, IDs, and free-form strings are rejected;
* enum values are mapped/rejected consistently, including unknown providers and entity types;
* public catalog IDs are accepted only from the validated caller data path;
* all outbound provider values map to `start`, `website`, `apple`, `spotify`, `rss`, or `other`;
* the helper never calls an Echo endpoint and does not write browser storage.

### Search/filter tests

Test that:

* a text search emits a bucketed `Search Used` event with no query property;
* resolved and unresolved `shows like` forms produce different `query_kind` values;
* structured clauses map to the controlled group enum;
* result counts use buckets and count full matches, not only the visible first page;
* identical settled states are deduplicated;
* synchronized home inputs do not emit duplicates;
* a filter toggle emits one `Filter Changed` event after the state changes;
* opening a filter menu, searching within the tag picker, or changing sort emits nothing in v1;
* a no-op clear emits nothing;
* a clear after zero results preserves `result_count_bucket_before=0` and supports a later recovery sequence;
* URL-restored state and browser back/forward do not create false typed-query events.

### Link/source tests

Test that:

* home grid, popular, recently-added, collection rail, collection page, entity page, authored similarity, computed similarity, collection membership, and More from links map to the intended source;
* server-rendered and client-rendered versions produce equivalent markers;
* cloned carousel cards do not emit duplicate events;
* one click produces one `Show Opened` event even when nested elements are clicked;
* entity IDs are emitted only for resolved public entities;
* collection IDs are emitted only for published collections;
* direct page loads do not pretend to have an internal source.

### Outbound/navigation tests

With a stubbed provider, verify that:

* hero primary and facts alternate links emit the correct provider and link role;
* the external URL never appears in the captured properties;
* the browser still opens/follows the original direct destination;
* missing/blocked Plausible does not delay or prevent navigation;
* keyboard activation, middle-click, modifier-click, and `target=_blank` behavior remain usable;
* a provider exception cannot break the show page.

### Browser smoke coverage

Extend the existing browser smoke style to cover analytics disabled, stubbed provider, home search, zero-result recovery, each discovery surface, direct show opens, and outbound links. Assert no console error or navigation regression. Do not make test success depend on the real Plausible network.

## 10. Documentation and privacy changes

Do not edit these documents as part of this proposal. If custom events are introduced, update their source versions before deployment:

### `site-src/pages/privacy.html`

Update the current statements that the reviewed build does not load Plausible. The updated wording should:

* distinguish the repository default/checkout from an intentionally enabled production configuration;
* state that optional Plausible analytics may receive aggregate discovery events only when enabled;
* list event categories and controlled properties: discovery surface, public catalog IDs, provider category, recommendation category, filter category/value, and result-count buckets;
* state that raw search text, review/submission text, email, creator evidence, Echo-owned persistent IDs, and audio-playback behavior are not sent;
* identify Plausible as the provider and link its current privacy/DPA/subprocessor/transfer information after production configuration is known;
* document the chosen legal basis and whether prior consent is required under the controller’s Swedish/EU privacy assessment. Do not assert that legitimate interest or consent exemption applies without counsel/provider review;
* describe provider-controlled retention without inventing a retention period from this checkout;
* state that Echo does not store a product-analytics database or use its community profile ID for analytics;
* document the query-redaction guarantee and its limits;
* retain the separate Cloudflare/RUM caveat, since edge injection and retention cannot be proven locally.

### `site-src/pages/cookies.html`

Update the storage/optional-measurement sections to explain whether the chosen Plausible configuration uses cookies or browser storage. Do not call the site “cookie-free” based only on the repository. If analytics is optional and consent-gated, document the preference mechanism, duration, and clearing behavior. If it is configured without cookies, say so only after verifying the provider configuration and still describe the provider request and event processing separately from first-party storage.

### Operational/deployment documentation

Update the relevant operations/runbook material to state:

* staging remains analytics-disabled;
* production activation is an explicit deployment decision;
* production HTML, CSP, and a browser network capture must be checked;
* query redaction is a release gate;
* event vocabulary and property allowlists are versioned and reviewed;
* provider dashboard access and retention are separate from backend request-observability access;
* any future self-hosted/proxied endpoint must update CSP and provider documentation.

Generated `privacy.html`, `privacy/index.html`, `cookies.html`, and `cookies/index.html` should only be regenerated through the normal page build after the source documents are updated. They should not be hand-edited.

## 11. Phased implementation plan

### Phase 0 — Privacy/provider preflight

**Work:** Confirm Plausible plan/features, custom-property handling, event retention, URL transformation support, provider terms/transfers, and the lawful-basis/consent decision. Decide whether public catalog IDs are acceptable to expose to the provider. Establish a dashboard naming convention and a deletion/retention owner.

**Likely files:** `tools/build-pages.js`, deployment documentation, `site-src/pages/privacy.html`, `site-src/pages/cookies.html`, and provider configuration owned by deployment. No event code is required to make the decision.

**Risk:** Highest privacy risk. The current checkout cannot prove production provider behavior. Do not enable custom events until the query-redaction and consent decisions are documented.

**New questions answered:** None yet; this phase makes the measurement legally and technically admissible.

### Phase 1 — Minimal discovery funnel

**Events:** `Search Used`, `Filter Changed`, `Filters Cleared`, `Collection Opened`, `Entity Opened`, `Show Opened`, `Listen Link Opened`.

**Likely files:**

* new `shared/app/discovery-analytics.js`;
* `shared/app/app.js` for one common delegated internal/outbound click layer;
* `shared/app/pages/home.js`, `shared/app/pages/home/results.js`, `shared/app/pages/home/filter-menu.js`, `shared/app/pages/home/filter-controls.js`, and `shared/app/pages/home/search-cache.js` for state/result timing;
* `shared/archive-search.js` for a safe local query-shape classifier, if needed, so analytics does not duplicate the existing parser;
* `shared/app/pages/collections.js` and `shared/app/pages/entity-directory.js` for local filter/search state;
* `shared/app/render-cards/preview.js`, `shared/app/render-cards/popular.js`, `shared/app/render-collections.js`, `shared/app/render-show/hero.js`, `shared/app/render-show/facts.js`, and `shared/app/render-show/relationships.js` for explicit source/provider markers;
* `backend/lib/show-page-render.js` and `backend/lib/entity-page-render.js` for equivalent server-rendered markers;
* focused unit/browser tests in the existing test structure.

**Implementation risk:** Low to medium. The main risks are duplicate events from synchronized controls/carousel clones, event loss during external navigation, and mismatched server/client source markers. No data migration or backend route is needed.

**Questions answered afterward:** Are people searching? Which searches have results? Which filters are used and associated with show opens? Do zero-result states recover? Which collections/entities lead to show opens? Which internal show opens lead to a provider click? Which provider links receive intent?

### Phase 2 — Recommendation comparison

**Work:** Keep recommendation clicks represented by `Show Opened`, then add `Recommendation Shown` only after defining actual visibility. Instrument authored `similarTo`, computed similarity, similarity collections, collection membership, More from, and any future dynamic recommendation rail with explicit source and placement metadata. Do not instrument candidate generation that is not actually rendered.

**Likely files:** `shared/app/render-show/relationships.js`, `backend/lib/show-page-render.js`, `shared/archive-similarity.js` only if the public exposure changes, `shared/app/render-cards/*`, `shared/app/render-collections.js`, and a small tested impression controller under `shared/app/`.

**Implementation risk:** Medium to high. Impressions can be inflated by prerendering, lazy rendering, hidden overflow, responsive changes, and carousel clones. Event volume and Plausible billing should be checked before enabling.

**Questions answered afterward:** What is the approximate click-through rate for authored versus computed recommendations? Which collection and entity recommendation placements earn attention rather than merely existing? Does a “shows like” route produce show opens at a useful rate?

### Phase 3 — Contribution/discovery quality

**Work:** Consider one post-success `Contribution Submitted` event with a controlled `contribution_type` (`show`, `correction`, `listener_review`, `rating`) rather than four separate product events. Alternatively keep contribution events entirely in the existing operational data if the product questions do not require provider analytics.

**Likely files:** `shared/app/pages/submit.js`, `shared/app/submit/api.js`, `shared/app/community/detail-widget.js`, and the helper allowlist/tests. The event must be emitted only after a successful response, never on form focus or failed validation.

**Privacy considerations:** Send only type and perhaps a coarse success state. Never send rating value, review text, submission text, email, alias, official link, evidence, community profile ID, voter cookie, IP, user agent, or submission ID. Because these actions involve user-entered content and pseudonymous identity, counsel and product-owner review should happen before any provider event.

**Implementation risk:** Medium. It is easy to confuse a product-funnel event with the actual moderation/retention record or to leak data through form serialization.

**Questions answered afterward:** Do show-page visitors contribute ratings/reviews? Which contribution modes are completed after discovery? Does contribution activity correlate with discovery source at an aggregate level? These should remain secondary to the discovery funnel.

## 12. Final recommended implementation

Implement the following only after Phase 0 approves provider, consent, and query-redaction behavior:

### Exact v1 event names

* `Search Used`
* `Filter Changed`
* `Filters Cleared`
* `Collection Opened`
* `Entity Opened`
* `Show Opened`
* `Listen Link Opened`

Recommendation clicks are `Show Opened` with `recommendation_source`; do not implement a separate `Recommendation Opened` in v1. Do not implement `Recommendation Shown`, `Rating Submitted`, `Review Submitted`, `Correction Submitted`, or `Show Submitted` yet.

### Exact implementation boundary

* Helper: new `shared/app/discovery-analytics.js`.
* Common dispatch: `shared/app/app.js`, using explicit source/provider markers and one-click deduplication.
* Search/filter state: `shared/app/pages/home.js`, `shared/app/pages/home/results.js`, `shared/app/pages/home/filter-menu.js`, `shared/app/pages/collections.js`, and `shared/app/pages/entity-directory.js`.
* Search classification: existing local logic in `shared/archive-search.js`, extended only with a safe categorical classifier if needed.
* Source markers: `shared/app/render-cards/preview.js`, `shared/app/render-cards/popular.js`, `shared/app/render-collections.js`, `shared/app/render-show/relationships.js`, `shared/app/render-show/hero.js`, `shared/app/render-show/facts.js`, `backend/lib/show-page-render.js`, and `backend/lib/entity-page-render.js`.
* Provider activation: retain existing build-time `PLAUSIBLE_DOMAIN` behavior. Add only the minimum provider URL-redaction configuration required by the approved Plausible setup; do not add a new Echo analytics endpoint or database.

### Search-query decision

Raw search queries should never leave the browser. Use the combined policy of option A plus a narrow, locally derived form of option B: send only `query_kind`, controlled structured-clause category, result-count bucket, active-filter bucket, and recovery context. Do not send a seed title or seed show ID in v1. This sacrifices exact query popularity and typo analysis, but it preserves the most important discovery questions without making user-entered media interests a provider-side query log.

### Backend decision

No backend product-analytics changes are necessary. Do not add an event table, API route, redirect service, server-side session ID, or reuse access observability. A small build-time/provider-snippet change may be needed for query-free pageview/event URLs and must be reviewed as an analytics integration/CSP change, not as a product backend.

### Approximate scope

One small helper, one shared click dispatcher, localized hooks in the existing home/collection/entity/show render paths, a local search-shape classifier, source/provider markers, focused tests, and synchronized privacy/deployment documentation. This is a small implementation measured in a handful of modules and tests, not a new analytics subsystem.

The success criterion is not event volume. It is whether Echo can make a defensible aggregate statement such as: “Among visitors who used a particular discovery route, a measurable share opened a show and expressed intent to listen elsewhere,” while still being unable to answer which person typed which query, what they wrote in a review, or what happened after they left Echo.
