# The Echo Archives 2.0 — Architecture

**Status:** Discovery 2.0 deterministic intent, retrieval, and public URL primitives are implemented under `shared/discovery/`. Listener Library UI/integration continues in parallel. Personal Discovery ranking and broad public UI integration remain later work.<br>
**Repository basis:** `main` at `55ca3969c850cabbc3c0159aae4e3c77da7e0410` (v1.2.7), reviewed 2026-09-28.<br>
**Executable baseline:** [BASELINE.md](BASELINE.md).<br>
**Rule:** authored catalogue files and the checked-in implementation define current behavior. Older product snapshots and QA counts are dated evidence, not current runtime contracts.

## 1. Current architecture

### Source, generation, and serving

The project is a Node/Express application with browser-native ES modules; it has no frontend framework or bundler requirement. The public site is generated from authored page sources and partials, then served as generated route files alongside the backend APIs.

| Layer | Current authoritative surface | Role |
| --- | --- | --- |
| Authored catalogue | `catalog-src/shows/`, `catalog-src/collections/`, `catalog-src/reviews/`, `catalog-src/entities.json` | Editorial show facts, authored relationships, collection membership, reviews, and explicit typed entity records. |
| Authored page UI | `site-src/pages/`, `site-src/partials/`, `site-src/page-manifest.json`, source CSS | Page shells, shared navigation/footer, and page-generation configuration. |
| Generated public data | `data/` including shows, collections, entities, entity graph, search index, and review projections | Build products derived from authored sources. They must be regenerated, not edited as source. |
| Generated web output | Root HTML, `styles.css`, `script.js`, `sw.js`, route aliases, sitemap, robots | Build products from `site-src/`, `shared/`, and `tools/build-pages.js`. Root UI outputs are not the authored edit point. |
| Shared browser/domain code | `shared/archive-search.js`, `archive-similarity.js`, `archive-entities.js`, `shared/app/` | Reusable ranking, graph, page controllers, rendering, URL state, and browser behaviors. |
| Server workflows | `backend/lib/` and `backend/routes/` | Public APIs for community/submission flows and protected maintainer workflows. SQLite stores server-side operational state, not authored show truth. |
| Build and operations | `tools/`, `backend/scripts/`, `deploy/`, GitHub workflows | Catalogue validation/generation, reports, tests, staged release and deployment controls. |

The catalogue schema deliberately permits absent metadata. Runtime values carry observed/estimated qualifiers and provenance; discovery profiles are curated extensions rather than mandatory fields. Entity relationships require explicit typed records. A graph projection does not turn co-occurrence into affiliation.

### Existing discovery and presentation contracts to retain

- `shared/archive-search.js` indexes and scores exact titles, aliases, normalized text, metadata, entities, and selected similar-show evidence. Exact title/alias identity must remain ahead of incidental text and broad taxonomy matches.
- The browse page combines title search with structured filters. Within a filter group values are ORed; selected groups are ANDed. The browser reads generated search-index data and renders paginated cards from an initial set of generated markup.
- `shared/archive-similarity.js` is deterministic and explainable. It distinguishes authored and computed relationships, requires meaningful multi-dimension evidence, treats missing data as unknown, applies fit conflicts and duplicate-identity exclusions, and returns reason data. Its adversarial tests are the starting point for recommendation tests.
- Shows Like routes require authored coverage and keep authored picks before separately labeled computed fallback. Show-page Try Next likewise preserves “Curated by archive” and “Related shows” as different claims. A sparse show gets a browse continuation, not a fabricated recommendation.
- `shared/archive-entities.js` exposes reviewed entity identity and typed roles. Creator browsing is organization-led; explicit linked people remain searchable without inventing a person directory or affiliations.
- `shared/app/discovery-history.js` and page-specific URL helpers already make search/filter/sort/seed state addressable and restore rendered controls, results, summaries, empty states, and scroll on Back/Forward. Keep this behavior as a compatibility contract.
- `tools/build-pages.js` uses the page manifest to generate routes, redirects/aliases, noindex behavior, analytics inclusion, styles, sitemap, and the service worker. New public route shells belong in authored page sources and the manifest.

### Server, analytics, and offline boundaries

