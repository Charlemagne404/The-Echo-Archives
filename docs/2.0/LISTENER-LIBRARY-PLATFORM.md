# Listener Library platform

This note records the implemented, browser-local Library platform and its listener-facing `/library` product. Personal recommendation ranking is not implemented here; Discovery 2.0 can consume only the sanitized service boundary described below.

## Domain and service

Import `createListenerLibrary` from `shared/library/service.js`. Creating the service is side-effect free; a caller explicitly opens it or performs a service operation. Asynchronous methods return `{ ok: true, value }` or `{ ok: false, error: { code, message } }`. Returned snapshots are detached and frozen. Storage failures never switch to memory or a server store.

The service exposes:

- `open()` and `checkAvailability()`
- `getEntry(showId)` and `listEntries()`
- `setState(showId, state, { titleSnapshot? })`
- `setRating(showId, rating)` and `removeRating(showId)`
- `removeEntry(showId)`
- `subscribe(callback)` for generic same-tab and BroadcastChannel invalidation
- `getPersonalDiscoveryEnabled()` and `setPersonalDiscoveryEnabled(enabled)`
- `getPersonalContext()` for the restricted Discovery boundary
- `exportLibrary()` and `exportRecoverySnapshot()`
- `previewImport(input, { mode, knownShowIds? })` and `commitImport(previewId, { confirmed? })`
- `reset({ confirmed })` and `close()`

Entry states are `saved`, `listening`, `finished`, `dropped`, and `hidden`. A private rating is an optional integer from 1 through 5. Entries retain `createdAt` and `updatedAt` as current-record metadata for deterministic sorting and backup fidelity; these fields are not event history. `titleSnapshot` is optional plain text for identifying an unresolved ID. Reads do not create entries, and rating edits require an existing entry.

The Library page sorts by recently updated, recently added, or title. It can filter each state, search local title/creator/tag/ID text, hydrate exact IDs from the current public catalogue, and keep unresolved IDs in a separate section. There is no fuzzy ID remapping, listening progress, public rating submission, or generated personal payload.

## IndexedDB schema and upgrade behavior

The database is `echo-archives-listener-library`, IndexedDB version 1.

| Store | Key path | Indexes | Contents |
| --- | --- | --- | --- |
| `entries` | `showId` | `by-state`, `by-updated-at`, `by-state-updated-at` | One current entry per canonical show ID. |
| `settings` | `key` | none | The local `personalDiscoveryEnabled` boolean; missing means off. |

Per-entry updates read and write inside one IndexedDB transaction. Import/reset operations are atomic. Version 0 to 1 creates the two stores and entry indexes. A future unsupported database version, malformed stored value, unavailable storage, blocked upgrade, or transaction error is reported explicitly and is never treated as an empty Library. Existing connections close on `versionchange`.

`BroadcastChannel` messages contain only a generic change notification, never a show ID, state, rating, or preference. Subscribers reread through the service. When the browser lacks `BroadcastChannel`, same-tab Library use continues and availability reports that cross-tab notification is unavailable.

## Personal Discovery boundary

The opt-in defaults to off and remains on this browser. `getPersonalContext()` returns only:

```json
{
  "enabled": true,
  "entries": [
    { "showId": "example-show", "state": "saved", "rating": 5 }
  ]
}
```

Each entry contains `showId`, `state`, and `rating` only when explicitly set. When disabled, the service returns `{ "enabled": false, "entries": [] }`. The context never contains title snapshots, `createdAt`, `updatedAt`, database/settings rows, backup metadata, malformed raw values, or analytics/community/browser identifiers. No ranking code is included in this Library product.

## External Library backup format

Normal backup JSON contains Library entries only. It does not export Personal Discovery opt-in, and neither Merge nor Replace reads, clears, or writes that preference.

```json
{
  "format": "the-echo-archives.listener-library",
  "schemaVersion": 1,
  "exportedAt": "2026-09-28T10:00:00.000Z",
  "entries": [
    {
      "showId": "example-show",
      "state": "saved",
      "createdAt": "2026-09-28T09:00:00.000Z",
      "updatedAt": "2026-09-28T09:00:00.000Z"
    }
  ]
}
```

Allowed entry fields are `showId`, `state`, optional `rating`, `createdAt`, `updatedAt`, and optional `titleSnapshot`. Unknown fields, duplicate IDs, invalid values, and unsupported schema versions reject the whole document. Exported JSON is readable plaintext and can contain private ratings and title snapshots; the listener chooses where to save it.

Import reads a selected file locally, validates it, and previews total entries, per-state counts, invalid paths/codes, unknown catalogue IDs, conflicts, and resulting count before a write. Merge keeps local-only entries and replaces a same-ID local record with the imported full record. Replace installs the imported entry set only after explicit confirmation. Both operations preserve the local Personal Discovery choice, preserve unknown IDs as-is, and commit entries atomically. A canceled or failed import changes nothing. The service rereads current entries during commit and reports conflicts again; the preview does not write a stale whole-database snapshot.

Recovery export is a separate raw snapshot format (`the-echo-archives.listener-library-recovery`) for troubleshooting malformed persisted rows. It is not accepted as a normal Library backup and does not change stored rows. Because it is a raw recovery file, it may contain local settings; keep it private.

## Listener-facing route and privacy

`/library` is an ordinary generated page shell marked `noindex`, excluded from the sitemap, and generated without personal state. Its Analytics flag is off. Personal content is read from IndexedDB after app initialization and rendered only in the live browser DOM. The route, URL, and `history.state` never store Library entries or the opt-in. The route remains useful without JavaScript by explaining the local-storage requirement and linking to ordinary archive browsing.

Cards use a sibling Library disclosure outside their full-card anchors. Show details add a separate local state/rating panel after primary listen actions. The controls synchronize across current-page instances and open tabs through the service subscription; they do not poll. Library actions have no analytics event and no server write path. Personal state is not added to the service-worker precache or page cache. Build/cache versions include hashes for `shared/library/`, `shared/app/library/`, `shared/app/pages/library/`, and the `library.css` bundle version so changed Library imports and styles do not reuse an unnoticed stale asset cache.

When storage is denied or unavailable, public Echo browsing remains usable. Library controls identify that local saving is unavailable and do not claim a save. A recovery export is available under a collapsed troubleshooting disclosure; malformed data is not silently deleted.

## Browser proof and automated coverage

`npm --prefix backend run test:library` runs schema/service tests and real Chromium product flows. Coverage includes persistence, imports and reset, ratings, Personal Discovery context and setting preservation, invalid/malformed data recovery, same-tab and cross-tab updates, storage failures, generated route privacy/indexing, card/detail controls, Library search/state filtering, and backup transfer. `npm run build:pages` generates `/library`, its clean `/library` route alias, styles, metadata, sitemap, and service worker from the manifest and source template.
