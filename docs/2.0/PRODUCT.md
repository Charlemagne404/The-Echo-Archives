# The Echo Archives 2.0 — Product specification

**Status:** Discovery 2.0 rich-query routing and opt-in Personal Discovery are integrated into homepage search and existing show-page Try Next results. The browser-local Library controls remain compact, with no Library page or new navigation destination. Full release QA remains open.<br>
**Repository basis:** main at 55ca3969, reviewed 2026-09-28.
**Executable baseline:** [BASELINE.md](BASELINE.md).

## Product thesis

The Echo Archives 2.0 is a personal, privacy-first audio-drama discovery system that remembers what the listener explicitly cares about, understands richer discovery intent, and improves recommendations without requiring an account or creating an opaque behavioral profile.

It remains a curated, independent archive. The catalogue stays editorially governed; listener state belongs to that listener’s browser. Discovery combines explicit intent with the archive’s existing factual and editorial evidence.

## Listener problems

Echo already helps listeners find shows by title, genre, tone, format, completion, tags, listening context, collections, similarities, and creator relationships. It does not remember a listener’s own decisions across those surfaces. Its search and filters also make a listener translate a sentence into separate controls, even where the catalogue has enough structured evidence to combine them.

The 2.0 problems are therefore:

- A listener cannot maintain a private, durable record of shows they plan to hear, are listening to, finished, dropped, or do not want to see again.
- A listener cannot update that state from the existing browse cards and show-page action area. The state remains private and does not alter ordinary public results.
- Search intent such as “finished cinematic sci-fi around 10 hours” or “horror for a long walk” is harder to express than the current structured data warrants.
- Recommendations cannot use the listener’s explicit local choices, while a server-side profile or an unexplained behavioral model would violate Echo’s product direction.

The catalogue is not uniformly editorially enriched. Imported records deliberately remain factual-only; the September discovery and collection audits distinguish this coverage gap from a software defect. 2.0 must state when evidence is missing and must not fill that gap with guessed metadata.

## 1. Library

### State and meaning

An entry has one current status at a time:

| Status | Listener meaning | Discovery effect when personal discovery is on |
| --- | --- | --- |
| Saved | I may want to listen later. | A weak positive anchor when there is no explicit rating for that show. |
| Listening | I am listening now. | A weak positive anchor when there is no explicit rating; it is not a quality vote. |
| Finished | I consider this listen finished. | Not a taste signal. Suppressed only in the explicit “new to you” scope; current homepage search and Try Next do not use that scope. |
| Dropped | I stopped this listen. | Suppresses this exact show in recommendation scopes such as Try Next. It is not a negative signal unless a separate explicit 1–2 private rating supplies one. |
| Hidden | Do not surface this exact show in my personalized discovery results. | While Personal Discovery is enabled, suppress this exact show from broad search and relevant recommendation results. Exact-title search and the direct show route remain available. |

These effects are implemented behind the opt-in preference. Personal Discovery sees only a sanitized browser-local context and operates after ordinary query, filter, and similarity eligibility checks. Hidden never changes catalogue truth or blocks a direct route. When Personal Discovery is off or unavailable, ordinary results keep their public order and Hidden visibility. Statuses are explicit and reversible. Opening a show, clicking a listen link, or viewing a card never changes a status. A listener can remove an entry; removal also removes its private rating.

An optional private rating uses a clearly labeled integer 1–5 scale and exists only when the listener explicitly enters it for a Library entry. It is not an Archive Rating, Community Rating, review, submission, or creator-facing comment. Ratings 5 and 4 are positive anchors, 3 is neutral, and 2 and 1 are negative anchors. These internal adjustments are never displayed as a user score. No public or inferred rating may be substituted.

### UX

- Keep a tiny, keyboard- and touch-operable status control beside existing show cards. Show its current state without increasing card height or obscuring title and rating content. The card control offers state changes and removal, not private rating.
- Keep a compact Library disclosure inside the existing show-detail listening action area. It can change/remove state, set an optional private rating, and contains the small “Use my Library in discovery” checkbox with contextual help. It stays off by default.
- Do not create a dedicated Library page, another top-level navigation item, or a global settings surface. The opt-in sits in the existing detail disclosure rather than occupying a permanent homepage area.
- Use the Library service for all reads and writes. Make successful changes visible in other open Echo tabs through cross-tab notification. Be explicit when browser storage is unavailable.
- Do not add an activity feed, status-change history, recently-viewed history, or listening progress.
- Keep the public catalogue useful without JavaScript. Library controls and stored state require JavaScript; without it, existing Echo pages remain ordinary browse and show pages.

