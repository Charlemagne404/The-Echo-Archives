# Focused Stability Remediation

**Date:** 2026-11-24

**Outcome:** Repository baseline stabilized; production remediation remains gated on the separate privileged storage and backup work.

## Completed

- Fast-forwarded `main` from the stale local checkout and pushed the tested baseline to `origin/main`; the current head is `2b519457`. Local `main` is clean and matches the remote. This brings the deployed mitigation commits and tested dependency patch into the canonical development baseline without rewriting history.
- The dependency patch is in `backend/package.json` and `backend/package-lock.json`. Full verification and clean-checkout CI passed on implementation commit `ada52100`; CI also passed on `7ad109f0`, which has the same application code. The later documentation-only `2b519457` workflow failed one browser smoke assertion in the homepage carousel autoplay test (`favoriteRoutes` did not advance by the test's timing threshold); no other subtest failed. The patched lockfile audit reported zero vulnerabilities. No full-suite rerun was made.
- Preserved the existing importer/publisher work in `stash@{0}` (`preserve importer and publisher WIP before stable baseline`). It contains the 48 modified tracked files and 9 untracked feature files captured before the fast-forward; the requested audit report is tracked in the new baseline. No feature work was discarded or committed into `main`.
- Reused the audit's live route, database, and service verification. Production and staging remain active on `55e761be`. A staging attempt for verified candidate `7ad109f0` stopped before build or pointer switch because the release script could not authenticate `sudo` to inspect the installed systemd unit. Production and staging release pointers remain unchanged; no service restart, database write, or user activity occurred.

To resume the preserved WIP from its original base in a separate working tree, use `git stash branch codex/preserved-importer-publisher-wip 'stash@{0}'`. Keep the clean `main` checkout as the canonical baseline.

## Current host state

- Disk is now about 85% used with 66.75 GiB available. The five-minute monitor timer is active, but its service still fails because usage exceeds its 80% threshold. No further cleanup was attempted while the separate privileged storage/backup migration was underway.
- At the latest resource sample, about 3.5 GiB RAM was available and memory PSI was low (10- and 60-second averages zero). All 4 GiB swap remained occupied; no swap reset or service restart was attempted.
- Production and staging application services and Caddy are active on `55e761be`. The discovery timer and daily local backup timer are active. The latest local backup (03:27 CET, 127,385,600 bytes) passed integrity and foreign-key checks. The backup file remains inaccessible to the current `charlie` account, so no isolated local restore was attempted.
- The offsite timer remains inactive/disabled. A root-owned readiness marker records a successful isolated restore and Restic check on 2026-08-11, but no offsite run appeared in the last 24 hours; this is historical recovery evidence, not a current offsite recovery point. The other session's backup migration owner should confirm the intended schedule and a new successful marker.
- The operations runbook documents a guarded offsite restore drill that restores into an isolated temporary directory, validates the database, and starts an isolated application. It requires administrator-owned configuration and privileges; it was not run here.

## Release decision and remaining work

**Production promotion did not occur.** The 66.75 GiB free space provides useful release headroom, but the monitor still fails at 85% use. The staging workflow is blocked at its installed-unit permission check because non-interactive administrator authorization is unavailable. Production remains on `55e761be` with the known dependency advisories. Candidate `7ad109f0` is fully verified and its application code matches current `main`; the later CI failure was a single timing-sensitive carousel assertion on a documentation-only commit.

After the separate storage and backup work completes:

1. Have the authorized deployment account run the existing release workflow for verified SHA `7ad109f0`, beginning with staging; the attempted command stopped before any release pointer changed.
2. Before production promotion, confirm the immediate local backup succeeds and the previous production release/runtime remains available. The promotion script creates a fresh verified local backup automatically.
3. Let the separate backup migration owner confirm offsite recovery and timer state. Review the 85% disk alert and full swap after that work; 66.75 GiB is available, but the configured 80% monitor threshold still fails.
4. After a successful staging smoke, promote the same tested SHA and perform lightweight health and route checks.

The overall environment remains **not ready for unattended operation** until host recovery and monitoring are healthy. Administrator authorization is required to run the release workflow; the separate session owns storage and backup migration. This session left those boundaries unchanged.
