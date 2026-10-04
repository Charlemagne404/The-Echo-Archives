# Popular catalogue ranking

## Purpose and boundaries

The Browse catalogue defaults to **Popular**. The score estimates observed
interest in a show on Echo. It is separate from Archive Rating (editorial
assessment), community rating quality, and editorial featuring. Archive Picks
and other featured flags do not contribute to this score.

The implementation lives in `backend/lib/popularity.js`. `POPULARITY_CONFIG`
is the single source for weights, priors, caps, windows, and cache duration.
`scoreShowPopularity()` returns both a score and component diagnostics;
`scoreCatalogPopularity()` also assigns deterministic ranks. The maintainer-only
`GET /api/maintainer/popularity` endpoint returns those diagnostics. The public
`GET /api/popularity/scores` endpoint returns only model version, generation
time, and per-show scores.

Scores are internal ranking points, not percentages. A behavioral score is
bounded to 0–100. Community contributes up to 9 points and cold-start priors
up to 3.15, so the composite theoretical range is 0–112.15. The score is not
shown as a user-facing grade; Browse exposes the sort choice as **Popular**.

## Formula

Each behavioral window produces a 0–100 score:

```text
window = 100 * (
  0.20 * position_adjusted_open_evidence
  + 0.30 * smoothed_listen_link_rate_evidence
  + 0.20 * smoothed_library_intent_rate_evidence
  + 0.30 * saturated_weighted_engagement_volume
)

behavior = 0.45 * lifetime + 0.35 * last_90_days + 0.20 * last_28_days
Popular score = behavior + community_points + cold_start_points
```

The windows use UTC calendar days, inclusive of the current UTC day. The
90-day query starts 89 days before today; the 28-day query starts 27 days
before today. Each window is scored independently before blending. An event
inside the recent windows therefore contributes to those windows as well as to
lifetime interest; this deliberately gives recent activity more influence
without removing the established lifetime signal.

### Exposure-adjusted opens

Card impressions and opens are grouped by the card's recorded result-position
bucket. The baseline open rates for position buckets `1`, `2-4`, `5-9`,
`10-24`, `25+`, and `unknown` are respectively 10%, 6.5%, 4%, 2%, 1%, and 2%.
For each bucket, the observed rate is smoothed with 250 prior impressions at
that baseline:

```text
posterior = (opens + baseline * 250) / (impressions + 250)
lift_evidence = clamp((posterior / baseline - 1) / 3, 0, 1)
confidence = impressions / (impressions + 250)
bucket_evidence = lift_evidence * confidence
```

Bucket evidence is averaged using impression count as its weight. Thus an
unexposed show receives no CTR bonus, and one impression plus one open has
negligible confidence. Four-times-baseline open rate is the maximum rate
evidence. Position priors reduce the advantage of being shown near the top;
they are initial estimates and should be checked against production data.

An impression is recorded after an eligible show card is at least 50% visible
for 600 ms. The browser also suppresses repeated card observations on that
page. On the server, raw accepted events retain repeat actions (subject to
event-ID idempotency); ranking-effective rollups accept at most one impression
and one open per pseudonymous visitor/show/context in a rolling 24-hour
cooldown. Position bucket is retained on each raw event; the first accepted
event in a cooldown supplies the ranking-effective bucket. The raw totals make
repeat behavior inspectable without letting reloads or repeated opens multiply
ranking evidence.

The **Archive picks** rail (`home_popular_rail`) is excluded from Popular
impression and open rollups. Its order already depends on editorial/fallback
selection and existing rating signals; including those exposures would let the
rail reinforce its own choices. Its events remain in the raw first-party
analytics stream for product diagnostics.

### Listen and Library intent rates

Listen-link evidence uses show page views as opportunities. It smooths the
rate with a 3% prior over 100 page views, then maps 3% to zero evidence and
20% or higher to full evidence:

```text
listen_rate = (listen_link_clicks + 0.03 * 100) / (show_page_views + 100)
listen_evidence = clamp((listen_rate - 0.03) / (0.20 - 0.03), 0, 1)
```

Library intent uses a 0.5% prior over 200 show page views. Its numerator is
`Show Saved + 0.75 * Listening state + 0.5 * Finished state`; 5% or higher
smoothed intent reaches full evidence. All rates are clamped to 0–1, so
repeated actions cannot create an unbounded conversion rate.

### Weighted engagement volume

For each window, event counts are multiplied by these weights and then
log-saturated:

| Signal | Weight |
| --- | ---: |
| Unique show-card open | 0.10 |
| Show page view | 0.05 |
| External listen-link click | 1.70 |
| Save to Library / Save for Later | 1.90 |
| Library state changed to Listening | 1.60 |
| Library state changed to Finished | 1.10 |
| Rating submitted or changed | 0.80 |
| Listener Review published | 1.10 |
| Helpful vote on a published review | 0.25 |

```text
volume = clamp(log1p(weighted_event_count) / log1p(500), 0, 1)
```

This rewards stronger intent more than passive page views and prevents very
large counts from growing linearly forever. Rating and review quality/volume
also have a separate community component described below.