The server currently owns anonymous community ratings/reviews, submissions, protected moderation/import/elevation/collection workflows, and aggregate analytics. Its transactional SQLite migration system is not an appropriate store for one browser’s Library. Existing browser storage already serves separate purposes: analytics identity, community identity, transient chat/draft/scroll preferences, and other small UI state. None is a personal Library contract.

The v1.2.7 baseline had no Library service or IndexedDB Library implementation. Existing localStorage keys remain separate from Library state.

The generated service worker caches a small offline shell and assets; it does not cache personal state or the full catalogue. API requests bypass its cache. Analytics events are allowlisted, avoid search text and direct personal data, and can be excluded per page in the manifest. The Library route is excluded from analytics. The Library platform, page-module tree, app-integration tree, and dedicated stylesheet version contribute to generated cache versioning so Library code and style changes invalidate stale cached assets.

## 2. Proposed 2.0 architecture

### Boundary overview

```text
catalog-src + reviewed entities + authored collections
                 │ build/validate
                 ▼
       generated data and route pages ─────────── existing Express APIs
                 │                                      (no Library API)
                 ▼
       public discovery retrieval ◄──── explicit query model
                 │                       search / filters / seed / entity / collection
                 │                       all grounded in public catalogue evidence
                 ▼
         rendered public candidates
                 ▲
                 │ optional sanitized preference snapshot
         Personal Discovery
                 ▲
                 │ read-only API boundary
         Library service ───── IndexedDB database version 1
                 ▲
                 └── Library UI writes only through service API
```

The Listener Library is an implemented browser-local product. Public retrieval remains pure with respect to storage. The current branch provides `getPersonalContext()` as a narrow service boundary; no personalized ranking or Hidden suppression is wired into Discovery yet. Search and similarity code do not read IndexedDB or `localStorage`.

### Listener-state persistence model

Use one origin-scoped IndexedDB database named `echo-archives-listener-library`, initially at database version 1. IndexedDB is the only persistent Library store; there is no Library localStorage fallback, server fallback, account, sync, event log, or per-action history.

| Object store | Key path | Version-1 contents |
| --- | --- | --- |
| `entries` | `showId` | One current entry per canonical show ID: required `state`; optional `rating` (integer 1–5); optional `titleSnapshot` for an unresolved show; required `createdAt` and `updatedAt`. |
| `settings` | `key` | The `personalDiscoveryEnabled` boolean. A missing value means false. |

`createdAt` and `updatedAt` are current-record metadata used for sorting and backup fidelity; they are not status history. The `entries` store has `by-state`, `by-updated-at`, and `by-state-updated-at` indexes. The export document also has `exportedAt`, which records when the backup was made. No raw catalogue record, private note, arbitrary metadata bag, derived taste vector, or cached explanation is stored.

The database version is the persisted-schema version. Increment it for a store, index, or record-shape migration. Perform deterministic, allowlisted transformations in the IndexedDB `versionchange` transaction; abort the transaction if validation or migration fails. Keep the import/export document’s `schemaVersion` independent from the database version. Opening a database newer than the running code returns an unsupported-version result and leaves it untouched.

Every mutation uses a read/write transaction. IndexedDB serializes conflicting transactions, so concurrent edits to different show IDs do not replace one another. If two tabs change the same show, the last committed transaction is current state; no status history is retained.

After a successful commit, publish only a generic invalidation message through `BroadcastChannel`. Same-tab subscribers are notified directly; other tabs reload through the service and validate current records. The message carries no show ID, state, rating, or preference value. If BroadcastChannel is unavailable, availability reports that cross-tab notifications are unavailable; there is no localStorage data fallback.

### Schema versioning, migration, and recovery

- Validate persisted and imported entries against an exact allowlist: canonical show ID, one of the five states, optional integer private rating 1–5, required UTC `createdAt` and `updatedAt`, and optional bounded `titleSnapshot`. Unknown fields are rejected; there is no arbitrary metadata bag.
- Upgrade fixtures cover each released database version. Migrations transform current records in the `versionchange` transaction and either commit the complete validated upgrade or abort it.
- Handle `onblocked` by reporting that another Echo tab must close or refresh before the upgrade can proceed. If a connection receives `versionchange`, close it promptly, notify subscribers, and reopen on request. Do not report the new version ready until the open request succeeds.
- A newer unsupported database version, malformed record, unavailable/denied IndexedDB, blocked upgrade, or transaction error must not be interpreted as an empty Library. Return a typed availability/action failure and preserve the committed data. Offer explicit export/recovery/reset where the data can be read safely.
- A failed transaction leaves the previous committed state intact. Never silently fall back to localStorage, a server endpoint, or an empty Library.
- `reset({ confirmed: true })` clears entry and settings rows in one transaction, returning the opt-in to its default off state. It does not clear unrelated analytics/community identifiers or browser-wide data.

