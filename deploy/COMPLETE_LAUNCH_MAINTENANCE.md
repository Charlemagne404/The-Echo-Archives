# Complete launch maintenance

`deploy/complete-launch-maintenance.sh` is the single reviewed entry point for
the remaining privileged Echo Archives launch work. It coordinates the smaller
reviewed scripts; it does not call the older broad host-maintenance scripts,
change UFW rules, modify DNS or Cloudflare account settings, or touch unrelated
service configuration.

## What it changes

In `--apply` mode the script performs these fail-fast stages in order:

1. Preserves the live Caddyfile, Echo/Ollama units, installed versions, the
   actual Ollama binary and library tree, off-site backup units, listener state,
   and a response-code baseline for every non-Echo site in the shared
   Caddyfile.
2. Creates and validates a fresh online SQLite backup.
3. Reconciles the reviewed off-site backup unit when the checked-in backup
   script has reached production before its matching systemd write path. Only
   the exact off-site read-only probe failure and its local-monitor cascade are
   accepted; any unrelated failed unit remains fatal. The original unit is
   already preserved, the corrected unit is validated before daemon reload,
   and no off-site backup is started at this stage.
4. Builds or recognizes the reviewed Cloudflare-only Echo origin gate, validates
   it with both installed and staged Caddy, reloads Caddy, and verifies that
   spoofed direct-origin requests fail while public Cloudflare requests and all
   unrelated shared hosts retain their baseline status.
5. Upgrades only the Caddy package from 2.10.2 to 2.11.4, retaining the
   conffile, then repeats configuration, shared-host, public, and origin checks.
6. Runs the guarded `echo-archives` service-account migration. Application code
   remains owned by `charlie`; the runtime account receives read access to
   deployed files and targeted write access only to the database, staging,
   generated catalog, covers, reviews, and other declared runtime paths. The
   stage applies the hardened unit and 14-day namespaced journal configuration.
7. Verifies the restarted application is using the expected feature flags,
   `WAL` and `synchronous=FULL`, the new server code, the dedicated account,
   loopback binding, and correct unrated output locally and publicly. At this
   point it clears only the accepted transition failures and proves the local
   monitor is healthy again.
8. Installs the Better Stack heartbeat drop-in only if the protected heartbeat
   environment already exists and passes strict owner, mode, name, hostname,
   scheme, path, and single-value checks. Absence is a logged skip, not an
   excuse to create a dummy value.
9. Restores the newest tagged Restic snapshot into a guarded temporary
   directory, verifies SQLite integrity and foreign keys, starts an isolated
   loopback-only restored application, removes it, installs/verifies the
   canonical off-site timer, runs a new backup, checks remote visibility,
   applies existing off-site retention, runs `restic check`, and only then
   publishes backup success. The Better Stack success heartbeat therefore
   cannot precede those checks.
10. Upgrades Ollama from 0.6.7 to 0.32.5 without moving or re-pulling models,
   then verifies the exact version, loopback-only listener, existing `mistral`
   model, a short generation, and lack of public Ollama exposure.
11. Starts two more isolated restored applications to verify Ask the Archivist
    uses Ollama when it is available and returns the bounded catalog fallback
    when it is unreachable.
12. Records root-only UFW, nftables, iptables (when installed), and listener
    evidence. It requires active UFW, default-deny incoming policy, and
    loopback-only Echo/Ollama binds; it never edits a firewall rule.
13. Records root-only SMART health/attribute evidence for every discovered
    physical disk and stops if overall health or NVMe critical-warning checks
    fail.
14. Runs a disposable failed-candidate rollback drill. The drill deliberately
    breaks only a temporary Git worktree, verifies failure detection, runs the
    prior revision against a disposable post-activation database copy, proves a
    representative write survived, and confirms the production checkout was
    untouched. This is not falsely reported as a full production deployment
    rollback.
15. Repeats local/public health, direct-origin/header-spoofing, TLS, service,
    structured-log, and all shared-host checks.

Each changing component has a stage-specific rollback. A failure stops the
session, rolls back only the current stage where safe, and never continues into
a later risky stage. Previously completed and verified stages remain applied.

## Prerequisites

- Run on `charlie-Legion-T530-28ICB`, from the fixed
  `/home/charlie/The-Echo-Archives` checkout, as `charlie` through `sudo`.
- `main`, `HEAD`, and `origin/main` must be the same explicitly supplied
  40-character commit and the checkout must be clean.
- Caddy, Echo, and Ollama must be healthy before starting. Failed system units
  remain fatal except for the exact reviewed off-site backup sandbox transition
  described above; the preflight matches its unit allowlist and journal
  signatures rather than ignoring failed state.
- At least 20 GiB must be free.
- The reviewed Restic environment, password file, root SSH identity, Pi SSH
  alias, Tailscale path, local backup tooling, Node dependencies, and production
  environment must already exist. The script validates them before mutation.
- The private artifact directory must remain:

  ```text
  /home/charlie/.local/state/echo-archives-rollbacks/20260728T124747Z
  ```

  It contains checked upgrade and rollback packages for Caddy 2.11.4/2.10.2
  and Ollama 0.32.5/0.6.7. The script pins and rechecks all four digests before
  applying anything. The actual installed Ollama tree is still captured as the
  primary rollback source.

Do not run `deploy/final-production-launch-maintenance.sh`,
`deploy/complete-local-launch-readiness.sh`, or
`deploy/production-host-maintenance.sh` for this session. They cover broader or
older host state and are not called by the orchestrator.