### Community component

Community points are additive to the 0–100 behavioral score. Quick-rating
volume is `4 * (1 - exp(-active_rating_count / 40))`, up to 4 points. Its
quality component is capped at 2 points and uses a Bayesian mean with prior
7/10 and strength 20 ratings; only a mean above 7 contributes, reaching the
cap at 9/10. A lone 10/10 therefore receives little quality credit.

Published Listener Review volume is `1.5 * (1 - exp(-review_count / 8))`, up to
1.5 points. Review-star quality uses a Bayesian mean with prior 3.5/5 and
strength 10 reviews, capped at 0.75 points when the posterior reaches 5/5.
Current helpful votes from distinct profiles on published reviews add up to
0.75 points, saturating logarithmically at 25 voters. A profile is counted
once per show even if it marked multiple reviews helpful. Community quality is
intentionally a small part of Popular; rating and review participation is
stronger evidence than a high average alone.

### Cold-start component

Shows with no behavior still receive a deterministic weak prior. Its maximum
is 3.15 points:

- Archive Rating: `1.5 * finalRating / 10`, at most 1.5 points.
- Collection membership: 0.15 points per distinct authored collection, capped
  at 0.45 points.
- Catalogue freshness: `1.2 * 0.5^(age_days / 90)`, with a 90-day half-life.

There is no Archive Pick, featured, creator-verification, or status bonus.
With real event volume, behavioral points dominate these inputs. If the score
API is unavailable, the browser uses only Archive Rating and freshness as a
local fallback; it does not invent behavioral data.

Ties sort by title (case-insensitive), then stable show ID. Missing, malformed,
negative, or non-finite inputs are treated as zero/unknown. No randomness is
used, so the same catalog, signals, and clock produce the same rank.

## Signals and collection

The model consumes:

- `Show Card Impression` and `Show Opened`, with surface and position bucket;
- show `Page Viewed` events;
- `Listen Link Opened` events (outbound listening-platform clicks);
- `Show Saved` and eligible `Library State Changed` events;
- `Rating Submitted` and `Rating Changed` events;
- current active quick-rating counts and sums;
- currently published Listener Review count, star sum, publication dates, and
  helpful-vote totals.

Existing show-open, page-view, listen-link, rating-submitted, and helpful-vote
events are reused. New client event contracts are `Show Card Impression`,
`Show Saved`, and `Library State Changed`; successful rating edits now record
the server event `Rating Changed` in addition to the existing
`Rating Submitted`. Published Listener Reviews are read from their canonical
moderated table instead of emitting a second analytics event, so publication
and unpublication remain reflected accurately. Only `listening` and
`finished` Library states are sent. Saved state is represented by the explicit
save event. Private notes, hidden/dropped/removal state, rating values, review
text, and listening history are not sent.

Impression events are batched after a 250 ms debounce, at most 50 per browser
request; the same-origin endpoint accepts at most 100. Events are validated
against controlled fields and IDs. Search text and query-bearing paths are
excluded. Anonymous visitor IDs live in first-party local storage and session
IDs in session storage (30-minute idle / 24-hour maximum session); the server
stores keyed HMAC pseudonyms, not those browser tokens. Popularity aggregates
contain only show/day/signal/count, not visitor identifiers. This is
first-party product measurement, not cross-site or advertising tracking.

### Raw analytics and ranking-effective evidence

`analytics_events` and `popularity_event_raw_daily` preserve accepted raw
behavior. Raw rows are idempotent by event ID; Page Viewed also retains its
existing per-session/path 30-second duplicate suppression. A separate
`popularity_event_daily` rollup contains only ranking-effective contributions.
The server applies these rolling cooldowns using a keyed HMAC of the existing
visitor pseudonym (session pseudonym when no visitor token is available), show,
and signal group:

| Signal | Ranking-effective limit |
| --- | --- |
| Show page views | 1 per visitor/show per 24 hours |
| Card impressions | 1 per visitor/show/discovery context per 24 hours |
| Show opens | 1 per visitor/show/discovery context per 24 hours |
| Listen-link opens | 1 per visitor/show per 24 hours |
| Saves and Listening/Finished state changes | 1 combined Library-intent action per visitor/show per 30 days |
| Rating submitted/changed activity | 1 combined rating-activity event per visitor/show per 30 days |
| Helpful-vote activity | 1 per visitor/show per 30 days |
| Published Listener Reviews | Current moderated review rows only; one row per submission, with existing saturated review weights |

The cooldown is measured from the last ranking-effective contribution, so an
action after the full gap can contribute again. Local Library removals are not
sent as analytics events; later saves are still covered by the shared
Library-intent cooldown. `Rating Removed` and `Helpful Vote Removed` server
events remain raw diagnostic events and do not add ranking weight. Archive
Picks impressions and opens remain raw-only. Repeated accepted actions
therefore remain visible in raw diagnostics while their ranking contribution
is capped. If neither visitor nor session token is valid,
the server uses a shared anonymous cap key for that show and signal group,
favoring abuse resistance over counting unidentifiable repeat traffic. The
contribution-limit table stores only truncated HMAC keys and timestamps; it is
pruned after the maximum 30-day cooldown. No new fingerprint or raw identity
is stored.

