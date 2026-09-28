# 003 — Personal Discovery boundary

**Status:** accepted for 2.0 v1<br>
**Baseline:** v1.2.7, 55ca3969

## Decision

Personal Discovery is opt-in and defaults to off. The Library remains usable while it is off. `getPersonalContext()` returns a sanitized, immutable context with only the enabled flag and each entry’s `showId`, `state`, and optional explicitly entered `rating`. While disabled, the context contains no entries. Discovery receives no database object, timestamps, export metadata, title snapshot, analytics identifiers, or unrelated browser state.

The current Listener Library release stores the preference and exposes the context but does not apply personalized ranking or Hidden suppression yet. Once Discovery 2.0 consumes the context, disabled or paused results must equal the exact non-personalized baseline in candidate membership, sections, order, and visibility of hidden shows. When enabled, Hidden may suppress only that exact show from personalized discovery; its direct show route stays accessible and catalogue truth is unchanged. Hidden does not imply dislike of a genre, creator, collection, or similar show.

Only ratings explicitly entered by the listener may influence Personal Discovery: 4–5 are positive anchors, 1–2 negative anchors, and 3 neutral. Archive and Community Ratings are never substitutes.

## Why

This preserves the device-local Library independently from a separate, deliberate choice to personalize public discovery. It bounds the data Discovery needs and makes disabling Personal Discovery a precise parity contract.

## Rejected alternatives

- Always-on personalization would contradict opt-in.
- Discovery access to IndexedDB would couple ranking to storage and expose fields it does not need.
- Hidden as catalogue truth or as a broad negative-preference signal would make a personal action affect other listeners or unrelated shows.
- Inferring a private rating from archive/community scores or passive behavior would violate explicit-input semantics.

## Revisit only if

Reviewed product evidence requires a different opt-in flow or an additional context field. Any change must preserve a data-minimal boundary, exact disabled-state parity, and the distinction between private and public ratings.
