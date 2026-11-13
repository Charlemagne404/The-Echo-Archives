# Staging readiness

## Decision

**READY FOR PRIVATE STAGING**, after the normal code review creates a fetchable commit. The isolated worktree is uncommitted by instruction and is not itself an input to the deployment release tool. No deployment, database migration, Cloudflare change, or service restart was performed here.

The application changes and validation support a staged rollout with analytics hardening observed before popularity eligibility is enabled. The existing production scoring formula remains unchanged. Initial staging should keep `POPULARITY_EVENT_ELIGIBILITY_ENABLED=false` until the isolated ranking comparison is reviewed.

## Evidence

- The worktree is still based on `cb6af6ae6c7a28fe5bfd272992588cda9cb5274a`; unrelated work was not found or removed.
- Full repository build/tool/backend/browser gates pass on the final code. See [test-report.md](test-report.md) and [final-validation-report.md](final-validation-report.md).
- All twelve clean-route aliases are generated; page integrity and deterministic output checks pass.
- `axe-core` is a declared locked development dependency. `npm ci --prefix backend --include=dev` restored the isolated test environment without a lockfile change.
- No runtime dependency was added. The database change is additive and idempotent in the existing startup schema path. The eligibility seed is copied from the existing daily rollup; explicit historical classification/backfill is a separate operator action.
- Both feature flags default to `false`; current public rankings and ordinary ingestion behavior are unchanged until staging operators enable a flag.
- `git diff --check`, JavaScript syntax checks, and development config validation pass.

## Staging gates

1. Review the exact final diff and candidate artifact handling. Create/push a reviewed commit through the normal release process; this task intentionally did not commit or push.
2. Back up the staging SQLite file and confirm the staging environment has the existing `ANALYTICS_HMAC_SECRET` (minimum 32 characters) available without printing it.
3. Deploy only to private staging with `RUN_STAGING_SMOKE=true ./deploy/echo staging <reviewed-sha>`. Do not use the `deploy` or `promote` command; the former promotes after staging.
4. Confirm public pages, static assets, query/cookie/Markdown cache headers, community writes, submissions, and controlled analytics POSTs using staging data.
5. Confirm startup created the additive classification/eligibility tables and seeded the eligible daily rollup. Run the legacy backfill in check-only mode against the staging DB; inspect raw, legacy, and eligible totals before any apply.
6. Enable `ANALYTICS_INGEST_HARDENING_ENABLED=true` in staging while leaving popularity eligibility off. Monitor accepted/rejected events and class counts, including shared-network browsing and one-page visits.
7. Only after Stage 6 is clean, apply the verified legacy classification backfill to staging and test reversible event eligibility. Enable `POPULARITY_EVENT_ELIGIBILITY_ENABLED=true` in staging solely for a before/after report; confirm raw events and the scoring formula remain unchanged.
8. Keep historical incident candidates pending review. A fresh replay requires an isolated Nov 6–11 SQLite snapshot; none was present in this worktree. Do not use the preserved report as authority to auto-quarantine.

## Separate Cloudflare work

No Cloudflare change is required just to deploy the application code. Origin cache headers are safe without a rule; the edge will only use them according to current zone behavior. The exact Cache Rules and analytics rate-limit recommendation are in [cloudflare-configuration-guide.md](cloudflare-configuration-guide.md) and require a separate manual dashboard review. Do not enable Bot Fight Mode as part of staging code deployment.

## Known operational limits

- The historical origin of the 42,182 `504` responses remains unknown. Staging should capture Cloudflare edge/origin status and time, Caddy upstream status/duration, Node request/event-loop/RSS/restart counters, and SQLite duration/lock counters before attributing a cause.
- Distributed low-rate crawling under the per-minute classification thresholds can remain unclassified. Process-level event caps still bound analytics writes; this is a measurement control, not a universal crawler detector.
- The existing historical candidate list remains pending review and is not needed to stage the code with popularity eligibility disabled.
