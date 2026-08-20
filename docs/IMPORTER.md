# Scalable Show Importer — 1.0

## Contract

The importer is a factual preparation lane, not an editorial generator. A normal source-rich import progresses through discovery, source enrichment, conflict resolution, cover staging, record preparation, and factual publication validation. It stops at `ready` until an authenticated maintainer explicitly approves publication.

New records prepare as `reviewStatus: "imported"`, the lowest public confidence tier. Imported means objective metadata passed strict automated source checks but has not received an individual maintainer review. Ratings, reviews, archive copy, tones, themes, best-for values, similarities, collection membership/reasons, featured state, accents, awards, popularity, creator-verification claims, and unsupported completion claims are never generated. Missing optional facts remain absent or are represented as unknown/unclear. Existing records and update candidates preserve their current tier and human-owned fields.

## Sources And Confidence

RSS and Podcasting 2.0 data are primary for identity, dates, episodes, descriptions, type, structured people, transcripts, funding, GUID, medium, license, and location. An official site is primary for reciprocally linked credits and exact official/support/platform links. Apple and Podcast Index supply identity cross-checks and directory fallbacks.

Publisher-supplied RSS/iTunes categories and keywords remain provenance in `metadata.sourceCategories` and `metadata.sourceKeywords`. Deterministic source mappings may populate canonical genres and feed formats: an exact source label of `full-cast` or `full cast` maps to the canonical `full-cast` format, while broader wording is not inferred. Imported cards expose non-generic source-derived genres in a compact `Genre:` metadata line; a drama-only mapping is disclosed as `Genre not yet reviewed` because it does not distinguish content from the audio-drama medium. This card display does not populate public `tags`. Public discovery tags must use the approved taxonomy and are never copied from raw source keywords automatically. Human taxonomy selection, external research, and AI/editorial suggestions remain non-binding for Imported publication and require factual review when applied.

### 1.0 scope boundary

The ordinary automatic discovery/publication lane accepts English-language
fiction and audio drama. Non-English candidates and actual play/TTRPG content
are marked `out-of-scope`; they are not queued for ordinary automatic
publication. Borderline candidates require explicit maintainer handling.

This scope rule is enforced by the deterministic classifier in
`backend/lib/services/import-service.js` and covered by importer tests. It does
not prevent a future, separately governed scope expansion.

Prepared records also retain high-signal feed facts without expanding the default browse cards: observed runtime coverage and seasons, first/latest/latest-feed/next scheduled release dates, transcript coverage/languages/formats, structured owner and production metadata, feed cadence, licensing, explicit flag, and source format. The show page surfaces only the listener-useful subset—upcoming release, cadence, and transcript availability—in its existing Facts & links card.

Only the official homepage and up to four same-origin, depth-one pages labeled listen, about, cast, credits, episodes, or transcripts are fetched. DTD/entity XML, private-network URLs, unsafe redirects, oversized responses, unsupported MIME types, malformed documents, corrupt images, and SVG covers are rejected.

Confidence is deterministic:

- direct RSS or structured official-site data: `0.95`
- exact Apple/Podcast Index identities and platform URLs: `0.90`
- directory metadata: `0.75`
- deterministic inference: `0.70`
- unstructured assistance: no more than `0.60`, never auto-applied to a core field
- independent agreement: `+0.03` per additional source, capped at `0.99`
- reviewer-selected evidence: `1.0` and field-locked

All competing values remain in `catalog_import_field_evidence`. A material disagreement between high-confidence official sources creates a named blocking conflict. Explicit completion is required for `finished/completed`; a recent full episode may infer active/ongoing at `0.70`. An old or dead feed does not imply cancellation or completion.

## Readiness

`ready` requires:

- a stable RSS, Podcast GUID, Apple, or Podcast Index identity
- title and official description at confidence `0.75` or higher
- a square raster cover of at least 600px staged locally
- at least one listen link confirmed by a successful source fetch
- valid URLs and dates
- in-scope classification or an explicit maintainer override
- no blocking source conflict or duplicate ambiguity

Imported publication adds a stricter gate:

