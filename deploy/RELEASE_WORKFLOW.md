# Echo Archives release workflow

This is the normal release runbook. It is independent of historical migration
steps. The migration-only `preflight` and `adopt-current` commands remain
available for recovery evidence, but they are not part of a normal release.

## Architecture

```text
source Git repository + exact commit SHA
              |
              v
  /srv/echo-archives/releases/<40-char-sha>/
       immutable source + generated output + production dependencies
              |
              +--> /srv/echo-archives/staging -> releases/<sha>
              |       staging systemd service :3011
              |       runtime overlay -> runtime/staging/<sha>
              |
              +--> /srv/echo-archives/current -> releases/<sha>
                      production systemd service :3010
                      runtime overlay -> runtime/production/<sha>
                              |
                              v
                         Caddy -> 127.0.0.1:3010
                         https://echoarchives.net
```

The source checkout is only a build input. The service never runs from it.
`SOURCE_REPO` may point at the checked-out repository used by an operator; by
default the release tool derives it from its own repository. The normal host
layout is:

```text
/srv/echo-archives/
  releases/<sha>/                 immutable release directories
  current -> releases/<sha>       production pointer
  staging -> releases/<sha>       staging pointer
  runtime/production/<sha>/       production mutable overlay snapshot
  runtime/production/current -> <sha>
  runtime/staging/<sha>/          staging mutable overlay snapshot
  runtime/staging/current -> <sha>
  shared/env/production.env       root-owned, mode 0600
  shared/env/staging.env          deployment-user-owned, mode 0600
  shared/state/                   lock, tested marker, history
  preflight/                      private recovery material only

/var/lib/echo-archives/community.sqlite
/var/lib/echo-archives-staging/community.sqlite
/var/backups/echo-archives/*.sqlite
```

Release directories contain no `.git` checkout and no runtime database, logs,
secrets, importer staging, or mutable catalog state. The environment overlays
contain only the explicitly writable static/runtime paths. When a new overlay
is prepared, the currently active environment's mutable paths are carried
forward so a release switch does not silently hide importer or editorial file
writes. Those files still require recovery backups when they cannot be
regenerated from Git.

Production and staging use the same `deploy/echo` primitives. Their explicit
differences are the service name, port, site URL, database, environment file,
feature flags, and runtime pointer.

## Host bootstrap

Run this once on a new host from a checked-out repository:

```bash
sudo ./deploy/bootstrap-echo-archives.sh
```

`deploy/install-echo-archives-system.sh` is a compatibility wrapper for the
same bootstrap. It creates the runtime account and directories, installs the
checked-in systemd units/timers, creates environment-file skeletons if absent,
installs monitoring/off-site environment skeletons, removes only the known
migration-era discovery drop-in, installs journal retention configuration,
validates unit syntax, and reloads the systemd manager. It intentionally does
not start, restart, stop, enable, or reload a service and it does not change
Caddy.

Review and fill the files outside Git:

```text
/srv/echo-archives/shared/env/staging.env
/srv/echo-archives/shared/env/production.env
```

They must remain regular files with mode `0600`. Production secrets are
root-owned; the release tool validates them through a short-lived `sudo`
process without printing or copying their contents. Staging is readable by
the deployment user because staging builds run unprivileged.

After validation and explicit review, enable the required units on a new host:

```bash
sudo systemctl enable echo-archives.service echo-archives-staging.service
sudo systemctl enable echo-archives-backup.timer
sudo systemctl enable echo-archives-discovery.timer
sudo systemctl enable echo-archives-local-monitor.timer
```

Enable the off-site timer only after its encrypted-storage configuration and
SSH/Tailscale prerequisites have been installed. Start staging explicitly for
the first release. Existing Caddy configuration is host infrastructure and is
reviewed separately; normal app releases never rewrite or reload Caddy.

## Normal release

Run the following as the deployment user from the source repository. No step
uses `git pull`, installs dependencies into the source checkout, or rebuilds in
production.

1. Commit and push the intended change.

2. Resolve and record the exact commit:

   ```bash
   git fetch --prune origin
   SHA="$(git rev-parse origin/main^{commit})"
   printf '%s\n' "${SHA}"
   ```

3. Build and deploy that exact SHA to private staging:

   ```bash
   ./deploy/echo staging "${SHA}"
   ```

   The command builds an isolated `release-<sha>.XXXXXX` temporary directory,
   runs locked dependency installation, catalog/page generation, configuration
   checks, tools/backend tests, data/link checks, and production-shaped
   validation. Only after those checks pass is the temporary directory renamed
   to the final exact-SHA release directory. It prepares the staging overlay,
   switches both staging pointers atomically, restarts staging, polls detailed
   loopback health, and runs the staging smoke test. A failed post-switch check
   restores the prior staging release.

4. Inspect staging through an SSH tunnel. Staging is private by design; there
   is no required `staging.echoarchives.net` DNS record or Caddy site:

   ```bash
   ssh -N -L 3011:127.0.0.1:3011 user@echo-host
   curl --fail --silent --show-error http://127.0.0.1:3011/api/health | jq .
   ./deploy/echo smoke http://127.0.0.1:3011
   journalctl --user --no-pager 2>/dev/null || true
   sudo journalctl --no-pager -u echo-archives-staging.service -n 100
   ```

   If local port 3011 is occupied, tunnel to another local port and pass that
   URL to `deploy/echo smoke`.