### Backup and transfer

The service retains export and validated import capabilities using the version-1 JSON document defined in [ARCHITECTURE.md](ARCHITECTURE.md). This release does not expose normal public import/export UI. Do not add a replacement page or global settings surface for it. A later compact contextual surface may be considered if it fits Echo’s existing structure. Recovery export remains a service capability and should be offered contextually only when a storage problem needs it.

The document contains stable show IDs, current statuses, explicitly entered private ratings, and an optional last-known title for an unresolved show. It contains no account, analytics identifiers, server response, full catalogue snapshot, or Personal Discovery opt-in. Exported private ratings and title labels are readable as ordinary text.

Import validates the entire document before writing. When exposed through an approved compact flow, it must preview entry counts, status counts, unknown catalogue IDs, same-ID conflicts, and invalid data. Merge preserves local-only records; each imported same-ID record replaces the complete local record. Replace makes the validated imported entries the complete Library entry set after explicit confirmation. Both modes preserve unknown IDs, do not remap by title or alias, leave the device-local opt-in unchanged, and commit all-or-nothing. Commit-time conflicts are recalculated so concurrent local-only entries survive Merge. A failed preview or commit changes nothing.

## 2. Discovery 2.0

Discovery 2.0 gives one typed interpretation to the existing search, filters, entities, collections, similarity, lifecycle, runtime, and “like X” routes. It is a deterministic query and retrieval layer, not a general-purpose chatbot.

Its initial versioned intent and public URL representation are frozen in [ARCHITECTURE.md](ARCHITECTURE.md) and decision [004](decisions/004-discovery-intent-and-url-state.md). The supported vocabulary stays tied to existing catalogue fields and reviewed benchmark cases; unsupported text remains visible as residual text.

Recognized rich queries use the deterministic 2.0 adapter over the existing search, similarity, entity, collection, filter, and runtime evidence. Exact-title, ordinary text, and bounded-typo searches keep the current fast scorer. The homepage keeps the existing search and filter controls, compact show cards, creator links, and collection routes. One restrained line in the existing results summary shows useful interpreted criteria, runtime qualifiers, ambiguity, or unsupported phrases; the page does not open a query builder. Hard requirements are never silently relaxed. Unknown metadata stays unknown.

Disambiguate catalogue lifecycle from personal listening state. “Finished shows” means the show’s published completion status when the phrase describes the catalogue item; “shows I’ve finished” requires private listening history. Public search returns a clear local-context note for that request, does not read Library state, and omits the private query text from the URL. Ambiguous wording remains visible for correction.

Examples:

- **“Finished cinematic sci-fi around 10 hours”** combines the existing completion, tone, genre, and runtime evidence. “Around 10 hours” ranks known runtime values by closeness and preserves observed/estimated qualifiers; it does not assert an exact duration. Records with unknown runtime may appear after known matches only if the result view labels that uncertainty. A chosen numeric runtime range is a strict constraint.
- **“Horror for a long walk”** combines genre with the existing best-for signal when a show has it. Missing best-for data is not proof that a show is unsuitable.
- **“Funny like Midnight Burger but less chaotic”** resolves the seed show, keeps the existing authored and computed similarity distinction, and applies a negative tone criterion only where “chaotic” is explicitly represented in catalogue evidence. Chaos has no current ordinal scale, so “less chaotic” cannot be presented as a measured degree. If the phrase cannot be represented safely, Echo says so and leaves it as text.
- **“Shows by the people behind The White Vault”** resolves explicit person/company/studio/network links and their typed roles. Shared-show co-occurrence is not an affiliation. Unresolved creator strings can remain searchable text, but must not create a new relationship or entity.

Exact title, alias, and identity matches remain stronger than incidental body-text or broad metadata matches. A known title phrase must not be reinterpreted as a genre constraint merely because its words overlap a taxonomy value.

### How current discovery surfaces evolve

