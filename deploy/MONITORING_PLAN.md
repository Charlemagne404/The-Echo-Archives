# Production Monitoring Plan

## External checks

Configure an account-backed monitoring provider only after choosing the provider and alert recipients.

Run from at least two regions:

| Check | Interval | Success condition |
| --- | ---: | --- |
| Apex health | 1 minute | `GET https://echoarchives.net/api/health` returns 200, JSON `ok: true`, `catalogCount > 0`, and `collectionCount > 0` |
| Homepage identity | 5 minutes | `GET https://echoarchives.net/` returns 200 and contains `The Echo Archives` |
| `www` redirect | 5 minutes | Permanent redirect to the same path/query on `https://echoarchives.net` |
| Legacy redirect | 15 minutes | Permanent redirect to the same path/query on `https://echoarchives.net` |
| TLS expiry | Daily | More than 21 days remain for apex, `www`, and legacy hostnames |

Alert after two consecutive one-minute failures. Send recovery notifications as well as failure notifications.

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

The check validates systemd state, local and public health semantics, apex identity, the `www` redirect, public TLS lifetime, local backup freshness/integrity, and disk thresholds. It warns about a pending reboot. Off-site freshness becomes mandatory only when `REQUIRE_OFFSITE_BACKUP=true` is placed in the root-owned monitoring environment file.

`deploy/final-production-launch-maintenance.sh` installs these files, creates the credential-neutral root-owned settings file, enables the timer, and requires its first run to pass. Local journald checks are useful evidence but do not replace an external observer or alert delivery.

## Backup-freshness signal

The signal must be emitted only after both of these succeed:

1. the local online SQLite backup passes `integrity_check`;
2. the encrypted remote snapshot completes and is visible in the remote repository.

Use either a provider heartbeat URL or a local metric containing the Unix timestamp of the last successful remote snapshot. Never put provider tokens in the repository, process arguments, or public health response.

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
