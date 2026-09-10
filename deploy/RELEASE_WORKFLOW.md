# Echo Archives staging and release workflow

This is the deployment runbook for the release-based workflow. It is separate
from the legacy checkout deployment still running until the one-time cutover
has been explicitly reviewed and approved.

## Architecture

The server keeps the source checkout at a configured deployment path and
release artifacts under `/srv/echo-archives` by default:

```text
/srv/echo-archives/
  releases/<40-character-commit-sha>/   # extracted source + generated site + node_modules
  current -> releases/<sha>             # production selection
  staging -> releases/<sha>             # staging selection
  runtime/
    production/<sha>/                   # production-owned mutable content overlay
    staging/<sha>/                      # staging-owned mutable content overlay
    production/current -> <sha>         # production STATIC_ROOT
    staging/current -> <sha>            # staging STATIC_ROOT
  shared/env/staging.env                # mode 0600, outside Git
  shared/env/production.env             # mode 0600, outside Git
  shared/state/                         # tested-release and promotion history
  preflight/                            # private recovery snapshots
/var/lib/echo-archives/community.sqlite            # production durable state
/var/lib/echo-archives-staging/community.sqlite    # staging-only durable state
```

The staging service listens on `127.0.0.1:3011`; production remains on
`127.0.0.1:3010`. Caddy serves those ports at
`staging.echoarchives.net` and `echoarchives.net` respectively. The production
Caddy site does not need to change during normal promotion.

Each release is built from one full Git SHA. `staging` is switched to that
artifact only after dependency installation, catalog/page generation, checks,
and tests pass. Each environment gets a separate runtime content overlay for
catalog writes, generated JSON, covers, reviews, and importer staging; the
release tree itself stays read-only. Promotion switches `current` to the
already-tested staging artifact and prepares the matching production overlay;
it does not fetch, rebuild, or run Git against production.

Staging responses identify themselves with `X-Echo-Environment: staging`.
Staging pages emit `X-Robots-Tag: noindex` and staging `robots.txt` disallows
crawling. The public health endpoint is intentionally coarse. Release tooling
uses the separate loopback-only health listener configured by the service unit
for detailed readiness and exact-release checks; that listener is not proxied
by Caddy.

## One-time server preparation

Do this from the server as the deployment user. These commands create only the new
release/staging paths and do not restart production or reload Caddy:

```bash
ECHO_SOURCE_ROOT="${ECHO_SOURCE_ROOT:-/srv/echo-archives/source}"
ECHO_DEPLOY_USER="${ECHO_DEPLOY_USER:-$(id -un)}"
ECHO_DEPLOY_GROUP="${ECHO_DEPLOY_GROUP:-$(id -gn)}"
cd "${ECHO_SOURCE_ROOT}"

sudo install -d -o "${ECHO_DEPLOY_USER}" -g "${ECHO_DEPLOY_GROUP}" -m 0750 /srv/echo-archives
sudo install -d -o "${ECHO_DEPLOY_USER}" -g "${ECHO_DEPLOY_GROUP}" -m 0750 \
  /srv/echo-archives/releases \
  /srv/echo-archives/runtime \
  /srv/echo-archives/runtime/staging \
  /srv/echo-archives/runtime/production \
  /srv/echo-archives/shared \
  /srv/echo-archives/shared/env \
  /srv/echo-archives/shared/state \
  /srv/echo-archives/preflight
sudo install -d -o echo-archives -g echo-archives -m 0750 \
  /var/lib/echo-archives-staging \
  /var/backups/echo-archives

# Let the runtime account traverse the deployment tree and read release files.
# It does not grant the runtime account access to the secret file contents.
sudo setfacl -m u:echo-archives:r-x /srv/echo-archives
sudo setfacl -m u:echo-archives:r-x,d:u:echo-archives:r-x \
  /srv/echo-archives/releases
sudo setfacl -m u:echo-archives:--x /srv/echo-archives/runtime
sudo setfacl -m u:echo-archives:--x,d:u:echo-archives:--x \
  /srv/echo-archives/runtime/staging \
  /srv/echo-archives/runtime/production
sudo setfacl -m u:echo-archives:--x /srv/echo-archives/shared
sudo setfacl -m u:echo-archives:--x /srv/echo-archives/shared/env

cp deploy/env/staging.env.example /srv/echo-archives/shared/env/staging.env
cp deploy/env/production.env.example /srv/echo-archives/shared/env/production.env
chmod 0600 /srv/echo-archives/shared/env/staging.env \
  /srv/echo-archives/shared/env/production.env
# Edit both files with a protected editor and replace every required placeholder.
${EDITOR:-vi} /srv/echo-archives/shared/env/staging.env
${EDITOR:-vi} /srv/echo-archives/shared/env/production.env

./deploy/echo status
```

