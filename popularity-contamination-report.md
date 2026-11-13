# Popularity contamination report

## Safeguard

The current popularity scoring formula in `backend/lib/popularity.js` is unchanged. Raw `analytics_events`, raw page-view reporting and existing `popularity_event_daily` are preserved. New `analytics_event_classifications`, `analytics_event_eligibility_audit`, and `popularity_event_eligible_daily` tables provide a separate, reversible input layer. `POPULARITY_EVENT_ELIGIBILITY_ENABLED` defaults to `false`; current rankings continue to consume the legacy rollup until a separately reviewed Stage 4 enablement.

Page views remain a meaningful discovery signal. Only events with high-confidence classification or an explicit reviewed quarantine are excluded from the eligibility input. Suspected automation alone remains eligible. Listening, saving, ratings and community events are stored independently and are not automatically quarantined by page-view classification.

## Historical replay

Source analytics were read from a consistent SQLite online backup. The existing score implementation was replayed against a temporary copy; no production event or rollup was changed. Fixed windows are derived from the supplied incident timestamps and are used only for this retrospective report, not as future detection rules.

| UTC window | Raw page views | Show-page views | Distinct shows |
|---|---:|---:|---:|
| Nov 6 11:10–11:12 | 977 | 463 | 243 |
| Nov 7 11:11–11:13 | 123 | 55 | 29 |
| Nov 9 10:41–10:43 | 905 | 429 | 221 |
| Nov 10 10:28–10:30 | 1,008 | 474 | 244 |
| Nov 11 10:32–10:34 | 1,004 | 470 | 240 |
| **Total** | **4,017** | **1,891** | — |

All 1,891 show-page rows were contributions under the existing cooldown rollup. Exact replay matched all daily `show_page_view` aggregates in those windows. The Nov 7 report window covers only two minutes of a supplied approximately three-hour incident, so it is a lower-bound sample. Cloudflare and analytics data could not be joined by Ray ID, source address or request timestamp; time correlation does not prove that each candidate event is automated.

## Counterfactual ranking impact

The copied catalog's existing scoring model and `asOf` timestamp were replayed twice: current inputs and inputs with those candidate show-page contributions removed. The candidate set changed **247 show scores**, **246 ranks**, and two top-25 memberships. Desert Skies and Paralyzed left the top 25; The Silt Verses and The Magnus Protocol entered. This is a review counterfactual only; public production rankings were not changed.

The reproducible artifact `historical-quarantine-candidates.json` includes event IDs, show IDs, window/reason, contribution status and `pending_review`. It does not contain visitor/session identifiers or source addresses. Review each record before using the authenticated eligibility endpoint. Do not bulk quarantine based only on the incident window.

## Reproduce

From the isolated worktree, use a consistent isolated SQLite snapshot that covers the selected incident windows:

```bash
npm --prefix backend run report:historical-spike-counterfactual -- \
  --db /path/to/consistent-isolated-snapshot.sqlite \
  --output /tmp/echo-historical-counterfactual-review.json \
  --as-of 2026-11-11T23:59:59.999Z
```

Both paths are required: the command refuses an implicit database path and will not overwrite the preserved candidate artifact. Use a copy whose contents cover all selected incident windows.

The script backs up SQLite online, performs the replay on a disposable copy, reads the checked-out current catalog and scorer, and writes the candidate artifact with mode 0600. It never updates the source database. For a reviewed eligibility backfill, use the separate check-only/apply command and audit procedure described in [analytics-ingestion-hardening.md](analytics-ingestion-hardening.md).
