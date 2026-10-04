# Catalogue ordering and ranking audit — 2026-10-03

## Scope and snapshot

This audit follows the authored catalogue, generated runtime records, homepage
sort path, ratings stores, analytics store, and adjacent collection and
recommendation ranking code. Catalogue counts come from the current
`data/shows.json` snapshot. Operational counts come from the checkout's
`backend/data/community.sqlite`, opened read-only; they are not a claim about
production usage.

The snapshot contains 752 published shows: 517 imported, 228 indexed-only, and
7 full-review. All 752 have `createdAt` and `updatedAt`; 27 have an Archive
Rating. No show has a numeric `popularity.score`.

## Existing signals

| Signal | Storage and calculation | Coverage and limits |
| --- | --- | --- |
| Static popularity | Optional authored `popularity.score` on show records; catalog build copies it into `data/shows.json`. No job computes it, and the field has no observation window or provenance contract. | 0/752 populated. Imported records are explicitly forbidden from carrying it. |
| Archive Rating | Authored `ratings.archive`, normalized to `finalRating`, is Echo's editorial 0–10 score. | 27/752. One editorial assessment per scored show; it is not listener popularity or a vote count. |
| Community quick ratings | `rating_submissions` in SQLite stores one active 1–10 rating per profile and show. The summary service calculates count and average at read time; it withholds the public average until `COMMUNITY_MIN_PUBLIC_RATINGS` (default 3). | The local database is in sync with all 752 catalogue IDs and has 1 active rating on 1 show. Its average is therefore withheld. The count is real but too sparse for a default catalogue ranking. |
| Written Listener Review Score | Published rows in `published_listener_reviews`; the service converts each published 1–5 star score to 0–10 and calculates per-show count and average. Helpful votes rank reviews within a show by vote count, then publication time. | 0 published reviews and 0 helpful votes in the local database. This score is separate from Archive and quick Community ratings and is not a catalogue rank input. |
| First-party analytics | `analytics_events` in SQLite stores page views and controlled interactions such as `Show Opened` and `Listen Link Opened`; events use bounded IDs and anonymous visitor/session keys. The maintainer analytics dashboard calculates top shows from page views and interactions. Retention defaults to 400 days. | The local database has 108 events: 79 page views and 29 searches. Seventeen are show-page views across 3 shows; there are no show-open or listen-link events, and the inspected events have no visitor keys. They span 2026-09-19 through 2026-09-29. This small local sample is not production coverage. The event contract records opened cards and their position bucket, but does not record per-card impressions, so clicks cannot be corrected for exposure. |

The existing homepage **Archive picks** rail is separate from the catalogue
grid. At runtime it requests community summaries for only the first 100
published shows, sorts qualifying summaries by raw rating count, then visible
average and title, falls back to static popularity scores, and finally uses the
four fixed IDs in `HOME_MOST_POPULAR_IDS`. Static prerender uses those same four
IDs. The community average threshold prevents a single rating from supplying a
public average, but the rail is not a complete-catalogue popularity rank and
its raw-count ordering can still favor established shows.

Other nearby rankings use different meanings:

- The collections directory offers editorial, newest, title, show-count,
  Archive-rating aggregate, and popularity-score aggregate sorts. The last two
  use `finalRating` and `popularity.score`, not listener-rating counts; the
  popularity aggregate currently has no populated inputs.
- Text search orders by match tier and query score, with Archive Rating as a
  tie-breaker. Unconstrained archive recommendations prefer review-confidence
  tier, then Archive Rating and featured state. Similar-show recommendations
  use structured metadata and authored relationships. These are editorial or
  relevance signals, not global interest measurements.
- The homepage's prior catalogue modes were insertion/catalogue order and
  recently updated. The recently added homepage rail uses catalog publication
  metadata rather than show release dates.

## How the default grid is ordered

`catalog-src/shows/_order.json` feeds the catalogue build and generated
`data/shows.json`/search index. The home page loads that index. With no query,
filters preserve the incoming order; `sortVisibleShows()` returned a copy
without reordering for the default mode. The first 60 matching shows were then
rendered, with later results loaded from the same ordered list. A selected
collection preserved its authored `showIds` order. Search queries used the
search/recommendation result order instead. The default sort was omitted from
the URL; the only explicit homepage sort was `recently-updated`.

## Audit recommendation at time

Given the local snapshot, the audit recommended retaining catalogue order
until production coverage supported a defensible popularity rank. That
recommendation correctly described the local evidence and its limits, but the
local SQLite database is a development environment and its sparse state is not
a product requirement. The owner has directed that Echo build the measurement
and ranking infrastructure now rather than wait for local or production
traffic to accumulate.

## Implementation update — 2026-10-03

**Popular** is now the default global catalogue ordering. Its centralized,
exposure-aware model uses first-party show-card impressions and opens,
show-page views, external listening clicks, explicit Library intent, rating
and review participation, and a bounded cold-start prior. Full formula,
weights, windows, privacy behavior, refresh cadence, and production tuning
questions are documented in [POPULARITY.md](../POPULARITY.md).

The deterministic cold-start prior keeps zero-event catalogues usable without
fabricating production analytics. Sparse development data is therefore a
testable operating state, not a gate on enabling Popular. The score is
generated from SQLite event summaries and canonical rating/review tables; it
is cached in memory for 15 minutes and served to Browse as a score-only map.

The homepage sort control offers **Popular**, **Recently added**,
**Recently updated**, **Highest Archive rating**, **Most listener ratings**,
**A–Z**, and **Archive order**. Sorting applies to the full filtered set before
pagination. Search retains relevance by default, selected collections retain
authored membership order by default, explicit sorts continue to be represented
in URL state, and implicit Popular is omitted from the URL.
