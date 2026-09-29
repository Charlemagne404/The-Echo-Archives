# Overnight Agent Protocol

This is the authoritative coordination protocol for every overnight engineering agent working on The Echo Archives. Read it before doing task work. `docs/qa/OVERNIGHT-AGENT-QUICKSTART.md` is only a short entry point; it does not replace these instructions.

## Protected original checkout

**Do not work in or mutate the original checkout:**

`/Users/charliearnerstal/Documents/GitHub/The-Echo-Archives`

It may contain active, uncommitted work from other Codex sessions. Your work is intentionally based on the committed `codex/overnight-integration` branch, not that dirty checkout's UI or integration work. A later reconciliation campaign will combine the overnight branch with main after those sessions finish.

Overnight agents must NEVER edit, stage, commit from, stash, reset, clean, switch the branch of, restore files in, delete files in, or modify the Git index of the original checkout. Do not assume any dirty files there belong to you. You may inspect Git metadata there only when necessary to identify the common Git directory or verify branch/worktree registration. Do all task work in your assigned task worktree and all serialized integration work in the shared integration worktree below.

## Task worktree and handoffs

Each agent receives a unique `TASK_SLUG`. Use it exactly, in lowercase kebab case, in these names:

- Branch: `codex/overnight-<TASK_SLUG>`
- Worktree: `/Users/charliearnerstal/Documents/GitHub/.echo-codex-<TASK_SLUG>`

Before task work, verify that neither the branch nor the worktree path is already in use. Never use another agent's branch or worktree, delete another worktree, or reset another agent's branch. Start from the current `codex/overnight-integration` commit when creating your worktree. Record that exact starting commit as `ORIGINAL_BASE` in your handoff and final report. If integration advances while you work, rebase your task branch onto the newer integration commit under the lock before attempting integration.

For example, from a terminal outside the protected original worktree, resolve the current integration tip immediately before creating your own worktree, then pass that commit explicitly:

```sh
ORIGINAL_BASE="$(rtk proxy git rev-parse refs/heads/codex/overnight-integration)"
rtk proxy git worktree add -b "codex/overnight-$TASK_SLUG" \
  "/Users/charliearnerstal/Documents/GitHub/.echo-codex-$TASK_SLUG" \
  "$ORIGINAL_BASE"
```

If another agent advances integration just after this snapshot, your recorded base is still the exact commit from which your worktree was created; incorporate later commits by rebasing under the integration lock.

From the assigned task worktree, read every existing Markdown handoff in `docs/qa/agent-handoffs/` before beginning task work. These notes are the persistent communication channel between agents. Follow their integration constraints and preserve already integrated behavior. Read them again after acquiring the integration lock, because new notes may have arrived while you worked.

Use only your own task worktree for task edits. Stay within the assigned scope, minimize unrelated refactors, keep changes easy to rebase, and run focused tests during development. If you find an unrelated issue, document it for a later task instead of expanding scope automatically.

## Finish task work and write its handoff

Before integration:

1. Inspect `git status` and the complete task diff. Confirm every changed file belongs to your task.
2. Run `git diff --check` and the task's focused tests. Record exact commands and results.
3. Commit the task changes on `codex/overnight-<TASK_SLUG>`; never integrate a dirty task branch.
4. Create `docs/qa/agent-handoffs/<TASK_SLUG>.md` on the task branch. Commit the handoff on that branch too. To avoid a self-referential commit hash, the handoff's `Task commit` field is the task implementation commit; the final response separately reports the task branch's final HEAD, which also contains the handoff.

Use this handoff outline and fill in every field, including explicit `None` or `Not applicable` where appropriate:

```markdown
# <Task name>

- Task slug: `<TASK_SLUG>`
- Task branch: `codex/overnight-<TASK_SLUG>`
- Starting integration commit: `<ORIGINAL_BASE>`
- Task commit: `<implementation commit SHA>`
- Changes made: ...
- Bugs found/fixed: ...
- Important files/subsystems touched: ...
- Tests/results: ...
- Known limitations: ...
- Dependencies changed: ...
- Generated artifacts changed: ...
- Interactions with likely other campaigns: ...
- Compatibility concerns: ...
- Things later agents must preserve: ...

## Integration notes for later agents

- ...

## Integration result

- Pre-integration commit: ...
- Rebase/conflicts: ...
- Prior handoffs incorporated: ...
- Combined verification: ...
- Final overnight integration commit: ...
- Push result: ...
```

Keep one handoff file per task. Do not create or edit a shared mutable handoff document. The integration-result fields may be completed after combined verification; if integration is rejected, record the failure on the task branch and leave the overnight integration branch at its rollback point.

## Integration lock: one agent at a time

Agents may develop concurrently, but they MUST integrate serially. The actual lock is a directory under the repository's common Git directory:

`<common-git-dir>/codex-overnight-integration.lock`

For this repository the common Git directory is `/Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/.git`, so the lock is `/Users/charliearnerstal/Documents/GitHub/The-Echo-Archives/.git/codex-overnight-integration.lock`. Derive it with `git rev-parse --path-format=absolute --git-common-dir` from your own task worktree; do not create a lock under a task worktree or tracked source. Because the lock is under Git's common administrative directory, it is outside all worktree checkouts and needs no `.gitignore` entry.

Use atomic directory creation (`mkdir`) to acquire it. Keep the holder process alive for the entire integration; do not acquire in a short-lived shell that exits while you continue integrating. Record the slug, PID, hostname, and UTC start time in an `owner` file immediately after acquiring it. For example, in a persistent integration terminal, with `TASK_SLUG` set:

```sh
COMMON_GIT_DIR="$(rtk proxy git rev-parse --path-format=absolute --git-common-dir)"
LOCK="$COMMON_GIT_DIR/codex-overnight-integration.lock"
while ! mkdir "$LOCK" 2>/dev/null; do
  printf 'Integration lock occupied; waiting: %s\n' "$LOCK"
  sleep 10
done
printf 'task_slug=%s\npid=%s\nhost=%s\nstarted_utc=%s\n' \
  "$TASK_SLUG" "$$" "$(hostname)" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$LOCK/owner"
printf 'Lock acquired by %s (pid %s). Keep this holder shell alive until release.\n' "$TASK_SLUG" "$$"
```

Follow the repository's `AGENTS.md`/RTK instructions for shell commands. If the lock is occupied, wait; do not delete it, rename it, or take over merely because you have waited a long time. Do not release a lock whose owner metadata is not yours. At normal completion, verify the `owner` file has your slug, PID, and hostname, remove only that `owner` file, then use `rmdir "$LOCK"` (not recursive deletion). A failed `rmdir` means inspect the remaining contents and stop rather than deleting unexplained state.

### Forced stale-lock recovery

Recover a lock only with strong evidence that its owner is gone and no Git operation is active. Require all of the following: the recorded hostname is this host; the recorded PID is demonstrably absent (and not merely inaccessible or plausibly reused by another process); process inspection finds no active Git command operating on this common Git directory, the integration worktree, or the task refs; and no relevant Git lock files or in-progress operation state remain. If the host differs or evidence is ambiguous, do not recover it; contact the owner/operator.

Recovery must be deliberate and auditable, never automatic based on age. Acquire a sibling recovery guard with atomic `mkdir "$LOCK.recovery"`; recheck the owner/process/Git-lock evidence; then move the stale lock directory intact to a unique quarantine name such as `codex-overnight-integration.lock.stale-<UTC timestamp>-<TASK_SLUG>`. Do not delete the quarantined metadata. Remove only your empty recovery guard with `rmdir`. If any check fails, remove only your own empty guard and leave the occupied lock untouched. Record the evidence and quarantine path in the relevant handoff.

## Rebase immediately before integration

After acquiring the lock:

1. Inspect the latest `codex/overnight-integration` commit and read every handoff that arrived since your task began.
2. Compare your task branch with its recorded `ORIGINAL_BASE` so you can distinguish your changes from later integrated work.
3. Rebase your task branch onto the current `codex/overnight-integration` commit before touching the shared integration worktree. Rerun focused and overlapping-subsystem tests after the rebase.
4. Resolve conflicts semantically. Never blindly choose `ours` or `theirs`; preserve already integrated fixes and your demonstrated changes where compatible. Adapt your task if a newer campaign invalidates its assumptions. If you cannot safely reconcile the work, stop and follow the rejection procedure below.

## Shared integration worktree

The only shared integration checkout is:

`/Users/charliearnerstal/Documents/GitHub/.echo-codex-overnight-integration`

Use it only while holding the integration lock. Before any operation there, verify that it is on `codex/overnight-integration` and has a completely clean worktree and index. Never discard unexplained dirty state. Record its current commit as `PRE_INTEGRATION` in your handoff before changing it; this is the rollback point.

After the task branch is rebased and clean, update the shared integration worktree to the current branch tip only via a fast-forward operation (normally `git merge --ff-only codex/overnight-<TASK_SLUG>`). Do not create unnecessary merge commits, force-update the integration branch, or push to `main`.

## Combined verification and rejection

Validate the complete accumulated overnight branch after integrating; testing only your isolated task is insufficient. At minimum run:

- `git diff --check`
- Your task-focused tests
- Tests for overlapping subsystems and interactions with prior campaigns
- The repository's actual current full verification command, normally `npm run verify`; inspect `package.json` and use the current canonical full gate if that script has changed
- Any additional task-specific checks

Investigate failures. Do not retry repeatedly until a failure happens to pass and then call it fixed. Report pre-existing/environmental failures separately from failures caused by the combined branch.

If the task cannot be safely reconciled, or a task-caused combined failure cannot be fixed within scope, restore `codex/overnight-integration` in the clean, verified shared integration worktree to `PRE_INTEGRATION` while still holding the lock (for example, `git reset --hard "$PRE_INTEGRATION"`). This rollback is permitted only for the integration branch, only under the lock, and only after recording the rollback point and verifying there is no unexplained state. Leave the task branch intact. Record the conflict/failure and evidence in its handoff on the task branch. Do not force the task into the overnight branch. If unrelated untracked files appear, inspect them and stop; do not use broad cleanup to hide them.

## Successful integration and release

If combined verification passes, complete the handoff's integration-result section with the rebase/conflict outcome, prior handoffs incorporated, combined test commands/results, final integration commit, and push outcome. Commit that handoff update on `codex/overnight-integration` so the handoff and result are included in the shared branch. The shared worktree must be clean afterward.

If remote access is available, you may push your task branch and should push `codex/overnight-integration`. Push only these branches; never push to `main` and never force-push. If network or authentication prevents a push, retain all local branches/worktrees and report the exact failure honestly. Before releasing the lock, verify: the shared integration worktree is clean and on the integration branch; the handoff is included; the final integration commit and test results are recorded; and no temporary artifacts remain. Then release only your own lock using the procedure above.

## Relationship to main

**DO NOT MERGE INTO MAIN.** The overnight branch intentionally diverges from later, uncommitted 2.0 work in the original checkout. Do not merge, rebase, cherry-pick into, or otherwise update `main`. A dedicated reconciliation campaign will combine the latest committed main with `codex/overnight-integration` after the currently running sessions have finished.

## Final response contract

Every overnight agent must report all of the following:

- `TASK_SLUG`
- Task branch
- Original integration base (`ORIGINAL_BASE`)
- Final task branch commit (and implementation/task commit if distinct)
- Final overnight integration commit, or the recorded pre-integration commit if rejected
- Conflicts encountered and how they were resolved
- Prior handoffs incorporated
- Focused and overlapping test results
- Combined verification results
- Push result for each attempted branch
- Whether integration succeeded
- Anything the eventual main reconciler needs to know
