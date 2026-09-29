# Discovery 2.0 golden-query benchmark

This is the reviewed measurement foundation for Discovery 2.0. It preserves the existing 1.x observation and evaluates a separate deterministic 2.0 orchestration result over the same catalogue. Homepage routing now integrates the engine; this benchmark continues to evaluate the frozen engine inputs and does not rewrite the v1 observations.

## Baseline provenance

The immutable `baseline-v1` was captured from repository commit `55ca3969c850cabbc3c0159aae4e3c77da7e0410` on 2026-09-28. Its catalogue revision is `sha256:fe17934a5cc714b8057699a6223c30ffc13cb1b218020eecefe2e8c8f72a10b5`. The fingerprint covers every authored file under `catalog-src/**` and the runtime `data/shows.json`, `data/search-index.json`, and `data/collections.json` files. The fixture also records their Git tree/blob IDs and counts: 752 shows, 54 runtime collections, and 132 entities.

Each observed case stores the result count, at most five IDs, concise v1 query-shape data, and top-result evidence. It deliberately omits a complete ordered result snapshot. Re-running the benchmark compares today's observation with this captured baseline and reports catalogue drift or changed observations. It never silently refreshes the baseline.

The baseline was gathered before `target-contract.v2.json` was authored. Keep the observation file and target contract separate: an implementation change must not rewrite what v1 did.

## Corpus format and coverage

`golden-queries.v1.json` is schema version 1, corpus version 1.2.0. Each case has a stable `id`, `family`, `surface`, `catalogueRevision`, exact query text, human rationale, and `baselineV1` observation. `target-contract.v2.json` is separately versioned (`2.0-contract-draft.1`) and refers to cases by ID. Its assertions declare `support` as `current-v1` or `discovery-v2`.

| Family | Cases |
| --- | ---: |
| Identity | 14 |
| Identity / taxonomy collisions | 4 |
| Typo | 3 |
| Entity and creator | 7 |
| Collections | 5 |
| Structured facets | 5 |
| Listening context | 3 |
| Runtime and commitment | 6 |
| Similarity seed and modifiers | 3 |
| Exclusion | 1 |
| Privacy scope | 2 |
| Sparse evidence and no-match | 4 |
| **Total** | **57** |

Collection-directory queries use the `collections-search` surface, matching the current `/collections` search system. They are not judged as homepage show-ranking queries. Entity expectations reference explicit entity IDs and relationship roles. Runtime examples distinguish `observed-exact`, `observed-reported`, `derived-estimate`, and `unknown` rather than converting missing evidence into a fact.

## Current v1.x reading

At the captured catalogue revision, 57/57 baseline observations are unchanged. Current measurable v1 checks show:

- Exact identity@1: 14/14; acceptable recall@K: 12/12; bounded typo examples retrieve their intended show.
- Existing query-shape recognition: 19/19; collection routes: 5/5; typed-entity evidence: 5/5; explanation-evidence checks: 9/9.
- The current-v1 target checks expose two related failures for `something like The White Vault but sci-fi`: `the-harrowing` appears in the top five despite lacking sci-fi genre evidence. This is one hard-constraint violation and one prohibited-result failure.
- Natural-language “people behind” / “who created” requests do not currently resolve to the explicitly linked people. Comparative modifiers, phrase-level exclusion, aggregate runtime intent, and local listening history are not typed 2.0 capabilities in v1.
- `horror` is currently interpreted as a genre-shaped query, while a full title containing “Horror” still resolves correctly. The v2 contract keeps that short collision explicitly ambiguous.

These are retained measurements, not requests to tune v1. The frozen observations were not regenerated when Discovery 2.0 fixed the White Vault modifier failure.

## Implemented Discovery 2.0 contract

`shared/discovery/` implements a deterministic typed parser and retrieval orchestrator. Its separate result is evaluated alongside the frozen v1 search observation. The supported contract is:

1. Exact title and alias identity wins before taxonomy, including punctuation, apostrophes, case, no-article forms, partial titles, and the full Horror-title collision. Typos remain bounded by reviewed spelling evidence from the existing search engine.
2. Supported genre, format, completion, best-for, commitment, explicit known `tag:`/`theme:` tokens, runtime, and exclusion criteria are typed and evidence-checked. Missing values do not satisfy hard criteria.
3. Similarity seed resolution is separate from modifiers. Existing authored and computed adapters retain their eligibility gates and provenance; hard modifiers filter both. For `something like The White Vault but sci-fi`, `the-harrowing` is absent from the v2 eligible set.
4. Entity paths use explicit public entities and typed `entityLinks`; a people request returns linked creator-role people and never silently substitutes a studio, company, or network.
5. Exact collection routes and intent-tag routes use separate collection results. Collection membership is not pairwise similarity evidence.
6. Runtime values carry `observed-exact`, `observed-reported`, `derived-estimate`, or `unknown` with scope/basis. Around-duration is a soft preference; an explicit numeric range is hard and preserves strict/inclusive boundaries.
7. `darker`, `less chaotic`, `more cinematic`, unsupported compounds, short taxonomy collisions, and season/time ambiguity remain visible as unresolved or ambiguous state. The engine does not claim unsupported comparisons.
8. “Finished shows” is catalogue lifecycle; “shows I've finished” is local-only and produces no public query parameter. Discovery retrieval stays storage-pure; the homepage applies a separate page-level personalizer after retrieval and direct filters, using only the sanitized local context supplied by the Library runtime.
9. `shared/discovery/url-state.js` provides pure, stable, allowlisted public URL parsing/serialization. Homepage rich queries use it through the existing URL/history controller; simple text, exact title, and bounded typo queries retain the original scorer path.
10. Results include separate candidate sections, evidence, reason strings, applied constraints/preferences/exclusions, unresolved phrases, ambiguities, limitations, and trace flags; internal similarity scores are not exposed as user truth.

