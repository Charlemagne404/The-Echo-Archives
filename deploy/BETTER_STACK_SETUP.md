# Better Stack account setup

This is repository-only preparation. Do not paste API tokens or heartbeat URLs
into Git, shell history, tickets, or public logs. Prefer the Better Stack
dashboard for initial setup. An API token is optional and must stay in a private
operator environment based on `better-stack-account.env.example`.

## Account and alert routing

1. Confirm the Better Stack team owner and recovery access in the private
   operations record.
2. Add `alerts@echoarchives.net` as the monitored team email recipient and
   verify a message reaches the mailbox.
3. Install the Better Stack mobile app for the actual on-call owner. Enable push
   alerts in both Better Stack and the device settings.
4. Create an `Echo Archives launch` escalation policy with email and push
   enabled. Apply it to both HTTP monitors and the backup heartbeat.
5. Ensure automatic incident recovery is enabled. During acceptance, verify
   both the outage notification and the resolved/recovery notification reach
   email, and push where the account and device support it.
6. Whitelist Better Stack notification mail and record who owns acknowledgement
   and escalation.

Better Stack documentation:

- <https://betterstack.com/docs/uptime/monitoring-start/>
- <https://betterstack.com/docs/uptime/locations-and-regions/>
- <https://betterstack.com/docs/uptime/ios-and-android-mobile-apps/>
- <https://betterstack.com/docs/uptime/confirmation-and-recovery-period/>

## HTTP monitors

Leave Better Stack's normal multi-location coverage enabled: `us`, `eu`, `as`,
and `au`. Do not reduce either monitor to one location.

### Echo Archives API health

- URL: `https://echoarchives.net/api/health`
- Type: keyword monitor
- Method: `GET`
- Required keyword: `"ok":true`
- Check frequency: 60 seconds
- Request timeout: 15 seconds
- Confirmation period: 60 seconds
- Recovery period: 60 seconds
- Follow redirects: disabled
- Verify SSL: enabled
- SSL-expiry warning: 30 days
- Alert policy: `Echo Archives launch`
- Alert channels: email and push

This proves the public API returns a 2xx response with the positive health
identity. The root-owned local monitor remains responsible for deeper numeric
catalog, collection, and feature-state assertions.

### Echo Archives homepage

- URL: `https://echoarchives.net/`
- Type: keyword monitor
- Method: `GET`
- Required keyword: `The Echo Archives`
- Check frequency: 300 seconds
- Request timeout: 15 seconds
- Confirmation period: 300 seconds
- Recovery period: 300 seconds
- Follow redirects: disabled
- Verify SSL: enabled
- Alert policy: `Echo Archives launch`
- Alert channels: email and push

After creating both monitors, inspect their configuration and confirm checks
arrive from the normal four-region set. Better Stack creates incidents only
after a multi-location quorum fails under its normal location behavior.

## Off-site backup heartbeat

Create a heartbeat named `Echo Archives off-site backup`:

- Expected every: 86,400 seconds
- Grace period: 21,600 seconds
- Alert policy: `Echo Archives launch`
- Alert channels: email and push

The six-hour grace aligns the daily heartbeat with the existing 30-hour
freshness ceiling while allowing the randomized timer delay and bounded backup
runtime. Copy the secret heartbeat URL into the root-owned host file only:

```bash
sudo install -d -m 0755 -o root -g root /etc/echo-archives
sudo install -m 0600 -o root -g root \
  deploy/better-stack-heartbeat.env.example \
  /etc/echo-archives/better-stack.env
sudoedit /etc/echo-archives/better-stack.env
```

Do not install the drop-in until the secret file is populated and a reviewed
maintenance window is approved. The prepared integration is:

```bash
sudo install -d -m 0755 \
  /etc/systemd/system/echo-archives-offsite-backup.service.d
sudo install -m 0644 \
  deploy/echo-archives-offsite-backup-heartbeat.conf \
  /etc/systemd/system/echo-archives-offsite-backup.service.d/better-stack-heartbeat.conf
sudo systemctl daemon-reload
sudo systemctl cat echo-archives-offsite-backup.service
```

The drop-in has two deliberately different paths:

- `ExecStartPost` sends success only after the existing backup service has
  completed local backup freshness/integrity verification, encrypted upload,
  remote snapshot visibility, retention, repository integrity checking, and
  success-marker publication.
- `ExecStopPost` sends Better Stack's explicit `/fail` heartbeat whenever
  systemd reports a non-successful service result. It sends nothing after a
  clean result because success was already reported by `ExecStartPost`.

The notifier validates the Better Stack hostname and URL shape, never prints
the secret URL, uses GET with redirects disabled, times out, and retries.
Better Stack documents the failure endpoint here:
<https://betterstack.com/docs/uptime/cron-and-heartbeat-monitor/>.

## Acceptance drill

These actions create real incidents and must wait for owner approval:

1. Confirm both HTTP monitors are healthy from all normal regions.
2. Trigger a controlled HTTP-monitor failure without changing public DNS or
   production infrastructure.
3. Confirm the outage email reaches `alerts@echoarchives.net` and push reaches
   the on-call device.
4. Restore the check and confirm email and push recovery notifications.
5. Run the notifier's `failure` mode from a protected environment to create a
   backup incident, then run `success` to resolve it.
6. Withhold the backup success heartbeat in a disposable or paused-job drill
   and confirm stale-heartbeat alert timing.
7. Only after those checks pass, enable the drop-in for the next approved
   production backup window.