| Existing surface | 2.0 behavior |
| --- | --- |
| Search and filters | Rich homepage queries use typed criteria; simple text/title/typo queries retain the existing scorer. Direct filters remain available and compose with recognized query constraints. The summary line reports interpreted criteria and unsupported phrases. |
| Collections | Keep authored listening paths and reasons intact. A recognized collection query links to its existing collection route; generated membership is not a second editorial source. |
| Show pages and Try Next | Preserve authored picks and their order. Personal Discovery may reorder only eligible computed fallback candidates and suppress exact Hidden or Dropped shows in this recommendation scope. |
| Shows Like | Rich homepage similarity searches keep the anchor, authored picks, and computed fallback in separate sections; only the computed fallback can receive a modest personal reorder. Creator/entity and collection membership remain editorial/public. |
| Creator surfaces | Rich homepage creator queries use stable entity IDs and explicit typed roles, then reuse the existing creator links and show cards. The creator directory keeps its current search behavior. |
| URL and browser history | Public rich-query criteria use allowlisted parameters through the existing homepage URL/history controller. Back/Forward restores the query, direct filters, results, and scroll. Personal Library records, settings, and local-only query text stay out of URLs. |
| Empty and sparse results | The existing empty-state panel explains strict no-match, private-context, clarification, and collection-route outcomes. The engine does not lower similarity thresholds or fabricate a match to avoid an empty state. |

## 3. Personal Discovery

Personal Discovery is a user-controlled preference on this device, defaulting off. Its checkbox sits inside the existing show-detail Library disclosure. The homepage uses only the sanitized context from the Library runtime; Discovery never reads IndexedDB. Personalization operates on already eligible candidates and uses the archive’s public similarity evidence. Search and Try Next can reorder candidates by at most three positions; authored similarity picks, collection membership, creator identity, hard requirements, exclusions, and sparse-evidence gates stay intact.

Saved and Listening are weak positive anchors only when the same entry has no explicit rating. An explicit rating takes precedence: 5/4 are positive, 3 is neutral, and 2/1 are negative. Finished is never a positive signal and is suppressed only in the “new to you” scope, which current surfaces do not use. Dropped suppresses only that exact show in recommendation scopes and is not generalized; a low explicit rating may independently act as a negative anchor. Hidden suppresses only the exact show while Personal Discovery is enabled. Direct-title search and direct show routes still find it. A Hidden, Finished, or Dropped state does not imply a preference about similar shows.

Reasons appear only when an eligible candidate actually moves. They identify the concrete shared catalogue dimensions and the anchor, for example “Shares tone (Funny, Weird) and discovery tags (Comedy) with King Falls AM, which you rated 5/5.” Internal weights and scores are never exposed. If the public similarity gate or evidence for a reason is missing, no personal reorder is made.

Turning Personal Discovery off preserves Library entries and ratings and restores the exact public order, section membership, Hidden visibility, and reasons. Clearing the final entry also restores that baseline across open tabs. The service reset operation removes entries and sets the local opt-in to off in one transaction.

## Privacy guarantees and user controls

- No account, cross-device sync, remote listener profile, or server library endpoint.
- Statuses, private ratings, and the local opt-in stay in IndexedDB. They are not sent in analytics events, chat prompts, submission forms, community-rating requests, API calls, access telemetry, or maintainer tools.
- No personal state is serialized into a URL, generated/static response HTML, generated catalogue data, sitemap, service-worker cache, or server database. The browser may render the owner’s state into the live UI on that device.
- Discovery receives only the sanitized context defined in [ARCHITECTURE.md](ARCHITECTURE.md); it receives no database objects, title snapshots, timestamps, or export metadata.
- Existing anonymous community ratings remain server-backed community responses. They are separate from the local five-star rating and may not be merged or presented as the listener’s private history.
- Existing controls provide per-entry state changes/removal and private rating on show pages. Management flows for pause, full clear, import, and export are intentionally not exposed in normal public UI. Clearing Echo Library data through the service does not clear the archive’s separate analytics token, community-rating identity, chat session, or browser-wide site data.
- Update the public Privacy and Cookies storage inventory and obtain the project’s normal legal review before release. Do not claim a consent or legal classification that has not been reviewed.

The existing first-party analytics collector intentionally does not store search text. 2.0 keeps that boundary and adds no Library status, rating, seed, or personalization events. There is no Library route to include or exclude from analytics.

## Degradation behavior

