# Echo Archives rollback plan

Rollback is a normal release-pointer operation. The authoritative commands and
filesystem contract are in [`RELEASE_WORKFLOW.md`](RELEASE_WORKFLOW.md).

## Fast code rollback

Run as the deployment user:

```bash
./deploy/echo status
./deploy/echo rollback
```

To choose a known retained artifact explicitly:

```bash
./deploy/echo rollback <40-character-release-sha>
```

The command acquires the deployment lock, verifies the target release metadata
and runtime tree, preserves active production mutable files into the target
overlay, atomically switches `/srv/echo-archives/current` and the production
runtime pointer, restarts `echo-archives.service`, and validates the target
environment, PID, service working directory, health response, and exact commit.

If the target fails, the command switches back to the release that was current
when rollback began and grants it a separate full readiness window. If that
recovery fails, it exits with an intervention-required error and leaves Caddy
untouched; inspect systemd/journal state before taking any host action.

Rollback does not fetch Git, rebuild, install dependencies, modify Caddy, or
change either SQLite database.

## Database boundary

Production state remains at `/var/lib/echo-archives/community.sqlite`; staging
state remains at `/var/lib/echo-archives-staging/community.sqlite`. SQLite
migrations are forward-only in this application. A code rollback therefore
does not downgrade schema or delete newer rows. Do not invent automatic schema
downgrade logic.

If a database restore is required, treat it as a separate incident procedure:

1. obtain an integrity-checked backup from `/var/backups/echo-archives` or
   verified off-site storage;
2. obtain explicit approval and stop the affected service;
3. preserve the current database and WAL/SHM sidecars as incident evidence;
4. restore to the exact environment path with reviewed ownership/mode;
5. run integrity/schema checks before restarting; and
6. start the service and use the bounded readiness check.

The release workflow never performs these steps automatically.

## Retention

The default retention target is eight releases. Cleanup is dry-run by default:

```bash
./deploy/echo cleanup 8
./deploy/echo cleanup 8 --apply
```

Current production, current staging, active runtime targets, and the default
history-selected rollback target are protected. Temporary paths are matched
only by their explicit visible `release-<sha>.XXXXXX` and
`runtime-<sha>.XXXXXX` names.

## First-cutover recovery

The old legacy-to-release transition is not part of normal rollback. The
read-only `preflight` and one-time `adopt-current` commands are retained only
for a separately reviewed recovery exercise. The frozen legacy checkout is
never modified by those operations and is not a normal deployment source.