- exact stable identity from structured evidence at confidence `0.90` or higher
- title and description at confidence `0.90` or higher
- unambiguous in-scope fiction classification without a manual scope override
- verified listen link and valid staged local cover
- enough deterministic canonical discovery signals
  - no unstructured, AI-derived, reviewer-selected, or manually curated core/discovery field, including genres
- no duplicate ambiguity, source conflict, unsafe URL, or other readiness blocker

Indexed-only publication uses the base readiness gate plus a factual-review stamp for the current candidate input revision. Any re-preparation increments that revision and makes the earlier stamp stale.

Apple's 1400-3000px JPG/PNG artwork target is reported as a quality warning, not an Echo publication blocker. Credits, RSS, transcripts, extra platforms, status, exact episode totals, and other optional facts may remain absent with explicit warnings.

## Persistence And Scale

SQLite stores candidates, runs, leased jobs, identity mappings, retained source snapshots, source cache entries, field evidence, review locks, prepared records, readiness reports, and event history. Candidate states are `queued`, `processing`, `ready`, `needs-review`, `failed`, `published`, `duplicate`, and `rejected`.

Exact identities upsert candidates. Exact catalog identities create update candidates. Title-only matches remain review prompts. Feed redirects and Podcast GUIDs are retained as identities. Queue text search uses FTS5 rather than scanning JSON.

Workers claim persistent two-minute leases, safely reclaim expired work, process four candidates concurrently by default, and limit each host to two requests. Apple is limited to 15 requests per minute. Conditional RSS requests use ETag and Last-Modified cache metadata. Timeout, 408, 429, 5xx, and network failures retry up to four attempts using jittered 30-second, 2-minute, and 10-minute delays while honoring Retry-After.

Raw bodies are gzip-compressed and capped. Per source identity, raw bodies remain available for the latest two successful snapshots and latest failure; older snapshot rows are compacted to lightweight hash/normalized history instead of deleted. Hashes and normalized field evidence persist. Published snapshot compaction can be performed without changing selected evidence or canonical records.

## Automatic Discovery

Discovery is opt-in and separate from preparation. Maintainers configure narrow Apple Search or Podcast Index search sources, each with an explicit query, cadence, result limit, and optional borderline policy. Persistent discovery sources, leased `discover` jobs, runs, and source-item records retain every external item’s identity, first/last-seen time, resulting candidate, and disposition.

The discovery worker only queues new in-scope results. Existing catalog identities, already-open candidates, duplicates, and prior rejections are remembered and suppressed. Rejected and duplicate candidates can only return to preparation through an explicit maintainer reopen action; a later search or scheduled source check cannot revive them silently. Every candidate created this way retains its discovery source and run IDs.

The checked-in `echo-archives-discovery.timer` invokes the one-shot `import:discover` command every 30 minutes; each source’s own cadence decides whether it is due. The timer runs outside the website process. `IMPORT_AUTO_DISCOVERY=true` is available only for a deliberately opted-in in-process scheduler, and is disabled by default.

## Publication And Update Protection

Prepared records live only in SQLite. Approval requires an explicit `publicationTier` of `imported` or `indexed-only`, acquires a cross-process publish lock, promotes staged covers, writes only the affected split show files and order manifest, validates/builds once, and then marks candidates published. A failure restores authored files and cover bytes, rebuilds the prior generated state, and leaves candidates `ready` with an actionable error. Imported-eligible entries may be batch selected without per-entry review and publish in one catalogue build. Indexed-only publication requires a current factual review.

Published Imported entries can be promoted to indexed-only after a maintainer confirms identity, official description, links/artwork, source-derived genre mappings, approved discovery metadata, lifecycle claims, and remaining gaps. Corrected genres are recorded with maintainer provenance and therefore require the indexed-only factual-review path. Imported or indexed-only entries enter planned/full review through the existing companion-review workflow. Publication and promotion events retain the maintainer actor privately; public generated data exposes tier and non-identifying timestamps/revisions only.

## Elevation desk

