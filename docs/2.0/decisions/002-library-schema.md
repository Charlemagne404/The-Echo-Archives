# 002 — Listener Library v1 schema and backup

**Status:** accepted for 2.0 v1<br>
**Baseline:** v1.2.7, 55ca3969

## Decision

Persist one record per stable show ID with one required current `state`: saved, listening, finished, dropped, or hidden. A record may include an explicitly entered private integer `rating` from 1 through 5, an optional `titleSnapshot` used only to identify an unresolved show, and required `createdAt` and `updatedAt` current-record metadata. These timestamps support deterministic sorting and backup fidelity; they are not an event history. There is no notes field, arbitrary metadata bag, status history, favorite state, recently-viewed record, or listening progress.

The device-local Personal Discovery opt-in defaults to off and is stored separately from entries. The versioned export contains only Library entries and does not carry that setting. Database versioning and export-document schema versioning are independent.

Merge preserves local-only records and replaces a conflicting same-ID record with the imported record after preview disclosure. Replace makes imported entries the complete entry set after explicit confirmation. Both preserve unknown IDs, reject title/alias remapping, and commit atomically. The opt-in setting remains local for both operations.

## Why

The status is current listener-owned state, not an event stream. A rating is retained as an explicit personal preference signal and stays distinct from Archive Rating and Community Rating. Keeping the opt-in device-local prevents an imported file from silently enabling personalization on another device.

## Rejected alternatives

- Private notes are outside the first validated schema and would add sensitive free text without a current product need.
- A separate favorite duplicates the intent of saved.
- Recently viewed, playback progress, status history, and event sourcing are not required for the agreed workflow.
- Field-level merge could create records the listener did not preview; same-ID replacement is explicit and testable.
- Fuzzy title or alias remapping could attach private state to the wrong show.

## Revisit only if

A specific listener task requires a new field and the privacy, export, migration, and discovery contracts are updated together. Revisit merge semantics only with evidence that same-ID full-record replacement is unsafe or materially surprising after preview.