### Import/export

Define the version-1 exported JSON document as:

~~~json
{
  "format": "the-echo-archives.listener-library",
  "schemaVersion": 1,
  "exportedAt": "ISO-8601 UTC timestamp",
  "entries": [
    {
      "showId": "stable-show-id",
      "state": "saved",
      "rating": 5,
      "createdAt": "ISO-8601 UTC timestamp",
      "updatedAt": "ISO-8601 UTC timestamp",
      "titleSnapshot": "Optional unresolved-show label"
    }
  ]
}
~~~

`rating` and `titleSnapshot` are optional. Unknown IDs remain intact. Duplicate IDs, invalid fields, unsupported document versions, or extra properties fail whole-file validation. The document excludes the Personal Discovery setting, analytics identifiers, server data, notes, and full catalogue records. Entry timestamps are included for sorting and backup fidelity. Import cannot enable or disable personalization on this device.

Import always validates and previews before writing. The preview reports total/state counts, invalid data paths/codes, unresolved IDs, the selected mode, same-ID conflicts, and the resulting entry count. **Merge** preserves every local-only record and replaces each conflicting same-ID record with the entire imported record. **Replace** makes the imported entries the complete entry set after explicit confirmation. Both leave the current device-local Personal Discovery setting unchanged.

The preview carries an opaque service token for a normalized import plan. Commit rereads current entries inside one read/write transaction and reports conflicts again, so Merge preserves concurrent local-only entries. Validation, cancellation, or storage failure changes nothing. No file data is uploaded. Warn that exported private ratings and title labels are readable as ordinary text.

### Module boundaries and UI APIs

The Listener Library work remains separate from public Discovery. Discovery modules do not import or read Library storage.

| Module | Responsibility | Boundary |
| --- | --- | --- |
| `shared/library/schema.js` | Entry, setting, and normal backup validation. | Does not read the DOM, fetch APIs, or mutate storage. |
| `shared/library/indexeddb.js` | Database opening, v1 stores/indexes, transactions, and typed storage failures. | Does not expose a database handle or recommendation meaning. |
| `shared/library/service.js` | Validated asynchronous commands, import/export, Personal Discovery setting/context, and generic change invalidations. | Does not expose mutable rows or call the server. |
| `shared/app/library/runtime.js` | Lazy app integration, current entry snapshot, and subscription fan-out. | Does not block public rendering or cache a write fallback. |
| `shared/app/library/integration.js` | Sibling card controls and show-detail controls. | Does not put controls inside full-card anchors or emit Library analytics. |
| `shared/app/pages/library.js` | Local Library filters/search/sort, backup workflow, recovery export, and local preference UI. | Does not serialize personal state into URLs/history or send it to an API. |
| `shared/discovery/query.js` | Deterministic phrase normalization, identity-first parsing, typed public intent, unresolved phrases, and provenance. | Uses the existing search vocabulary and catalogue-backed facets; no LLM or Library access. |
| `shared/discovery/index.js` | Retrieval orchestration over archive search, current hard predicates, similarity, typed entities, and collections. | Returns separate candidate sections and evidence; performs no personal ranking. |
| `shared/discovery/runtime.js` | Observed, derived-estimate, and unknown runtime evidence. | Estimates retain their qualifier and listed-inventory scope. |
| `shared/discovery/url-state.js` | Pure public URL serialization and parsing. | Stable allowlist; excludes Library and personal settings/state. |

The service hides all IndexedDB details. Its conceptual contract is:

~~~ts
type LibraryState = "saved" | "listening" | "finished" | "dropped" | "hidden";
type PrivateRating = 1 | 2 | 3 | 4 | 5;
type LibraryEntry = Readonly<{
  showId: string;
  state: LibraryState;
  rating?: PrivateRating;
  createdAt: string;
  updatedAt: string;
  titleSnapshot?: string;
}>;
type PersonalContext = Readonly<{
  enabled: boolean;
  entries: readonly Readonly<{
    showId: string;
    state: LibraryState;
    rating?: PrivateRating;
  }>[];
}>;
type LibraryResult<T> = Readonly<{ ok: true; value: T } | { ok: false; error: { code: string; message: string } }>;

interface ListenerLibrary {
  open(): Promise<LibraryResult<Availability>>;
  checkAvailability(): Promise<LibraryResult<Availability>>;
  getEntry(showId: string): Promise<LibraryResult<LibraryEntry | null>>;
  listEntries(): Promise<LibraryResult<readonly LibraryEntry[]>>;
  setState(showId: string, state: LibraryState, options?: { titleSnapshot?: string }): Promise<LibraryResult<{ entry: LibraryEntry; changed: boolean }>>;
  setRating(showId: string, rating: PrivateRating): Promise<LibraryResult<{ entry: LibraryEntry; changed: boolean }>>;
  removeRating(showId: string): Promise<LibraryResult<{ entry: LibraryEntry; changed: boolean }>>;
  removeEntry(showId: string): Promise<LibraryResult<{ removed: boolean }>>;
  subscribe(listener: (event: { type: "change" | "upgrade" }) => void): () => void;
  getPersonalDiscoveryEnabled(): Promise<LibraryResult<boolean>>;
  setPersonalDiscoveryEnabled(enabled: boolean): Promise<LibraryResult<{ enabled: boolean; changed: boolean }>>;
  getPersonalContext(): Promise<LibraryResult<PersonalContext>>;
  exportLibrary(): Promise<LibraryResult<{ format: string; schemaVersion: number; filename: string; json: string }>>;
  exportRecoverySnapshot(): Promise<LibraryResult<{ format: string; filename: string; json: string }>>;
  previewImport(input: unknown, options: { mode: "merge" | "replace"; knownShowIds?: readonly string[] }): Promise<LibraryResult<ImportPreview>>;
  commitImport(previewId: string, options?: { confirmed?: boolean }): Promise<LibraryResult<ImportResult>>;
  reset(options: { confirmed: boolean }): Promise<LibraryResult<ResetResult>>;
  close(): void;
}
~~~

Rating changes require an existing entry and never create an implicit Saved entry. `removeRating` deletes only the private rating. `open` returns a typed success/unavailable/blocked/unsupported-version result; commands never expose an IndexedDB object. `subscribe` signals invalidation, after which callers reread through the service. `reset` is atomic and clears entries plus the local setting after explicit confirmation.

Discovery receives exactly `PersonalContext`: enabled plus `showId`, `state`, and optional explicit `rating`. When disabled, the context is `{ enabled: false, entries: [] }`; when enabled, it has no title snapshots, timestamps, export metadata, database/settings rows, analytics identifiers, or malformed raw values. This API does not perform ranking, and the UI never calls IndexedDB directly.

### Query/intention representation

The version-1 public intent shape is frozen as:

~~~ts
{
  version: 1,
  identity: null | {
    kind: "show" | "entity",
    id: string,
    role?: "creator" | "production-company" | "studio" | "network"
  },
  required: {
    genreIds: string[],
    formatIds: string[],
    catalogueStatusIds: string[],
    runtimeHours: null | { min: number | null, max: number | null }
  },
  preferred: {
    genreIds: string[],
    formatIds: string[],
    toneIds: string[],
    tagIds: string[],
    bestForIds: string[],
    runtimeTargetHours: number | null
  },
  avoid: {
    genreIds: string[],
    formatIds: string[],
    toneIds: string[],
    tagIds: string[]
  },
  residual: { text: string, unresolvedPhrases: string[] },
  provenance: {
    source: "controls" | "phrase" | "route" | "mixed",
    fields: Array<{
      field: "identity" | "required" | "preferred" | "avoid" | "residual",
      source: "controls" | "phrase" | "route"
    }>
  },
  url: {
    pathname: string,
    params: Array<{ name: string, value: string }>,
    hash: string
  }
}
~~~

