# 001 — Listener Library storage

**Status:** accepted for 2.0 v1<br>
**Baseline:** v1.2.7, 55ca3969

## Decision

Use one origin-scoped IndexedDB database named `echo-archives-listener-library`, initially at database version 1. IndexedDB is the only persistent Library store. Use one current-state record per show; keep persistence behind an asynchronous Library service. Use BroadcastChannel for post-commit generic invalidation notifications that contain no entry or preference values.

## Why

The Library needs transactional per-show writes, import, and reset, plus concurrent-tab behavior. IndexedDB transactions provide those operations without rewriting one shared localStorage envelope. The service API keeps callers independent of the storage adapter. The database has `entries` and `settings` stores; it does not need an internal event log or revision row. Import rereads current entry rows during commit and reports current same-ID conflicts.

## Rejected alternatives

- A whole-Library localStorage envelope has no atomic read/modify/write across tabs.
- A localStorage/IndexedDB hybrid creates two persistence contracts and unclear recovery rules.
- A server profile, account, or cloud sync would move private listener state off-device.

Existing localStorage used for unrelated analytics or UI state is not a Library fallback.

## Revisit only if

A supported-browser prototype or production evidence demonstrates a reproducible IndexedDB compatibility or data-integrity blocker that cannot be addressed within the service contract. Reconsidering the choice requires a migration and recovery plan; performance preference alone is insufficient.
