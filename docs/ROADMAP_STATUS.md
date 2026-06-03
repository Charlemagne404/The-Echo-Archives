# Roadmap Status

## Status labels

- `technical-ready`: the site and tooling support this gate, but human QA, launch timing, or content decisions may still be pending
- `content-pending`: the technical prerequisites are in place, but the gate still depends on user-authored catalog, review, collection, or changelog data
- `complete`: both the technical and content requirements for the gate are satisfied

## Current baseline

As of June 3, 2026, the technical continuation work is in place without adding any new catalog entries, reviews, collections, changelog entries, creator records, or network records.

Implemented in this pass:

- homepage trust stats and last-updated signal
- structured homepage filters plus a public recently-updated mode
- empty-state recovery actions
- consistent Ask the Archivist copy updates
- expanded intake support for listener reviews and creator verification
- optional schema and dataset validation for future creator, network, changelog, and recommendation-reason data
- link-check, data-validation, backend tests, and browser smoke coverage

## Gate status

| Gate | Status | Notes |
| --- | --- | --- |
| Gate A - Stable Public Beta | `technical-ready` | Trust signals, route hardening, intake updates, validation scripts, and smoke tests are done. Manual QA and launch timing remain human decisions. |
| Gate B - Community Growth Ready | `content-pending` | Validation and scaffolding exist, but 50+ shows, 8+ reviews, 10+ collections, and real recommendation reasons still depend on future content. |
| Gate C - Discovery Advantage Ready | `content-pending` | Structured filters, recently-updated mode, and empty-state recovery are live. Recently-added and recommendation-reason surfaces remain gated by missing data. |
| Gate D - Trust And Contribution Ready | `technical-ready` | Intake, provenance storage, and manual moderation plumbing exist. Public contribution surfaces still depend on reviewed content, not auto-publish. |
| Gate E - Final-Vision Release Candidate | `content-pending` | The platform is extended for future scale, but the release candidate still depends on catalog depth, reviews, collections, creator/network data, and final policy text. |
