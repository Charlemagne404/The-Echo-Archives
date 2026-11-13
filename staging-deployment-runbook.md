# Staging deployment runbook

This runbook stages the reviewed mitigation release only. It does not authorize production promotion, Cloudflare changes, DNS/firewall changes, or a public cache rule.

## 1. Prepare the exact release

The current isolated worktree is uncommitted and is not deployable by `./deploy/echo`. After code review, create and publish a reviewed commit through the repository's normal release process, then set its exact 40-character SHA:

```bash
RC_SHA=<reviewed-40-character-sha>
```

On the deployment host, confirm the SHA exists in the source repository and take a staging database backup using the existing protected backup workflow. Do not print environment secrets. Verify the staging environment uses its separate DB and loopback port `3011`.

## 2. Stage the release

Use the staging-only command and keep its smoke gate enabled:

```bash
RUN_STAGING_SMOKE=true ./deploy/echo staging "$RC_SHA"
```

This command builds the exact Git commit, installs its locked backend dependencies including development dependencies for validation, validates/builds/tests the release, prunes development dependencies, switches the staging release, and runs staging health/smoke checks. On staging failure it restores the previous staging release. Do not substitute `./deploy/echo deploy` or `./deploy/echo promote`.

## 3. Health and public-function checks

Run these on the staging host after the command returns:

```bash
curl --fail --silent --show-error http://127.0.0.1:3011/api/health
./deploy/echo smoke http://127.0.0.1:3011
```

Then use staging data and controlled fixtures to verify:

1. Homepage and catalogue load.
2. Search, sort, filters, empty results, and browse links work.
3. Show, creator, and collection pages return canonical HTML and metadata.
4. Covers, generated social cards, and versioned CSS/JS load.
5. Listening links open and their analytics failure remains best-effort.
6. Community ratings, reviews, helpful votes, and compact/public summaries behave correctly.
7. Submission forms create only staging records and preserve moderation state.
8. A valid analytics event is accepted; invalid names/properties/timestamps, duplicate IDs, 24 KB+ bodies, and >100-event batches behave as expected.
9. Diagnostics distinguish raw events, normal/suspected/high-confidence classes, sessions, views, and meaningful engagement. Treat visitors/sessions as anonymous pseudonyms.
10. Popularity API retains `{generatedAt, modelVersion, scores}` and its existing ordering/freshness. Compare normal, classified, and reviewed eligibility inputs in a staging-only snapshot.
11. Anonymous HTML has public CDN headers and no `Set-Cookie`; cookie/auth, query-bearing HTML, Markdown, private endpoints, and writes bypass shared caching. Check `GET`, `HEAD`, ETag/304, and response errors.
12. Caddy, Node, and SQLite staging metrics remain within bounds during a controlled 240-page traversal; record edge and origin status separately if Cloudflare is later configured for staging.

Useful response checks (replace `SHOW_ID` and use the staging base URL):

```bash
curl -sS -D - -o /dev/null "http://127.0.0.1:3011/shows/SHOW_ID"
curl -sS -D - -o /dev/null -H 'Cookie: staging-check=1' "http://127.0.0.1:3011/shows/SHOW_ID"
curl -sS -D - -o /dev/null -H 'Accept: text/markdown' "http://127.0.0.1:3011/shows/SHOW_ID"
curl -sS -D - -o /dev/null "http://127.0.0.1:3011/shows/SHOW_ID?sort=title"
```

Expected: the first is anonymous cache eligible; cookie/Markdown responses are `private, no-store`; query-bearing browse/search pages are `private, no-store`; canonicalizing detail routes redirect and do not match the queryless Cache Rule. Cloudflare `HIT` is not expected until a separate staging Cache Rule is reviewed and activated.

## 4. Analytics and popularity rollout in staging

Start with:

```text
ANALYTICS_INGEST_HARDENING_ENABLED=false
POPULARITY_EVENT_ELIGIBILITY_ENABLED=false
```

The startup schema path creates additive classification, audit, and eligible-rollup tables, then seeds the eligible rollup from the current daily rollup. No raw event rewrite is performed. Run the check-only historical classification backfill against staging after verifying the exact DB path:

```bash
npm --prefix backend run backfill:analytics-eligibility -- --db /var/lib/echo-archives-staging/community.sqlite
```

After the check reports exact legacy-rollup replay, the staging operator may apply it to the staging DB only:

```bash
npm --prefix backend run backfill:analytics-eligibility -- --db /var/lib/echo-archives-staging/community.sqlite --apply
```

Enable ingestion hardening in staging using its existing protected HMAC secret and default bounds (600 requests/minute and 1,200 events/minute per source; 3,000 events/minute per process). Keep popularity eligibility false while monitoring rejection and classification counts. A controlled fixture may then set and restore eligibility through the maintainer API and compare rankings on staging data. Do not auto-quarantine incident-window events.

The app's public analytics collector remains disabled in staging by the existing `PUBLIC_ANALYTICS_ENABLED=false` policy; exercise ingestion using controlled staging requests rather than enabling collection for general staging visitors.

## 5. Rollback

Record the prior staging SHA before deployment. A failed stage is restored by the release command. After a successful stage, redeploy the prior staging SHA to roll staging back:

```bash
RUN_STAGING_SMOKE=true ./deploy/echo staging <prior-staging-40-character-sha>
```

To disable hardening or popularity eligibility without changing source, set the respective staging flag to `false` in the protected staging environment and stage/restart the reviewed SHA through the same staging command. The schema is additive; do not restore a database just to remove its tables. If a reviewed staging eligibility decision needs reversal, use the authenticated eligibility endpoint to restore the event and keep the resulting audit row.

## 6. Completion criteria

Mark the staging release verified only after all twelve public-function and isolation checks pass, data totals and popularity deltas are reproducible from staging fixtures, hardening rejection/classification counts are reviewed, and performance/error metrics show no degradation. Keep production rankings, data, services, Cloudflare, DNS, and firewall untouched until a separate explicit authorization.