5. Promote the same tested artifact:

   ```bash
   ./deploy/echo promote
   ```

   Promotion refuses an untested staging SHA, validates production against the
   release code, confirms both installed services are release-backed, creates
   a verified production SQLite backup using the explicit production database
   path, prepares the production overlay, atomically switches `current` and
   the production runtime pointer, restarts only `echo-archives.service`, and
   gives production its own bounded readiness window. Caddy remains unchanged.

   If startup or readiness fails, the previous production pointer and runtime
   pointer are restored and independently health-checked. Promotion exits
   nonzero even after an automatic rollback so the failed release is not
   mistaken for a successful deployment.

6. Confirm the result locally:

   ```bash
   ./deploy/echo status
   curl --fail --silent --show-error https://echoarchives.net/api/health | jq .
   sudo journalctl --no-pager -u echo-archives.service -n 100
   ```

## Private staging access

The staging service listens only on `127.0.0.1:3011`; its detailed readiness
listener is only on `127.0.0.1:4011`. It has a separate database,
`/var/lib/echo-archives-staging/community.sqlite`, and staging validation
rejects the production database, production Turnstile credentials, production
analytics, and public HTTP origins. Staging writes are therefore disposable
test data and cannot reach production through an unset-path fallback.

There is deliberately no checked-in public staging Caddy block. If a future
second environment needs a public route, treat that as a separate host
infrastructure decision; it is not part of an Echo application release.

## Status and diagnostics

`./deploy/echo status` reports:

- exact production and staging release pointers and runtime pointers;
- release metadata, build time, and Node version;
- staging tested SHA and previous production release;
- service active state, substate, PID, exit result, and database path;
- detailed loopback readiness responses; and
- the last five production history entries.

The shared state files are local/internal only:

```text
/srv/echo-archives/shared/state/deployment.lock
/srv/echo-archives/shared/state/staging-tested.json
/srv/echo-archives/shared/state/production-history.log
```

They are mode `0600` and are never exposed through Caddy.

## Rollback

The normal fast rollback uses a retained exact-SHA artifact:

```bash
./deploy/echo rollback
./deploy/echo rollback <40-character-release-sha>
```

The default target is selected from the successful promotion/rollback history;
an explicit retained SHA is safer when investigating a known release. Rollback
does not fetch Git, install packages, rebuild files, alter Caddy, or restore a
database. It prepares/preserves the target runtime overlay, atomically switches
the production pointers, restarts production, and verifies the target release
through the detailed health listener. A failed rollback restores the release
that was current before rollback and checks it independently.

SQLite migrations in this application are forward-only. Code rollback does not
downgrade the schema or remove newer rows. Before promoting schema-changing
code, verify backward compatibility. Database restore is a separate incident
operation using a verified backup, a stopped service, and explicit approval;
there is no automatic database downgrade.

## Backups and mutable data

The production backup service runs as `echo-archives`, reads exactly
`/var/lib/echo-archives/community.sqlite`, writes mode-0600 timestamped files
under `/var/backups/echo-archives`, performs SQLite online backup and
integrity verification, and refuses to overwrite an existing destination.
The daily backup timer is separate from release promotion, while promotion
also takes a fresh verified backup immediately before switching production.

The off-site job stages the latest completed local backup, the active runtime
publication files, importer staging, protected configuration, and recovery
metadata into a root-only temporary inventory. Restic upload, restore/verify,
repository check, and only then local retention are required before the
success marker is published. Never copy the live SQLite `-wal` or `-shm` files
directly as a backup.

Staging and production databases are never copied by release deployment. The
only accepted paths are:

```text
production: /var/lib/echo-archives/community.sqlite
staging:    /var/lib/echo-archives-staging/community.sqlite
```

## Cleanup and retention

Cleanup is dry-run by default:

```bash
./deploy/echo cleanup 8
./deploy/echo cleanup 8 --apply
```

Only exact 40-character SHA release directories outside the retention window
are candidates. Current production, current staging, both active runtime
targets, and retained rollback candidates are protected. Temporary build and
runtime directories are recognized only as bounded
`release-<sha>.XXXXXX`/`runtime-<sha>.XXXXXX` names and are never eligible as
release candidates. Stale temporary artifacts older than the configured
24-hour bound are reported in dry-run mode and removed only by an explicit
apply cleanup or by the guarded deployment cleanup step.

Do not manually delete release directories while a deployment is running; the
deployment lock serializes release construction, pointer switching, backups,
rollback, and cleanup.

## Recovery-only migration boundary

`./deploy/echo preflight` and `./deploy/echo adopt-current` exist only for a
reviewed legacy-to-release recovery/cutover. They record or adopt a known
legacy commit and are not required for future releases. The frozen legacy
checkout is not a normal source, service, backup, discovery, monitor, or
off-site path. Do not modify that checkout during recovery; preserve it as
read-only material and use a reviewed snapshot or release artifact instead.

## Host-level commands and sudo boundary

Normal release operations run as the deployment user and invoke `sudo` only for
systemd read/restart/start operations and protected production validation or
backup. Host bootstrap, unit installation, environment-file ownership, Caddy
changes, timer enablement, and service enable/start are host operations and
require a separately reviewed sudo action. A normal app release does not
recreate directories, rewrite unit files, modify firewall/DNS, or reload
Caddy.
