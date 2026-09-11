# Echo Archives environment contract

The release services own `NODE_ENV`, `HOST`, `PORT`, `STATIC_ROOT`,
`IMPORT_STAGING_ROOT`, and the service-specific `DB_PATH`. Keep secrets and
deployment overrides in
the root-only environment files outside Git:

```text
/srv/echo-archives/shared/env/staging.env
/srv/echo-archives/shared/env/production.env
```

Both files must be regular files with mode `0600`. The deployment user may
read staging; production is intentionally root-readable only. The release
tool validates production through a short-lived privileged process without
printing or copying secret values. Validate them without printing values:

```bash
ECHO_ENV_FILE=/srv/echo-archives/shared/env/staging.env \
  NODE_ENV=production \
  node --env-file=/srv/echo-archives/shared/env/staging.env \
  deploy/validate-env.js staging

ECHO_ENV_FILE=/srv/echo-archives/shared/env/production.env \
  NODE_ENV=production \
  node --env-file=/srv/echo-archives/shared/env/production.env \
  deploy/validate-env.js production
```

The application’s existing configuration validator also runs as each systemd
unit’s `ExecStartPre`.

The release service points `STATIC_ROOT` at an environment-specific runtime
overlay. Catalog source, generated JSON, cover files, review files, and
importer staging are therefore writable only in that environment’s overlay;
the Git release directory remains immutable. Do not add
`STATIC_ROOT`/`IMPORT_STAGING_ROOT` to the deployment env files.

The service units also expose detailed health on a separate loopback-only
listener for deployment and local monitoring. It is not part of the public
Caddy routes and must not be bound to a non-loopback address.

## Values that differ by environment

| Variable | Staging | Production |
| --- | --- | --- |
| `DEPLOYMENT_ENV` | `staging` | `production` |
| `SITE_URL` | `http://127.0.0.1:3011` | `https://echoarchives.net` |
| `DB_PATH` | `/var/lib/echo-archives-staging/community.sqlite` | `/var/lib/echo-archives/community.sqlite` |
| `SQLITE_SYNCHRONOUS` | `FULL` | `FULL` |
| `COMMUNITY_RATING_WRITES_ENABLED` | `true`, isolated DB | current production policy; currently `true` |
| `COMMUNITY_TURNSTILE_ENABLED` | `false`; no production keys | `true`; production keys required |
| `COMMUNITY_VOTER_HASH_SECRET` | separate random secret | separate production secret |
| `IMPORT_AUTO_WORKER` | `false` | current production policy; normally `true` |
| `IMPORT_AUTO_DISCOVERY` | `false` | enable only through the release-based unit after review |
| `PLAUSIBLE_DOMAIN` / `PLAUSIBLE_SCRIPT_SRC` | empty | supply only if production analytics are intentionally enabled |
| maintainer credentials | empty by default | distinct production credentials |
| Podcast Index credentials | empty | supply only if production import workflows need them |

All other variables are optional defaults documented in
[`backend/README.md`](../backend/README.md) and
[`backend/.env.example`](../backend/.env.example). The validator rejects a
staging database equal to the production database, staging Turnstile
credentials, staging analytics, and placeholder secrets.
