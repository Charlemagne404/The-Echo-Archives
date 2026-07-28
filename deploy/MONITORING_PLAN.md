# Production Monitoring Plan

## Better Stack external checks

Better Stack is the selected external provider. The account-side checklist,
credential handling, exact monitor settings, and prepared backup-heartbeat
drop-in are documented in `deploy/BETTER_STACK_SETUP.md`.

Keep Better Stack's normal multi-location coverage enabled (`us`, `eu`, `as`,
and `au`). Its documented default checks from at least four locations and
requires a multi-location failure quorum before opening an incident.

| Check | Interval | Success condition |
| --- | ---: | --- |
| API health | 1 minute | `GET https://echoarchives.net/api/health` returns 2xx and contains `"ok":true` |
| Homepage identity | 5 minutes | `GET https://echoarchives.net/` returns 200 and contains `The Echo Archives` |

Route outage and automatic recovery notifications to
`alerts@echoarchives.net`, with Better Stack mobile push enabled for the actual
on-call owner where the account and device support it. Use 60-second
confirmation/recovery periods for API health and 300-second periods for the
homepage to avoid single-sample alerts.

The root-owned local monitor continues to enforce the deeper health contract:
`catalogCount > 0`, `collectionCount > 0`, expected production feature flags,
redirect behavior, and TLS lifetime. Better Stack is the independent observer
for public API and homepage availability.

## Host checks

Add local alerts for:

- `echo-archives.service` not active or restart count increasing;
- `caddy.service` not active;
- backup or discovery timer not enabled/active;
- newest verified local backup older than 30 hours;
- newest encrypted off-host snapshot older than 30 hours;
- root filesystem above 80%, inode use above 80%, or less than 10 GiB free;
- memory pressure, sustained swap growth, or load above the six-core host's normal range;
- certificate renewal errors;
- any failed systemd unit;
- pending reboot older than seven days.

Netdata may carry host metrics, but its dashboard should remain firewall-restricted. Add an explicit HTTP check for the Echo health endpoint; the current Netdata alarm set has no Echo-specific check.

Credential-neutral local preparation is checked in as:

- `deploy/check-echo-archives-production.sh`;
- `deploy/echo-archives-local-monitor.service`;
- `deploy/echo-archives-local-monitor.timer`.

Better Stack-specific repository preparation is checked in as:

- `deploy/BETTER_STACK_SETUP.md`;
- `deploy/better-stack-account.env.example`;
- `deploy/better-stack-heartbeat.env.example`;
- `deploy/notify-better-stack-heartbeat.js`;
- `deploy/echo-archives-offsite-backup-heartbeat.conf`.

The check validates systemd state, local and public health semantics, apex identity, the `www` redirect, public TLS lifetime, local backup freshness/integrity, and disk thresholds. It warns about a pending reboot. Off-site freshness becomes mandatory only when `REQUIRE_OFFSITE_BACKUP=true` is placed in the root-owned monitoring environment file.

`deploy/final-production-launch-maintenance.sh` installs these files, creates the credential-neutral root-owned settings file, enables the timer, and requires its first run to pass. Local journald checks are useful evidence but do not replace an external observer or alert delivery.

## Backup-freshness signal

The signal must be emitted only after both of these succeed:

1. the local online SQLite backup passes `integrity_check`;
2. the encrypted remote snapshot completes and is visible in the remote repository.

Create the Better Stack heartbeat with a 24-hour period and six-hour grace.
Install its URL only in `/etc/echo-archives/better-stack.env`, owned by root
with mode `0600`. Never put Better Stack API tokens or heartbeat URLs in the
repository, process arguments, public health response, or routine logs.

The prepared drop-in sends:

- success from `ExecStartPost`, which can run only after the existing backup
  script has completed backup freshness/integrity verification, encrypted
  upload, snapshot visibility, retention, `restic check`, and success-marker
  publication;
- explicit failure from `ExecStopPost` via Better Stack's documented `/fail`
  endpoint whenever systemd exposes a non-successful `SERVICE_RESULT`.

Do not install or enable the drop-in until its secret environment file exists,
the account resources are configured, and a maintenance window is approved.

## Logging and retention

- Keep maintenance logs root-readable under `/var/log/echo-archives/`.
- Add bounded Caddy access logs only after deciding the privacy and retention policy.
- Cap journald disk use and retain enough history for incident review.
- Do not log cookies, authorization headers, Turnstile tokens, passphrases, or submitted private content.

## Launch acceptance

Before declaring launch-ready:

1. Trigger and receive a test failure alert.
2. Trigger and receive its recovery notification.
3. Confirm backup-freshness becomes stale when the heartbeat is withheld.
4. Confirm the remote restore drill succeeds.
5. Record the alert recipients, escalation path, and provider ownership in the private operations record.