The JSON target contract is the case-level source of truth for IDs, acceptable sets, top-N windows, prohibited IDs, required constraints, unresolved phrases, ambiguity alternatives, route/seed/entity IDs, and evidence expectations. It classifies the 82 formerly unsupported assertions as 64 now-supported, 15 intentionally unresolved/ambiguous, and 3 deferred because Case 63 lacks source-backed aggregate-runtime evidence. Two additional Discovery checks cover the frozen v1 hard-constraint regressions. All 84 Discovery assertions execute.

## Homepage integration

The homepage routes recognized multi-part, runtime, entity, collection, and similarity intent through one lazily constructed Discovery engine. Exact titles, ordinary text, and bounded typos continue through `archive-search`. The page keeps its existing compact cards, direct filters, creator links, and collection paths. The existing result summary carries a short criteria/evidence note; there is no query-builder surface. Similarity remains ordered as authored archive picks followed by computed matches, and unresolved or ambiguous language remains visible. Hard constraints and private-context requests stay strict.

Public rich intent is serialized with allowlisted URL parameters through the homepage’s existing history controller, which preserves legacy `q`/filter URLs and Back/Forward rendering. Local-only listening intent produces a privacy note and omits its query text from the URL. The public query adapter does not read the Listener Library service; a separate homepage integration receives the sanitized context and personalizes only eligible show and computed-similarity candidates. Search analytics continue to omit query text and Library state.

Runtime data is supplied through generated `data/runtime-evidence.json`, a compact projection of public show length fields and runtime-gap flags. Its current 752-row JSON payload is 105,978 bytes (12,242 bytes gzipped). It is fetched non-blockingly alongside the existing homepage search data, then joined to the search index in the adapter when available. `data/search-index.json` remains unchanged and stays inside the frozen benchmark fingerprint.

The required Chromium integration case covers old-path title search, typed hard constraints, exclusions, authored/computed similarity order, creator entity links, qualified runtime results, collection routing, unresolved/ambiguous wording, strict empty states, local-only URL omission, Back/Forward with scroll restoration, and mobile card density/overflow. See the [2026-09-29 homepage integration QA report](../qa/2026-09-29-discovery-homepage-integration.md) for screenshots, detailed visual metrics, and validation results; the default homepage retained its pre-integration hero, card count/width, and page height on desktop and mobile.

## Metrics and commands

Metrics remain separate: exact identity@1, acceptable recall@K, prohibited results@K, hard-constraint violations@K, v1 query-shape recognition, route and typed-entity recognition, intent/seed/entity resolution, unresolved phrase and ambiguity handling, explanation evidence, and sparse/no-match honesty. There is no composite score that can hide an identity or hard-constraint failure.

## Performance sample

Paired measurements on 2026-09-28 used Node v24.14.1, the hydrated 752-record search index, two warm-ups, then 20 interleaved calls per query. The v1 control is `archiveSearch.scoreCatalog`; Discovery is the full `engine.retrieve` call on the same text. Results were gathered while other work was active in the shared worktree, so compare medians rather than treating the tail as a release guarantee.

| Query | Existing v1 scorer median | Discovery 2.0 median |
| --- | ---: | ---: |
| `Midnight Burger` | 28.29 ms | 29.13 ms |
| `finished sci-fi` | 38.24 ms | 41.55 ms |
| `something like The White Vault but sci-fi` | 47.46 ms | 1.25 ms |
| `people behind The White Vault` | 46.90 ms | 0.23 ms |
| `QCODE` | 20.07 ms | 0.64 ms |
| `around 10.9 hours` | 37.94 ms | 8.32 ms |

The simple-title and facet paths stayed close to the same-run v1 scorer. The parsed seed/entity routes and runtime preference avoided scoring every show as free text. Direct uncached parser medians ranged from 0.0082 ms for exact identity to 0.2238 ms for a multi-criterion query; observed parser P95 ranged from 0.219 ms to 1.77 ms. One engine construction took 513.86 ms for the full catalogue; a separate lazy similarity-index build took 63.06 ms. Those costs happen once per catalogue revision/engine, not once per keystroke. Retrieval P95 varied from 0.57 ms on the typed-person path to 78.55 ms on the hard-filter query under concurrent load.

```sh
npm run benchmark:discovery
npm run benchmark:discovery -- --json
npm run benchmark:discovery -- --strict
npm run test:discovery-benchmark
```

The normal report is read-only, deterministic, and offline. `--strict` exits nonzero for a supported assertion failure; the Discovery 2.0 target currently passes. It reports frozen v1 constraint failures beside their v2 results rather than changing the v1 observations. Catalogue drift exits with status 2 and calls for explicit human review of affected fixtures and baseline evidence. `--capture-baseline` is an initial authoring operation only. For a new fixture with no baseline, run it before adding target assertions and point `--target` at a missing or empty target file, for example:

```sh
npm run benchmark:discovery -- --fixture docs/2.0/discovery-benchmark/new-corpus.v1.json --target /tmp/no-discovery-target.json --capture-baseline
```

The runner refuses to overwrite an existing baseline or capture after assertions exist in the separate target contract. If catalogue evidence changes, review and version the corpus deliberately; do not use capture to bless drift automatically.

The benchmark tests validate fixture shape and IDs, acceptable and prohibited top-N assertions, ambiguity/unresolved representations, evidence and hard constraints, fingerprint drift, malformed input, repeat-run determinism, and the frozen White Vault v1 defect alongside its fixed Discovery 2.0 result. Pure Discovery tests cover identity, facets, exclusions, similarity, entities, collections, runtime, URLs, privacy, and Personal Discovery parity without storage access.