For `identity.kind === "show"`, the stable show ID is the explicit show seed. For an entity identity, role is included only when a typed role was requested and source-backed. Criteria arrays contain distinct stable IDs from current catalogue/filter vocabularies. `runtimeHours` is a strict chosen range; `runtimeTargetHours` is a soft target. The field set is not a promise to understand every English phrase.

`url` contains a same-origin public pathname, repeated public query key/value pairs, and an optional public hash. It does not contain an origin, opaque whole-query blob, or any personal state. Keep current route mappings and parameters: browse uses `q`, `collection`, repeated `genre` and existing structured-filter keys, and `sort`; collections use `q`, `intent`, and `sort`; the creator directory uses `q`, `type`, and `sort`. Existing route helpers continue to preserve unknown non-personal query parameters and Back/Forward behavior. Personal Library criteria, ratings, statuses, opt-in, and recommendation reasons never enter this representation.

Required and preferred are separate: a chosen structured filter is a hard constraint; phrases like “around 10 hours” are soft targets unless the listener converts them into a range. Avoid criteria are hard only when the catalogue has explicit evidence to evaluate them; otherwise the UI says the criterion could not be applied. A missing field is unknown, never a negative. Keep unknown or unsupported language as residual text rather than pretending to understand it. Resolve “finished shows” to catalogue completion only when the grammar indicates show lifecycle; “shows I’ve finished” refers to local Library state and is never public URL state. Ambiguous phrasing requires an explicit choice.

Parsing should be deterministic, allowlisted, local, and explainable. Resolve title/alias/creator identity before classifying overlapping terms as taxonomy. Do not add an LLM dependency. If more than one interpretation is plausible, offer an editable interpretation or preserve the text search; never hide an interpretation in ranking.

### Implemented deterministic query and retrieval contract

The implementation lives in `shared/discovery/query.js`, `index.js`, `runtime.js`, and `url-state.js`. It is a typed orchestration layer over the existing engines, not a replacement search or similarity engine. In Node, `require("../../shared/discovery")` exposes `createDiscoveryEngine`; in the browser the equivalent `EchoDiscovery` global is installed after `EchoArchiveSearch`, `EchoArchiveSimilarity`, `EchoArchiveEntities`, `EchoDiscoveryQuery`, `EchoDiscoveryRuntime`, and `EchoDiscoveryUrlState`.

~~~ts
const engine = EchoDiscovery.createDiscoveryEngine({
  shows, searchCatalog, collections, entities, catalogueRevision
});
const intent = engine.parse(query, { surface: "show-search" | "collections-search" });
const result = engine.retrieve(queryOrIntent, { surface?, personalContext?, personalize? });
~~~

`parse()` returns a plain serializable `version: 1` intent. `retrieve()` accepts either that intent or a query string, and returns a plain serializable `version: 1` result. The engine is synchronous and holds catalogue indexes for its lifetime; it uses a 128-entry, engine-local LRU for non-personal parsed queries keyed by catalogue revision, surface, and exact query text. The similarity index is built lazily once per engine. Use a new engine when the catalogue revision changes. This keeps ordinary title search on the existing fast search path and avoids rebuilding indexes per keystroke.

The intent carries `kind`, original and normalized query text, surface, `identity`, `required`, `preferred`, `avoid`, `residual`, `ambiguities`, `personalIntent`, `entityResolution`, `collectionResolution`, `runtimeRequest`, `provenance`, and `url`. Criteria arrays use stable catalogue IDs: genres, formats, tones, catalogue/release status, best-for contexts, tags/themes only when explicitly prefixed with a known `tag:` or `theme:` value, and commitment labels. Runtime hard ranges are `{ min, max, minExclusive, maxExclusive }`; an “around N hours” request is a soft `{ hours, mode: "around", strength: "soft" }` preference. A selected structured filter remains hard. Unsupported and comparative language stays in `residual.unresolvedPhrases`; `darker`, `less chaotic`, `more cinematic`, and season-count ambiguity do not become fabricated scales or hours.

The result shape is:

