# Echo Archives 2.0 performance budget

## Purpose and method

These are release-review limits, not millisecond CI assertions. They are set
before the integrated 10× run and use the closest recorded local ceilings in
[`2026-09-29-catalogue-scale.md`](../qa/2026-09-29-catalogue-scale.md) and
[`2026-09-29-personal-discovery.md`](../qa/2026-09-29-personal-discovery.md).
The prior catalogue run used a 25,000-show synthetic fixture; this candidate
run uses 7,520 shows, ten times the current 752-show catalogue. Both reports
must name the actual host, runtime, browser, viewport, warmup, and sample counts.
Single-host timings are evidence for review, not portable performance claims.

## Review limits

| Operation | 2.0 review limit | Prior evidence used |
| --- | ---: | --- |
| Discovery engine construction | 2,093 ms | 25,000-show construction, 2,093 ms |
| Exact synthetic title search | 160 ms p95 | Same exact title at 25,000 shows, 160 ms p95 sample |
| `sci-fi` search | 97 ms p95 | 25,000-show `sci-fi`, 97 ms p95 |
| `finished sci-fi` structured search | 27 ms p95 | 25,000-show `finished sci-fi`, 27 ms p95 |
| Broad full-catalogue text search | 814 ms p95 | 25,000-show broad synthetic creator query, 814 ms p95; same broad-result class |
| Browser search/runtime JSON parse plus search-index hydration | 1,353 ms | 25,000-show search parse 54 ms plus hydration 1,299 ms |
| Render 24 cards at 390 × 844 | 41 ms | 25,000-show Chromium card render, 41 ms |
| Personal Discovery warm overhead at 20, 100, and 500 entries | Enabled p95 at most 1.5× the paired disabled p95 | One 752-show run measured 6.624 ms enabled p95 at 20 entries and 6.322 ms disabled p95 |
| First Personal Discovery call | 2,093 ms | Bounded by the historical 25,000-show engine-construction time; one-time cost is reported separately |
| Similarity work for personalization | At most `eligible weighted anchors × 50` compared pairs | The implementation caps returned public matches at 50; this is a structural work bound, not a latency proxy |

The same-query limits are the closest direct comparisons. The broad text limit
uses a prior query with the same all-catalog result shape, and the Personal
Discovery ratio avoids inventing a new absolute target for 100- and 500-entry
libraries. Runtime and entity lookup have no prior timing budget; report them
and review their result paths without treating a newly observed number as a
retroactive gate.

Exceeding a review limit calls for a repeat under the recorded environment and
an identified cause. It does not automatically justify a semantic change or a
product redesign. The benchmark checks correctness invariants but does not fail
CI on wall-clock thresholds, because host scheduling and garbage collection
vary. The candidate QA report records each comparison and any remaining review.
