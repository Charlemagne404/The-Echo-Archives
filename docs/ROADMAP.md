# Roadmap

## Purpose

This is the active roadmap for The Echo Archives after the 1.0 release.

Use it as the source of truth for:

- current release status
- post-release priorities
- catalog and editorial quality gates
- production-readiness follow-up
- deferred product decisions

Use [`docs/CURRENT_STATE.md`](CURRENT_STATE.md) for the implemented product
snapshot, [`docs/generated/catalog-status.md`](generated/catalog-status.md) for
generated catalog evidence, and [`docs/OPERATIONS.md`](OPERATIONS.md) for the
deployment and recovery runbook. Historical planning docs live in
[`docs/archive/`](archive/).

## Release 1.0 Baseline — 2026-08-18

The 1.0 product baseline is shipped in the repository. It includes:

- split JSON catalog authoring under `catalog-src/`
- generated runtime data and search index under `data/`
- reusable show and collection routes
- homepage search, structured filters, quick filters, recently updated mode, featured collections, and most-popular fallback ordering
- compact show cards, collection routes, share actions, and no-result recovery
- anonymous community ratings with production write safeguards
- moderated show, correction, listener-review, and creator-verification intake
- protected submission, import, elevation, and collection-maintainer workspaces
- explicit Imported, indexed-only, planned, and full-review publication paths
- grounded site-help and a preserved Archivist integration that is disabled by default
- generated public pages, sitemap, robots rules, responsive assets, service-worker offline fallback, and route-level SEO metadata

The current generated catalog snapshot contains:

| Metric | Current value |
| --- | ---: |
| Published shows | 724 |
| Imported shows | 517 |
| Indexed-only shows | 200 |
| Full reviews | 7 |
| Collections | 46 |
| Creator-verified shows | 0 |

Exact counts and gap detail remain generated evidence, not hand-maintained
product copy. The latest catalog-authored update is 2026-09-04.

The catalog report is complete as of 2026-09-04: Big Grande has verified
observed runtime data from its current official RSS/Apple sources, and Machina
has an explicit evidence-backed `metadata.researchGaps` note because no full
episode duration can currently be verified. The three missing RSS links and
the other documented research gaps remain visible in the generated report.
This is separate from host, provider, recovery, browser, and deployment checks,
which are recorded in the current dated release QA report.

## Roadmap Rules

- Keep the product useful for discovery before adding heavier community systems.
- Use Imported only for objective records that pass the strict automated gate.
- Keep indexed-only promotion, full-review publication, creator verification, and collection approval explicit and reviewable.
- Treat missing evidence as `unknown` or an explicit research gap; never infer certainty from silence.
- Preserve the dark, compact, cinematic archive identity.
- Prefer better coverage, cleaner metadata, and stronger recommendation context over new feature classes.
- Keep public submission moderation-first; nothing user-submitted auto-publishes.
- Re-run generated catalog/page checks after authored data or page-source changes.

## Deferred Work

Keep these out of scope unless a demonstrated bottleneck changes the decision:

- full CMS migration
- mandatory account system
- forums or comments-first community
- public API
- paid subscriptions
- heavyweight recommendation infrastructure
- native mobile apps
- creator or network directories without enough entity coverage

## Current Priorities

1. Close or explicitly document the two runtime-duration blockers so the generated catalog report is green.
2. Complete the repository, host, external-provider, backup/restore, monitoring, and browser gates recorded in the 1.0 release QA report.
3. Increase editorial depth beyond 7 full reviews without weakening the factual Imported/indexed-only lanes.
4. Improve weak collection and similarity coverage where it creates a real listener route.
5. Add creator verification only when a real official-source review has been completed.
6. Keep search, filters, collection automation, and site-help grounded in current catalog data.

## Catalog Quality Policy

The previous Phase 2 numeric floor was 129 published shows, 7 full reviews, and
29 collections. The 1.0 catalog exceeds those floors numerically, but the
current generated report is the authority for whether the quality gate is
complete. Numeric breadth alone does not close a factual blocker.

The active policy is tier-aware:

- full-review and spotlight records may carry archive takes, detailed editorial context, tones, formats, best-for signals, and reasoned similarity/collection context
- indexed-only records are factual-first and must not receive invented ratings, tones, best-for claims, similarities, or other unsupported editorial recommendations
- Imported records are automation-checked objective records and cannot carry archive-owned editorial fields
- creator verification confirms factual metadata only and never implies creator approval of ratings, reviews, or collection placement
- the ordinary automatic publication lane is English-language fiction/audio drama; actual play/TTRPG and non-English candidates remain out of scope unless separately governed
- unknown or unverifiable facts stay explicit through `unknown` or `metadata.researchGaps`

## Workstream: Catalog And Editorial Depth

The catalog is broad enough for a real 1.0 release but remains uneven in depth.

Next work:

- preserve the three documented missing RSS cases and documented runtime unknowns until new evidence appears
- convert selected Imported records to indexed-only through current factual review
- move selected high-value records through the elevation desk into full review
- add reviews where they improve recommendation routes, not merely to raise a count
- improve descriptions, lifecycle facts, runtime framing, and source provenance without inventing completeness

Exit evidence:

- `npm run report:catalog` has zero blocking errors
- `npm --prefix backend run validate:data` passes
- review, taxonomy, scope, and link checks pass
- generated catalog output matches its authored source

## Workstream: Discovery Quality

Search, filters, collections, and similar-show routes are already implemented;
the next advantage must come from better data and reasoning.

Next work:

- improve the 624 records with fewer than two collection memberships where a real route exists
- review the 654 records outside the preferred similarity-link range without fabricating relationships
- keep collection reasons specific, listener-facing, and source-backed by the archive’s editorial policy
- expose new filters only when the supporting metadata is consistent enough to be trustworthy
- preserve fast short-query search and identity-field relevance
- keep no-result recovery useful through collections, similar routes, and submission/correction paths

Exit evidence:

- discovery changes are backed by structured catalog fields
- search and filter tests cover ranking, empty states, and short queries
- collection and similarity reasons remain present in raw HTML where indexable
- performance and mobile behavior remain within the existing release budget

## Workstream: Trust And Contribution

The 1.0 contribution layer is moderation-first and intentionally lightweight.

Next work:

- keep archive rating, community rating, listener reviews, Imported status, and creator verification visually and semantically separate
- maintain explicit moderation states and provenance for accepted corrections
- enable production community writes only after the configured Turnstile, voter-secret, rate-limit, and live-flow checks pass
- continue to treat read-only community ratings as a supported degraded state
- keep the maintainer submission queue and reports useful without turning them into a general CMS

Exit evidence:

- public input never auto-publishes
- accepted factual changes retain source evidence
- abuse controls, thresholds, and private storage remain covered by tests and operations checks

## Workstream: Collection Automation

The collection engine supports rule-based and semantic definitions while keeping
editorial ownership visible.

Next work:

- review proposed candidates in the protected collection workspace
- preserve manual additions, pins, removals, and audit history across regeneration
- keep semantic suggestions below the public threshold until approved
- never allow automation to overwrite maintainer-authored descriptions or silently reintroduce a manual removal

Exit evidence:

- collection regeneration is deterministic for rule-based definitions
- semantic confidence and rationale remain private operational evidence
- public collection snapshots contain only approved memberships and reasons

## Workstream: Creator, Network, And Archive Context

The 1.1.0 Creators implementation adds a curated unified registry, explicit
relationships, directory/detail discovery, linked facts, More from sections and
search integration. The initial pilot is documented in [Creators authoring](CREATORS.md).

Next work:

- complete factual creator verification for real official-source submissions
- expand the unified entity registry gradually after reviewing ambiguous aliases, company/person distinctions and network affiliations
- review remaining QCODE co-productions and candidate Rusty Quill, Atypical Artists and Long Cat Media relationships
- add changelog data only if it provides a maintained listener-facing archive history

Exit evidence:

- new entity records have source provenance and meaningful cross-catalog value
- no empty directories or parent-brand wrapper experience is introduced

## Workstream: Production Operations

The codebase contains the deployment, proxy, monitoring, backup, restore, and
rollback runbooks, but local repository evidence cannot prove that the live host
or external providers are configured correctly.

Next work:

- verify production `SITE_URL`, maintainer secrets, access observability, rating-write state, and Archivist flag
- validate Caddy/TLS/DNS/HSTS and the legacy-host redirect on the target host
- complete encrypted off-host backup retention and an independent restore drill
- confirm uptime, service, disk, backup, and error monitoring
- complete physical iOS Safari and Android Chrome checks
- record a new dated QA report whenever a release gate changes state

Exit evidence belongs in `docs/OPERATIONS.md` and a dated `docs/qa/` report. Do
not mark these gates complete from local unit tests alone.

## Release Gates

| Gate | Status | Meaning |
| --- | --- | --- |
| 1.0 product baseline | Current | The shipped static-first product and protected workflows are represented in the repository. |
| Catalog quality | `complete` | Numeric floors are exceeded and the generated report has zero blocking errors and zero actionable RSS gaps; remaining gaps are explicitly documented. |
| Repository verification | `partial` | Backend validation and tests pass, and the structure check completes with soft-limit warnings; the full root gate and complete browser batch have not passed in this closeout. |
| Production operations | `unverified` | Host, external provider, recovery, monitoring, and live browser evidence are not established by this local docs pass. |
| Post-1.0 discovery | `next` | Improve data-backed search, filters, collection routes, and recommendation context. |
| Mature archive | `future` | Broader editorial depth, creator context, and sustained quality follow-through. |

Status labels:

- `Current`: the release baseline is the active product state
- `content-pending`: implementation exists but catalog/editorial evidence still has an open blocker
- `blocked`: a required repository gate currently fails
- `partial`: focused repository gates pass, but the complete verification gate remains unfinished
- `unverified`: evidence requires the target host, provider, or physical device
- `next`: the next planned workstream
- `future`: intentionally later work

## Open Questions

- Which of the weak collection and similarity relationships create enough listener value to justify editorial review?
- How many full reviews can be maintained without reducing factual catalog quality?
- When does creator verification have enough adoption to justify a richer public trust state?
- Should a maintained changelog become a public route, or remain release/QA documentation only?

Default: keep the lightest system that makes evidence, editorial judgment, and
release status visible.