Active quick ratings, published reviews, and current helpful-vote totals are
read from canonical community tables. Active quick ratings have a unique
profile/show row, so repeated rating edits do not multiply their current
community count; the 30-day activity cap also limits rating-event volume.
Published reviews are counted from current moderated rows, one per submission,
so unpublishing removes their current contribution. A review submission does
not carry a stable visitor identity in that canonical table, so published
reviews rely on moderation and the existing saturated review weights rather
than the visitor cooldown ledger. Helpful-vote events use the cooldown ledger,
and current helpful votes count distinct profile IDs per show across published
reviews, so one profile cannot gain extra current helpful-vote points by
voting on several reviews for the same show.

The versioned rollup migration rebuilds ranking-effective counts from retained
raw events. Older aggregate days outside the retained raw-event range are kept
under `legacy:` signal names because their pseudonymous contributors are no
longer available for re-normalization. Legacy opens remain volume evidence;
legacy impressions do not enter exposure-rate calculations. This cutoff is
necessary to preserve lifetime counts without pretending that historical
aggregates can be deduplicated after their identity keys have expired.

### Discovery surface semantics

Surface and Browse-state context are retained in raw and ranking-effective
signals. Only default-state cards on `home_archive_grid` (`browse`) contribute
to the position-adjusted impression/open rate. Search, filtered Browse,
search-plus-filtered Browse, collection grids, unknown surfaces, and other
non-editorial opens remain in separate surface buckets and contribute through
the capped general open-volume term. Their impressions are not used as Browse
CTR denominators. `home_popular_rail` Archive Picks events are raw-only, so the
editorial rail cannot reinforce its own order. This keeps exposure rates
coherent while retaining broader explicit-demand evidence.

## Storage, refresh, and browse behavior

Accepted events update the raw analytics row, raw aggregate, and (when allowed
by the cooldown) ranking-effective aggregate in the same SQLite transaction.
The aggregates are not removed by the existing 400-day raw-event retention
job; they preserve lifetime counts without retaining person-level data.
Published review activity and current community totals are read from their
canonical SQLite tables.

The server lazily computes the full catalogue score map on first use and
caches it in process memory for 15 minutes. New analytics aggregates are
visible on the next refresh. The public score response is CDN/browser-cacheable
for 60 seconds with a 60-second stale window. Scores are computed once per
cache interval, not per Browse render or per show. There is no scheduled job
or static score written into the catalogue.

Popular sorts the complete filtered show set before pagination. Search keeps
its relevance order unless a visitor explicitly selects a catalogue sort.
Collections retain authored order unless the visitor selects an explicit
sort. The selected sort continues to use URL state; implicit Popular and
search relevance are omitted from the URL, while explicit sorts are retained.
The available explicit modes are Popular, Recently added, Recently updated,
Highest Archive rating, Most listener ratings, A–Z, and Archive order.

## Diagnostics and tuning

The session-protected maintainer endpoint explains each show's final rank and
composite score, behavioral/lifetime/90-day/28-day points, community and
cold-start contributions, Archive Rating and freshness points, and
position-adjusted open evidence. Per-window details include raw and
ranking-effective event totals, reductions, impression/open evidence by
position, surface breakdowns, page views, listen-link actions, Library intent,
engagement volume, and rating/review activity. It also includes each show's
rank and movement when ranked by an individual time window.

The aggregate `rankingHealth` section reports raw/effective counts and
reductions, Browse impressions and opens by position bucket with open rates,
raw/effective listen and Library-intent rates, zero-meaningful-behavior share,
score distribution, shows primarily supported by cold-start priors, and mean
and maximum rank movement by time window. These values support later
production-based calibration; they are not public API or user-facing metrics.

After production traffic accumulates, compare:

1. Opens per impression by position bucket against the current position
   baselines, including confidence and surface mix.
2. Listen-link clicks, Library saves, Listening, and Finished states per show
   page view, with denominators large enough to reduce noise.
3. Repeat/unique show interest by session/day and discovery surface, checking
   for event loss, bot traffic, or duplicate sources.
4. Rank stability and score distributions across lifetime, 90-day, and 28-day
   components; check whether active shows rise without erasing established
   audience interest.
5. New-show time-to-exposure and time-to-first meaningful action, and whether
   freshness/Archive Rating/collection priors are disproportionately keeping
   shows high after behavior arrives.
6. Whether later listening clicks, saves, and active Library states are
   predicted by earlier open, exposure, rating, and review signals. Do this
   with aggregate cohorts and adequate sample sizes, not individual profiles.

The current weights are initial product choices, not calibrated production
coefficients. Existing local/dev analytics are sparse and must not be used to
disable Popular or to claim that these weights are production-optimal. The
model should be revised only with enough first-party data to estimate signal
rates and uncertainty, and the scoring version should change when the formula
changes.
