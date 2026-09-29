# Listener Library platform

This note records the browser-local Library platform and its compact controls on existing Echo surfaces. There is no public `/library` management page. Personal ranking is implemented in a separate page-level Discovery helper; this document describes only the sanitized Library service boundary it consumes.

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

No public page sorts, filters, or searches Library entries. Those operations are not needed for the current compact controls. There is no fuzzy ID remapping, listening progress, public rating submission, or generated personal payload.

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

Import/export remains a validated service capability, with no normal public UI in this release. Do not add another page or a global settings surface to expose it. Recovery export is a service capability and may be offered contextually only when a storage problem requires it.

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

## Existing-surface controls and privacy

The manifest, generated routes, navigation, sitemap, server aliases, and stylesheet bundles contain no Library management page. The Library control is not a new destination or top-level navigation item.

Cards use a small status disclosure as a sibling of each full-card link; it offers state changes and removal but no private rating. Show details put state and private rating in a compact disclosure within the existing listening action area. These controls preserve ordinary show visibility, synchronize across repeated cards and open tabs, and report unavailable storage. Library actions have no analytics event or server write path.

Personal state is not added to URLs, generated HTML, catalogue artifacts, sitemap, service-worker caches, analytics, or server storage. The service-worker cache version hashes the imported `shared/library/` and `shared/app/library/` modules; the page-only modules and stylesheet have been removed. Library modules remain lazy imports and are not precached.

When storage is denied or unavailable, public Echo browsing remains usable. Library controls identify that local saving is unavailable and do not claim a save. Recovery data is not silently deleted; the recovery snapshot remains available through the service API for an appropriate future contextual flow.

## Browser proof and automated coverage

`npm --prefix backend run test:library` runs schema/service tests and real Chromium product flows. Coverage includes persistence, service import/export and reset, ratings, Personal Discovery context and setting preservation, invalid/malformed data recovery, same-tab and cross-tab updates, storage failures, absence of a generated/public Library route, compact card/detail controls, ordinary browsing, and request privacy. `npm run build:pages` generates the remaining public routes, existing-surface controls, metadata, sitemap, and service worker from authored sources.