~~~ts
type CriterionGroups = {
  genreIds: string[];
  formatIds: string[];
  toneIds: string[];
  catalogueStatusIds: string[];
  releaseStatusIds: string[];
  bestForIds: string[];
  tagIds: string[];
  themeIds: string[];
  commitmentIds: string[];
};
type PublicIntent = {
  version: 1;
  kind: string;
  query: string;
  normalizedQuery: string;
  surface: "show-search" | "collections-search" | "entity-search";
  identity: null | { kind: "show" | "entity" | "collection"; id: string; match: string; matchedText?: string; role?: string; type?: string; seed?: boolean; candidateIds?: string[]; commonArticleOmitted?: boolean };
  required: CriterionGroups & { runtimeHours: null | { min: number | null; max: number | null; minExclusive: boolean; maxExclusive: boolean } };
  preferred: Omit<CriterionGroups, "catalogueStatusIds" | "releaseStatusIds"> & { runtimeTargetHours: null | { hours: number; mode: "around"; strength: "soft" } };
  avoid: Omit<CriterionGroups, "catalogueStatusIds" | "releaseStatusIds" | "commitmentIds">;
  residual: { text: string; unresolvedPhrases: string[] };
  ambiguities: Array<{ phrase: string; kind: string; alternatives: Array<Record<string, unknown>>; resolution?: string }>;
  personalIntent: null | { kind: "library-status"; status: "finished"; scope: "local-only"; requiresLibraryContext: true };
  entityResolution: null | Record<string, unknown>;
  collectionResolution: null | Record<string, unknown>;
  runtimeRequest: null | { precision: "exact"; showId: string };
  provenance: { source: string; fields: Array<{ field: string; source: string; phrase?: string; evidence: Record<string, unknown> }> };
  url: { pathname: string; params: Array<{ name: string; value: string }>; hash: string };
};
type Ambiguity = PublicIntent["ambiguities"][number];
type Provenance = PublicIntent["provenance"];
type DiscoveryResult = {
  version: 1;
  intent: PublicIntent;
  sections: {
    shows: Candidate[];
    authoredSimilarity: Candidate[];
    computedSimilarity: Candidate[];
    collections: Candidate[];
    entities: Candidate[];
  };
  candidateIds: string[];
  applied: {
    required: Array<{ key: string; value: unknown }>;
    preferences: Array<{ key: string; value: unknown }>;
    exclusions: Array<{ key: string; value: unknown }>;
    provenance: Provenance;
  };
  unresolvedPhrases: string[];
  ambiguities: Ambiguity[];
  limitations: Array<{ code: string; field?: string | null; phrase?: string; message?: string }>;
  outcome: "results" | "no-results" | "needs-clarification" | "requires-personal-context" | "personal-context-available";
  retrievalTrace: {
    engineVersion: "2.0.0";
    catalogueRevision: string;
    mode: string;
    usedArchiveSearch: boolean;
    usedSimilarity: boolean;
    usedEntityLinks: boolean;
    usedCollections: boolean;
  };
};
type Candidate = {
  id: string;
  section: string;
  provenance: Record<string, unknown>;
  reasons: string[];
  evidence: Array<Record<string, unknown>>;
  runtime?: RuntimeEvidence;
};
type RuntimeEvidence =
  | { kind: "observed-exact"; hours: number; scope: string; durationCoverage: 1 }
  | { kind: "observed-reported"; hours: number; scope: string; durationCoverage: number | null }
  | { kind: "derived-estimate"; hours: number; scope: string; basis: { episodeCount: number; averageEpisodeMinutes: number } }
  | { kind: "unknown"; hours: null; scope: string };
~~~

Candidate sections stay distinct. Authored relationships identify their seed and authored source; computed matches retain the existing similarity engine's dimensions, reasons, and confidence; collection results identify their editorial/rule-based route and membership source; entity results carry the explicit `entityLinks` role. Hard requirements and exclusions filter candidates after existing candidate generation, so a modifier cannot bypass similarity eligibility gates or pull in a prohibited show. Results do not expose internal similarity scores as truth. Missing evidence cannot satisfy a hard requirement or an exclusion check. A `people-behind` request returns linked public people with creator role only; an organization-only link produces an explicit limitation rather than an invisible substitution.