The production environment file is required for promotion validation, but the
preparation commands do not load it into or restart the live service. The
service manager reads the file as root; application `ExecStartPre` checks use
the already-loaded environment, so the runtime account never needs read access
to the secret file.

Install the staging service only after reviewing the checked-in unit:

```bash
sudo install -m 0644 deploy/echo-archives-staging.service \
  /etc/systemd/system/echo-archives-staging.service
sudo systemctl daemon-reload
sudo systemctl enable echo-archives-staging.service
```

This does not start production. Start staging after DNS/Caddy is ready, or
start it locally while testing with the staging smoke command below.

The release deployment also includes a backup unit that targets the live
production database explicitly and resolves the backup tool from `current`.
Install it only during the approved release cutover; do not leave it enabled
alongside the legacy backup timer indefinitely:

```bash
sudo install -m 0644 deploy/echo-archives-release-backup.service \
  /etc/systemd/system/echo-archives-release-backup.service
sudo install -m 0644 deploy/echo-archives-release-backup.timer \
  /etc/systemd/system/echo-archives-release-backup.timer
sudo systemctl daemon-reload
sudo systemctl disable --now echo-archives-backup.timer
sudo systemctl enable --now echo-archives-release-backup.timer
```

These timer commands are production-side changes and require the same explicit
approval as the release service cutover. The old backup timer is not changed by
repository work; until this reviewed cutover, inspect its effective
`DB_PATH`/`BACKUP_DIR` values manually.

## Caddy and DNS

The exact staging site block is [`Caddyfile.staging.echo`](Caddyfile.staging.echo).
Prepare a reviewable candidate without writing the live Caddyfile:

```bash
mkdir -p /srv/echo-archives/preflight/caddy
./deploy/prepare-staging-caddy-candidate.sh \
  /etc/caddy/Caddyfile \
  /srv/echo-archives/preflight/caddy/Caddyfile.with-staging
sudo caddy validate \
  --config /srv/echo-archives/preflight/caddy/Caddyfile.with-staging \
  --adapter caddyfile
diff -u /etc/caddy/Caddyfile \
  /srv/echo-archives/preflight/caddy/Caddyfile.with-staging
```

After a separate explicit approval, install the reviewed candidate and reload
Caddy once:

```bash
sudo cp -a /etc/caddy/Caddyfile \
  "/etc/caddy/Caddyfile.bak.$(date -u +%Y%m%dT%H%M%SZ)"
sudo install -m 0644 \
  /srv/echo-archives/preflight/caddy/Caddyfile.with-staging \
  /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
```

Create a proxied Cloudflare DNS record for `staging` pointing at the same
origin as `echoarchives.net` (a proxied CNAME to `echoarchives.net` is the
least duplicated option). Do not expose port 3011 publicly. The checked-in
block keeps the same Cloudflare-origin gate as production.

## Deploy a commit to staging

Run as the deployment user from the source checkout. The command fetches refs, resolves
the requested commit to a full SHA, builds an isolated release, and atomically
selects it for staging:

```bash
cd "${ECHO_SOURCE_ROOT:-/srv/echo-archives/source}"
./deploy/echo staging origin/main
# or: ./deploy/echo staging <full-40-character-commit-sha>
```

The command validates the staging environment, installs from
`backend/package-lock.json`, runs the existing catalog/page generation and
validation tools, runs the tool/backend tests, starts/restarts only staging,
checks the loopback-only detailed health listener, and runs the public staging
smoke test against the coarse health endpoint. If any post-switch check fails,
the previous staging link is restored. Production is not selected,
restarted, or reloaded by this command.

