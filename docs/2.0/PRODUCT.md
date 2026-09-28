# The Echo Archives 2.0 — Product specification

**Status:** Listener Library product implemented on this branch. Discovery 2.0 behavior below remains the product contract for separate in-flight query/retrieval work.<br>
**Repository basis:** main at 55ca3969, reviewed 2026-09-28.
**Executable baseline:** [BASELINE.md](BASELINE.md).

## Product thesis

The Echo Archives 2.0 is a personal, privacy-first audio-drama discovery system that remembers what the listener explicitly cares about, understands richer discovery intent, and improves recommendations without requiring an account or creating an opaque behavioral profile.

It remains a curated, independent archive. The catalogue stays editorially governed; listener state belongs to that listener’s browser. Discovery combines explicit intent with the archive’s existing factual and editorial evidence.

## Listener problems

Echo already helps listeners find shows by title, genre, tone, format, completion, tags, listening context, collections, similarities, and creator relationships. It does not remember a listener’s own decisions across those surfaces. Its search and filters also make a listener translate a sentence into separate controls, even where the catalogue has enough structured evidence to combine them.

The 2.0 problems are therefore:

- A listener cannot maintain a private, durable record of shows they plan to hear, are listening to, finished, dropped, or do not want to see again.
- That state does not follow the listener through browse cards, show pages, collections, creator pages, and recommendations.
- Search intent such as “finished cinematic sci-fi around 10 hours” or “horror for a long walk” is harder to express than the current structured data warrants.
- Recommendations cannot use the listener’s explicit local choices, while a server-side profile or an unexplained behavioral model would violate Echo’s product direction.

The catalogue is not uniformly editorially enriched. Imported records deliberately remain factual-only; the September discovery and collection audits distinguish this coverage gap from a software defect. 2.0 must state when evidence is missing and must not fill that gap with guessed metadata.

## 1. Library

### State and meaning

An entry has one current status at a time:

| Status | Listener meaning | Discovery effect when personal discovery is on |
| --- | --- | --- |
| Saved | I may want to listen later. | A weak, explicit interest anchor. |
| Listening | I am listening now. | A weak, explicit interest anchor; do not treat it as a quality vote. |
| Finished | I consider this listen finished. | While Personal Discovery is enabled, exclude this exact show from “new to you” recommendations. It is not a positive taste signal by itself. |
| Dropped | I stopped this listen. | While Personal Discovery is enabled, suppress this exact show from recommendations by default. Do not infer why it was dropped or generalize that choice to similar shows. |
| Hidden | Do not surface this exact show in my personalized discovery results. | While Personal Discovery is enabled, suppress this exact show only. Hidden does not change catalogue truth or imply dislike of its genre, creators, collections, or similar shows. The direct show route remains accessible. |

The discovery effects in the table are future integration semantics. This branch records Library state and exposes a sanitized context API, but does not yet use that context to change results. Hidden never changes the catalogue, blocks a direct URL, or hides a show from ordinary non-personalized browsing. Statuses are explicit and reversible. Opening a show, clicking a listen link, or viewing a card never changes a status. A listener can remove an entry; removal also removes its private rating.

An optional private rating uses a clearly labeled integer 1–5 scale and exists only when the listener explicitly enters it for a Library entry. It is not an Archive Rating, Community Rating, review, submission, or creator-facing comment. A private rating of 4–5 can be used as a positive recommendation anchor; 1–2 as a negative anchor; 3 is neutral. No public or inferred rating may be substituted.

### UX

- Add a compact, keyboard-operable library action to shared show cards and show details. Reused cards on collection, creator, and search surfaces must use the same state control.
- Show the current state without making the dense browse cards taller or hiding the title and existing ratings.
- Provide a dedicated Library page with status filters, local search, a clear empty state, export/import, and the device-local Personal Discovery preference.
- Put the private rating in an explicitly private detail/editor area, not in public review or community components.
- Use the Library service for all reads and writes. Make successful changes visible in other open Echo tabs through cross-tab notification.
- Do not add an activity feed, status-change history, recently-viewed history, or listening progress.
- Keep the public catalogue useful without JavaScript. Library actions and stored state require JavaScript; the Library page must say so when scripts cannot run.

### Backup and transfer

Export is a user-triggered download of the version-1 JSON document defined in [ARCHITECTURE.md](ARCHITECTURE.md). It contains stable show IDs, current statuses, explicitly entered private ratings, and an optional last-known title for an unresolved show. It contains no account, analytics identifiers, server response, full catalogue snapshot, or Personal Discovery opt-in. Warn that private ratings and title labels are readable as ordinary text.

Import validates the entire document and previews entry counts, status counts, unknown catalogue IDs, same-ID conflicts, and invalid data before writing. Merge preserves local-only records; each imported same-ID record replaces the complete local record after that rule and its conflicts are disclosed. Replace makes the validated imported entries the complete Library entry set after explicit confirmation. Both modes preserve unknown IDs, do not remap by title or alias, leave the device-local opt-in unchanged, and commit all-or-nothing. Commit-time conflicts are recalculated so concurrent local-only entries survive Merge. A failed preview or commit changes nothing.