Runtime evidence is attached to returned show candidates as `observed-exact`, `observed-reported`, `derived-estimate`, or `unknown`, with hours, scope, and estimate basis where applicable. An estimate derived from episode count × average episode length is scoped to the listed inventory and never displayed as an observed exact total. Unknown duration is not positive evidence. Around-duration preferences rank comparable observed and estimated values by distance, with unknown values after known values; a hard numeric range excludes unknown duration.

Public URL state is available as pure functions: `EchoDiscoveryUrlState.serializePublicUrlState(intent, options?)` and `parsePublicDiscoveryUrl(url, options?)`. Serialization has stable parameter ordering and retains current `q`, `collection`, `seed`, filter, sort, entity, and route keys plus allowlisted public criteria. It does not serialize Library status/rating/Hidden state, Personal Discovery settings, private anchor history, or local-only intent. Parsing ignores unrecognized/private keys. These primitives do not change live browser history behavior; the existing page URL/history helpers remain the integration point.

### Reusing current discovery systems

The implemented orchestration maps controls and safely understood phrases into:

1. `archive-search.js` for title, alias, creator text, and indexed metadata scoring;
2. current browse filter predicates for exact known structured fields;
3. `archive-entities.js` for stable IDs and explicit typed creator/company roles;
4. authored collection membership and authored show relationships for editorial routes;
5. `archive-similarity.js` for seed-based explainable related candidates and fit/diversity constraints.

The orchestrator retains match provenance and result sections (identity/search, authored similarity, computed similarity, collection routes, and typed entities) rather than flattening distinct claims into an unexplained score. The pure public URL codec is implemented and round-trip tested; existing live URL/history helpers remain the UI integration point.

### Personal Discovery integration seam; ranking deferred

The Library service exposes `getPersonalContext()`. The Discovery engine accepts that documented `{ enabled, entries: [{ showId, state, rating? }] }` value through `retrieve(query, { personalContext, personalize })`, sanitizes it against public show IDs, valid Library states, and rating bounds, and passes it only to an optional injected hook. The engine imports no Library module and reads no IndexedDB. Without a context, with a disabled context, or with no personalization hook, ordinary public results keep their baseline candidates, sections, and order. The hook seam exists; no Personal Discovery ranking, Hidden suppression, or UI wiring is implemented here.

Personalization is an optional deterministic ordering/suppression layer over a candidate set that already satisfies the public query and evidence checks. When disabled or unavailable, it must produce the exact baseline candidate set, sections, and order, including visibility of Hidden shows. The only inputs are explicit statuses and private ratings. Saved/Listening may supply weak anchors; only an explicitly entered 4–5 rating supplies a positive anchor, 1–2 a negative anchor, and 3 is neutral. When enabled, Finished suppresses only that exact show from “new to you” recommendations; Dropped suppresses only that exact show by default; Hidden suppresses only that exact show from personalized discovery. None generalizes to similar titles, and a direct show route always remains accessible.

Keep current similarity's duplicate identity exclusions, evidence threshold, mismatch policy, and authored/computed separation. A personal score cannot make an ineligible or metadata-empty comparison eligible, override query constraints, or become a new catalogue fact. Return structured reason evidence with candidate ID, anchor ID, anchor signal kind, and current shared dimensions/reason codes. The renderer turns codes into restrained copy and links to the anchor. Every personal ordering effect should have a visible reason; if it cannot, do not apply it. No model training or learned vector is needed for 2.0.

### URL state and server/client boundary

`shared/discovery/url-state.js` serializes and parses allowlisted public query, seed, filter, collection, entity, and route parameters in stable order. This primitive does not yet replace the live page URL/history helpers. Preserve their push/replace rules, aliases, redirects, and rendered Back/Forward restoration during UI integration. Do not place Library IDs, statuses, ratings, the opt-in setting, or personal reason payloads into URL, document title, referrer, public links, generated/static response HTML, or request telemetry. Avoid opaque encoded full query blobs if ordinary URL parameters can express the state.

The Library page is the generated `/library` route in `site-src/pages/library.html` and `site-src/page-manifest.json`. It is noindex, absent from the sitemap, and has `includeAnalytics: false`. The generated HTML is only a shell; it contains no personal state. The page resolves exact known show IDs from static catalogue data in the browser. Unknown IDs stay unresolved and are never matched fuzzily. Do not add an Express Library endpoint, SQLite table, server rendering of entries, or per-user cache key. Privacy/legal pages must accurately inventory IndexedDB before release.

