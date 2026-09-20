# Recommendation coverage audit — 2026-09-20

This is a read-only catalogue audit. It uses the authoritative `catalog-src` records, resolved typed entities, source collections, and runtime-generated Shows Like routes. It does not write catalogue data, generate recommendations, deploy, commit, or push.

Command:

```sh
npm run report:recommendation-coverage -- --limit=8
```

## Coverage definition

The previous metadata-quality report was a seven-point proxy. It awarded points for outgoing `similarTo` links, any collection membership, `bestFor`, at least two of `tags`/`themes`/`tones`, and explained links. Its current result is:

| Level | Shows |
| --- | ---: |
| None | 381 |
| Thin | 136 |
| Covered | 235 |

The surface-aware report follows the actual recommendation surfaces:

- Authored coverage includes outgoing and incoming `similarTo` relationships and authored similarity-collection routes. It remains separate from computed evidence.
- Computed coverage uses the public `getPublicSimilarityMatches` adapter used by Try Next, including its score, record-coverage, factual-anchor, specific-dimension, and distinctiveness gates.
- A collection membership can remain a thin discovery route without being treated as a pairwise similarity match.
- Dedicated Shows Like routes are reported separately. The existing generated-route requirements remain unchanged: a rich anchor, at least four explained authored links, and the current route hygiene checks.

## Before / after

The current surface-aware result is:

| Level | Previous proxy | Surface-aware |
| --- | ---: | ---: |
| None | 381 | 380 |
| Thin | 136 | 136 |
| Covered | 235 | 236 |

The one-show change is not a newly fabricated recommendation. The old proxy only counted outgoing links; the live authored surface also honors incoming links, and one imported record is reachable through that valid incoming authored route.

Current surface counts:

- 752 published shows: 235 enrichment-eligible and 517 imported.
- 236 shows have authored coverage.
- 160 shows have at least one computed Try Next match; none are computed-only, because the current catalogue’s computed matches overlap authored-covered shows.
- 24 dedicated similarity routes are available at runtime, including 7 generated routes.
- 746 shows have a broad diagnostic candidate; 6 have none even at that diagnostic floor.

## Remaining blockers

There are 516 uncovered or thin records. The root-cause split is:

| Cause | Records | None | Thin | Interpretation |
| --- | ---: | ---: | ---: | --- |
| Imported record requires reviewed enrichment | 510 | 376 | 134 | Broad factual candidates may exist, but imported records intentionally lack reviewed public-specific discovery evidence. |
| Catalogue isolation or unusually niche metadata | 6 | 4 | 2 | No non-authored candidate meets even the broad diagnostic gate; two still have a thin collection route. |
| Insufficient specific metadata | 0 | 0 | 0 | No enrichment-eligible record is currently uncovered for this reason. |
| Similarity candidates rejected by public gates | 0 | 0 | 0 | No enrichment-eligible record is currently uncovered after the existing authored coverage is considered. |
| Schema or recommendation reference issue | 0 | 0 | 0 | No malformed recommendation or collection reference was found in the current published source. |

The six isolated records are:

`13-minutes-or-less`, `15-second-mysteries`, `anoraks`, `captain-kayato-and-the-catsairs`, `left-alone-once-more`, and `the-sherwood-society`.

The imported records with diagnostic candidates are not automatically promotable. A representative imported pair can share genre, format, release state, episode length, and catalogue length while still having zero specific discovery dimensions. That is useful audit evidence, not a safe listener-facing recommendation.

## Highest-leverage enrichment

The bottleneck is not broad genre, format, or runtime coverage; those factual fields are already present on nearly all imported records. The public gate needs a reviewed bundle of specific evidence and enough record coverage:

1. Typed creator / studio / production-company relationships. This is the largest weighted public-specific field and is missing from 381 of the 516 remaining gap records.
2. Reviewed `themes` and `tones`. They are absent from all 516 remaining gap records and provide the strongest discovery-specific overlap after entities.
3. Reviewed `bestFor`, `narrativeFocus`, `tags`, and `voiceStyle`. These are also absent from all remaining gap records and can supply the second specific dimension when they are genuinely source-backed.
4. `commitment`, `intensity`, and normalized release/lifecycle facts are supporting evidence. They improve comparable record coverage but cannot substitute for two specific discovery dimensions.

Enrichment should be promoted from objective sources and maintainer review; raw importer keywords must not be copied into public tags or used as opaque recommendation evidence. A single new field will generally not clear the public gate by itself.

## Changes made

- Added `getRecommendationCoverage` to the shared similarity index so audit tooling can read the same authored/computed separation as the product.
- Added `report:recommendation-coverage`, with record-level causes, before/after bands, diagnostic candidate counts, runtime route counts, and metadata leverage.
- Added tests for incoming authored coverage, computed-only fixture coverage, collection-only thin coverage, imported-policy gaps, catalogue isolation, malformed references, and report formatting.
- Kept all public similarity thresholds and the dedicated Shows Like generation requirements unchanged.
