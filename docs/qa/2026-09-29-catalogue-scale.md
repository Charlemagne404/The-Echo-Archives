# Catalogue scale benchmark — 2026-09-29

## Scope and reproduction

This benchmark uses deterministic synthetic catalogues with 2,000, 5,000, 10,000, and 25,000 shows. Each fixture is built under the OS temporary directory and removed afterward. IDs, titles, descriptions, creator links, and collection membership are synthetic; `catalog-src/` is not read as a fixture source or modified by the benchmark.

Measured environment: macOS 15 on Apple M2, 8 logical CPUs, 8 GB RAM, Node.js v24.14.1, Chromium at 390 × 844 for the browser pass. Results below are one run from that host. CPU load and garbage collection affect timings, so treat these as capacity measurements rather than release budgets.

Run the ordinary scale benchmark:

```sh
npm run benchmark:catalog-scale -- --sizes=2000,5000,10000,25000 --coverage-full-max=2000 --coverage-samples=12 --page-samples=250
```

Include the mobile-sized Chromium check and machine-readable JSON:

```sh
npm run --silent benchmark:catalog-scale -- --sizes=2000,5000,10000,25000 --coverage-full-max=2000 --coverage-samples=12 --page-samples=250 --browser --json > /tmp/echo-catalog-scale.json
```

The 2,000-show fixture runs recommendation coverage for every show. Larger fixtures sample 12 show paths. Page generation renders every show at 2,000 and samples 250 pages at larger sizes; the reported full-page time is a linear projection from that sample, not a complete 25,000-page build. Browser work runs at the largest requested size. JSON mode sends progress to stderr and the report to stdout.

## Results

All times are milliseconds unless stated otherwise. Generated-data sizes use decimal MB.

| Shows | Catalogue load | Artifact generation | Search index | Similarity index | Recommendation coverage | Detail pages measured | Projected all detail pages |
| ---: | ---: | ---: | ---: | ---: | --- | --- | ---: |
| 2,000 | 260 | 62 | 14 | 35 | all 2,000: 3,706 | all 2,000: 3,642 | 3,642 |
| 5,000 | 601 | 166 | 47 | 83 | 12 paths: 53 | 250: 594 | 11,889 |
| 10,000 | 1,522 | 356 | 76 | 175 | 12 paths: 69 | 250: 835 | 33,394 |
| 25,000 | 3,763 | 952 | 208 | 451 | 12 paths: 237 | 250: 1,843 | 184,290 |

The 25,000-show page projection is about 3.1 minutes. An earlier 250-page sample projected about 3–6 minutes on the same host, showing meaningful run-to-run noise. The 2,000-show pre-index baseline did not finish its first full benchmark within two minutes, so it has no valid end-to-end before number. A separate 100-show detail-page comparison fell from about 514 ms before indexing to 169–196 ms afterward; that is a 62–67% reduction, but those two runs were not a controlled paired benchmark.

### Search and repeated operations

At 25,000 shows, the paired exact-title reference query (`Synthetic Signal 00000`) took 663 ms through the exhaustive candidate oracle and 52 ms through indexed candidate selection, a 12.7× reduction in that run. The unchanged scorer, sorting, evidence, and result order are checked against the exhaustive path in deterministic tests.

Five-run search averages at 25,000 shows were:

| Query | Results | Average | Sample p95 |
| --- | ---: | ---: | ---: |
| `Synthetic Signal 00000` | 588 | 65 | 160 |
| `sci-fi` | 2,500 | 89 | 97 |
| `synthetic creator` | 25,000 | 724 | 814 |
| `finished sci-fi` | 0 | 16 | 27 |

The broad query matches every synthetic show, so candidate pruning cannot avoid ranking that result set. It remains the clearest native search latency limit. Thirty repeated filter passes took 235 ms total; thirty cached home-search calls took 85 ms total. At 25,000 shows, Discovery engine startup took 2,093 ms, parse took 4 ms, and retrieval took 92 ms for 50 results.

The 25,000-show entity graph had 1,250 entities and 25,000 show edges; graph generation took 66 ms. Sitemap generation took 115 ms for 27,513 entries. Backend catalogue load took 3,763 ms; archive-context and site-help context setup took 42 ms and 39 ms. The sum of measured backend setup components was 7,419 ms.

### Output and memory

At 25,000 shows, measured serialized sizes were 88.30 MB for show data, 3.36 MB for collections, 0.41 MB for entities, 44.68 MB for the search index, 6.58 MB for the entity graph, and 3.19 MB for the sitemap. Those artifacts total about 146.5 MB, excluding static HTML. Average generated show HTML was 24,162 bytes, or roughly 604 MB for 25,000 pages before compression.

The Node benchmark process peaked at about 1.12 GB heap and 1.03 GB RSS. At 390 × 844, Chromium parsed the 25,000-show search JSON in 54 ms, hydrated the search catalogue in 1,299 ms, ran the sampled search in 111 ms, and rendered 24 cards in 41 ms. The browser-side heap measurement was 212 MB. The grid measured 374 px within a 390 px document and had no horizontal overflow.

## Scaling problems and changes

- **Repeated catalogue-wide work in similarity:** pair comparison previously visited every public show for each source. A deterministic similarity index now gathers candidates from the same scorer dimensions, collection routes, entity roles, release facts, numeric length ranges, and authored evidence. The scorer and recommendation gates still determine the final matches. At 25,000 shows the index built in 451 ms and the 12-anchor candidate sample averaged 19 candidates per anchor. Exhaustive-parity tests include numeric, entity, collection, and editorial evidence.
- **Repeated search scoring:** an identity-keyed token posting index narrows scoring candidates for supported queries while retaining exhaustive fallback paths. Tests compare complete ordered results for title, creator, structured facet, text, fuzzy, broad, and stop-word queries. Broad terms still require scoring and ordering most or all shows.
- **Repeated detail-page setup:** entity-to-show, entity-id, collection-membership, and show-record lookups are indexed or cached against stable catalogue snapshots. Entity relationship validation also uses an ID map instead of a per-link registry scan.
- **Coverage tooling:** full coverage ran in 3.7 seconds at 2,000 shows. At 25,000, the 12-show diagnostic sample took 237 ms; a full 25,000-show report was not run. Multiplying that sample by the catalogue size suggests roughly eight minutes if per-show cost remains constant, but that is only a rough projection. Keep full coverage as explicit offline tooling and use its bounded sampling mode for scale investigations.

The optimizations preserve recommendation/discovery thresholds and evidence gates. No public pages, navigation, accounts, or visible product surfaces were added.

## Limits and Echo 2.0 implications

At 25,000 shows, catalog loading and route generation remain in the seconds range, graph and sitemap generation remain sub-second, and the sampled detail-page build projects to a few minutes. The larger operational pressure is the 44.7 MB search index, about 1.3 seconds of browser hydration, and roughly 600 MB of uncompressed show-page HTML. Broad all-catalogue search takes about 0.8 seconds at the sample p95, and a complete coverage report is projected to take minutes.

These measurements do not justify replacing the catalogue with a database or changing the frontend architecture. For Echo 2.0, keep catalogue-revision-bound indexes and bounded offline report modes. Before raising the supported catalogue size further, measure production search transfer/hydration and complete static-build time, then consider lazy or partitioned search data and incremental page generation if those measured costs exceed the product's budgets. The 25,000-show full static build and full recommendation coverage remain unmeasured end-to-end.
