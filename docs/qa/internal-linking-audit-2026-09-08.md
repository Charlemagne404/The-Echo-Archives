# Internal linking audit — 2026-09-08

## Scope and method

This audit covers the published/generated archive surfaces and their source-backed relationships: 752 shows, 46 collections, the browse/search surfaces, generated page templates, the sitemap, and the server/client renderers. The final authored registry contains 101 public entities, 278 explicit show/entity relationship edges across 228 published shows, and the derived data and pages have been rebuilt from that source state. The generated output contains 101 creator pages; 62 meet the current two-show indexability gate and 48 organization cards appear in the listener-facing directory.

The audit treats a relationship as valid only when it is already present in the catalog: explicit `entityLinks`, collection `showIds`, similarity targets with a reason, or existing collection intent/filter values. Raw creator strings do not create creator URLs. Tags are filter values rather than standalone entity pages.

## Changes made

- Show hero tags now link to the existing archive tag filter (`/?tags=...#archive`), and “Best for” values link to the existing `/?bestFor=...#archive` filter. This improves discovery without inventing tag pages.
- Collection detail hero intent tags now link to the existing collection intent filter. Intent labels inside collection cards remain non-links so cards never contain nested anchors.
- Collection detail pages now expose a compact “Teams shared across this route” rail when an indexable, source-backed entity appears on at least two shows in that collection and on at least two published shows overall. This produced 25 links across 11 collection pages.
- Creator detail pages now expose conservative “Related creator connections” links only when another indexable entity shares at least two published shows. This produced 12 links across 8 creator pages.
- Existing show → creator facts, creator → show catalogues, show → collection routes, collection → show cards, similar-show cards, browse indexes, sitemap entries, and the intentional show-fact links for `directory:false` people were preserved.

## Current relationship inventory

| Surface | Current result |
| --- | ---: |
| Published shows | 752 |
| Shows in at least one collection | 243 |
| Shows without collection membership | 509 |
| Shows with explicit typed entity links | 228 |
| Shows without explicit typed entity links | 524 |
| Shows with a valid outgoing similarity route | 71 |
| Shows with a valid incoming similarity route | 52 |
| Collections | 46 |
| SEO-indexable collections | 40 |
| Generated public/indexable entity routes | 62 |
| Generated organization cards in the Creators directory | 48 |
| Generated indexable people intentionally kept out of the organization directory | 14 |
| Distinct tag filter values | 134 |
| Distinct Best for filter values | 11 |
| Distinct collection intent filter values | 14 |

The directory-hidden indexable people include `k-a-statz`, `travis-vengroff`, `eira-major`, `jamie-killen`, `tal-minear`, `mark-r-healy`, `harlan-guthrie`, `gabriel-urbina`, `jonathan-sims`, `joseph-fink`, `jeremy-ellett`, `christof-laputka`, `jake-kerr`, and `jeffrey-cranor`. They remain reachable from explicit creator facts on their shows and from their own entity routes; they are not organization-directory orphans.

### Source/generation reconciliation

The earlier 74-record/42-route figures were an intermediate worktree snapshot. The final source registry now resolves all 101 public entity records and all 278 typed relationship edges without unknown entity IDs, duplicate relationship triples, or malformed entity records. The normal catalog and page generators now produce 101 entity records, 752 show records, 752 search-index records, 101 creator pages, 62 sitemap creator routes, and 48 directory cards. The catalog-status metric `showsWithEntityLinks: 228` counts linked shows; the distinct relationship-edge count is 278.

All 46 collections are reachable from the Collections directory. The six non-indexable collection records remain reachable there but are not SEO-indexable because the existing quality gate requires a sufficiently long description, at least four shows, and a meaningful reason for every member show.

## Pages that remain difficult to reach

There are 378 weakly connected show pages in the final generated 752-show snapshot under this conservative definition:

```text
not linked from the initial static home-page show set
AND not a member of any collection
AND no valid outgoing similar-show card
AND no explicit typed creator/entity relationship
```

This is a contextual-discovery finding, not a broken-route finding. These shows remain reachable through browse search, filters, load-more results, and the sitemap, but they lack a relationship rail from another detail/index page. Representative IDs include `station-blue`, `the-cellar-letters`, `the-pasithea-powder`, `the-antique-shop`, `wrong-station`, `not-quite-dead`, `hi-nay`, `the-night-post`, `octobers-children`, `the-hyacinth-disaster`, `the-polybius-conspiracy`, `the-orphans`, `the-walk`, `the-phone-booth`, `the-cipher`, `the-big-loop`, `the-angel-of-vine`, `blood-ties`, `the-two-princes`, and `the-dead-letter-office-of-somewhere-ohio`. The current tail of the same set is `escape-pod`, `eleanor-amplified`, `afflicted`, `alba-salix-royal-physician`, `the-sojourn`, `red-for-revolution`, `twilight-histories`, and `rosannas-secret`.

They were not mechanically assigned to collections, creators, or similarity routes because the final catalog does not currently provide those relationships. The next useful remediation would be source-backed curation or metadata enrichment for selected shows, not a blanket link block.

Tag values do not have orphaned indexable pages because no standalone tag-page route exists. They now have useful filter-backed entry points from show pages. Likewise, the 62 indexable entity routes are all linked from their catalogues or explicit show facts; the 14 directory-hidden indexable people noted above remain intentionally less prominent in the organization directory.

## Validation

Passed:

- `npm run build:catalog`
- `npm run build:pages`
- `npm run validate:data`
- `npm --prefix backend run test:catalog-integrity`
- `npm --prefix backend run check:links`
- `npm run test:tools`
- `npm --prefix backend test`
- `npm --prefix backend run test:smoke`
- `npm run check:config`
- the source/derived consistency audit covering creator pages, search index, sitemap, structured metadata, and every source relationship
- `git diff --check`

`npm run check:structure` still exits non-zero because the existing `shared/styles/home/entity-detail.css` is already 624 lines against the repository’s 550-line hard limit; this integration pass leaves that unchanged file at its baseline size and places new relation styles in the existing responsive bundle. The command also reports pre-existing soft-limit warnings in several large files. No typecheck or lint script is defined in the root or backend package manifests.

No commit, push, deployment, or production modification was performed.
