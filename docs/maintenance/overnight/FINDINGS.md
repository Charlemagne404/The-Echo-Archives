# Operation Clean Slate — Findings

Findings describe the isolated candidate and repository evidence as of 2026-11-25. Production and staging were not queried during this mission.

| ID | Severity | Finding | Evidence | Status |
|---|---|---|---|---|
| F-01 | High | The immediate rendering/search/mobile work existed only in the local baseline at mission start. | Candidate was based on `b75221a6`; `npm run test:home-browse` passed 14/14 and `npm --prefix backend run test:production-bug-fixes` passed 57/57 after targeted fixes. | Verified locally |
| F-02 | High | The canonical checkout's `.git` metadata is read-only to this run. | `git worktree add` could not create a branch ref. | Worked around with `/tmp/echo-archives-operation-clean-slate`; canonical checkout remains untouched |
| F-03 | Medium | Current GitHub ref freshness cannot be established. | Candidate fetch failed because the environment could not resolve `github.com`; local refs are snapshots only. | Open — do not push or claim current CI/ref status |
| F-04 | Medium | Some narrative docs contain dated catalog/operations snapshots. | `docs/CURRENT_STATE.md` and `docs/OPERATIONS.md` identify their snapshot dates; `docs/PRODUCT.md` directs current counts to generated catalog status. | Preserved as dated evidence; no broad rewrite |
| F-05 | Medium | The latest local host sample is above the 80% disk-monitor threshold, with swap fully occupied. | Sample showed 85% disk used, 67 GiB free, 4 GiB swap occupied, about 3.4 GiB available RAM, low memory PSI. | Observed only; no host remediation or live check |
| F-06 | Medium | Development branches and worktrees diverge and contain independent unpublished work. | Local ancestry shows materially divergent publication/publisher branches; about 20 worktrees were inventoried. | All refs/worktrees preserved; no wholesale merge |
| F-07 | Low | Data validation reports source-attribution warnings that require editorial evidence. | Local `validate:data` completed with zero errors but listed entity-type/relationship-role mismatches and duplicate roles. | Left unchanged for editorial review |
| F-08 | High | Undated review drafts and dated incomplete companions could be merged into public catalog/show-page projections without a full-review tier. | Companion content was merged without publication/completeness gating; public runtime catalog and show rendering used that merged content. | Fixed locally; route, catalog, and artifact tests pass |
| F-09 | High | Importing a public show submission did not persist a durable source-row link; candidate publication could leave the submission open and stale. | Import handoff previously created a candidate/event without writing its ID to `show_submissions`; publication did not resolve the source row. | Fixed locally with idempotent claim/link, explicit-publication resolution, recovery snapshot support, and tests |
| F-10 | Medium | Preserving never-reviewed submissions indefinitely would conflict with the published privacy retention policy. | `site-src/pages/privacy.html` says content/contact are retained no more than 180 days after review, or receipt if never reviewed; source IP/User-Agent are removed at 30 days. | No retention change made; durable linkage only supports reconciliation within existing policy |

## Repository disposition

- No local or remote `Deployment` branch was present in the captured refs.
- The importer/publisher WIP stash `dee787871012e179458fea4b04365391cb6dec41` and release-verification stash `12d62bbed79a413d43827d218e942e1b45ff18cf` were inspected by metadata/content and preserved without applying or dropping.
- Existing worktrees and untracked files were preserved. Divergent feature branches were documented rather than merged.

## Not established

- GitHub refs, CI state, or remote branch freshness after the captured local snapshot.
- Current production/staging release state, runtime behavior, database state, or deployment result.
- Physical-device behavior, assistive-technology behavior, or comprehensive accessibility conformance.
- Whether the existing entity attribution warnings should be changed; these need human source review.
- That the candidate is ready for deployment. It is a local review candidate only.