| Condition | Expected behavior |
| --- | --- |
| JavaScript unavailable | Existing generated public pages and routes remain readable and navigable. Library controls are unavailable; there is no separate Library shell. |
| IndexedDB unavailable, denied, or blocked | Ordinary discovery works. Explain that Library changes cannot be saved; never claim persistence or send state to a server or localStorage fallback. |
| IndexedDB transaction/quota failure | The transaction leaves the last committed state intact. Report the failed action and offer recovery guidance; do not clear or partially write the Library. |
| Malformed stored data | Preserve recoverable data and offer export/reset. Do not silently replace it with an empty Library. |
| Newer unsupported database version | Do not downgrade or overwrite it. Explain that the Library is unavailable to this code version and continue ordinary non-personalized discovery. |
| Another tab is blocking a schema upgrade | Report the blocked open and ask the listener to close or refresh older Echo tabs. Do not claim the upgrade completed. |
| Another tab commits a change | Broadcast a generic invalidation; other tabs reload through the service. Same-tab updates are delivered directly. If BroadcastChannel is unavailable, cross-tab immediate updates are unavailable. |
| Network unavailable | Previously cached Echo pages and assets may remain available under existing offline behavior. The Library service retains browser-local data; do not promise a cold offline catalogue or a separate Library management page. |
| Stale or removed show ID | Keep the listener’s entry and private data visible/exportable with an unresolved marker. Never substitute a different show by title guess. |

## Explicit non-goals

- A dedicated Library management page, a new Library navigation item, another global settings page, or a dashboard.
- Expanding Echo’s visible UI footprint as a default consequence of 2.0 behavior changes. Prefer improving existing surfaces; add a page only when the problem cannot reasonably fit Echo’s current structure.

- Accounts, cloud sync, cross-device identity, social profiles, followers, comments, or public collections of listener activity.
- Podcast hosting, playback, queue control, native apps, or a playback-platform rewrite.
- Paid placement, advertising profiles, cross-site tracking, or recommendation models trained from hidden behavior.
- Server-side personal profiles, mandatory login, or a required AI service.
- LLM-generated catalogue facts, hidden profile inference, or opaque “the archive knows you” claims.
- Private notes, a separate Favorite state, persistent recently-viewed history, listening-progress tracking, and Library status history.
- Automatic acceptance/publication of creator or listener submissions.
- A generic CMS, replacement source of truth, full catalogue enrichment campaign, or framework rewrite.

## Why this is a major version

Echo 1.2.7 is already a substantive, static-first discovery product. Its search, filters, creator graph, collections, deterministic similarity, public query URLs/history, submissions, importer, maintainer workspaces, analytics, and offline shell remain useful and must be retained.

2.0 changes the product contract in two connected ways: Echo gains a persistent but device-local listener-owned Library with controls on existing cards and show pages, and query handling becomes a coherent, inspectable composition of existing discovery evidence. It preserves the compact hierarchy and visual restraint of Echo 1.2.x while improving behavior; it does not add a Library destination or dashboard.

## Critical review of the proposed direction

- **Reuse rather than rebuild:** Current title/alias ranking and creator search are in [archive-search.js](../../shared/archive-search.js); public similarity, authored-neighbor separation, fit penalties, diversity, and reasons are in [archive-similarity.js](../../shared/archive-similarity.js). Discovery history and URL restoration already exist in [discovery-history.js](../../shared/app/discovery-history.js) and the home, collection, and entity URL helpers. 2.0 should orchestrate and extend these contracts.
- **Collections and creator identities already exist:** Authored collections, generated Shows Like companions, an explicitly linked creator registry, and typed entity graph routes are live. Do not replace any with a new generic category or auto-generated identity graph.
- **Coverage is intentionally uneven:** The September 20 coverage audit and September 17 cleanup review show a broad factual catalogue with a smaller editorially enriched subset. Runtime, tones, tags, commitment, and entity links are not uniformly known. A missing signal is a catalogue limitation, not permission to invent it.
- **Fresh baseline:** The executable v1.2.7 baseline is recorded in [BASELINE.md](BASELINE.md). It confirms 752 published shows, 517 factual-only imported records, no generated-data drift, and no existing Library implementation at the baseline commit.
- **“Finished” is not “liked”:** Completion is a listening state, not a preference rating. Treat it as exact-item history unless the listener separately rates it.
- **“Less chaotic” is not a numeric preference today:** The schema has a categorical chaotic tone, not a chaos scale. Restrict the interpretation to explicit metadata or ask the listener to clarify.
- **A workbench redesign is not yet justified:** Protected submission, import/elevation, collection, and analytics pages already exist. Improve their joins only where a documented maintenance task crosses those boundaries; do not replace them with a CMS.
