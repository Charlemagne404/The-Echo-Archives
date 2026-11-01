# Scalable Show Importer

## Contract

The importer is a factual preparation lane, not an editorial generator. A normal source-rich import progresses through discovery, source enrichment, conflict resolution, cover handling, record preparation, and factual publication validation. It stops at `ready` until an authenticated maintainer explicitly approves publication.

New records prepare as `reviewStatus: "imported"`, the lowest public confidence tier. Imported means objective metadata passed strict automated source checks but has not received an individual maintainer review. Ratings, reviews, archive copy, tones, themes, best-for values, similarities, collection membership/reasons, featured state, accents, awards, popularity, creator-verification claims, and unsupported completion claims are never generated. Missing optional facts remain absent or are represented as unknown/unclear. Existing records and update candidates preserve their current tier and human-owned fields.

## Sources And Confidence

RSS and Podcasting 2.0 data are primary for identity, dates, episodes, descriptions, type, structured people, transcripts, funding, GUID, medium, license, and location. An official site is primary for reciprocally linked credits and exact official/support/platform links. Apple and Podcast Index supply identity cross-checks and directory fallbacks. A discovered website feed is held as `websiteFeedUrl`; it becomes podcast RSS only after the feed contains podcast metadata or audio episodes. A generic blog feed cannot establish podcast identity.

Some audio-fiction projects have no conventional podcast feed. The initial supported external identity is an Amazon Music show UUID, stored as `amazonMusicId` and always kept distinct from RSS URLs and Podcast GUIDs. An authenticated maintainer must open the exact Amazon show listing and confirm the candidate title, creator, and proposed description through `POST /api/maintainer/imports/:id/external-identity`. That action records selected listing evidence and a maintainer attestation; it does not mark the rest of the facts reviewed. The importer checks the provider URL, show UUID, redirects, and uniqueness. Amazon Music is an external platform identity, not RSS or a Podcast GUID. New providers need their own allowlisted URL parser and adapter; never accept an arbitrary URL or infer identity from a general website feed.

When a known source disagreement must remain unresolved, a candidate may carry a `deferredFields` hold for a supported optional field. The importer leaves that value blank, keeps the original source evidence, and reports the unresolved reason as an optional gap. This is a conservative preparation choice, not a factual-review stamp.

Publisher-supplied RSS/iTunes categories and keywords remain provenance in `metadata.sourceCategories` and `metadata.sourceKeywords`. Deterministic source mappings may populate canonical genres and feed formats: an exact source label of `full-cast` or `full cast` maps to the canonical `full-cast` format, while broader wording is not inferred. Pending editorial recommendations are retained under `metadata.import.editorialRecommendations`; they do not populate public genres, formats, or tags. Public discovery tags must use the approved taxonomy and are never copied from raw source keywords automatically.

### Default scope boundary

The ordinary automatic discovery/publication lane accepts English-language
fiction and audio drama. Non-English candidates and actual play/TTRPG content
are marked `out-of-scope`; they are not queued for ordinary automatic
publication. Borderline candidates require explicit maintainer handling.

This scope rule is enforced by the deterministic classifier in
`backend/lib/services/import-service.js` and covered by importer tests. It does
not prevent a future, separately governed scope expansion.

Prepared records also retain high-signal feed facts without expanding the default browse cards: observed runtime coverage and seasons, first/latest/latest-feed/next scheduled release dates, transcript coverage/languages/formats, structured owner and production metadata, feed cadence, licensing, explicit flag, and source format. The show page surfaces only the listener-useful subset—upcoming release, cadence, and transcript availability—in its existing Facts & links card.

Only the official homepage and up to four same-origin, depth-one pages labeled listen, about, cast, credits, episodes, or transcripts are fetched. DTD/entity XML, private-network URLs, unsafe redirects, oversized responses, unsupported MIME types, malformed documents, corrupt images, and SVG covers are rejected.

### Outbound source requests

