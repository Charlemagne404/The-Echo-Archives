# Echo Archives release rollback

The supported rollback path is the release workflow documented in
[`RELEASE_WORKFLOW.md`](RELEASE_WORKFLOW.md). Production rollback is a
selection change between already-built release directories:

```bash
cd "${ECHO_SOURCE_ROOT:-/srv/echo-archives/source}"
./deploy/echo rollback
```

The command selects the previous production release from
`/srv/echo-archives/shared/state/production-history.log`, switches
`current` atomically, restarts `echo-archives.service`, and verifies the
loopback-only health listener reports the target commit. It does not fetch Git, rebuild the
catalog, install dependencies, reload Caddy, or restore the database.

For a specific retained release:

```bash
./deploy/echo rollback <40-character-release-sha>
```

If the target fails its startup or health check, the command switches back to
the release that was current when rollback began and checks it again. If that
recovery also fails, it exits with an intervention-required error and prints
the boundary that needs investigation.

## What rollback does not undo

The production SQLite database is outside the release tree at
`/var/lib/echo-archives/community.sqlite` and is not changed by code rollback.
That is intentional: ratings, profiles, submissions, imports, collection
workflow rows, reviews, rate limits, and retention records are durable user or
operational state. SQLite startup migrations are forward-only; reverting code
does not revert a schema migration. A database restore is a separate reviewed
incident procedure using a verified backup, a stopped service, and explicit
approval.

Catalog source, generated JSON, reviews, covers, and importer publication files
are also application-managed paths. The active release has narrowly listed
write access to preserve the existing maintainer workflows. Switching releases
does not restore those files. Back them up separately when they cannot be
rebuilt from Git; `./deploy/echo preflight` captures a private recovery copy
before a production promotion.

## Automatic promotion rollback

`./deploy/echo promote` records the previous release, switches `current`,
restarts production, and checks the expected commit. A failed startup or health
check automatically selects and checks the previous release. A successful
automatic rollback still exits nonzero so deployment automation cannot report a
failed promotion as successful.

## Retention

Keep the active production and staging releases plus at least eight recent
unreferenced releases:

```bash
./deploy/echo cleanup 8
```

Cleanup removes only exact SHA-named release directories that are neither
active nor staging-selected and are outside the retention count. It never
removes the external SQLite databases or the shared environment files.

## Recovery boundary for the first cutover

Automatic release rollback begins only after the release-backed production
service and `current` link have been installed. The first legacy-checkout to
release-service cutover is intentionally a separately reviewed operation. Take
the `./deploy/echo preflight` snapshot and retain the old unit backup before
that transition; if it fails, use the saved unit/configuration and preflight
recovery notes rather than attempting a Git reset in the live checkout.