To inspect the selected release and public health response:

```bash
./deploy/echo status
curl --fail --silent --show-error https://staging.echoarchives.net/api/health | jq .
journalctl --no-pager -u echo-archives-staging.service -n 100
```

Run the smoke test again after manual inspection:

```bash
./deploy/echo smoke
./deploy/echo smoke --crawl
./deploy/echo smoke --write-tests
```

The normal smoke uses the submission endpoint's honeypot/filter path, so it
does not create a submission or consume the normal submission rate limit. It
does write and remove a rating in the staging-only database (the rating event
and anonymous test profile remain staging data). Pass `--write-tests` when you
explicitly want one real disposable submission persisted for end-to-end
moderation testing. Neither mode can contact the production database.

The current catalog schema exposes creator information and standards pages but
does not have a separate representative creator-entity route/data set. The
smoke test therefore checks `/for-creators` and `/creator-standards`; extend it
with a creator entity route when that product surface exists.

## Deep validation for the large release

This is optional and intentionally separate from every normal deploy:

```bash
./deploy/echo validate <full-40-character-commit-sha>
./deploy/echo validate <full-40-character-commit-sha> --external-links --crawl
```

It uses the repository's full `npm run verify` suite, regenerates catalog
artifacts in a disposable tree, checks entity/collection/route/asset sanity,
and can opt into network-dependent external-link checks and the broader staging
crawl. It never changes the checked-out files or production.

## Preflight before the first promotion

Capture this while the legacy production service is still running:

```bash
./deploy/echo preflight
```

The private snapshot records the legacy commit/worktree state, effective
service configuration and unit path, main process identity, Caddy service and
configuration, an online integrity-checked copy of the production SQLite
database, and current catalog/generated/runtime inputs. Secret values are not
copied. Copy the resulting directory shown by the command off-host before the
first promotion.

The legacy unit does not report a Git identity, so `legacyCommit` is the
checkout's `HEAD`, accompanied by the dirty-file count and non-secret working
tree status summaries. One-time `adopt-current` refuses to adopt a dirty
legacy checkout: resolve or explicitly preserve those changes, then run
preflight again. This prevents claiming that an uncommitted mutable checkout
is an exact SHA release.

The preflight snapshot is a recovery record, not a release. It does not stop
Echo, restart systemd, reload Caddy, alter environment variables, or migrate
the production database.

## One-time production cutover

Do this only after staging review and explicit production approval. The current
live service is still the legacy checkout until this transition is performed.
Keep a root-owned backup of the existing unit and Caddyfile before installing
the release-backed unit.

```bash
sudo cp -a /etc/systemd/system/echo-archives.service \
  "/etc/systemd/system/echo-archives.service.legacy.$(date -u +%Y%m%dT%H%M%SZ)"
sudo install -m 0644 deploy/echo-archives-release.service \
  /etc/systemd/system/echo-archives.service
sudo systemctl daemon-reload
```

Before restarting, seed `current` to a release artifact that represents the
currently deployed legacy commit. `adopt-current` verifies that the SHA matches
the preflight record, builds that old commit in the release layout if needed,
and switches the link while the legacy service is still serving:

```bash
./deploy/echo adopt-current <legacy-commit-recorded-by-preflight>
```

`adopt-current` validates the production environment against the adopted
release and only creates the `current` link; it does not restart production or
reload Caddy. Verify the unit text and link, then run the first approved
promotion using the normal command. The command refuses to proceed if `current`
has not been seeded, so an accidental first-time production cutover cannot
happen by omission:

```bash
./deploy/echo promote
```

If this first cutover fails, follow the saved unit backup and the preflight
snapshot recovery notes. Automatic service rollback is guaranteed only after
the release-backed `current` link and service have been established; the
legacy-to-release transition is deliberately a separately reviewed boundary.

If discovery is enabled, switch it to the release-based timer as part of the
same approved production change. Never run the legacy and release discovery
jobs concurrently against different databases:

```bash
sudo install -m 0644 deploy/echo-archives-release-discovery.service \
  /etc/systemd/system/echo-archives-release-discovery.service
sudo install -m 0644 deploy/echo-archives-release-discovery.timer \
  /etc/systemd/system/echo-archives-release-discovery.timer
sudo systemctl daemon-reload
sudo systemctl disable --now echo-archives-discovery.timer
sudo systemctl enable --now echo-archives-release-discovery.timer
```

The discovery job can mutate catalog source and generated cover files. Review
its write paths and journal after enabling it.

## Promote the tested staging release

After the one-time cutover, the normal command is:

```bash
./deploy/echo preflight
./deploy/echo promote
```

Promotion verifies that staging is still healthy, that the exact staging
commit has a recorded successful smoke test, that the production environment
validates against that release's code, and that the installed production unit
actually points at `current`. It records the transition, atomically switches
the symlink, restarts only `echo-archives.service`, and checks production
loopback health/release identity. If startup or health fails, it switches back and
health-checks the previous release automatically. Caddy is not reloaded.

There is no command that means “deploy newest main to production.”

## Roll back production

The fast path uses a retained release directory; it performs no Git operation,
dependency installation, catalog build, or database restore:

```bash
./deploy/echo rollback
```

To select a particular retained release:

```bash
./deploy/echo rollback <40-character-release-sha>
```

The command switches `current`, restarts the release-backed production unit,
checks loopback health and release identity, and automatically restores the prior
current release if the rollback target fails startup/health. It retains at
least eight releases by default; clean old unreferenced artifacts with:

```bash
./deploy/echo cleanup 8
```

## Persistent data and rollback boundary

Production SQLite state lives outside releases and is intentionally preserved
across promotion and code rollback. That includes community ratings/profiles,
rating events, submissions, import candidates/runs, collection workflow data,
listener reviews, rate limits, and retention records. Staging has a different
SQLite path and must never be pointed at production.

SQLite migrations run at application startup and are forward-only in this
project. A code rollback does not undo a migration or make newer rows/schema
disappear. Before promoting a release with a schema change, confirm backward
compatibility or prepare a separate reviewed database recovery plan. Restore a
database only as an incident operation using a verified backup, a stopped
service, and an explicit approval.

Catalog source, generated JSON, covers, reviews, and import publication paths
are currently application-managed files. Each release gets a separate,
environment-owned runtime overlay for those paths, so staging mutations do
not enter the production overlay and production mutations do not rewrite the
immutable release tree. A code promotion or rollback selects the target
release's environment overlay; it does not merge the currently selected
overlay into the target. If the target overlay already exists, its retained
file snapshot is selected. Otherwise it is seeded from the immutable release.
File writes made in the old overlay remain on disk but may be hidden by the
switch, so they are not a reliable substitute for a content backup or Git
change. The preflight snapshot copies the active content for recovery
inspection. Treat catalog/content changes as data changes and back them up
separately when they cannot be regenerated from Git.

## Logs and common failures

```bash
journalctl --no-pager -u echo-archives-staging.service -n 200
journalctl --no-pager -u echo-archives.service -n 200
sudo systemctl status echo-archives-staging.service
sudo systemctl status echo-archives.service
curl --fail --silent --show-error http://127.0.0.1:3011/api/health
curl --fail --silent --show-error http://127.0.0.1:3010/api/health
```

- Missing/unsafe env file: create the file outside Git, mode `0600`, and run
  the corresponding validator. Secret values are never printed by the tools.
- Staging service cannot start: inspect the unit's `WorkingDirectory`, the
  `staging` link, release ACLs, and its journal; production is unaffected.
- Smoke failure after switch: the staging link is restored automatically;
  inspect the failed release before retrying.
- Promotion refuses because staging is untested: rerun `./deploy/echo smoke`
  for the currently selected staging release.
- Promotion refuses because the unit is legacy or `current` is absent: stop
  and complete the separately reviewed one-time cutover; do not work around
  the guard by editing a live checkout.
- Production health failure after promotion: the tool attempts an automatic
  release rollback. If it reports that rollback also failed, keep Caddy in
  place, inspect both unit and journal, and use the retained release SHA or
  preflight recovery plan.