### Service worker and offline behavior

Do not add Library records or exports to precache/runtime caches. The browser-owned storage key survives service-worker cache updates independently. `tools/build-pages.js` includes tree hashes for `shared/library/`, `shared/app/library/`, and `shared/app/pages/library/`, plus the dedicated `library.css` version, in the service-worker cache version. The route shell and Library CSS/module are ordinary static assets; the dynamic IndexedDB contents are never serialized into or cached by the worker. A previously visited Library shell can open offline if its generated HTML and required static assets were cached; the app can display locally stored IDs and any permitted title snapshot. Public catalogue/search data currently is not fully precached, so cold-offline browse and full offline title resolution are not promised. Existing API bypass and cache-version behavior remain under their current tests. Verify update/rollback behavior in an isolated browser profile on the same origin before release.

### Analytics and privacy boundary

Do not add Library action, status, private rating, seed, or personalized reason events. Keep the Library route outside analytics inclusion. Existing aggregate analytics for public page behavior can remain as currently allowlisted, but do not attach Library state or Library-origin metadata to a show-open event. Confirm privacy/cookie documents and the real event allowlist; no assumptions that “local” means “legally exempt.” Seek normal legal review for the new storage purpose.

## 3. Testing and performance architecture

Test pure schema and retrieval modules without DOM or browser storage. Cover every database migration edge, invalid import file, unknown newer version, malformed data, unavailable/blocked IndexedDB, transaction abort, atomic reset/import, cross-tab invalidation, merge/replace conflicts, commit-time concurrent-entry conflicts, and export roundtrip. Use an IndexedDB test adapter or browser fixture and fixed IDs for deterministic unit tests. Browser coverage also exercises the `/library` shell, card/detail controls, privacy/network boundaries, import preview/cancel/commit, narrow viewports, keyboard use, and cross-tab updates.

Discovery pure tests are in `tools/test/discovery-v2.test.js`; the reviewed golden contract is exercised through `npm run benchmark:discovery` and `npm run test:discovery-benchmark`. These cover title/taxonomy identity precedence, aliases and punctuation, typo bounds, facets/exclusions, similarity modifiers, explicit entity roles, separate collection routes, observed/estimated/unknown runtime, URL privacy, unresolved/ambiguous language, determinism, and parity without Personal Discovery context. The v1 baseline stays frozen; Discovery checks run as a separate result path.

Use browser smoke coverage for card/detail/library integration, privacy surfaces, keyboard-only operation, mobile card density, reduced motion, storage denial, and true Back/Forward restoration. Keep a required-browser gate separate from optional skip behavior. Never claim a browser release gate passed when Chromium was skipped.

The initial local baseline and its limits are recorded in [BASELINE.md](BASELINE.md). Before choosing performance budgets, measure the supported browser/device profile with controlled cache state, data download and parse, first useful results, filter/query latency, result rendering, and memory. The existing report timings are full-catalogue local operation samples, not browser latency. Compare the same scenario after 2.0. Synthetic scale tests should use a fixture at least ten times the then-current published catalogue size as a stress check, while separately preserving real-catalogue correctness. Page results and cards rather than mounting the whole synthetic catalogue. A scale failure should identify the operation and boundary, not be hidden by loosening relevance gates.

## 4. Compatibility and operating assumptions

- Generated static pages remain the public delivery model; no framework migration is implied.
- Existing routes, redirects, query parameter meanings, authored source formats, and API contracts remain backwards compatible unless the release explicitly documents an additive change.
- Catalogue builders and validation remain the only path from authored data to generated data/pages. Library state never enters those artifacts.
- Current 1.x tests and smoke checks are regression gates. The fresh v1.2.7 backend suite and both Chromium smoke modes passed in [BASELINE.md](BASELINE.md). Older dated QA failures remain historical evidence, not current failures.
- Staging uses a separate server database but, in a real browser, Library data is origin-scoped. Isolate staging and production test profiles. Code rollback does not roll back SQLite migrations, and there should be no 2.0 Library schema migration on that server database.
- Dated coverage audits establish a significant factual-only imported set and uneven optional discovery metadata. Re-run current reports during Phase 1; do not hard-code their September counts as current coverage.
