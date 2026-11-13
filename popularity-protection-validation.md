# Popularity protection validation

## Production scorer and API

`backend/lib/popularity.js` is unchanged. The eligibility flag only selects the separate `popularity_event_eligible_daily` input instead of the preserved legacy `popularity_event_daily` input. `POPULARITY_EVENT_ELIGIBILITY_ENABLED` remains `false` by default, so current and staging-default visitor rankings stay on the existing formula/input. The public `/api/popularity/scores` response remains `{ generatedAt, modelVersion, scores }` with its existing 60-second cache policy.

## Isolated behavior checks

- A normal page view contributes to the legacy and eligible daily rollups.
- A high-confidence page view remains in `analytics_events`, raw page-view reporting, and the legacy rollup while being excluded from the eligible rollup.
- Suspected traffic remains eligible by default.
- Explicit eligibility changes add audit rows and can be reversed; the eligible rollup returns to its prior value without rewriting the event.
- Listening, saves, ratings, and community activity have independent contribution paths and are not adjusted because an unrelated page view was classified.
- The scorer receives deterministic rollups and retains the existing response contract; the existing formula and production ranking were not changed.

The temporary-database tests replayed the legacy rollup exactly before allowing a backfill and verified that a reviewed quarantine can be restored. The feature flag stayed off outside tests.

## Historical incident counterfactual

The preserved candidate artifact reports a consistent read-only SQLite backup replay at `2026-11-11T16:07:02.478Z`, with `asOf=2026-11-11T23:59:59.999Z`, model version 1, and zero legacy-rollup mismatches. Its half-open UTC windows (`start <= occurred_at < end`) contain:

| Measure | Result |
|---|---:|
| Raw page-view events | 4,017 |
| Show-page views / existing popularity contributions | 1,891 |
| Shows with changed score | 247 |
| Shows with changed rank | 246 |
| Top-25 changes | 2 entered, 2 left |
| Candidate review state | All `pending_review` |

Every stored candidate timestamp was checked against its selected window. The artifact has mode `0600`, contains event and show IDs for review, and contains no visitor/session IDs or source addresses. In the recorded counterfactual, Desert Skies and Paralyzed left the top 25 while The Silt Verses and The Magnus Protocol entered. No ranking was changed.

This task did **not** rerun the historical result: there is no local isolated snapshot covering all five windows. The available sanitized popularity snapshot ends on November 9 and cannot validate November 10–11. No live production DB path was opened. The preserved artifact's rollup marker/counts and the synthetic replay test were verified, but that is not a substitute for a fresh full-window replay. Before any historical quarantine or activation, obtain a consistent isolated snapshot covering Nov 6–11, rerun the script to a new output path, confirm zero rollup mismatches, and review every candidate. The CLI now requires both explicit paths and refuses to overwrite existing evidence.

## Historical review boundary

The fixed windows exist only in the retrospective script/report. They are not future anomaly-detection rules. Time correlation does not prove automation, and the incident rows remain pending. No raw/historical event was deleted, rewritten, or automatically quarantined in this task.

## Popularity V2.1.2 compatibility

The separate `/tmp/echo-popularity-v2.1.2-20261109-final-hardening/` workspace remains unchanged and unactivated. It consumes sanitized hourly evidence and candidate score inputs; current production exposes daily `getPopularitySignals()` and an in-process legacy scorer. The mitigation's eligibility layer is a clean input boundary, but it does not provide every hourly feature V2.1.2 needs. A later shadow adapter should read bounded hourly aggregates and reuse the event classification/eligibility ledger rather than adding a second independent production classifier. No V2.1.2 migration, route, consumer, or scorer was merged here.