The protected Imports page includes an **Elevation desk** for deepening already-published records. It ranks two deliberate paths without using unverified popularity:

- **Fact-check to indexed-only** favors clear in-scope identity, healthy official-source snapshots, factual completeness, and a current factual-review path. Starting this action creates a normal importer `update` candidate, so factual edits retain the usual evidence, reviewer locks, readiness checks, and atomic rollback before promotion.
- **Build a full review** considers the same factual baseline plus underrepresented discovery coverage and missing collection/similar-show routes. It saves the review companion and editorial fields as a draft; an Imported record becomes `planned` while that companion exists and may only become `full-review` after factual review plus the normal editorial completeness checks.

Every elevation can copy a Codex brief containing the current catalog facts, retained source URLs, known gaps, and a target-specific requested output. It intentionally excludes private maintainer identity and raw snapshots, and does not research, invent, or publish anything automatically.

Human-owned fields are always preserved. Legacy non-empty factual fields are preserved until explicitly adopted. For importer-managed fields, `metadata.import.managedFingerprints` records the previous imported value. A later human edit changes that fingerprint and automatically locks the field against refresh. Public generated data strips fingerprints and internal workflow identifiers while retaining source references and per-field confidence/method.

## Interfaces

- `POST /api/maintainer/imports` queues work and returns `202` with a run ID and candidate IDs.
- `GET /api/maintainer/imports/runs/:runId` returns persistent progress.
- `POST /api/maintainer/imports/runs/:runId/retry` retries exhausted jobs.
- `POST /api/maintainer/imports/:id/hydrate` and `/draft` are compatibility aliases that queue preparation.
- `POST /api/maintainer/imports/:id/retry` queues a fresh input revision.
- `POST /api/maintainer/imports/:id/evidence` selects and locks field evidence.
- `POST /api/maintainer/imports/:id/publish` requires `publicationTier` and explicitly approves one eligible candidate.
- `POST /api/maintainer/imports/batch-publish` requires `publicationTier` and publishes an eligible batch in one build.
- `POST /api/maintainer/imports/:id/factual-review` stamps the current input revision after maintainer fact checking.
- `POST /api/maintainer/imports/:id/promote` atomically promotes a fact-checked published Imported entry to indexed-only.
- `POST /api/maintainer/imports/audit` queues safe refresh candidates for the current catalog without changing it.
- `GET /api/maintainer/imports/discovery` lists configured sources and recent runs.
- `POST /api/maintainer/imports/discovery/sources` and `PATCH /api/maintainer/imports/discovery/sources/:sourceId` manage approved source searches.
- `POST /api/maintainer/imports/discovery/sources/:sourceId/run` schedules one source immediately.
- `POST /api/maintainer/imports/:id/reopen` explicitly reopens a rejected or duplicate candidate.
- `POST /api/maintainer/submissions/:id/import` hands a non-rejected public new-show submission into factual import preparation.

CLI commands are `import:seed`, `import:discover`, `import:hydrate`, `import:draft` (SQLite preparation compatibility alias), `import:publish -- <candidate-id> --tier <imported|indexed-only>`, `import:promote -- <candidate-id> --reviewer <name>`, `import:audit`, `import:report`, and `import:benchmark`.

## Recovery

If a worker stops, restart the service; expired leases are reclaimed. For a source failure, inspect source health and use retry after correcting credentials or remote availability. For a conflict, select the supported evidence in the maintainer workspace; that selection is confidence `1.0` and locked. For a failed publication, inspect `lastError`; authored files and cover bytes have already been restored, so correct the blocker and retry approval.

`backend/data/import-staging/` is durable operational state, not source code. It is
ignored by Git so normal imports do not dirty the deployment checkout, but it must
be included in the private recovery inventory together with the SQLite database.
Do not remove a staged cover merely because it is untracked or because its
candidate is not currently `ready`: candidates in other recoverable workflow
states may still reference it. Orphan cleanup must be a separate, dry-run-first
maintenance action performed only after a verified off-host recovery snapshot,
using an owner-approved retention period.

Database and complete recovery backup/restore follow the main operations runbook.
