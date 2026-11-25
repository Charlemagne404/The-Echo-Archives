# Operation Clean Slate — Execution Plan

**Started:** 2026-11-25
**Candidate branch:** `codex/echo-operation-clean-slate`
**Baseline:** `b75221a67f11c3899d6c3c0ffeea7e5527e065d5` (`codex/echo-immediate-production-fixes-20261125`), based on `main` at `7df736b7`
**Candidate checkout:** `/tmp/echo-archives-operation-clean-slate`

## Guardrails

- Keep the deployed release, production and shared staging unchanged. Do not run live publication, migration, deployment, promotion, service restart, or database mutation commands.
- Leave the historical `Deployment` branch untouched and outside consolidation.
- Preserve authored editorial content, production data, every existing stash, and all existing branches/worktrees. Use synthetic fixtures for verification.
- Preserve Echo's static-first architecture and current product identity. Make targeted changes only when evidence supports them.
- Keep verification concurrency low. The host currently has 67 GiB free and full swap; memory pressure is low, but avoid concurrent heavyweight jobs.
- The canonical checkout's `.git` is read-only. Work in the isolated clone under `/tmp`; do not attempt to alter canonical Git metadata or publish the candidate without separate authorization.

## Workstreams and acceptance criteria

| Priority | Workstream | Acceptance criteria | Status |
|---|---|---|---|
| P0 | Baseline and immediate fixes | Verify the runtime catalog, generated/public projections, review eligibility, search worker lifecycle, sort readiness, and mobile filters. Add targeted regression coverage; record any unverified behavior. | Complete — targeted suites and browser smoke passed |
| P1 | Repository and development-work recovery | Compare branch ancestry and patch equivalence using available refs; inspect the named WIP stash without applying or dropping it; disposition worktrees without deleting anything; retain useful work or document its status. | Complete — captured refs only; all branches, worktrees, and stashes preserved |
| P1 | Catalog/publication consistency | Map source, generated, runtime, rendered, SEO, and cache inputs; reproduce relevant update/deployment cases with isolated fixtures; fix confirmed consistency defects safely. | Complete — private/incomplete review projection leak fixed; publication paths reviewed |
| P1 | Importer, moderation, and publication lifecycle | Inspect idempotency, recovery, permissions, concurrency, and duplicate handling; make bounded fixes without auto-publishing or changing production queues. | Complete — durable handoff, publication resolution, recovery, and claim coverage added |
| P2 | Public and maintainer behavior | Review key discovery, detail, collection, entity, contribution, and maintainer flows with existing tests and local browser evidence where available; prioritize concrete breakage. | Scoped review complete — focused public, maintainer, and browser suites passed |
| P2 | Security, SEO, accessibility, and compatibility | Reuse recent audit evidence; inspect changed or high-risk boundaries; repair confirmed defects and record limits. No invasive production probing. | Scoped review complete — security/SEO suites and invariants reviewed; no exhaustive accessibility audit |
| P2 | Release, cache, and operational reliability | Review release scripts and recovery semantics statically or with temporary fixtures; do not change live host state or shared staging. | Complete locally — recovery/build checks passed; live host and deploy state not queried |
| P3 | Documentation and repository hygiene | Correct current authoritative guidance where demonstrably stale; preserve historical reports and artifacts; avoid broad cleanup. | Complete — importer/schema guidance and mission reports updated |
| P0 | Final verification and second-pass review | Run focused checks during work and one proportionate final verification; review the complete candidate diff for regressions, secrets, generated artifacts, and unsupported claims. | Complete — focused checks passed, diff reviewed, implementation committed locally |

## Execution sequence

1. Establish a reproducible local baseline and resolve the immediate rendering/search/review issues before integration.
2. Inventory current and historical branches, worktrees, the named stash, active scripts, and recent stability evidence. Do not delete or rewrite references.
3. Trace catalog publication through generated data, HTML/SEO, caches, and deployment preservation. Add synthetic regression cases for demonstrated gaps.
4. Review importer/moderation, public flows, security, accessibility, release and operations boundaries; implement the highest-impact safe fixes.
5. Update authoritative docs only where evidence warrants it. Record branch/worktree disposition and blocked host actions.
6. Run final targeted/full checks as resources allow, conduct a skeptical diff review, commit coherent changes, and write `FINAL_REPORT.md` with exact evidence and remaining gates.

## Reprioritization rule

New work may be added only when it fixes a confirmed correctness, security, reliability, performance, or maintainability problem relevant to this mission. Reassess impact, risk, and verification cost before expanding scope.
