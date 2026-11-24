# Focused Stability Remediation

**Date:** 2026-11-24

**Outcome:** Repository baseline stabilized; production remediation remains gated on the separate privileged storage and backup work.

## Completed

- Fast-forwarded `main` from the stale local checkout to `7ad109f0` and pushed it to `origin/main`. Local `main` is clean and matches the remote. This brings the deployed mitigation commits and the tested dependency patch into the canonical development baseline without rewriting history.
- The dependency patch is in `backend/package.json` and `backend/package-lock.json`. The full verification and clean-checkout CI passed on implementation commit `ada52100`; `7ad109f0` differs only by a one-line audit-report update. The GitHub workflow for `7ad109f0` was still in progress at the time of this report. The patched lockfile audit reported zero vulnerabilities.
- Preserved the existing importer/publisher work in `stash@{0}` (`preserve importer and publisher WIP before stable baseline`). It contains the 48 modified tracked files and 9 untracked feature files captured before the fast-forward; the requested audit report is tracked in the new baseline. No feature work was discarded or committed into `main`.
- Reused the audit's live route, database, and service verification. Production and staging remained active on `55e761be`; no deployment, restart, database write, or user activity was generated.

To resume the preserved WIP from its original base in a separate working tree, use `git stash branch codex/preserved-importer-publisher-wip 'stash@{0}'`. Keep the clean `main` checkout as the canonical baseline.

## Current host state

- Disk remains at 96% (19 GiB free), above the local monitor's 80% limit. The five-minute monitor timer is active and its service still fails on disk usage. The previous safe retention attempt freed about 2 GiB before a protected-directory permission error.
- The user confirmed that a separate Codex session is running privileged server-wide storage cleanup and Echo backup migration. This remediation did not run another cleanup, alter backup data, enable/disable timers, or overlap that work.
- At the latest resource sample, 5 GiB RAM was available and memory PSI was low (10-second averages zero; 60-second averages about 0.05). All 4 GiB swap remained occupied, so it should be reviewed after the storage/backup work; no swap reset or service restart was attempted.
- Production and staging application services and Caddy were active. The latest production journal sample contained no application errors. Discovery and monitor timers were active.
- The daily local backup last passed integrity and foreign-key checks at 16:28 CET against the 03:27 CET backup. The backup file is under `/var/backups/echo-archives`, inaccessible to the current `charlie` account. No isolated local restore was attempted.
- At the latest timer readback, the local backup timer was inactive (though installed/enabled), and the offsite timer was inactive/disabled. This may be a deliberate pause during the other session's migration. Do not restart either timer concurrently; the migration owner should confirm both are restored to the intended schedule and that a new successful backup marker is recorded afterward.
- The operations runbook documents a guarded offsite restore drill that restores into an isolated temporary directory, validates the database and starts an isolated application. It requires administrator-owned configuration and privileges; it was not run here.

## Release decision and remaining work

**Do not deploy the dependency patch yet.** The current 96% disk use still causes monitor failure, backup timer state is in transition, and an isolated restore has not been verified. Production remains on `55e761be` with the known dependency advisories until normal staging and production promotion is completed.

After the separate storage and backup work completes:

1. Confirm disk headroom is below the 80% monitor threshold and cleanup/retention automation completes without permission errors.
2. Complete and record the isolated backup restore drill; verify local and offsite timers, a fresh local backup, and a new successful offsite marker.
3. Recheck memory/swap pressure and service health.
4. Deploy the current `main` candidate to staging, run the focused release smoke checks, then promote to production using the existing backup and rollback workflow. Perform lightweight health and route checks afterward.

The overall environment is still **not ready for unattended operation** until these host and recovery gates pass. Administrator action is required for the protected storage and backup work; the current session left those boundaries unchanged.