## 2. Discovery 2.0

Discovery 2.0 gives one typed interpretation to the existing search, filters, entities, collections, similarity, lifecycle, runtime, and “like X” routes. It is a deterministic query and retrieval layer, not a general-purpose chatbot.

Its initial versioned intent and public URL representation are frozen in [ARCHITECTURE.md](ARCHITECTURE.md) and decision [004](decisions/004-discovery-intent-and-url-state.md). The supported vocabulary stays tied to existing catalogue fields and reviewed benchmark cases; unsupported text remains visible as residual text.

For a supported query, Echo presents the understood parts as editable criteria before or alongside results: required facts, soft preferences, a resolved show or entity, and any unsupported phrase that remains ordinary text search. Hard requirements are never silently relaxed. Unknown metadata stays unknown.

Disambiguate catalogue lifecycle from personal listening state. “Finished shows” means the show’s published completion status when the phrase describes the catalogue item; “shows I’ve finished” refers to the listener’s local Library and must stay local. If grammar or context does not make that distinction clear, ask the listener to choose. A personal Library criterion is not encoded in a shareable URL.

Examples:

- **“Finished cinematic sci-fi around 10 hours”** combines the existing completion, tone, genre, and runtime evidence. “Around 10 hours” ranks known runtime values by closeness and preserves observed/estimated qualifiers; it does not assert an exact duration. Records with unknown runtime may appear after known matches only if the result view labels that uncertainty. A chosen numeric runtime range is a strict constraint.
- **“Horror for a long walk”** combines genre with the existing best-for signal when a show has it. Missing best-for data is not proof that a show is unsuitable.
- **“Funny like Midnight Burger but less chaotic”** resolves the seed show, keeps the existing authored and computed similarity distinction, and applies a negative tone criterion only where “chaotic” is explicitly represented in catalogue evidence. Chaos has no current ordinal scale, so “less chaotic” cannot be presented as a measured degree. If the phrase cannot be represented safely, Echo says so and leaves it as text.
- **“Shows by the people behind The White Vault”** resolves explicit person/company/studio/network links and their typed roles. Shared-show co-occurrence is not an affiliation. Unresolved creator strings can remain searchable text, but must not create a new relationship or entity.

Exact title, alias, and identity matches remain stronger than incidental body-text or broad metadata matches. A known title phrase must not be reinterpreted as a genre constraint merely because its words overlap a taxonomy value.

### How current discovery surfaces evolve

| Existing surface | 2.0 behavior |
| --- | --- |
| Search and filters | One intent model composes the current title/alias search and structured filters. Existing controls remain available as direct, inspectable ways to edit the interpreted query. |
| Collections | Keep authored listening paths and reasons intact. Collections can supply a direct route or evidence for retrieval, but generated membership is not a second editorial source. |
| Show pages and Try Next | Preserve written catalogue relationships first and the existing explainable computed matches separately. Add an optional, explicitly labeled personal section only when enabled and supported. |
| Shows Like | Keep the anchor, authored picks, pair-specific reasons, and separate computed fallback. Do not rebuild these routes as generic personalized pages. |
| Creator surfaces | Extend discovery through stable entity IDs, reviewed aliases, and explicit typed roles. Preserve organization-led directory rules and person/detail behavior. |
| URL and browser history | Keep public query/filter/seed state shareable and restore the rendered controls, results, summaries, empty state, and scroll on Back/Forward. Keep local Library records and personal recommendation settings out of URLs. |
| Empty and sparse results | Explain which requested evidence is missing; offer a clear edit/relax action. Never lower similarity thresholds or fabricate a match to avoid an empty state. |

## 3. Personal Discovery

Personal Discovery is a user-controlled preference on this device, defaulting off. The Library can be used and edited while it is off. This branch stores the preference and exposes it with a sanitized Library context, but Discovery 2.0 has not yet integrated it; enabling it currently does not alter results. It never changes catalogue truth or direct route accessibility.

When Discovery integration is complete, the planned behavior when enabled is:

- Saved and Listening entries are weak interest anchors, not quality judgments.
- Only an explicitly entered private rating can act as a positive or negative anchor. A reason identifies the rated show and the specific shared catalogue dimensions.
- Finished, Dropped, and Hidden affect only the exact-show recommendations described above. Finished does not mean liked; Dropped does not mean disliked; Hidden does not mean that similar shows are unwelcome.
- Personal signals can reorder only candidates that already pass the ordinary query and evidence gates. They cannot defeat a hard user constraint, invent a catalogue fact, or make a metadata-poor comparison appear certain.
- Each personal result states why it appeared, such as “Shares tone and theme with a show you saved” or “Shares format with a show you rated 5/5.” The listener can open the cited show, pause use of the Library, or clear local state.

