# 003 — Personal Discovery boundary

**Status:** accepted for 2.0 v1<br>
**Baseline:** v1.2.7, 55ca3969

## Decision

Personal Discovery is opt-in and defaults to off. The Library remains usable while it is off. `getPersonalContext()` returns a sanitized, immutable context with only the enabled flag and each entry’s `showId`, `state`, and optional explicitly entered `rating`. While disabled, the context contains no entries. Discovery receives no database object, timestamps, export metadata, title snapshot, analytics identifiers, or unrelated browser state.

The preference lives inside the existing show-detail Library disclosure; it defaults off and creates no settings page or navigation destination. The page-level integration passes sanitized context into a separate deterministic post-retrieval layer. With the preference off, unavailable, or cleared, results preserve the exact public candidate IDs, sections, ordering, and Hidden visibility. When enabled, Hidden suppresses only that exact show from eligible personal discovery; an explicit exact-title search and the direct route still find it. Hidden does not imply dislike of a genre, creator, collection, or similar show.

Saved and Listening are weak positive anchors only when no private rating exists. Only ratings explicitly entered by the listener may influence Personal Discovery: 5/4 are positive anchors, 3 neutral, and 2/1 negative. Finished is never a positive anchor; Dropped is not a negative anchor unless an explicit low rating independently supplies that signal. Archive and Community Ratings, passive behavior, and inferred values are never substitutes. Hidden and Dropped never generalize to similar shows.

**Implementation status (2026-09-29):** Homepage search and existing show-page Try Next use the helper only after ordinary candidate eligibility. It preserves hard requirements, exclusions, similarity gates, and authored/computed provenance, and renders a reason only for an actual reorder. Collections and creator/entity identity are not personalized. The `new-to-you` exact-Finished scope is supported by the helper but is not currently used by a public surface.

## Why

This preserves the device-local Library independently from a separate, deliberate choice to personalize public discovery. It bounds the data Discovery needs and makes disabling Personal Discovery a precise parity contract.

## Rejected alternatives

- Always-on personalization would contradict opt-in.
- Discovery access to IndexedDB would couple ranking to storage and expose fields it does not need.
- Hidden as catalogue truth or as a broad negative-preference signal would make a personal action affect other listeners or unrelated shows.
- Inferring a private rating from archive/community scores or passive behavior would violate explicit-input semantics.

## Revisit only if

Reviewed product evidence requires a different opt-in flow or an additional context field. Any change must preserve a data-minimal boundary, exact disabled-state parity, and the distinction between private and public ratings.