## Better Stack secret

Account setup happens outside this script. After creating the heartbeat in
Better Stack, place only its generated URL in:

```text
/etc/echo-archives/better-stack.env
```

The required file is `root:root`, mode `0600`, with exactly one non-comment
setting:

```text
BETTER_STACK_BACKUP_HEARTBEAT_URL=https://uptime.betterstack.com/api/v1/heartbeat/REPLACE_WITH_PROVIDER_VALUE
```

Use `sudoedit`; do not paste the URL into a command line, shell history, this
repository, the maintenance log, or returned evidence:

```bash
sudo install -d -m 0755 -o root -g root /etc/echo-archives
sudo install -m 0600 -o root -g root \
  deploy/better-stack-heartbeat.env.example \
  /etc/echo-archives/better-stack.env
sudoedit /etc/echo-archives/better-stack.env
sudo chown root:root /etc/echo-archives/better-stack.env
sudo chmod 0600 /etc/echo-archives/better-stack.env
```

If that file is absent, the script safely skips only the heartbeat-install
stage and records `better_stack_installed=no`.

## Validation and dry-run commands

The unprivileged repository check verifies the exact clean pushed checkout,
shell parsing, systemd candidates, staged Caddy candidate, and all four artifact
digests:

```bash
cd /home/charlie/The-Echo-Archives
./deploy/complete-launch-maintenance.sh \
  --repository-check \
  --expected-commit "$(git rev-parse HEAD)"
```

The privileged check adds host identity, service, dependency, free-space,
Restic prerequisite, Cloudflare-range, and root-only file checks. It creates
only a protected check log/evidence directory; it does not apply production
configuration:

```bash
cd /home/charlie/The-Echo-Archives
sudo ./deploy/complete-launch-maintenance.sh \
  --check \
  --expected-commit "$(git rev-parse HEAD)"
```

## Apply command

Run exactly:

```bash
cd /home/charlie/The-Echo-Archives
sudo ./deploy/complete-launch-maintenance.sh \
  --apply \
  --expected-commit "$(git rev-parse HEAD)"
```

Do not pipe the command through another process. The script writes a root-only
log under `/var/log/echo-archives/` and rollback/evidence under
`/var/backups/echo-archives-launch-maintenance/`.

## Downtime and success

The full session may take 30–90 minutes because package extraction, Restic
restore/upload/check, and model generation run serially. Most of that time has
no public downtime.

- Caddy configuration uses a validated reload and should be effectively
  interruption-free.
- The runtime-account migration stops and restarts Echo and is budgeted for no
  more than the owner-approved 5 minutes.
- The Ollama stage temporarily affects only Ask the Archivist; normal discovery
  remains online.
- A failed changing stage is expected to stop and roll back within the
  owner-approved 15-minute failed-deployment window. Hardware, package-manager,
  storage, or network faults can exceed that target and require manual recovery.

Success is the final line:

```text
PASS: all controlled maintenance stages completed.
```

The protected `SUMMARY` must contain `result=PASS`. A missing Better Stack
secret can coexist with overall host-maintenance success, but the summary will
say `better_stack_installed=no` and external monitoring remains an open launch
gate.

## If execution stops

Do not rerun blindly. Keep the terminal open, note the failed stage, and inspect
only non-secret status/evidence:

```bash
sudo systemctl --failed --no-pager
sudo systemctl status caddy.service echo-archives.service ollama.service --no-pager
sudo ls -1dt /var/backups/echo-archives-launch-maintenance/* | head -1
sudo ls -1t /var/log/echo-archives/complete-launch-maintenance-*.log | head -1
```

The script first attempts the matching current-stage rollback:

- Backup-unit transition: restores the exact preserved off-site service unit
  and reloads systemd without starting a backup.
- Origin configuration: restores the run’s `Caddyfile.before`, validates it,
  and reloads Caddy, or starts it if it became inactive.
- Caddy package: reinstalls the pinned 2.10.2 package and restores the
  post-origin `Caddyfile.before-upgrade`.
- Runtime account: the migration helper rolls back automatically on its own
  apply failure. After a later operator-requested rollback, use the exact
  `rollback_backup` recorded in
  `/var/lib/echo-archives-runtime-account/readiness`; it preserves newest
  database writes.
- Better Stack or off-site units: restores the exact unit/drop-in files and
  enabled/active timer state captured immediately before that stage.
- Ollama: stops Ollama, moves the failed new library tree into the protected run
  directory, restores the exact captured binary/library/unit, and starts it.

If the log says `ROLLBACK FAILED`, stop. Do not delete database files, restore a
production SQLite snapshot, reset the production Git checkout, or continue
with another component. Send the failed-stage name, non-secret status output,
protected log path, and evidence-directory path for a targeted recovery command.

## Second-terminal checks

During the apply run, a second terminal may perform only read-only observation:

```bash
watch -n 10 'curl -fsS https://echoarchives.net/api/health | jq "{ok,service,durability,features}"'
```

From a genuinely different external connection, keep these ready for the
post-run manual origin/rate-limit checks described in the launch handoff:

```bash
curl -fsS https://echoarchives.net/api/health
curl -fsS https://echoarchives.net/ | grep -F "The Echo Archives"
```

Do not deliberately interrupt services, change DNS/Cloudflare, post ratings or
submissions to production, or send the Better Stack failure heartbeat while
the maintenance script is active.
