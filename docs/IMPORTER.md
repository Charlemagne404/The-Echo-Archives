# Scalable Show Importer

## Contract

The importer is a factual preparation lane, not an editorial generator. A normal source-rich import progresses through discovery, source enrichment, conflict resolution, cover staging, record preparation, and factual publication validation. It stops at `ready` until an authenticated maintainer explicitly approves publication.

New records publish as `reviewStatus: "indexed-only"`. Ratings, reviews, archive copy, tones, best-for values, similarities, collection membership, featured state, accents, awards, popularity, and creator-verification claims are never generated. Missing optional facts remain absent or are represented as unknown/unclear.

## Sources And Confidence

RSS and Podcasting 2.0 data are primary for identity, dates, episodes, descriptions, type, structured people, transcripts, funding, GUID, medium, license, and location. An official site is primary for reciprocally linked credits and exact official/support/platform links. Apple and Podcast Index supply identity cross-checks and directory fallbacks.

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

Apple's 1400-3000px JPG/PNG artwork target is reported as a quality warning, not an Echo publication blocker. Credits, RSS, transcripts, extra platforms, status, exact episode totals, and other optional facts may remain absent with explicit warnings.

## Persistence And Scale

SQLite stores candidates, runs, leased jobs, identity mappings, retained source snapshots, source cache entries, field evidence, review locks, prepared records, readiness reports, and event history. Candidate states are `queued`, `processing`, `ready`, `needs-review`, `failed`, `published`, `duplicate`, and `rejected`.

Exact identities upsert candidates. Exact catalog identities create update candidates. Title-only matches remain review prompts. Feed redirects and Podcast GUIDs are retained as identities. Queue text search uses FTS5 rather than scanning JSON.

Workers claim persistent two-minute leases, safely reclaim expired work, process four candidates concurrently by default, and limit each host to two requests. Apple is limited to 15 requests per minute. Conditional RSS requests use ETag and Last-Modified cache metadata. Timeout, 408, 429, 5xx, and network failures retry up to four attempts using jittered 30-second, 2-minute, and 10-minute delays while honoring Retry-After.

Raw bodies are gzip-compressed and capped. Per source identity, raw bodies remain available for the latest two successful snapshots and latest failure; older snapshot rows are compacted to lightweight hash/normalized history instead of deleted. Hashes and normalized field evidence persist. Published snapshot compaction can be performed without changing selected evidence or canonical records.

## Publication And Update Protection

Prepared records live only in SQLite. Approval acquires a cross-process publish lock, promotes the staged cover, writes only the affected split show files and order manifest, validates/builds once, and then marks candidates published. A failure restores authored files and cover bytes, rebuilds the prior generated state, and leaves the candidate `ready` with an actionable error. Batch publication accepts individually reviewed ready candidates and runs one catalog build.

Human-owned fields are always preserved. Legacy non-empty factual fields are preserved until explicitly adopted. For importer-managed fields, `metadata.import.managedFingerprints` records the previous imported value. A later human edit changes that fingerprint and automatically locks the field against refresh. Public generated data strips fingerprints and internal workflow identifiers while retaining source references and per-field confidence/method.

## Interfaces

- `POST /api/maintainer/imports` queues work and returns `202` with a run ID and candidate IDs.
- `GET /api/maintainer/imports/runs/:runId` returns persistent progress.
- `POST /api/maintainer/imports/runs/:runId/retry` retries exhausted jobs.
- `POST /api/maintainer/imports/:id/hydrate` and `/draft` are compatibility aliases that queue preparation.
- `POST /api/maintainer/imports/:id/retry` queues a fresh input revision.
- `POST /api/maintainer/imports/:id/evidence` selects and locks field evidence.
- `POST /api/maintainer/imports/:id/publish` explicitly approves one ready candidate.
- `POST /api/maintainer/imports/batch-publish` publishes individually reviewed ready candidates in one build.
- `POST /api/maintainer/imports/audit` queues safe refresh candidates for the current catalog without changing it.

CLI commands are `import:seed`, `import:hydrate`, `import:draft` (SQLite preparation compatibility alias), `import:publish`, `import:audit`, `import:report`, and `import:benchmark`.

## Recovery

If a worker stops, restart the service; expired leases are reclaimed. For a source failure, inspect source health and use retry after correcting credentials or remote availability. For a conflict, select the supported evidence in the maintainer workspace; that selection is confidence `1.0` and locked. For a failed publication, inspect `lastError`; authored files and cover bytes have already been restored, so correct the blocker and retry approval. Database backup/restore follows the main operations runbook.
