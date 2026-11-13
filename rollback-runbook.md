# Rollback runbook

No production rollback action has been run. Use the deployment user's reviewed release workflow; never manually switch pointers or edit the production database during an application rollback.

## Application release rollback

From the reviewed source repository on the deployment host:

```bash
./deploy/echo status
./deploy/echo rollback <known-good-40-character-sha>
./deploy/echo status
```

If the target SHA is deliberately omitted, the release tool chooses the previous successful production release based on its history. Prefer the explicit known-good SHA during an incident. Confirm the exact production pointer, service active state and database path from `status`; inspect detailed loopback health. Release rollback restarts only the application service and performs its bounded health check. It does not change Cloudflare, Caddy, DNS, firewall or database contents.

## Disable Cloudflare cache rules

In the Cloudflare dashboard, disable only the newly created mitigation Cache Rules and analytics rate-limit rule. Verify the change is scoped to `echoarchives.net`; retain unrelated existing rules. Check that proxied public pages are served normally and that API writes are not challenged. Purge only if a known incorrect object is cached; do not purge the entire zone by default.

## Analytics hardening rollback

Set `ANALYTICS_INGEST_HARDENING_ENABLED=false` in the protected production environment and perform a reviewed release restart/rollback. This returns request ingestion to legacy validation/rate limiting. It does not delete raw records, classification rows, or the eligibility audit. Expect the strict route to stop applying new classifications.

## Popularity eligibility rollback

Set `POPULARITY_EVENT_ELIGIBILITY_ENABLED=false` and restart through the normal release workflow. The unchanged scorer reads the legacy `popularity_event_daily` input again. No schema/data rollback is required. If reviewed exclusions should be reversed for a later re-enable, use the authenticated eligibility endpoint to set each record eligible with a reason; this creates another audit row and updates only `popularity_event_eligible_daily`.

## Database recovery boundary

Application rollback does not downgrade forward-only SQLite migrations. Do not restore a production database simply to undo additive classification tables. Database restore is a separate incident procedure requiring a verified backup, stopped service, explicit operator approval and data-loss review. No production migration or restore is authorized by this task.

## Verification after rollback

- `./deploy/echo status` reports expected SHA and service state.
- `curl --fail https://echoarchives.net/api/health` returns healthy (run only after deployment approval).
- Confirm public catalogue pages, search/filter routes, images, listening links, reviews, community ratings, submissions, analytics and maintainer access.
- Check Caddy/Node logs and Cloudflare origin status; note remaining 504 source uncertainty until incident telemetry is correlated.