`backend/lib/import/fetch.js` permits HTTP(S) URLs without credentials and rejects local hostnames and non-public destination addresses. For hostnames it resolves all A and AAAA answers, rejects the whole answer set if any address is prohibited, and binds the validated set to Node's HTTP lookup callback for that connection. The HTTP client therefore cannot perform a second DNS lookup after validation. HTTPS keeps the URL hostname for both the `Host` header and TLS server name, with Node's normal certificate verification enabled.

Redirects are manual and limited to five hops by default (at most eight when explicitly configured). Each redirect is parsed, resolved, checked against the same address policy, and pinned before the next connection. The policy blocks private, loopback, link-local, shared, multicast, reserved, and documentation ranges; IPv4-mapped IPv6 and the standard NAT64/6to4 forms are checked against their embedded IPv4 destination. Other IPv6 destinations must be globally assigned unicast space. The ranges follow the [IANA IPv4 special-purpose registry](https://www.iana.org/assignments/iana-ipv4-special-registry) and [IANA IPv6 special-purpose registry](https://www.iana.org/assignments/iana-ipv6-special-registry), including their globally reachable exceptions.

Policy rejections fail before opening the prohibited connection with `IMPORT_UNSAFE_URL`. The import workflow retains the normal source failure evidence and maintainer-facing error code. Address validation is application-level; deployment egress controls and any network-specific address translation still need to be evaluated for the actual host.

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

Basic candidate readiness requires:

- a stable RSS, Podcast GUID, Apple, Podcast Index, or authenticated external-platform identity
- a source-supported title
- at least one listen link confirmed by a successful source fetch
- valid URLs and dates
- in-scope audio-fiction classification
- no blocking source conflict or duplicate ambiguity

Description, credits, genres, formats, discovery tags, artwork, and lifecycle status are optional for provisional `indexed-only` publication. Missing values stay blank or `unknown`/`unclear`; pending recommendations remain under importer provenance. If cover usage rights are not established, the candidate can explicitly use the bundled Echo logo placeholder. The placeholder path prevents cover recovery from fetching artwork from an external source during publication.

`indexed-only` provisional publication requires a current authenticated factual-review stamp plus recorded in-scope evidence, source provenance, and a stable identity. Its catalogue validation permits empty descriptions and discovery metadata only when that review record is valid. Any re-preparation increments the candidate revision and makes an earlier stamp stale. Imported publication retains the stricter automated gate: high-confidence title/description and exact identity, sufficient source-backed discovery metadata, and no manually selected core metadata.

Apple's 1400-3000px JPG/PNG artwork target is reported as a quality warning. Credits, description, artwork rights, tags, release/completion/explicit status, exact episode totals, and other optional facts may remain absent with explicit warnings for provisional entries.
When available sources provide no episode count, the prepared record uses `countQualifier: "unknown"` and omits the numeric episode breakdown rather than reporting zero.

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

## Echo Publisher

`echo-publisher` is the supported local operator workflow for reviewed batches.
It runs through a restricted host runner and the production service's private
Unix socket; it does not use the browser maintainer interface or write
production JSON/SQLite itself. The host runner accepts only plan, inspect,
evidence resolution, apply, status, and verification operations, and its
`sudoers` entry does not grant a shell or arbitrary command execution.

Planning resolves candidates by stable source-submission IDs and importer
provider identities in the active target database. It never uses a scratch
candidate ID from a preparation package. Missing target candidates are created
through `seedCandidates` and the ordinary importer worker. Planning can update
private importer state, but it never writes public catalogue content. The
immutable plan records the exact candidate revision and content hash, source
evidence, readiness, known fields, unknown optional fields, duplicate
matches, update target/diff, and existing record hash. Artwork without
republishing permission stays reference-only; the new record uses the bundled
Echo placeholder. Unknown optional fields remain unknown.

Apply requires the exact plan SHA-256 and one local operator authorization.
`--review-facts` is an explicit attestation for the exact eligible candidate
revisions in that batch. By default, the factual reviewer is the authorizing
OS operator. If Codex performed the source review, add `--reviewer codex`; the
candidate and receipt record `delegate:codex` as reviewer while the immutable
approval and event actor retain the authorizing operator. The public
verification note identifies delegated AI review without implying a human
review or creator approval. Research suggestions alone never stamp a review.
The operation never fills facts or stamps a review during planning. Evidence
selection and external identity confirmation are separate explicit decisions
against current target-environment evidence; each decision is audited and
generates a replacement plan. Add `--reviewer codex` to `resolve` when Codex
performed that evidence review; the audit stores Codex as the reviewer and the
local operator as the authorizer. Use `--review-facts` only after the source
evidence was actually reviewed and the batch authorization is legitimate.

Publication rechecks the plan while holding the existing cross-process
`import-staging/publish.lock`, publishes every eligible operation in one
atomic batch, and relies on importer rollback/build validation. Updates use
the existing managed-field merge, which preserves human-owned editorial
fields and the record's current publication tier. A plan that no longer matches
its target revisions or catalogue record is rejected before catalogue writes.
Persistent plan/approval/receipt files stay in `import-staging`, which is
preserved in future runtime overlays and included in the existing off-site
recovery inventory. See [`deploy/RELEASE_WORKFLOW.md`](../deploy/RELEASE_WORKFLOW.md)
for the separate host install and operator steps.

Receipts distinguish the catalogue transaction from generated-catalog,
in-process, and public-site verification. The host runner compares each
serialized public show record with the verified runtime record. If the public
check fails after a completed catalogue write, the receipt says so and `verify`
can be retried without re-publishing. A retry of a completed plan is
verification-only; publication events recover a receipt if the process stopped
after commit but before saving one.

## Elevation desk

The protected Imports page includes an **Elevation desk** for deepening already-published records. It ranks two deliberate paths without using unverified popularity:

- **Fact-check to indexed-only** favors clear in-scope identity, healthy official-source snapshots, factual completeness, and a current factual-review path. Starting this action creates a normal importer `update` candidate, so factual edits retain the usual evidence, reviewer locks, readiness checks, and atomic rollback before promotion.
- **Build a full review** considers the same factual baseline plus underrepresented discovery coverage and missing collection/similar-show routes. It saves the review companion and editorial fields as a draft; an Imported record becomes `planned` while that companion exists and may only become `full-review` after factual review plus the normal editorial completeness checks.

Every elevation can copy a Codex brief containing the current catalog facts, retained source URLs, known gaps, and a target-specific requested output. It intentionally excludes private maintainer identity and raw snapshots, and does not research, invent, or publish anything automatically.

Human-owned fields are always preserved. Legacy non-empty factual fields are preserved until explicitly adopted. For importer-managed fields, `metadata.import.managedFingerprints` records the previous imported value. A later human edit changes that fingerprint and automatically locks the field against refresh. Public generated data strips fingerprints and internal workflow identifiers while retaining source references and per-field confidence/method.

An update seed may name `preserveExistingFields` to lock selected existing fields during preparation. The current supported explicit locks are `credits` and `creators`; the prepared update records these locks and excludes them from the update diff.

An update seed may name `preserveExistingFields` to lock selected existing fields during preparation. The current supported explicit locks are `credits` and `creators`; the prepared update records these locks and excludes them from the update diff.

## Interfaces

- `POST /api/maintainer/imports` queues work and returns `202` with a run ID and candidate IDs.
- `GET /api/maintainer/imports/runs/:runId` returns persistent progress.
- `POST /api/maintainer/imports/runs/:runId/retry` retries exhausted jobs.
- `POST /api/maintainer/imports/:id/hydrate` and `/draft` are compatibility aliases that queue preparation.
- `POST /api/maintainer/imports/:id/retry` queues a fresh input revision.
- `POST /api/maintainer/imports/:id/evidence` selects and locks field evidence.
- `POST /api/maintainer/imports/:id/external-identity` verifies a supported external platform identity after authenticated confirmation of the exact title and creator.
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

The batch command is `npm --prefix backend run echo-publisher -- <command>`.
On the production host, the installed `echo-publisher` wrapper targets the
active production release and the service's fixed production database/runtime
overlay. Plans, approvals, and receipts are private to the service account.

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
