# Deployment architecture contract

This file is the short design contract for future maintainers. The operational
commands and examples are in [`RELEASE_WORKFLOW.md`](RELEASE_WORKFLOW.md).

## Boundaries

| Boundary | Source of truth | Mutable? | Owner/consumer |
| --- | --- | --- | --- |
| Source | Git repository and exact full SHA | Git history only | deployment user/build tools |
| Release | `/srv/echo-archives/releases/<sha>` | no | deployment user; runtime read ACL |
| Selection | `current` and `staging` symlinks | pointer only | deployment lock + atomic rename |
| Runtime overlay | `/srv/echo-archives/runtime/{production,staging}` | yes, explicit paths | `echo-archives` service |
| Secrets/config | `/srv/echo-archives/shared/env/*.env` | host-managed | systemd; production root-only |
| Operational state | `/var/lib/echo-archives*` | yes | dedicated runtime account |
| Backups | `/var/backups/echo-archives` and verified off-site storage | append/retention | backup service/root off-site job |
| Host tooling | `/usr/local/lib/echo-archives` | host-managed | monitor/off-site orchestration; runtime-readable |
| Host config | systemd, journald, Caddy, permissions | host-managed | guarded bootstrap/host procedure |

The release artifact is constructed in a visible temporary directory, validated,
and renamed into its final SHA directory only when complete. It never becomes
current while incomplete. The runtime service has no write access to release
directories.

## Environment relationship

```text
same release machinery
        |
        +-- staging:    :3011 / 127.0.0.1 / staging.env / staging SQLite
        |
        +-- production: :3010 / Caddy / production.env / production SQLite
```

The mechanics are shared; feature flags and ports are intentionally different.
Staging is private and is reached through an SSH tunnel. A public staging DNS
record is not required for application releases.

## Safety invariants

- Production promotion consumes the exact staging-tested SHA; it does not
  rebuild or pull in production.
- The deployment lock serializes build selection, backups, pointer switches,
  rollback, and cleanup.
- Pointer changes use a same-filesystem temporary symlink plus atomic rename.
- Readiness polls a loopback detailed health endpoint with a bounded deadline,
  checks environment and exact release identity, and prints sanitized systemd
  diagnostics on timeout.
- Forward deployment and rollback each receive their own full readiness window.
- Production backup runs before promotion and uses an explicit database path.
- Staging DB validation fails closed at `/var/lib/echo-archives-staging/community.sqlite`.
- The deployment user owns releases and state; the `echo-archives` account owns
  only runtime data, databases, and backup directories it needs.
- Cleanup is dry-run by default and protects current pointers, runtime targets,
  and the default history-selected rollback target. Temporary artifacts have
  explicit visible names and bounded cleanup.

## Host versus release operations

Host bootstrap installs accounts, directories, ACL foundations, systemd units,
timers, journal configuration, and the root-owned host tooling copies under
`/usr/local/lib/echo-archives`. It does not start services or change Caddy.
The monitor and off-site units execute those stable host copies; they use the
explicit `APP_RELEASE_ROOT` only for version-coupled release helpers such as
database/recovery verification. Normal release commands only build/validate
an SHA, prepare overlays, switch pointers, restart the relevant service, and
verify readiness. Caddy and DNS are not release inputs.

## Recovery limits

Code rollback is not a database rollback. SQLite migrations are forward-only;
database restore requires an explicit incident procedure and a verified backup.
The old checkout and migration snapshots are recovery material, not normal
deployment dependencies.