Pausing Personal Discovery leaves entries and ratings intact. Once ranking integration lands, it will restore the exact ordinary, non-personalized candidate set, sections, ordering, and hidden-show visibility. Re-enabling requires an explicit action. The service reset operation removes all entries and sets the local opt-in to off in one transaction.

## Privacy guarantees and user controls

- No account, cross-device sync, remote listener profile, or server library endpoint.
- Statuses, private ratings, and the local opt-in stay in IndexedDB. They are not sent in analytics events, chat prompts, submission forms, community-rating requests, API calls, access telemetry, or maintainer tools.
- No personal state is serialized into a URL, generated/static response HTML, generated catalogue data, sitemap, service-worker cache, or server database. The browser may render the owner’s state into the live UI on that device.
- Discovery receives only the sanitized context defined in [ARCHITECTURE.md](ARCHITECTURE.md); it receives no database objects, title snapshots, timestamps, or export metadata.
- Existing anonymous community ratings remain server-backed community responses. They are separate from the local five-star rating and may not be merged or presented as the listener’s private history.
- Provide clear per-entry removal, pause, full clear, export, and import controls. Clearing Echo Library data does not claim to clear the archive’s separate analytics token, community-rating identity, chat session, or browser-wide site data.
- Update the public Privacy and Cookies storage inventory and obtain the project’s normal legal review before release. Do not claim a consent or legal classification that has not been reviewed.

The existing first-party analytics collector intentionally does not store search text. 2.0 keeps that boundary and adds no Library status, rating, seed, or personalization events. The Library route itself is excluded from analytics.

## Degradation behavior

| Condition | Expected behavior |
| --- | --- |
| JavaScript unavailable | Existing generated public pages and routes remain readable and navigable. Library controls are unavailable; the Library shell explains that local state needs JavaScript. |
| IndexedDB unavailable, denied, or blocked | Ordinary discovery works. Explain that Library changes cannot be saved; never claim persistence or send state to a server or localStorage fallback. |
| IndexedDB transaction/quota failure | The transaction leaves the last committed state intact. Report the failed action and offer recovery guidance; do not clear or partially write the Library. |
| Malformed stored data | Preserve recoverable data and offer export/reset. Do not silently replace it with an empty Library. |
| Newer unsupported database version | Do not downgrade or overwrite it. Explain that the Library is unavailable to this code version and continue ordinary non-personalized discovery. |
| Another tab is blocking a schema upgrade | Report the blocked open and ask the listener to close or refresh older Echo tabs. Do not claim the upgrade completed. |
| Another tab commits a change | Broadcast a generic invalidation; other tabs reload through the service. Same-tab updates are delivered directly. If BroadcastChannel is unavailable, cross-tab immediate updates are unavailable. |
| Network unavailable | Previously cached public catalogue assets may support a previously visited Library route. Otherwise retain the local data and show unresolved entries from stable IDs/title snapshots; do not promise a cold offline catalogue. |
| Stale or removed show ID | Keep the listener’s entry and private data visible/exportable with an unresolved marker. Never substitute a different show by title guess. |

## Explicit non-goals

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

2.0 changes the product contract in two connected ways: Echo gains a persistent but device-local listener-owned Library that can be explicitly used across discovery surfaces, and query handling becomes a coherent, inspectable composition of existing discovery evidence. That creates a durable personal workflow and a new retrieval model across the archive; it is more than adding a bookmark page or another filter.

## Critical review of the proposed direction

- **Reuse rather than rebuild:** Current title/alias ranking and creator search are in [archive-search.js](../../shared/archive-search.js); public similarity, authored-neighbor separation, fit penalties, diversity, and reasons are in [archive-similarity.js](../../shared/archive-similarity.js). Discovery history and URL restoration already exist in [discovery-history.js](../../shared/app/discovery-history.js) and the home, collection, and entity URL helpers. 2.0 should orchestrate and extend these contracts.
- **Collections and creator identities already exist:** Authored collections, generated Shows Like companions, an explicitly linked creator registry, and typed entity graph routes are live. Do not replace any with a new generic category or auto-generated identity graph.
- **Coverage is intentionally uneven:** The September 20 coverage audit and September 17 cleanup review show a broad factual catalogue with a smaller editorially enriched subset. Runtime, tones, tags, commitment, and entity links are not uniformly known. A missing signal is a catalogue limitation, not permission to invent it.
- **Fresh baseline:** The executable v1.2.7 baseline is recorded in [BASELINE.md](BASELINE.md). It confirms 752 published shows, 517 factual-only imported records, no generated-data drift, and no existing Library implementation at the baseline commit.
- **“Finished” is not “liked”:** Completion is a listening state, not a preference rating. Treat it as exact-item history unless the listener separately rates it.
- **“Less chaotic” is not a numeric preference today:** The schema has a categorical chaotic tone, not a chaos scale. Restrict the interpretation to explicit metadata or ask the listener to clarify.
- **A workbench redesign is not yet justified:** Protected submission, import/elevation, collection, and analytics pages already exist. Improve their joins only where a documented maintenance task crosses those boundaries; do not replace them with a CMS.
